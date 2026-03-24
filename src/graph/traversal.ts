/**
 * Multi-hop Graph Traversal
 *
 * BFS traversal from seed memory IDs with:
 * - Configurable max depth (default: MAX_GRAPH_DEPTH = 3)
 * - Fan-out caps per node (default: MAX_GRAPH_FANOUT = 10)
 * - Optional relation-type filtering
 * - Distance tracking from seeds
 */

import type { DatabaseConnection } from '../core/database.js';
import type { EdgeRelation } from '../constants.js';
import { MAX_GRAPH_DEPTH, MAX_GRAPH_FANOUT } from '../constants.js';

export interface TraversalResult {
  /** Memory ID */
  id: string;
  /** Distance from nearest seed (0 = seed itself) */
  depth: number;
}

/**
 * Perform BFS traversal from seed memory IDs through the knowledge graph.
 *
 * @param db - Database connection
 * @param seedIds - Starting memory IDs
 * @param options - Traversal options
 * @returns All discovered memories with their distances
 */
export function traverseGraph(
  db: DatabaseConnection,
  seedIds: string[],
  options?: {
    maxDepth?: number;
    maxFanout?: number;
    allowedRelations?: EdgeRelation[];
  },
): TraversalResult[] {
  const maxDepth = options?.maxDepth ?? MAX_GRAPH_DEPTH;
  const maxFanout = options?.maxFanout ?? MAX_GRAPH_FANOUT;
  const allowedRelations = options?.allowedRelations;

  // Track visited nodes with their discovery depth
  const visited = new Map<string, number>();
  const results: TraversalResult[] = [];

  // Initialize BFS queue with seeds at depth 0
  let currentLevel: string[] = [];
  for (const seed of seedIds) {
    if (!visited.has(seed)) {
      visited.set(seed, 0);
      currentLevel.push(seed);
      results.push({ id: seed, depth: 0 });
    }
  }

  // BFS level by level
  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextLevel: string[] = [];

    for (const nodeId of currentLevel) {
      const neighbors = getNeighborsForTraversal(
        db, nodeId, maxFanout, allowedRelations,
      );

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.set(neighborId, depth);
          nextLevel.push(neighborId);
          results.push({ id: neighborId, depth });
        }
      }
    }

    if (nextLevel.length === 0) break;
    currentLevel = nextLevel;
  }

  return results;
}

/**
 * Get neighbor IDs for traversal with fan-out cap and optional relation filtering.
 */
function getNeighborsForTraversal(
  db: DatabaseConnection,
  memoryId: string,
  maxFanout: number,
  allowedRelations?: EdgeRelation[],
): string[] {
  let sql: string;
  const params: (string | number)[] = [];

  if (allowedRelations && allowedRelations.length > 0) {
    const placeholders = allowedRelations.map(() => '?').join(',');
    sql = `
      SELECT target_id as neighbor_id FROM memory_edges
      WHERE source_id = ? AND relation IN (${placeholders})
      UNION
      SELECT source_id as neighbor_id FROM memory_edges
      WHERE target_id = ? AND relation IN (${placeholders})
      LIMIT ?
    `;
    params.push(memoryId, ...allowedRelations, memoryId, ...allowedRelations, maxFanout);
  } else {
    sql = `
      SELECT target_id as neighbor_id FROM memory_edges WHERE source_id = ?
      UNION
      SELECT source_id as neighbor_id FROM memory_edges WHERE target_id = ?
      LIMIT ?
    `;
    params.push(memoryId, memoryId, maxFanout);
  }

  const rows = db.prepare<unknown[], { neighbor_id: string }>(sql).all(...params);
  return rows.map(r => r.neighbor_id);
}

/**
 * Find all memory IDs reachable from seeds within maxDepth hops.
 * Returns only the new discoveries (excludes seeds).
 */
export function discoverRelated(
  db: DatabaseConnection,
  seedIds: string[],
  options?: {
    maxDepth?: number;
    maxFanout?: number;
    allowedRelations?: EdgeRelation[];
  },
): string[] {
  const seedSet = new Set(seedIds);
  const results = traverseGraph(db, seedIds, options);
  return results
    .filter(r => !seedSet.has(r.id))
    .map(r => r.id);
}
