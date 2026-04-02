/**
 * Performance Benchmarks — Cognitive Architecture
 *
 * Validates that critical operations complete within target latencies.
 * These are not load tests — they verify single-operation performance
 * to catch regressions.
 *
 * Benchmark targets for the cognitive architecture:
 *   Rule matching (14 rules):         < 10ms
 *   Expert routing (37 experts):      < 15ms
 *   Capsule matching (7 capsules):    < 5ms
 *   Skill matching (17 skills):       < 10ms
 *   Context assembly (13 types):      < 20ms
 *   Full prompt orchestration:        < 100ms
 *   Readiness gate with memory:       < 50ms
 *   Predictive failure detection:     < 50ms
 *   Learning writeback (multi-target): < 100ms
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../../core/database.js';

// Subsystem imports
import { seedBuiltInRules } from '../../../cognitive/rules/built-in-rules.js';
import { matchRulesForTask } from '../../../cognitive/rules/rule-engine.js';

import { seedBuiltInExperts } from '../../../cognitive/experts/built-in-experts.js';
import { routeToExpert } from '../../../cognitive/experts/expert-router.js';

import { seedBuiltInCapsules } from '../../../cognitive/capsules/built-in-capsules.js';
import { matchCapsule } from '../../../cognitive/capsules/capsule-engine.js';

import { seedBuiltInSkills } from '../../../cognitive/skills/built-in-skills.js';
import { matchSkills } from '../../../cognitive/skills/skill-matcher.js';

import { seedBuiltInContexts } from '../../../cognitive/context/built-in-contexts.js';
import { assembleContexts } from '../../../cognitive/context/context-engine.js';

import { orchestratePrompt } from '../../../cognitive/prompt/prompt-engine.js';

import { computeEvidenceBackedReadiness } from '../../../cognitive/gates/readiness-gate.js';
import type { EnhancedReadinessInput, ReadinessEvidence } from '../../../cognitive/gates/readiness-gate.js';

import { predictFailureModes } from '../../../cognitive/learning/predictive-failure.js';
import { processLearningEvent } from '../../../cognitive/learning/active-learning.js';

import { generateId } from '../../../core/ulid.js';
import type { PromptShape, Memory } from '../../../types.js';

const sign = (content: string) => `sig_${content.length}`;

// Allow generous multiplier for CI environments where timing varies.
// The spec targets are for optimized production; test environment adds overhead.
const CI_MULTIPLIER = 5;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-bench-'));
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

function makeShape(goal: string): PromptShape {
  return {
    goal,
    context: 'Standard development context',
    constraints: ['Must be backward compatible'],
    deliverable: 'Working implementation with tests',
    validation: ['Tests pass', 'No regressions'],
  };
}

function makeMemory(id: string, outcome: Memory['outcome'] = 'success'): Memory {
  const now = new Date().toISOString();
  return {
    id, type: 'task', title: `Task ${id}`, content: `Content ${id}`,
    tags: [], project_id: null, scope: 'global', sensitivity: 'INTERNAL',
    confidence: 0.8, outcome, source: 'agent', embedding: null,
    embedding_model: null, signature: 'sig', status: 'active',
    access_count: 0, created_at: now, updated_at: now,
    last_accessed_at: now, expires_at: null, superseded_by: null,
    session_id: null,
  };
}

/**
 * Measures execution time of a function in milliseconds.
 * Runs the function once for warmup, then measures.
 */
function measure(fn: () => void): number {
  // Warmup
  fn();
  // Measure
  const start = performance.now();
  fn();
  const end = performance.now();
  return end - start;
}

describe('Performance Benchmarks', () => {
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
    seedAll(ctx.db);
    return ctx;
  }

  // --------------------------------------------------------------------------
  // Rule matching: < 10ms target
  // --------------------------------------------------------------------------

  it('rule matching (14 rules) completes within target', () => {
    const { db } = setup();

    const elapsed = measure(() => {
      matchRulesForTask(
        db,
        'implement authentication module with security hardening',
        ['implement', 'authentication', 'security'],
        null,
      );
    });

    expect(elapsed).toBeLessThan(10 * CI_MULTIPLIER);
  });

  // --------------------------------------------------------------------------
  // Expert routing: < 15ms target
  // --------------------------------------------------------------------------

  it('expert routing (37 experts) completes within target', () => {
    const { db } = setup();

    const elapsed = measure(() => {
      routeToExpert(
        db,
        'design system architecture for new microservice',
        ['architecture', 'design', 'microservice'],
        null,
      );
    });

    expect(elapsed).toBeLessThan(15 * CI_MULTIPLIER);
  });

  // --------------------------------------------------------------------------
  // Capsule matching: < 5ms target
  // --------------------------------------------------------------------------

  it('capsule matching (7 capsules) completes within target', () => {
    const { db } = setup();

    const elapsed = measure(() => {
      matchCapsule(
        db,
        'refactor the API layer and add security hardening',
        ['refactor', 'api', 'security'],
        null,
      );
    });

    expect(elapsed).toBeLessThan(5 * CI_MULTIPLIER);
  });

  // --------------------------------------------------------------------------
  // Skill matching: < 10ms target
  // --------------------------------------------------------------------------

  it('skill matching (17 skills) completes within target', () => {
    const { db } = setup();

    const elapsed = measure(() => {
      matchSkills(
        db,
        'create an implementation plan for the new feature with TDD',
        ['plan', 'implementation', 'tdd'],
        null,
      );
    });

    expect(elapsed).toBeLessThan(10 * CI_MULTIPLIER);
  });

  // --------------------------------------------------------------------------
  // Context assembly: < 20ms target
  // --------------------------------------------------------------------------

  it('context assembly (13 types) completes within target', () => {
    const { db } = setup();

    const elapsed = measure(() => {
      assembleContexts(db, null, 50000);
    });

    expect(elapsed).toBeLessThan(20 * CI_MULTIPLIER);
  });

  // --------------------------------------------------------------------------
  // Full prompt orchestration: < 100ms target
  // --------------------------------------------------------------------------

  it('full prompt orchestration completes within target', () => {
    const { db } = setup();
    const shape = makeShape('Design system architecture for new microservice with security and scalability');
    const memories = [makeMemory('m1'), makeMemory('m2')];

    const elapsed = measure(() => {
      orchestratePrompt(db, shape, null, memories, {
        sign,
        tokenBudget: 50000,
      });
    });

    expect(elapsed).toBeLessThan(100 * CI_MULTIPLIER);
  });

  // --------------------------------------------------------------------------
  // Readiness gate with memory: < 50ms target
  // --------------------------------------------------------------------------

  it('readiness gate with memory evidence completes within target', () => {
    const input: EnhancedReadinessInput = {
      taskDescription: 'Implement new authentication module with comprehensive testing',
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
      similarPastTasks: Array.from({ length: 10 }, (_, i) => makeMemory(`s-${i}`)),
      pastReadinessOutcomes: [],
      relevantFailures: [makeMemory('f1', 'failed'), makeMemory('f2', 'failed')],
      relevantAntiPatternCount: 3,
    };

    const elapsed = measure(() => {
      computeEvidenceBackedReadiness(input, evidence);
    });

    expect(elapsed).toBeLessThan(50 * CI_MULTIPLIER);
  });

  // --------------------------------------------------------------------------
  // Predictive failure detection: < 50ms target
  // --------------------------------------------------------------------------

  it('predictive failure detection completes within target', () => {
    const { db } = setup();

    // Seed some learning events
    const now = new Date().toISOString();
    for (let i = 0; i < 20; i++) {
      const memId = generateId();
      db.prepare(`
        INSERT INTO memories (id, type, title, content, scope, sensitivity, tags, confidence, source, signature, created_at, updated_at, last_accessed_at)
        VALUES (?, 'lesson', ?, ?, 'project', 'INTERNAL', '[]', 0.5, 'test', 'sig', ?, ?, ?)
      `).run(memId, `Failure ${i}`, `authentication deploy failed reason ${i}`, now, now, now);

      db.prepare(`
        INSERT INTO learning_events (id, memory_id, trigger_type, failure_class, root_cause, prevention_rule, confidence, created_at)
        VALUES (?, ?, 'eval_failure', 'logic_error', ?, ?, 0.8, ?)
      `).run(generateId(), memId, `Root cause ${i}`, `Prevention ${i}`, now);
    }

    const elapsed = measure(() => {
      predictFailureModes(db, 'deploy authentication module');
    });

    expect(elapsed).toBeLessThan(50 * CI_MULTIPLIER);
  });

  // --------------------------------------------------------------------------
  // Learning writeback (multi-target): < 100ms target
  // --------------------------------------------------------------------------

  it('learning writeback (multi-target) completes within target', () => {
    const { db } = setup();

    const elapsed = measure(() => {
      processLearningEvent(db, {
        trigger: 'eval_failure',
        description: 'API endpoint returned wrong response format during integration test',
        rootCause: 'Missing response serialization in the handler',
        preventionRule: 'Always validate response schema before returning',
        failureClass: 'api_contract',
        phase: 'verify',
      }, sign);
    });

    expect(elapsed).toBeLessThan(100 * CI_MULTIPLIER);
  });

  // --------------------------------------------------------------------------
  // Combined: Full pipeline roundtrip
  // --------------------------------------------------------------------------

  it('full pipeline roundtrip (orchestrate + readiness + predict) within 200ms', () => {
    const { db } = setup();
    const shape = makeShape('Implement secure authentication with JWT and refresh tokens');

    const elapsed = measure(() => {
      // Orchestrate prompt
      orchestratePrompt(db, shape, null, [], { sign, tokenBudget: 50000 });

      // Check readiness
      computeEvidenceBackedReadiness({
        taskDescription: shape.goal,
        hasGoal: true,
        hasDeliverable: true,
        constraintsIdentified: 2,
        codebaseExplored: true,
        architectureUnderstood: true,
        risksIdentified: 1,
        hasVerificationPlan: true,
        validationCriteria: 2,
      }, {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      });

      // Predict failures
      predictFailureModes(db, shape.goal);
    });

    expect(elapsed).toBeLessThan(200 * CI_MULTIPLIER);
  });
});
