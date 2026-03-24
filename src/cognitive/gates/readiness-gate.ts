/**
 * Readiness Gate — Evidence-backed readiness scoring.
 *
 * Extends the base 5-dimension readiness system with memory evidence:
 * - Past successes with similar tasks boost confidence
 * - Past failures increase required threshold
 * - Anti-pattern awareness adjusts risk dimension
 * - Historical readiness-to-outcome correlation calibrates thresholds
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { ReadinessScore, ReadinessGap, Memory } from '../../types.js';
import type { CognitiveOutcomeResult, SignFn } from '../types.js';
import { generateId } from '../../core/ulid.js';
import {
  READINESS_THRESHOLD_TOTAL,
  READINESS_THRESHOLD_CLARITY,
  READINESS_THRESHOLD_CODEBASE,
} from '../../constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReadinessEvidence {
  similarPastTasks: Memory[];
  pastReadinessOutcomes: { score: number; outcome: CognitiveOutcomeResult }[];
  relevantFailures: Memory[];
  relevantAntiPatternCount: number;
}

export interface EnhancedReadinessInput {
  taskDescription: string;
  hasGoal: boolean;
  hasDeliverable: boolean;
  constraintsIdentified: number;
  codebaseExplored: boolean;
  architectureUnderstood: boolean;
  risksIdentified: number;
  hasVerificationPlan: boolean;
  validationCriteria: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute evidence-backed readiness score.
 *
 * Base scoring across 5 dimensions (0-20 each), then adjusted
 * by memory evidence from similar past tasks.
 */
export function computeEvidenceBackedReadiness(
  input: EnhancedReadinessInput,
  evidence: ReadinessEvidence,
): ReadinessScore {
  // Base dimension scoring
  let clarity = scoreClarity(input);
  let codebase = scoreCodebase(input);
  let constraints = scoreConstraints(input);
  let risks = scoreRisks(input);
  let verification = scoreVerification(input);

  // Memory evidence adjustments
  const { memoryBoost, failurePenalty } = computeEvidenceAdjustments(evidence);

  // Apply memory boost (distributed across dimensions)
  clarity = clamp(clarity + memoryBoost, 0, 20);
  codebase = clamp(codebase + memoryBoost, 0, 20);

  // Apply failure penalty to risk dimension
  risks = clamp(risks - failurePenalty, 0, 20);

  // Anti-pattern awareness reduces risk score if patterns not addressed
  if (evidence.relevantAntiPatternCount > 0 && input.risksIdentified < evidence.relevantAntiPatternCount) {
    risks = clamp(risks - 2, 0, 20);
  }

  const total = clarity + codebase + constraints + risks + verification;
  const gaps = identifyGaps(clarity, codebase, constraints, risks, verification);

  const passed = total >= READINESS_THRESHOLD_TOTAL &&
    clarity >= READINESS_THRESHOLD_CLARITY &&
    codebase >= READINESS_THRESHOLD_CODEBASE;

  return { clarity, codebase, constraints, risks, verification, total, passed, gaps };
}

/**
 * Get historical readiness-to-outcome correlation from cognitive_outcomes.
 */
export function getHistoricalReadinessCorrelation(
  db: DatabaseConnection,
  projectId?: string,
): { averagePassedScore: number; averageFailedScore: number; correlation: number } {
  // Query outcomes for readiness gate
  const conditions = ['entity_type = ?'];
  const params: (string | number)[] = ['gate'];

  const rows = db.prepare<unknown[], {
    outcome: string;
    evidence: string | null;
  }>(`
    SELECT outcome, evidence FROM cognitive_outcomes
    WHERE entity_type = 'gate' AND entity_id LIKE 'readiness%'
    ORDER BY created_at DESC LIMIT 50
  `).all();

  let passedTotal = 0;
  let passedCount = 0;
  let failedTotal = 0;
  let failedCount = 0;

  for (const row of rows) {
    const score = parseScoreFromEvidence(row.evidence);
    if (score === null) continue;

    if (row.outcome === 'success') {
      passedTotal += score;
      passedCount++;
    } else if (row.outcome === 'failure') {
      failedTotal += score;
      failedCount++;
    }
  }

  const avgPassed = passedCount > 0 ? passedTotal / passedCount : 70;
  const avgFailed = failedCount > 0 ? failedTotal / failedCount : 50;
  const totalCount = passedCount + failedCount;
  const correlation = totalCount >= 5
    ? (avgPassed - avgFailed) / 100
    : 0;

  return {
    averagePassedScore: avgPassed,
    averageFailedScore: avgFailed,
    correlation,
  };
}

/**
 * Record a readiness gate outcome in cognitive_outcomes.
 */
export function recordReadinessOutcome(
  db: DatabaseConnection,
  score: ReadinessScore,
  taskOutcome: CognitiveOutcomeResult,
  taskDescription: string,
  sign: SignFn,
): void {
  const now = new Date().toISOString();
  const evidence = `score=${score.total},passed=${score.passed}`;
  const signature = sign(evidence);

  db.prepare<[
    string, string, string,
    string, string | null, string,
  ]>(`
    INSERT INTO cognitive_outcomes (
      id, entity_type, entity_id, task_description, outcome,
      evidence, created_at
    ) VALUES (?, 'gate', ?, ?, ?, ?, ?)
  `).run(
    generateId(), `readiness_${score.total}`, taskDescription,
    taskOutcome, evidence, now,
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function scoreClarity(input: EnhancedReadinessInput): number {
  let score = 0;
  if (input.hasGoal) score += 8;
  if (input.hasDeliverable) score += 7;
  if (input.taskDescription.length > 50) score += 3;
  if (input.taskDescription.length > 200) score += 2;
  return clamp(score, 0, 20);
}

function scoreCodebase(input: EnhancedReadinessInput): number {
  let score = 0;
  if (input.codebaseExplored) score += 10;
  if (input.architectureUnderstood) score += 10;
  return clamp(score, 0, 20);
}

function scoreConstraints(input: EnhancedReadinessInput): number {
  const perConstraint = 5;
  return clamp(input.constraintsIdentified * perConstraint, 0, 20);
}

function scoreRisks(input: EnhancedReadinessInput): number {
  const base = input.risksIdentified >= 1 ? 10 : 0;
  const additional = Math.min(input.risksIdentified - 1, 2) * 5;
  return clamp(base + additional, 0, 20);
}

function scoreVerification(input: EnhancedReadinessInput): number {
  let score = 0;
  if (input.hasVerificationPlan) score += 10;
  score += Math.min(input.validationCriteria, 2) * 5;
  return clamp(score, 0, 20);
}

function computeEvidenceAdjustments(
  evidence: ReadinessEvidence,
): { memoryBoost: number; failurePenalty: number } {
  // Memory boost: similar past successes increase confidence
  const successCount = evidence.similarPastTasks.filter(
    m => m.outcome === 'success',
  ).length;
  const memoryBoost = Math.min(successCount * 2, 5);

  // Failure penalty: similar past failures require more rigor
  const failureCount = evidence.relevantFailures.length;
  const failurePenalty = Math.min(failureCount * 2, 5);

  return { memoryBoost, failurePenalty };
}

function identifyGaps(
  clarity: number,
  codebase: number,
  constraints: number,
  risks: number,
  verification: number,
): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];

  if (clarity < READINESS_THRESHOLD_CLARITY) {
    gaps.push({
      dimension: 'clarity',
      current: clarity,
      required: READINESS_THRESHOLD_CLARITY,
      suggestion: 'Define a clear goal and concrete deliverable',
    });
  }

  if (codebase < READINESS_THRESHOLD_CODEBASE) {
    gaps.push({
      dimension: 'codebase',
      current: codebase,
      required: READINESS_THRESHOLD_CODEBASE,
      suggestion: 'Explore the codebase and understand the architecture',
    });
  }

  if (constraints < 10) {
    gaps.push({
      dimension: 'constraints',
      current: constraints,
      required: 10,
      suggestion: 'Identify at least two constraints or requirements',
    });
  }

  if (risks < 10) {
    gaps.push({
      dimension: 'risks',
      current: risks,
      required: 10,
      suggestion: 'Identify at least one risk or potential failure mode',
    });
  }

  if (verification < 10) {
    gaps.push({
      dimension: 'verification',
      current: verification,
      required: 10,
      suggestion: 'Define a verification plan with validation criteria',
    });
  }

  return gaps;
}

function parseScoreFromEvidence(evidence: string | null): number | null {
  if (!evidence) return null;
  const match = evidence.match(/score=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
