/**
 * Tests for src/retrieval/gap-analysis.ts
 *
 * Covers:
 * - Zero results: all types missing
 * - Partial coverage: some types present, others missing
 * - Full coverage: no missing types
 * - Confidence distribution buckets (high, medium, low)
 * - Unresolved conflict count integration
 * - Project-scoped analysis
 * - Coverage summary text generation
 * - Singular vs plural grammar in summary
 */

import { describe, it, expect, vi } from 'vitest';

import { analyzeGap } from '../../retrieval/gap-analysis.js';
import type { RecallParams, RecallResult, ScoredMemory, MemoryType } from '../../types.js';

function createScoredMemory(
  overrides: Partial<ScoredMemory> & { id: string; type: MemoryType },
): ScoredMemory {
  return {
    title: `Title ${overrides.id}`,
    content: `Content ${overrides.id}`,
    tags: '[]',
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence: 0.5,
    outcome: null,
    source: 'agent',
    embedding: null,
    embedding_model: null,
    signature: 'sig',
    status: 'active',
    access_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
    expires_at: null,
    superseded_by: null,
    session_id: null,
    semantic_score: 0.5,
    bm25_rank: 1,
    vector_rank: 1,
    recency_modifier: 1.0,
    access_boost: 1.0,
    success_weight: 1.0,
    scope_boost: 1.0,
    final_score: 0.5,
    ...overrides,
  };
}

function createMockRetrieve(
  memories: ScoredMemory[],
): (recallParams: RecallParams) => Promise<RecallResult> {
  return vi.fn(async () => ({
    memories,
    conflicts: [],
    total_candidates: memories.length,
    retrieval_time_ms: 1,
  }));
}

describe('analyzeGap', () => {
  it('reports all types as missing when no results are found', async () => {
    const result = await analyzeGap({
      request: { task_description: 'setup ci/cd pipeline' },
      retrieve: createMockRetrieve([]),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.total_results).toBe(0);
    expect(result.missing_types).toHaveLength(9); // All 9 memory types
    expect(result.missing_types).toContain('task');
    expect(result.missing_types).toContain('decision');
    expect(result.missing_types).toContain('preference');
    expect(result.missing_types).toContain('skill');
    expect(result.missing_types).toContain('incident');
    expect(result.missing_types).toContain('lesson');
    expect(result.missing_types).toContain('checkpoint');
    expect(result.missing_types).toContain('session');
    expect(result.missing_types).toContain('verification');
  });

  it('identifies missing types when partial coverage exists', async () => {
    const memories = [
      createScoredMemory({ id: 'mem-1', type: 'task' }),
      createScoredMemory({ id: 'mem-2', type: 'decision' }),
      createScoredMemory({ id: 'mem-3', type: 'lesson' }),
    ];

    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve(memories),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.total_results).toBe(3);
    expect(result.missing_types).not.toContain('task');
    expect(result.missing_types).not.toContain('decision');
    expect(result.missing_types).not.toContain('lesson');
    expect(result.missing_types).toContain('preference');
    expect(result.missing_types).toContain('skill');
    expect(result.missing_types).toContain('incident');
    expect(result.missing_types).toContain('checkpoint');
    expect(result.missing_types).toContain('session');
    expect(result.missing_types).toContain('verification');
  });

  it('reports no missing types when all types are covered', async () => {
    const allTypes: MemoryType[] = [
      'task', 'decision', 'preference', 'skill', 'incident',
      'lesson', 'checkpoint', 'session', 'verification',
    ];
    const memories = allTypes.map((type, i) =>
      createScoredMemory({ id: `mem-${i}`, type }),
    );

    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve(memories),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.missing_types).toHaveLength(0);
  });

  it('counts results by type correctly', async () => {
    const memories = [
      createScoredMemory({ id: 'mem-1', type: 'task' }),
      createScoredMemory({ id: 'mem-2', type: 'task' }),
      createScoredMemory({ id: 'mem-3', type: 'lesson' }),
    ];

    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve(memories),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.results_by_type.task).toBe(2);
    expect(result.results_by_type.lesson).toBe(1);
    expect(result.results_by_type.decision).toBe(0);
  });

  it('computes confidence distribution correctly', async () => {
    const memories = [
      createScoredMemory({ id: 'h1', type: 'task', confidence: 0.9 }), // high
      createScoredMemory({ id: 'h2', type: 'task', confidence: 0.7 }), // high
      createScoredMemory({ id: 'm1', type: 'task', confidence: 0.5 }), // medium
      createScoredMemory({ id: 'm2', type: 'task', confidence: 0.4 }), // medium
      createScoredMemory({ id: 'l1', type: 'task', confidence: 0.2 }), // low
    ];

    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve(memories),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.confidence_distribution.high).toBe(2);
    expect(result.confidence_distribution.medium).toBe(2);
    expect(result.confidence_distribution.low).toBe(1);
  });

  it('includes unresolved conflict count', async () => {
    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve([]),
      getUnresolvedConflictCount: () => 5,
    });

    expect(result.unresolved_conflicts).toBe(5);
  });

  it('passes project_id through to retrieval', async () => {
    const retrieveFn = vi.fn(async () => ({
      memories: [] as ScoredMemory[],
      conflicts: [],
      total_candidates: 0,
      retrieval_time_ms: 1,
    }));

    await analyzeGap({
      request: { task_description: 'test', project_id: 'proj-123' },
      retrieve: retrieveFn,
      getUnresolvedConflictCount: () => 0,
    });

    expect(retrieveFn).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'proj-123',
        limit: 50,
      }),
    );
  });

  it('passes project_id to getUnresolvedConflictCount', async () => {
    const conflictFn = vi.fn(() => 0);

    await analyzeGap({
      request: { task_description: 'test', project_id: 'proj-xyz' },
      retrieve: createMockRetrieve([]),
      getUnresolvedConflictCount: conflictFn,
    });

    expect(conflictFn).toHaveBeenCalledWith('proj-xyz');
  });

  it('generates correct summary for zero results', async () => {
    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve([]),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.coverage_summary).toContain('Found 0 memories');
    expect(result.coverage_summary).toContain('0 types');
  });

  it('uses singular grammar for 1 memory and 1 type', async () => {
    const memories = [
      createScoredMemory({ id: 'mem-1', type: 'task', confidence: 0.8 }),
    ];

    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve(memories),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.coverage_summary).toContain('Found 1 memory');
    expect(result.coverage_summary).toContain('1 type');
  });

  it('includes missing types in summary when present', async () => {
    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve([]),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.coverage_summary).toContain('Missing:');
  });

  it('includes conflict count in summary when present', async () => {
    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve([]),
      getUnresolvedConflictCount: () => 1,
    });

    expect(result.coverage_summary).toContain('1 unresolved conflict');
  });

  it('uses plural for multiple conflicts in summary', async () => {
    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve([]),
      getUnresolvedConflictCount: () => 3,
    });

    expect(result.coverage_summary).toContain('3 unresolved conflicts');
  });

  it('includes confidence breakdown in summary', async () => {
    const memories = [
      createScoredMemory({ id: 'h1', type: 'task', confidence: 0.9 }),
    ];

    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve(memories),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.coverage_summary).toContain('Confidence: 1 high, 0 medium, 0 low');
  });

  it('uses broad retrieval with limit 50 and no type filter', async () => {
    const retrieveFn = vi.fn(async () => ({
      memories: [] as ScoredMemory[],
      conflicts: [],
      total_candidates: 0,
      retrieval_time_ms: 1,
    }));

    await analyzeGap({
      request: { task_description: 'test' },
      retrieve: retrieveFn,
      getUnresolvedConflictCount: () => 0,
    });

    const callArgs = retrieveFn.mock.calls[0][0];
    expect(callArgs.limit).toBe(50);
    expect(callArgs.type_filter).toBeUndefined();
  });

  it('correctly classifies boundary confidence values', async () => {
    const memories = [
      createScoredMemory({ id: 'exact-07', type: 'task', confidence: 0.7 }), // exactly high
      createScoredMemory({ id: 'exact-04', type: 'task', confidence: 0.4 }), // exactly medium
      createScoredMemory({ id: 'below-04', type: 'task', confidence: 0.39 }), // low
    ];

    const result = await analyzeGap({
      request: { task_description: 'test' },
      retrieve: createMockRetrieve(memories),
      getUnresolvedConflictCount: () => 0,
    });

    expect(result.confidence_distribution.high).toBe(1);
    expect(result.confidence_distribution.medium).toBe(1);
    expect(result.confidence_distribution.low).toBe(1);
  });
});
