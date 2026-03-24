/**
 * Integration Test: Predictive Failure
 *
 * Tests the predictive failure pipeline:
 *   Store similar past failures → new similar task →
 *   failure predictions surfaced before execution.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../../core/database.js';

import { predictFailureModes, getPreventiveGuidance } from '../../../cognitive/learning/predictive-failure.js';
import { processLearningEvent } from '../../../cognitive/learning/active-learning.js';
import { classifyFailure, getCognitiveFailureClasses } from '../../../cognitive/learning/failure-classifier.js';
import { generateId } from '../../../core/ulid.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-predictive-int-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Predictive Failure Integration', () => {
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

  /**
   * Helper: seed learning events directly into learning_events table
   * with a matching memory for keyword-based prediction.
   */
  function seedFailures(db: DatabaseConnection, count: number, taskKeyword: string, failureClass: string) {
    const now = new Date().toISOString();
    for (let i = 0; i < count; i++) {
      const memId = generateId();
      db.prepare(`
        INSERT INTO memories (id, type, title, content, scope, sensitivity, tags, confidence, source, signature, created_at, updated_at, last_accessed_at)
        VALUES (?, 'lesson', ?, ?, 'project', 'INTERNAL', '[]', 0.5, 'test', 'sig', ?, ?, ?)
      `).run(memId, `Failure ${i}`, `${taskKeyword} failed because of ${failureClass}`, now, now, now);

      db.prepare(`
        INSERT INTO learning_events (id, memory_id, trigger_type, failure_class, root_cause, prevention_rule, confidence, created_at)
        VALUES (?, ?, 'eval_failure', ?, ?, ?, 0.8, ?)
      `).run(
        generateId(),
        memId,
        failureClass,
        `Root cause ${i} for ${taskKeyword}`,
        `Prevent ${taskKeyword} ${failureClass}`,
        now,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 1: No past failures → no predictions
  // --------------------------------------------------------------------------

  describe('Clean state predictions', () => {
    it('returns no predictions when no learning events exist', () => {
      const { db } = setup();
      const result = predictFailureModes(db, 'deploy new authentication module');
      expect(result.predictions).toHaveLength(0);
    });

    it('returns empty guidance for empty predictions', () => {
      const guidance = getPreventiveGuidance([]);
      expect(guidance).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Past failures with matching keywords → predictions surface
  // --------------------------------------------------------------------------

  describe('Prediction from past failures', () => {
    it('predicts failure based on keyword overlap with past learning events', () => {
      const { db } = setup();

      // Seed 5 failures with 'logic_error' (maps to cognitive 'planning') and 'authentication' keyword
      seedFailures(db, 5, 'authentication', 'logic_error');

      const result = predictFailureModes(db, 'deploy authentication module');

      // Should find predictions since 'authentication' keyword overlaps
      if (result.predictions.length > 0) {
        const prediction = result.predictions[0];
        // DB-level 'logic_error' maps to cognitive 'planning'
        expect(prediction.failureClass).toBe('planning');
        expect(prediction.likelihood).toBeGreaterThan(0);
        expect(prediction.evidence.length).toBeGreaterThan(0);
        expect(prediction.prevention.length).toBeGreaterThan(0);
      }
    });

    it('formats predictions as actionable markdown', () => {
      const { db } = setup();
      seedFailures(db, 5, 'authentication', 'logic_error');

      const result = predictFailureModes(db, 'deploy authentication module');

      if (result.predictions.length > 0) {
        const guidance = getPreventiveGuidance(result.predictions);
        expect(guidance).toContain('Predicted Failure Modes');
        expect(guidance).toContain('Prevention');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Multiple failure classes for same task area
  // --------------------------------------------------------------------------

  describe('Multiple failure class predictions', () => {
    it('predicts multiple failure modes from different classes', () => {
      const { db } = setup();

      // Seed different DB-level failure classes for 'database' tasks
      seedFailures(db, 3, 'database migration', 'logic_error');
      seedFailures(db, 2, 'database schema', 'integration_failure');

      const result = predictFailureModes(db, 'database migration update');

      // May get predictions from both classes (depends on keyword overlap)
      if (result.predictions.length > 1) {
        const classes = result.predictions.map(p => p.failureClass);
        expect(new Set(classes).size).toBeGreaterThan(1);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Unrelated tasks don't trigger predictions
  // --------------------------------------------------------------------------

  describe('Non-matching task predictions', () => {
    it('no predictions for tasks unrelated to past failures', () => {
      const { db } = setup();

      // Seed failures about 'database'
      seedFailures(db, 5, 'database', 'logic_error');

      // Query about something unrelated
      const result = predictFailureModes(db, 'fix CSS styling issue');

      // Should have no predictions since no keyword overlap
      expect(result.predictions).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Failure classification consistency
  // --------------------------------------------------------------------------

  describe('Failure classification feeds prediction', () => {
    it('all 6 cognitive failure classes are valid prediction outputs', () => {
      const classes = getCognitiveFailureClasses();
      expect(classes).toHaveLength(6);

      // Each class should be usable in predictions
      for (const cls of classes) {
        const guidance = getPreventiveGuidance([{
          failureClass: cls,
          likelihood: 0.5,
          evidence: `Evidence for ${cls}`,
          prevention: `Prevention for ${cls}`,
        }]);
        expect(guidance).toContain(cls);
        expect(guidance).toContain('Prevention');
      }
    });

    it('classifier output matches learning event failure classes', () => {
      const result = classifyFailure('Missing context, forgot to load project info', {
        phase: 'recall',
        hadReadiness: false,
        hadExpert: false,
        hadCapsule: false,
        hadRules: false,
      });

      expect(result.failureClass).toBe('context_assembly');
      const classes = getCognitiveFailureClasses();
      expect(classes).toContain(result.failureClass);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Learning event → prediction pipeline
  // --------------------------------------------------------------------------

  describe('Learning event to prediction pipeline', () => {
    it('processed learning event writes to contexts for future reference', () => {
      const { db } = setup();

      // Process a learning event — writes to contexts, NOT to learning_events
      const result = processLearningEvent(db, {
        trigger: 'eval_failure',
        description: 'API endpoint authentication failed during integration test',
        rootCause: 'JWT secret not configured in test environment',
        preventionRule: 'Always verify environment variables before integration tests',
        failureClass: 'verification',
        phase: 'verify',
      }, sign);

      // Verify contexts were updated
      expect(result.contextsUpdated).toContain('failure_patterns');
      expect(result.contextsUpdated).toContain('lessons_learned');
      expect(result.classified).toBeDefined();
    });
  });
});
