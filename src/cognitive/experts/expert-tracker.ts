/**
 * Expert Tracker — Performance tracking and outcome correlation.
 *
 * Records outcomes in the cognitive_outcomes table and updates
 * the expert's task_count and success_rate (Bayesian with Laplace smoothing).
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  ExpertDefinition,
  ExpertPerformance,
  CognitiveOutcomeResult,
  SignFn,
} from '../types.js';
import type { FailureClass } from '../../types.js';
import { generateId } from '../../core/ulid.js';
import { getExpert, updateExpert } from './expert-store.js';
import { EXPERT_PERFORMANCE_MIN_TASKS } from '../../constants.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record an expert outcome after task completion.
 *
 * 1. Inserts a cognitive_outcomes record for audit trail
 * 2. Updates the expert's task_count and success_rate (Bayesian)
 */
export function recordExpertOutcome(
  db: DatabaseConnection,
  expertId: string,
  taskDescription: string,
  outcome: CognitiveOutcomeResult,
  sign: SignFn,
  failureClass?: FailureClass,
  evidence?: string,
): void {
  const expert = getExpert(db, expertId);
  if (!expert) throw new Error(`Expert not found: ${expertId}`);

  const now = new Date().toISOString();

  // 1. Record outcome
  db.prepare<[
    string, string, string, string,
    string | null, string | null, string,
  ]>(`
    INSERT INTO cognitive_outcomes (
      id, entity_type, entity_id, task_description, outcome,
      failure_class, evidence, correction, created_at
    ) VALUES (?, 'expert', ?, ?, ?, ?, ?, NULL, ?)
  `).run(
    generateId(), expertId, taskDescription, outcome,
    failureClass ?? null, evidence ?? null, now,
  );

  // 2. Update expert statistics
  const newTaskCount = expert.task_count + 1;
  const successIncrement = outcome === 'success' ? 1 : (outcome === 'partial' ? 0.5 : 0);
  const rawSuccesses = expert.success_rate * expert.task_count + successIncrement;
  // Bayesian with Laplace smoothing
  const newSuccessRate = (rawSuccesses + 1) / (newTaskCount + 2);

  updateExpert(db, expertId, {
    task_count: newTaskCount,
    success_rate: newSuccessRate,
  }, sign);
}

/**
 * Get performance statistics for an expert.
 */
export function getExpertPerformance(
  db: DatabaseConnection,
  expertId: string,
  options?: { since?: string; failureClass?: FailureClass },
): ExpertPerformance {
  const conditions: string[] = ['entity_type = ?', 'entity_id = ?'];
  const params: (string | number)[] = ['expert', expertId];

  if (options?.since) {
    conditions.push('created_at >= ?');
    params.push(options.since);
  }

  if (options?.failureClass) {
    conditions.push('failure_class = ?');
    params.push(options.failureClass);
  }

  const stats = db.prepare<unknown[], {
    total: number;
    successes: number;
    failures: number;
  }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failures
    FROM cognitive_outcomes
    WHERE ${conditions.join(' AND ')}
  `).get(...params);

  const total = stats?.total ?? 0;
  const successes = stats?.successes ?? 0;

  // Common failure classes
  const failureRows = db.prepare<unknown[], { failure_class: string; cnt: number }>(`
    SELECT failure_class, COUNT(*) as cnt
    FROM cognitive_outcomes
    WHERE entity_type = 'expert' AND entity_id = ? AND outcome = 'failure' AND failure_class IS NOT NULL
    GROUP BY failure_class
    ORDER BY cnt DESC
    LIMIT 5
  `).all(expertId);

  return {
    task_count: total,
    success_rate: total > 0 ? successes / total : 0.5,
    common_failures: failureRows.map(r => r.failure_class),
  };
}

/**
 * Find the best expert for a given task type based on historical performance.
 *
 * Requires minimum tasks before trusting performance data.
 */
export function getBestExpertForTaskType(
  db: DatabaseConnection,
  taskKeywords: string[],
  minTasks: number = EXPERT_PERFORMANCE_MIN_TASKS,
): ExpertDefinition | null {
  // Get experts with enough outcomes for these keywords
  const keywordPattern = taskKeywords.map(k => `%${k}%`);

  if (keywordPattern.length === 0) return null;

  // Build LIKE conditions for task description matching
  const likeConditions = keywordPattern.map(() => 'task_description LIKE ?').join(' OR ');

  const rows = db.prepare<unknown[], {
    entity_id: string;
    total: number;
    successes: number;
  }>(`
    SELECT
      entity_id,
      COUNT(*) as total,
      SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes
    FROM cognitive_outcomes
    WHERE entity_type = 'expert' AND (${likeConditions})
    GROUP BY entity_id
    HAVING total >= ?
    ORDER BY (CAST(successes AS REAL) / total) DESC
    LIMIT 1
  `).all(...keywordPattern, minTasks);

  if (rows.length === 0) return null;

  return getExpert(db, rows[0].entity_id);
}
