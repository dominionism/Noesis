/**
 * Readiness Gate — 5-Dimension Scoring
 *
 * @deprecated Use {@link src/cognitive/gates/readiness-gate.ts} instead.
 * The cognitive readiness gate provides evidence-backed scoring from similar
 * past tasks, discovery level calibration, auto-research triggers, and
 * historical correlation analysis.
 *
 * Scores readiness for implementation across 5 dimensions:
 * - Clarity (0-20): Is the task well-defined? >= 15 required
 * - Codebase (0-20): Do we understand the relevant code? >= 15 required
 * - Constraints (0-20): Are constraints identified?
 * - Risks (0-20): Are risks understood?
 * - Verification (0-20): Is the validation plan clear?
 *
 * Total >= 70 required to pass the gate.
 *
 * Enhancement over Agent Workflow: Consults the knowledge graph for
 * existing memories about the task type, adjusting confidence dimensions.
 */

import type { ReadinessScore, ReadinessGap, RecallResult } from '../types.js';
import {
  READINESS_THRESHOLD_TOTAL,
  READINESS_THRESHOLD_CLARITY,
  READINESS_THRESHOLD_CODEBASE,
} from '../constants.js';

export interface ReadinessInput {
  /** Task description to evaluate */
  taskDescription: string;
  /** Has the user clearly stated what they want? */
  hasGoal: boolean;
  /** Is there a concrete deliverable defined? */
  hasDeliverable: boolean;
  /** Have constraints been identified? */
  constraintsIdentified: number;
  /** Have relevant files/APIs been located? */
  codebaseExplored: boolean;
  /** Has the codebase architecture been understood? */
  architectureUnderstood: boolean;
  /** Number of risks identified */
  risksIdentified: number;
  /** Has a test/verification plan been defined? */
  hasVerificationPlan: boolean;
  /** Number of validation criteria */
  validationCriteria: number;
}

export interface ReadinessContext {
  /** Results from a recall query about this task type */
  relatedMemories?: RecallResult;
  /** Number of past successful tasks of this type */
  pastSuccessCount?: number;
  /** Number of past failures of this type */
  pastFailureCount?: number;
  /** Number of known anti-patterns relevant to this task */
  relevantAntiPatterns?: number;
}

/**
 * Compute the readiness score for implementation.
 *
 * Each dimension is scored 0-20. The total must reach 70 to pass,
 * with clarity >= 15 and codebase >= 15 as hard minimums.
 */
export function computeReadiness(
  input: ReadinessInput,
  context?: ReadinessContext,
): ReadinessScore {
  const gaps: ReadinessGap[] = [];

  // Clarity (0-20)
  let clarity = 0;
  if (input.hasGoal) clarity += 8;
  if (input.hasDeliverable) clarity += 7;
  if (input.taskDescription.length > 50) clarity += 3;
  if (input.taskDescription.length > 200) clarity += 2;
  clarity = Math.min(20, clarity);

  // Memory boost: if we have successful past memories for this task type,
  // the task pattern is familiar, boosting clarity
  if (context?.pastSuccessCount && context.pastSuccessCount >= 3) {
    clarity = Math.min(20, clarity + 2);
  }

  if (clarity < READINESS_THRESHOLD_CLARITY) {
    gaps.push({
      dimension: 'clarity',
      current: clarity,
      required: READINESS_THRESHOLD_CLARITY,
      suggestion: 'Define a clear goal and concrete deliverable before proceeding.',
    });
  }

  // Codebase (0-20)
  let codebase = 0;
  if (input.codebaseExplored) codebase += 10;
  if (input.architectureUnderstood) codebase += 8;
  // Memory boost: related memories about this codebase indicate familiarity
  if (context?.relatedMemories && context.relatedMemories.memories.length >= 5) {
    codebase = Math.min(20, codebase + 4);
  } else if (context?.relatedMemories && context.relatedMemories.memories.length >= 2) {
    codebase = Math.min(20, codebase + 2);
  }
  codebase = Math.min(20, codebase);

  if (codebase < READINESS_THRESHOLD_CODEBASE) {
    gaps.push({
      dimension: 'codebase',
      current: codebase,
      required: READINESS_THRESHOLD_CODEBASE,
      suggestion: 'Explore relevant files and understand the architecture before implementing.',
    });
  }

  // Constraints (0-20)
  let constraints = Math.min(20, input.constraintsIdentified * 5);
  if (context?.relevantAntiPatterns && context.relevantAntiPatterns > 0) {
    constraints = Math.min(20, constraints + 3);
  }

  if (constraints < 10) {
    gaps.push({
      dimension: 'constraints',
      current: constraints,
      required: 10,
      suggestion: 'Identify technical constraints, dependencies, and boundaries.',
    });
  }

  // Risks (0-20)
  let risks = Math.min(20, input.risksIdentified * 4);
  // Memory boost: past failures indicate we know the risks
  if (context?.pastFailureCount && context.pastFailureCount > 0) {
    risks = Math.min(20, risks + Math.min(6, context.pastFailureCount * 2));
  }

  if (risks < 8) {
    gaps.push({
      dimension: 'risks',
      current: risks,
      required: 8,
      suggestion: 'Identify potential failure modes and edge cases.',
    });
  }

  // Verification (0-20)
  let verification = 0;
  if (input.hasVerificationPlan) verification += 10;
  verification += Math.min(10, input.validationCriteria * 3);
  verification = Math.min(20, verification);

  if (verification < 8) {
    gaps.push({
      dimension: 'verification',
      current: verification,
      required: 8,
      suggestion: 'Define how you will verify the implementation is correct.',
    });
  }

  const total = clarity + codebase + constraints + risks + verification;
  const passed =
    total >= READINESS_THRESHOLD_TOTAL &&
    clarity >= READINESS_THRESHOLD_CLARITY &&
    codebase >= READINESS_THRESHOLD_CODEBASE;

  if (total < READINESS_THRESHOLD_TOTAL && gaps.length === 0) {
    gaps.push({
      dimension: 'total',
      current: total,
      required: READINESS_THRESHOLD_TOTAL,
      suggestion: 'Overall readiness is insufficient. Strengthen the weakest dimensions.',
    });
  }

  return {
    clarity,
    codebase,
    constraints,
    risks,
    verification,
    total,
    passed,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// Phase-adjusted readiness scoring
// ---------------------------------------------------------------------------

/**
 * Phase-specific dimension weight adjustments.
 *
 * Each workflow phase may raise or lower the threshold for specific
 * dimensions. A positive modifier increases the effective threshold;
 * a negative modifier decreases it.
 */
const PHASE_MODIFIERS: Record<string, Partial<Record<string, number>>> = {
  research: {
    clarity: 2,     // Research requires very clear understanding
    codebase: -3,   // Codebase knowledge may not be needed yet
  },
  plan: {
    constraints: 3, // Planning requires thorough constraint understanding
    risks: 2,       // Risk identification is critical before planning
    clarity: 1,     // Slightly higher clarity bar
  },
  implement: {
    codebase: 3,    // Must understand the codebase to implement
    verification: 2, // Need verification criteria defined
  },
  validate: {
    verification: 3, // Validation phase needs strong verification criteria
  },
};

/**
 * Compute readiness with phase-specific threshold adjustments.
 *
 * Wraps the base computeReadiness and applies phase modifiers to the
 * gap thresholds. This means that entering the 'plan' phase, for example,
 * requires a higher constraints score than the default threshold.
 *
 * The total threshold and hard gates (clarity >= 15, codebase >= 15)
 * remain unchanged. Only the gap reporting and suggestions are adjusted
 * for the target phase.
 */
export function computeWorkflowReadiness(
  input: ReadinessInput,
  context: ReadinessContext | undefined,
  workflowPhase: string,
): ReadinessScore {
  // Get base readiness score
  const baseScore = computeReadiness(input, context);

  // If no modifiers for this phase, return base score
  const modifiers = PHASE_MODIFIERS[workflowPhase];
  if (!modifiers) {
    return baseScore;
  }

  // Apply phase-specific gap adjustments
  const adjustedGaps: ReadinessGap[] = [];

  // Base thresholds for gap detection per dimension
  const baseThresholds: Record<string, number> = {
    clarity: READINESS_THRESHOLD_CLARITY,
    codebase: READINESS_THRESHOLD_CODEBASE,
    constraints: 10,
    risks: 8,
    verification: 8,
  };

  // Score values by dimension
  const scores: Record<string, number> = {
    clarity: baseScore.clarity,
    codebase: baseScore.codebase,
    constraints: baseScore.constraints,
    risks: baseScore.risks,
    verification: baseScore.verification,
  };

  const suggestions: Record<string, string> = {
    clarity: 'Define a clear goal and concrete deliverable before proceeding.',
    codebase: 'Explore relevant files and understand the architecture before implementing.',
    constraints: 'Identify technical constraints, dependencies, and boundaries.',
    risks: 'Identify potential failure modes and edge cases.',
    verification: 'Define how you will verify the implementation is correct.',
  };

  for (const [dimension, baseThreshold] of Object.entries(baseThresholds)) {
    const modifier = modifiers[dimension] ?? 0;
    const adjustedThreshold = Math.min(20, Math.max(0, baseThreshold + modifier));
    const score = scores[dimension];

    if (score < adjustedThreshold) {
      adjustedGaps.push({
        dimension,
        current: score,
        required: adjustedThreshold,
        suggestion: `[${workflowPhase} phase] ${suggestions[dimension]}`,
      });
    }
  }

  // Keep the total gap from the base score if applicable
  if (baseScore.total < READINESS_THRESHOLD_TOTAL && adjustedGaps.length === 0) {
    adjustedGaps.push({
      dimension: 'total',
      current: baseScore.total,
      required: READINESS_THRESHOLD_TOTAL,
      suggestion: 'Overall readiness is insufficient. Strengthen the weakest dimensions.',
    });
  }

  return {
    ...baseScore,
    gaps: adjustedGaps,
  };
}
