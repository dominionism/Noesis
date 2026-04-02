/**
 * Composite Relevance Scoring
 *
 * Each scoring component is independently accessible to support the explain
 * feature. All component multipliers are returned alongside the final score.
 *
 * Formula:
 *   relevance(memory, query) =
 *     semantic_score(RRF-fused)
 *     * recency_modifier(last_accessed_at)
 *     * access_boost(access_count)
 *     * success_weight(outcome)
 *     * scope_boost(project match)
 */

import type { MemoryOutcome, MemoryScope, MemoryType } from '../types.js';
import { computeRelevanceForType } from '../intelligence/temporal-modeler.js';

/**
 * Compute a decay multiplier based on how recently a memory was accessed.
 *
 * Tiered step function rather than continuous decay so that the scoring
 * is explainable and auditable. Memories are never fully zeroed — even
 * very old memories retain a 0.5 multiplier.
 *
 * @returns A multiplier in the range [0.5, 1.0].
 */
export function computeRecencyModifier(lastAccessedAt: string): number {
  const accessDate = new Date(lastAccessedAt);
  const now = Date.now();
  const diffMs = now - accessDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) return 1.0;
  if (diffDays <= 30) return 0.9;
  if (diffDays <= 90) return 0.8;
  if (diffDays <= 365) return 0.7;
  return 0.5;
}

/**
 * Boost score for frequently-accessed memories using logarithmic scaling.
 *
 * Formula: 1.0 + min(log2(count + 1) / 10, 0.3)
 *
 * The log2 curve prevents high-access memories from dominating results.
 * The hard cap at 1.3x ensures diminishing returns.
 *
 * @returns A multiplier in the range [1.0, 1.3].
 */
export function computeAccessBoost(accessCount: number): number {
  const count = Math.max(0, accessCount);
  return 1.0 + Math.min(Math.log2(count + 1) / 10, 0.3);
}

/**
 * Weight the score based on the recorded outcome of the memory.
 *
 * Successful memories are prioritized. Failed memories are strongly
 * demoted (0.3) but not excluded — they may be useful for anti-pattern
 * detection. Null outcome receives no penalty.
 *
 * @returns A multiplier in the range [0.3, 1.0].
 */
export function computeSuccessWeight(outcome: MemoryOutcome | null): number {
  if (outcome === null) return 1.0;
  switch (outcome) {
    case 'success':
      return 1.0;
    case 'failed_then_fixed':
      return 0.9;
    case 'partial_success':
      return 0.7;
    case 'failed':
      return 0.3;
    default: {
      const _exhaustive: never = outcome;
      void _exhaustive;
      return 1.0;
    }
  }
}

/**
 * Boost or penalize based on project scope alignment.
 *
 * Same-project memories get a significant 1.5x boost because they are
 * most likely relevant. Global memories get 0.9 (slight penalty since
 * they are less specific). Cross-project memories get 0.6 to prevent
 * information leakage across isolated projects.
 *
 * @returns A multiplier in the range [0.6, 1.5].
 */
export function computeScopeBoost(
  memoryProjectId: string | null,
  memoryScope: MemoryScope,
  queryProjectId?: string,
): number {
  if (memoryScope === 'global') return 0.9;

  if (
    queryProjectId !== undefined &&
    memoryProjectId !== null &&
    memoryProjectId === queryProjectId
  ) {
    return 1.5;
  }

  return 0.6;
}

export interface CompositeScoreParams {
  semanticScore: number;
  lastAccessedAt: string;
  accessCount: number;
  outcome: MemoryOutcome | null;
  memoryProjectId: string | null;
  memoryScope: MemoryScope;
  queryProjectId?: string;
  /** Memory type for type-aware temporal decay (optional — falls back to recency modifier). */
  memoryType?: MemoryType;
}

export interface CompositeScoreResult {
  finalScore: number;
  recencyModifier: number;
  accessBoost: number;
  successWeight: number;
  scopeBoost: number;
  /** Type-aware temporal relevance modifier from intelligence/temporal-modeler. */
  temporalModifier: number;
}

/**
 * Compute the full composite relevance score for a memory.
 *
 * Each component multiplier is returned alongside the final score so
 * that the explain feature can surface per-factor breakdowns.
 */
export function computeCompositeScore(params: CompositeScoreParams): CompositeScoreResult {
  const recencyModifier = computeRecencyModifier(params.lastAccessedAt);
  const accessBoost = computeAccessBoost(params.accessCount);
  const successWeight = computeSuccessWeight(params.outcome);
  const scopeBoost = computeScopeBoost(
    params.memoryProjectId,
    params.memoryScope,
    params.queryProjectId,
  );

  // Type-aware temporal decay from intelligence/temporal-modeler
  let temporalModifier = 1.0;
  if (params.memoryType) {
    const accessDate = new Date(params.lastAccessedAt);
    const ageDays = (Date.now() - accessDate.getTime()) / (1000 * 60 * 60 * 24);
    temporalModifier = computeRelevanceForType(params.memoryType as never, ageDays);
  }

  const finalScore =
    params.semanticScore * recencyModifier * accessBoost * successWeight * scopeBoost * temporalModifier;

  return {
    finalScore,
    recencyModifier,
    accessBoost,
    successWeight,
    scopeBoost,
    temporalModifier,
  };
}

// ---------------------------------------------------------------------------
// Freshness decay and deduplication
// ---------------------------------------------------------------------------

/**
 * Compute freshness-aware decay that aggressively penalizes stale memories
 * while preserving durable facts.
 *
 * Durable types (decision, architecture, convention) decay very slowly.
 * Ephemeral types (task, session, checkpoint) decay rapidly.
 */
export function computeFreshnessDecay(
  memory: { type: string; created_at: string; last_accessed_at: string | null },
  nowMs: number = Date.now(),
): number {
  const durableTypes = new Set(['decision', 'architecture', 'convention', 'preference']);
  const ephemeralTypes = new Set(['task', 'session', 'checkpoint']);

  const createdMs = new Date(memory.created_at).getTime();
  const accessedMs = memory.last_accessed_at
    ? new Date(memory.last_accessed_at).getTime()
    : createdMs;
  const latestMs = Math.max(createdMs, accessedMs);
  const ageDays = (nowMs - latestMs) / (1000 * 60 * 60 * 24);

  if (durableTypes.has(memory.type)) {
    // Durable: very slow decay — 90% at 365 days
    return Math.max(0.1, 1.0 - (ageDays / 3650));
  }

  if (ephemeralTypes.has(memory.type)) {
    // Ephemeral: fast decay — 50% at 7 days, ~10% at 30 days
    return Math.max(0.05, Math.exp(-ageDays / 10));
  }

  // Default: moderate decay — 80% at 30 days, 50% at 90 days
  return Math.max(0.1, Math.exp(-ageDays / 130));
}

/**
 * Detect near-duplicate memories using content similarity heuristics.
 * Returns indices of memories that should be deduplicated (keeping the newest).
 */
export function detectDuplicates(
  memories: Array<{ id: string; title: string; content: string; created_at: string; type: string }>,
  similarityThreshold: number = 0.85,
): Set<string> {
  const duplicateIds = new Set<string>();

  for (let i = 0; i < memories.length; i++) {
    if (duplicateIds.has(memories[i].id)) continue;

    for (let j = i + 1; j < memories.length; j++) {
      if (duplicateIds.has(memories[j].id)) continue;
      if (memories[i].type !== memories[j].type) continue;

      const similarity = computeJaccardSimilarity(
        memories[i].title + ' ' + memories[i].content,
        memories[j].title + ' ' + memories[j].content,
      );

      if (similarity >= similarityThreshold) {
        // Keep newer, mark older as duplicate
        const olderIdx = memories[i].created_at < memories[j].created_at ? i : j;
        duplicateIds.add(memories[olderIdx].id);
      }
    }
  }

  return duplicateIds;
}

function computeJaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
