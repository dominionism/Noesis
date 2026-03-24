/**
 * Tests for Meta-Reasoner
 */

import { describe, it, expect } from 'vitest';
import {
  monitorProgress,
  shouldSwitchStrategy,
  calibrateConfidence,
  checkResourceEfficiency,
  monitorLearning,
  analyze,
  type ProgressState,
  type ConfidenceRecord,
} from '../../intelligence/meta-reasoner.js';

describe('monitorProgress', () => {
  it('returns null when progress is on track', () => {
    const state: ProgressState = {
      stepsCompleted: 5,
      stepsTotal: 10,
      timeElapsedMs: 50000,
      timeEstimatedMs: 100000,
      failedSteps: 0,
    };
    expect(monitorProgress(state)).toBeNull();
  });

  it('detects stuck state: <30% progress at 50%+ time', () => {
    const state: ProgressState = {
      stepsCompleted: 2,
      stepsTotal: 10,
      timeElapsedMs: 60000,
      timeEstimatedMs: 100000,
      failedSteps: 1,
    };
    const signal = monitorProgress(state);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('stuck_detected');
  });

  it('returns null for empty task', () => {
    const state: ProgressState = {
      stepsCompleted: 0,
      stepsTotal: 0,
      timeElapsedMs: 0,
      timeEstimatedMs: 0,
      failedSteps: 0,
    };
    expect(monitorProgress(state)).toBeNull();
  });

  it('allows slow start (< 50% time)', () => {
    const state: ProgressState = {
      stepsCompleted: 1,
      stepsTotal: 10,
      timeElapsedMs: 20000,
      timeEstimatedMs: 100000,
      failedSteps: 0,
    };
    expect(monitorProgress(state)).toBeNull();
  });
});

describe('shouldSwitchStrategy', () => {
  it('returns null with fewer than 2 failed steps', () => {
    expect(shouldSwitchStrategy(0.5, 0.8, 1)).toBeNull();
  });

  it('returns null when score gap is too small', () => {
    expect(shouldSwitchStrategy(0.5, 0.6, 3)).toBeNull();
  });

  it('recommends switch with 2+ failures and >20% score gap', () => {
    const signal = shouldSwitchStrategy(0.4, 0.7, 3);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('strategy_switch_recommended');
  });
});

describe('calibrateConfidence', () => {
  it('returns factor 1.0 with insufficient samples', () => {
    const records: ConfidenceRecord[] = [
      { predicted: 0.8, actual: true, timestamp: '' },
    ];
    const result = calibrateConfidence(records);
    expect(result.factor).toBe(1.0);
    expect(result.signal).toBeNull();
  });

  it('detects overconfidence', () => {
    const records: ConfidenceRecord[] = Array.from({ length: 10 }, () => ({
      predicted: 0.9,
      actual: false,
      timestamp: '',
    }));
    // avg predicted = 0.9, avg actual = 0
    const result = calibrateConfidence(records);
    expect(result.signal).not.toBeNull();
    expect(result.signal!.type).toBe('overconfident');
    expect(result.factor).toBeLessThan(1.0);
  });

  it('detects underconfidence', () => {
    const records: ConfidenceRecord[] = Array.from({ length: 10 }, () => ({
      predicted: 0.3,
      actual: true,
      timestamp: '',
    }));
    // avg predicted = 0.3, avg actual = 1.0
    const result = calibrateConfidence(records);
    expect(result.signal).not.toBeNull();
    expect(result.signal!.type).toBe('underconfident');
    expect(result.factor).toBeGreaterThan(1.0);
  });

  it('returns no signal when well-calibrated', () => {
    const records: ConfidenceRecord[] = Array.from({ length: 10 }, (_, i) => ({
      predicted: 0.7,
      actual: i < 7,
      timestamp: '',
    }));
    const result = calibrateConfidence(records);
    expect(result.signal).toBeNull();
  });

  it('clamps factor between 0.5 and 2.0', () => {
    const records: ConfidenceRecord[] = Array.from({ length: 10 }, () => ({
      predicted: 0.01,
      actual: true,
      timestamp: '',
    }));
    const result = calibrateConfidence(records);
    expect(result.factor).toBeLessThanOrEqual(2.0);
  });
});

describe('checkResourceEfficiency', () => {
  it('returns null when hit rate is acceptable', () => {
    expect(checkResourceEfficiency({
      tokensInjected: 5000,
      tokensBudget: 10000,
      retrievalHits: 8,
      retrievalTotal: 10,
    })).toBeNull();
  });

  it('detects resource waste with low hit rate and high utilization', () => {
    const signal = checkResourceEfficiency({
      tokensInjected: 8000,
      tokensBudget: 10000,
      retrievalHits: 1,
      retrievalTotal: 10,
    });
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('resource_waste');
  });

  it('returns null with no retrievals', () => {
    expect(checkResourceEfficiency({
      tokensInjected: 5000,
      tokensBudget: 10000,
      retrievalHits: 0,
      retrievalTotal: 0,
    })).toBeNull();
  });
});

describe('monitorLearning', () => {
  it('returns null when learning is effective', () => {
    expect(monitorLearning({
      repeatFailureRate: 0.1,
      skillAdoptionRate: 0.6,
      predictionAccuracy: 0.7,
      correctionRate: 0.2,
    })).toBeNull();
  });

  it('detects learning plateau', () => {
    const signal = monitorLearning({
      repeatFailureRate: 0.4,
      skillAdoptionRate: 0.3,
      predictionAccuracy: 0.5,
      correctionRate: 0.5,
    });
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('learning_plateau');
  });
});

describe('analyze', () => {
  it('returns healthy when no signals', () => {
    const result = analyze({});
    expect(result.isHealthy).toBe(true);
    expect(result.signals).toHaveLength(0);
    expect(result.calibrationFactor).toBe(1.0);
  });

  it('aggregates signals from multiple sources', () => {
    const result = analyze({
      progress: {
        stepsCompleted: 1,
        stepsTotal: 10,
        timeElapsedMs: 80000,
        timeEstimatedMs: 100000,
        failedSteps: 3,
      },
      currentStrategyScore: 0.3,
      alternativeStrategyScore: 0.7,
      learningMetrics: {
        repeatFailureRate: 0.4,
        skillAdoptionRate: 0.3,
        predictionAccuracy: 0.5,
        correctionRate: 0.5,
      },
    });

    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.isHealthy).toBe(false);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
