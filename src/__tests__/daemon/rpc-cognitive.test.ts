/**
 * Integration tests for cognitive RPC methods (Phase 12).
 *
 * Tests verify that all 23 cognitive RPC methods are correctly wired
 * through the JSON-RPC handler to their underlying cognitive modules.
 *
 * Each test creates a fresh database, seeds required data, and validates
 * the RPC response structure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import { createRpcHandler } from '../../daemon/rpc.js';
import type { JsonRpcResponse, RpcDependencies } from '../../daemon/rpc.js';
import { eventBus } from '../../daemon/events.js';
import { getMemory } from '../../core/memory-crud.js';

let db: DatabaseConnection;
let tempDir: string;
let handle: (message: string) => Promise<JsonRpcResponse>;

function makeDeps(overrides: Partial<RpcDependencies> = {}): RpcDependencies {
  return {
    db,
    embeddingProvider: {
      modelId: 'test-model',
      dimensions: 384,
      embed: vi.fn().mockResolvedValue(new Float32Array(384)),
      embedBatch: vi.fn().mockResolvedValue([new Float32Array(384)]),
    },
    verifySignature: vi.fn().mockReturnValue({ valid: true, tampered: false }),
    scanSecrets: vi.fn().mockImplementation((text: string) => ({
      clean: text,
      redacted: false,
      matches: [],
    })),
    signMemory: vi.fn().mockReturnValue('test-signature'),
    scanAndRedact: vi.fn().mockImplementation((text: string) => ({
      clean: text,
      redacted: false,
      matches: [],
    })),
    checkDangerousPatterns: vi.fn().mockReturnValue([]),
    writeAuditLog: vi.fn(),
    generateId: vi.fn().mockImplementation(() => {
      return 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }),
    secretScanMode: 'redact',
    getMemory: (id: string) => getMemory(db, id),
    verifyMemory: vi.fn().mockReturnValue({ valid: true }),
    getUnresolvedConflictCount: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

function rpc(method: string, params?: Record<string, unknown>): string {
  return JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'noesis-cog-rpc-'));
  db = DatabaseConnection.create(join(tempDir, 'test.db'));
  handle = createRpcHandler(makeDeps());
  eventBus.clear();
});

afterEach(() => {
  try { db.close(); } catch { /* already closed */ }
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  eventBus.clear();
});

// ===========================================================================
// Helper: seed built-in data for tests that need it
// ===========================================================================

async function seedTestData(): Promise<void> {
  const sign = (_content: string) => 'test-sig';

  const { seedBuiltInRules } = await import('../../cognitive/rules/built-in-rules.js');
  seedBuiltInRules(db, sign);

  const { seedBuiltInExperts } = await import('../../cognitive/experts/built-in-experts.js');
  seedBuiltInExperts(db, sign);

  const { seedBuiltInCapsules } = await import('../../cognitive/capsules/built-in-capsules.js');
  seedBuiltInCapsules(db, sign);

  const { seedBuiltInSkills } = await import('../../cognitive/skills/built-in-skills.js');
  seedBuiltInSkills(db, sign);

  const { seedBuiltInContexts } = await import('../../cognitive/context/built-in-contexts.js');
  seedBuiltInContexts(db, sign);

  const { seedBuiltInCommands } = await import('../../cognitive/commands/built-in-commands.js');
  seedBuiltInCommands(db, sign);
}

// ===========================================================================
// Rule methods
// ===========================================================================

describe('rule methods', () => {
  beforeEach(async () => { await seedTestData(); });

  it('listRules returns seeded rules', async () => {
    const res = await handle(rpc('noesis.listRules'));
    expect(res.error).toBeUndefined();
    const result = res.result as { rules: unknown[] };
    expect(result.rules.length).toBeGreaterThan(0);
  });

  it('listRules filters by category', async () => {
    const res = await handle(rpc('noesis.listRules', { category: 'workflow' }));
    expect(res.error).toBeUndefined();
    const result = res.result as { rules: Array<{ category: string }> };
    for (const rule of result.rules) {
      expect(rule.category).toBe('workflow');
    }
  });

  it('listRules filters by enabled status', async () => {
    const res = await handle(rpc('noesis.listRules', { enabled: true }));
    expect(res.error).toBeUndefined();
    const result = res.result as { rules: Array<{ enabled: boolean }> };
    for (const rule of result.rules) {
      expect(rule.enabled).toBe(true);
    }
  });

  it('checkCompliance validates against rules', async () => {
    const res = await handle(rpc('noesis.checkCompliance', {
      task_context: 'implement new authentication module',
      has_readiness: true,
      has_research: true,
      has_plan: true,
      has_verification: true,
      is_substantial: true,
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { results: unknown[] };
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('checkCompliance requires task_context', async () => {
    const res = await handle(rpc('noesis.checkCompliance'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });
});

// ===========================================================================
// Expert methods
// ===========================================================================

describe('expert methods', () => {
  beforeEach(async () => { await seedTestData(); });

  it('listExperts returns seeded experts', async () => {
    const res = await handle(rpc('noesis.listExperts'));
    expect(res.error).toBeUndefined();
    const result = res.result as { experts: unknown[] };
    expect(result.experts.length).toBeGreaterThan(0);
  });

  it('listExperts filters by category', async () => {
    const res = await handle(rpc('noesis.listExperts', { category: 'architecture' }));
    expect(res.error).toBeUndefined();
    const result = res.result as { experts: Array<{ category: string }> };
    for (const expert of result.experts) {
      expect(expert.category).toBe('architecture');
    }
  });

  it('routeExpertCognitive routes task to matching expert', async () => {
    const res = await handle(rpc('noesis.routeExpertCognitive', {
      task: 'Design a database schema for user authentication',
      keywords: ['database', 'schema', 'authentication'],
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { matches: unknown[] };
    expect(result.matches).toBeDefined();
    expect(Array.isArray(result.matches)).toBe(true);
  });

  it('routeExpertCognitive requires task', async () => {
    const res = await handle(rpc('noesis.routeExpertCognitive'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });
});

// ===========================================================================
// Capsule methods
// ===========================================================================

describe('capsule methods', () => {
  beforeEach(async () => { await seedTestData(); });

  it('listCapsules returns seeded capsules', async () => {
    const res = await handle(rpc('noesis.listCapsules'));
    expect(res.error).toBeUndefined();
    const result = res.result as { capsules: unknown[] };
    expect(result.capsules.length).toBeGreaterThan(0);
  });

  it('matchCapsuleDeep requires goal', async () => {
    const res = await handle(rpc('noesis.matchCapsuleDeep'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('matchCapsuleDeep returns capsule or null', async () => {
    const res = await handle(rpc('noesis.matchCapsuleDeep', {
      goal: 'Build a REST API with proper error handling',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { capsule: unknown | null };
    expect('capsule' in result).toBe(true);
  });
});

// ===========================================================================
// Skill methods
// ===========================================================================

describe('skill methods', () => {
  beforeEach(async () => { await seedTestData(); });

  it('matchSkills requires task', async () => {
    const res = await handle(rpc('noesis.matchSkills'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('matchSkills returns matches', async () => {
    const res = await handle(rpc('noesis.matchSkills', {
      task: 'Write unit tests for authentication module',
      max: 3,
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { matches: unknown[] };
    expect(result.matches).toBeDefined();
    expect(Array.isArray(result.matches)).toBe(true);
  });
});

// ===========================================================================
// Context methods
// ===========================================================================

describe('context methods', () => {
  beforeEach(async () => { await seedTestData(); });

  it('getContexts returns contexts', async () => {
    const res = await handle(rpc('noesis.getContexts'));
    expect(res.error).toBeUndefined();
    const result = res.result as { contexts: unknown[] };
    expect(result.contexts).toBeDefined();
    expect(Array.isArray(result.contexts)).toBe(true);
  });

  it('getContexts filters by types', async () => {
    const res = await handle(rpc('noesis.getContexts', { types: ['state'] }));
    expect(res.error).toBeUndefined();
    const result = res.result as { contexts: Array<{ context_type: string }> };
    for (const ctx of result.contexts) {
      expect(ctx.context_type).toBe('state');
    }
  });

  it('updateContext creates/updates context', async () => {
    const res = await handle(rpc('noesis.updateContext', {
      type: 'state',
      content: 'Test context content',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { id: string; version: number };
    expect(result.id).toBeDefined();
    expect(result.version).toBeDefined();
  });

  it('updateContext requires type and content', async () => {
    const res = await handle(rpc('noesis.updateContext', { type: 'state' }));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });
});

// ===========================================================================
// Quality gate methods
// ===========================================================================

describe('quality gate methods', () => {
  it('checkReadinessEvidence requires task', async () => {
    const res = await handle(rpc('noesis.checkReadinessEvidence'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('checkReadinessEvidence returns score', async () => {
    const res = await handle(rpc('noesis.checkReadinessEvidence', {
      task: 'Implement user authentication',
      has_goal: true,
      has_deliverable: true,
      constraints_identified: 3,
      codebase_explored: true,
      architecture_understood: true,
      risks_identified: 2,
      has_verification_plan: true,
      validation_criteria: 4,
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { total: number; passed: boolean; gaps: unknown[] };
    expect(typeof result.total).toBe('number');
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.gaps)).toBe(true);
  });

  it('checkQualityGate creative requires type', async () => {
    const res = await handle(rpc('noesis.checkQualityGate'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('checkQualityGate creative returns result', async () => {
    const res = await handle(rpc('noesis.checkQualityGate', {
      type: 'creative',
      objective: 'Build a dashboard',
      audience: 'developers',
      visual_direction: 'minimal',
      references: ['Material Design'],
      banned_patterns: ['carousel'],
      success_criteria: ['responsive'],
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { passed: boolean; missing: string[] };
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.missing)).toBe(true);
  });

  it('checkQualityGate api returns result', async () => {
    const res = await handle(rpc('noesis.checkQualityGate', {
      type: 'api',
      contract_target: 'REST API',
      reference_examples: ['GET /users'],
      edge_cases: ['empty array'],
      verification_plan: 'integration tests',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { passed: boolean; missing: string[] };
    expect(typeof result.passed).toBe('boolean');
  });

  it('checkQualityGate rejects unknown type', async () => {
    const res = await handle(rpc('noesis.checkQualityGate', { type: 'unknown' }));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });
});

// ===========================================================================
// Prediction methods
// ===========================================================================

describe('prediction methods', () => {
  it('predictFailures requires task', async () => {
    const res = await handle(rpc('noesis.predictFailures'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('predictFailures returns predictions', async () => {
    const res = await handle(rpc('noesis.predictFailures', {
      task: 'Refactor database layer',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { predictions: unknown[]; guidance: string };
    expect(result.predictions).toBeDefined();
    expect(typeof result.guidance).toBe('string');
  });
});

// ===========================================================================
// Learning methods
// ===========================================================================

describe('learning methods', () => {
  beforeEach(async () => { await seedTestData(); });

  it('processLearning requires all fields', async () => {
    const res = await handle(rpc('noesis.processLearning', {
      trigger: 'user_correction',
    }));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('processLearning processes a learning event', async () => {
    const res = await handle(rpc('noesis.processLearning', {
      trigger: 'user_correction',
      description: 'Test learning event',
      root_cause: 'Missing validation',
      prevention_rule: 'Always validate inputs',
      failure_class: 'wrong_approach',
      phase: 'execute',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { classified: string; ruleAction: string };
    expect(result.classified).toBeDefined();
    expect(result.ruleAction).toBeDefined();
  });
});

// ===========================================================================
// GSD execution methods
// ===========================================================================

describe('GSD execution methods', () => {
  it('createGsdProject requires project_id and description', async () => {
    const res = await handle(rpc('noesis.createGsdProject'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('createGsdProject creates execution state', async () => {
    const res = await handle(rpc('noesis.createGsdProject', {
      project_id: 'test-project',
      description: 'Test project',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { id: string; project_id: string; status: string };
    expect(result.id).toBeDefined();
    expect(result.project_id).toBe('test-project');
    expect(result.status).toBe('pending');
  });

  it('getGsdState returns execution and progress', async () => {
    // Create first
    await handle(rpc('noesis.createGsdProject', {
      project_id: 'test-gsd',
      description: 'Test GSD',
    }));

    const res = await handle(rpc('noesis.getGsdState', { project_id: 'test-gsd' }));
    expect(res.error).toBeUndefined();
    const result = res.result as { execution: unknown; progress: unknown };
    expect(result.execution).toBeDefined();
    expect(result.progress).toBeDefined();
  });

  it('executeGsdPhase transitions state', async () => {
    await handle(rpc('noesis.createGsdProject', {
      project_id: 'test-phase',
      description: 'Test phase transition',
    }));

    const res = await handle(rpc('noesis.executeGsdPhase', {
      project_id: 'test-phase',
      phase: 'research',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { status: string };
    expect(result.status).toBe('researching');
  });

  it('executeGsdPhase rejects invalid phase', async () => {
    await handle(rpc('noesis.createGsdProject', {
      project_id: 'test-bad-phase',
      description: 'Test bad phase',
    }));

    const res = await handle(rpc('noesis.executeGsdPhase', {
      project_id: 'test-bad-phase',
      phase: 'nonexistent',
    }));
    expect(res.error).toBeDefined();
  });
});

// ===========================================================================
// Session & continuity methods
// ===========================================================================

describe('session & continuity methods', () => {
  it('startSessionCognitive requires project_id', async () => {
    const res = await handle(rpc('noesis.startSessionCognitive'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('startSessionCognitive creates session', async () => {
    const res = await handle(rpc('noesis.startSessionCognitive', {
      project_id: 'test-session',
      agent: 'test-agent',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { session: { current_phase: string }; agent: string };
    expect(result.session.current_phase).toBe('starting');
    expect(result.agent).toBe('test-agent');
  });

  it('createHandoff requires all fields', async () => {
    const res = await handle(rpc('noesis.createHandoff', { source_agent: 'a' }));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('createHandoff creates and returns handoff', async () => {
    const res = await handle(rpc('noesis.createHandoff', {
      source_agent: 'agent-1',
      target_agent: 'agent-2',
      reason: 'context_limit',
      state_summary: 'Working on auth module, 60% complete',
      priority: 'normal',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { id: string; source_agent: string; target_agent: string };
    expect(result.id).toBeDefined();
    expect(result.source_agent).toBe('agent-1');
    expect(result.target_agent).toBe('agent-2');
  });

  it('resumeHandoff retrieves handoff data', async () => {
    // Create a handoff first
    const createRes = await handle(rpc('noesis.createHandoff', {
      source_agent: 'agent-1',
      target_agent: 'agent-2',
      reason: 'context_limit',
      state_summary: 'Test state',
    }));
    const handoff = createRes.result as { id: string };

    const res = await handle(rpc('noesis.resumeHandoff', { handoff_id: handoff.id }));
    expect(res.error).toBeUndefined();
    const result = res.result as { handoff: { source_agent: string }; resumption: string };
    expect(result.handoff.source_agent).toBe('agent-1');
    expect(typeof result.resumption).toBe('string');
  });

  it('resumeHandoff rejects unknown ID', async () => {
    const res = await handle(rpc('noesis.resumeHandoff', { handoff_id: 'nonexistent' }));
    expect(res.error).toBeDefined();
  });

  it('checkDecisionFidelity requires action and project_id', async () => {
    const res = await handle(rpc('noesis.checkDecisionFidelity'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('checkDecisionFidelity returns fidelity result', async () => {
    const res = await handle(rpc('noesis.checkDecisionFidelity', {
      action: 'Add a new database table',
      project_id: 'test-project',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { compliant: boolean };
    expect(typeof result.compliant).toBe('boolean');
  });
});

// ===========================================================================
// Verification methods
// ===========================================================================

describe('verification methods', () => {
  it('detectVerification requires project_root', async () => {
    const res = await handle(rpc('noesis.detectVerification'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('detectVerification detects capabilities', async () => {
    const res = await handle(rpc('noesis.detectVerification', {
      project_root: tempDir,
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { capabilities: unknown; plan: unknown };
    expect(result.capabilities).toBeDefined();
    expect(result.plan).toBeDefined();
  });
});

// ===========================================================================
// Critic methods
// ===========================================================================

describe('critic methods', () => {
  it('critiqueResearch requires work', async () => {
    const res = await handle(rpc('noesis.critiqueResearch'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('critiqueResearch returns critique result', async () => {
    const res = await handle(rpc('noesis.critiqueResearch', {
      work: 'Research findings: The system uses a REST API with JWT auth. Database is PostgreSQL with 15 tables. Key finding: no rate limiting on auth endpoints.',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { overallAssessment: string; findings: unknown[] };
    expect(result.overallAssessment).toBeDefined();
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('critiquePlan requires work', async () => {
    const res = await handle(rpc('noesis.critiquePlan'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('critiquePlan returns critique result', async () => {
    const res = await handle(rpc('noesis.critiquePlan', {
      work: 'Plan: 1. Add rate limiting middleware 2. Configure limits per endpoint 3. Add monitoring 4. Test with load testing',
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as { overallAssessment: string; findings: unknown[] };
    expect(result.overallAssessment).toBeDefined();
    expect(Array.isArray(result.findings)).toBe(true);
  });
});

// ===========================================================================
// Orchestration methods
// ===========================================================================

describe('orchestration methods', () => {
  beforeEach(async () => { await seedTestData(); });

  it('orchestrate requires request', async () => {
    const res = await handle(rpc('noesis.orchestrate'));
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('orchestrate returns prompt assembly', async () => {
    const res = await handle(rpc('noesis.orchestrate', {
      request: 'Implement user authentication with JWT',
      token_budget: 4000,
    }));
    expect(res.error).toBeUndefined();
    const result = res.result as {
      rules: unknown[];
      skills: unknown[];
      contexts: unknown[];
      token_budget: number;
    };
    expect(result.rules).toBeDefined();
    expect(result.skills).toBeDefined();
    expect(result.contexts).toBeDefined();
    expect(result.token_budget).toBeDefined();
  });
});

// ===========================================================================
// Event emission
// ===========================================================================

describe('cognitive event emission', () => {
  beforeEach(async () => { await seedTestData(); });

  it('checkCompliance emits rule_matched events', async () => {
    const events: string[] = [];
    eventBus.subscribe('rule_matched', (e) => events.push(e.type));

    await handle(rpc('noesis.checkCompliance', {
      task_context: 'test task',
      is_substantial: true,
    }));

    expect(events.length).toBeGreaterThan(0);
  });

  it('startSessionCognitive emits session_started event', async () => {
    const events: string[] = [];
    eventBus.subscribe('session_started', (e) => events.push(e.type));

    await handle(rpc('noesis.startSessionCognitive', {
      project_id: 'event-test',
      agent: 'test',
    }));

    expect(events).toHaveLength(1);
  });

  it('createHandoff emits handoff_created event', async () => {
    const events: string[] = [];
    eventBus.subscribe('handoff_created', (e) => events.push(e.type));

    await handle(rpc('noesis.createHandoff', {
      source_agent: 'a',
      target_agent: 'b',
      reason: 'context_limit',
      state_summary: 'test',
    }));

    expect(events).toHaveLength(1);
  });

  it('updateContext emits context_updated event', async () => {
    const events: string[] = [];
    eventBus.subscribe('context_updated', (e) => events.push(e.type));

    await handle(rpc('noesis.updateContext', {
      type: 'state',
      content: 'test content',
    }));

    expect(events).toHaveLength(1);
  });

  it('checkReadinessEvidence emits quality_gate_checked event', async () => {
    const events: string[] = [];
    eventBus.subscribe('quality_gate_checked', (e) => events.push(e.type));

    await handle(rpc('noesis.checkReadinessEvidence', {
      task: 'test readiness',
      has_goal: true,
    }));

    expect(events).toHaveLength(1);
  });
});
