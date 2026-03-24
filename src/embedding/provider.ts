/**
 * Embedding Provider Re-export and Migration Support
 *
 * Provides a migration function that re-embeds all existing memories
 * when the embedding model changes.
 */

import type { EmbeddingProvider } from '../types.js';
import type { DatabaseConnection } from '../core/database.js';

export type { EmbeddingProvider };

const MIGRATION_BATCH_SIZE = 50;

export interface MigrationResult {
  migrated: number;
  errors: number;
}

export async function migrateEmbeddings(
  db: DatabaseConnection,
  newProvider: EmbeddingProvider,
): Promise<MigrationResult> {
  let migrated = 0;
  let errors = 0;

  const countStmt = db.prepare('SELECT COUNT(*) AS total FROM memories');
  const selectBatch = db.prepare(
    'SELECT id, title, content FROM memories ORDER BY rowid LIMIT ? OFFSET ?',
  );
  const updateMemory = db.prepare(
    'UPDATE memories SET embedding = ?, embedding_model = ?, updated_at = ? WHERE id = ?',
  );
  const deleteVec = db.prepare(
    'DELETE FROM memories_vec WHERE memory_id = ?',
  );
  const insertVec = db.prepare(
    'INSERT OR REPLACE INTO memories_vec (memory_id, embedding) VALUES (?, ?)',
  );

  const { total } = countStmt.get() as { total: number };
  if (total === 0) return { migrated: 0, errors: 0 };

  for (let offset = 0; offset < total; offset += MIGRATION_BATCH_SIZE) {
    const rows = selectBatch.all(MIGRATION_BATCH_SIZE, offset) as Array<{
      id: string;
      title: string;
      content: string;
    }>;

    if (rows.length === 0) break;

    const texts = rows.map((row) => `${row.title} ${row.content}`);

    let embeddings: Float32Array[];
    try {
      embeddings = await newProvider.embedBatch(texts);
    } catch {
      errors += rows.length;
      continue;
    }

    const runBatch = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];
          const embeddingBuffer = Buffer.from(embeddings[i].buffer);
          const now = new Date().toISOString();

          updateMemory.run(embeddingBuffer, newProvider.modelId, now, row.id);
          deleteVec.run(row.id);
          insertVec.run(row.id, embeddingBuffer);

          migrated++;
        } catch {
          errors++;
        }
      }
    });

    runBatch();
  }

  return { migrated, errors };
}
