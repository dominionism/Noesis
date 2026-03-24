/**
 * Context Pressure — Token budget pressure assessment.
 *
 * Monitors context token consumption and recommends actions:
 * - Normal (<70%): continue normally
 * - Warning (>=70%): create checkpoint for review
 * - Critical (>=85%): create handoff, stop new complex work
 */

import {
  CONTEXT_PRESSURE_WARNING_PERCENT,
  CONTEXT_PRESSURE_CRITICAL_PERCENT,
} from '../../constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PressureLevel = 'normal' | 'warning' | 'critical';

export interface PressureAssessment {
  level: PressureLevel;
  percentage: number;
  action: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assess the current context pressure based on token consumption.
 */
export function assessContextPressure(
  currentTokens: number,
  maxTokens: number,
): PressureAssessment {
  if (maxTokens <= 0) {
    return { level: 'critical', percentage: 1.0, action: 'No token budget available. Create handoff immediately.' };
  }

  const percentage = currentTokens / maxTokens;

  if (percentage >= CONTEXT_PRESSURE_CRITICAL_PERCENT) {
    return {
      level: 'critical',
      percentage,
      action: 'Create handoff document and stop new complex work. Transfer execution state to next session.',
    };
  }

  if (percentage >= CONTEXT_PRESSURE_WARNING_PERCENT) {
    return {
      level: 'warning',
      percentage,
      action: 'Create checkpoint. Consider summarizing context and trimming low-priority entries.',
    };
  }

  return {
    level: 'normal',
    percentage,
    action: 'Continue normal operation.',
  };
}

/**
 * Should a checkpoint be created at the current pressure level?
 * Checkpoints allow human review before continuing.
 */
export function shouldCreateCheckpoint(pressure: PressureAssessment): boolean {
  return pressure.level === 'warning' || pressure.level === 'critical';
}

/**
 * Should a handoff be created at the current pressure level?
 * Handoffs transfer full execution state to the next session.
 */
export function shouldCreateHandoff(pressure: PressureAssessment): boolean {
  return pressure.level === 'critical';
}

/**
 * Calculate remaining token budget after pressure assessment.
 */
export function remainingBudget(
  currentTokens: number,
  maxTokens: number,
): number {
  return Math.max(0, maxTokens - currentTokens);
}

/**
 * Estimate how many more context entries can be loaded.
 * Uses average tokens per context entry as heuristic.
 */
export function estimateRemainingCapacity(
  currentTokens: number,
  maxTokens: number,
  avgTokensPerEntry: number,
): number {
  if (avgTokensPerEntry <= 0) return 0;
  const remaining = remainingBudget(currentTokens, maxTokens);
  return Math.floor(remaining / avgTokensPerEntry);
}
