/**
 * Bayesian Confidence Tracking (Learning Loop 4)
 *
 * Manages the lifecycle confidence of skills and anti-patterns using
 * Laplace-smoothed Bayesian estimation. Handles:
 *
 * - Confidence computation from success/failure counts
 * - Incremental updates from outcome feedback
 * - Archive threshold detection for low-confidence definitions
 * - Monthly confidence decay for unused definitions
 */

// ---------------------------------------------------------------------------
// Core confidence computation
// ---------------------------------------------------------------------------

/**
 * Compute a Laplace-smoothed confidence estimate.
 *
 * Uses: successes / (successes + failures + 2)
 *
 * Equivalent to Beta distribution posterior mean with uniform Beta(1,1)
 * prior. Provides principled default of 0.0 with no observations and
 * converges to true success rate as data accumulates.
 */
export function computeConfidence(successes: number, failures: number): number {
  return successes / (successes + failures + 2);
}

export interface ConfidenceState {
  successes: number;
  failures: number;
  confidence: number;
}

export type FeedbackOutcome = 'success' | 'partial' | 'failure';

/**
 * Update confidence state based on an observed outcome.
 *
 * Outcome mapping:
 * - 'success': successes += 1
 * - 'partial': successes += 0.5
 * - 'failure': failures += 1
 *
 * Returns a new state object (does not mutate input).
 */
export function updateConfidence(params: {
  current: ConfidenceState;
  outcome: FeedbackOutcome;
}): ConfidenceState {
  const { current, outcome } = params;

  let newSuccesses = current.successes;
  let newFailures = current.failures;

  switch (outcome) {
    case 'success':
      newSuccesses += 1;
      break;
    case 'partial':
      newSuccesses += 0.5;
      break;
    case 'failure':
      newFailures += 1;
      break;
  }

  return {
    successes: newSuccesses,
    failures: newFailures,
    confidence: computeConfidence(newSuccesses, newFailures),
  };
}

/**
 * Determine whether a skill or anti-pattern should be archived based on
 * sustained low confidence after sufficient usage.
 *
 * Threshold: confidence < 0.3 AND total uses >= 5.
 */
export function shouldArchive(confidence: number, totalUses: number): boolean {
  return confidence < 0.3 && totalUses >= 5;
}

/**
 * Apply time-based confidence decay for definitions that have not been
 * used recently. If unused for >= decayThresholdDays, confidence is
 * multiplied by decayFactor.
 *
 * Never-used definitions (lastUsedAt === null) are not decayed.
 */
export function applyMonthlyDecay(params: {
  confidence: number;
  lastUsedAt: string | null;
  decayFactor?: number;
  decayThresholdDays?: number;
}): number {
  const {
    confidence,
    lastUsedAt,
    decayFactor = 0.9,
    decayThresholdDays = 60,
  } = params;

  if (lastUsedAt === null) return confidence;

  const lastUsed = new Date(lastUsedAt);
  if (isNaN(lastUsed.getTime())) return confidence;

  const now = new Date();
  const daysSinceUse =
    (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceUse >= decayThresholdDays) {
    return confidence * decayFactor;
  }

  return confidence;
}
