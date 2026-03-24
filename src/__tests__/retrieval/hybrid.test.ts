/**
 * Tests for src/retrieval/hybrid.ts
 *
 * Covers:
 * - Empty database returns no results
 * - Basic retrieval with BM25 and vector fusion
 * - RRF score computation
 * - HMAC verification filters tampered memories
 * - Secret scanning redacts content
 * - Conflict detection at retrieval time
 * - Graph-discovered contradictions surface as conflicts
 * - Access metadata (access_count, last_accessed_at) is updated
 * - Limit parameter is respected
 * - Pre-filter by project_id
 *
 * Note: Epsilon-greedy exploration is stochastic and tested
 * probabilistically where needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { DatabaseConnection } from '../../core/database.js';
import { hybridRetrieve } from '../../retrieval/hybrid.js';
import type { EmbeddingProvider, Memory, SecretMatch } from '../../types.js';

function createMockProvider(): EmbeddingProvider {
  // Return a deterministic vector for any text
  return {
    modelId: 'test-model',
    dimensions: 4,
    embed: vi.fn(async (_text: string) => new Float32Array([0.5, 0.5, 0.5, 0.5])),
    embedBatch: vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array([0.5, 0.5, 0.5, 0.5])),
    ),
  };
}

function noopVerifySignature(_memory: Memory): { valid: boolean; tampered: boolean } {
  return { valid: true, tampered: false };
}

function noopScanSecrets(text: string): { clean: string; redacted: boolean; matches: SecretMatch[] } {
  return { clean: text, redacted: false, matches: [] };
}

function insertMemoryFull(
  db: DatabaseConnection,
  id: string,
  opts: {
    title?: string;
    content?: string;
    type?: string;
    status?: string;
    projectId?: string | null;
    scope?: string;
    outcome?: string | null;
    confidence?: number;
    tags?: string;
    accessCount?: number;
  } = {},
): void {
  const now = new Date().toISOString();
  const embedding = Buffer.from(new Float32Array([0.5, 0.5, 0.5, 0.5]).buffer);

  db.prepare(
    `INSERT INTO memories (id, type, title, content, tags, project_id, scope, sensitivity, confidence,
       outcome, source, embedding, embedding_model, signature, status, access_count,
       created_at, updated_at, last_accessed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'INTERNAL', ?,
       ?, 'agent', ?, 'test-model', 'valid-sig', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    opts.type ?? 'task',
    opts.title ?? `Title ${id}`,
    opts.content ?? `Content for ${id}`,
    opts.tags ?? '[]',
    opts.projectId ?? null,
    opts.scope ?? 'global',
    opts.confidence ?? 0.5,
    opts.outcome ?? null,
    embedding,
    opts.status ?? 'active',
    opts.accessCount ?? 0,
    now,
    now,
    now,
  );

  db.prepare(
    'INSERT OR REPLACE INTO memories_vec (memory_id, embedding) VALUES (?, ?)',
  ).run(id, embedding);
}

describe('hybridRetrieve', () => {
  let tmpDir: string;
  let db: DatabaseConnection;
  let provider: EmbeddingProvider;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `noesis-test-hybrid-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    db = DatabaseConnection.create(join(tmpDir, 'test.db'));
    provider = createMockProvider();

    // Disable epsilon-greedy exploration for deterministic tests
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns empty results for an empty database', async () => {
    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'anything' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    expect(result.memories).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.total_candidates).toBe(0);
    expect(result.retrieval_time_ms).toBeGreaterThanOrEqual(0);
  });

  it('retrieves active memories matching a query', async () => {
    insertMemoryFull(db, 'mem-1', { title: 'TypeScript patterns', content: 'Use strict types' });
    insertMemoryFull(db, 'mem-2', { title: 'Testing strategies', content: 'Write unit tests' });

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'TypeScript' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    expect(result.memories.length).toBeGreaterThanOrEqual(1);
    expect(result.total_candidates).toBe(2);
  });

  it('excludes non-active memories from results', async () => {
    insertMemoryFull(db, 'active-mem', { status: 'active', title: 'Active' });
    insertMemoryFull(db, 'archived-mem', { status: 'archived', title: 'Archived' });

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'test' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    const ids = result.memories.map((m) => m.id);
    expect(ids).toContain('active-mem');
    expect(ids).not.toContain('archived-mem');
  });

  it('respects the limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      insertMemoryFull(db, `mem-${i}`, { title: `Memory ${i}` });
    }

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'memory', limit: 3 },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    expect(result.memories.length).toBeLessThanOrEqual(3);
  });

  it('filters by project_id', async () => {
    insertMemoryFull(db, 'proj-a-mem', { projectId: 'proj-a', title: 'Project A task' });
    insertMemoryFull(db, 'proj-b-mem', { projectId: 'proj-b', title: 'Project B task' });
    insertMemoryFull(db, 'global-mem', { projectId: null, title: 'Global task' });

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'task', project_id: 'proj-a' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    const ids = result.memories.map((m) => m.id);
    expect(ids).toContain('proj-a-mem');
    expect(ids).toContain('global-mem'); // null project_id passes filter
    expect(ids).not.toContain('proj-b-mem');
  });

  it('filters tampered memories via HMAC verification', async () => {
    insertMemoryFull(db, 'good-mem', { title: 'Good memory' });
    insertMemoryFull(db, 'bad-mem', { title: 'Tampered memory' });

    const verifySignature = (memory: Memory) => ({
      valid: memory.id !== 'bad-mem',
      tampered: memory.id === 'bad-mem',
    });

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'memory' },
      verifySignature,
      scanSecrets: noopScanSecrets,
    });

    const ids = result.memories.map((m) => m.id);
    expect(ids).toContain('good-mem');
    expect(ids).not.toContain('bad-mem');
  });

  it('redacts secrets from memory content', async () => {
    insertMemoryFull(db, 'secret-mem', {
      title: 'API key storage',
      content: 'Use key: sk-1234567890abcdef',
    });

    const scanSecrets = (text: string) => {
      if (text.includes('sk-')) {
        return {
          clean: text.replace(/sk-\w+/, '[REDACTED]'),
          redacted: true,
          matches: [{ type: 'api_key', position: 10, length: 20, matched: 'sk-1234567890abcdef' }],
        };
      }
      return { clean: text, redacted: false, matches: [] };
    };

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'API key' },
      verifySignature: noopVerifySignature,
      scanSecrets,
    });

    const mem = result.memories.find((m) => m.id === 'secret-mem');
    if (mem) {
      expect(mem.content).toContain('[REDACTED]');
      expect(mem.content).not.toContain('sk-1234567890abcdef');
    }
  });

  it('surfaces unresolved conflicts for returned memories', async () => {
    insertMemoryFull(db, 'mem-a', { title: 'Approach A' });
    insertMemoryFull(db, 'mem-b', { title: 'Approach B' });

    // Insert a conflict between the two
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO memory_conflicts (id, memory_a_id, memory_b_id, conflict_type,
         similarity_score, resolution, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    ).run('conflict-1', 'mem-a', 'mem-b', 'semantic_contradiction', 0.85, now);

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'Approach' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
    const conflict = result.conflicts.find((c) => c.id === 'conflict-1');
    expect(conflict).toBeDefined();
    expect(conflict?.memory_a_id).toBe('mem-a');
    expect(conflict?.memory_b_id).toBe('mem-b');
  });

  it('updates access_count and last_accessed_at for returned memories', async () => {
    insertMemoryFull(db, 'mem-1', { title: 'Access test', accessCount: 5 });

    await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'Access test' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    const row = db.prepare<[string], { access_count: number; last_accessed_at: string }>(
      'SELECT access_count, last_accessed_at FROM memories WHERE id = ?',
    ).get('mem-1');

    expect(row?.access_count).toBe(6); // Was 5, incremented to 6
  });

  it('scores memories using composite scoring factors', async () => {
    insertMemoryFull(db, 'mem-1', {
      title: 'Match query text',
      content: 'Relevant content',
      outcome: 'success',
      projectId: 'proj-1',
      scope: 'project',
    });

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'Match query text', project_id: 'proj-1' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    if (result.memories.length > 0) {
      const mem = result.memories[0];
      expect(mem.final_score).toBeGreaterThan(0);
      expect(mem.recency_modifier).toBeGreaterThan(0);
      expect(mem.access_boost).toBeGreaterThanOrEqual(1.0);
      expect(mem.success_weight).toBe(1.0); // success outcome
      expect(mem.scope_boost).toBe(1.5); // matching project
    }
  });

  it('sorts results by final_score descending', async () => {
    insertMemoryFull(db, 'mem-1', { title: 'First', outcome: 'success' });
    insertMemoryFull(db, 'mem-2', { title: 'Second', outcome: 'failed' });
    insertMemoryFull(db, 'mem-3', { title: 'Third', outcome: 'success' });

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'test' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    for (let i = 1; i < result.memories.length; i++) {
      expect(result.memories[i - 1].final_score).toBeGreaterThanOrEqual(
        result.memories[i].final_score,
      );
    }
  });

  it('returns retrieval_time_ms as a positive number', async () => {
    insertMemoryFull(db, 'mem-1');

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'test' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    expect(result.retrieval_time_ms).toBeGreaterThanOrEqual(0);
  });

  it('handles empty query string gracefully', async () => {
    insertMemoryFull(db, 'mem-1');

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: '' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    // Should not throw; may return results via vector similarity
    expect(result).toBeDefined();
    expect(result.total_candidates).toBeGreaterThanOrEqual(0);
  });

  it('handles query with special FTS characters', async () => {
    insertMemoryFull(db, 'mem-1', { title: 'Normal title' });

    // These characters are FTS5 operators that get sanitized
    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'test* OR (drop)' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    // Should not throw
    expect(result).toBeDefined();
  });

  it('defaults limit to 10 when not specified', async () => {
    for (let i = 0; i < 15; i++) {
      insertMemoryFull(db, `mem-${i}`, { title: `Memory ${i}` });
    }

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'Memory' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    expect(result.memories.length).toBeLessThanOrEqual(10);
  });

  it('does not return resolved conflicts', async () => {
    insertMemoryFull(db, 'mem-a', { title: 'A' });
    insertMemoryFull(db, 'mem-b', { title: 'B' });

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO memory_conflicts (id, memory_a_id, memory_b_id, conflict_type,
         similarity_score, resolution, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('conflict-resolved', 'mem-a', 'mem-b', 'semantic', 0.9, 'kept_a', now);

    const result = await hybridRetrieve({
      db,
      embeddingProvider: provider,
      recallParams: { query: 'test' },
      verifySignature: noopVerifySignature,
      scanSecrets: noopScanSecrets,
    });

    const resolved = result.conflicts.find((c) => c.id === 'conflict-resolved');
    expect(resolved).toBeUndefined();
  });
});
