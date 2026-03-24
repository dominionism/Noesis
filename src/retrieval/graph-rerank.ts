/**
 * Graph-Aware Re-Ranking
 *
 * Enhanced Step 5 in the retrieval pipeline. Instead of UAWL's simple
 * 1-hop adjacency traversal, this module uses typed edge relationships
 * and weights to intelligently boost or flag memories.
 *
 * Boosting rules:
 *   - Memories connected via 'exemplifies' edges get a strong boost
 *     (they demonstrate a concept that appeared in results)
 *   - Memories connected via 'requires' edges get a moderate boost
 *     (they are dependencies of retrieved knowledge)
 *   - Memories connected via 'causes' or 'caused_by' edges get a
 *     moderate boost (they form causal chains with retrieved knowledge)
 *   - Memories connected via 'generalizes' edges get a mild boost
 *     (they abstract from specific cases)
 *   - Memories connected via 'supersedes' edges where the target
 *     supersedes a result get a strong boost (newer knowledge)
 *   - Memories connected via 'contradicts' edges are flagged but not
 *     excluded (the caller/agent decides what to do)
 *
 * Multi-hop traversal up to MAX_GRAPH_DEPTH hops with fan-out caps.
 */

import type { DatabaseConnection } from '../core/database.js';
import type { EdgeRelation } from '../constants.js';
import { MAX_GRAPH_DEPTH, MAX_GRAPH_FANOUT } from '../constants.js';

export interface GraphBoostResult {
  /** Memory IDs discovered via graph traversal, with boost factors */
  boosted: Map<string, GraphBoostEntry>;
  /** Memory IDs flagged as contradicting retrieved results */
  contradictions: Array<{
    memoryId: string;
    contradictsId: string;
    weight: number;
  }>;
  /** Memory IDs that supersede retrieved results */
  supersessions: Array<{
    newerId: string;
    olderId: string;
    weight: number;
  }>;
}

export interface GraphBoostEntry {
  /** Computed boost factor for this memory */
  boost: number;
  /** How it was discovered (which relation type(s) led to it) */
  discoveredVia: EdgeRelation[];
  /** Distance from nearest seed */
  depth: number;
}

/**
 * Boost factors by edge relation type. These multiply into the memory's
 * baseline RRF score during re-ranking.
 *
 * Higher values = stronger boost. Values < 1.0 would penalize (not used).
 */
const RELATION_BOOST: Record<EdgeRelation, number> = {
  exemplifies: 1.4,
  requires: 1.3,
  causes: 1.2,
  caused_by: 1.2,
  generalizes: 1.15,
  supersedes: 1.5,
  prevents: 1.1,
  corrects: 1.3,
  related_to: 1.05,
  part_of: 1.2,
  created_during: 1.0,
  contradicts: 1.0, // Not boosted — flagged separately
};

/**
 * Depth decay factor. Boost is reduced as distance from seed increases.
 *
 * At depth 1: full boost
 * At depth 2: boost * 0.6
 * At depth 3: boost * 0.36
 */
const DEPTH_DECAY = 0.6;

interface EdgeRow {
  source_id: string;
  target_id: string;
  relation: string;
  weight: number;
}

/**
 * Perform graph-aware re-ranking from seed memory IDs.
 *
 * Traverses the knowledge graph up to maxDepth hops, computing boost
 * factors based on edge types and weights. Also identifies contradictions
 * and supersessions for the caller to handle.
 */
export function graphRerank(
  db: DatabaseConnection,
  seedIds: string[],
  options?: {
    maxDepth?: number;
    maxFanout?: number;
  },
): GraphBoostResult {
  const maxDepth = options?.maxDepth ?? MAX_GRAPH_DEPTH;
  const maxFanout = options?.maxFanout ?? MAX_GRAPH_FANOUT;

  const result: GraphBoostResult = {
    boosted: new Map(),
    contradictions: [],
    supersessions: [],
  };

  if (seedIds.length === 0) return result;

  const seedSet = new Set(seedIds);
  const visited = new Set<string>(seedIds);
  let currentLevel = [...seedIds];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextLevel: string[] = [];

    for (const nodeId of currentLevel) {
      const edges = getEdgesForNode(db, nodeId, maxFanout);

      for (const edge of edges) {
        const neighborId = edge.source_id === nodeId ? edge.target_id : edge.source_id;
        const relation = edge.relation as EdgeRelation;

        // Handle contradictions specially — always flag, even if already visited
        if (relation === 'contradicts' && seedSet.has(nodeId)) {
          result.contradictions.push({
            memoryId: neighborId,
            contradictsId: nodeId,
            weight: edge.weight,
          });
        }

        // Handle supersessions — if neighborId supersedes a seed
        if (relation === 'supersedes') {
          if (edge.source_id === neighborId && seedSet.has(edge.target_id)) {
            // neighborId supersedes a seed result
            result.supersessions.push({
              newerId: neighborId,
              olderId: edge.target_id,
              weight: edge.weight,
            });
          }
        }

        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        // Skip seeds — they don't need boosting
        if (seedSet.has(neighborId)) continue;

        // Compute boost factor with depth decay
        const baseBoost = RELATION_BOOST[relation] ?? 1.0;
        const edgeWeightFactor = edge.weight; // Edge weight modulates boost
        const depthDecay = Math.pow(DEPTH_DECAY, depth - 1);
        const boost = baseBoost * edgeWeightFactor * depthDecay;

        const existing = result.boosted.get(neighborId);
        if (existing) {
          // Combine boosts from multiple paths — take the maximum
          if (boost > existing.boost) {
            existing.boost = boost;
          }
          if (!existing.discoveredVia.includes(relation)) {
            existing.discoveredVia.push(relation);
          }
        } else {
          result.boosted.set(neighborId, {
            boost,
            discoveredVia: [relation],
            depth,
          });
        }

        nextLevel.push(neighborId);
      }
    }

    if (nextLevel.length === 0) break;
    currentLevel = nextLevel;
  }

  return result;
}

/**
 * Get edges for a node with fan-out cap. Returns both incoming and
 * outgoing edges ordered by weight descending.
 */
function getEdgesForNode(
  db: DatabaseConnection,
  nodeId: string,
  maxFanout: number,
): EdgeRow[] {
  const sql = `
    SELECT source_id, target_id, relation, weight FROM (
      SELECT source_id, target_id, relation, weight
        FROM memory_edges
       WHERE source_id = ?
       ORDER BY weight DESC
       LIMIT ?
    )
    UNION ALL
    SELECT source_id, target_id, relation, weight FROM (
      SELECT source_id, target_id, relation, weight
        FROM memory_edges
       WHERE target_id = ?
       ORDER BY weight DESC
       LIMIT ?
    )
  `;

  return db.prepare<unknown[], EdgeRow>(sql).all(nodeId, maxFanout, nodeId, maxFanout);
}
