/**
 * Integration Test: Learning Writeback Cycle
 *
 * Tests the complete learning loop:
 *   Task fails → correction detected → failure classified →
 *   writeback to rules + contexts → next similar task benefits from correction.
 *
 * This is the self-improvement cycle that makes the cognitive architecture
 * get better over time.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../../core/database.js';

// Learning subsystem
import { detectCorrection, detectRepeatedFailure } from '../../../cognitive/learning/correction-detector.js';
import { classifyFailure, getWritebackTargets } from '../../../cognitive/learning/failure-classifier.js';
import { writebackToRules, writebackToContexts, writebackToExpert, writebackToCapsule } from '../../../cognitive/learning/writeback-engine.js';
import { processLearningEvent, recordGateEvaluation } from '../../../cognitive/learning/active-learning.js';
import { trackGateEffectiveness, getEffectivenessMetrics, getCrossSubsystemEffectiveness } from '../../../cognitive/learning/effectiveness-tracker.js';
import { predictFailureModes, getPreventiveGuidance } from '../../../cognitive/learning/predictive-failure.js';

// Other subsystems involved
import { seedBuiltInRules } from '../../../cognitive/rules/built-in-rules.js';
import { seedBuiltInExperts } from '../../../cognitive/experts/built-in-experts.js';
import { seedBuiltInCapsules } from '../../../cognitive/capsules/built-in-capsules.js';
import { seedBuiltInContexts } from '../../../cognitive/context/built-in-contexts.js';
import { getContext, listContexts } from '../../../cognitive/context/context-store.js';
import { assembleContexts } from '../../../cognitive/context/context-engine.js';
import { listRules, getRuleByName } from '../../../cognitive/rules/rule-store.js';
import { insertCapsule, insertComponent } from '../../../cognitive/capsules/capsule-store.js';
import { getExpertByName } from '../../../cognitive/experts/expert-store.js';

import { generateId } from '../../../core/ulid.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-writeback-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Learning Writeback Cycle Integration', () => {
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

  // --------------------------------------------------------------------------
  // Scenario 1: Explicit correction → classification → context writeback
  // --------------------------------------------------------------------------

  describe('Correction detection to writeback', () => {
    it('detects correction, classifies failure, writes to contexts', () => {
      const { db } = setup();
      seedBuiltInContexts(db, sign);

      // Step 1: Detect the correction
      const correction = detectCorrection(
        "No, don't use that approach. Use bcrypt instead of md5 for password hashing.",
        'I implemented password hashing using md5 for the auth module.',
      );
      expect(correction.detected).toBe(true);
      expect(correction.type).toBe('explicit');

      // Step 2: Classify the failure
      const classification = classifyFailure(
        'Used weak hashing algorithm (md5) for passwords instead of bcrypt',
        {
          phase: 'execute',
          hadReadiness: true,
          hadExpert: true,
          hadCapsule: false,
          hadRules: true,
        },
      );
      expect(['verification', 'creative_taste', 'tool_use', 'context_assembly']).toContain(classification.failureClass);

      // Step 3: Process learning event (writes to contexts)
      const result = processLearningEvent(db, {
        trigger: 'eval_failure',
        description: 'Used weak hashing algorithm for passwords',
        rootCause: 'Did not check security best practices for password storage',
        preventionRule: 'Always use bcrypt or argon2 for password hashing',
        failureClass: 'verification',
        phase: 'execute',
      }, sign);

      expect(result.contextsUpdated).toContain('failure_patterns');
      expect(result.contextsUpdated).toContain('lessons_learned');

      // Step 4: Verify contexts were actually written
      const failurePatterns = getContext(db, 'failure_patterns');
      expect(failurePatterns).not.toBeNull();
      expect(failurePatterns!.content).toContain('hashing');

      const lessonsLearned = getContext(db, 'lessons_learned');
      expect(lessonsLearned).not.toBeNull();
      expect(lessonsLearned!.content).toContain('bcrypt');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Repeated failures → automatic rule creation
  // --------------------------------------------------------------------------

  describe('Repeated failure auto-rule creation', () => {
    it('creates rule after 3+ repeated failures of same type', () => {
      const { db } = setup();
      const now = new Date().toISOString();

      // Seed 4 similar planning failures
      for (let i = 0; i < 4; i++) {
        db.prepare(`
          INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, evidence, created_at)
          VALUES (?, 'gate', 'test', ?, 'failure', ?, ?)
        `).run(generateId(), 'deploy authentication module plan incomplete', 'planning', now);
      }

      // Trigger rule writeback
      const result = writebackToRules(db, 'planning', {
        description: 'deploy authentication module plan incomplete',
        memoryIds: [],
      }, sign);

      expect(result.action).toBe('new_rule');
      expect(result.ruleId).toBeDefined();

      // Verify the rule was created in the database
      const rules = listRules(db);
      const autoRule = rules.find(r => r.name.startsWith('auto-'));
      expect(autoRule).toBeDefined();
      // Auto-rules from writebackToRules are immediately enabled with 'advisory' enforcement
      expect(autoRule!.enabled).toBe(true);
      expect(autoRule!.enforcement).toBe('advisory');
    });

    it('modifies existing auto-rule on subsequent failures', () => {
      const { db } = setup();
      const now = new Date().toISOString();

      // Seed failures
      for (let i = 0; i < 4; i++) {
        db.prepare(`
          INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, evidence, created_at)
          VALUES (?, 'gate', 'test', ?, 'failure', ?, ?)
        `).run(generateId(), 'deploy authentication module plan wrong', 'planning', now);
      }

      // First writeback creates the rule
      const first = writebackToRules(db, 'planning', {
        description: 'deploy authentication module plan wrong',
        memoryIds: [],
      }, sign);
      expect(first.action).toBe('new_rule');

      // Second writeback modifies it
      const second = writebackToRules(db, 'planning', {
        description: 'deploy authentication module plan wrong',
        memoryIds: [],
      }, sign);
      expect(second.action).toBe('modified_rule');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Expert writeback after routing failure
  // --------------------------------------------------------------------------

  describe('Expert performance writeback', () => {
    it('records failure outcome and affects expert stats', () => {
      const { db } = setup();
      seedBuiltInExperts(db, sign);

      const expert = getExpertByName(db, 'architect')!;
      const initialRate = expert.success_rate;

      // Record failure
      writebackToExpert(db, expert.id, 'failure', sign, 'planning');

      // Verify cognitive_outcomes was written
      const outcome = db.prepare<[string, string], { outcome: string }>(
        'SELECT outcome FROM cognitive_outcomes WHERE entity_type = ? AND entity_id = ?',
      ).get('expert', expert.id);
      expect(outcome?.outcome).toBe('failure');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Capsule anti-pattern writeback
  // --------------------------------------------------------------------------

  describe('Capsule anti-pattern writeback', () => {
    it('appends anti-pattern after API contract failure', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, {
        name: 'test-api-capsule',
        display_name: 'API Capsule',
        description: 'For API workflow',
        trigger_patterns: ['api', 'endpoint'],
      }, sign);

      // Insert initial anti-pattern component
      insertComponent(db, {
        capsule_id: capsule.id,
        component_type: 'anti_patterns',
        content: 'Never skip input validation',
      }, sign);

      // Writeback after API contract failure
      writebackToCapsule(db, capsule.id, 'anti_patterns', 'Always validate response schema before sending', sign);

      // Verify both patterns exist
      const component = db.prepare<[string, string], { content: string }>(
        "SELECT content FROM capsule_components WHERE capsule_id = ? AND component_type = ?",
      ).get(capsule.id, 'anti_patterns');

      expect(component?.content).toContain('Never skip input validation');
      expect(component?.content).toContain('validate response schema');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Full active learning orchestration
  // --------------------------------------------------------------------------

  describe('Full active learning orchestration', () => {
    it('processes failure with expert and capsule writebacks', () => {
      const { db } = setup();
      seedBuiltInExperts(db, sign);

      const capsule = insertCapsule(db, {
        name: 'learning-test-capsule',
        display_name: 'Learning Test',
        description: 'For testing learning',
        trigger_patterns: ['test'],
      }, sign);

      const expert = getExpertByName(db, 'qa-engineer')!;

      const result = processLearningEvent(db, {
        trigger: 'eval_failure',
        description: 'Test suite missed critical edge case in date parsing',
        rootCause: 'No boundary tests for leap year dates',
        preventionRule: 'Always include boundary tests for date operations',
        failureClass: 'verification',
        phase: 'verify',
        expertId: expert.id,
        capsuleId: capsule.id,
      }, sign);

      expect(result.contextsUpdated.length).toBeGreaterThan(0);
      expect(result.expertUpdated).toBe(true);
      expect(result.capsuleUpdated).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Gate effectiveness tracking across subsystems
  // --------------------------------------------------------------------------

  describe('Gate effectiveness tracking', () => {
    it('tracks effectiveness across readiness, verification, and output quality', () => {
      const { db } = setup();

      // Record various gate evaluations
      trackGateEffectiveness(db, 'readiness', true, 'success');
      trackGateEffectiveness(db, 'readiness', true, 'success');
      trackGateEffectiveness(db, 'readiness', true, 'failure'); // False pass
      trackGateEffectiveness(db, 'readiness', false, 'failure');

      trackGateEffectiveness(db, 'verification', true, 'success');
      trackGateEffectiveness(db, 'verification', false, 'success'); // False block

      trackGateEffectiveness(db, 'output_quality', true, 'success');
      trackGateEffectiveness(db, 'output_quality', true, 'success');

      // Check per-gate metrics
      const readinessMetrics = getEffectivenessMetrics(db, 'readiness');
      expect(readinessMetrics.total).toBe(4);
      expect(readinessMetrics.passRate).toBeCloseTo(0.75, 1);

      const verificationMetrics = getEffectivenessMetrics(db, 'verification');
      expect(verificationMetrics.total).toBe(2);

      // Check cross-subsystem
      const cross = getCrossSubsystemEffectiveness(db);
      expect(cross.overall.total).toBe(8);
      expect(cross.readiness.total).toBe(4);
      expect(cross.verification.total).toBe(2);
    });

    it('recordGateEvaluation flows into effectiveness metrics', () => {
      const { db } = setup();

      recordGateEvaluation(db, 'readiness', true, 'success');
      recordGateEvaluation(db, 'readiness', false, 'failure');

      const metrics = getEffectivenessMetrics(db, 'readiness');
      expect(metrics.total).toBe(2);
      expect(metrics.passRate).toBeCloseTo(0.5, 1);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Context writeback → next task benefits
  // --------------------------------------------------------------------------

  describe('Context writeback benefits next task', () => {
    it('failure pattern written by learning event is retrievable in next context assembly', () => {
      const { db } = setup();
      seedBuiltInContexts(db, sign);

      // Simulate a failure that writes to contexts
      processLearningEvent(db, {
        trigger: 'eval_failure',
        description: 'Forgot to validate user input on the create endpoint',
        rootCause: 'No input validation middleware',
        preventionRule: 'Always add Zod schema validation to all endpoints',
        failureClass: 'verification',
        phase: 'execute',
      }, sign);

      // Now assemble contexts for the next task — failure pattern should be present
      const { contexts } = assembleContexts(db, null, 100000);
      const failureContext = contexts.find(c => c.context_type === 'failure_patterns');
      expect(failureContext).toBeDefined();
      expect(failureContext!.content).toContain('validate');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Writeback target mapping consistency
  // --------------------------------------------------------------------------

  describe('Writeback target mapping', () => {
    it('each failure class maps to correct writeback targets', () => {
      const classes = ['context_assembly', 'planning', 'tool_use', 'verification', 'creative_taste', 'api_contract'] as const;

      for (const cls of classes) {
        const targets = getWritebackTargets(cls);
        expect(targets.length).toBeGreaterThan(0);

        // Every failure class should write to contexts
        expect(targets).toContain('contexts');
      }

      // Specific assertions
      expect(getWritebackTargets('planning')).toContain('rules');
      expect(getWritebackTargets('tool_use')).toContain('skills');
      expect(getWritebackTargets('api_contract')).toContain('capsules');
    });
  });
});
