/**
 * Test-Time Compute — Selective extra computation for hard tasks.
 *
 * Instead of always escalating to stronger (more expensive) models,
 * use extra system-level compute: generate multiple candidate solutions,
 * verify them, rank them, and select the best.
 *
 * ABILITIES.md Improvement #6: Add selective test-time compute.
 *
 * Research basis: Self-Consistency (Wang et al., 2022),
 * Tree of Thoughts (Yao et al., 2023), s1 (Muennighoff et al., 2025).
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export type ComputeStrategy =
  | 'single_pass'
  | 'multi_sample'
  | 'branch_and_bound'
  | 'iterative_refinement';

export interface ComputeBudget {
  maxSamples: number;
  maxIterations: number;
  maxBranches: number;
  timeoutMs: number;
}

export interface CandidateSolution {
  id: string;
  content: string;
  score: number;
  verificationsPassed: number;
  verificationsTotal: number;
  metadata: Record<string, unknown>;
}

export interface BranchNode {
  id: string;
  parentId: string | null;
  description: string;
  score: number;
  depth: number;
  pruned: boolean;
  pruneReason?: string;
  children: string[];
}

export interface TestTimeResult {
  strategy: ComputeStrategy;
  candidates: CandidateSolution[];
  selectedCandidate: CandidateSolution;
  totalSamples: number;
  totalIterations: number;
  reasoning: string;
}

// ===========================================================================
// Default budgets per strategy
// ===========================================================================

const STRATEGY_BUDGETS: Record<ComputeStrategy, ComputeBudget> = {
  single_pass: {
    maxSamples: 1,
    maxIterations: 1,
    maxBranches: 1,
    timeoutMs: 30_000,
  },
  multi_sample: {
    maxSamples: 3,
    maxIterations: 1,
    maxBranches: 1,
    timeoutMs: 60_000,
  },
  branch_and_bound: {
    maxSamples: 5,
    maxIterations: 3,
    maxBranches: 4,
    timeoutMs: 120_000,
  },
  iterative_refinement: {
    maxSamples: 3,
    maxIterations: 5,
    maxBranches: 1,
    timeoutMs: 180_000,
  },
};

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Determine the appropriate compute strategy based on task characteristics.
 *
 * Logic:
 * - uncertainty < 0.3: single_pass (task is straightforward)
 * - uncertainty < 0.6: multi_sample (generate 3 candidates, pick best)
 * - uncertainty < 0.8: branch_and_bound (explore tree of possibilities)
 * - uncertainty >= 0.8: iterative_refinement (generate, critique, refine)
 *
 * If hasVerification is true, favor multi_sample over branch_and_bound
 * since we can cheaply verify multiple candidates rather than exploring
 * an expensive search tree.
 */
export function selectComputeStrategy(
  taskComplexity: number,
  uncertainty: number,
  hasVerification: boolean,
): { strategy: ComputeStrategy; budget: ComputeBudget } {
  // Clamp inputs to [0, 1]
  const clampedComplexity = Math.max(0, Math.min(1, taskComplexity));
  const clampedUncertainty = Math.max(0, Math.min(1, uncertainty));

  let strategy: ComputeStrategy;

  if (clampedUncertainty < 0.3) {
    strategy = 'single_pass';
  } else if (clampedUncertainty < 0.6) {
    strategy = 'multi_sample';
  } else if (clampedUncertainty < 0.8) {
    // When verification is available, multi_sample is cheaper and
    // sufficient because we can run many samples through the verifier
    // instead of building an expensive search tree.
    strategy = hasVerification ? 'multi_sample' : 'branch_and_bound';
  } else {
    strategy = 'iterative_refinement';
  }

  const budget = { ...STRATEGY_BUDGETS[strategy] };

  // Scale budget with complexity: higher complexity earns more samples and time
  if (clampedComplexity > 0.7) {
    budget.maxSamples = Math.min(budget.maxSamples * 2, 10);
    budget.timeoutMs = Math.round(budget.timeoutMs * 1.5);
  }

  return { strategy, budget };
}

/**
 * Build a default compute budget for a given strategy.
 */
export function getDefaultBudget(strategy: ComputeStrategy): ComputeBudget {
  return { ...STRATEGY_BUDGETS[strategy] };
}

/**
 * Score and rank a set of candidate solutions.
 *
 * Scoring criteria:
 * - verificationScore: verificationsPassed / verificationsTotal (weight: 0.5)
 * - completenessScore: based on content length relative to median (weight: 0.2)
 * - consistencyScore: Jaccard similarity of keyword sets vs. other candidates (weight: 0.3)
 *
 * Returns candidates sorted by score descending. Each candidate's `score`
 * field is overwritten with the computed composite score.
 */
export function rankCandidates(
  candidates: CandidateSolution[],
): CandidateSolution[] {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) {
    const solo = { ...candidates[0] };
    solo.score =
      solo.verificationsTotal > 0
        ? solo.verificationsPassed / solo.verificationsTotal
        : 0.5;
    return [solo];
  }

  // Compute median content length for completeness scoring
  const lengths = candidates.map((c) => c.content.length).sort((a, b) => a - b);
  const mid = Math.floor(lengths.length / 2);
  const medianLength =
    lengths.length % 2 === 0
      ? (lengths[mid - 1] + lengths[mid]) / 2
      : lengths[mid];

  const scored = candidates.map((candidate) => {
    const copy = { ...candidate };

    // Verification score (weight 0.5)
    const verificationScore =
      copy.verificationsTotal > 0
        ? copy.verificationsPassed / copy.verificationsTotal
        : 0.5;

    // Completeness score (weight 0.2)
    // Ratio of content length to median, capped at 1.0.
    // Very short content relative to peers is penalised; very long is not rewarded beyond 1.0.
    const completenessScore =
      medianLength > 0
        ? Math.min(copy.content.length / medianLength, 1.0)
        : 0.5;

    // Consistency score (weight 0.3)
    const consistencyScore = computeConsistencyScore(copy, candidates);

    copy.score =
      verificationScore * 0.5 +
      completenessScore * 0.2 +
      consistencyScore * 0.3;

    return copy;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Compute a consistency score for a candidate against all others.
 *
 * Uses Jaccard similarity of keyword sets. The candidate's score is the
 * average Jaccard similarity against every *other* candidate.
 */
export function computeConsistencyScore(
  candidate: CandidateSolution,
  allCandidates: CandidateSolution[],
): number {
  const others = allCandidates.filter((c) => c.id !== candidate.id);
  if (others.length === 0) return 1.0;

  const candidateKeywords = extractKeywords(candidate.content);
  if (candidateKeywords.size === 0) return 0;

  let totalSimilarity = 0;

  for (const other of others) {
    const otherKeywords = extractKeywords(other.content);
    totalSimilarity += jaccardSimilarity(candidateKeywords, otherKeywords);
  }

  return totalSimilarity / others.length;
}

/**
 * Branch-and-bound: evaluate whether a branch should be pruned.
 *
 * Prune if:
 * - score < 0.3 (too weak to continue)
 * - depth > maxDepth (too deep)
 * - score is 50%+ worse than the current best score at this depth
 */
export function shouldPruneBranch(
  node: BranchNode,
  bestScoreAtDepth: number,
  maxDepth: number,
): { prune: boolean; reason?: string } {
  if (node.score < 0.3) {
    return {
      prune: true,
      reason: `Score ${node.score.toFixed(2)} is below minimum threshold 0.3`,
    };
  }

  if (node.depth > maxDepth) {
    return {
      prune: true,
      reason: `Depth ${node.depth} exceeds maximum depth ${maxDepth}`,
    };
  }

  // "50%+ worse" means the node's score is at most half of the best score.
  if (bestScoreAtDepth > 0 && node.score < bestScoreAtDepth * 0.5) {
    return {
      prune: true,
      reason: `Score ${node.score.toFixed(2)} is more than 50% worse than best score ${bestScoreAtDepth.toFixed(2)} at this depth`,
    };
  }

  return { prune: false };
}

// ===========================================================================
// Factory helpers
// ===========================================================================

/**
 * Create a new CandidateSolution with a generated ID.
 */
export function createCandidate(
  content: string,
  verificationsPassed: number,
  verificationsTotal: number,
  metadata: Record<string, unknown> = {},
): CandidateSolution {
  return {
    id: generateId(),
    content,
    score: 0,
    verificationsPassed,
    verificationsTotal,
    metadata,
  };
}

/**
 * Create a new BranchNode with a generated ID.
 */
export function createBranchNode(
  description: string,
  score: number,
  depth: number,
  parentId: string | null = null,
): BranchNode {
  return {
    id: generateId(),
    parentId,
    description,
    score,
    depth,
    pruned: false,
    children: [],
  };
}

/**
 * Build a TestTimeResult from a ranked candidate list.
 *
 * Selects the highest-scored candidate and produces a human-readable
 * reasoning string explaining the selection.
 */
export function buildResult(
  strategy: ComputeStrategy,
  rankedCandidates: CandidateSolution[],
  totalSamples: number,
  totalIterations: number,
): TestTimeResult {
  if (rankedCandidates.length === 0) {
    throw new Error('Cannot build TestTimeResult from zero candidates');
  }

  const selected = rankedCandidates[0];
  const runnerUp = rankedCandidates.length > 1 ? rankedCandidates[1] : null;

  let reasoning = `Strategy "${strategy}" evaluated ${totalSamples} sample(s) over ${totalIterations} iteration(s). `;
  reasoning += `Selected candidate ${selected.id} with score ${selected.score.toFixed(3)}`;

  if (runnerUp) {
    const margin = selected.score - runnerUp.score;
    reasoning += ` (margin over runner-up: ${margin.toFixed(3)})`;
  }

  reasoning += '.';

  return {
    strategy,
    candidates: rankedCandidates,
    selectedCandidate: selected,
    totalSamples,
    totalIterations,
    reasoning,
  };
}

// ===========================================================================
// Internal helpers
// ===========================================================================

/**
 * Extract a set of normalised keywords from text.
 *
 * Splits on non-alphanumeric characters, lowercases, filters out short
 * tokens (< 3 chars) and common stop words.
 */
function extractKeywords(text: string): Set<string> {
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
    'can', 'has', 'her', 'was', 'one', 'our', 'out', 'his',
    'its', 'had', 'how', 'may', 'who', 'did', 'get', 'she',
    'him', 'let', 'say', 'too', 'use', 'from', 'that', 'this',
    'with', 'have', 'will', 'been', 'they', 'then', 'than',
    'into', 'each', 'make', 'like', 'just', 'over', 'such',
    'also', 'some', 'what', 'when', 'which', 'would', 'there',
    'their', 'about', 'could', 'other', 'these', 'should',
  ]);

  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

  return new Set(tokens);
}

/**
 * Compute the Jaccard similarity between two sets.
 *
 * Returns |A ∩ B| / |A ∪ B|, or 0 when both sets are empty.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersectionSize = 0;
  // Iterate over the smaller set for efficiency
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) intersectionSize++;
  }

  const unionSize = a.size + b.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0;
}
