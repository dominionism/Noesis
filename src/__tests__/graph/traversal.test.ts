/**
 * Tests for Multi-hop Graph Traversal (src/graph/traversal.ts)
 *
 * Covers:
 * - traverseGraph: BFS traversal, depth tracking, fan-out caps
 * - discoverRelated: seed exclusion, depth limits
 * - Relation filtering
 * - Deduplication of seeds
 * - Empty graph handling
 * - Cycle handling in traversal
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { DatabaseConnection } from '../../core/database.js';
import { traverseGraph, discoverRelated } from '../../graph/traversal.js';
import type { TraversalResult } from '../../graph/traversal.js';

let testDir: string;
let db: DatabaseConnection;

function insertMemory(db: DatabaseConnection, id: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO memories (id, type, title, content, tags, scope, sensitivity, confidence, source, signature, status, access_count, created_at, updated_at, last_accessed_at)
    VALUES (?, 'task', 'Test', 'content', '[]', 'global', 'INTERNAL', 0.5, 'agent', 'sig', 'active', 0, ?, ?, ?)
  `).run(id, now, now, now);
}

function insertEdge(db: DatabaseConnection, source: string, target: string, relation: string = 'related_to'): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO memory_edges (source_id, target_id, relation, weight, created_at)
    VALUES (?, ?, ?, 1.0, ?)
  `).run(source, target, relation, now);
}

beforeEach(() => {
  testDir = join(tmpdir(), `noesis-traversal-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  db = DatabaseConnection.create(join(testDir, 'test.db'));
});

afterEach(() => {
  db.close();
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* best effort */ }
});

describe('traverseGraph', () => {
  it('returns seeds at depth 0 when no edges exist', () => {
    insertMemory(db, 'mem-A');

    const results = traverseGraph(db, ['mem-A']);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ id: 'mem-A', depth: 0 });
  });

  it('returns empty results for empty seed list', () => {
    const results = traverseGraph(db, []);
    expect(results).toEqual([]);
  });

  it('discovers direct neighbors at depth 1', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B');
    insertEdge(db, 'mem-A', 'mem-C');

    const results = traverseGraph(db, ['mem-A']);
    expect(results).toHaveLength(3);

    const seed = results.find(r => r.id === 'mem-A');
    expect(seed!.depth).toBe(0);

    const neighbor1 = results.find(r => r.id === 'mem-B');
    expect(neighbor1!.depth).toBe(1);

    const neighbor2 = results.find(r => r.id === 'mem-C');
    expect(neighbor2!.depth).toBe(1);
  });

  it('discovers multi-hop neighbors with correct depth', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B');
    insertEdge(db, 'mem-B', 'mem-C');

    const results = traverseGraph(db, ['mem-A']);
    const nodeC = results.find(r => r.id === 'mem-C');
    expect(nodeC).toBeDefined();
    expect(nodeC!.depth).toBe(2);
  });

  it('respects maxDepth parameter', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertMemory(db, 'mem-D');
    insertEdge(db, 'mem-A', 'mem-B');
    insertEdge(db, 'mem-B', 'mem-C');
    insertEdge(db, 'mem-C', 'mem-D');

    const results = traverseGraph(db, ['mem-A'], { maxDepth: 1 });
    const ids = results.map(r => r.id);
    expect(ids).toContain('mem-A');
    expect(ids).toContain('mem-B');
    expect(ids).not.toContain('mem-C');
    expect(ids).not.toContain('mem-D');
  });

  it('respects maxFanout per node', () => {
    insertMemory(db, 'mem-A');
    // Create many neighbors
    for (let i = 0; i < 20; i++) {
      const nId = `mem-N${i}`;
      insertMemory(db, nId);
      insertEdge(db, 'mem-A', nId);
    }

    const results = traverseGraph(db, ['mem-A'], { maxFanout: 5 });
    // Should have seed + at most 5 neighbors
    expect(results.length).toBeLessThanOrEqual(6);
  });

  it('filters by allowed relation types', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B', 'causes');
    insertEdge(db, 'mem-A', 'mem-C', 'requires');

    const results = traverseGraph(db, ['mem-A'], { allowedRelations: ['causes'] });
    const ids = results.map(r => r.id);
    expect(ids).toContain('mem-A');
    expect(ids).toContain('mem-B');
    expect(ids).not.toContain('mem-C');
  });

  it('traverses bidirectionally (both source and target)', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    // B -> A (incoming to A)
    insertEdge(db, 'mem-B', 'mem-A');
    // A -> C (outgoing from A)
    insertEdge(db, 'mem-A', 'mem-C');

    const results = traverseGraph(db, ['mem-A']);
    const ids = results.map(r => r.id);
    expect(ids).toContain('mem-B');
    expect(ids).toContain('mem-C');
  });

  it('deduplicates seed IDs', () => {
    insertMemory(db, 'mem-A');

    const results = traverseGraph(db, ['mem-A', 'mem-A', 'mem-A']);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('mem-A');
  });

  it('handles cycles without infinite loops', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B');
    insertEdge(db, 'mem-B', 'mem-C');
    insertEdge(db, 'mem-C', 'mem-A'); // cycle

    const results = traverseGraph(db, ['mem-A']);
    expect(results).toHaveLength(3);
    // Each node should appear exactly once
    const ids = results.map(r => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('handles multiple seeds at depth 0', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-C');
    insertEdge(db, 'mem-B', 'mem-C');

    const results = traverseGraph(db, ['mem-A', 'mem-B']);
    expect(results).toHaveLength(3);

    const seedA = results.find(r => r.id === 'mem-A');
    const seedB = results.find(r => r.id === 'mem-B');
    expect(seedA!.depth).toBe(0);
    expect(seedB!.depth).toBe(0);
  });

  it('stops early when no new nodes are discovered', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertEdge(db, 'mem-A', 'mem-B');

    // Set large max depth but graph is small
    const results = traverseGraph(db, ['mem-A'], { maxDepth: 100 });
    expect(results).toHaveLength(2);
  });
});

describe('discoverRelated', () => {
  it('excludes seed IDs from results', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertEdge(db, 'mem-A', 'mem-B');

    const related = discoverRelated(db, ['mem-A']);
    expect(related).toEqual(['mem-B']);
  });

  it('returns empty array when no neighbors exist', () => {
    insertMemory(db, 'mem-A');
    const related = discoverRelated(db, ['mem-A']);
    expect(related).toEqual([]);
  });

  it('discovers multi-hop related memories excluding seeds', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B');
    insertEdge(db, 'mem-B', 'mem-C');

    const related = discoverRelated(db, ['mem-A']);
    expect(related).toContain('mem-B');
    expect(related).toContain('mem-C');
    expect(related).not.toContain('mem-A');
  });

  it('excludes all seeds when multiple are provided', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-C');
    insertEdge(db, 'mem-B', 'mem-C');

    const related = discoverRelated(db, ['mem-A', 'mem-B']);
    expect(related).toEqual(['mem-C']);
  });

  it('respects options (maxDepth, maxFanout, allowedRelations)', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B', 'causes');
    insertEdge(db, 'mem-B', 'mem-C', 'causes');

    // With maxDepth 1, should only find B
    const related = discoverRelated(db, ['mem-A'], { maxDepth: 1 });
    expect(related).toEqual(['mem-B']);
  });

  it('filters by allowed relations', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B', 'causes');
    insertEdge(db, 'mem-A', 'mem-C', 'requires');

    const related = discoverRelated(db, ['mem-A'], { allowedRelations: ['requires'] });
    expect(related).toEqual(['mem-C']);
  });
});
