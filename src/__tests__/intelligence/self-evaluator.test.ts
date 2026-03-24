/**
 * Tests for Self-Evaluator
 */

import { describe, it, expect } from 'vitest';
import {
  evaluate,
  quickEvaluate,
  getSchedule,
  isDimensionPassing,
  type EvaluationInput,
} from '../../intelligence/self-evaluator.js';

function makeInput(overrides?: Partial<EvaluationInput>): EvaluationInput {
  return {
    helpfulRetrievals: 8,
    totalRetrievals: 10,
    repeatFailures: 1,
    totalFailures: 10,
    skillsApplied: 6,
    skillsRetrieved: 10,
    correctPredictions: 7,
    totalPredictions: 10,
    corrections: 2,
    totalTasks: 10,
    ...overrides,
  };
}

describe('evaluate', () => {
  it('returns healthy when all dimensions pass', () => {
    const result = evaluate(makeInput());
    expect(result.overallHealth).toBe('healthy');
    expect(result.passCount).toBe(5);
    expect(result.recommendations).toHaveLength(0);
  });

  it('returns degraded when 3-4 dimensions pass', () => {
    const result = evaluate(makeInput({
      helpfulRetrievals: 3,  // 0.3, below 0.7
      totalRetrievals: 10,
      repeatFailures: 5,    // 0.5, above 0.2
      totalFailures: 10,
    }));

    expect(result.overallHealth).toBe('degraded');
    expect(result.passCount).toBe(3);
  });

  it('returns critical when fewer than 3 dimensions pass', () => {
    const result = evaluate(makeInput({
      helpfulRetrievals: 2,
      totalRetrievals: 10,
      repeatFailures: 5,
      totalFailures: 10,
      skillsApplied: 2,
      skillsRetrieved: 10,
      correctPredictions: 3,
      totalPredictions: 10,
      corrections: 5,
      totalTasks: 10,
    }));

    expect(result.overallHealth).toBe('critical');
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('includes dimension details', () => {
    const result = evaluate(makeInput());
    expect(result.dimensions).toHaveLength(5);

    const names = result.dimensions.map((d) => d.name);
    expect(names).toContain('Retrieval Quality');
    expect(names).toContain('Learning Effectiveness');
    expect(names).toContain('Skill Adoption');
    expect(names).toContain('Prediction Accuracy');
    expect(names).toContain('User Satisfaction Proxy');
  });

  it('provides actions for failing dimensions', () => {
    const result = evaluate(makeInput({
      helpfulRetrievals: 2,
      totalRetrievals: 10,
    }));

    const failingDim = result.dimensions.find((d) => d.name === 'Retrieval Quality');
    expect(failingDim!.passing).toBe(false);
    expect(failingDim!.action).not.toBeNull();
  });

  it('handles zero denominators gracefully', () => {
    const result = evaluate(makeInput({
      totalRetrievals: 0,
      totalFailures: 0,
      skillsRetrieved: 0,
      totalPredictions: 0,
      totalTasks: 0,
    }));

    // Should not throw, defaults should be used
    expect(result.dimensions).toHaveLength(5);
    expect(result.overallHealth).toBe('healthy');
  });
});

describe('quickEvaluate', () => {
  it('passes with good metrics', () => {
    const result = quickEvaluate({
      helpfulRetrievals: 8,
      totalRetrievals: 10,
      corrections: 1,
      totalTasks: 10,
    });

    expect(result.passing).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects low retrieval precision', () => {
    const result = quickEvaluate({
      helpfulRetrievals: 2,
      totalRetrievals: 10,
      corrections: 0,
      totalTasks: 10,
    });

    expect(result.passing).toBe(false);
    expect(result.issues[0]).toContain('retrieval precision');
  });

  it('detects high correction rate', () => {
    const result = quickEvaluate({
      helpfulRetrievals: 8,
      totalRetrievals: 10,
      corrections: 5,
      totalTasks: 10,
    });

    expect(result.passing).toBe(false);
    expect(result.issues[0]).toContain('correction rate');
  });
});

describe('getSchedule', () => {
  it('returns weekly when no weekly eval exists', () => {
    expect(getSchedule(null, null)).toBe('weekly');
  });

  it('returns daily when weekly is recent but no daily eval', () => {
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const schedule = getSchedule(null, recent);
    expect(schedule).toBe('daily');
  });

  it('returns per_session when both daily and weekly are recent', () => {
    const now = new Date().toISOString();
    expect(getSchedule(now, now)).toBe('per_session');
  });
});

describe('isDimensionPassing', () => {
  it('higher_is_better: passes when metric >= target', () => {
    expect(isDimensionPassing(0.8, 0.7, 'higher_is_better')).toBe(true);
    expect(isDimensionPassing(0.5, 0.7, 'higher_is_better')).toBe(false);
  });

  it('lower_is_better: passes when metric <= target', () => {
    expect(isDimensionPassing(0.1, 0.2, 'lower_is_better')).toBe(true);
    expect(isDimensionPassing(0.3, 0.2, 'lower_is_better')).toBe(false);
  });
});
