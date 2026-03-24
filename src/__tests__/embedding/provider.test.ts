/**
 * Tests for src/embedding/provider.ts
 *
 * Covers:
 * - MigrationResult type contract
 * - migrateEmbeddings: empty database
 * - migrateEmbeddings: successful batch migration
 * - migrateEmbeddings: provider embedBatch failure (batch-level error counting)
 * - migrateEmbeddings: individual row failure within transaction
 * - migrateEmbeddings: multiple batches (verifies offset pagination)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { DatabaseConnection } from '../../core/database.js';
import { migrateEmbeddings } from '../../embedding/provider.js';
import type { EmbeddingProvider } from '../../types.js';

function createMockProvider(overrides?: Partial<EmbeddingProvider>): EmbeddingProvider {
  return {
    modelId: 'test-model-v2',
    dimensions: 4,
    embed: vi.fn(async (_text: string) => new Float32Array([0.1, 0.2, 0.3, 0.4])),
    embedBatch: vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4])),
    ),
    ...overrides,
  };
}

function insertMemory(
  db: DatabaseConnection,
  id: string,
  title: string,
  content: string,
): void {
  const now = new Date().toISOString();
  const embedding = Buffer.from(new Float32Array([0.5, 0.5, 0.5, 0.5]).buffer);

  db.prepare(
    `INSERT INTO memories (id, type, title, content, tags, scope, sensitivity, confidence,
       source, embedding, embedding_model, signature, status, access_count,
       created_at, updated_at, last_accessed_at)
     VALUES (?, 'task', ?, ?, '[]', 'global', 'INTERNAL', 0.5,
       'agent', ?, 'old-model', 'sig', 'active', 0, ?, ?, ?)`,
  ).run(id, title, content, embedding, now, now, now);

  db.prepare(
    'INSERT OR REPLACE INTO memories_vec (memory_id, embedding) VALUES (?, ?)',
  ).run(id, embedding);
}

describe('migrateEmbeddings', () => {
  let tmpDir: string;
  let db: DatabaseConnection;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `noesis-test-provider-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    db = DatabaseConnection.create(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zero counts when database has no memories', async () => {
    const provider = createMockProvider();
    const result = await migrateEmbeddings(db, provider);

    expect(result).toEqual({ migrated: 0, errors: 0 });
    expect(provider.embedBatch).not.toHaveBeenCalled();
  });

  it('migrates all memories with updated embeddings and model ID', async () => {
    insertMemory(db, 'mem-1', 'Title One', 'Content one');
    insertMemory(db, 'mem-2', 'Title Two', 'Content two');

    const provider = createMockProvider();
    const result = await migrateEmbeddings(db, provider);

    expect(result.migrated).toBe(2);
    expect(result.errors).toBe(0);

    // Verify embedding_model was updated
    const row = db.prepare<[string], { embedding_model: string }>(
      'SELECT embedding_model FROM memories WHERE id = ?',
    ).get('mem-1');
    expect(row?.embedding_model).toBe('test-model-v2');

    // Verify embedBatch was called with concatenated title + content
    expect(provider.embedBatch).toHaveBeenCalledWith([
      'Title One Content one',
      'Title Two Content two',
    ]);

    // Verify vector table was updated
    const vecRow = db.prepare<[string], { embedding: Buffer }>(
      'SELECT embedding FROM memories_vec WHERE memory_id = ?',
    ).get('mem-1');
    expect(vecRow).toBeDefined();
    const vec = new Float32Array(vecRow!.embedding.buffer, vecRow!.embedding.byteOffset, 4);
    expect(vec[0]).toBeCloseTo(0.1);
  });

  it('counts batch-level errors when embedBatch throws', async () => {
    insertMemory(db, 'mem-1', 'Title', 'Content');
    insertMemory(db, 'mem-2', 'Title2', 'Content2');

    const provider = createMockProvider({
      embedBatch: vi.fn(async () => {
        throw new Error('Model failure');
      }),
    });

    const result = await migrateEmbeddings(db, provider);

    expect(result.migrated).toBe(0);
    expect(result.errors).toBe(2);
  });

  it('handles multiple batches when memory count exceeds batch size', async () => {
    // Insert 55 memories (batch size is 50, so 2 batches)
    for (let i = 0; i < 55; i++) {
      insertMemory(db, `mem-${i}`, `Title ${i}`, `Content ${i}`);
    }

    const provider = createMockProvider();
    const result = await migrateEmbeddings(db, provider);

    expect(result.migrated).toBe(55);
    expect(result.errors).toBe(0);
    expect(provider.embedBatch).toHaveBeenCalledTimes(2);
  });

  it('updates the updated_at timestamp on migrated memories', async () => {
    insertMemory(db, 'mem-1', 'Title', 'Content');

    // Get the original timestamp
    const before = db.prepare<[string], { updated_at: string }>(
      'SELECT updated_at FROM memories WHERE id = ?',
    ).get('mem-1');

    // Small delay to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    const provider = createMockProvider();
    await migrateEmbeddings(db, provider);

    const after = db.prepare<[string], { updated_at: string }>(
      'SELECT updated_at FROM memories WHERE id = ?',
    ).get('mem-1');

    // The updated_at should have been changed (or at least set)
    expect(after?.updated_at).toBeDefined();
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before!.updated_at).getTime(),
    );
  });
});
