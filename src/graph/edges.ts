/**
 * Typed Knowledge Graph Edge CRUD
 *
 * Manages typed, weighted edges between memories in the knowledge graph.
 * 12 relation types with semantic validation and integrity checks.
 *
 * Invariant 8: Edge creation requires both endpoints to exist.
 */

import type { DatabaseConnection } from '../core/database.js';
import type { KnowledgeEdge, KnowledgeEdgeInput } from '../types.js';
import { EDGE_RELATIONS, type EdgeRelation } from '../constants.js';
import { generateId } from '../core/ulid.js';

/**
 * Validate that a relation string is a valid EdgeRelation.
 */
export function isValidRelation(relation: string): relation is EdgeRelation {
  return (EDGE_RELATIONS as readonly string[]).includes(relation);
}

/**
 * Create a typed edge between two memories.
 *
 * Validates:
 * 1. Relation is in the allowed set (CHECK constraint also enforces this)
 * 2. Both source and target memories exist in the database
 * 3. Source and target are not the same memory (no self-loops)
 *
 * @throws If relation is invalid, endpoints don't exist, or self-loop attempted
 */
export function createTypedEdge(
  db: DatabaseConnection,
  input: KnowledgeEdgeInput,
): KnowledgeEdge {
  if (!isValidRelation(input.relation)) {
    throw new Error(
      `Invalid edge relation '${input.relation}'. ` +
      `Valid relations: ${EDGE_RELATIONS.join(', ')}`,
    );
  }

  if (input.source_id === input.target_id) {
    throw new Error('Self-loops are not allowed in the knowledge graph');
  }

  // Verify both endpoints exist
  const sourceExists = db.prepare<[string], { id: string }>(
    'SELECT id FROM memories WHERE id = ?',
  ).get(input.source_id);

  if (!sourceExists) {
    throw new Error(`Source memory not found: ${input.source_id}`);
  }

  const targetExists = db.prepare<[string], { id: string }>(
    'SELECT id FROM memories WHERE id = ?',
  ).get(input.target_id);

  if (!targetExists) {
    throw new Error(`Target memory not found: ${input.target_id}`);
  }

  const now = new Date().toISOString();
  const weight = input.weight ?? 1.0;

  db.prepare<[string, string, string, number, string | null, string]>(`
    INSERT OR REPLACE INTO memory_edges (source_id, target_id, relation, weight, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.source_id,
    input.target_id,
    input.relation,
    weight,
    input.metadata ?? null,
    now,
  );

  return {
    source_id: input.source_id,
    target_id: input.target_id,
    relation: input.relation,
    weight,
    metadata: input.metadata ?? null,
    created_at: now,
  };
}

/**
 * Get all edges for a memory, optionally filtered by relation type.
 */
export function getTypedEdges(
  db: DatabaseConnection,
  memoryId: string,
  options?: {
    relation?: EdgeRelation;
    direction?: 'outgoing' | 'incoming' | 'both';
  },
): KnowledgeEdge[] {
  const direction = options?.direction ?? 'both';
  const relation = options?.relation;

  const conditions: string[] = [];
  const params: string[] = [];

  if (direction === 'outgoing') {
    conditions.push('source_id = ?');
    params.push(memoryId);
  } else if (direction === 'incoming') {
    conditions.push('target_id = ?');
    params.push(memoryId);
  } else {
    conditions.push('(source_id = ? OR target_id = ?)');
    params.push(memoryId, memoryId);
  }

  if (relation) {
    conditions.push('relation = ?');
    params.push(relation);
  }

  const sql = `SELECT * FROM memory_edges WHERE ${conditions.join(' AND ')} ORDER BY weight DESC`;
  return db.prepare<unknown[], KnowledgeEdge>(sql).all(...params);
}

/**
 * Update the weight of an existing edge.
 */
export function updateEdgeWeight(
  db: DatabaseConnection,
  sourceId: string,
  targetId: string,
  relation: string,
  newWeight: number,
): void {
  const result = db.prepare<[number, string, string, string]>(
    'UPDATE memory_edges SET weight = ? WHERE source_id = ? AND target_id = ? AND relation = ?',
  ).run(newWeight, sourceId, targetId, relation);

  if (result.changes === 0) {
    throw new Error(`Edge not found: ${sourceId} --[${relation}]--> ${targetId}`);
  }
}

/**
 * Delete a typed edge.
 */
export function deleteTypedEdge(
  db: DatabaseConnection,
  sourceId: string,
  targetId: string,
  relation: string,
): void {
  db.prepare<[string, string, string]>(
    'DELETE FROM memory_edges WHERE source_id = ? AND target_id = ? AND relation = ?',
  ).run(sourceId, targetId, relation);
}

/**
 * Get all neighbor memory IDs connected to a given memory.
 */
export function getNeighborIds(
  db: DatabaseConnection,
  memoryId: string,
  options?: { relation?: EdgeRelation; maxResults?: number },
): string[] {
  const relation = options?.relation;
  const limit = options?.maxResults ?? 50;

  let sql: string;
  const params: (string | number)[] = [];

  if (relation) {
    sql = `
      SELECT DISTINCT CASE
        WHEN source_id = ? THEN target_id
        ELSE source_id
      END as neighbor_id
      FROM memory_edges
      WHERE (source_id = ? OR target_id = ?) AND relation = ?
      LIMIT ?
    `;
    params.push(memoryId, memoryId, memoryId, relation, limit);
  } else {
    sql = `
      SELECT DISTINCT CASE
        WHEN source_id = ? THEN target_id
        ELSE source_id
      END as neighbor_id
      FROM memory_edges
      WHERE source_id = ? OR target_id = ?
      LIMIT ?
    `;
    params.push(memoryId, memoryId, memoryId, limit);
  }

  const rows = db.prepare<unknown[], { neighbor_id: string }>(sql).all(...params);
  return rows.map(r => r.neighbor_id);
}

/**
 * Count edges by relation type for analytics.
 */
export function countEdgesByRelation(
  db: DatabaseConnection,
): Record<string, number> {
  const rows = db.prepare<[], { relation: string; count: number }>(
    'SELECT relation, COUNT(*) as count FROM memory_edges GROUP BY relation',
  ).all();

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.relation] = row.count;
  }
  return result;
}
