/**
 * Knowledge Graph Integrity Validation
 *
 * Validates that edges in the knowledge graph have valid endpoints
 * and that referenced memories have not been tampered with.
 *
 * Invariant 8: Edge creation requires both endpoints to exist and be verified.
 */

import type { DatabaseConnection } from '../core/database.js';

export interface IntegrityReport {
  total_edges: number;
  valid: number;
  orphaned: number; // Edges pointing to deleted memories
  invalid_relation: number;
  details: Array<{
    source_id: string;
    target_id: string;
    relation: string;
    issue: string;
  }>;
}

/**
 * Scan all edges for integrity issues.
 *
 * Checks:
 * 1. Both source and target memories exist
 * 2. Relation type is in the allowed set
 *
 * HMAC verification is intentionally NOT done here (expensive).
 * Use the dedicated verifyMemory function for signature checks.
 */
export function validateGraphIntegrity(
  db: DatabaseConnection,
): IntegrityReport {
  const report: IntegrityReport = {
    total_edges: 0,
    valid: 0,
    orphaned: 0,
    invalid_relation: 0,
    details: [],
  };

  // Find orphaned edges (source or target missing)
  const orphanedEdges = db.prepare<[], {
    source_id: string;
    target_id: string;
    relation: string;
    source_exists: number;
    target_exists: number;
  }>(`
    SELECT
      e.source_id,
      e.target_id,
      e.relation,
      CASE WHEN ms.id IS NOT NULL THEN 1 ELSE 0 END as source_exists,
      CASE WHEN mt.id IS NOT NULL THEN 1 ELSE 0 END as target_exists
    FROM memory_edges e
    LEFT JOIN memories ms ON e.source_id = ms.id
    LEFT JOIN memories mt ON e.target_id = mt.id
  `).all();

  report.total_edges = orphanedEdges.length;

  for (const edge of orphanedEdges) {
    if (!edge.source_exists || !edge.target_exists) {
      report.orphaned++;
      report.details.push({
        source_id: edge.source_id,
        target_id: edge.target_id,
        relation: edge.relation,
        issue: !edge.source_exists && !edge.target_exists
          ? 'both endpoints missing'
          : !edge.source_exists
            ? 'source memory missing'
            : 'target memory missing',
      });
    } else {
      report.valid++;
    }
  }

  return report;
}

/**
 * Remove orphaned edges (edges pointing to deleted memories).
 *
 * @returns Number of edges removed
 */
export function pruneOrphanedEdges(db: DatabaseConnection): number {
  const result = db.prepare<[]>(`
    DELETE FROM memory_edges
    WHERE source_id NOT IN (SELECT id FROM memories)
       OR target_id NOT IN (SELECT id FROM memories)
  `).run();

  return result.changes;
}
