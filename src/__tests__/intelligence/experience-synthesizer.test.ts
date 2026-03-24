/**
 * Tests for Experience Synthesizer
 */

import { describe, it, expect } from 'vitest';
import {
  identifyGaps,
  generateScenarios,
  validateScenario,
  applyValidation,
  synthesize,
  isSynthetic,
  applySyntheticMultiplier,
  type MemoryDensityEntry,
  type SyntheticScenario,
} from '../../intelligence/experience-synthesizer.js';

describe('identifyGaps', () => {
  it('returns empty for empty input', () => {
    expect(identifyGaps([])).toHaveLength(0);
  });

  it('identifies gaps with high frequency and low memory count', () => {
    const entries: MemoryDensityEntry[] = [
      { domain: 'well-covered', memoryCount: 10, changeFrequency: 2 },
      { domain: 'gap-area', memoryCount: 0, changeFrequency: 20 },
    ];

    const gaps = identifyGaps(entries);
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps[0].domain).toBe('gap-area');
  });

  it('does not flag well-covered areas', () => {
    const entries: MemoryDensityEntry[] = [
      { domain: 'covered', memoryCount: 10, changeFrequency: 5 },
    ];

    const gaps = identifyGaps(entries);
    expect(gaps).toHaveLength(0);
  });

  it('sorts gaps by score descending', () => {
    const entries: MemoryDensityEntry[] = [
      { domain: 'small-gap', memoryCount: 5, changeFrequency: 10 },
      { domain: 'big-gap', memoryCount: 0, changeFrequency: 20 },
      { domain: 'medium-gap', memoryCount: 2, changeFrequency: 15 },
    ];

    const gaps = identifyGaps(entries);
    if (gaps.length >= 2) {
      expect(gaps[0].gapScore).toBeGreaterThanOrEqual(gaps[1].gapScore);
    }
  });

  it('computes gap score as normalized frequency * (1 - normalized density)', () => {
    const entries: MemoryDensityEntry[] = [
      { domain: 'only', memoryCount: 0, changeFrequency: 10 },
    ];

    const gaps = identifyGaps(entries);
    // freq = 10/10 = 1, density = 0/1 = 0 (using max(count,1)=1)
    // gap = 1 * (1 - 0) = 1.0
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapScore).toBeCloseTo(1.0, 1);
  });
});

describe('generateScenarios', () => {
  it('generates success and failure variants per pattern', () => {
    const gap = { domain: 'auth', memoryCount: 0, changeFrequency: 10, gapScore: 0.9 };
    const patterns = ['SQL injection', 'token expiry'];

    const scenarios = generateScenarios(gap, patterns);
    expect(scenarios).toHaveLength(4); // 2 patterns * 2 variants

    const failures = scenarios.filter((s) => s.variant === 'failure');
    const successes = scenarios.filter((s) => s.variant === 'success');
    expect(failures).toHaveLength(2);
    expect(successes).toHaveLength(2);
  });

  it('tags all scenarios as synthetic', () => {
    const gap = { domain: 'deploy', memoryCount: 0, changeFrequency: 5, gapScore: 0.8 };
    const scenarios = generateScenarios(gap, ['timeout']);

    for (const s of scenarios) {
      expect(s.source).toBe('synthetic');
      expect(s.tags).toContain('synthetic');
    }
  });

  it('applies synthetic confidence multiplier', () => {
    const gap = { domain: 'deploy', memoryCount: 0, changeFrequency: 5, gapScore: 0.8 };
    const scenarios = generateScenarios(gap, ['pattern1']);

    for (const s of scenarios) {
      // 0.5 * 0.7 = 0.35
      expect(s.confidence).toBeCloseTo(0.35, 2);
    }
  });

  it('returns empty for no patterns', () => {
    const gap = { domain: 'x', memoryCount: 0, changeFrequency: 5, gapScore: 0.8 };
    expect(generateScenarios(gap, [])).toHaveLength(0);
  });
});

describe('validateScenario', () => {
  function makeScenario(variant: 'success' | 'failure'): SyntheticScenario {
    return {
      id: 'test-1',
      domain: 'test',
      title: 'Test scenario',
      content: 'Test content',
      variant,
      basedOnPattern: 'test-pattern',
      confidence: 0.35,
      tags: ['synthetic'],
      source: 'synthetic',
    };
  }

  it('boosts confidence when prediction matches', () => {
    const result = validateScenario(makeScenario('failure'), 'failure');
    expect(result.validated).toBe(true);
    expect(result.confidenceAdjustment).toBeGreaterThan(0);
  });

  it('penalizes confidence when prediction mismatches', () => {
    const result = validateScenario(makeScenario('failure'), 'success');
    expect(result.validated).toBe(true);
    expect(result.confidenceAdjustment).toBeLessThan(0);
  });

  it('returns no adjustment for unknown outcomes', () => {
    const result = validateScenario(makeScenario('failure'), 'unknown');
    expect(result.validated).toBe(false);
    expect(result.confidenceAdjustment).toBe(0);
  });
});

describe('applyValidation', () => {
  it('increases confidence for correct predictions', () => {
    const scenario: SyntheticScenario = {
      id: 'test-1',
      domain: 'test',
      title: 'Test',
      content: 'Test',
      variant: 'failure',
      basedOnPattern: 'p',
      confidence: 0.35,
      tags: ['synthetic'],
      source: 'synthetic',
    };

    const validation = {
      scenarioId: 'test-1',
      predicted: 'failure' as const,
      actual: 'failure' as const,
      confidenceAdjustment: 0.15,
      validated: true,
    };

    const updated = applyValidation(scenario, validation);
    expect(updated.confidence).toBeCloseTo(0.5, 2);
  });

  it('clamps confidence to [0.1, 0.9]', () => {
    const scenario: SyntheticScenario = {
      id: 'test-1',
      domain: 'test',
      title: 'Test',
      content: 'Test',
      variant: 'failure',
      basedOnPattern: 'p',
      confidence: 0.05,
      tags: ['synthetic'],
      source: 'synthetic',
    };

    const validation = {
      scenarioId: 'test-1',
      predicted: 'failure' as const,
      actual: 'success' as const,
      confidenceAdjustment: -0.1,
      validated: true,
    };

    const updated = applyValidation(scenario, validation);
    expect(updated.confidence).toBeGreaterThanOrEqual(0.1);
  });
});

describe('synthesize', () => {
  it('runs full pipeline', () => {
    const entries: MemoryDensityEntry[] = [
      { domain: 'gap-area', memoryCount: 0, changeFrequency: 20 },
      { domain: 'covered', memoryCount: 10, changeFrequency: 2 },
    ];

    const result = synthesize(entries, ['pattern-A', 'pattern-B']);
    expect(result.gapsIdentified).toBeGreaterThanOrEqual(1);
    expect(result.scenariosGenerated).toBeGreaterThan(0);
    expect(result.scenarios[0].source).toBe('synthetic');
  });

  it('limits to maxGaps', () => {
    const entries: MemoryDensityEntry[] = Array.from({ length: 10 }, (_, i) => ({
      domain: `domain-${i}`,
      memoryCount: 0,
      changeFrequency: 10 + i,
    }));

    const result = synthesize(entries, ['p1'], 2);
    expect(result.gaps.length).toBeLessThanOrEqual(2);
  });

  it('returns empty when no gaps found', () => {
    const entries: MemoryDensityEntry[] = [
      { domain: 'full', memoryCount: 50, changeFrequency: 1 },
    ];

    const result = synthesize(entries, ['p1']);
    expect(result.gapsIdentified).toBe(0);
    expect(result.scenariosGenerated).toBe(0);
  });
});

describe('isSynthetic', () => {
  it('returns true when tags include synthetic', () => {
    expect(isSynthetic(['synthetic', 'auth'])).toBe(true);
  });

  it('returns false when tags do not include synthetic', () => {
    expect(isSynthetic(['auth', 'security'])).toBe(false);
  });
});

describe('applySyntheticMultiplier', () => {
  it('reduces confidence by 0.7x', () => {
    expect(applySyntheticMultiplier(1.0)).toBeCloseTo(0.7, 2);
    expect(applySyntheticMultiplier(0.5)).toBeCloseTo(0.35, 2);
  });
});
