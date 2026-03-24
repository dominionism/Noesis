/**
 * Tests for Model Router
 */

import { describe, it, expect } from 'vitest';
import {
  routeOperation,
  getDefaultTier,
  getComplexity,
  getTierConfig,
  recordRoutingOutcome,
  getRoutingOutcomes,
  computeRoutingStats,
  estimateCost,
  type RoutingOutcome,
} from '../../intelligence/model-router.js';

describe('getDefaultTier', () => {
  it('routes high-complexity operations to tier1', () => {
    expect(getDefaultTier('skill_synthesis')).toBe('tier1');
    expect(getDefaultTier('antipattern_synthesis')).toBe('tier1');
    expect(getDefaultTier('strategy_simulation')).toBe('tier1');
    expect(getDefaultTier('critique_blocking')).toBe('tier1');
  });

  it('routes medium-complexity operations to tier2', () => {
    expect(getDefaultTier('knowledge_distillation')).toBe('tier2');
    expect(getDefaultTier('prompt_optimization')).toBe('tier2');
    expect(getDefaultTier('plan_decomposition')).toBe('tier2');
    expect(getDefaultTier('critique_advisory')).toBe('tier2');
  });

  it('routes low-complexity operations to tier3', () => {
    expect(getDefaultTier('content_classification')).toBe('tier3');
  });
});

describe('getComplexity', () => {
  it('returns highest complexity for synthesis operations', () => {
    expect(getComplexity('skill_synthesis')).toBeGreaterThan(0.8);
    expect(getComplexity('antipattern_synthesis')).toBeGreaterThan(0.8);
  });

  it('returns lowest complexity for classification', () => {
    expect(getComplexity('content_classification')).toBeLessThan(0.3);
  });
});

describe('routeOperation', () => {
  it('routes to default tier without history', () => {
    const decision = routeOperation('skill_synthesis');
    expect(decision.selectedTier).toBe('tier1');
    expect(decision.confidence).toBe(0.7);
    expect(decision.reasoning).toContain('Default routing');
  });

  it('uses historical data when sufficient samples exist', () => {
    const history: RoutingOutcome[] = Array.from({ length: 5 }, () => ({
      operation: 'prompt_optimization' as const,
      tier: 'tier3' as const,
      qualityScore: 0.8,
      tokensCost: 10,
      durationMs: 500,
      timestamp: new Date().toISOString(),
    }));

    const decision = routeOperation('prompt_optimization', undefined, history);
    // Should learn from history and possibly route to tier3
    expect(decision.reasoning).toContain('Historical data');
  });

  it('sticks with default when history is insufficient', () => {
    const history: RoutingOutcome[] = [{
      operation: 'skill_synthesis',
      tier: 'tier3',
      qualityScore: 0.9,
      tokensCost: 5,
      durationMs: 200,
      timestamp: new Date().toISOString(),
    }];

    const decision = routeOperation('skill_synthesis', undefined, history);
    expect(decision.reasoning).toContain('Default');
  });

  it('returns correct model name from config', () => {
    const decision = routeOperation('content_classification');
    expect(decision.selectedModel).toContain('haiku');
  });
});

describe('getTierConfig', () => {
  it('returns tier1 config', () => {
    const config = getTierConfig('tier1');
    expect(config.model).toContain('opus');
    expect(config.maxTokensPerCall).toBe(4096);
  });

  it('returns tier3 config', () => {
    const config = getTierConfig('tier3');
    expect(config.model).toContain('haiku');
    expect(config.maxTokensPerCall).toBe(1024);
  });
});

describe('recordRoutingOutcome / getRoutingOutcomes', () => {
  it('stores and retrieves outcomes', () => {
    const initial = getRoutingOutcomes().length;

    recordRoutingOutcome({
      operation: 'plan_decomposition',
      tier: 'tier2',
      qualityScore: 0.85,
      tokensCost: 500,
      durationMs: 2000,
      timestamp: new Date().toISOString(),
    });

    expect(getRoutingOutcomes().length).toBe(initial + 1);
  });

  it('returns a copy', () => {
    const outcomes = getRoutingOutcomes();
    const len = outcomes.length;
    outcomes.length = 0;
    expect(getRoutingOutcomes().length).toBe(len);
  });
});

describe('computeRoutingStats', () => {
  it('groups by operation and tier', () => {
    const history: RoutingOutcome[] = [
      { operation: 'skill_synthesis', tier: 'tier1', qualityScore: 0.9, tokensCost: 100, durationMs: 1000, timestamp: '' },
      { operation: 'skill_synthesis', tier: 'tier1', qualityScore: 0.8, tokensCost: 120, durationMs: 1200, timestamp: '' },
      { operation: 'content_classification', tier: 'tier3', qualityScore: 0.7, tokensCost: 10, durationMs: 100, timestamp: '' },
    ];

    const stats = computeRoutingStats(history);
    expect(stats).toHaveLength(2);

    const skillStats = stats.find((s) => s.operation === 'skill_synthesis')!;
    expect(skillStats.sampleCount).toBe(2);
    expect(skillStats.avgQuality).toBeCloseTo(0.85, 2);
    expect(skillStats.avgCost).toBeCloseTo(110, 0);
  });

  it('returns empty for no history', () => {
    expect(computeRoutingStats([])).toHaveLength(0);
  });
});

describe('estimateCost', () => {
  it('estimates cost based on tier pricing', () => {
    const result = estimateCost('content_classification', 1000);
    expect(result.tier).toBe('tier3');
    expect(result.estimatedCost).toBeGreaterThan(0);
    expect(result.estimatedCost).toBeLessThan(1);
  });

  it('tier1 costs more than tier3', () => {
    const t1 = estimateCost('skill_synthesis', 1000);
    const t3 = estimateCost('content_classification', 1000);
    expect(t1.estimatedCost).toBeGreaterThan(t3.estimatedCost);
  });
});
