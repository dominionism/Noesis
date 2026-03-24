/**
 * Tests for src/retrieval/scoring.ts
 *
 * Covers:
 * - computeRecencyModifier: tiered decay by age bands
 * - computeAccessBoost: log2 scaling with hard cap
 * - computeSuccessWeight: outcome multipliers
 * - computeScopeBoost: project scope alignment
 * - computeCompositeScore: full multiplication pipeline
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  computeRecencyModifier,
  computeAccessBoost,
  computeSuccessWeight,
  computeScopeBoost,
  computeCompositeScore,
} from '../../retrieval/scoring.js';

describe('computeRecencyModifier', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 1.0 for memories accessed within the last 7 days', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    expect(computeRecencyModifier(recent.toISOString())).toBe(1.0);
  });

  it('returns 1.0 for memories accessed right now', () => {
    expect(computeRecencyModifier(new Date().toISOString())).toBe(1.0);
  });

  it('returns 0.9 for memories accessed 8-30 days ago', () => {
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    expect(computeRecencyModifier(twoWeeksAgo.toISOString())).toBe(0.9);
  });

  it('returns 0.8 for memories accessed 31-90 days ago', () => {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    expect(computeRecencyModifier(sixtyDaysAgo.toISOString())).toBe(0.8);
  });

  it('returns 0.7 for memories accessed 91-365 days ago', () => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);
    expect(computeRecencyModifier(sixMonthsAgo.toISOString())).toBe(0.7);
  });

  it('returns 0.5 for memories accessed more than 365 days ago', () => {
    const now = new Date();
    const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
    expect(computeRecencyModifier(twoYearsAgo.toISOString())).toBe(0.5);
  });

  it('returns 0.9 at exactly 30 days (boundary)', () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(computeRecencyModifier(thirtyDaysAgo.toISOString())).toBe(0.9);
  });

  it('returns 0.8 at 89 days (within 90-day tier)', () => {
    const now = new Date();
    const eightyNineDaysAgo = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
    expect(computeRecencyModifier(eightyNineDaysAgo.toISOString())).toBe(0.8);
  });
});

describe('computeAccessBoost', () => {
  it('returns 1.0 for zero access count', () => {
    expect(computeAccessBoost(0)).toBe(1.0);
  });

  it('returns a value greater than 1.0 for positive access count', () => {
    expect(computeAccessBoost(5)).toBeGreaterThan(1.0);
  });

  it('is capped at 1.3', () => {
    // Very high access count should not exceed 1.3
    expect(computeAccessBoost(100000)).toBeCloseTo(1.3, 4);
  });

  it('increases monotonically with access count', () => {
    const boost1 = computeAccessBoost(1);
    const boost5 = computeAccessBoost(5);
    const boost50 = computeAccessBoost(50);

    expect(boost5).toBeGreaterThan(boost1);
    expect(boost50).toBeGreaterThan(boost5);
  });

  it('handles negative access count by treating it as 0', () => {
    expect(computeAccessBoost(-5)).toBe(1.0 + Math.min(Math.log2(0 + 1) / 10, 0.3));
  });

  it('returns expected value for access count of 1', () => {
    // 1.0 + min(log2(2) / 10, 0.3) = 1.0 + min(0.1, 0.3) = 1.1
    expect(computeAccessBoost(1)).toBeCloseTo(1.1, 4);
  });
});

describe('computeSuccessWeight', () => {
  it('returns 1.0 for null outcome', () => {
    expect(computeSuccessWeight(null)).toBe(1.0);
  });

  it('returns 1.0 for success outcome', () => {
    expect(computeSuccessWeight('success')).toBe(1.0);
  });

  it('returns 0.9 for failed_then_fixed outcome', () => {
    expect(computeSuccessWeight('failed_then_fixed')).toBe(0.9);
  });

  it('returns 0.7 for partial_success outcome', () => {
    expect(computeSuccessWeight('partial_success')).toBe(0.7);
  });

  it('returns 0.3 for failed outcome', () => {
    expect(computeSuccessWeight('failed')).toBe(0.3);
  });
});

describe('computeScopeBoost', () => {
  it('returns 0.9 for global scope memories', () => {
    expect(computeScopeBoost('proj-1', 'global', 'proj-1')).toBe(0.9);
  });

  it('returns 0.9 for global scope even without query project', () => {
    expect(computeScopeBoost(null, 'global')).toBe(0.9);
  });

  it('returns 1.5 when memory project matches query project (non-global)', () => {
    expect(computeScopeBoost('proj-1', 'project', 'proj-1')).toBe(1.5);
  });

  it('returns 0.6 when memory project does not match query project', () => {
    expect(computeScopeBoost('proj-1', 'project', 'proj-2')).toBe(0.6);
  });

  it('returns 0.6 when query has no project_id and memory is project-scoped', () => {
    expect(computeScopeBoost('proj-1', 'project')).toBe(0.6);
  });

  it('returns 0.6 when memory has null project_id and scope is not global', () => {
    expect(computeScopeBoost(null, 'session', 'proj-1')).toBe(0.6);
  });

  it('returns 0.6 for session scope with no project match', () => {
    expect(computeScopeBoost('proj-1', 'session', 'proj-2')).toBe(0.6);
  });

  it('returns 1.5 for session scope with matching project', () => {
    expect(computeScopeBoost('proj-1', 'session', 'proj-1')).toBe(1.5);
  });
});

describe('computeCompositeScore', () => {
  it('multiplies all factors together', () => {
    const result = computeCompositeScore({
      semanticScore: 2.0,
      lastAccessedAt: new Date().toISOString(), // recency = 1.0
      accessCount: 0, // access = 1.0
      outcome: 'success', // success = 1.0
      memoryProjectId: 'proj-1',
      memoryScope: 'project',
      queryProjectId: 'proj-1', // scope = 1.5
    });

    expect(result.finalScore).toBeCloseTo(2.0 * 1.0 * 1.0 * 1.0 * 1.5, 4);
    expect(result.recencyModifier).toBe(1.0);
    expect(result.accessBoost).toBe(1.0);
    expect(result.successWeight).toBe(1.0);
    expect(result.scopeBoost).toBe(1.5);
  });

  it('correctly combines all demoted factors', () => {
    const now = new Date();
    const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);

    const result = computeCompositeScore({
      semanticScore: 1.0,
      lastAccessedAt: twoYearsAgo.toISOString(), // recency = 0.5
      accessCount: 0, // access = 1.0
      outcome: 'failed', // success = 0.3
      memoryProjectId: 'proj-a',
      memoryScope: 'project',
      queryProjectId: 'proj-b', // scope = 0.6
    });

    expect(result.finalScore).toBeCloseTo(1.0 * 0.5 * 1.0 * 0.3 * 0.6, 4);
    expect(result.recencyModifier).toBe(0.5);
    expect(result.successWeight).toBe(0.3);
    expect(result.scopeBoost).toBe(0.6);
  });

  it('returns zero final score when semantic score is zero', () => {
    const result = computeCompositeScore({
      semanticScore: 0,
      lastAccessedAt: new Date().toISOString(),
      accessCount: 100,
      outcome: 'success',
      memoryProjectId: null,
      memoryScope: 'global',
    });

    expect(result.finalScore).toBe(0);
  });

  it('returns all component modifiers for explainability', () => {
    const result = computeCompositeScore({
      semanticScore: 1.0,
      lastAccessedAt: new Date().toISOString(),
      accessCount: 10,
      outcome: 'partial_success',
      memoryProjectId: null,
      memoryScope: 'global',
    });

    expect(result).toHaveProperty('finalScore');
    expect(result).toHaveProperty('recencyModifier');
    expect(result).toHaveProperty('accessBoost');
    expect(result).toHaveProperty('successWeight');
    expect(result).toHaveProperty('scopeBoost');
  });
});
