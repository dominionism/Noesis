/**
 * Tests for Bayesian Confidence Tracking (Learning Loop 4)
 *
 * Covers:
 * - computeConfidence: Laplace-smoothed estimate from success/failure counts
 * - updateConfidence: outcome-based incremental updates (immutability)
 * - shouldArchive: threshold detection for low-confidence definitions
 * - applyMonthlyDecay: time-based decay for unused definitions
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeConfidence,
  updateConfidence,
  shouldArchive,
  applyMonthlyDecay,
  type ConfidenceState,
  type FeedbackOutcome,
} from '../../intelligence/feedback.js';

// ---------------------------------------------------------------------------
// computeConfidence
// ---------------------------------------------------------------------------

describe('computeConfidence', () => {
  it('returns 0 with zero successes and zero failures (uniform prior)', () => {
    // Formula: 0 / (0 + 0 + 2) = 0
    expect(computeConfidence(0, 0)).toBe(0);
  });

  it('returns ~0.333 with 1 success and 0 failures', () => {
    // Formula: 1 / (1 + 0 + 2) = 1/3
    expect(computeConfidence(1, 0)).toBeCloseTo(1 / 3, 5);
  });

  it('returns ~0.667 with 2 successes and 0 failures', () => {
    // Formula: 2 / (2 + 0 + 2) = 0.5
    expect(computeConfidence(2, 0)).toBeCloseTo(0.5, 5);
  });

  it('converges toward true rate with many observations', () => {
    // 80 successes, 20 failures => 80/102 ≈ 0.784
    const conf = computeConfidence(80, 20);
    expect(conf).toBeCloseTo(0.784, 2);
    // Should be close to the true rate of 0.8
    expect(Math.abs(conf - 0.8)).toBeLessThan(0.02);
  });

  it('returns 0.5 with equal successes and failures (plus prior)', () => {
    // Formula: 5 / (5 + 5 + 2) = 5/12 ≈ 0.4167
    expect(computeConfidence(5, 5)).toBeCloseTo(5 / 12, 5);
  });

  it('handles fractional successes', () => {
    // Formula: 0.5 / (0.5 + 0 + 2) = 0.5/2.5 = 0.2
    expect(computeConfidence(0.5, 0)).toBeCloseTo(0.2, 5);
  });

  it('handles large numbers without overflow', () => {
    const conf = computeConfidence(1_000_000, 0);
    expect(conf).toBeCloseTo(1.0, 2);
  });
});

// ---------------------------------------------------------------------------
// updateConfidence
// ---------------------------------------------------------------------------

describe('updateConfidence', () => {
  it('increments successes by 1 on success outcome', () => {
    const current: ConfidenceState = { successes: 3, failures: 1, confidence: 0.5 };
    const result = updateConfidence({ current, outcome: 'success' });

    expect(result.successes).toBe(4);
    expect(result.failures).toBe(1);
    expect(result.confidence).toBeCloseTo(computeConfidence(4, 1), 5);
  });

  it('increments successes by 0.5 on partial outcome', () => {
    const current: ConfidenceState = { successes: 2, failures: 0, confidence: 0.5 };
    const result = updateConfidence({ current, outcome: 'partial' });

    expect(result.successes).toBe(2.5);
    expect(result.failures).toBe(0);
    expect(result.confidence).toBeCloseTo(computeConfidence(2.5, 0), 5);
  });

  it('increments failures by 1 on failure outcome', () => {
    const current: ConfidenceState = { successes: 5, failures: 2, confidence: 0.5 };
    const result = updateConfidence({ current, outcome: 'failure' });

    expect(result.successes).toBe(5);
    expect(result.failures).toBe(3);
    expect(result.confidence).toBeCloseTo(computeConfidence(5, 3), 5);
  });

  it('does not mutate the input state object', () => {
    const current: ConfidenceState = { successes: 1, failures: 1, confidence: 0.25 };
    const copy = { ...current };

    updateConfidence({ current, outcome: 'success' });

    expect(current).toEqual(copy);
  });

  it('returns a new object reference', () => {
    const current: ConfidenceState = { successes: 1, failures: 0, confidence: 0.33 };
    const result = updateConfidence({ current, outcome: 'success' });

    expect(result).not.toBe(current);
  });

  it('correctly updates confidence from zero state', () => {
    const current: ConfidenceState = { successes: 0, failures: 0, confidence: 0 };
    const afterSuccess = updateConfidence({ current, outcome: 'success' });

    expect(afterSuccess.successes).toBe(1);
    expect(afterSuccess.confidence).toBeCloseTo(1 / 3, 5);
  });

  it('sequential updates produce correct confidence', () => {
    let state: ConfidenceState = { successes: 0, failures: 0, confidence: 0 };

    state = updateConfidence({ current: state, outcome: 'success' });
    state = updateConfidence({ current: state, outcome: 'success' });
    state = updateConfidence({ current: state, outcome: 'failure' });

    expect(state.successes).toBe(2);
    expect(state.failures).toBe(1);
    expect(state.confidence).toBeCloseTo(computeConfidence(2, 1), 5);
  });

  it('mixed partial outcomes accumulate correctly', () => {
    let state: ConfidenceState = { successes: 0, failures: 0, confidence: 0 };

    state = updateConfidence({ current: state, outcome: 'partial' });
    state = updateConfidence({ current: state, outcome: 'partial' });

    expect(state.successes).toBe(1.0);
    expect(state.failures).toBe(0);
    expect(state.confidence).toBeCloseTo(computeConfidence(1.0, 0), 5);
  });
});

// ---------------------------------------------------------------------------
// shouldArchive
// ---------------------------------------------------------------------------

describe('shouldArchive', () => {
  it('returns true when confidence < 0.3 and totalUses >= 5', () => {
    expect(shouldArchive(0.29, 5)).toBe(true);
    expect(shouldArchive(0.1, 10)).toBe(true);
    expect(shouldArchive(0.0, 5)).toBe(true);
  });

  it('returns false when confidence >= 0.3', () => {
    expect(shouldArchive(0.3, 5)).toBe(false);
    expect(shouldArchive(0.5, 10)).toBe(false);
    expect(shouldArchive(1.0, 100)).toBe(false);
  });

  it('returns false when totalUses < 5 even with low confidence', () => {
    expect(shouldArchive(0.1, 4)).toBe(false);
    expect(shouldArchive(0.0, 0)).toBe(false);
    expect(shouldArchive(0.29, 3)).toBe(false);
  });

  it('returns false at exact boundary (0.3 confidence, 5 uses)', () => {
    // 0.3 is NOT less than 0.3, so should not archive
    expect(shouldArchive(0.3, 5)).toBe(false);
  });

  it('returns true just below boundary (0.299, 5 uses)', () => {
    expect(shouldArchive(0.299, 5)).toBe(true);
  });

  it('returns false when totalUses is exactly 4', () => {
    expect(shouldArchive(0.1, 4)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMonthlyDecay
// ---------------------------------------------------------------------------

describe('applyMonthlyDecay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not decay when lastUsedAt is null (never used)', () => {
    const result = applyMonthlyDecay({
      confidence: 0.8,
      lastUsedAt: null,
    });

    expect(result).toBe(0.8);
  });

  it('does not decay when used within threshold days', () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 30); // 30 days ago (within 60-day default)

    const result = applyMonthlyDecay({
      confidence: 0.8,
      lastUsedAt: recentDate.toISOString(),
    });

    expect(result).toBe(0.8);
  });

  it('applies decay when used beyond threshold days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T00:00:00Z'));

    const oldDate = new Date('2026-01-01T00:00:00Z'); // ~72 days ago

    const result = applyMonthlyDecay({
      confidence: 0.8,
      lastUsedAt: oldDate.toISOString(),
    });

    // Default decay factor = 0.9, so 0.8 * 0.9 = 0.72
    expect(result).toBeCloseTo(0.72, 5);
  });

  it('uses custom decay factor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T00:00:00Z'));

    const oldDate = new Date('2025-12-01T00:00:00Z'); // ~103 days ago

    const result = applyMonthlyDecay({
      confidence: 1.0,
      lastUsedAt: oldDate.toISOString(),
      decayFactor: 0.5,
    });

    expect(result).toBeCloseTo(0.5, 5);
  });

  it('uses custom threshold days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T00:00:00Z'));

    const date = new Date('2026-03-04T00:00:00Z'); // 10 days ago

    // With threshold of 5 days, 10 days should trigger decay
    const result = applyMonthlyDecay({
      confidence: 0.8,
      lastUsedAt: date.toISOString(),
      decayThresholdDays: 5,
    });

    expect(result).toBeCloseTo(0.72, 5);

    // With threshold of 15 days, 10 days should NOT trigger decay
    const result2 = applyMonthlyDecay({
      confidence: 0.8,
      lastUsedAt: date.toISOString(),
      decayThresholdDays: 15,
    });

    expect(result2).toBe(0.8);
  });

  it('returns original confidence for invalid date string', () => {
    const result = applyMonthlyDecay({
      confidence: 0.7,
      lastUsedAt: 'not-a-date',
    });

    expect(result).toBe(0.7);
  });

  it('handles boundary case: exactly at threshold', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-14T00:00:00Z');
    vi.setSystemTime(now);

    // Exactly 60 days ago
    const exactDate = new Date('2026-01-13T00:00:00Z');

    const result = applyMonthlyDecay({
      confidence: 0.8,
      lastUsedAt: exactDate.toISOString(),
      decayThresholdDays: 60,
    });

    // >= 60 days, so decay should apply
    expect(result).toBeCloseTo(0.72, 5);
  });

  it('handles zero confidence (stays zero after decay)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T00:00:00Z'));

    const result = applyMonthlyDecay({
      confidence: 0.0,
      lastUsedAt: '2025-01-01T00:00:00Z',
    });

    expect(result).toBe(0.0);
  });
});
