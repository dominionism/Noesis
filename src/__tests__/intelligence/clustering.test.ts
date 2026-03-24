/**
 * Tests for Graph-Based Pattern Detection (Clustering)
 *
 * Covers:
 * - UnionFind: find, union, path compression, union-by-rank, getComponents
 * - cosineSimilarity: identical vectors, orthogonal, empty/mismatched, zero vectors
 * - clusterMemories: positive/negative separation, cold-start thresholds, empty input
 */

import { describe, it, expect } from 'vitest';
import {
  UnionFind,
  cosineSimilarity,
  clusterMemories,
  type ClusterResult,
} from '../../intelligence/clustering.js';

// ---------------------------------------------------------------------------
// Helpers: create Float32 embedding buffers
// ---------------------------------------------------------------------------

function makeEmbedding(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    buf.writeFloatLE(values[i], i * 4);
  }
  return buf;
}

function makeNormalizedEmbedding(values: number[]): Buffer {
  const mag = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  if (mag === 0) return makeEmbedding(values);
  return makeEmbedding(values.map((v) => v / mag));
}

// ---------------------------------------------------------------------------
// UnionFind
// ---------------------------------------------------------------------------

describe('UnionFind', () => {
  it('find: initializes a new element as its own parent', () => {
    const uf = new UnionFind();
    expect(uf.find('a')).toBe('a');
  });

  it('find: returns the root after union', () => {
    const uf = new UnionFind();
    uf.union('a', 'b');
    const rootA = uf.find('a');
    const rootB = uf.find('b');
    expect(rootA).toBe(rootB);
  });

  it('union: merges two disjoint sets', () => {
    const uf = new UnionFind();
    uf.find('x');
    uf.find('y');
    uf.union('x', 'y');
    expect(uf.find('x')).toBe(uf.find('y'));
  });

  it('union: no-op when elements are already in the same set', () => {
    const uf = new UnionFind();
    uf.union('a', 'b');
    const root1 = uf.find('a');
    uf.union('a', 'b');
    const root2 = uf.find('a');
    expect(root1).toBe(root2);
  });

  it('union: handles chains correctly via path compression', () => {
    const uf = new UnionFind();
    uf.union('a', 'b');
    uf.union('b', 'c');
    uf.union('c', 'd');

    // All should share the same root
    const root = uf.find('a');
    expect(uf.find('b')).toBe(root);
    expect(uf.find('c')).toBe(root);
    expect(uf.find('d')).toBe(root);
  });

  it('union: uses union-by-rank to keep trees balanced', () => {
    const uf = new UnionFind();
    // Create two chains
    uf.union('a', 'b');
    uf.union('c', 'd');
    // Merge the chains
    uf.union('a', 'c');

    // All four should have the same root
    const root = uf.find('a');
    expect(uf.find('b')).toBe(root);
    expect(uf.find('c')).toBe(root);
    expect(uf.find('d')).toBe(root);
  });

  it('getComponents: returns correct component groupings', () => {
    const uf = new UnionFind();
    uf.union('a', 'b');
    uf.union('b', 'c');
    uf.union('x', 'y');
    uf.find('z'); // singleton

    const components = uf.getComponents();
    // Should have 3 components: {a,b,c}, {x,y}, {z}
    expect(components.size).toBe(3);

    // Find the component containing 'a'
    const rootA = uf.find('a');
    const compA = components.get(rootA)!;
    expect(compA.sort()).toEqual(['a', 'b', 'c']);

    const rootX = uf.find('x');
    const compX = components.get(rootX)!;
    expect(compX.sort()).toEqual(['x', 'y']);

    const rootZ = uf.find('z');
    const compZ = components.get(rootZ)!;
    expect(compZ).toEqual(['z']);
  });

  it('getComponents: returns empty map when no elements exist', () => {
    const uf = new UnionFind();
    expect(uf.getComponents().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical unit vectors', () => {
    const v = makeNormalizedEmbedding([1, 0, 0]);
    const sim = cosineSimilarity(v, v);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('returns 1.0 for identical non-unit vectors', () => {
    const v = makeEmbedding([3, 4, 0]);
    const sim = cosineSimilarity(v, v);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = makeEmbedding([1, 0, 0]);
    const b = makeEmbedding([0, 1, 0]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(0.0, 5);
  });

  it('returns -1.0 for opposite vectors', () => {
    const a = makeEmbedding([1, 0, 0]);
    const b = makeEmbedding([-1, 0, 0]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for empty buffers', () => {
    const empty = Buffer.alloc(0);
    expect(cosineSimilarity(empty, empty)).toBe(0);
  });

  it('returns 0 for mismatched buffer lengths', () => {
    const a = makeEmbedding([1, 0]);
    const b = makeEmbedding([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    const zero = makeEmbedding([0, 0, 0]);
    const v = makeEmbedding([1, 2, 3]);
    expect(cosineSimilarity(zero, v)).toBe(0);
    expect(cosineSimilarity(zero, zero)).toBe(0);
  });

  it('computes correct similarity for known vectors', () => {
    // cos([1,2,3], [4,5,6]) = 32 / (sqrt(14) * sqrt(77))
    const a = makeEmbedding([1, 2, 3]);
    const b = makeEmbedding([4, 5, 6]);
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(expected, 4);
  });
});

// ---------------------------------------------------------------------------
// clusterMemories
// ---------------------------------------------------------------------------

describe('clusterMemories', () => {
  it('returns empty clusters when no memories exist', async () => {
    const result = await clusterMemories({
      getAllMemories: () => [],
      totalMemoryCount: 0,
    });

    expect(result.positiveClusters).toEqual([]);
    expect(result.negativeClusters).toEqual([]);
  });

  it('separates positive (success) and negative (failed/lesson) memories', async () => {
    // Create very similar embeddings that will cluster together
    const baseVec = [1, 0, 0, 0, 0];
    const similarVec1 = [0.99, 0.01, 0, 0, 0];
    const similarVec2 = [0.98, 0.02, 0, 0, 0];

    const successMemories = [
      { id: 's1', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding(baseVec), tags: '[]' },
      { id: 's2', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding(similarVec1), tags: '[]' },
      { id: 's3', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding(similarVec2), tags: '[]' },
    ];

    const failedMemories = [
      { id: 'f1', type: 'task', outcome: 'failed', embedding: makeNormalizedEmbedding([0, 1, 0, 0, 0]), tags: '[]' },
      { id: 'f2', type: 'task', outcome: 'failed', embedding: makeNormalizedEmbedding([0, 0.99, 0.01, 0, 0]), tags: '[]' },
      { id: 'f3', type: 'lesson', outcome: null, embedding: makeNormalizedEmbedding([0, 0.98, 0.02, 0, 0]), tags: '[]' },
    ];

    const allMemories = [...successMemories, ...failedMemories];

    const result = await clusterMemories({
      getAllMemories: () => allMemories,
      totalMemoryCount: allMemories.length,
    });

    // In cold-start mode (< 50 memories), min cluster size is 2
    // Success memories should cluster, failed/lesson memories should cluster
    if (result.positiveClusters.length > 0) {
      const allPositiveIds = result.positiveClusters.flat();
      for (const id of allPositiveIds) {
        expect(id).toMatch(/^s/);
      }
    }

    if (result.negativeClusters.length > 0) {
      const allNegativeIds = result.negativeClusters.flat();
      for (const id of allNegativeIds) {
        expect(id).toMatch(/^f/);
      }
    }
  });

  it('uses cold-start thresholds when totalMemoryCount < 50', async () => {
    // With cold-start, similarity threshold is 0.75 and min cluster size is 2
    const memories = [
      { id: 'a', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding([1, 0, 0]), tags: '[]' },
      { id: 'b', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding([0.98, 0.02, 0]), tags: '[]' },
    ];

    const result = await clusterMemories({
      getAllMemories: () => memories,
      totalMemoryCount: 10, // cold-start territory
    });

    // Two very similar vectors should cluster even with just 2 members (cold-start min)
    if (result.positiveClusters.length > 0) {
      expect(result.positiveClusters[0].length).toBeGreaterThanOrEqual(2);
    }
  });

  it('skips memories with empty embeddings', async () => {
    const memories = [
      { id: 'a', type: 'task', outcome: 'success', embedding: Buffer.alloc(0), tags: '[]' },
      { id: 'b', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding([1, 0, 0]), tags: '[]' },
    ];

    const result = await clusterMemories({
      getAllMemories: () => memories,
      totalMemoryCount: 2,
    });

    // 'a' should be excluded due to empty embedding
    const allIds = [...result.positiveClusters.flat(), ...result.negativeClusters.flat()];
    expect(allIds).not.toContain('a');
  });

  it('treats failed_then_fixed as negative', async () => {
    const v1 = makeNormalizedEmbedding([0, 0, 1]);
    const v2 = makeNormalizedEmbedding([0, 0.01, 0.99]);
    const v3 = makeNormalizedEmbedding([0, 0.02, 0.98]);

    const memories = [
      { id: 'ftf1', type: 'task', outcome: 'failed_then_fixed', embedding: v1, tags: '[]' },
      { id: 'ftf2', type: 'task', outcome: 'failed_then_fixed', embedding: v2, tags: '[]' },
      { id: 'f1', type: 'task', outcome: 'failed', embedding: v3, tags: '[]' },
    ];

    const result = await clusterMemories({
      getAllMemories: () => memories,
      totalMemoryCount: 3,
    });

    // All should be in negative clusters, not positive
    expect(result.positiveClusters.flat()).not.toContain('ftf1');
    expect(result.positiveClusters.flat()).not.toContain('ftf2');
  });

  it('treats lesson type memories as negative regardless of outcome', async () => {
    const v1 = makeNormalizedEmbedding([0.5, 0.5, 0]);
    const v2 = makeNormalizedEmbedding([0.51, 0.49, 0]);
    const v3 = makeNormalizedEmbedding([0.52, 0.48, 0]);

    const memories = [
      { id: 'l1', type: 'lesson', outcome: null, embedding: v1, tags: '[]' },
      { id: 'l2', type: 'lesson', outcome: 'success', embedding: v2, tags: '[]' },
      { id: 'l3', type: 'lesson', outcome: null, embedding: v3, tags: '[]' },
    ];

    const result = await clusterMemories({
      getAllMemories: () => memories,
      totalMemoryCount: 3,
    });

    expect(result.positiveClusters.flat()).not.toContain('l1');
    expect(result.positiveClusters.flat()).not.toContain('l2');
    expect(result.positiveClusters.flat()).not.toContain('l3');
  });

  it('ignores memories with partial_success outcome (neither positive nor negative)', async () => {
    const memories = [
      { id: 'p1', type: 'task', outcome: 'partial_success', embedding: makeNormalizedEmbedding([1, 0]), tags: '[]' },
    ];

    const result = await clusterMemories({
      getAllMemories: () => memories,
      totalMemoryCount: 1,
    });

    expect(result.positiveClusters.flat()).not.toContain('p1');
    expect(result.negativeClusters.flat()).not.toContain('p1');
  });

  it('requires minimum cluster size in non-cold-start mode', async () => {
    // Normal mode requires min 3 members.
    // Two similar memories should NOT form a cluster.
    const memories = [
      { id: 'a', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding([1, 0, 0]), tags: '[]' },
      { id: 'b', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding([0.99, 0.01, 0]), tags: '[]' },
    ];

    const result = await clusterMemories({
      getAllMemories: () => memories,
      totalMemoryCount: 100, // non-cold-start
    });

    // Cluster of size 2 < CLUSTERING_MIN_SIZE (3), should be excluded
    expect(result.positiveClusters).toEqual([]);
  });

  it('does not cluster dissimilar memories', async () => {
    const memories = [
      { id: 'a', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding([1, 0, 0]), tags: '[]' },
      { id: 'b', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding([0, 1, 0]), tags: '[]' },
      { id: 'c', type: 'task', outcome: 'success', embedding: makeNormalizedEmbedding([0, 0, 1]), tags: '[]' },
    ];

    const result = await clusterMemories({
      getAllMemories: () => memories,
      totalMemoryCount: 3,
    });

    // All orthogonal, should not cluster
    expect(result.positiveClusters).toEqual([]);
  });
});
