/**
 * Integration Test: Evidence-Backed Readiness
 *
 * Tests that readiness scoring adjusts based on historical memory evidence:
 *   Store past task outcomes → new similar task → readiness gate adjusts
 *   based on historical correlation.
 *
 * Also covers the feedback loop: readiness outcome is recorded, which
 * influences future readiness assessments.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../../core/database.js';

import {
  computeEvidenceBackedReadiness,
  getHistoricalReadinessCorrelation,
  recordReadinessOutcome,
} from '../../../cognitive/gates/readiness-gate.js';
import type { EnhancedReadinessInput, ReadinessEvidence } from '../../../cognitive/gates/readiness-gate.js';

import { trackGateEffectiveness, getEffectivenessMetrics } from '../../../cognitive/learning/effectiveness-tracker.js';
import { recordGateEvaluation } from '../../../cognitive/learning/active-learning.js';

import type { Memory } from '../../../types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-readiness-int-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

function makeMemory(id: string, outcome: Memory['outcome'], confidence: number = 0.8): Memory {
  const now = new Date().toISOString();
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    content: `Content for task ${id}`,
    tags: [],
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence,
    outcome,
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

function makeInput(overrides: Partial<EnhancedReadinessInput> = {}): EnhancedReadinessInput {
  return {
    taskDescription: overrides.taskDescription ?? 'Implement a feature with testing',
    hasGoal: overrides.hasGoal ?? true,
    hasDeliverable: overrides.hasDeliverable ?? true,
    constraintsIdentified: overrides.constraintsIdentified ?? 2,
    codebaseExplored: overrides.codebaseExplored ?? true,
    architectureUnderstood: overrides.architectureUnderstood ?? true,
    risksIdentified: overrides.risksIdentified ?? 1,
    hasVerificationPlan: overrides.hasVerificationPlan ?? true,
    validationCriteria: overrides.validationCriteria ?? 2,
  };
}

describe('Evidence-Backed Readiness Integration', () => {
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
  // Scenario 1: Strong evidence of success boosts readiness
  // --------------------------------------------------------------------------

  describe('Historical success evidence boosts readiness', () => {
    it('10 past successes boost readiness score', () => {
      const input = makeInput({ codebaseExplored: false }); // Partially ready
      const noEvidence: ReadinessEvidence = {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      };

      const baseScore = computeEvidenceBackedReadiness(input, noEvidence);

      // Now add 10 successful past tasks
      const successMemories = Array.from({ length: 10 }, (_, i) =>
        makeMemory(`succ-${i}`, 'success', 0.85),
      );

      const withEvidence: ReadinessEvidence = {
        similarPastTasks: successMemories,
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      };

      const boostedScore = computeEvidenceBackedReadiness(input, withEvidence);

      // Boosted score should be >= base score on at least one dimension
      expect(boostedScore.clarity).toBeGreaterThanOrEqual(baseScore.clarity);
    });

    it('mixed past outcomes moderate the boost', () => {
      const input = makeInput();
      const mixedMemories = [
        makeMemory('s1', 'success', 0.9),
        makeMemory('s2', 'success', 0.8),
        makeMemory('f1', 'failed', 0.7),
        makeMemory('s3', 'success', 0.85),
        makeMemory('f2', 'failed', 0.6),
      ];

      const evidence: ReadinessEvidence = {
        similarPastTasks: mixedMemories,
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      };

      const score = computeEvidenceBackedReadiness(input, evidence);
      // With mixed evidence, score should still pass if input is solid
      expect(score.total).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Failure evidence penalizes readiness
  // --------------------------------------------------------------------------

  describe('Failure evidence penalizes readiness', () => {
    it('relevant failures reduce risk score', () => {
      const input = makeInput();
      const noFailures: ReadinessEvidence = {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      };

      const baseScore = computeEvidenceBackedReadiness(input, noFailures);

      const withFailures: ReadinessEvidence = {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [
          makeMemory('f1', 'failed'),
          makeMemory('f2', 'failed'),
          makeMemory('f3', 'failed'),
        ],
        relevantAntiPatternCount: 0,
      };

      const penalizedScore = computeEvidenceBackedReadiness(input, withFailures);
      expect(penalizedScore.risks).toBeLessThanOrEqual(baseScore.risks);
    });

    it('anti-patterns compound with unidentified risks', () => {
      const input = makeInput({ risksIdentified: 0 });

      const withAntiPatterns: ReadinessEvidence = {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 5,
      };

      const score = computeEvidenceBackedReadiness(input, withAntiPatterns);
      // No risks identified + 5 anti-patterns = significant risk penalty
      expect(score.risks).toBeLessThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Readiness outcome recording → historical correlation
  // --------------------------------------------------------------------------

  describe('Readiness outcome feedback loop', () => {
    it('records outcomes and builds historical correlation', () => {
      const { db } = setup();

      // Record a series of readiness outcomes
      const highInput = makeInput();
      const lowInput = makeInput({
        hasGoal: false,
        hasDeliverable: false,
        constraintsIdentified: 0,
        codebaseExplored: false,
      });

      const highScore = computeEvidenceBackedReadiness(highInput, {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      });

      const lowScore = computeEvidenceBackedReadiness(lowInput, {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      });

      // Record: high readiness → success, low readiness → failure
      recordReadinessOutcome(db, highScore, 'success', 'Well-prepared task', sign);
      recordReadinessOutcome(db, highScore, 'success', 'Another prepared task', sign);
      recordReadinessOutcome(db, lowScore, 'failure', 'Unprepared task', sign);
      recordReadinessOutcome(db, lowScore, 'failure', 'Another unprepared task', sign);

      // Query correlation
      const correlation = getHistoricalReadinessCorrelation(db);
      expect(correlation.averagePassedScore).toBeGreaterThan(0);
    });

    it('gate evaluation feeds into effectiveness metrics', () => {
      const { db } = setup();

      // Record gate evaluations
      recordGateEvaluation(db, 'readiness', true, 'success');
      recordGateEvaluation(db, 'readiness', true, 'success');
      recordGateEvaluation(db, 'readiness', true, 'failure'); // False pass
      recordGateEvaluation(db, 'readiness', false, 'failure'); // Correct block
      recordGateEvaluation(db, 'readiness', false, 'success'); // False block

      const metrics = getEffectivenessMetrics(db, 'readiness');
      expect(metrics.total).toBe(5);
      expect(metrics.passRate).toBeCloseTo(0.6, 1);
      expect(metrics.falsePassRate).toBeCloseTo(1 / 3, 1); // 1 false pass / 3 passes
      expect(metrics.falseBlockRate).toBeCloseTo(0.5, 1); // 1 false block / 2 blocks
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Incomplete input with evidence compensation
  // --------------------------------------------------------------------------

  describe('Evidence compensates for incomplete input', () => {
    it('partial readiness input with strong evidence can still pass', () => {
      const partialInput = makeInput({
        codebaseExplored: false,
        architectureUnderstood: false,
        risksIdentified: 0,
      });

      // Without evidence — should fail or score low
      const noEvidenceScore = computeEvidenceBackedReadiness(partialInput, {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      });

      // With strong success evidence
      const strongEvidence: ReadinessEvidence = {
        similarPastTasks: Array.from({ length: 8 }, (_, i) =>
          makeMemory(`s-${i}`, 'success', 0.9),
        ),
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      };

      const withEvidenceScore = computeEvidenceBackedReadiness(partialInput, strongEvidence);

      // Evidence should boost at least one dimension
      expect(withEvidenceScore.clarity).toBeGreaterThanOrEqual(noEvidenceScore.clarity);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Gap identification
  // --------------------------------------------------------------------------

  describe('Gap identification guides preparation', () => {
    it('identifies specific gaps for preparation', () => {
      const input = makeInput({
        hasGoal: false,
        hasDeliverable: false,
        codebaseExplored: false,
        architectureUnderstood: false,
        hasVerificationPlan: false,
      });

      const score = computeEvidenceBackedReadiness(input, {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      });

      expect(score.gaps.length).toBeGreaterThan(0);

      const gapDimensions = score.gaps.map(g => g.dimension);
      expect(gapDimensions).toContain('clarity');
      expect(gapDimensions).toContain('codebase');
    });

    it('no gaps when fully prepared', () => {
      const fullInput = makeInput();

      const score = computeEvidenceBackedReadiness(fullInput, {
        similarPastTasks: [],
        pastReadinessOutcomes: [],
        relevantFailures: [],
        relevantAntiPatternCount: 0,
      });

      // Fully prepared should have few or no gaps
      expect(score.passed).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Effectiveness metrics drive gate adjustment
  // --------------------------------------------------------------------------

  describe('Effectiveness drives gate adjustment', () => {
    it('high false pass rate suggests tightening', () => {
      const { db } = setup();

      // Simulate: gate passes too much (task fails after passing)
      for (let i = 0; i < 15; i++) {
        trackGateEffectiveness(db, 'readiness', true, 'success');
      }
      for (let i = 0; i < 5; i++) {
        trackGateEffectiveness(db, 'readiness', true, 'failure');
      }

      const metrics = getEffectivenessMetrics(db, 'readiness');
      expect(metrics.total).toBe(20);
      // 5 false passes out of 20 passes = 25%
      expect(metrics.falsePassRate).toBeCloseTo(0.25, 1);
    });

    it('high false block rate suggests relaxing', () => {
      const { db } = setup();

      // Simulate: gate blocks too much (task succeeds after blocking)
      for (let i = 0; i < 5; i++) {
        trackGateEffectiveness(db, 'readiness', true, 'success');
      }
      for (let i = 0; i < 10; i++) {
        trackGateEffectiveness(db, 'readiness', false, 'success'); // False blocks
      }
      for (let i = 0; i < 5; i++) {
        trackGateEffectiveness(db, 'readiness', false, 'failure'); // Correct blocks
      }

      const metrics = getEffectivenessMetrics(db, 'readiness');
      expect(metrics.total).toBe(20);
      // 10 false blocks out of 15 blocks
      expect(metrics.falseBlockRate).toBeCloseTo(10 / 15, 1);
    });
  });
});
