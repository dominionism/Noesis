/**
 * Self-Evaluator
 *
 * Continuously evaluates the system's performance and identifies
 * areas for improvement.
 *
 * 5 Evaluation Dimensions:
 * 1. Retrieval Quality — were retrieved memories helpful? Target: >0.7
 * 2. Learning Effectiveness — do lessons prevent repeat failures? Target: <0.2
 * 3. Skill Adoption — are synthesized skills actually used? Target: >0.5
 * 4. Prediction Accuracy — do simulations predict correct outcomes? Target: >0.6
 * 5. User Satisfaction Proxy — correction rate (lower is better). Target: <0.3
 */

// ===========================================================================
// Types
// ===========================================================================

export interface EvaluationDimension {
  name: string;
  metric: number;
  target: number;
  direction: 'higher_is_better' | 'lower_is_better';
  passing: boolean;
  action: string | null;
}

export interface EvaluationInput {
  helpfulRetrievals: number;
  totalRetrievals: number;
  repeatFailures: number;
  totalFailures: number;
  skillsApplied: number;
  skillsRetrieved: number;
  correctPredictions: number;
  totalPredictions: number;
  corrections: number;
  totalTasks: number;
}

export interface EvaluationResult {
  dimensions: EvaluationDimension[];
  overallHealth: 'healthy' | 'degraded' | 'critical';
  passCount: number;
  totalDimensions: number;
  recommendations: string[];
  evaluatedAt: string;
}

export type EvaluationSchedule = 'per_session' | 'daily' | 'weekly';

// ===========================================================================
// Constants
// ===========================================================================

const TARGETS = {
  retrievalPrecision: { value: 0.7, direction: 'higher_is_better' as const },
  repeatFailureRate: { value: 0.2, direction: 'lower_is_better' as const },
  skillAdoption: { value: 0.5, direction: 'higher_is_better' as const },
  predictionAccuracy: { value: 0.6, direction: 'higher_is_better' as const },
  correctionRate: { value: 0.3, direction: 'lower_is_better' as const },
};

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Run a full self-evaluation.
 */
export function evaluate(input: EvaluationInput): EvaluationResult {
  const dimensions: EvaluationDimension[] = [];

  // 1. Retrieval Quality
  const retrievalPrecision = input.totalRetrievals > 0
    ? input.helpfulRetrievals / input.totalRetrievals
    : 1.0;
  dimensions.push(evaluateDimension(
    'Retrieval Quality',
    retrievalPrecision,
    TARGETS.retrievalPrecision.value,
    TARGETS.retrievalPrecision.direction,
    'Review retrieval weights, check for stale memories',
  ));

  // 2. Learning Effectiveness
  const repeatFailureRate = input.totalFailures > 0
    ? input.repeatFailures / input.totalFailures
    : 0;
  dimensions.push(evaluateDimension(
    'Learning Effectiveness',
    repeatFailureRate,
    TARGETS.repeatFailureRate.value,
    TARGETS.repeatFailureRate.direction,
    'Check if lessons are being retrieved, verify confidence levels',
  ));

  // 3. Skill Adoption
  const skillAdoption = input.skillsRetrieved > 0
    ? input.skillsApplied / input.skillsRetrieved
    : 1.0;
  dimensions.push(evaluateDimension(
    'Skill Adoption',
    skillAdoption,
    TARGETS.skillAdoption.value,
    TARGETS.skillAdoption.direction,
    'Skills may be too generic or not relevant. Review skill synthesis.',
  ));

  // 4. Prediction Accuracy
  const predictionAccuracy = input.totalPredictions > 0
    ? input.correctPredictions / input.totalPredictions
    : 1.0;
  dimensions.push(evaluateDimension(
    'Prediction Accuracy',
    predictionAccuracy,
    TARGETS.predictionAccuracy.value,
    TARGETS.predictionAccuracy.direction,
    'Adjust simulation model weights',
  ));

  // 5. User Satisfaction Proxy
  const correctionRate = input.totalTasks > 0
    ? input.corrections / input.totalTasks
    : 0;
  dimensions.push(evaluateDimension(
    'User Satisfaction Proxy',
    correctionRate,
    TARGETS.correctionRate.value,
    TARGETS.correctionRate.direction,
    'Review cognitive profile, check for blind spots',
  ));

  const passCount = dimensions.filter((d) => d.passing).length;
  const recommendations = dimensions
    .filter((d) => !d.passing && d.action !== null)
    .map((d) => `${d.name}: ${d.action}`);

  let overallHealth: EvaluationResult['overallHealth'];
  if (passCount === dimensions.length) {
    overallHealth = 'healthy';
  } else if (passCount >= 3) {
    overallHealth = 'degraded';
  } else {
    overallHealth = 'critical';
  }

  return {
    dimensions,
    overallHealth,
    passCount,
    totalDimensions: dimensions.length,
    recommendations,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Quick evaluation for per-session checks.
 * Only evaluates retrieval quality and correction rate.
 */
export function quickEvaluate(input: Pick<
  EvaluationInput,
  'helpfulRetrievals' | 'totalRetrievals' | 'corrections' | 'totalTasks'
>): { passing: boolean; issues: string[] } {
  const issues: string[] = [];

  if (input.totalRetrievals > 0) {
    const precision = input.helpfulRetrievals / input.totalRetrievals;
    if (precision < TARGETS.retrievalPrecision.value) {
      issues.push(`Low retrieval precision: ${(precision * 100).toFixed(0)}%`);
    }
  }

  if (input.totalTasks > 0) {
    const rate = input.corrections / input.totalTasks;
    if (rate > TARGETS.correctionRate.value) {
      issues.push(`High correction rate: ${(rate * 100).toFixed(0)}%`);
    }
  }

  return { passing: issues.length === 0, issues };
}

/**
 * Determine which evaluation schedule to use.
 */
export function getSchedule(
  lastFullEvaluation: string | null,
  lastWeeklyEvaluation: string | null,
): EvaluationSchedule {
  const now = Date.now();

  // Weekly: if no weekly eval in last 7 days
  if (!lastWeeklyEvaluation || now - Date.parse(lastWeeklyEvaluation) > 7 * 24 * 60 * 60 * 1000) {
    return 'weekly';
  }

  // Daily: if no full eval today
  if (!lastFullEvaluation || now - Date.parse(lastFullEvaluation) > 24 * 60 * 60 * 1000) {
    return 'daily';
  }

  return 'per_session';
}

/**
 * Check if a specific dimension is passing its target.
 */
export function isDimensionPassing(
  metric: number,
  target: number,
  direction: 'higher_is_better' | 'lower_is_better',
): boolean {
  if (direction === 'higher_is_better') {
    return metric >= target;
  }
  return metric <= target;
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function evaluateDimension(
  name: string,
  metric: number,
  target: number,
  direction: 'higher_is_better' | 'lower_is_better',
  actionIfFailing: string,
): EvaluationDimension {
  const passing = isDimensionPassing(metric, target, direction);

  return {
    name,
    metric,
    target,
    direction,
    passing,
    action: passing ? null : actionIfFailing,
  };
}
