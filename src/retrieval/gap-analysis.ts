/**
 * Retrieval Gap Analysis
 *
 * Analyzes what the retrieval engine found (and did not find) for a given
 * task description. Produces a diagnostic report covering type coverage,
 * confidence distribution, and unresolved conflicts.
 *
 * Advisory only — surfaces information but never gates agent actions
 * (Invariant 7).
 */

import type {
  RetrievalGapRequest,
  RetrievalGapResponse,
  MemoryType,
  RecallParams,
  RecallResult,
} from '../types.js';

const ALL_MEMORY_TYPES: MemoryType[] = [
  'task',
  'decision',
  'preference',
  'skill',
  'incident',
  'lesson',
  'checkpoint',
  'session',
  'verification',
];

/**
 * Analyze retrieval gaps for a given task description.
 *
 * Retrieves memories matching the task, then counts coverage by type,
 * identifies missing types, tallies unresolved conflicts, and computes
 * the confidence distribution across results.
 */
export async function analyzeGap(params: {
  request: RetrievalGapRequest;
  retrieve: (recallParams: RecallParams) => Promise<RecallResult>;
  getUnresolvedConflictCount: (projectId?: string) => number;
}): Promise<RetrievalGapResponse> {
  const { request, retrieve, getUnresolvedConflictCount } = params;

  // Broad retrieval — limit 50, no type filter
  const recallParams: RecallParams = {
    query: request.task_description,
    limit: 50,
  };

  if (request.project_id !== undefined) {
    recallParams.project_id = request.project_id;
  }

  const result: RecallResult = await retrieve(recallParams);
  const memories = result.memories;

  // Count results by type
  const resultsByType: Record<MemoryType, number> = {} as Record<MemoryType, number>;
  for (const memType of ALL_MEMORY_TYPES) {
    resultsByType[memType] = 0;
  }
  for (const memory of memories) {
    if (memory.type in resultsByType) {
      resultsByType[memory.type]++;
    }
  }

  // Identify missing types
  const missingTypes: MemoryType[] = ALL_MEMORY_TYPES.filter(
    (t) => resultsByType[t] === 0,
  );

  // Get unresolved conflict count
  const unresolvedConflicts = getUnresolvedConflictCount(request.project_id);

  // Compute confidence distribution
  const confidenceDistribution = { high: 0, medium: 0, low: 0 };
  for (const memory of memories) {
    if (memory.confidence >= 0.7) {
      confidenceDistribution.high++;
    } else if (memory.confidence >= 0.4) {
      confidenceDistribution.medium++;
    } else {
      confidenceDistribution.low++;
    }
  }

  // Generate human-readable coverage summary
  const totalResults = memories.length;
  const coveredTypeCount = ALL_MEMORY_TYPES.length - missingTypes.length;

  const parts: string[] = [];
  parts.push(
    `Found ${totalResults} ${totalResults === 1 ? 'memory' : 'memories'} across ${coveredTypeCount} ${coveredTypeCount === 1 ? 'type' : 'types'}.`,
  );

  if (missingTypes.length > 0) {
    parts.push(`Missing: ${missingTypes.join(', ')}.`);
  }

  if (unresolvedConflicts > 0) {
    parts.push(
      `${unresolvedConflicts} unresolved ${unresolvedConflicts === 1 ? 'conflict' : 'conflicts'}.`,
    );
  }

  parts.push(
    `Confidence: ${confidenceDistribution.high} high, ${confidenceDistribution.medium} medium, ${confidenceDistribution.low} low.`,
  );

  const coverageSummary = parts.join(' ');

  return {
    total_results: totalResults,
    results_by_type: resultsByType,
    missing_types: missingTypes,
    unresolved_conflicts: unresolvedConflicts,
    confidence_distribution: confidenceDistribution,
    coverage_summary: coverageSummary,
  };
}
