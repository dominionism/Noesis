/**
 * Retrieval Explainability
 *
 * Full scoring breakdown for all candidate memories in a retrieval query.
 * Supports two modes:
 * 1. General query: shows all candidates with full scoring breakdown
 * 2. Specific memory: shows why a particular memory did/didn't surface
 *
 * Security:
 * - A01: project_id scoping is delegated to the retrieve() function
 * - A02: HMAC verification for exclusion reason determination
 * - A03: No SQL constructed here; delegated to injected functions
 * - A09: No sensitive data exposed beyond 8-dim embedding preview
 */

import type {
  ExplainRequest,
  ExplainResponse,
  RecallParams,
  RecallResult,
  ScoredMemory,
  Memory,
  EmbeddingProvider,
} from '../types.js';

import {
  computeRecencyModifier,
  computeAccessBoost,
  computeSuccessWeight,
  computeScopeBoost,
} from './scoring.js';

/**
 * Format the first N dimensions of a Float32Array as a readable preview.
 */
function formatEmbeddingPreview(embedding: Float32Array, dimensions: number = 8): string {
  const previewCount = Math.min(dimensions, embedding.length);
  const values: string[] = [];

  for (let i = 0; i < previewCount; i++) {
    values.push(embedding[i].toFixed(3));
  }

  if (embedding.length > previewCount) {
    return `[${values.join(', ')}, ...]`;
  }

  return `[${values.join(', ')}]`;
}

type ExclusionReason =
  | 'below_threshold'
  | 'filtered_by_type_exclude'
  | 'hmac_verification_failed'
  | 'status_not_active'
  | 'not_found';

/**
 * Determine why a memory was excluded from the retrieval results.
 */
function determineExclusionReason(
  memory: Memory,
  _request: ExplainRequest,
  recallParams: RecallParams,
  verifyMemoryFn?: (mem: {
    id: string;
    type: string;
    title: string;
    content: string;
    project_id: string | null;
    signature: string;
  }) => { valid: boolean },
): ExclusionReason {
  // Check HMAC integrity first
  if (verifyMemoryFn) {
    const verification = verifyMemoryFn({
      id: memory.id,
      type: memory.type,
      title: memory.title,
      content: memory.content,
      project_id: memory.project_id,
      signature: memory.signature,
    });

    if (!verification.valid) {
      return 'hmac_verification_failed';
    }
  }

  if (memory.status !== 'active') {
    return 'status_not_active';
  }

  if (
    recallParams.type_exclude !== undefined &&
    recallParams.type_exclude.length > 0 &&
    recallParams.type_exclude.includes(memory.type)
  ) {
    return 'filtered_by_type_exclude';
  }

  return 'below_threshold';
}

/**
 * Produce a full explainability breakdown for a retrieval query.
 *
 * Runs the actual retrieval pipeline, embeds the query text, and maps
 * every scored memory into the explain response format with all scoring
 * components exposed.
 */
export async function explainRetrieval(params: {
  request: ExplainRequest;
  retrieve: (recallParams: RecallParams) => Promise<RecallResult>;
  embeddingProvider: EmbeddingProvider;
  getMemory?: (id: string) => Memory | null;
  verifyMemory?: (mem: {
    id: string;
    type: string;
    title: string;
    content: string;
    project_id: string | null;
    signature: string;
  }) => { valid: boolean };
}): Promise<ExplainResponse> {
  const { request, retrieve, embeddingProvider, getMemory, verifyMemory } = params;

  const recallParams: RecallParams = {
    query: request.query,
  };

  if (request.project_id !== undefined) {
    recallParams.project_id = request.project_id;
  }

  const [recallResult, queryEmbedding] = await Promise.all([
    retrieve(recallParams),
    embeddingProvider.embed(request.query),
  ]);

  const queryEmbeddingPreview = formatEmbeddingPreview(queryEmbedding, 8);

  const results: ExplainResponse['results'] = recallResult.memories.map(
    (scored: ScoredMemory) => ({
      memory_id: scored.id,
      title: scored.title,
      semantic_score: scored.semantic_score,
      bm25_rank: scored.bm25_rank,
      vector_rank: scored.vector_rank,
      recency_modifier: scored.recency_modifier,
      access_boost: scored.access_boost,
      success_weight: scored.success_weight,
      scope_boost: scored.scope_boost,
      final_score: scored.final_score,
      included: true,
    }),
  );

  // Handle specific memory_id that may not be in results
  if (request.memory_id !== undefined) {
    const memoryInResults = results.find((r) => r.memory_id === request.memory_id);

    if (memoryInResults === undefined) {
      if (getMemory !== undefined) {
        const memory = getMemory(request.memory_id);

        if (memory !== null) {
          const recencyModifier = computeRecencyModifier(memory.last_accessed_at);
          const accessBoost = computeAccessBoost(memory.access_count);
          const successWeight = computeSuccessWeight(memory.outcome);
          const scopeBoost = computeScopeBoost(
            memory.project_id,
            memory.scope,
            request.project_id,
          );

          const semanticScore = 0;
          const finalScore =
            semanticScore * recencyModifier * accessBoost * successWeight * scopeBoost;

          const exclusionReason = determineExclusionReason(
            memory, request, recallParams, verifyMemory,
          );

          results.push({
            memory_id: memory.id,
            title: memory.title,
            semantic_score: semanticScore,
            bm25_rank: 0,
            vector_rank: 0,
            recency_modifier: recencyModifier,
            access_boost: accessBoost,
            success_weight: successWeight,
            scope_boost: scopeBoost,
            final_score: finalScore,
            included: false,
            exclusion_reason: exclusionReason,
          });
        } else {
          results.push({
            memory_id: request.memory_id,
            title: '',
            semantic_score: 0,
            bm25_rank: 0,
            vector_rank: 0,
            recency_modifier: 0,
            access_boost: 0,
            success_weight: 0,
            scope_boost: 0,
            final_score: 0,
            included: false,
            exclusion_reason: 'not_found',
          });
        }
      } else {
        results.push({
          memory_id: request.memory_id,
          title: '',
          semantic_score: 0,
          bm25_rank: 0,
          vector_rank: 0,
          recency_modifier: 0,
          access_boost: 0,
          success_weight: 0,
          scope_boost: 0,
          final_score: 0,
          included: false,
          exclusion_reason: 'not_found',
        });
      }
    }
  }

  const appliedFilters: Record<string, unknown> = {};
  appliedFilters.query = request.query;

  if (request.project_id !== undefined) {
    appliedFilters.project_id = request.project_id;
  }

  if (request.memory_id !== undefined) {
    appliedFilters.memory_id = request.memory_id;
  }

  return {
    query_embedding_preview: queryEmbeddingPreview,
    results,
    applied_filters: appliedFilters,
  };
}
