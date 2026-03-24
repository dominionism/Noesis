/**
 * Predictive Failure — Predict failure modes before execution.
 *
 * Before a task executes, this module:
 * 1. Finds similar past tasks in learning_events
 * 2. Filters for those that failed
 * 3. Groups by failure class
 * 4. Returns likely failure modes with prevention guidance
 *
 * Uses keyword similarity (not embeddings) for lightweight prediction.
 * Embedding-based similarity can be layered in when the embedding
 * pipeline is wired up.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { CognitiveFailureClass } from './failure-classifier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FailurePrediction {
  failureClass: CognitiveFailureClass;
  likelihood: number;
  evidence: string;
  prevention: string;
}

export interface PredictionResult {
  predictions: FailurePrediction[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Predict failure modes for a task based on historical learning events.
 *
 * Algorithm:
 * 1. Extract keywords from task description
 * 2. Query recent learning events (last 200)
 * 3. Score each event by keyword overlap with the task
 * 4. Group matched events by failure class
 * 5. Compute likelihood as (matched count for class / total matches)
 * 6. Extract prevention rules from matched events
 *
 * Returns predictions sorted by likelihood descending.
 */
export function predictFailureModes(
  db: DatabaseConnection,
  taskDescription: string,
  _embedding: Buffer | null = null,
): PredictionResult {
  const taskKeywords = extractKeywords(taskDescription);

  if (taskKeywords.length === 0) {
    return { predictions: [] };
  }

  // Query recent learning events
  const events = db.prepare<[], {
    id: string;
    failure_class: string | null;
    root_cause: string | null;
    prevention_rule: string | null;
    memory_id: string;
  }>(`
    SELECT id, failure_class, root_cause, prevention_rule, memory_id
    FROM learning_events
    WHERE failure_class IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 200
  `).all();

  if (events.length === 0) {
    return { predictions: [] };
  }

  // Get memory content for keyword matching
  const memoryIds = events.map(e => e.memory_id);
  const placeholders = memoryIds.map(() => '?').join(',');
  const memories = db.prepare<string[], { id: string; content: string }>(`
    SELECT id, content FROM memories WHERE id IN (${placeholders})
  `).all(...memoryIds);

  const memoryMap = new Map(memories.map(m => [m.id, m.content]));

  // Score events by keyword overlap
  const scored: { event: typeof events[0]; score: number }[] = [];

  for (const event of events) {
    const content = memoryMap.get(event.memory_id) ?? '';
    const eventKeywords = extractKeywords(content);

    const overlap = taskKeywords.filter(k => eventKeywords.includes(k)).length;
    const score = taskKeywords.length > 0 ? overlap / taskKeywords.length : 0;

    if (score > 0.2) {
      scored.push({ event, score });
    }
  }

  if (scored.length === 0) {
    return { predictions: [] };
  }

  // Group by failure class
  const groups = new Map<string, { events: typeof scored; totalScore: number }>();

  for (const item of scored) {
    const fc = item.event.failure_class ?? 'unknown';
    const existing = groups.get(fc) ?? { events: [], totalScore: 0 };
    existing.events.push(item);
    existing.totalScore += item.score;
    groups.set(fc, existing);
  }

  // Convert to predictions
  const totalMatched = scored.length;
  const predictions: FailurePrediction[] = [];

  for (const [failureClass, group] of groups) {
    const cognitiveClass = toCognitiveFailureClass(failureClass);
    if (!cognitiveClass) continue;

    const likelihood = group.events.length / totalMatched;
    const bestEvent = group.events.sort((a, b) => b.score - a.score)[0];
    const evidence = bestEvent.event.root_cause ?? 'Similar task pattern detected';
    const prevention = bestEvent.event.prevention_rule ?? 'Review similar past failures';

    predictions.push({
      failureClass: cognitiveClass,
      likelihood,
      evidence,
      prevention,
    });
  }

  // Sort by likelihood descending
  predictions.sort((a, b) => b.likelihood - a.likelihood);

  return { predictions };
}

/**
 * Format predictions as preventive guidance text.
 *
 * Used in prompt assembly to inject failure awareness before execution.
 */
export function getPreventiveGuidance(
  predictions: FailurePrediction[],
): string {
  if (predictions.length === 0) {
    return '';
  }

  const lines: string[] = ['### Predicted Failure Modes'];

  for (const pred of predictions) {
    const pct = (pred.likelihood * 100).toFixed(0);
    lines.push(`- **${pred.failureClass}** (${pct}% likelihood): ${pred.evidence}`);
    lines.push(`  - Prevention: ${pred.prevention}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'and', 'but', 'or', 'not',
  'so', 'yet', 'for', 'with', 'about', 'to', 'from', 'in', 'on', 'at',
  'by', 'of', 'this', 'that', 'these', 'those', 'it', 'its',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

const VALID_COGNITIVE_FAILURE_CLASSES = new Set([
  'context_assembly',
  'planning',
  'tool_use',
  'verification',
  'creative_taste',
  'api_contract',
]);

/**
 * Maps DB-level failure classes (stored in learning_events CHECK constraint)
 * to cognitive failure classes (used by the prediction/classification system).
 *
 * The DB schema uses: logic_error, missing_context, wrong_assumption,
 * integration_failure, security_gap, performance_issue.
 *
 * The cognitive system uses: context_assembly, planning, tool_use,
 * verification, creative_taste, api_contract.
 */
const DB_TO_COGNITIVE_FAILURE_MAP: Record<string, CognitiveFailureClass> = {
  logic_error: 'planning',
  missing_context: 'context_assembly',
  wrong_assumption: 'planning',
  integration_failure: 'api_contract',
  security_gap: 'verification',
  performance_issue: 'tool_use',
};

function toCognitiveFailureClass(value: string): CognitiveFailureClass | null {
  if (VALID_COGNITIVE_FAILURE_CLASSES.has(value)) return value as CognitiveFailureClass;
  return DB_TO_COGNITIVE_FAILURE_MAP[value] ?? null;
}
