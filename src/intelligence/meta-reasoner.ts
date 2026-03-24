/**
 * Meta-Reasoner
 *
 * Reasons about HOW the system is reasoning, detecting when the
 * current approach is suboptimal and suggesting course corrections.
 *
 * 5 Meta-Reasoning Capabilities:
 * 1. Approach Monitoring — is the current approach making progress?
 * 2. Strategy Switching — re-evaluate when current strategy fails
 * 3. Confidence Calibration — track confidence vs actual outcomes
 * 4. Resource Optimization — context budget vs information gain
 * 5. Learning Rate Monitoring — is the system actually learning?
 */

// ===========================================================================
// Types
// ===========================================================================

export type MetaSignalType =
  | 'stuck_detected'
  | 'strategy_switch_recommended'
  | 'overconfident'
  | 'underconfident'
  | 'resource_waste'
  | 'learning_plateau';

export interface MetaSignal {
  type: MetaSignalType;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  recommendation: string;
  data: Record<string, unknown>;
}

export interface ProgressState {
  stepsCompleted: number;
  stepsTotal: number;
  timeElapsedMs: number;
  timeEstimatedMs: number;
  failedSteps: number;
}

export interface ConfidenceRecord {
  predicted: number;
  actual: boolean; // success or not
  timestamp: string;
}

export interface ResourceUsage {
  tokensInjected: number;
  tokensBudget: number;
  retrievalHits: number;
  retrievalTotal: number;
}

export interface LearningMetrics {
  repeatFailureRate: number;
  skillAdoptionRate: number;
  predictionAccuracy: number;
  correctionRate: number;
}

export interface MetaAnalysis {
  signals: MetaSignal[];
  isHealthy: boolean;
  calibrationFactor: number;
  recommendations: string[];
}

// ===========================================================================
// Constants
// ===========================================================================

const STUCK_PROGRESS_THRESHOLD = 0.3;
const STUCK_TIME_THRESHOLD = 0.5;
const STRATEGY_SWITCH_FAILED_STEPS = 2;
const STRATEGY_SWITCH_SCORE_GAP = 0.2;
const OVERCONFIDENT_THRESHOLD = 0.3;
const UNDERCONFIDENT_THRESHOLD = 0.3;
const RESOURCE_WASTE_HIT_RATE = 0.3;
const LEARNING_PLATEAU_REPEAT_RATE = 0.2;
const MIN_CALIBRATION_SAMPLES = 5;

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Monitor approach progress and detect if stuck.
 */
export function monitorProgress(state: ProgressState): MetaSignal | null {
  if (state.stepsTotal === 0 || state.timeEstimatedMs === 0) return null;

  const progressRatio = state.stepsCompleted / state.stepsTotal;
  const timeRatio = state.timeElapsedMs / state.timeEstimatedMs;

  // Stuck: less than 30% progress at 50%+ estimated time
  if (progressRatio < STUCK_PROGRESS_THRESHOLD && timeRatio >= STUCK_TIME_THRESHOLD) {
    return {
      type: 'stuck_detected',
      severity: 'warning',
      description: `Progress ${(progressRatio * 100).toFixed(0)}% at ${(timeRatio * 100).toFixed(0)}% of estimated time`,
      recommendation: 'Consider re-evaluating the current approach or breaking the task into smaller steps',
      data: { progressRatio, timeRatio, failedSteps: state.failedSteps },
    };
  }

  return null;
}

/**
 * Check if a strategy switch should be recommended.
 */
export function shouldSwitchStrategy(
  currentScore: number,
  alternativeScore: number,
  failedSteps: number,
): MetaSignal | null {
  if (failedSteps < STRATEGY_SWITCH_FAILED_STEPS) return null;

  const scoreGap = alternativeScore - currentScore;
  if (scoreGap < STRATEGY_SWITCH_SCORE_GAP) return null;

  return {
    type: 'strategy_switch_recommended',
    severity: 'warning',
    description: `Current strategy has ${failedSteps} failed steps. Alternative scores ${(scoreGap * 100).toFixed(0)}% higher`,
    recommendation: 'Re-run strategy simulation with updated evidence and switch to the higher-scoring alternative',
    data: { currentScore, alternativeScore, scoreGap, failedSteps },
  };
}

/**
 * Calibrate confidence based on historical predictions vs outcomes.
 *
 * Returns a calibration factor: >1 means system is underconfident,
 * <1 means overconfident.
 */
export function calibrateConfidence(records: ConfidenceRecord[]): {
  factor: number;
  signal: MetaSignal | null;
} {
  if (records.length < MIN_CALIBRATION_SAMPLES) {
    return { factor: 1.0, signal: null };
  }

  const avgPredicted = records.reduce((s, r) => s + r.predicted, 0) / records.length;
  const avgActual = records.filter((r) => r.actual).length / records.length;

  const factor = avgActual > 0 ? avgActual / avgPredicted : 0.5;

  let signal: MetaSignal | null = null;

  if (avgPredicted - avgActual > OVERCONFIDENT_THRESHOLD) {
    signal = {
      type: 'overconfident',
      severity: 'warning',
      description: `System predicted ${(avgPredicted * 100).toFixed(0)}% success but achieved ${(avgActual * 100).toFixed(0)}%`,
      recommendation: 'Reduce confidence estimates by calibration factor',
      data: { avgPredicted, avgActual, factor, sampleCount: records.length },
    };
  } else if (avgActual - avgPredicted > UNDERCONFIDENT_THRESHOLD) {
    signal = {
      type: 'underconfident',
      severity: 'info',
      description: `System predicted ${(avgPredicted * 100).toFixed(0)}% success but achieved ${(avgActual * 100).toFixed(0)}%`,
      recommendation: 'Increase confidence estimates by calibration factor',
      data: { avgPredicted, avgActual, factor, sampleCount: records.length },
    };
  }

  return { factor: Math.max(0.5, Math.min(2.0, factor)), signal };
}

/**
 * Check resource utilization efficiency.
 */
export function checkResourceEfficiency(usage: ResourceUsage): MetaSignal | null {
  if (usage.retrievalTotal === 0) return null;

  const hitRate = usage.retrievalHits / usage.retrievalTotal;
  const utilizationRate = usage.tokensInjected / usage.tokensBudget;

  if (hitRate < RESOURCE_WASTE_HIT_RATE && utilizationRate > 0.5) {
    return {
      type: 'resource_waste',
      severity: 'warning',
      description: `Low retrieval hit rate (${(hitRate * 100).toFixed(0)}%) with high context utilization (${(utilizationRate * 100).toFixed(0)}%)`,
      recommendation: 'Adjust context economy weights to prioritize higher-value memories',
      data: { hitRate, utilizationRate, tokensInjected: usage.tokensInjected },
    };
  }

  return null;
}

/**
 * Monitor learning effectiveness.
 */
export function monitorLearning(metrics: LearningMetrics): MetaSignal | null {
  if (metrics.repeatFailureRate > LEARNING_PLATEAU_REPEAT_RATE) {
    return {
      type: 'learning_plateau',
      severity: 'warning',
      description: `Repeat failure rate (${(metrics.repeatFailureRate * 100).toFixed(0)}%) exceeds threshold`,
      recommendation: 'Run system maintenance: gc, re-clustering, profile review',
      data: {
        repeatFailureRate: metrics.repeatFailureRate,
        skillAdoptionRate: metrics.skillAdoptionRate,
        predictionAccuracy: metrics.predictionAccuracy,
        correctionRate: metrics.correctionRate,
      },
    };
  }

  return null;
}

/**
 * Run full meta-analysis combining all 5 capabilities.
 */
export function analyze(params: {
  progress?: ProgressState;
  currentStrategyScore?: number;
  alternativeStrategyScore?: number;
  confidenceRecords?: ConfidenceRecord[];
  resourceUsage?: ResourceUsage;
  learningMetrics?: LearningMetrics;
}): MetaAnalysis {
  const signals: MetaSignal[] = [];
  const recommendations: string[] = [];

  // 1. Progress monitoring
  if (params.progress) {
    const signal = monitorProgress(params.progress);
    if (signal) {
      signals.push(signal);
      recommendations.push(signal.recommendation);
    }
  }

  // 2. Strategy switching
  if (
    params.currentStrategyScore !== undefined &&
    params.alternativeStrategyScore !== undefined &&
    params.progress
  ) {
    const signal = shouldSwitchStrategy(
      params.currentStrategyScore,
      params.alternativeStrategyScore,
      params.progress.failedSteps,
    );
    if (signal) {
      signals.push(signal);
      recommendations.push(signal.recommendation);
    }
  }

  // 3. Confidence calibration
  let calibrationFactor = 1.0;
  if (params.confidenceRecords) {
    const result = calibrateConfidence(params.confidenceRecords);
    calibrationFactor = result.factor;
    if (result.signal) {
      signals.push(result.signal);
      recommendations.push(result.signal.recommendation);
    }
  }

  // 4. Resource optimization
  if (params.resourceUsage) {
    const signal = checkResourceEfficiency(params.resourceUsage);
    if (signal) {
      signals.push(signal);
      recommendations.push(signal.recommendation);
    }
  }

  // 5. Learning rate monitoring
  if (params.learningMetrics) {
    const signal = monitorLearning(params.learningMetrics);
    if (signal) {
      signals.push(signal);
      recommendations.push(signal.recommendation);
    }
  }

  const hasCritical = signals.some((s) => s.severity === 'critical');
  const hasWarning = signals.some((s) => s.severity === 'warning');
  const isHealthy = !hasCritical && !hasWarning;

  return {
    signals,
    isHealthy,
    calibrationFactor,
    recommendations,
  };
}
