/**
 * Causal Chain Construction and Retrieval
 *
 * Follows 'causes' and 'caused_by' edges to construct ordered reasoning
 * paths through the knowledge graph. When a failure is diagnosed, the
 * chain of decisions that led to it is recorded. When a similar situation
 * arises, the full chain is retrieved.
 */

import type { DatabaseConnection } from '../core/database.js';
import type { CausalChain, KnowledgeEdge } from '../types.js';
import { MAX_GRAPH_DEPTH } from '../constants.js';

/**
 * Build a causal chain starting from a given memory, following 'causes' edges forward.
 *
 * Returns the chain from the starting memory to the final effect.
 * Detects cycles to prevent infinite loops.
 */
export function buildCausalChainForward(
  db: DatabaseConnection,
  startId: string,
  maxLength: number = MAX_GRAPH_DEPTH,
): CausalChain | null {
  const chain: string[] = [startId];
  const relations: CausalChain['relation_types'] = [];
  const visited = new Set<string>([startId]);
  let totalWeight = 0;
  let minConfidence = Infinity;

  let currentId = startId;

  // Get confidence of starting memory
  const startMem = db.prepare<[string], { confidence: number }>(
    'SELECT confidence FROM memories WHERE id = ?',
  ).get(startId);
  if (startMem) {
    minConfidence = startMem.confidence;
  }

  for (let step = 0; step < maxLength; step++) {
    // Find 'causes' edges from current node
    const edge = db.prepare<[string], KnowledgeEdge>(
      `SELECT * FROM memory_edges
       WHERE source_id = ? AND relation = 'causes'
       ORDER BY weight DESC LIMIT 1`,
    ).get(currentId);

    if (!edge) break;
    if (visited.has(edge.target_id)) break; // Cycle detected

    visited.add(edge.target_id);
    chain.push(edge.target_id);
    relations.push('causes');
    totalWeight += edge.weight;

    // Track minimum confidence across chain
    const mem = db.prepare<[string], { confidence: number }>(
      'SELECT confidence FROM memories WHERE id = ?',
    ).get(edge.target_id);
    if (mem && mem.confidence < minConfidence) {
      minConfidence = mem.confidence;
    }

    currentId = edge.target_id;
  }

  if (chain.length <= 1) return null;

  return {
    chain,
    relation_types: relations,
    total_weight: totalWeight,
    confidence: minConfidence === Infinity ? 0 : minConfidence,
  };
}

/**
 * Build a causal chain backward from an effect, following 'caused_by' edges.
 *
 * Returns the chain from root cause to the given effect.
 */
export function buildCausalChainBackward(
  db: DatabaseConnection,
  effectId: string,
  maxLength: number = MAX_GRAPH_DEPTH,
): CausalChain | null {
  const chain: string[] = [effectId];
  const relations: CausalChain['relation_types'] = [];
  const visited = new Set<string>([effectId]);
  let totalWeight = 0;
  let minConfidence = Infinity;

  let currentId = effectId;

  const effectMem = db.prepare<[string], { confidence: number }>(
    'SELECT confidence FROM memories WHERE id = ?',
  ).get(effectId);
  if (effectMem) {
    minConfidence = effectMem.confidence;
  }

  for (let step = 0; step < maxLength; step++) {
    // Find 'caused_by' edges (or reverse 'causes' edges)
    const edge = db.prepare<[string, string], KnowledgeEdge>(
      `SELECT * FROM memory_edges
       WHERE (source_id = ? AND relation = 'caused_by')
          OR (target_id = ? AND relation = 'causes')
       ORDER BY weight DESC LIMIT 1`,
    ).get(currentId, currentId);

    if (!edge) break;

    const nextId = edge.source_id === currentId ? edge.target_id : edge.source_id;
    if (visited.has(nextId)) break; // Cycle detected

    visited.add(nextId);
    chain.unshift(nextId); // Prepend to build root-cause-first order
    relations.unshift('caused_by');
    totalWeight += edge.weight;

    const mem = db.prepare<[string], { confidence: number }>(
      'SELECT confidence FROM memories WHERE id = ?',
    ).get(nextId);
    if (mem && mem.confidence < minConfidence) {
      minConfidence = mem.confidence;
    }

    currentId = nextId;
  }

  if (chain.length <= 1) return null;

  return {
    chain,
    relation_types: relations,
    total_weight: totalWeight,
    confidence: minConfidence === Infinity ? 0 : minConfidence,
  };
}

/**
 * Find all causal chains a memory participates in.
 *
 * Searches both forward (as a cause) and backward (as an effect).
 */
export function findCausalChains(
  db: DatabaseConnection,
  memoryId: string,
  maxLength: number = MAX_GRAPH_DEPTH,
): CausalChain[] {
  const chains: CausalChain[] = [];

  const forward = buildCausalChainForward(db, memoryId, maxLength);
  if (forward) chains.push(forward);

  const backward = buildCausalChainBackward(db, memoryId, maxLength);
  if (backward) chains.push(backward);

  return chains;
}
