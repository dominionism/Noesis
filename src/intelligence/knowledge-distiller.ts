/**
 * Knowledge Distillation
 *
 * Identifies clusters of similar memories and distills them into
 * higher-order knowledge. Distilled memories capture the essence
 * of multiple related memories with boosted confidence.
 *
 * Process:
 * 1. IDENTIFY — Find memory clusters with high internal similarity (>0.85)
 * 2. DISTILL — Create single high-order memory capturing the essence
 * 3. LINK — Create knowledge graph edges (generalizes -> originals)
 * 4. SCORE — Distilled confidence = avg(source_confidences) * 1.1
 * 5. LIFECYCLE — Distilled memories participate in normal retrieval
 */

import { generateId } from '../core/ulid.js';
import { cosineSimilarity, UnionFind } from './clustering.js';

// ===========================================================================
// Types
// ===========================================================================

export interface DistillableMemory {
  id: string;
  title: string;
  content: string;
  confidence: number;
  embedding: Buffer;
  tags: string; // JSON array string
}

export interface DistillationCandidate {
  clusterId: string;
  members: DistillableMemory[];
  avgSimilarity: number;
  avgConfidence: number;
}

export interface DistilledMemory {
  id: string;
  title: string;
  content: string;
  confidence: number;
  sourceMemoryIds: string[];
  tags: string[];
}

export interface DistillationEdge {
  from: string;
  to: string;
  relation: 'generalizes';
}

export interface DistillationResult {
  distilled: DistilledMemory;
  edges: DistillationEdge[];
  sourcesCount: number;
}

export interface FullDistillationResult {
  results: DistillationResult[];
  candidatesFound: number;
  candidatesDistilled: number;
  skipped: number;
}

// ===========================================================================
// Constants
// ===========================================================================

/** Minimum cluster size to trigger distillation. */
const DEFAULT_MIN_CLUSTER_SIZE = 5;

/** Minimum pairwise similarity for distillation candidates. */
const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

/** Confidence boost factor for distilled memories. */
const CONFIDENCE_BOOST = 1.1;

/** Maximum confidence after boost. */
const MAX_CONFIDENCE = 1.0;

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Check whether a set of memories should be distilled.
 *
 * Returns true when there are enough memories and their average
 * pairwise similarity meets the threshold.
 */
export function shouldDistill(
  memories: DistillableMemory[],
  minClusterSize: number = DEFAULT_MIN_CLUSTER_SIZE,
  similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): boolean {
  if (memories.length < minClusterSize) return false;

  const avgSim = computeAverageSimilarity(memories);
  return avgSim >= similarityThreshold;
}

/**
 * Identify clusters of memories that are candidates for distillation.
 *
 * Uses Union-Find clustering with the specified similarity threshold.
 * Returns clusters of size >= minClusterSize with average pairwise
 * similarity >= similarityThreshold.
 */
export function identifyCandidates(
  memories: DistillableMemory[],
  minClusterSize: number = DEFAULT_MIN_CLUSTER_SIZE,
  similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): DistillationCandidate[] {
  if (memories.length < minClusterSize) return [];

  const uf = new UnionFind();
  const memoryMap = new Map(memories.map((m) => [m.id, m]));

  // Build similarity graph and union similar pairs
  for (let i = 0; i < memories.length; i++) {
    uf.find(memories[i].id);

    for (let j = i + 1; j < memories.length; j++) {
      const sim = cosineSimilarity(memories[i].embedding, memories[j].embedding);
      if (sim >= similarityThreshold) {
        uf.union(memories[i].id, memories[j].id);
      }
    }
  }

  // Extract components
  const components = uf.getComponents();
  const candidates: DistillationCandidate[] = [];

  for (const [root, memberIds] of components) {
    if (memberIds.length < minClusterSize) continue;

    const members = memberIds
      .map((id) => memoryMap.get(id))
      .filter((m): m is DistillableMemory => m !== undefined);

    if (members.length < minClusterSize) continue;

    const avgSimilarity = computeAverageSimilarity(members);
    if (avgSimilarity < similarityThreshold) continue;

    const avgConfidence = members.reduce((sum, m) => sum + m.confidence, 0) / members.length;

    candidates.push({
      clusterId: root,
      members,
      avgSimilarity,
      avgConfidence,
    });
  }

  return candidates;
}

/**
 * Compute the distilled confidence from source confidences.
 *
 * confidence = avg(source_confidences) * 1.1, capped at 1.0
 */
export function computeDistilledConfidence(sourceConfidences: number[]): number {
  if (sourceConfidences.length === 0) return 0;

  const avg = sourceConfidences.reduce((sum, c) => sum + c, 0) / sourceConfidences.length;
  return Math.min(avg * CONFIDENCE_BOOST, MAX_CONFIDENCE);
}

/**
 * Distill a cluster of memories into a single high-order memory.
 *
 * Extracts the common theme from titles, merges content,
 * deduplicates tags, and computes boosted confidence.
 */
export function distillCluster(candidate: DistillationCandidate): DistillationResult {
  const distilledId = generateId();

  // Extract common theme from titles
  const title = extractCommonTheme(candidate.members.map((m) => m.title));

  // Merge content: extract key sentences
  const content = mergeContent(candidate.members);

  // Compute boosted confidence
  const confidence = computeDistilledConfidence(
    candidate.members.map((m) => m.confidence),
  );

  // Merge and deduplicate tags
  const allTags = new Set<string>();
  for (const member of candidate.members) {
    try {
      const parsed = JSON.parse(member.tags) as string[];
      for (const tag of parsed) {
        allTags.add(tag);
      }
    } catch {
      // Skip unparseable tags
    }
  }

  const sourceMemoryIds = candidate.members.map((m) => m.id);

  // Create edges: distilled -[generalizes]-> each source
  const edges: DistillationEdge[] = sourceMemoryIds.map((sourceId) => ({
    from: distilledId,
    to: sourceId,
    relation: 'generalizes' as const,
  }));

  return {
    distilled: {
      id: distilledId,
      title,
      content,
      confidence,
      sourceMemoryIds,
      tags: Array.from(allTags),
    },
    edges,
    sourcesCount: candidate.members.length,
  };
}

/**
 * Run full distillation pipeline on a set of memories.
 *
 * Identifies candidates, distills each cluster, returns all results.
 */
export function runDistillation(
  memories: DistillableMemory[],
  minClusterSize: number = DEFAULT_MIN_CLUSTER_SIZE,
  similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): FullDistillationResult {
  const candidates = identifyCandidates(memories, minClusterSize, similarityThreshold);

  const results: DistillationResult[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    if (!shouldDistill(candidate.members, minClusterSize, similarityThreshold)) {
      skipped++;
      continue;
    }

    const result = distillCluster(candidate);
    results.push(result);
  }

  return {
    results,
    candidatesFound: candidates.length,
    candidatesDistilled: results.length,
    skipped,
  };
}

/**
 * Compute Jaccard similarity between two tag sets.
 */
export function jaccardSimilarity(tagsA: string[], tagsB: string[]): number {
  const setA = new Set(tagsA);
  const setB = new Set(tagsB);

  let intersection = 0;
  for (const tag of setA) {
    if (setB.has(tag)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;

  return intersection / union;
}

// ===========================================================================
// Internal helpers
// ===========================================================================

/**
 * Compute average pairwise cosine similarity across a set of memories.
 */
function computeAverageSimilarity(memories: DistillableMemory[]): number {
  if (memories.length < 2) return 1.0;

  let totalSim = 0;
  let pairCount = 0;

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      totalSim += cosineSimilarity(memories[i].embedding, memories[j].embedding);
      pairCount++;
    }
  }

  if (pairCount === 0) return 0;
  return totalSim / pairCount;
}

/**
 * Extract a common theme from a list of titles.
 *
 * Finds the most frequently occurring significant words and
 * constructs a summary title from them.
 */
function extractCommonTheme(titles: string[]): string {
  const wordCounts = new Map<string, number>();

  for (const title of titles) {
    const words = title.toLowerCase()
      .split(/[\s_\-:,]+/)
      .filter((w) => w.length > 3);

    const seen = new Set<string>();
    for (const word of words) {
      if (seen.has(word)) continue;
      seen.add(word);
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }

  // Find words that appear in majority of titles
  const threshold = titles.length * 0.5;
  const commonWords = Array.from(wordCounts.entries())
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  if (commonWords.length === 0) {
    return `Distilled: ${titles[0]}`;
  }

  // Capitalize first word
  const themeWords = commonWords.slice(0, 5);
  themeWords[0] = themeWords[0].charAt(0).toUpperCase() + themeWords[0].slice(1);

  return `Distilled: ${themeWords.join(' ')}`;
}

/**
 * Merge content from multiple memories into a distilled summary.
 *
 * Extracts the first sentence from each memory and deduplicates.
 */
function mergeContent(memories: DistillableMemory[]): string {
  const keyPoints = new Set<string>();

  for (const memory of memories) {
    // Extract first sentence or line
    const firstSentence = memory.content.split(/[.\n]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 10) {
      keyPoints.add(firstSentence);
    }
  }

  const points = Array.from(keyPoints);
  if (points.length === 0) {
    return `Distilled from ${memories.length} related memories.`;
  }

  return [
    `Distilled from ${memories.length} related memories:`,
    '',
    ...points.map((p) => `- ${p}`),
  ].join('\n');
}
