import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';

// Correction detector
import {
  detectCorrection,
  detectRepeatedFailure,
  extractCorrectionContent,
} from '../../cognitive/learning/correction-detector.js';

// Failure classifier
import {
  classifyFailure,
  getCognitiveFailureClasses,
  getWritebackTargets,
} from '../../cognitive/learning/failure-classifier.js';
import type { CognitiveFailureClass } from '../../cognitive/learning/failure-classifier.js';

// Writeback engine
import {
  writebackToRules,
  writebackToContexts,
  writebackToExpert,
  writebackToCapsule,
} from '../../cognitive/learning/writeback-engine.js';

// Effectiveness tracker
import {
  trackGateEffectiveness,
  getEffectivenessMetrics,
  suggestAdjustment,
  getCrossSubsystemEffectiveness,
} from '../../cognitive/learning/effectiveness-tracker.js';

// Predictive failure
import {
  predictFailureModes,
  getPreventiveGuidance,
} from '../../cognitive/learning/predictive-failure.js';

// Active learning orchestrator
import {
  processLearningEvent,
  recordGateEvaluation,
} from '../../cognitive/learning/active-learning.js';

// Dependencies for setup
import { insertCapsule, insertComponent } from '../../cognitive/capsules/capsule-store.js';
import { seedBuiltInExperts } from '../../cognitive/experts/built-in-experts.js';
import { generateId } from '../../core/ulid.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-learning-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Active Learning Loop', () => {
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

  // ==========================================================================
  // Correction Detector
  // ==========================================================================

  describe('Correction Detector', () => {
    it('should detect explicit correction: "no, wrong"', () => {
      const result = detectCorrection('No, that\'s wrong, I wanted a list', null);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('explicit');
      expect(result.signal).toContain('explicit');
    });

    it('should detect explicit correction: "don\'t"', () => {
      const result = detectCorrection("Don't use that approach", null);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('explicit');
      expect(result.signal).toBe('explicit-dont');
    });

    it('should detect explicit correction: "instead"', () => {
      const result = detectCorrection('Use React instead', null);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('explicit');
      expect(result.signal).toBe('explicit-instead');
    });

    it('should detect explicit correction: "actually"', () => {
      const result = detectCorrection('Actually, I need a different approach', null);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('explicit');
      expect(result.signal).toBe('explicit-actually');
    });

    it('should detect explicit correction: "revert"', () => {
      const result = detectCorrection('Revert that change', null);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('explicit');
      expect(result.signal).toBe('explicit-revert');
    });

    it('should detect explicit correction: "fix this"', () => {
      const result = detectCorrection('Fix this please', null);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('explicit');
      expect(result.signal).toBe('explicit-fix');
    });

    it('should not detect correction in neutral messages', () => {
      const result = detectCorrection('Looks good, proceed with the implementation', null);
      expect(result.detected).toBe(false);
      expect(result.type).toBeNull();
      expect(result.signal).toBe('');
    });

    it('should detect implicit correction via rephrasing', () => {
      const result = detectCorrection(
        'Create a function that validates email addresses',
        'I built a function that validates email addresses using regex',
      );
      expect(result.detected).toBe(true);
      expect(result.type).toBe('implicit');
      expect(result.signal).toBe('implicit-rephrasing');
    });

    it('should not detect implicit correction for unrelated messages', () => {
      const result = detectCorrection(
        'How is the weather today?',
        'I implemented the authentication module with JWT tokens',
      );
      expect(result.detected).toBe(false);
    });

    it('should extract correction content', () => {
      const detection = detectCorrection('No, use bcrypt instead', null);
      const content = extractCorrectionContent('No, use bcrypt instead', detection);
      expect(content).toBe('No, use bcrypt instead');
    });

    it('should detect repeated failures in cognitive_outcomes', () => {
      const { db } = setup();
      const now = new Date().toISOString();

      // Insert 3+ failures with matching evidence
      for (let i = 0; i < 4; i++) {
        db.prepare(`
          INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, evidence, created_at)
          VALUES (?, 'gate', 'test', ?, 'failure', ?, ?)
        `).run(generateId(), 'deploy authentication module', 'planning', now);
      }

      const result = detectRepeatedFailure(db, 'deploy authentication module', 'planning');
      expect(result.repeated).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(3);
    });

    it('should not flag as repeated below threshold', () => {
      const { db } = setup();
      const now = new Date().toISOString();

      // Insert only 2 failures
      for (let i = 0; i < 2; i++) {
        db.prepare(`
          INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, evidence, created_at)
          VALUES (?, 'gate', 'test', ?, 'failure', ?, ?)
        `).run(generateId(), 'deploy authentication module', 'planning', now);
      }

      const result = detectRepeatedFailure(db, 'deploy authentication module', 'planning');
      expect(result.repeated).toBe(false);
    });
  });

  // ==========================================================================
  // Failure Classifier
  // ==========================================================================

  describe('Failure Classifier', () => {
    it('should classify context_assembly failures', () => {
      const result = classifyFailure('Missing context — did not load relevant information', {
        phase: 'recall',
        hadReadiness: false,
        hadExpert: false,
        hadCapsule: false,
        hadRules: false,
      });
      expect(result.failureClass).toBe('context_assembly');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify planning failures', () => {
      const result = classifyFailure('The plan was incomplete, missed key step', {
        phase: 'plan',
        hadReadiness: false,
        hadExpert: true,
        hadCapsule: false,
        hadRules: false,
      });
      expect(result.failureClass).toBe('planning');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify tool_use failures', () => {
      const result = classifyFailure('Used wrong tool for the task, should have used grep', {
        phase: 'execute',
        hadReadiness: true,
        hadExpert: true,
        hadCapsule: false,
        hadRules: true,
      });
      expect(result.failureClass).toBe('tool_use');
    });

    it('should classify verification failures', () => {
      const result = classifyFailure('Did not test the edge case, regression broke it', {
        phase: 'verify',
        hadReadiness: false,
        hadExpert: false,
        hadCapsule: false,
        hadRules: false,
      });
      expect(result.failureClass).toBe('verification');
    });

    it('should classify creative_taste failures', () => {
      const result = classifyFailure('The UI design does not match my preferred style', {
        phase: 'execute',
        hadReadiness: true,
        hadExpert: true,
        hadCapsule: true,
        hadRules: true,
      });
      expect(result.failureClass).toBe('creative_taste');
    });

    it('should classify api_contract failures', () => {
      const result = classifyFailure('API endpoint returns wrong response format, breaking the contract', {
        phase: 'verify',
        hadReadiness: true,
        hadExpert: true,
        hadCapsule: true,
        hadRules: true,
      });
      expect(result.failureClass).toBe('api_contract');
    });

    it('should fall back to context_assembly with low confidence', () => {
      const result = classifyFailure('Something went wrong', {
        phase: 'execute',
        hadReadiness: true,
        hadExpert: true,
        hadCapsule: true,
        hadRules: true,
      });
      expect(result.failureClass).toBe('context_assembly');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should boost confidence for phase alignment', () => {
      const withPhase = classifyFailure('Missing context data', {
        phase: 'recall',
        hadReadiness: false,
        hadExpert: false,
        hadCapsule: false,
        hadRules: false,
      });
      const withoutPhase = classifyFailure('Missing context data', {
        phase: 'execute',
        hadReadiness: false,
        hadExpert: false,
        hadCapsule: false,
        hadRules: false,
      });
      expect(withPhase.confidence).toBeGreaterThanOrEqual(withoutPhase.confidence);
    });

    it('should return all 6 cognitive failure classes', () => {
      const classes = getCognitiveFailureClasses();
      expect(classes).toHaveLength(6);
      expect(classes).toContain('context_assembly');
      expect(classes).toContain('planning');
      expect(classes).toContain('tool_use');
      expect(classes).toContain('verification');
      expect(classes).toContain('creative_taste');
      expect(classes).toContain('api_contract');
    });

    it('should map failure classes to writeback targets', () => {
      expect(getWritebackTargets('context_assembly')).toContain('contexts');
      expect(getWritebackTargets('planning')).toContain('rules');
      expect(getWritebackTargets('tool_use')).toContain('skills');
      expect(getWritebackTargets('api_contract')).toContain('capsules');
    });
  });

  // ==========================================================================
  // Writeback Engine
  // ==========================================================================

  describe('Writeback Engine', () => {
    it('should return none when no repeated failures', () => {
      const { db } = setup();
      const result = writebackToRules(db, 'planning', {
        description: 'Plan was incomplete',
        memoryIds: [],
      }, sign);
      expect(result.action).toBe('none');
    });

    it('should create new rule on 3+ repeated failures', () => {
      const { db } = setup();
      const now = new Date().toISOString();

      // Seed 4 similar failures
      for (let i = 0; i < 4; i++) {
        db.prepare(`
          INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, evidence, created_at)
          VALUES (?, 'gate', 'test', ?, 'failure', ?, ?)
        `).run(generateId(), 'deploy authentication module', 'planning', now);
      }

      const result = writebackToRules(db, 'planning', {
        description: 'deploy authentication module',
        memoryIds: [],
      }, sign);

      expect(result.action).toBe('new_rule');
      expect(result.ruleId).toBeDefined();
    });

    it('should return modified_rule if auto-rule already exists', () => {
      const { db } = setup();
      const now = new Date().toISOString();

      // Seed failures
      for (let i = 0; i < 4; i++) {
        db.prepare(`
          INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, evidence, created_at)
          VALUES (?, 'gate', 'test', ?, 'failure', ?, ?)
        `).run(generateId(), 'deploy authentication module', 'planning', now);
      }

      // First call creates the rule
      writebackToRules(db, 'planning', {
        description: 'deploy authentication module',
        memoryIds: [],
      }, sign);

      // Second call should detect existing rule
      const result = writebackToRules(db, 'planning', {
        description: 'deploy authentication module',
        memoryIds: [],
      }, sign);

      expect(result.action).toBe('modified_rule');
    });

    it('should write failure patterns and lessons to contexts', () => {
      const { db } = setup();

      writebackToContexts(db, 'verification', {
        trigger: 'Test suite did not cover edge case',
        miss: 'Edge case in date parsing',
        rootCause: 'No boundary tests for leap years',
        prevention: 'Add boundary tests for all date operations',
      }, null, sign);

      // Check failure_patterns context was created
      const fp = db.prepare<[], { content: string }>(
        "SELECT content FROM context_state WHERE context_type = 'failure_patterns'",
      ).get();
      expect(fp).toBeDefined();

      // Check lessons_learned context was created
      const ll = db.prepare<[], { content: string }>(
        "SELECT content FROM context_state WHERE context_type = 'lessons_learned'",
      ).get();
      expect(ll).toBeDefined();
    });

    it('should write back to expert performance', () => {
      const { db } = setup();

      // Seed an expert
      seedBuiltInExperts(db, sign);

      const expert = db.prepare<[], { id: string }>(
        'SELECT id FROM experts LIMIT 1',
      ).get();

      if (expert) {
        writebackToExpert(db, expert.id, 'failure', sign, 'planning');

        // Check cognitive_outcomes has the record
        const outcome = db.prepare<[string], { outcome: string }>(
          'SELECT outcome FROM cognitive_outcomes WHERE entity_type = ? AND entity_id = ?',
        ).get('expert', expert.id);
        expect(outcome?.outcome).toBe('failure');
      }
    });

    it('should write back to capsule anti-patterns', () => {
      const { db } = setup();

      const capsule = insertCapsule(db, {
        name: 'test-capsule',
        display_name: 'Test Capsule',
        description: 'A test capsule',
        trigger_patterns: ['test'],
      }, sign);

      writebackToCapsule(db, capsule.id, 'anti_patterns', 'Do not skip validation', sign);

      const components = db.prepare<[string, string], { content: string }>(
        "SELECT content FROM capsule_components WHERE capsule_id = ? AND component_type = ?",
      ).get(capsule.id, 'anti_patterns');

      expect(components?.content).toContain('Do not skip validation');
    });

    it('should append to existing capsule component', () => {
      const { db } = setup();

      const capsule = insertCapsule(db, {
        name: 'test-capsule-2',
        display_name: 'Test Capsule 2',
        description: 'Another test capsule',
        trigger_patterns: ['test'],
      }, sign);

      insertComponent(db, {
        capsule_id: capsule.id,
        component_type: 'anti_patterns',
        content: 'Existing pattern: avoid globals',
      }, sign);

      writebackToCapsule(db, capsule.id, 'anti_patterns', 'New pattern: avoid mutation', sign);

      const components = db.prepare<[string, string], { content: string }>(
        "SELECT content FROM capsule_components WHERE capsule_id = ? AND component_type = ?",
      ).get(capsule.id, 'anti_patterns');

      expect(components?.content).toContain('Existing pattern');
      expect(components?.content).toContain('New pattern');
    });
  });

  // ==========================================================================
  // Effectiveness Tracker
  // ==========================================================================

  describe('Effectiveness Tracker', () => {
    it('should track gate effectiveness', () => {
      const { db } = setup();

      trackGateEffectiveness(db, 'readiness', true, 'success');
      trackGateEffectiveness(db, 'readiness', true, 'failure');
      trackGateEffectiveness(db, 'readiness', false, 'success');

      const metrics = getEffectivenessMetrics(db, 'readiness');
      expect(metrics.total).toBe(3);
    });

    it('should compute pass rate correctly', () => {
      const { db } = setup();

      // 3 passed, 1 blocked
      trackGateEffectiveness(db, 'readiness', true, 'success');
      trackGateEffectiveness(db, 'readiness', true, 'success');
      trackGateEffectiveness(db, 'readiness', true, 'failure');
      trackGateEffectiveness(db, 'readiness', false, 'failure');

      const metrics = getEffectivenessMetrics(db, 'readiness');
      expect(metrics.passRate).toBeCloseTo(0.75, 1);
    });

    it('should compute false pass rate correctly', () => {
      const { db } = setup();

      // 2 passed, 1 of which was false pass (task failed)
      trackGateEffectiveness(db, 'verification', true, 'success');
      trackGateEffectiveness(db, 'verification', true, 'failure');

      const metrics = getEffectivenessMetrics(db, 'verification');
      expect(metrics.falsePassRate).toBeCloseTo(0.5, 1);
    });

    it('should compute false block rate correctly', () => {
      const { db } = setup();

      // 2 blocked, 1 of which was false block (task succeeded anyway)
      trackGateEffectiveness(db, 'output_quality', false, 'failure');
      trackGateEffectiveness(db, 'output_quality', false, 'success');

      const metrics = getEffectivenessMetrics(db, 'output_quality');
      expect(metrics.falseBlockRate).toBeCloseTo(0.5, 1);
    });

    it('should suggest tightening when false pass rate is high', () => {
      const suggestion = suggestAdjustment({
        passRate: 0.8,
        falsePassRate: 0.3,
        falseBlockRate: 0.1,
        total: 20,
      });
      expect(suggestion.action).toBe('tighten');
    });

    it('should suggest relaxing when false block rate is high', () => {
      const suggestion = suggestAdjustment({
        passRate: 0.3,
        falsePassRate: 0.05,
        falseBlockRate: 0.4,
        total: 20,
      });
      expect(suggestion.action).toBe('relax');
    });

    it('should suggest none when metrics are acceptable', () => {
      const suggestion = suggestAdjustment({
        passRate: 0.7,
        falsePassRate: 0.1,
        falseBlockRate: 0.1,
        total: 20,
      });
      expect(suggestion.action).toBe('none');
    });

    it('should suggest none with insufficient data', () => {
      const suggestion = suggestAdjustment({
        passRate: 0.5,
        falsePassRate: 0.5,
        falseBlockRate: 0.5,
        total: 5,
      });
      expect(suggestion.action).toBe('none');
      expect(suggestion.rationale).toContain('Insufficient');
    });

    it('should return empty metrics for unknown gate type', () => {
      const { db } = setup();
      const metrics = getEffectivenessMetrics(db, 'readiness');
      expect(metrics.total).toBe(0);
      expect(metrics.passRate).toBe(0);
    });

    it('should aggregate cross-subsystem effectiveness', () => {
      const { db } = setup();

      trackGateEffectiveness(db, 'readiness', true, 'success');
      trackGateEffectiveness(db, 'verification', true, 'failure');

      const cross = getCrossSubsystemEffectiveness(db);
      expect(cross.overall.total).toBe(2);
      expect(cross.readiness.total).toBe(1);
      expect(cross.verification.total).toBe(1);
    });
  });

  // ==========================================================================
  // Predictive Failure
  // ==========================================================================

  describe('Predictive Failure', () => {
    it('should return empty predictions with no learning events', () => {
      const { db } = setup();
      const result = predictFailureModes(db, 'deploy authentication module');
      expect(result.predictions).toHaveLength(0);
    });

    it('should return empty predictions for empty task description', () => {
      const { db } = setup();
      const result = predictFailureModes(db, '');
      expect(result.predictions).toHaveLength(0);
    });

    it('should format empty predictions as empty string', () => {
      const guidance = getPreventiveGuidance([]);
      expect(guidance).toBe('');
    });

    it('should format predictions as markdown', () => {
      const guidance = getPreventiveGuidance([
        {
          failureClass: 'planning',
          likelihood: 0.6,
          evidence: 'Similar tasks failed at planning',
          prevention: 'Create detailed plan first',
        },
      ]);
      expect(guidance).toContain('Predicted Failure Modes');
      expect(guidance).toContain('planning');
      expect(guidance).toContain('60%');
      expect(guidance).toContain('Prevention');
    });

    it('should predict based on similar past failures', () => {
      const { db } = setup();

      // Create a memory for the learning event
      const memId = generateId();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO memories (id, type, title, content, scope, sensitivity, tags, confidence, source, signature, created_at, updated_at, last_accessed_at)
        VALUES (?, 'lesson', 'Test', ?, 'project', 'INTERNAL', '[]', 0.5, 'test', 'sig', ?, ?, ?)
      `).run(memId, 'deploy authentication module failed because planning was insufficient', now, now, now);

      // Create learning event linked to this memory
      db.prepare(`
        INSERT INTO learning_events (id, memory_id, trigger_type, failure_class, root_cause, prevention_rule, confidence, created_at)
        VALUES (?, ?, 'eval_failure', 'missing_context', 'Insufficient planning', 'Plan thoroughly', 0.8, ?)
      `).run(generateId(), memId, now);

      // Predict for similar task — 'missing_context' maps to cognitive 'context_assembly'
      const result = predictFailureModes(db, 'deploy authentication module');
      // DB-level 'missing_context' maps to cognitive 'context_assembly'
      expect(result.predictions.length).toBeGreaterThanOrEqual(1);
      if (result.predictions.length > 0) {
        expect(result.predictions[0].failureClass).toBe('context_assembly');
      }
    });
  });

  // ==========================================================================
  // Active Learning Orchestrator
  // ==========================================================================

  describe('Active Learning Orchestrator', () => {
    it('should process learning event and write to contexts', () => {
      const { db } = setup();

      const result = processLearningEvent(db, {
        trigger: 'eval_failure',
        description: 'Missing context — forgot to load relevant project info',
        rootCause: 'Context engine did not load project-specific state',
        preventionRule: 'Always load project context before execution',
        failureClass: 'context_assembly',
        phase: 'recall',
      }, sign);

      expect(result.contextsUpdated).toContain('failure_patterns');
      expect(result.contextsUpdated).toContain('lessons_learned');
    });

    it('should classify with provided class when classifier is low confidence', () => {
      const { db } = setup();

      const result = processLearningEvent(db, {
        trigger: 'manual',
        description: 'Something vague happened',
        rootCause: 'Unknown',
        preventionRule: 'Be more careful',
        failureClass: 'tool_use',
        phase: 'execute',
      }, sign);

      // Classifier will have low confidence on vague description, so provided class is used
      expect(result.classified).toBe('tool_use');
    });

    it('should not update expert when no expertId provided', () => {
      const { db } = setup();

      const result = processLearningEvent(db, {
        trigger: 'eval_failure',
        description: 'Plan was wrong, missed crucial step in deployment',
        rootCause: 'Incomplete analysis',
        preventionRule: 'Review all dependencies',
        failureClass: 'planning',
        phase: 'plan',
      }, sign);

      expect(result.expertUpdated).toBe(false);
    });

    it('should update expert when expertId provided', () => {
      const { db } = setup();
      seedBuiltInExperts(db, sign);

      const expert = db.prepare<[], { id: string }>(
        'SELECT id FROM experts LIMIT 1',
      ).get();

      if (expert) {
        const result = processLearningEvent(db, {
          trigger: 'eval_failure',
          description: 'Plan was wrong, missed key step in the approach',
          rootCause: 'Expert guidance was insufficient',
          preventionRule: 'Validate expert guidance against requirements',
          failureClass: 'planning',
          phase: 'plan',
          expertId: expert.id,
        }, sign);

        expect(result.expertUpdated).toBe(true);
      }
    });

    it('should update capsule when capsuleId provided', () => {
      const { db } = setup();

      const capsule = insertCapsule(db, {
        name: 'test-learning-capsule',
        display_name: 'Test Learning Capsule',
        description: 'For testing active learning',
        trigger_patterns: ['test'],
      }, sign);

      const result = processLearningEvent(db, {
        trigger: 'eval_failure',
        description: 'API contract was wrong, endpoint schema mismatch',
        rootCause: 'Schema validation was skipped',
        preventionRule: 'Validate all API schemas before deployment',
        failureClass: 'api_contract',
        phase: 'verify',
        capsuleId: capsule.id,
      }, sign);

      expect(result.capsuleUpdated).toBe(true);
    });

    it('should record gate evaluation', () => {
      const { db } = setup();

      recordGateEvaluation(db, 'readiness', true, 'success');
      recordGateEvaluation(db, 'readiness', false, 'failure');

      const metrics = getEffectivenessMetrics(db, 'readiness');
      expect(metrics.total).toBe(2);
    });

    it('should write rule when repeated failures exist', () => {
      const { db } = setup();
      const now = new Date().toISOString();

      // Seed 4 similar failures for planning
      for (let i = 0; i < 4; i++) {
        db.prepare(`
          INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, evidence, created_at)
          VALUES (?, 'gate', 'test', ?, 'failure', ?, ?)
        `).run(generateId(), 'deploy authentication module plan was wrong', 'planning', now);
      }

      const result = processLearningEvent(db, {
        trigger: 'repeated_failure',
        description: 'deploy authentication module plan was wrong again',
        rootCause: 'Incomplete dependency analysis',
        preventionRule: 'Analyze all dependencies before planning',
        failureClass: 'planning',
        phase: 'plan',
      }, sign);

      expect(result.ruleAction).toBe('new_rule');
    });
  });
});
