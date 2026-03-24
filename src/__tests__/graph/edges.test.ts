/**
 * Tests for Typed Knowledge Graph Edge CRUD (src/graph/edges.ts)
 *
 * Covers:
 * - isValidRelation: all 12 relation types + invalid strings
 * - createTypedEdge: valid creation, self-loop prevention, missing endpoints
 * - getTypedEdges: direction filtering, relation filtering
 * - updateEdgeWeight: success and missing edge error
 * - deleteTypedEdge: removal of edges
 * - getNeighborIds: with and without relation filter, max results
 * - countEdgesByRelation: aggregation
 *
 * Uses a real SQLite database (in-memory equivalent via temp dir) for
 * integration-level accuracy.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { DatabaseConnection } from '../../core/database.js';
import {
  isValidRelation,
  createTypedEdge,
  getTypedEdges,
  updateEdgeWeight,
  deleteTypedEdge,
  getNeighborIds,
  countEdgesByRelation,
} from '../../graph/edges.js';

let testDir: string;
let db: DatabaseConnection;

function insertMemory(db: DatabaseConnection, id: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO memories (id, type, title, content, tags, scope, sensitivity, confidence, source, signature, status, access_count, created_at, updated_at, last_accessed_at)
    VALUES (?, 'task', 'Test', 'content', '[]', 'global', 'INTERNAL', 0.5, 'agent', 'sig', 'active', 0, ?, ?, ?)
  `).run(id, now, now, now);
}

beforeEach(() => {
  testDir = join(tmpdir(), `noesis-edges-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  db = DatabaseConnection.create(join(testDir, 'test.db'));

  // Insert test memories
  insertMemory(db, 'mem-A');
  insertMemory(db, 'mem-B');
  insertMemory(db, 'mem-C');
  insertMemory(db, 'mem-D');
});

afterEach(() => {
  db.close();
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* best effort */ }
});

describe('isValidRelation', () => {
  it('returns true for all valid relations', () => {
    const validRelations = [
      'causes', 'caused_by', 'contradicts', 'supersedes',
      'requires', 'exemplifies', 'generalizes', 'prevents',
      'corrects', 'related_to', 'part_of', 'created_during',
    ];
    for (const rel of validRelations) {
      expect(isValidRelation(rel)).toBe(true);
    }
  });

  it('returns false for invalid relations', () => {
    expect(isValidRelation('invalid')).toBe(false);
    expect(isValidRelation('')).toBe(false);
    expect(isValidRelation('CAUSES')).toBe(false); // case sensitive
  });
});

describe('createTypedEdge', () => {
  it('creates an edge between two existing memories', () => {
    const edge = createTypedEdge(db, {
      source_id: 'mem-A',
      target_id: 'mem-B',
      relation: 'causes',
    });

    expect(edge.source_id).toBe('mem-A');
    expect(edge.target_id).toBe('mem-B');
    expect(edge.relation).toBe('causes');
    expect(edge.weight).toBe(1.0);
    expect(edge.metadata).toBeNull();
    expect(typeof edge.created_at).toBe('string');
  });

  it('creates an edge with custom weight', () => {
    const edge = createTypedEdge(db, {
      source_id: 'mem-A',
      target_id: 'mem-B',
      relation: 'requires',
      weight: 0.75,
    });
    expect(edge.weight).toBe(0.75);
  });

  it('creates an edge with metadata', () => {
    const meta = JSON.stringify({ reason: 'test' });
    const edge = createTypedEdge(db, {
      source_id: 'mem-A',
      target_id: 'mem-B',
      relation: 'related_to',
      metadata: meta,
    });
    expect(edge.metadata).toBe(meta);
  });

  it('throws on invalid relation type', () => {
    expect(() => createTypedEdge(db, {
      source_id: 'mem-A',
      target_id: 'mem-B',
      relation: 'invalid' as any,
    })).toThrow('Invalid edge relation');
  });

  it('throws on self-loop', () => {
    expect(() => createTypedEdge(db, {
      source_id: 'mem-A',
      target_id: 'mem-A',
      relation: 'causes',
    })).toThrow('Self-loops are not allowed');
  });

  it('throws when source memory does not exist', () => {
    expect(() => createTypedEdge(db, {
      source_id: 'nonexistent',
      target_id: 'mem-B',
      relation: 'causes',
    })).toThrow('Source memory not found');
  });

  it('throws when target memory does not exist', () => {
    expect(() => createTypedEdge(db, {
      source_id: 'mem-A',
      target_id: 'nonexistent',
      relation: 'causes',
    })).toThrow('Target memory not found');
  });

  it('replaces existing edge with same composite key (INSERT OR REPLACE)', () => {
    createTypedEdge(db, {
      source_id: 'mem-A',
      target_id: 'mem-B',
      relation: 'causes',
      weight: 0.5,
    });
    const updated = createTypedEdge(db, {
      source_id: 'mem-A',
      target_id: 'mem-B',
      relation: 'causes',
      weight: 0.9,
    });
    expect(updated.weight).toBe(0.9);

    // Should still be just one edge
    const edges = getTypedEdges(db, 'mem-A', { direction: 'outgoing', relation: 'causes' });
    expect(edges).toHaveLength(1);
  });
});

describe('getTypedEdges', () => {
  beforeEach(() => {
    createTypedEdge(db, { source_id: 'mem-A', target_id: 'mem-B', relation: 'causes' });
    createTypedEdge(db, { source_id: 'mem-C', target_id: 'mem-A', relation: 'requires' });
    createTypedEdge(db, { source_id: 'mem-A', target_id: 'mem-D', relation: 'related_to' });
  });

  it('returns all edges (both directions) by default', () => {
    const edges = getTypedEdges(db, 'mem-A');
    expect(edges).toHaveLength(3);
  });

  it('returns only outgoing edges', () => {
    const edges = getTypedEdges(db, 'mem-A', { direction: 'outgoing' });
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.source_id).toBe('mem-A');
    }
  });

  it('returns only incoming edges', () => {
    const edges = getTypedEdges(db, 'mem-A', { direction: 'incoming' });
    expect(edges).toHaveLength(1);
    expect(edges[0].target_id).toBe('mem-A');
  });

  it('filters by relation type', () => {
    const edges = getTypedEdges(db, 'mem-A', { relation: 'causes' });
    expect(edges).toHaveLength(1);
    expect(edges[0].relation).toBe('causes');
  });

  it('filters by both direction and relation', () => {
    const edges = getTypedEdges(db, 'mem-A', { direction: 'outgoing', relation: 'causes' });
    expect(edges).toHaveLength(1);
  });

  it('returns empty array for memory with no edges', () => {
    const edges = getTypedEdges(db, 'mem-D', { direction: 'outgoing' });
    expect(edges).toEqual([]);
  });

  it('orders results by weight DESC', () => {
    // Create edges with different weights
    insertMemory(db, 'mem-E');
    createTypedEdge(db, { source_id: 'mem-B', target_id: 'mem-C', relation: 'related_to', weight: 0.3 });
    createTypedEdge(db, { source_id: 'mem-B', target_id: 'mem-D', relation: 'related_to', weight: 0.9 });
    createTypedEdge(db, { source_id: 'mem-B', target_id: 'mem-E', relation: 'related_to', weight: 0.6 });

    const edges = getTypedEdges(db, 'mem-B', { direction: 'outgoing', relation: 'related_to' });
    expect(edges[0].weight).toBe(0.9);
    expect(edges[1].weight).toBe(0.6);
    expect(edges[2].weight).toBe(0.3);
  });
});

describe('updateEdgeWeight', () => {
  it('updates the weight of an existing edge', () => {
    createTypedEdge(db, { source_id: 'mem-A', target_id: 'mem-B', relation: 'causes' });
    updateEdgeWeight(db, 'mem-A', 'mem-B', 'causes', 0.42);

    const edges = getTypedEdges(db, 'mem-A', { direction: 'outgoing', relation: 'causes' });
    expect(edges[0].weight).toBe(0.42);
  });

  it('throws when edge does not exist', () => {
    expect(() => updateEdgeWeight(db, 'mem-A', 'mem-B', 'causes', 0.5))
      .toThrow('Edge not found');
  });
});

describe('deleteTypedEdge', () => {
  it('deletes an existing edge', () => {
    createTypedEdge(db, { source_id: 'mem-A', target_id: 'mem-B', relation: 'causes' });
    deleteTypedEdge(db, 'mem-A', 'mem-B', 'causes');

    const edges = getTypedEdges(db, 'mem-A', { direction: 'outgoing', relation: 'causes' });
    expect(edges).toHaveLength(0);
  });

  it('does not throw when deleting nonexistent edge', () => {
    expect(() => deleteTypedEdge(db, 'mem-A', 'mem-B', 'causes')).not.toThrow();
  });
});

describe('getNeighborIds', () => {
  beforeEach(() => {
    createTypedEdge(db, { source_id: 'mem-A', target_id: 'mem-B', relation: 'causes' });
    createTypedEdge(db, { source_id: 'mem-C', target_id: 'mem-A', relation: 'requires' });
  });

  it('returns all neighbors (both directions)', () => {
    const neighbors = getNeighborIds(db, 'mem-A');
    expect(neighbors).toContain('mem-B');
    expect(neighbors).toContain('mem-C');
    expect(neighbors).toHaveLength(2);
  });

  it('filters by relation type', () => {
    const neighbors = getNeighborIds(db, 'mem-A', { relation: 'causes' });
    expect(neighbors).toContain('mem-B');
    expect(neighbors).not.toContain('mem-C');
  });

  it('respects maxResults limit', () => {
    createTypedEdge(db, { source_id: 'mem-A', target_id: 'mem-D', relation: 'related_to' });
    const neighbors = getNeighborIds(db, 'mem-A', { maxResults: 2 });
    expect(neighbors.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for isolated memory', () => {
    const neighbors = getNeighborIds(db, 'mem-D');
    expect(neighbors).toEqual([]);
  });
});

describe('countEdgesByRelation', () => {
  it('returns empty object when no edges exist', () => {
    const counts = countEdgesByRelation(db);
    expect(counts).toEqual({});
  });

  it('counts edges grouped by relation', () => {
    createTypedEdge(db, { source_id: 'mem-A', target_id: 'mem-B', relation: 'causes' });
    createTypedEdge(db, { source_id: 'mem-B', target_id: 'mem-C', relation: 'causes' });
    createTypedEdge(db, { source_id: 'mem-A', target_id: 'mem-C', relation: 'requires' });

    const counts = countEdgesByRelation(db);
    expect(counts['causes']).toBe(2);
    expect(counts['requires']).toBe(1);
  });
});
