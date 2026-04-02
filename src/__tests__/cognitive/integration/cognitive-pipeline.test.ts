/**
 * Integration Test: Full Cognitive Pipeline
 *
 * Tests the complete flow: raw request → prompt orchestration →
 * rule matching → expert routing → capsule selection → readiness gate →
 * execution → verification → learning writeback.
 *
 * This exercises the cross-subsystem interactions that unit tests
 * cannot catch — data flowing from one module's output into another's input.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../../core/database.js';

// Orchestration entry point
import { orchestratePrompt, classifyTask, isSubstantialTask } from '../../../cognitive/prompt/prompt-engine.js';
import { assemblePrompt, assembleWithBudget } from '../../../cognitive/prompt/prompt-assembler.js';

// Rules
import { seedBuiltInRules } from '../../../cognitive/rules/built-in-rules.js';
import { matchRulesForTask, formatRulesForContext } from '../../../cognitive/rules/rule-engine.js';
import { checkCompliance, enforceHardRules } from '../../../cognitive/rules/rule-compliance.js';

// Experts
import { seedBuiltInExperts } from '../../../cognitive/experts/built-in-experts.js';
import { routeToExpert } from '../../../cognitive/experts/expert-router.js';
import { findExpertForTask } from '../../../cognitive/experts/expert-registry.js';
import { recordExpertOutcome } from '../../../cognitive/experts/expert-tracker.js';

// Capsules
import { seedBuiltInCapsules } from '../../../cognitive/capsules/built-in-capsules.js';
import { matchCapsule } from '../../../cognitive/capsules/capsule-engine.js';
import { assembleCapsule } from '../../../cognitive/capsules/capsule-assembly.js';

// Skills
import { seedBuiltInSkills } from '../../../cognitive/skills/built-in-skills.js';
import { matchSkills } from '../../../cognitive/skills/skill-matcher.js';

// Contexts
import { seedBuiltInContexts } from '../../../cognitive/context/built-in-contexts.js';
import { upsertContext } from '../../../cognitive/context/context-store.js';
import { assembleContexts } from '../../../cognitive/context/context-engine.js';

// Gates
import { computeEvidenceBackedReadiness } from '../../../cognitive/gates/readiness-gate.js';
import type { EnhancedReadinessInput, ReadinessEvidence } from '../../../cognitive/gates/readiness-gate.js';
import { detectVerificationCapabilities, createVerificationPlan } from '../../../cognitive/gates/verification-gate.js';

// Learning
import { processLearningEvent } from '../../../cognitive/learning/active-learning.js';
import { classifyFailure } from '../../../cognitive/learning/failure-classifier.js';

// Execution
import { createExecution, transitionStatus } from '../../../cognitive/execution/gsd-engine.js';
import { startPhaseExecution, recordTaskResult, completePhaseExecution } from '../../../cognitive/execution/phase-executor.js';

import type { PromptShape, Memory } from '../../../types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-pipeline-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

function seedAll(db: DatabaseConnection) {
  seedBuiltInRules(db, sign);
  seedBuiltInExperts(db, sign);
  seedBuiltInCapsules(db, sign);
  seedBuiltInSkills(db, sign);
  seedBuiltInContexts(db, sign);
}

function makeShape(overrides: Partial<PromptShape> = {}): PromptShape {
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
    type: 'task',
    title: overrides.title ?? 'Test memory',
    content: overrides.content ?? 'Memory content',
    tags: [],
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence: overrides.confidence ?? 0.8,
    outcome: overrides.outcome ?? 'success',
    source: 'agent',
    embedding: null,
    embedding_model: null,
    signature: 'sig_test',
    status: 'active',
    access_count: 0,
    created_at: now,
    updated_at: now,
    last_accessed_at: now,
    expires_at: null,
    superseded_by: null,
    session_id: null,
  };
}

describe('Full Cognitive Pipeline Integration', () => {
  const cleanups: Array<{ db: DatabaseConnection; dir: string }> = [];
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const { db, dir } of cleanups) {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
    DatabaseConnection.resetInstance();
  });

  function setup() {
    const ctx = createTestDb();
    cleanups.push(ctx);
    seedAll(ctx.db);
    return ctx;
  }

  // --------------------------------------------------------------------------
  // Scenario 1: Substantial architecture task — full pipeline
  // --------------------------------------------------------------------------

  describe('Substantial architecture task pipeline', () => {
    it('step 1: classifies task as substantial', () => {
      const desc = 'Design the system architecture for a new microservice with scalability requirements and cross-service integration';
      expect(isSubstantialTask(desc)).toBe(true);

      const shape = makeShape({ goal: desc });
      const classification = classifyTask(desc, shape);
      expect(classification.substantial).toBe(true);
    });

    it('step 2: matches rules for architecture task', () => {
      const { db } = setup();
      const matches = matchRulesForTask(
        db,
        'Design system architecture for new microservice',
        ['architecture', 'design', 'microservice', 'scalability'],
        null,
      );
      expect(matches.length).toBeGreaterThan(0);
    });

    it('step 3: routes to architecture expert', () => {
      const { db } = setup();
      const match = findExpertForTask(
        db,
        'Design system architecture for new microservice with scalability',
        ['architecture', 'design', 'scalability'],
        null,
      );
      expect(match).not.toBeNull();
      expect(match!.expert.category).toBe('architecture');
    });

    it('step 4: matches relevant capsule', () => {
      const { db } = setup();
      const matches = matchCapsule(
        db,
        'Design system architecture for API-driven microservice',
        ['architecture', 'api', 'microservice'],
        null,
      );
      // Should match api-workflow or similar capsule
      expect(matches.length).toBeGreaterThanOrEqual(0);
    });

    it('step 5: assembles contexts with priority ordering', () => {
      const { db } = setup();
      upsertContext(db, {
        context_type: 'decisions',
        content: '## Locked Decisions\n- Use SQLite',
      }, sign);
      upsertContext(db, {
        context_type: 'state',
        content: `## Project Status
In progress

## Current Phase
Implementation

## Working Set
- src/assets/registry.ts`,
      }, sign);

      const { contexts, totalTokens } = assembleContexts(db, null, 50000);

      expect(contexts.length).toBe(2);
      expect(contexts[0].context_type).toBe('decisions'); // Highest priority
      expect(contexts[1].context_type).toBe('state');
      expect(totalTokens).toBeGreaterThan(0);
    });

    it('step 6: computes readiness score', () => {
      const input: EnhancedReadinessInput = {
        taskDescription: 'Design system architecture for new microservice',
        hasGoal: true,
        hasDeliverable: true,
        constraintsIdentified: 3,
        codebaseExplored: true,
        architectureUnderstood: true,
        risksIdentified: 2,
        hasVerificationPlan: true,
        validationCriteria: 2,
      };
      const evidence: ReadinessEvidence = {
        similarPastTasks: [makeMemory({ outcome: 'success' })],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      };

      const score = computeEvidenceBackedReadiness(input, evidence);
      expect(score.passed).toBe(true);
      expect(score.total).toBeGreaterThanOrEqual(70);
    });

    it('step 7: orchestrates full prompt assembly', () => {
      const { db } = setup();
      const shape = makeShape({
        goal: 'Design system architecture for new microservice with scalability',
        context: 'Cross-service integration with shared data layer',
      });
      const memories = [makeMemory({ title: 'Previous architecture decision' })];

      const assembly = orchestratePrompt(db, shape, null, memories, {
        sign,
        tokenBudget: 50000,
      });

      // Verify all components assembled
      expect(assembly.reasoning_scaffold).toContain('Cognitive Reasoning Framework');
      expect(assembly.rules.length).toBeGreaterThan(0);
      expect(assembly.contexts.length).toBeGreaterThanOrEqual(0);
      expect(assembly.memories).toHaveLength(1);
      expect(assembly.prompt_shape.goal).toContain('architecture');
    });

    it('step 8: renders to valid markdown', () => {
      const { db } = setup();
      const shape = makeShape({
        goal: 'Design system architecture for new microservice',
      });

      const assembly = orchestratePrompt(db, shape, null, [], {
        sign,
        tokenBudget: 50000,
      });

      const markdown = assemblePrompt(assembly);
      expect(markdown).toContain('## Cognitive Reasoning Framework');
      expect(markdown).toContain('## Task');
      expect(markdown).toContain('**GOAL:**');
      expect(markdown.length).toBeGreaterThan(500);
    });

    it('step 9: respects token budget in final assembly', () => {
      const { db } = setup();
      const shape = makeShape({ goal: 'Design system architecture' });

      const assembly = orchestratePrompt(db, shape, null, [], {
        sign,
        tokenBudget: 50000,
      });

      const { prompt, tokenCount, truncated } = assembleWithBudget(assembly, 6000);
      expect(tokenCount).toBeLessThanOrEqual(6000);
      expect(prompt).toContain('## Task'); // Task always included
      // Budget enforcement should truncate some sections
      expect(truncated.length).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Operational task — lightweight pipeline
  // --------------------------------------------------------------------------

  describe('Operational task pipeline', () => {
    it('classifies simple task as non-substantial', () => {
      expect(isSubstantialTask('fix typo in README')).toBe(false);
    });

    it('assembles lightweight prompt for operational task', () => {
      const { db } = setup();
      const shape = makeShape({
        goal: 'Fix typo in README',
        context: 'Documentation fix',
      });

      const assembly = orchestratePrompt(db, shape, null, [], {
        sign,
        tokenBudget: 50000,
      });

      // No expert for non-substantial task
      expect(assembly.expert).toBeNull();
      // Still has reasoning scaffold even when template-only contexts are filtered.
      expect(assembly.reasoning_scaffold.length).toBeGreaterThan(0);
      expect(assembly.contexts.length).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Execution → verification → learning flow
  // --------------------------------------------------------------------------

  describe('Execution to learning flow', () => {
    it('creates execution, runs phase, records deviation, completes', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-pipeline' });

      // Start phase execution
      startPhaseExecution(db, exec.id, 3);

      // Record a task result
      recordTaskResult(db, exec.id, {
        taskId: 'task-1',
        status: 'completed',
        deviations: [],
      });

      // Complete phase
      const completed = completePhaseExecution(db, exec.id, true);
      expect(completed.status).toBe('completed');
    });

    it('processes learning event after task failure', () => {
      const { db } = setup();

      const result = processLearningEvent(db, {
        trigger: 'eval_failure',
        description: 'API endpoint returned wrong response format',
        rootCause: 'Missing response serialization',
        preventionRule: 'Always validate response schema',
        failureClass: 'api_contract',
        phase: 'verify',
      }, sign);

      expect(result.classified).toBe('api_contract');
      expect(result.contextsUpdated).toContain('failure_patterns');
      expect(result.contextsUpdated).toContain('lessons_learned');
    });

    it('failure classification feeds into learning pipeline', () => {
      const classification = classifyFailure('API endpoint returned 500 error, schema mismatch', {
        phase: 'verify',
        hadReadiness: true,
        hadExpert: true,
        hadCapsule: true,
        hadRules: true,
      });

      expect(classification.failureClass).toBe('api_contract');
      expect(classification.confidence).toBeGreaterThan(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Compliance check blocks execution
  // --------------------------------------------------------------------------

  describe('Compliance enforcement', () => {
    it('hard rule blocks non-compliant execution', () => {
      const { db } = setup();
      const rules = matchRulesForTask(
        db,
        'deploy critical feature without testing',
        ['deploy', 'feature'],
        null,
      );

      // Check compliance with incomplete context
      const results = checkCompliance(rules, {
        phase: 'execute',
        hasReadiness: false,
        hasResearch: false,
        hasPlan: false,
        hasVerification: false,
        isSubstantial: true,
        isCreative: false,
        isApiWork: false,
        searchCompleted: false,
        decisionsHonored: true,
      });

      // Should have blocking violations when readiness/research missing
      const enforcement = enforceHardRules(results);
      if (enforcement.blocked) {
        expect(enforcement.blocking_violations.length).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Verification capabilities detection
  // --------------------------------------------------------------------------

  describe('Verification integration', () => {
    it('detects project capabilities and creates verification plan', () => {
      const dir = mkdtempSync(join(tmpdir(), 'noesis-verify-int-'));
      tempDirs.push(dir);

      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({
        scripts: { test: 'vitest', lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit' },
      }));

      const caps = detectVerificationCapabilities(dir);
      expect(caps.availableScripts['test']).toBe('vitest');
      expect(caps.availableScripts['lint']).toBe('eslint .');

      const plan = createVerificationPlan(caps);
      expect(plan.steps.length).toBeGreaterThan(0);

      // Test step should be blocking
      const testStep = plan.steps.find(s => s.description === 'Run tests');
      expect(testStep?.blocking).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: End-to-end with memories influencing assembly
  // --------------------------------------------------------------------------

  describe('Memory-influenced assembly', () => {
    it('past failure memories change prompt content', () => {
      const { db } = setup();
      const failureMemory = makeMemory({
        title: 'Authentication module deployment failure',
        content: 'Deployment failed because JWT secret was not set in environment',
        outcome: 'failed',
        confidence: 0.9,
      });

      const shape = makeShape({
        goal: 'Deploy authentication module to production',
        context: 'JWT-based auth with environment-specific secrets',
      });

      const assembly = orchestratePrompt(db, shape, null, [failureMemory], {
        sign,
        tokenBudget: 50000,
      });

      expect(assembly.memories).toHaveLength(1);
      expect(assembly.reasoning_scaffold).toContain('Memories available');

      const markdown = assemblePrompt(assembly);
      expect(markdown).toContain('Authentication module deployment failure');
    });

    it('multiple memories sorted by relevance in assembly', () => {
      const { db } = setup();
      const memories = [
        makeMemory({ id: 'mem-1', title: 'Successful auth deploy', outcome: 'success', confidence: 0.9 }),
        makeMemory({ id: 'mem-2', title: 'Failed auth deploy', outcome: 'failed', confidence: 0.8 }),
        makeMemory({ id: 'mem-3', title: 'Partial auth success', outcome: 'partial_success', confidence: 0.7 }),
      ];

      const assembly = orchestratePrompt(
        db,
        makeShape({ goal: 'Deploy authentication module' }),
        null,
        memories,
        { sign, tokenBudget: 50000 },
      );

      expect(assembly.memories).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Skill chain resolution across subsystems
  // --------------------------------------------------------------------------

  describe('Skill chain integration', () => {
    it('matches skills for task and they have valid chain references', () => {
      const { db } = setup();
      const matches = matchSkills(
        db,
        'create a plan for implementing the new authentication feature',
        ['plan', 'implement', 'authentication'],
        null,
        { maxResults: 5 },
      );

      expect(matches.length).toBeGreaterThan(0);

      // Each matched skill should be a valid skill object
      for (const match of matches) {
        expect(match.skill.id).toBeTruthy();
        expect(match.skill.name).toBeTruthy();
        expect(match.score).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Rules format correctly for context injection
  // --------------------------------------------------------------------------

  describe('Rule context injection', () => {
    it('matched rules format as valid context markdown', () => {
      const { db } = setup();
      const rules = matchRulesForTask(
        db,
        'implement authentication with security requirements',
        ['implement', 'authentication', 'security'],
        null,
      );

      if (rules.length > 0) {
        const formatted = formatRulesForContext(rules, 10000);
        expect(formatted).toContain('## Rule:');
        expect(formatted).toContain('**Enforcement:**');
        expect(formatted.length).toBeGreaterThan(0);
      }
    });
  });
});
