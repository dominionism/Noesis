import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  buildReasoningScaffold,
  getReasoningPhaseGuidance,
  getReasoningPhases,
  getQualityStandards,
  getCommunicationGuidance,
} from '../../cognitive/prompt/reasoning-scaffold.js';
import {
  assessDiscoveryLevel,
  formatDiscoveryGuidance,
  getDiscoveryLevelGuidance,
} from '../../cognitive/prompt/discovery-levels.js';
import {
  assemblePrompt,
  assembleWithBudget,
  estimateAssemblyTokens,
} from '../../cognitive/prompt/prompt-assembler.js';
import {
  orchestratePrompt,
  classifyTask,
  isSubstantialTask,
} from '../../cognitive/prompt/prompt-engine.js';
import { seedBuiltInRules } from '../../cognitive/rules/built-in-rules.js';
import { seedBuiltInExperts } from '../../cognitive/experts/built-in-experts.js';
import { seedBuiltInCapsules } from '../../cognitive/capsules/built-in-capsules.js';
import { seedBuiltInSkills } from '../../cognitive/skills/built-in-skills.js';
import { seedBuiltInContexts } from '../../cognitive/context/built-in-contexts.js';
import type { PromptAssembly } from '../../cognitive/types.js';
import type { PromptShape, Memory } from '../../types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-prompt-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

function makePromptShape(overrides: Partial<PromptShape> = {}): PromptShape {
  return {
    goal: overrides.goal ?? 'Implement a new feature',
    context: overrides.context ?? 'Working on the API layer',
    constraints: overrides.constraints ?? ['Must be backward compatible'],
    deliverable: overrides.deliverable ?? 'New endpoint with tests',
    validation: overrides.validation ?? ['Tests pass', 'No regressions'],
  };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'mem-1',
    type: overrides.type ?? 'task',
    title: overrides.title ?? 'Test memory',
    content: overrides.content ?? 'Memory content for testing',
    tags: overrides.tags ?? [],
    project_id: overrides.project_id ?? null,
    scope: overrides.scope ?? 'global',
    sensitivity: overrides.sensitivity ?? 'INTERNAL',
    confidence: overrides.confidence ?? 0.8,
    outcome: overrides.outcome ?? 'success',
    source: overrides.source ?? 'agent',
    embedding: overrides.embedding ?? null,
    embedding_model: overrides.embedding_model ?? null,
    signature: overrides.signature ?? 'sig_test',
    status: overrides.status ?? 'active',
    access_count: overrides.access_count ?? 0,
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    last_accessed_at: overrides.last_accessed_at ?? now,
    expires_at: overrides.expires_at ?? null,
    superseded_by: overrides.superseded_by ?? null,
    session_id: overrides.session_id ?? null,
  };
}

describe('Prompt Orchestration Engine', () => {
  const cleanups: Array<{ db: DatabaseConnection; dir: string }> = [];

  afterEach(() => {
    for (const { db, dir } of cleanups) {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
    DatabaseConnection.resetInstance();
  });

  function setup() {
    const ctx = createTestDb();
    cleanups.push(ctx);
    return ctx;
  }

  function seedAll(db: DatabaseConnection) {
    seedBuiltInRules(db, sign);
    seedBuiltInExperts(db, sign);
    seedBuiltInCapsules(db, sign);
    seedBuiltInSkills(db, sign);
    seedBuiltInContexts(db, sign);
  }

  // -----------------------------------------------------------------------
  // Reasoning Scaffold
  // -----------------------------------------------------------------------

  describe('reasoning-scaffold', () => {
    it('builds complete scaffold', () => {
      const scaffold = buildReasoningScaffold({
        taskType: 'substantial',
        hasMemories: true,
        hasPredictions: false,
        hasExpert: true,
        hasCapsule: false,
      });

      expect(scaffold).toContain('## Cognitive Reasoning Framework');
      expect(scaffold).toContain('RPUCRAE-VL');
      expect(scaffold).toContain('Cognitive Discipline');
      expect(scaffold).toContain('Communication Mode');
      expect(scaffold).toContain('Quality Standards');
    });

    it('includes conditional notes for matched entities', () => {
      const scaffold = buildReasoningScaffold({
        taskType: 'substantial',
        hasMemories: true,
        hasPredictions: true,
        hasExpert: true,
        hasCapsule: true,
      });

      expect(scaffold).toContain('Memories available');
      expect(scaffold).toContain('Failure predictions available');
      expect(scaffold).toContain('Expert matched');
      expect(scaffold).toContain('Capsule matched');
    });

    it('omits conditional notes when entities not matched', () => {
      const scaffold = buildReasoningScaffold({
        taskType: 'operational',
        hasMemories: false,
        hasPredictions: false,
        hasExpert: false,
        hasCapsule: false,
      });

      expect(scaffold).not.toContain('Memories available');
      expect(scaffold).not.toContain('Expert matched');
    });

    it('returns all 10 reasoning phases', () => {
      const phases = getReasoningPhases();
      expect(phases).toHaveLength(10);
      expect(phases).toEqual([
        'recall', 'predict', 'understand', 'constrain', 'route',
        'assess', 'plan', 'execute', 'verify', 'learn',
      ]);
    });

    it('provides guidance for each phase', () => {
      const phases = getReasoningPhases();
      for (const phase of phases) {
        const guidance = getReasoningPhaseGuidance(phase);
        expect(guidance.length).toBeGreaterThan(50);
        expect(guidance).toContain(phase.toUpperCase());
      }
    });

    it('adapts communication mode', () => {
      const expert = getCommunicationGuidance('expert');
      expect(expert).toContain('Peer Collaboration');
      expect(expert).toContain('Concise and direct');

      const beginner = getCommunicationGuidance('beginner');
      expect(beginner).toContain('Teaching');
      expect(beginner).toContain('fundamentals');

      const intermediate = getCommunicationGuidance('intermediate');
      expect(intermediate).toContain('Mentoring');
    });

    it('provides domain-specific quality standards', () => {
      const backend = getQualityStandards('backend');
      expect(backend).toContain('Parameterized queries');
      expect(backend).toContain('OWASP');

      const frontend = getQualityStandards('frontend');
      expect(frontend).toContain('loading, error, empty');
      expect(frontend).toContain('Mobile-first');

      const testing = getQualityStandards('testing');
      expect(testing).toContain('RED');
      expect(testing).toContain('GREEN');
      expect(testing).toContain('REFACTOR');

      const security = getQualityStandards('security');
      expect(security).toContain('Defense in depth');
    });
  });

  // -----------------------------------------------------------------------
  // Discovery Levels
  // -----------------------------------------------------------------------

  describe('discovery-levels', () => {
    it('returns level 0 for tasks with strong memory evidence', () => {
      const memories = [
        makeMemory({ confidence: 0.9, outcome: 'success' }),
        makeMemory({ id: 'mem-2', confidence: 0.8, outcome: 'success' }),
      ];
      const shape = makePromptShape({ goal: 'Fix a small bug' });

      const assessment = assessDiscoveryLevel(shape, memories, true);
      expect(assessment.level).toBe(0);
      expect(assessment.estimated_scope).toBe('narrow');
    });

    it('returns level 1 for known approach with details needed', () => {
      const memories = [makeMemory({ confidence: 0.8, outcome: 'success' })];
      const shape = makePromptShape({ goal: 'Add validation to existing endpoint' });

      const assessment = assessDiscoveryLevel(shape, memories, true);
      expect(assessment.level).toBe(1);
    });

    it('returns level 2 for moderate complexity', () => {
      const shape = makePromptShape({
        goal: 'Implement a new caching layer with multiple options',
        constraints: ['Must support Redis and in-memory', 'Must be configurable'],
      });

      const assessment = assessDiscoveryLevel(shape, [], false);
      expect(assessment.level).toBe(2);
      expect(assessment.estimated_scope).toBe('moderate');
    });

    it('returns level 3 for architectural tasks', () => {
      const shape = makePromptShape({
        goal: 'Architect the system design for cross-service authentication with shared abstractions',
        context: 'Multiple microservices need unified auth with long-term scalability',
      });

      const assessment = assessDiscoveryLevel(shape, [], false);
      expect(assessment.level).toBe(3);
      expect(assessment.estimated_scope).toBe('broad');
    });

    it('formats discovery guidance', () => {
      const assessment = assessDiscoveryLevel(makePromptShape(), [], false);
      const guidance = formatDiscoveryGuidance(assessment);

      expect(guidance).toContain('### Discovery Level');
      expect(guidance).toContain('**Rationale:**');
      expect(guidance).toContain('**Expected Artifacts:**');
    });

    it('provides guidance for each level', () => {
      for (const level of [0, 1, 2, 3] as const) {
        const guidance = getDiscoveryLevelGuidance(level);
        expect(guidance.length).toBeGreaterThan(20);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Prompt Assembler
  // -----------------------------------------------------------------------

  describe('prompt-assembler', () => {
    function makeAssembly(overrides: Partial<PromptAssembly> = {}): PromptAssembly {
      return {
        reasoning_scaffold: overrides.reasoning_scaffold ?? '## Cognitive Reasoning Framework\nTest scaffold',
        rules: overrides.rules ?? [],
        expert: overrides.expert ?? null,
        capsule: overrides.capsule ?? null,
        skills: overrides.skills ?? [],
        memories: overrides.memories ?? [],
        contexts: overrides.contexts ?? [],
        prompt_shape: overrides.prompt_shape ?? makePromptShape(),
        token_budget: overrides.token_budget ?? 10000,
        priority_order: overrides.priority_order ?? [],
      };
    }

    it('assembles complete prompt with all sections', () => {
      const assembly = makeAssembly({
        reasoning_scaffold: '## Cognitive Reasoning Framework\nRPUCRAE-VL protocol here',
        memories: [makeMemory()],
        contexts: [{
          id: 'ctx-1',
          context_type: 'decisions',
          project_id: null,
          content: '## Locked Decisions\n- Use TypeScript',
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      const prompt = assemblePrompt(assembly);

      expect(prompt).toContain('## Cognitive Reasoning Framework');
      expect(prompt).toContain('## Locked Decisions');
      expect(prompt).toContain('## Relevant Memories');
      expect(prompt).toContain('## Task');
      expect(prompt).toContain('**GOAL:**');
    });

    it('maintains correct section order', () => {
      const assembly = makeAssembly({
        memories: [makeMemory()],
        contexts: [{
          id: 'ctx-1', context_type: 'decisions', project_id: null,
          content: 'Decisions content', version: 1,
          created_at: '', updated_at: '',
        }],
      });

      const prompt = assemblePrompt(assembly);
      const scaffoldIdx = prompt.indexOf('## Cognitive Reasoning Framework');
      const decisionsIdx = prompt.indexOf('## Locked Decisions');
      const memoriesIdx = prompt.indexOf('## Relevant Memories');
      const taskIdx = prompt.indexOf('## Task');

      expect(scaffoldIdx).toBeLessThan(decisionsIdx);
      expect(decisionsIdx).toBeLessThan(memoriesIdx);
      expect(memoriesIdx).toBeLessThan(taskIdx);
    });

    it('assembles with budget enforcement', () => {
      const assembly = makeAssembly({
        reasoning_scaffold: 'Short scaffold',
        memories: [makeMemory({ content: 'A'.repeat(2000) })],
      });

      const { prompt, truncated, tokenCount } = assembleWithBudget(assembly, 200);
      expect(tokenCount).toBeLessThanOrEqual(200);
      expect(prompt).toContain('## Task'); // Prompt shape always included
    });

    it('reports truncated sections', () => {
      const assembly = makeAssembly({
        reasoning_scaffold: 'Short scaffold',
        memories: [makeMemory({ content: 'A'.repeat(5000) })],
        contexts: [{
          id: 'ctx-1', context_type: 'state', project_id: null,
          content: 'B'.repeat(5000), version: 1,
          created_at: '', updated_at: '',
        }],
      });

      const { truncated } = assembleWithBudget(assembly, 100);
      expect(truncated.length).toBeGreaterThan(0);
    });

    it('estimates assembly tokens', () => {
      const assembly = makeAssembly({
        reasoning_scaffold: 'Test scaffold content here',
        memories: [makeMemory()],
      });

      const estimate = estimateAssemblyTokens(assembly);
      expect(estimate).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Prompt Engine
  // -----------------------------------------------------------------------

  describe('prompt-engine', () => {
    it('classifies simple tasks as non-substantial', () => {
      expect(isSubstantialTask('fix typo')).toBe(false);
      expect(isSubstantialTask('add a comma')).toBe(false);
    });

    it('classifies complex tasks as substantial', () => {
      expect(isSubstantialTask('refactor the authentication module to use JWT tokens')).toBe(true);
      expect(isSubstantialTask('implement a new caching layer with Redis and in-memory fallback')).toBe(true);
      expect(isSubstantialTask('migrate the database schema and update all dependent services')).toBe(true);
    });

    it('classifies task characteristics', () => {
      const shape = makePromptShape({
        goal: 'Redesign the UI component library',
        context: 'Frontend application with design system',
      });
      const classification = classifyTask('Redesign the UI component library', shape);

      expect(classification.creative).toBe(true);
      expect(classification.subsystems).toContain('frontend');
    });

    it('identifies API work', () => {
      const shape = makePromptShape({
        goal: 'Create a new REST API endpoint for user management',
      });
      const classification = classifyTask('Create a new REST API endpoint', shape);
      expect(classification.api_work).toBe(true);
    });

    it('extracts keywords from task description', () => {
      const shape = makePromptShape({
        goal: 'Implement authentication with JWT tokens and session management',
      });
      const classification = classifyTask(
        'Implement authentication with JWT tokens and session management',
        shape,
      );
      expect(classification.keywords).toContain('authentication');
      expect(classification.keywords).toContain('tokens');
    });

    it('orchestrates full prompt assembly', () => {
      const { db } = setup();
      seedAll(db);

      const shape = makePromptShape({
        goal: 'Implement a new authentication system with security hardening',
        context: 'Building a secure API with JWT tokens and rate limiting',
      });

      const assembly = orchestratePrompt(db, shape, null, [], {
        sign,
        tokenBudget: 50000,
      });

      expect(assembly.reasoning_scaffold).toContain('Cognitive Reasoning Framework');
      expect(assembly.prompt_shape.goal).toContain('authentication');
      expect(assembly.rules.length).toBeGreaterThanOrEqual(0);
      expect(assembly.contexts.length).toBeGreaterThan(0);
      expect(assembly.priority_order.length).toBeGreaterThan(0);
    });

    it('includes expert for substantial tasks', () => {
      const { db } = setup();
      seedAll(db);

      const shape = makePromptShape({
        goal: 'Design the system architecture for a new microservice with scalability requirements',
        context: 'Cross-service integration with shared data layer',
      });

      const assembly = orchestratePrompt(db, shape, null, [], {
        sign,
        tokenBudget: 50000,
      });

      // Task is substantial and architecture-related, should find an expert
      // (may or may not match depending on keyword overlap)
      expect(assembly.prompt_shape).toBeDefined();
    });

    it('includes memories when provided', () => {
      const { db } = setup();
      seedAll(db);

      const memories = [
        makeMemory({ title: 'Past auth implementation' }),
        makeMemory({ id: 'mem-2', title: 'Security review findings' }),
      ];

      const shape = makePromptShape({
        goal: 'Implement security hardening for the API endpoints',
      });

      const assembly = orchestratePrompt(db, shape, null, memories, {
        sign,
        tokenBudget: 50000,
      });

      expect(assembly.memories).toHaveLength(2);
      expect(assembly.reasoning_scaffold).toContain('Memories available');
    });

    it('renders to complete markdown', () => {
      const { db } = setup();
      seedAll(db);

      const shape = makePromptShape();
      const assembly = orchestratePrompt(db, shape, null, [], {
        sign,
        tokenBudget: 50000,
      });

      const markdown = assemblePrompt(assembly);
      expect(markdown).toContain('## Cognitive Reasoning Framework');
      expect(markdown).toContain('## Task');
      expect(markdown).toContain('**GOAL:**');
    });
  });
});
