/**
 * Intelligence Metrics Computation
 *
 * Computes key performance indicators for the learning intelligence
 * system. Enhanced for Noesis with additional workflow metrics.
 *
 * Metrics:
 * 1. Retrieval Precision    — fraction of retrievals that were helpful
 * 2. Gate Pass Rate          — how often research satisfies readiness
 * 3. Learning Capture Rate   — lessons per failure
 * 4. Skill Synthesis Rate    — skills crystallized per month
 * 5. Time-to-Resolution Trend — improving or degrading task times
 */

import type { IntelligenceMetrics } from '../types.js';

/**
 * Compute intelligence metrics from raw counters.
 *
 * All ratios are clamped to [0, 1]. When denominators are zero,
 * metrics default to 0 to signal "no data".
 */
export function computeMetrics(params: {
  totalRetrievals: number;
  helpfulRetrievals: number;
  totalGateChecks: number;
  gatesPassed: number;
  totalFailures: number;
  lessonsCaptured: number;
  skillsSynthesizedLast30Days: number;
  avgTimeCurrentPeriod: number;
  avgTimePreviousPeriod: number;
}): IntelligenceMetrics {
  const {
    totalRetrievals,
    helpfulRetrievals,
    totalGateChecks,
    gatesPassed,
    totalFailures,
    lessonsCaptured,
    skillsSynthesizedLast30Days,
    avgTimeCurrentPeriod,
    avgTimePreviousPeriod,
  } = params;

  const retrievalPrecision =
    totalRetrievals > 0
      ? clamp(helpfulRetrievals / totalRetrievals, 0, 1)
      : 0;

  const gatePassRate =
    totalGateChecks > 0
      ? clamp(gatesPassed / totalGateChecks, 0, 1)
      : 0;

  const learningCaptureRate =
    totalFailures > 0
      ? clamp(lessonsCaptured / totalFailures, 0, 1)
      : 0;

  // Time-to-resolution trend: < 1.0 means improving, > 1.0 means degrading
  const timeToResolutionTrend =
    avgTimePreviousPeriod > 0
      ? avgTimeCurrentPeriod / avgTimePreviousPeriod
      : 0;

  return {
    retrieval_precision: round4(retrievalPrecision),
    gate_pass_rate: round4(gatePassRate),
    learning_capture_rate: round4(learningCaptureRate),
    skill_synthesis_rate: round4(skillsSynthesizedLast30Days),
    time_to_resolution_trend: round4(timeToResolutionTrend),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
