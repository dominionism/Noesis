/**
 * Tests for src/retrieval/action-advisory.ts
 *
 * Covers:
 * - Returns warnings from incident and lesson memories
 * - Scopes retrieval to incident + lesson types only
 * - Respects project_id scoping
 * - Warning objects contain correct fields
 * - Summary truncation with word-boundary respect
 * - Summary within limit is not truncated
 * - Warning count matches warnings array length
 * - Empty retrieval returns zero warnings
 * - Retrieval limit is set to 20
 */

import { describe, it, expect, vi } from 'vitest';

import { checkAction } from '../../retrieval/action-advisory.js';
import type { RecallParams, RecallResult, ScoredMemory, MemoryType } from '../../types.js';

function createScoredMemory(
  overrides: Partial<ScoredMemory> & { id: string; type: MemoryType },
): ScoredMemory {
  return {
    title: `Title ${overrides.id}`,
    content: `Content for ${overrides.id}`,
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
    final_score: 0.7,
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

describe('checkAction', () => {
  it('returns warnings from incident and lesson memories', async () => {
    const memories = [
      createScoredMemory({
        id: 'inc-1',
        type: 'incident',
        title: 'DB migration broke prod',
        content: 'Migration scripts ran out of order causing downtime.',
        final_score: 0.85,
      }),
      createScoredMemory({
        id: 'les-1',
        type: 'lesson',
        title: 'Always run migrations in staging first',
        content: 'Learned after the prod incident.',
        final_score: 0.72,
      }),
    ];

    const result = await checkAction({
      request: { action_description: 'Run database migration' },
      retrieve: createMockRetrieve(memories),
    });

    expect(result.warnings).toHaveLength(2);
    expect(result.warning_count).toBe(2);
  });

  it('scopes retrieval to incident + lesson types with limit 20', async () => {
    const retrieveFn = vi.fn(async () => ({
      memories: [] as ScoredMemory[],
      conflicts: [],
      total_candidates: 0,
      retrieval_time_ms: 1,
    }));

    await checkAction({
      request: { action_description: 'Deploy to production' },
      retrieve: retrieveFn,
    });

    expect(retrieveFn).toHaveBeenCalledTimes(1);
    const callArgs = retrieveFn.mock.calls[0][0];
    expect(callArgs.type_filter).toEqual(['incident', 'lesson']);
    expect(callArgs.limit).toBe(20);
    expect(callArgs.query).toBe('Deploy to production');
  });

  it('passes project_id through to retrieval', async () => {
    const retrieveFn = vi.fn(async () => ({
      memories: [] as ScoredMemory[],
      conflicts: [],
      total_candidates: 0,
      retrieval_time_ms: 1,
    }));

    await checkAction({
      request: {
        action_description: 'Delete user data',
        project_id: 'proj-secure',
      },
      retrieve: retrieveFn,
    });

    const callArgs = retrieveFn.mock.calls[0][0];
    expect(callArgs.project_id).toBe('proj-secure');
  });

  it('does not pass project_id when not specified', async () => {
    const retrieveFn = vi.fn(async () => ({
      memories: [] as ScoredMemory[],
      conflicts: [],
      total_candidates: 0,
      retrieval_time_ms: 1,
    }));

    await checkAction({
      request: { action_description: 'test' },
      retrieve: retrieveFn,
    });

    const callArgs = retrieveFn.mock.calls[0][0];
    expect(callArgs.project_id).toBeUndefined();
  });

  it('warning objects contain required fields', async () => {
    const memories = [
      createScoredMemory({
        id: 'inc-1',
        type: 'incident',
        title: 'Outage',
        content: 'Server went down',
        final_score: 0.9,
      }),
    ];

    const result = await checkAction({
      request: { action_description: 'restart server' },
      retrieve: createMockRetrieve(memories),
    });

    const warning = result.warnings[0];
    expect(warning).toHaveProperty('memory_id', 'inc-1');
    expect(warning).toHaveProperty('type', 'incident');
    expect(warning).toHaveProperty('title', 'Outage');
    expect(warning).toHaveProperty('relevance_score', 0.9);
    expect(warning).toHaveProperty('summary');
  });

  it('returns empty warnings for no relevant memories', async () => {
    const result = await checkAction({
      request: { action_description: 'something innocuous' },
      retrieve: createMockRetrieve([]),
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.warning_count).toBe(0);
  });

  it('truncates long content to summary with word-boundary ellipsis', async () => {
    // Create content that exceeds 400 chars
    const longContent = 'word '.repeat(100); // 500 chars

    const memories = [
      createScoredMemory({
        id: 'long-1',
        type: 'lesson',
        title: 'Long lesson',
        content: longContent,
        final_score: 0.5,
      }),
    ];

    const result = await checkAction({
      request: { action_description: 'test' },
      retrieve: createMockRetrieve(memories),
    });

    const summary = result.warnings[0].summary;
    expect(summary.length).toBeLessThanOrEqual(403); // 400 + "..."
    expect(summary).toMatch(/\.\.\.$/);
  });

  it('does not truncate content within the 400-char limit', async () => {
    const shortContent = 'Short and clear lesson learned.';

    const memories = [
      createScoredMemory({
        id: 'short-1',
        type: 'lesson',
        title: 'Short lesson',
        content: shortContent,
        final_score: 0.5,
      }),
    ];

    const result = await checkAction({
      request: { action_description: 'test' },
      retrieve: createMockRetrieve(memories),
    });

    expect(result.warnings[0].summary).toBe(shortContent);
  });

  it('warning_count equals the number of warnings', async () => {
    const memories = [
      createScoredMemory({ id: 'w1', type: 'incident' }),
      createScoredMemory({ id: 'w2', type: 'lesson' }),
      createScoredMemory({ id: 'w3', type: 'incident' }),
    ];

    const result = await checkAction({
      request: { action_description: 'test' },
      retrieve: createMockRetrieve(memories),
    });

    expect(result.warning_count).toBe(result.warnings.length);
    expect(result.warning_count).toBe(3);
  });

  it('uses memory final_score as relevance_score', async () => {
    const memories = [
      createScoredMemory({ id: 'scored', type: 'incident', final_score: 0.42 }),
    ];

    const result = await checkAction({
      request: { action_description: 'test' },
      retrieve: createMockRetrieve(memories),
    });

    expect(result.warnings[0].relevance_score).toBe(0.42);
  });

  it('preserves memory title in warning', async () => {
    const memories = [
      createScoredMemory({
        id: 'titled',
        type: 'lesson',
        title: 'Never force push to main',
      }),
    ];

    const result = await checkAction({
      request: { action_description: 'git push --force main' },
      retrieve: createMockRetrieve(memories),
    });

    expect(result.warnings[0].title).toBe('Never force push to main');
  });

  it('truncation avoids cutting mid-word when possible', async () => {
    // Create content where the 400th character is in the middle of a word
    const content = 'a '.repeat(199) + 'longwordthatcrossesboundary';
    // That's 398 chars of "a " + 27 chars = 425 chars total

    const memories = [
      createScoredMemory({
        id: 'midword',
        type: 'incident',
        content,
        final_score: 0.5,
      }),
    ];

    const result = await checkAction({
      request: { action_description: 'test' },
      retrieve: createMockRetrieve(memories),
    });

    const summary = result.warnings[0].summary;
    // Should end with "..." and break at a space, not mid-word
    expect(summary).toMatch(/\.\.\.$/);
    // The character before "..." should be a space or end of a word
    const beforeEllipsis = summary.slice(0, -3);
    expect(beforeEllipsis.endsWith(' ') || beforeEllipsis.match(/\w$/)).toBeTruthy();
  });
});
