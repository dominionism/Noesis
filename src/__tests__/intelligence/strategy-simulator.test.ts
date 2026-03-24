/**
 * Tests for Strategy Simulation Layer
 *
 * Covers:
 * - calculateStrategyScore: formula verification
 * - simulateStrategy: skill boost, anti-pattern penalty, time/risk/prereq estimation
 * - generateStrategies: base strategies, skill-based, safe approach
 * - evaluateStrategies: sorting, recommendation, decision points
 * - recordOutcome / getOutcomes: outcome storage
 */

import { describe, it, expect } from 'vitest';
import {
  calculateStrategyScore,
  simulateStrategy,
  generateStrategies,
  evaluateStrategies,
  recordOutcome,
  getOutcomes,
  type Strategy,
  type StrategyMetrics,
  type SimulationInput,
} from '../../intelligence/strategy-simulator.js';
import type { SkillDefinition, AntiPatternDefinition, ScoredMemory } from '../../types.js';

// ===========================================================================
// Helpers
// ===========================================================================

function makeSkill(name: string, status: 'draft' | 'active' | 'archived' = 'active'): SkillDefinition {
  return {
    name,
    kind: 'skill',
    description: `Skill for ${name}`,
    trigger_pattern: name,
    steps: [{ description: 'Step 1' }, { description: 'Step 2' }],
    prerequisites: [],
    anti_patterns: [],
    validation_criteria: [],
    source_lessons: [],
    status,
    confidence: 0.8,
    successes: 5,
    failures: 1,
    last_used_at: null,
  };
}

function makeAntiPattern(name: string, triggerPattern: string, status: 'draft' | 'active' | 'archived' = 'active'): AntiPatternDefinition {
  return {
    name,
    kind: 'anti_pattern',
    description: `Anti-pattern ${name}`,
    trigger_pattern: triggerPattern,
    failure_mode: 'Something bad happens',
    correct_approach: 'Do it the right way',
    source_lessons: [],
    status,
    confidence: 0.7,
    successes: 0,
    failures: 3,
    last_used_at: null,
  };
}

function makeBaseInput(overrides?: Partial<SimulationInput>): SimulationInput {
  return {
    task: 'Build a caching layer for the API',
    constraints: [],
    skills: [],
    antiPatterns: [],
    pastTasks: [],
    ...overrides,
  };
}

function makeStrategy(overrides?: Partial<Strategy>): Strategy {
  return {
    id: 'test-strategy',
    name: 'Test Strategy',
    description: 'A test strategy',
    steps: [
      { description: 'Step 1', expectedOutcome: 'Done', riskFactors: [] },
      { description: 'Step 2', expectedOutcome: 'Done', riskFactors: ['risk'] },
    ],
    metrics: {
      successProbability: 0.7,
      expectedTimeMs: 300_000,
      riskFactor: 0.5,
      prerequisiteSatisfaction: 1.0,
      overallScore: 0,
    },
    ...overrides,
  };
}

// ===========================================================================
// calculateStrategyScore
// ===========================================================================

describe('calculateStrategyScore', () => {
  it('computes score using the documented formula', () => {
    const metrics: StrategyMetrics = {
      successProbability: 0.8,
      expectedTimeMs: 300_000,
      riskFactor: 0.2,
      prerequisiteSatisfaction: 0.9,
      overallScore: 0,
    };

    const score = calculateStrategyScore(metrics);
    // P(success) * (1 / (1 + time/300000)) * (1 - risk) * prerequisites
    // 0.8 * (1 / (1 + 1)) * (1 - 0.2) * 0.9
    // 0.8 * 0.5 * 0.8 * 0.9 = 0.288
    expect(score).toBeCloseTo(0.288, 3);
  });

  it('returns 0 when success probability is 0', () => {
    const metrics: StrategyMetrics = {
      successProbability: 0,
      expectedTimeMs: 100_000,
      riskFactor: 0,
      prerequisiteSatisfaction: 1,
      overallScore: 0,
    };

    expect(calculateStrategyScore(metrics)).toBe(0);
  });

  it('returns 0 when risk factor is 1', () => {
    const metrics: StrategyMetrics = {
      successProbability: 1,
      expectedTimeMs: 100_000,
      riskFactor: 1,
      prerequisiteSatisfaction: 1,
      overallScore: 0,
    };

    expect(calculateStrategyScore(metrics)).toBe(0);
  });

  it('penalizes longer expected time', () => {
    const fast: StrategyMetrics = {
      successProbability: 0.8,
      expectedTimeMs: 60_000,
      riskFactor: 0.1,
      prerequisiteSatisfaction: 1,
      overallScore: 0,
    };

    const slow: StrategyMetrics = {
      successProbability: 0.8,
      expectedTimeMs: 1_200_000,
      riskFactor: 0.1,
      prerequisiteSatisfaction: 1,
      overallScore: 0,
    };

    expect(calculateStrategyScore(fast)).toBeGreaterThan(calculateStrategyScore(slow));
  });
});

// ===========================================================================
// simulateStrategy
// ===========================================================================

describe('simulateStrategy', () => {
  it('starts with base success probability of 0.6', () => {
    const strategy = makeStrategy();
    const input = makeBaseInput();
    const metrics = simulateStrategy(strategy, input);

    expect(metrics.successProbability).toBeCloseTo(0.6, 1);
  });

  it('boosts success probability for matching skills', () => {
    const strategy = makeStrategy();
    const input = makeBaseInput({
      task: 'Build a caching layer',
      skills: [makeSkill('caching')],
    });

    const metrics = simulateStrategy(strategy, input);
    expect(metrics.successProbability).toBeGreaterThan(0.6);
  });

  it('caps success probability at 0.95', () => {
    const strategy = makeStrategy();
    const input = makeBaseInput({
      task: 'Build caching layer',
      skills: Array.from({ length: 10 }, () => makeSkill('caching')),
    });

    const metrics = simulateStrategy(strategy, input);
    expect(metrics.successProbability).toBeLessThanOrEqual(0.95);
  });

  it('reduces success probability for matching anti-patterns', () => {
    const strategy = makeStrategy();
    const input = makeBaseInput({
      task: 'Build a caching layer',
      antiPatterns: [makeAntiPattern('bad-cache', 'caching layer build')],
    });

    const metrics = simulateStrategy(strategy, input);
    expect(metrics.successProbability).toBeLessThan(0.6);
  });

  it('floors success probability at 0.1', () => {
    const strategy = makeStrategy();
    const input = makeBaseInput({
      task: 'Build caching layer',
      antiPatterns: Array.from({ length: 10 }, () =>
        makeAntiPattern('bad', 'caching layer build'),
      ),
    });

    const metrics = simulateStrategy(strategy, input);
    expect(metrics.successProbability).toBeGreaterThanOrEqual(0.1);
  });

  it('ignores archived skills and anti-patterns', () => {
    const strategy = makeStrategy();
    const input = makeBaseInput({
      task: 'Build a caching layer',
      skills: [makeSkill('caching', 'archived')],
      antiPatterns: [makeAntiPattern('bad', 'caching layer', 'archived')],
    });

    const metrics = simulateStrategy(strategy, input);
    expect(metrics.successProbability).toBeCloseTo(0.6, 1);
  });

  it('applies time multiplier for research strategies', () => {
    const regularStrategy = makeStrategy({ name: 'Direct Approach' });
    const researchStrategy = makeStrategy({ name: 'Research-First Approach' });
    const input = makeBaseInput();

    const regularMetrics = simulateStrategy(regularStrategy, input);
    const researchMetrics = simulateStrategy(researchStrategy, input);

    expect(researchMetrics.expectedTimeMs).toBeGreaterThan(regularMetrics.expectedTimeMs);
  });

  it('calculates risk factor as proportion of steps with risks', () => {
    const strategy = makeStrategy({
      steps: [
        { description: 'Safe step', expectedOutcome: 'Done', riskFactors: [] },
        { description: 'Risky step', expectedOutcome: 'Done', riskFactors: ['may fail'] },
        { description: 'Another risky step', expectedOutcome: 'Done', riskFactors: ['uncertain'] },
      ],
    });
    const input = makeBaseInput();

    const metrics = simulateStrategy(strategy, input);
    // 2 out of 3 steps have risks
    expect(metrics.riskFactor).toBeCloseTo(2 / 3, 2);
  });

  it('calculates prerequisite satisfaction from constraints', () => {
    const strategy = makeStrategy({
      steps: [
        { description: 'Handle authentication properly', expectedOutcome: 'Done', riskFactors: [] },
        { description: 'Implement caching', expectedOutcome: 'Done', riskFactors: [] },
      ],
    });

    const input = makeBaseInput({
      constraints: ['Must handle authentication', 'Must be cached'],
    });

    const metrics = simulateStrategy(strategy, input);
    // Both constraints have words matching step descriptions
    expect(metrics.prerequisiteSatisfaction).toBeGreaterThan(0);
  });

  it('computes overall score', () => {
    const strategy = makeStrategy();
    const input = makeBaseInput();
    const metrics = simulateStrategy(strategy, input);

    expect(metrics.overallScore).toBeGreaterThan(0);
    expect(metrics.overallScore).toBe(calculateStrategyScore(metrics));
  });
});

// ===========================================================================
// generateStrategies
// ===========================================================================

describe('generateStrategies', () => {
  it('generates 3 base strategies by default', () => {
    const input = makeBaseInput();
    const strategies = generateStrategies(input);

    expect(strategies.length).toBe(3);
    expect(strategies[0].name).toBe('Direct Approach');
    expect(strategies[1].name).toBe('Incremental Approach');
    expect(strategies[2].name).toBe('Research-First Approach');
  });

  it('adds skill-based strategy when skills match the task', () => {
    const input = makeBaseInput({
      task: 'Build a caching layer',
      skills: [makeSkill('caching')],
    });

    const strategies = generateStrategies(input);
    const skillStrategy = strategies.find((s) => s.name === 'Skill-Based Approach');
    expect(skillStrategy).toBeDefined();
    expect(skillStrategy!.description).toContain('caching');
  });

  it('adds safe strategy when anti-patterns match the task', () => {
    const input = makeBaseInput({
      task: 'Build a caching layer',
      antiPatterns: [makeAntiPattern('bad-cache', 'caching layer')],
    });

    const strategies = generateStrategies(input);
    const safeStrategy = strategies.find((s) => s.name === 'Safe Approach');
    expect(safeStrategy).toBeDefined();
  });

  it('respects numStrategies parameter', () => {
    const input = makeBaseInput({ numStrategies: 2 });
    const strategies = generateStrategies(input);
    expect(strategies.length).toBe(2);
  });

  it('assigns unique IDs to all strategies', () => {
    const input = makeBaseInput();
    const strategies = generateStrategies(input);
    const ids = new Set(strategies.map((s) => s.id));
    expect(ids.size).toBe(strategies.length);
  });

  it('computes metrics for each strategy', () => {
    const input = makeBaseInput();
    const strategies = generateStrategies(input);

    for (const strategy of strategies) {
      expect(strategy.metrics.overallScore).toBeGreaterThan(0);
      expect(strategy.metrics.successProbability).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// evaluateStrategies
// ===========================================================================

describe('evaluateStrategies', () => {
  it('throws on empty strategy list', () => {
    expect(() => evaluateStrategies([])).toThrow('Cannot evaluate empty strategy list');
  });

  it('recommends the strategy with the highest score', () => {
    const strategies: Strategy[] = [
      makeStrategy({
        id: 'low',
        name: 'Low',
        metrics: { successProbability: 0.3, expectedTimeMs: 600_000, riskFactor: 0.8, prerequisiteSatisfaction: 0.5, overallScore: 0.05 },
      }),
      makeStrategy({
        id: 'high',
        name: 'High',
        metrics: { successProbability: 0.9, expectedTimeMs: 100_000, riskFactor: 0.1, prerequisiteSatisfaction: 1.0, overallScore: 0.8 },
      }),
    ];

    const result = evaluateStrategies(strategies);
    expect(result.recommended.id).toBe('high');
  });

  it('sorts strategies by score descending', () => {
    const strategies: Strategy[] = [
      makeStrategy({ id: 'a', metrics: { ...makeStrategy().metrics, overallScore: 0.3 } }),
      makeStrategy({ id: 'b', metrics: { ...makeStrategy().metrics, overallScore: 0.9 } }),
      makeStrategy({ id: 'c', metrics: { ...makeStrategy().metrics, overallScore: 0.6 } }),
    ];

    const result = evaluateStrategies(strategies);
    expect(result.strategies[0].id).toBe('b');
    expect(result.strategies[1].id).toBe('c');
    expect(result.strategies[2].id).toBe('a');
  });

  it('sets needsMoreResearch when top score is below 0.5', () => {
    const strategies: Strategy[] = [
      makeStrategy({ metrics: { ...makeStrategy().metrics, overallScore: 0.3 } }),
    ];

    const result = evaluateStrategies(strategies);
    expect(result.needsMoreResearch).toBe(true);
    expect(result.reasoning).toContain('below 0.5');
  });

  it('clears needsMoreResearch when top score is >= 0.5', () => {
    const strategies: Strategy[] = [
      makeStrategy({ metrics: { ...makeStrategy().metrics, overallScore: 0.7 } }),
    ];

    const result = evaluateStrategies(strategies);
    expect(result.needsMoreResearch).toBe(false);
  });

  it('detects decision point when gap > 0.3 between top two', () => {
    const strategies: Strategy[] = [
      makeStrategy({ id: 'winner', metrics: { ...makeStrategy().metrics, overallScore: 0.9 } }),
      makeStrategy({ id: 'loser', metrics: { ...makeStrategy().metrics, overallScore: 0.4 } }),
    ];

    const result = evaluateStrategies(strategies);
    expect(result.isDecisionPoint).toBe(true);
    expect(result.reasoning).toContain('clear winner');
  });

  it('no decision point when strategies are close', () => {
    const strategies: Strategy[] = [
      makeStrategy({ id: 'a', metrics: { ...makeStrategy().metrics, overallScore: 0.7 } }),
      makeStrategy({ id: 'b', metrics: { ...makeStrategy().metrics, overallScore: 0.65 } }),
    ];

    const result = evaluateStrategies(strategies);
    expect(result.isDecisionPoint).toBe(false);
  });
});

// ===========================================================================
// recordOutcome / getOutcomes
// ===========================================================================

describe('recordOutcome / getOutcomes', () => {
  it('stores and retrieves outcomes', () => {
    const initialCount = getOutcomes().length;

    recordOutcome({
      strategyId: 'strat-1',
      predictedSuccess: 0.8,
      actualSuccess: true,
      predictedTimeMs: 300_000,
      actualTimeMs: 250_000,
      keyDifferences: ['Faster than expected'],
    });

    const outcomes = getOutcomes();
    expect(outcomes.length).toBe(initialCount + 1);

    const last = outcomes[outcomes.length - 1];
    expect(last.strategyId).toBe('strat-1');
    expect(last.actualSuccess).toBe(true);
    expect(last.keyDifferences).toContain('Faster than expected');
  });

  it('returns a copy, not the original array', () => {
    const outcomes = getOutcomes();
    const length = outcomes.length;
    outcomes.push({
      strategyId: 'fake',
      predictedSuccess: 0,
      actualSuccess: false,
      predictedTimeMs: 0,
      actualTimeMs: 0,
      keyDifferences: [],
    });

    // Original should not be modified
    expect(getOutcomes().length).toBe(length);
  });
});
