/**
 * Expert Registry — High-level expert lifecycle management.
 *
 * Coordinates the expert store, router, and tracker into a single
 * coherent API for the prompt orchestration engine.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  ExpertDefinition,
  ExpertMatch,
  ExpertCategory,
  CognitiveOutcomeResult,
  SignFn,
} from '../types.js';
import type { FailureClass } from '../../types.js';
import { getExpert, getExpertByName, listExperts, updateExpert } from './expert-store.js';
import { routeToExpert, shouldRouteToExpert, formatExpertForContext } from './expert-router.js';
import { recordExpertOutcome, getExpertPerformance, getBestExpertForTaskType } from './expert-tracker.js';
import { seedBuiltInExperts } from './built-in-experts.js';
import { EXPERT_ARCHIVE_THRESHOLD, EXPERT_PERFORMANCE_MIN_TASKS } from '../../constants.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the expert system — seeds built-in experts if not present.
 */
export function initializeExperts(db: DatabaseConnection, sign: SignFn): number {
  return seedBuiltInExperts(db, sign);
}

/**
 * Find the best expert for a task, considering triggers, embeddings, and history.
 *
 * Returns null if no expert meets the minimum score threshold or
 * if the task is too simple to warrant expert routing.
 */
export function findExpertForTask(
  db: DatabaseConnection,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null,
  options?: {
    preferCategory?: ExpertCategory;
    excludeExperts?: string[];
  },
): ExpertMatch | null {
  if (!shouldRouteToExpert(taskDescription)) {
    return null;
  }

  const matches = routeToExpert(db, taskDescription, taskKeywords, embedding, {
    ...options,
    maxResults: 1,
  });

  return matches.length > 0 ? matches[0] : null;
}

/**
 * Get multiple expert matches for complex tasks that may benefit
 * from multiple perspectives.
 */
export function findExpertsForTask(
  db: DatabaseConnection,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null,
  maxResults: number = 3,
): ExpertMatch[] {
  return routeToExpert(db, taskDescription, taskKeywords, embedding, { maxResults });
}

/**
 * Record the outcome of an expert's work on a task.
 */
export function completeExpertTask(
  db: DatabaseConnection,
  expertId: string,
  taskDescription: string,
  outcome: CognitiveOutcomeResult,
  sign: SignFn,
  failureClass?: FailureClass,
  evidence?: string,
): void {
  recordExpertOutcome(db, expertId, taskDescription, outcome, sign, failureClass, evidence);
}

/**
 * Get a formatted expert definition suitable for context injection.
 */
export function getExpertContext(
  db: DatabaseConnection,
  expertId: string,
  tokenBudget: number,
): string | null {
  const expert = getExpert(db, expertId);
  if (!expert) return null;
  return formatExpertForContext(expert, tokenBudget);
}

/**
 * Check if any experts should be archived based on poor performance.
 * Returns expert names that were archived.
 */
export function auditExpertPerformance(
  db: DatabaseConnection,
  sign: SignFn,
): string[] {
  const experts = listExperts(db, { enabled: true });
  const archived: string[] = [];

  for (const expert of experts) {
    if (expert.task_count < EXPERT_PERFORMANCE_MIN_TASKS) continue;
    if (expert.success_rate < EXPERT_ARCHIVE_THRESHOLD) {
      updateExpert(db, expert.id, { enabled: false }, sign);
      archived.push(expert.name);
    }
  }

  return archived;
}

// Re-export for convenience
export { getExpert, getExpertByName, listExperts } from './expert-store.js';
export { shouldRouteToExpert, formatExpertForContext } from './expert-router.js';
export { getExpertPerformance, getBestExpertForTaskType } from './expert-tracker.js';
