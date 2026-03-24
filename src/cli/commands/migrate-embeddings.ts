/**
 * noesis migrate-embeddings — Re-embed all memories with the current model
 *
 * Regenerates embedding vectors for all memories using the configured
 * embedding model. This is a direct-database maintenance operation
 * (does not require the daemon to be running).
 *
 * Steps:
 *   1. Open a direct database connection
 *   2. List all memories that have embeddings
 *   3. In configurable batches, re-embed each memory's title+content
 *   4. Update the memory's embedding vector in the database
 *   5. Report progress (N of M completed)
 *
 * Security:
 * - A01: CLI-only maintenance tool; no remote access surface.
 * - A03: All DB access via parameterized queries in underlying modules.
 * - A05: No debug output; only progress reporting to stderr.
 * - A09: No sensitive data logged; only counts and IDs.
 */

import { Command } from 'commander';
import { DatabaseConnection } from '../../core/database.js';
import { createArcticProvider } from '../../embedding/arctic.js';

export function registerMigrateEmbeddingsCommand(program: Command): void {
  program
    .command('migrate-embeddings')
    .description('Re-embed all memories with the current or specified model')
    .option('--batch-size <n>', 'Batch size for processing', '50')
    .option('--dry-run', 'Show what would be migrated without processing')
    .action(async (options: {
      batchSize?: string;
      dryRun?: boolean;
    }) => {
      const globalOpts = program.opts();
      const batchSize = parseInt(options.batchSize ?? '50', 10) || 50;
      const dryRun = options.dryRun ?? false;

      let db: DatabaseConnection | null = null;

      try {
        // Step 1: Open direct database connection
        db = DatabaseConnection.create();

        // Step 2: Count memories with embeddings
        const countStmt = db.prepare<[], { total: number }>(
          'SELECT COUNT(*) AS total FROM memories WHERE embedding IS NOT NULL',
        );
        const { total } = countStmt.get()!;

        if (total === 0) {
          const msg = 'No memories with embeddings found. Nothing to migrate.';
          if (globalOpts.json) {
            console.log(JSON.stringify({
              status: 'no_data',
              message: msg,
              total: 0,
              migrated: 0,
              errors: 0,
            }, null, 2));
          } else {
            console.log(msg);
          }
          return;
        }

        if (dryRun) {
          const msg = `Dry run: ${total} memories would be re-embedded in batches of ${batchSize}.`;
          if (globalOpts.json) {
            console.log(JSON.stringify({
              status: 'dry_run',
              total,
              batch_size: batchSize,
              estimated_batches: Math.ceil(total / batchSize),
            }, null, 2));
          } else {
            console.log(msg);
          }
          return;
        }

        // Step 3: Initialize embedding provider
        const provider = await createArcticProvider();

        // Prepare statements
        const selectBatch = db.prepare<[number, number], { id: string; title: string; content: string }>(
          'SELECT id, title, content FROM memories WHERE embedding IS NOT NULL ORDER BY rowid LIMIT ? OFFSET ?',
        );
        const updateStmt = db.prepare<[Buffer, string, string, string]>(
          'UPDATE memories SET embedding = ?, embedding_model = ?, updated_at = ? WHERE id = ?',
        );
        const deleteVec = db.prepare<[string]>(
          'DELETE FROM memories_vec WHERE memory_id = ?',
        );
        const insertVec = db.prepare<[string, Buffer]>(
          'INSERT OR REPLACE INTO memories_vec (memory_id, embedding) VALUES (?, ?)',
        );

        let migrated = 0;
        let errors = 0;

        // Step 4: Process in batches
        for (let offset = 0; offset < total; offset += batchSize) {
          const rows = selectBatch.all(batchSize, offset);

          if (rows.length === 0) break;

          const texts = rows.map((row) => `${row.title} ${row.content}`);

          let embeddings: Float32Array[];
          try {
            embeddings = await provider.embedBatch(texts);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            process.stderr.write(
              `[migrate-embeddings] Batch at offset ${offset} failed: ${msg}\n`,
            );
            errors += rows.length;
            continue;
          }

          // Update each memory in a transaction for atomicity
          const runBatch = db.transaction(() => {
            for (let i = 0; i < rows.length; i++) {
              try {
                const row = rows[i];
                const embeddingBuffer = Buffer.from(embeddings[i].buffer);
                const now = new Date().toISOString();

                updateStmt.run(embeddingBuffer, provider.modelId, now, row.id);
                deleteVec.run(row.id);
                insertVec.run(row.id, embeddingBuffer);

                migrated++;
              } catch {
                errors++;
              }
            }
          });

          runBatch();

          // Step 5: Report progress
          const completed = Math.min(offset + rows.length, total);
          if (!globalOpts.json) {
            process.stderr.write(
              `[migrate-embeddings] Progress: ${completed} of ${total} processed (${migrated} migrated, ${errors} errors)\n`,
            );
          }
        }

        // Final report
        if (globalOpts.json) {
          console.log(JSON.stringify({
            status: 'completed',
            total,
            migrated,
            errors,
            batch_size: batchSize,
            model: provider.modelId,
          }, null, 2));
        } else {
          console.log(
            `Migration complete: ${migrated} of ${total} memories re-embedded (${errors} errors). Model: ${provider.modelId}`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (globalOpts.json) {
          console.log(JSON.stringify({
            status: 'error',
            message: msg,
          }, null, 2));
        } else {
          console.error(`Error: ${msg}`);
        }
        process.exitCode = 1;
      } finally {
        if (db) {
          db.close();
        }
      }
    });
}
