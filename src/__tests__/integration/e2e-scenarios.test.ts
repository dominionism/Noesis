/**
 * End-to-End Integration Tests
 *
 * 8 scenarios that exercise the full pipeline from memory write
 * through retrieval, adapter assembly, and sync.
 */

import { describe, it, expect } from 'vitest';

// Core
import { generateId } from '../../core/ulid.js';

// Security
import { scanAndRedact, scanForSecrets } from '../../security/secret-scanner.js';
import { checkDangerousPatterns } from '../../security/dangerous-patterns.js';
import { validatePath, sanitizeFilename, isWithinDirectory } from '../../security/path-validation.js';
import { hashContent } from '../../security/audit.js';

// Write pipeline
import { executeWritePipeline, type WritePipelineParams } from '../../memory/write-pipeline.js';

// Adapters
import { assembleContext, extractLearningsFromText, verifyContentHash, buildFileWrite } from '../../adapters/base-adapter.js';

// Intelligence
import {
  computeValue,
  allocateBudget,
  allocateItems,
  type ContextItem,
} from '../../intelligence/context-economist.js';
import { analyzeSession, type SessionActivity } from '../../intelligence/friction-detector.js';
import { routeOperation } from '../../intelligence/model-router.js';
import { createProfile, updateFromCorrection, updateFromTaskCompletion, getExpertise } from '../../intelligence/cognitive-profile.js';

// Workflow
import { createSession, pauseSession, resumeSession, completeSession } from '../../workflow/session-manager.js';

// Sync
import { createSyncPlan, executeSyncForTarget, aggregateResults, type SyncTarget } from '../../sync/sync-orchestrator.js';
import { transformToFormat, parseFromFormat } from '../../sync/format-bridges.js';
import { negotiate, negotiateAll } from '../../sync/capability-negotiator.js';
import { parseInboxContent, createInboxEntry, processInboxEntries } from '../../sync/inbox-ingester.js';

// Agent definitions
import { getAgentDefinitions, getRules, getActiveRules, bundleDefinitions } from '../../workflow/agent-definitions.js';

// Helpers for write pipeline
function makeWriteParams(overrides?: Partial<WritePipelineParams>): WritePipelineParams {
  const auditLog: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  return {
    db: {},
    input: {
      input: {
        type: 'lesson',
        title: 'Test memory',
        content: 'This is a test memory for integration testing.',
        scope: 'project',
      },
    },
    config: { secret_scan_mode: 'redact' },
    signMemory: (mem) => hashContent(JSON.stringify(mem)),
    scanAndRedact,
    checkDangerousPatterns,
    createMemory: (_db, input) => ({
      id: input.signature?.slice(0, 26) ?? generateId(),
      type: input.type ?? 'lesson',
      title: input.title ?? 'untitled',
      content: input.content ?? '',
      tags: '',
      project_id: null,
      scope: 'project',
      sensitivity: 'INTERNAL',
      confidence: 0.5,
      outcome: null,
      source: 'agent',
      signature: input.signature ?? '',
      status: 'active',
      access_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      expires_at: null,
      superseded_by: null,
      session_id: null,
      embedding: null,
      embedding_model: null,
    }),
    writeAuditLog: (entry) => { auditLog.push(entry as Record<string, unknown>); },
    emitEvent: (event) => { events.push(event as Record<string, unknown>); },
    generateId,
    ...overrides,
  };
}

function makeSyncTarget(overrides?: Partial<SyncTarget>): SyncTarget {
  return {
    adapterId: 'claude-code',
    displayName: 'Claude Code',
    detected: true,
    configPaths: ['/home/.claude/CLAUDE.md'],
    maxContextTokens: 50000,
    supportsManagedSections: true,
    canWriteBack: true,
    ...overrides,
  };
}

// ============================================================================
// Scenario 1: Memory Write → Secret Redaction → Signing → Audit
// ============================================================================

describe('E2E Scenario 1: Memory write pipeline with secret detection', () => {
  it('redacts secrets, signs, and audits a memory write', async () => {
    const auditEntries: Array<Record<string, unknown>> = [];

    const params = makeWriteParams({
      input: {
        input: {
          type: 'lesson',
          title: 'API Key Management',
          content: 'Use AKIA1234567890123456 for AWS access',
          scope: 'project',
        },
      },
      writeAuditLog: (entry) => { auditEntries.push(entry as Record<string, unknown>); },
    });

    const result = await executeWritePipeline(params);

    expect(result.success).toBe(true);
    expect(result.secretsRedacted).toBe(true);
    // Verify the memory content was redacted
    if (result.memory) {
      expect(result.memory.content).not.toContain('AKIA1234567890123456');
      expect(result.memory.content).toContain('[REDACTED:aws_access_key:');
      // Verify signature exists
      expect(result.memory.signature).toBeTruthy();
    }
    // Verify audit was written
    expect(auditEntries.length).toBeGreaterThan(0);
  });

  it('blocks dangerous patterns without confirmation', async () => {
    const params = makeWriteParams({
      input: {
        input: {
          type: 'task',
          title: 'Quick fix',
          content: 'Just disable_ssl for local dev',
          scope: 'project',
        },
      },
    });

    const result = await executeWritePipeline(params);

    expect(result.success).toBe(false);
    expect(result.confirmationRequired).toBe(true);
    expect(result.dangerousMatches!.length).toBeGreaterThan(0);
    expect(result.dangerousMatches![0].pattern).toBe('disable_ssl');
  });

  it('allows dangerous patterns with explicit confirmation', async () => {
    const params = makeWriteParams({
      input: {
        input: {
          type: 'task',
          title: 'Quick fix',
          content: 'Document: disable_ssl is a bad practice',
          scope: 'project',
        },
        confirmed: true,
      },
    });

    const result = await executeWritePipeline(params);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Scenario 2: Adapter Context Assembly → Format Bridge → Sync
// ============================================================================

describe('E2E Scenario 2: Context assembly through format bridge to sync', () => {
  it('assembles context, transforms format, and syncs to adapter', () => {
    // Step 1: Assemble context
    const context = {
      persona: 'You are a helpful coding assistant.',
      conventions: { style: 'functional', language: 'TypeScript' },
      projectContext: { framework: 'React', testing: 'Vitest' },
      activeCheckpoints: [],
      antiPatterns: [
        { name: 'any-type', description: 'Avoid using any type', correct_approach: 'Use generics or unknown' },
      ],
      skills: [
        { name: 'React Hooks', description: 'Custom hooks for state management', confidence: 0.85 },
      ],
      warmMemories: [],
      hotMemories: {},
    };

    const assembled = assembleContext(context as any, 10_000);
    expect(assembled.content).toContain('System Identity');
    expect(assembled.content).toContain('Conventions');
    expect(assembled.tokensUsed).toBeLessThanOrEqual(10_000);

    // Step 2: Transform through format bridge
    const sections = [
      { title: 'Skills', content: assembled.content.slice(0, 200), priority: 10, tokens: 50 },
      { title: 'Context', content: 'Project context details', priority: 5, tokens: 10 },
    ];

    const markdown = transformToFormat(sections, 'markdown');
    expect(markdown.format).toBe('markdown');
    expect(markdown.content).toContain('## Skills');

    const json = transformToFormat(sections, 'json');
    const parsed = JSON.parse(json.content);
    expect(parsed).toHaveLength(2);

    // Step 3: Roundtrip parse
    const parsedBack = parseFromFormat(json.content, 'json');
    expect(parsedBack).toHaveLength(2);
    expect(parsedBack[0].title).toBe('Skills');

    // Step 4: Sync to target
    const target = makeSyncTarget();
    const outcome = executeSyncForTarget(target, 5000);
    expect(outcome.errors).toHaveLength(0);
  });
});

// ============================================================================
// Scenario 3: Cross-Adapter Negotiation → Sync Plan → Execution
// ============================================================================

describe('E2E Scenario 3: Multi-adapter sync with capability negotiation', () => {
  it('negotiates capabilities and syncs to multiple adapters', () => {
    // Step 1: Negotiate capabilities
    const negotiations = negotiateAll(['claude-code', 'cursor', 'aider', 'generic'], 20_000);
    expect(negotiations).toHaveLength(4);

    // Verify budget capping
    const cursorNeg = negotiations.find((n) => n.adapterId === 'cursor');
    expect(cursorNeg!.effectiveTokenBudget).toBe(8_000); // cursor max

    const claudeNeg = negotiations.find((n) => n.adapterId === 'claude-code');
    expect(claudeNeg!.effectiveTokenBudget).toBe(20_000); // requested is below max

    // Step 2: Build sync plan
    const targets = [
      makeSyncTarget({ adapterId: 'claude-code', detected: true }),
      makeSyncTarget({ adapterId: 'cursor', detected: true, maxContextTokens: 8000 }),
      makeSyncTarget({ adapterId: 'aider', detected: true, maxContextTokens: 20000 }),
      makeSyncTarget({ adapterId: 'generic', detected: false }), // Not detected
    ];

    const plan = createSyncPlan(targets);
    expect(plan.targets).toHaveLength(3); // Only detected ones

    // Step 3: Execute sync
    const outcomes = plan.targets.map((t) => executeSyncForTarget(t, 5000));

    // Step 4: Aggregate results
    const result = aggregateResults(plan.id, outcomes, Date.now() - 100);
    expect(result.totalErrors).toBe(0);
    expect(result.outcomes).toHaveLength(3);
  });
});

// ============================================================================
// Scenario 4: Write-Back Ingestion → Classification → Memory
// ============================================================================

describe('E2E Scenario 4: Inbox ingestion through classification', () => {
  it('ingests multi-block content, classifies, and processes', () => {
    // Step 1: Create inbox content with multiple learning types
    const inboxContent = [
      'Use parameterized queries instead of string concatenation for SQL safety',
      '',
      'We learned that connection pooling prevents timeout errors under load',
      '',
      'Always prefer composition over inheritance in this codebase',
      '',
      'Implement the new dashboard feature with chart rendering support',
    ].join('\n');

    // Step 2: Parse into learnings
    const learnings = parseInboxContent(inboxContent, 'claude-code');
    expect(learnings).toHaveLength(4);

    const types = learnings.map((l) => l.type);
    expect(types).toContain('correction');   // "instead"
    expect(types).toContain('lesson');       // "learned"
    expect(types).toContain('preference');   // "always prefer"
    expect(types).toContain('task');         // default

    // Step 3: Create entries and process
    const entry = createInboxEntry('claude-code', inboxContent, 'inbox/test.md');
    const result = processInboxEntries([entry]);

    expect(result.entriesProcessed).toBe(1);
    expect(result.memoriesCreated).toBe(4);
    expect(result.errors).toHaveLength(0);

    // Step 4: Verify deduplication
    const result2 = processInboxEntries([entry]);
    expect(result2.entriesSkipped).toBe(1);
    expect(result2.entriesProcessed).toBe(0);
  });
});

// ============================================================================
// Scenario 5: Session Lifecycle → Cognitive Profile → Friction Detection
// ============================================================================

describe('E2E Scenario 5: Session lifecycle with cognitive profiling', () => {
  it('tracks session through full lifecycle with profile updates', () => {
    // Step 1: Create and manage session
    const session = createSession('project-1', 'claude-code');
    expect(session.status).toBe('active');

    const paused = pauseSession(session, 'step-3', 'Review PR changes');
    expect(paused.status).toBe('paused');
    expect(paused.nextAction).toBe('Review PR changes');

    const resumed = resumeSession(paused);
    expect(resumed.status).toBe('active');

    const completed = completeSession(resumed, 'All tasks done');
    expect(completed.status).toBe('completed');
    expect(completed.summary).toBe('All tasks done');

    // Step 2: Build cognitive profile from task completions
    let profile = createProfile();

    for (let i = 0; i < 6; i++) {
      profile = updateFromTaskCompletion(profile, {
        domain: 'typescript',
        taskType: 'refactoring',
        success: true,
        durationMs: 30000,
        timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }

    expect(getExpertise(profile, 'typescript')).toBe('proficient');

    // Step 3: Track corrections to identify blind spots
    for (let i = 0; i < 4; i++) {
      profile = updateFromCorrection(profile, {
        domain: 'security',
        originalApproach: 'forgot input validation',
        correctedApproach: 'validate all inputs',
        timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }

    expect(profile.blindSpots.length).toBeGreaterThan(0);
    expect(profile.blindSpots[0].domain).toBe('security');

    // Step 4: Detect friction
    const now = new Date();
    const activity: SessionActivity = {
      corrections: 5,
      queries: [],
      errors: ['e1', 'e2', 'e3'],
      taskStarted: true,
      taskCompleted: false,
      lastInteractionAt: now.toISOString(),
      startedAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
    };

    const friction = analyzeSession(activity);
    expect(friction.overallFriction).toBe('high');
    expect(friction.needsIntervention).toBe(true);
  });
});

// ============================================================================
// Scenario 6: Agent Routing → Model Selection → Cost Estimation
// ============================================================================

describe('E2E Scenario 6: Agent routing with model selection', () => {
  it('routes operations through agent definitions and model router', () => {
    // Step 1: Verify agent definitions
    const agents = getAgentDefinitions();
    expect(agents.length).toBeGreaterThanOrEqual(9);

    const rules = getActiveRules();
    expect(rules.length).toBeGreaterThanOrEqual(6);

    // Step 2: Route different operation types
    const synthesis = routeOperation('skill_synthesis');
    expect(synthesis.selectedTier).toBe('tier1');
    expect(synthesis.selectedModel).toContain('opus');

    const classification = routeOperation('content_classification');
    expect(classification.selectedTier).toBe('tier3');
    expect(classification.selectedModel).toContain('haiku');

    const optimization = routeOperation('prompt_optimization');
    expect(optimization.selectedTier).toBe('tier2');

    // Step 3: Bundle all definitions
    const bundle = bundleDefinitions();
    expect(bundle.agents.length).toBeGreaterThanOrEqual(9);
    expect(bundle.rules.length).toBeGreaterThanOrEqual(8);
    expect(bundle.version).toBe('1.0.0');
  });
});

// ============================================================================
// Scenario 7: Context Economy → Budget Allocation → Compression
// ============================================================================

describe('E2E Scenario 7: Context budget allocation with compression', () => {
  it('allocates budget, values items, and compresses to fit', () => {
    // Step 1: Allocate budget
    const budget = allocateBudget(10000);
    expect(budget.systemPrompt).toBe(1000);
    expect(budget.conventions).toBe(1500);
    expect(budget.activePlan).toBe(2000);
    expect(budget.dynamic).toBe(5500);

    // Step 2: Value context items
    const items: ContextItem[] = [
      {
        id: 'skill-1',
        content: 'TypeScript best practices guide with comprehensive examples.',
        tokenCount: 30,
        importanceClass: 'skill',
        relevance: 0.95,
        recency: 0.9,
        uniqueness: 0.8,
      },
      {
        id: 'lesson-1',
        content: 'First sentence learned. Second sentence with details. Third with more.',
        tokenCount: 25,
        importanceClass: 'lesson',
        relevance: 0.7,
        recency: 0.5,
        uniqueness: 0.6,
      },
      {
        id: 'other-1',
        content: 'Some miscellaneous context that is less important.',
        tokenCount: 20,
        importanceClass: 'other',
        relevance: 0.3,
        recency: 0.2,
        uniqueness: 0.4,
      },
    ];

    const skillValue = computeValue(items[0]);
    const lessonValue = computeValue(items[1]);
    const otherValue = computeValue(items[2]);

    // Skill should have highest value
    expect(skillValue).toBeGreaterThan(lessonValue);
    expect(lessonValue).toBeGreaterThan(otherValue);

    // Step 3: Allocate with limited budget
    const allocation = allocateItems(items, 60);
    expect(allocation.included.length).toBeGreaterThanOrEqual(1);
    // Highest value item should be first
    expect(allocation.included[0].id).toBe('skill-1');
    expect(allocation.tokensUsed).toBeLessThanOrEqual(60);
  });
});

// ============================================================================
// Scenario 8: Learning Extraction → Content Hashing → Verification
// ============================================================================

describe('E2E Scenario 8: Learning extraction with integrity verification', () => {
  it('extracts learnings, hashes content, and verifies integrity', () => {
    // Step 1: Extract learnings from adapter content
    const content = [
      'LESSON: Always use parameterized queries for SQL',
      'CORRECTION: Use bcrypt instead of MD5 for password hashing',
      'PREFERENCE: Prefer functional components over class components',
      'DECISION: Use PostgreSQL instead of MySQL for this project',
      'Regular line that should not be extracted',
    ].join('\n');

    const learnings = extractLearningsFromText(content, 'claude-code');
    expect(learnings.learnings).toHaveLength(4);

    const types = learnings.learnings.map((l) => l.category);
    expect(types).toContain('lesson');
    expect(types).toContain('preference');
    expect(types).toContain('decision');

    // Step 2: Hash and verify content integrity
    const originalContent = 'Important managed section content';
    const hash = hashContent(originalContent);
    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64); // SHA-256 hex

    // Step 3: Verify integrity
    const verified = verifyContentHash(originalContent, hash);
    expect(verified.valid).toBe(true);
    expect(verified.modified).toBe(false);

    // Step 4: Detect tampering
    const tampered = verifyContentHash('Modified content!', hash);
    expect(tampered.valid).toBe(false);
    expect(tampered.modified).toBe(true);

    // Step 5: Build file write with managed section
    const fileWrite = buildFileWrite(
      '/home/.claude/CLAUDE.md',
      originalContent,
      'claude-code',
      '1.0.0',
      true,
    );
    expect(fileWrite.path).toBe('/home/.claude/CLAUDE.md');
    expect(fileWrite.managedSection).toBe(true);
    expect(fileWrite.hash).toBe(hash);
    expect(fileWrite.content).toContain('NOESIS');
  });
});
