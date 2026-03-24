/**
 * Confidence Propagation Through Dependency Edges
 *
 * When a memory's confidence changes, this propagates through 'requires'
 * edges. If memory A requires memory B, and B's confidence drops,
 * A's effective confidence is reduced proportionally.
 */

import type { DatabaseConnection } from '../core/database.js';
import type { KnowledgeEdge } from '../types.js';

/**
 * Compute the effective confidence of a memory considering all its dependencies.
 *
 * Effective confidence = own_confidence * min(dependency_confidences)
 *
 * Only follows 'requires' edges to find dependencies.
 * Cycle detection prevents infinite recursion.
 */
export function computeEffectiveConfidence(
  db: DatabaseConnection,
  memoryId: string,
  visited: Set<string> = new Set(),
): number {
  // Cycle detection
  if (visited.has(memoryId)) {
    return 1.0; // Break cycle by assuming full confidence
  }
  visited.add(memoryId);

  // Get the memory's own confidence
  const memory = db.prepare<[string], { confidence: number }>(
    'SELECT confidence FROM memories WHERE id = ?',
  ).get(memoryId);

  if (!memory) return 0;

  const ownConfidence = memory.confidence;

  // Find all memories this one requires
  const dependencies = db.prepare<[string], KnowledgeEdge>(
    `SELECT * FROM memory_edges WHERE source_id = ? AND relation = 'requires'`,
  ).all(memoryId);

  if (dependencies.length === 0) {
    return ownConfidence;
  }

  // Effective confidence is own * minimum dependency confidence
  let minDepConfidence = 1.0;
  for (const dep of dependencies) {
    const depConfidence = computeEffectiveConfidence(db, dep.target_id, new Set(visited));
    // Weight the dependency confidence by edge weight
    const weightedConfidence = depConfidence * dep.weight;
    if (weightedConfidence < minDepConfidence) {
      minDepConfidence = weightedConfidence;
    }
  }

  return ownConfidence * minDepConfidence;
}

/**
 * When a memory's confidence changes, find all memories that depend on it
 * (via 'requires' edges) and return their updated effective confidences.
 *
 * This does NOT write to the database — it returns the computed values
 * so the caller can decide what to do (advisory, not mutating).
 */
export function propagateConfidenceChange(
  db: DatabaseConnection,
  changedMemoryId: string,
): Array<{ memoryId: string; effectiveConfidence: number }> {
  const results: Array<{ memoryId: string; effectiveConfidence: number }> = [];

  // Find all memories that require the changed memory (incoming 'requires' edges)
  const dependents = db.prepare<[string], { source_id: string }>(
    `SELECT source_id FROM memory_edges WHERE target_id = ? AND relation = 'requires'`,
  ).all(changedMemoryId);

  for (const dep of dependents) {
    const effective = computeEffectiveConfidence(db, dep.source_id);
    results.push({
      memoryId: dep.source_id,
      effectiveConfidence: effective,
    });
  }

  return results;
}

/**
 * Batch compute effective confidences for a set of memories.
 * Useful for retrieval re-ranking.
 */
export function batchEffectiveConfidence(
  db: DatabaseConnection,
  memoryIds: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const id of memoryIds) {
    result.set(id, computeEffectiveConfidence(db, id));
  }
  return result;
}
