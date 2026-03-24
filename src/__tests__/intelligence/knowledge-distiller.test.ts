/**
 * Tests for Knowledge Distillation
 *
 * Covers:
 * - shouldDistill: cluster size and similarity threshold checks
 * - identifyCandidates: clustering via Union-Find, filtering by threshold
 * - computeDistilledConfidence: average * 1.1, cap at 1.0
 * - distillCluster: title extraction, content merging, edge creation
 * - runDistillation: full pipeline, skip logic
 * - jaccardSimilarity: set intersection over union
 */

import { describe, it, expect } from 'vitest';
import {
  shouldDistill,
  identifyCandidates,
  computeDistilledConfidence,
  distillCluster,
  runDistillation,
  jaccardSimilarity,
  type DistillableMemory,
  type DistillationCandidate,
} from '../../intelligence/knowledge-distiller.js';

// ===========================================================================
// Helpers
// ===========================================================================

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

function makeMemory(id: string, title: string, embedding: number[], confidence = 0.8): DistillableMemory {
  return {
    id,
    title,
    content: `Content for ${title}`,
    confidence,
    embedding: makeNormalizedEmbedding(embedding),
    tags: JSON.stringify(['tag1', 'tag2']),
  };
}

/** Create a cluster of very similar memories around a base vector. */
function makeSimilarCluster(prefix: string, count: number, baseVector: number[]): DistillableMemory[] {
  const memories: DistillableMemory[] = [];
  for (let i = 0; i < count; i++) {
    const vec = baseVector.map((v, idx) => {
      // Add tiny perturbation to maintain very high similarity
      return idx === 0 ? v - i * 0.001 : v + i * 0.001;
    });
    memories.push(makeMemory(`${prefix}${i}`, `Common theme memory ${i}`, vec));
  }
  return memories;
}

// ===========================================================================
// shouldDistill
// ===========================================================================

describe('shouldDistill', () => {
  it('returns false when cluster is smaller than minimum size', () => {
    const memories = makeSimilarCluster('m', 3, [1, 0, 0]);
    expect(shouldDistill(memories, 5)).toBe(false);
  });

  it('returns false when similarity is below threshold', () => {
    // Create dissimilar memories
    const memories = [
      makeMemory('a', 'Topic A', [1, 0, 0]),
      makeMemory('b', 'Topic B', [0, 1, 0]),
      makeMemory('c', 'Topic C', [0, 0, 1]),
      makeMemory('d', 'Topic D', [-1, 0, 0]),
      makeMemory('e', 'Topic E', [0, -1, 0]),
    ];

    expect(shouldDistill(memories, 5, 0.85)).toBe(false);
  });

  it('returns true when cluster meets size and similarity requirements', () => {
    const memories = makeSimilarCluster('m', 5, [1, 0, 0]);
    expect(shouldDistill(memories, 5, 0.85)).toBe(true);
  });

  it('uses default thresholds when not specified', () => {
    const memories = makeSimilarCluster('m', 5, [1, 0, 0]);
    // Default: minClusterSize=5, similarityThreshold=0.85
    expect(shouldDistill(memories)).toBe(true);
  });
});

// ===========================================================================
// identifyCandidates
// ===========================================================================

describe('identifyCandidates', () => {
  it('returns empty when memory count is below minimum', () => {
    const memories = makeSimilarCluster('m', 3, [1, 0, 0]);
    const candidates = identifyCandidates(memories, 5);
    expect(candidates).toHaveLength(0);
  });

  it('identifies a single cluster of similar memories', () => {
    const memories = makeSimilarCluster('m', 6, [1, 0, 0]);
    const candidates = identifyCandidates(memories, 5, 0.85);

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].members.length).toBeGreaterThanOrEqual(5);
  });

  it('separates dissimilar clusters', () => {
    const clusterA = makeSimilarCluster('a', 5, [1, 0, 0, 0, 0]);
    const clusterB = makeSimilarCluster('b', 5, [0, 0, 0, 0, 1]);

    const all = [...clusterA, ...clusterB];
    const candidates = identifyCandidates(all, 5, 0.85);

    // Should find 2 separate clusters
    expect(candidates.length).toBe(2);
  });

  it('computes average similarity for each candidate', () => {
    const memories = makeSimilarCluster('m', 5, [1, 0, 0]);
    const candidates = identifyCandidates(memories, 5, 0.85);

    if (candidates.length > 0) {
      expect(candidates[0].avgSimilarity).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('computes average confidence for each candidate', () => {
    const memories = makeSimilarCluster('m', 5, [1, 0, 0]);
    const candidates = identifyCandidates(memories, 5, 0.85);

    if (candidates.length > 0) {
      expect(candidates[0].avgConfidence).toBeCloseTo(0.8, 1);
    }
  });
});

// ===========================================================================
// computeDistilledConfidence
// ===========================================================================

describe('computeDistilledConfidence', () => {
  it('returns avg * 1.1', () => {
    const result = computeDistilledConfidence([0.5, 0.7]);
    // avg = 0.6, * 1.1 = 0.66
    expect(result).toBeCloseTo(0.66, 2);
  });

  it('caps at 1.0', () => {
    const result = computeDistilledConfidence([0.95, 0.95, 0.95]);
    expect(result).toBe(1.0);
  });

  it('returns 0 for empty input', () => {
    expect(computeDistilledConfidence([])).toBe(0);
  });

  it('handles single confidence', () => {
    expect(computeDistilledConfidence([0.8])).toBeCloseTo(0.88, 2);
  });

  it('applies 10% boost', () => {
    const base = computeDistilledConfidence([0.5]);
    expect(base).toBeCloseTo(0.55, 2);
  });
});

// ===========================================================================
// distillCluster
// ===========================================================================

describe('distillCluster', () => {
  it('creates a distilled memory with valid structure', () => {
    const members = makeSimilarCluster('m', 5, [1, 0, 0]);
    const candidate: DistillationCandidate = {
      clusterId: 'cluster-1',
      members,
      avgSimilarity: 0.95,
      avgConfidence: 0.8,
    };

    const result = distillCluster(candidate);

    expect(result.distilled.id).toBeTruthy();
    expect(result.distilled.title).toContain('Distilled');
    expect(result.distilled.content).toContain('Distilled from 5');
    expect(result.distilled.confidence).toBeGreaterThan(0);
    expect(result.distilled.sourceMemoryIds).toHaveLength(5);
    expect(result.sourcesCount).toBe(5);
  });

  it('creates generalizes edges to all source memories', () => {
    const members = makeSimilarCluster('m', 3, [1, 0, 0]);
    const candidate: DistillationCandidate = {
      clusterId: 'c1',
      members,
      avgSimilarity: 0.9,
      avgConfidence: 0.7,
    };

    const result = distillCluster(candidate);

    expect(result.edges).toHaveLength(3);
    for (const edge of result.edges) {
      expect(edge.from).toBe(result.distilled.id);
      expect(edge.relation).toBe('generalizes');
      expect(members.map((m) => m.id)).toContain(edge.to);
    }
  });

  it('merges and deduplicates tags', () => {
    const memories: DistillableMemory[] = [
      { ...makeMemory('a', 'A', [1, 0, 0]), tags: JSON.stringify(['typescript', 'api']) },
      { ...makeMemory('b', 'B', [1, 0, 0]), tags: JSON.stringify(['api', 'backend']) },
      { ...makeMemory('c', 'C', [1, 0, 0]), tags: JSON.stringify(['typescript', 'testing']) },
      { ...makeMemory('d', 'D', [1, 0, 0]), tags: JSON.stringify(['api']) },
      { ...makeMemory('e', 'E', [1, 0, 0]), tags: JSON.stringify(['backend']) },
    ];

    const candidate: DistillationCandidate = {
      clusterId: 'c1',
      members: memories,
      avgSimilarity: 0.9,
      avgConfidence: 0.8,
    };

    const result = distillCluster(candidate);
    const tags = result.distilled.tags;

    expect(tags).toContain('typescript');
    expect(tags).toContain('api');
    expect(tags).toContain('backend');
    expect(tags).toContain('testing');
    // No duplicates
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('handles unparseable tags gracefully', () => {
    const memories: DistillableMemory[] = makeSimilarCluster('m', 5, [1, 0, 0]);
    memories[0].tags = 'not-valid-json';

    const candidate: DistillationCandidate = {
      clusterId: 'c1',
      members: memories,
      avgSimilarity: 0.9,
      avgConfidence: 0.8,
    };

    // Should not throw
    const result = distillCluster(candidate);
    expect(result.distilled.tags).toBeDefined();
  });

  it('extracts common theme from titles', () => {
    const memories: DistillableMemory[] = [
      makeMemory('a', 'Implement caching for user service', [1, 0, 0]),
      makeMemory('b', 'Implement caching for product service', [1, 0, 0]),
      makeMemory('c', 'Implement caching for auth service', [1, 0, 0]),
      makeMemory('d', 'Implement caching for order service', [1, 0, 0]),
      makeMemory('e', 'Implement caching for payment service', [1, 0, 0]),
    ];

    const candidate: DistillationCandidate = {
      clusterId: 'c1',
      members: memories,
      avgSimilarity: 0.9,
      avgConfidence: 0.8,
    };

    const result = distillCluster(candidate);
    // "implement" and "caching" and "service" appear in all titles
    expect(result.distilled.title.toLowerCase()).toContain('implement');
    expect(result.distilled.title.toLowerCase()).toContain('caching');
  });
});

// ===========================================================================
// runDistillation
// ===========================================================================

describe('runDistillation', () => {
  it('returns empty results when no candidates are found', () => {
    const memories = makeSimilarCluster('m', 3, [1, 0, 0]);
    const result = runDistillation(memories, 5);

    expect(result.results).toHaveLength(0);
    expect(result.candidatesFound).toBe(0);
    expect(result.candidatesDistilled).toBe(0);
  });

  it('distills valid candidate clusters', () => {
    const memories = makeSimilarCluster('m', 6, [1, 0, 0]);
    const result = runDistillation(memories, 5, 0.85);

    expect(result.candidatesFound).toBeGreaterThanOrEqual(1);
    expect(result.candidatesDistilled).toBeGreaterThanOrEqual(1);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('creates edges for each distilled memory', () => {
    const memories = makeSimilarCluster('m', 5, [1, 0, 0]);
    const result = runDistillation(memories, 5, 0.85);

    if (result.results.length > 0) {
      const first = result.results[0];
      expect(first.edges.length).toBe(first.sourcesCount);
      for (const edge of first.edges) {
        expect(edge.relation).toBe('generalizes');
      }
    }
  });

  it('handles multiple independent clusters', () => {
    const clusterA = makeSimilarCluster('a', 5, [1, 0, 0, 0, 0]);
    const clusterB = makeSimilarCluster('b', 5, [0, 0, 0, 0, 1]);
    const all = [...clusterA, ...clusterB];

    const result = runDistillation(all, 5, 0.85);
    expect(result.candidatesFound).toBe(2);
    expect(result.candidatesDistilled).toBe(2);
  });
});

// ===========================================================================
// jaccardSimilarity
// ===========================================================================

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1.0);
  });

  it('returns 0.0 for disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0.0);
  });

  it('computes correct similarity for overlapping sets', () => {
    // intersection = {b}, union = {a, b, c, d} => 1/4 = 0.25
    expect(jaccardSimilarity(['a', 'b'], ['b', 'c', 'd'])).toBeCloseTo(0.25, 2);
  });

  it('returns 0 for two empty sets', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it('returns 0 when one set is empty', () => {
    expect(jaccardSimilarity(['a'], [])).toBe(0);
  });

  it('handles single-element identical sets', () => {
    expect(jaccardSimilarity(['x'], ['x'])).toBe(1.0);
  });
});
