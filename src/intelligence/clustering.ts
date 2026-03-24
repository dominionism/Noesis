/**
 * Graph-Based Pattern Detection (Learning Loop 2)
 *
 * Clusters similar memories using cosine similarity over embedding vectors
 * and Union-Find for connected component extraction. Produces positive
 * clusters (successful patterns) and negative clusters (failure patterns)
 * that feed into skill / anti-pattern synthesis.
 */

import {
  CLUSTERING_SIMILARITY_THRESHOLD,
  CLUSTERING_MIN_SIZE,
  CLUSTERING_K_NEIGHBORS,
  COLD_START_SIMILARITY_THRESHOLD,
  COLD_START_MIN_SIZE,
  COLD_START_MEMORY_COUNT,
} from '../constants.js';

// ---------------------------------------------------------------------------
// Union-Find (Disjoint Set) with path compression and union-by-rank
// ---------------------------------------------------------------------------

export class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    const p = this.parent.get(x)!;
    if (p !== x) {
      const root = this.find(p);
      this.parent.set(x, root);
      return root;
    }
    return x;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX)!;
    const rankY = this.rank.get(rootY)!;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getComponents(): Map<string, string[]> {
    const components = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const members = components.get(root);
      if (members) {
        members.push(key);
      } else {
        components.set(root, [key]);
      }
    }
    return components;
  }
}

// ---------------------------------------------------------------------------
// Cosine similarity over raw Float32 embedding buffers
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: Buffer, b: Buffer): number {
  if (a.length !== b.length || a.length === 0) return 0;

  const dims = a.length / 4;
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < dims; i++) {
    const va = a.readFloatLE(i * 4);
    const vb = b.readFloatLE(i * 4);
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemoryRow {
  id: string;
  type: string;
  outcome: string | null;
  embedding: Buffer;
  tags: string;
}

export interface ClusterResult {
  positiveClusters: string[][];
  negativeClusters: string[][];
}

// ---------------------------------------------------------------------------
// Core clustering routine
// ---------------------------------------------------------------------------

/**
 * Cluster memories into positive (success) and negative (failure/lesson)
 * groups using k-NN graph construction + Union-Find connected components.
 *
 * Cold-start behavior: when total memory count < COLD_START_MEMORY_COUNT,
 * the algorithm relaxes similarity threshold and minimum cluster size.
 */
export async function clusterMemories(params: {
  getAllMemories: () => Array<MemoryRow>;
  totalMemoryCount: number;
}): Promise<ClusterResult> {
  const { getAllMemories, totalMemoryCount } = params;

  const coldStart = totalMemoryCount < COLD_START_MEMORY_COUNT;
  const similarityThreshold = coldStart
    ? COLD_START_SIMILARITY_THRESHOLD
    : CLUSTERING_SIMILARITY_THRESHOLD;
  const minClusterSize = coldStart
    ? COLD_START_MIN_SIZE
    : CLUSTERING_MIN_SIZE;
  const kNeighbors = CLUSTERING_K_NEIGHBORS;

  const allMemories = getAllMemories();

  const positiveMemories: MemoryRow[] = [];
  const negativeMemories: MemoryRow[] = [];

  for (const mem of allMemories) {
    if (mem.embedding.length === 0) continue;

    if (mem.outcome === 'success') {
      positiveMemories.push(mem);
    } else if (
      mem.outcome === 'failed' ||
      mem.outcome === 'failed_then_fixed' ||
      mem.type === 'lesson'
    ) {
      negativeMemories.push(mem);
    }
  }

  const positiveClusters = buildClusters(
    positiveMemories, similarityThreshold, minClusterSize, kNeighbors,
  );

  const negativeClusters = buildClusters(
    negativeMemories, similarityThreshold, minClusterSize, kNeighbors,
  );

  return { positiveClusters, negativeClusters };
}

// ---------------------------------------------------------------------------
// Internal: build clusters from a set of memory rows
// ---------------------------------------------------------------------------

function buildClusters(
  memories: MemoryRow[],
  threshold: number,
  minSize: number,
  k: number,
): string[][] {
  if (memories.length === 0) return [];

  const uf = new UnionFind();
  const idIndex = new Map<string, MemoryRow>();
  for (const mem of memories) {
    idIndex.set(mem.id, mem);
  }

  for (const mem of memories) {
    const scored: Array<{ id: string; sim: number }> = [];
    for (const other of memories) {
      if (other.id === mem.id) continue;
      const sim = cosineSimilarity(mem.embedding, other.embedding);
      if (sim >= threshold) {
        scored.push({ id: other.id, sim });
      }
    }

    scored.sort((a, b) => b.sim - a.sim);
    const topK = scored.slice(0, k);

    uf.find(mem.id);

    for (const neighbor of topK) {
      uf.union(mem.id, neighbor.id);
    }
  }

  const components = uf.getComponents();

  const candidates: string[][] = [];
  for (const members of components.values()) {
    if (members.length >= minSize) {
      candidates.push(members);
    }
  }

  const validated: string[][] = [];
  for (const cluster of candidates) {
    if (validateClusterCohesion(cluster, idIndex, threshold)) {
      validated.push(cluster);
    }
  }

  return deduplicateClusters(validated);
}

function validateClusterCohesion(
  cluster: string[],
  idIndex: Map<string, MemoryRow>,
  threshold: number,
): boolean {
  if (cluster.length < 2) return false;

  let totalSim = 0;
  let pairCount = 0;

  for (let i = 0; i < cluster.length; i++) {
    const memA = idIndex.get(cluster[i]);
    if (!memA) continue;

    for (let j = i + 1; j < cluster.length; j++) {
      const memB = idIndex.get(cluster[j]);
      if (!memB) continue;

      totalSim += cosineSimilarity(memA.embedding, memB.embedding);
      pairCount++;
    }
  }

  if (pairCount === 0) return false;
  return totalSim / pairCount >= threshold;
}

function deduplicateClusters(clusters: string[][]): string[][] {
  if (clusters.length <= 1) return clusters;

  const sets = clusters.map((c) => new Set(c));
  const merged = new Array<boolean>(clusters.length).fill(false);
  const result: string[][] = [];

  for (let i = 0; i < sets.length; i++) {
    if (merged[i]) continue;

    const current = new Set(sets[i]);

    for (let j = i + 1; j < sets.length; j++) {
      if (merged[j]) continue;

      let overlap = 0;
      for (const id of sets[j]) {
        if (current.has(id)) overlap++;
      }

      const smaller = Math.min(current.size, sets[j].size);
      if (smaller > 0 && overlap / smaller > 0.5) {
        for (const id of sets[j]) {
          current.add(id);
        }
        merged[j] = true;
      }
    }

    result.push(Array.from(current));
  }

  return result;
}
