/**
 * Tests for Memory Conflict Detection (src/memory/conflict.ts)
 *
 * Covers:
 * - Conflict detection based on cosine similarity threshold
 * - Structural analysis: same type, overlapping tags, different outcome
 * - Auto-resolution via supersession keywords
 * - Auto-skip for different projects
 * - Event emission on conflict detection
 * - Edge cases: no embeddings, no conflicts, empty tags
 */

import { describe, it, expect, vi } from 'vitest';

import { detectConflicts } from '../../memory/conflict.js';
import type { Memory, MemoryConflict, ConflictInput, KnowledgeEdgeInput } from '../../types.js';

function makeEmbedding(values: number[]): Float32Array {
  return new Float32Array(values);
}

function makeMemory(overrides?: Partial<Memory>): Memory {
  return {
    id: 'new-001',
    type: 'task',
    title: 'Test Task',
    content: 'Some content',
    tags: '["test", "dev"]',
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence: 0.8,
    outcome: 'success',
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
    ...overrides,
  };
}

function bufferFromFloat32(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

function makeConflict(input: ConflictInput): MemoryConflict {
  return {
    id: 'conflict-001',
    memory_a_id: input.memory_a_id,
    memory_b_id: input.memory_b_id,
    conflict_type: input.conflict_type,
    similarity_score: input.similarity_score,
    resolution: null,
    resolution_notes: null,
    created_at: new Date().toISOString(),
  };
}

describe('detectConflicts', () => {
  function makeDefaultParams(overrides?: Record<string, any>) {
    const newMemory = makeMemory();
    // A unit vector for the new memory
    const embedding = makeEmbedding([1, 0, 0]);

    return {
      db: {},
      newMemory,
      embedding,
      getAllEmbeddings: vi.fn(() => []),
      createConflict: vi.fn((db: any, input: ConflictInput) => makeConflict(input)),
      createEdge: vi.fn(),
      updateMemoryStatus: vi.fn(),
      emitEvent: vi.fn(),
      generateId: vi.fn(() => 'gen-001'),
      ...overrides,
    };
  }

  it('returns empty arrays when no existing embeddings exist', async () => {
    const params = makeDefaultParams();
    const result = await detectConflicts(params);

    expect(result.conflicts).toEqual([]);
    expect(result.autoResolved).toEqual([]);
  });

  it('does not flag conflict when similarity is below threshold', async () => {
    // The threshold is 0.70. Two orthogonal vectors have similarity 0.
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["test"]',
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([0, 1, 0])), // orthogonal
    };

    const params = makeDefaultParams({
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.conflicts).toEqual([]);
  });

  it('does not flag conflict when types differ even with high similarity', async () => {
    const existing = {
      id: 'old-001',
      type: 'lesson', // different from 'task'
      tags: '["test"]',
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])), // identical direction
    };

    const params = makeDefaultParams({
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.conflicts).toEqual([]);
  });

  it('does not flag conflict when outcomes are the same', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["test"]',
      outcome: 'success', // same outcome as new memory
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const params = makeDefaultParams({
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.conflicts).toEqual([]);
  });

  it('does not flag conflict when tags do not overlap', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["production"]', // no overlap with ["test", "dev"]
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const params = makeDefaultParams({
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.conflicts).toEqual([]);
  });

  it('creates unresolved conflict when all structural conditions met', async () => {
    const existing = {
      id: 'old-001',
      type: 'task', // same type
      tags: '["test"]', // overlapping tag
      outcome: 'failed', // different outcome from 'success'
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])), // identical
    };

    const params = makeDefaultParams({
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].memory_a_id).toBe('old-001');
    expect(result.conflicts[0].memory_b_id).toBe('new-001');
    expect(result.conflicts[0].conflict_type).toBe('structural');
  });

  it('emits conflict event when unresolved conflict created', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["test"]',
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const emitEvent = vi.fn();
    const params = makeDefaultParams({
      getAllEmbeddings: vi.fn(() => [existing]),
      emitEvent,
    });

    await detectConflicts(params);
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'memory_conflict_detected',
        payload: expect.objectContaining({
          memory_a_id: 'old-001',
          memory_b_id: 'new-001',
        }),
      }),
    );
  });

  it('auto-resolves via supersession keyword in content', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["test"]',
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const newMemory = makeMemory({
      content: 'This supersedes the old approach',
    });

    const params = makeDefaultParams({
      newMemory,
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.conflicts).toEqual([]);
    expect(result.autoResolved).toContain('old-001');

    // Should create a 'supersedes' edge
    expect(params.createEdge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source_id: newMemory.id,
        target_id: 'old-001',
        relation: 'supersedes',
      }),
    );

    // Should update old memory status to superseded
    expect(params.updateMemoryStatus).toHaveBeenCalledWith(
      expect.anything(),
      'old-001',
      'superseded',
    );
  });

  it('auto-resolves via "replaces" keyword', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["test"]',
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const newMemory = makeMemory({ content: 'This replaces the previous version' });
    const params = makeDefaultParams({
      newMemory,
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.autoResolved).toContain('old-001');
  });

  it('auto-resolves via "overrides" keyword', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["test"]',
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const newMemory = makeMemory({ content: 'This overrides previous behavior' });
    const params = makeDefaultParams({
      newMemory,
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.autoResolved).toContain('old-001');
  });

  it('skips conflict when memories belong to different projects', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["test"]',
      outcome: 'failed',
      project_id: 'project-A',
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const newMemory = makeMemory({ project_id: 'project-B' });
    const params = makeDefaultParams({
      newMemory,
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.conflicts).toEqual([]);
  });

  it('handles empty tags gracefully', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '[]',
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const newMemory = makeMemory({ tags: '[]' });
    const params = makeDefaultParams({
      newMemory,
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    // No overlap with empty tags, so no conflict
    expect(result.conflicts).toEqual([]);
  });

  it('handles malformed tags JSON gracefully', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: 'not-json',
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const params = makeDefaultParams({
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    // Malformed tags parse to [], no overlap
    expect(result.conflicts).toEqual([]);
  });

  it('does not throw when emitEvent fails', async () => {
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["test"]',
      outcome: 'failed',
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const params = makeDefaultParams({
      getAllEmbeddings: vi.fn(() => [existing]),
      emitEvent: vi.fn(() => { throw new Error('emit failure'); }),
    });

    const result = await detectConflicts(params);
    // Should still produce the conflict despite emit failure
    expect(result.conflicts).toHaveLength(1);
  });

  it('detects conflict when either outcome is null', async () => {
    // The code checks: existing.outcome !== null && newMemory.outcome !== null
    // So if either is null, no differentOutcome, meaning no conflict
    const existing = {
      id: 'old-001',
      type: 'task',
      tags: '["test"]',
      outcome: null,
      project_id: null,
      embedding: bufferFromFloat32(makeEmbedding([1, 0, 0])),
    };

    const params = makeDefaultParams({
      getAllEmbeddings: vi.fn(() => [existing]),
    });

    const result = await detectConflicts(params);
    expect(result.conflicts).toEqual([]);
  });
});
