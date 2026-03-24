/**
 * noesis recall <query> — Search memories
 *
 * Sends a noesis.recall RPC to the daemon and displays results
 * as a formatted table.
 *
 * If the daemon path fails, falls back to direct in-process retrieval
 * against the local Noesis store.
 */

import { Command } from 'commander';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '../../daemon/client.js';
import { DB_PATH } from '../../constants.js';
import { DatabaseConnection } from '../../core/database.js';
import { hybridRetrieve } from '../../retrieval/hybrid.js';
import { createArcticProvider } from '../../embedding/arctic.js';
import { scanForSecrets, redactSecrets } from '../../security/secret-scanner.js';
import * as hmac from '../../security/hmac.js';

import type { MemoryType, RecallParams, RecallResult, ScoredMemory } from '../../types.js';

function formatMemoryTable(memories: ScoredMemory[]): void {
  if (memories.length === 0) {
    console.log('No memories found.');
    return;
  }

  const header = [
    'ID'.padEnd(28),
    'Type'.padEnd(12),
    'Score'.padEnd(8),
    'Conf'.padEnd(6),
    'Title',
  ].join(' ');

  console.log(header);
  console.log('-'.repeat(header.length + 20));

  for (const mem of memories) {
    const row = [
      mem.id.padEnd(28),
      mem.type.padEnd(12),
      mem.final_score.toFixed(3).padEnd(8),
      mem.confidence.toFixed(2).padEnd(6),
      mem.title.slice(0, 60),
    ].join(' ');
    console.log(row);
  }
}

function createRecallSnapshot(): { dbPath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'noesis-recall-'));
  const snapshotDbPath = join(tempDir, 'noesis.db');

  for (const suffix of ['', '-wal', '-shm']) {
    const sourcePath = `${DB_PATH}${suffix}`;
    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, `${snapshotDbPath}${suffix}`);
    }
  }

  return {
    dbPath: snapshotDbPath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

async function recallLocally(recallParams: RecallParams): Promise<RecallResult> {
  const snapshot = createRecallSnapshot();
  const db = DatabaseConnection.createReadOnly(snapshot.dbPath);

  try {
    const embeddingProvider = await createArcticProvider();
    const secretScanner = (text: string) => {
      const matches = scanForSecrets(text);
      return matches.length === 0
        ? { clean: text, redacted: false, matches: [] }
        : { clean: redactSecrets(text, matches), redacted: true, matches };
    };

    return await hybridRetrieve({
      db,
      embeddingProvider,
      recallParams,
      updateAccessMetadata: false,
      verifySignature: (mem) => hmac.verifyMemory({
        id: mem.id,
        type: mem.type,
        title: mem.title,
        content: mem.content,
        project_id: mem.project_id,
        signature: mem.signature || '',
      }),
      scanSecrets: secretScanner,
    });
  } finally {
    db.close();
    snapshot.cleanup();
  }
}

function printResult(result: RecallResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    `Found ${result.memories.length} of ${result.total_candidates} candidates (${result.retrieval_time_ms}ms)\n`,
  );
  formatMemoryTable(result.memories);

  if (result.conflicts.length > 0) {
    console.log(`\nWarning: ${result.conflicts.length} unresolved conflict(s) detected.`);
  }
}

export function registerRecallCommand(program: Command): void {
  program
    .command('recall <query>')
    .description('Search memories by query')
    .option('--type <type>', 'Filter by memory type')
    .option('--tags <tags>', 'Comma-separated tag filter')
    .option('--limit <n>', 'Maximum results', parseInt)
    .option('--project <id>', 'Project ID scope')
    .action(async (query: string, options: {
      type?: string;
      tags?: string;
      limit?: number;
      project?: string;
    }) => {
      const globalOpts = program.opts();
      const client = createClient();

      const recallParams: RecallParams = { query };

      if (options.type) {
        recallParams.type_filter = [options.type as MemoryType];
      }

      if (options.tags) {
        recallParams.tag_filter = options.tags.split(',').map((t: string) => t.trim());
      }

      if (options.limit !== undefined) {
        recallParams.limit = options.limit;
      }

      const projectId = options.project ?? globalOpts.project;
      if (projectId) {
        recallParams.project_id = projectId;
      }

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = { query };
        if (recallParams.type_filter) params.type = recallParams.type_filter;
        if (recallParams.tag_filter) params.tags = recallParams.tag_filter;
        if (recallParams.limit !== undefined) params.limit = recallParams.limit;
        if (recallParams.project_id) params.project_id = recallParams.project_id;

        const result = await client.call<RecallResult>('noesis.recall', params);
        printResult(result, Boolean(globalOpts.json));
      } catch (err) {
        try {
          const result = await recallLocally(recallParams);
          printResult(result, Boolean(globalOpts.json));
        } catch (localErr) {
          const primaryError = err instanceof Error ? err.message : String(err);
          const fallbackError = localErr instanceof Error ? localErr.message : String(localErr);
          console.error(`Error: ${primaryError}`);
          console.error(`Local recall fallback failed: ${fallbackError}`);
          process.exit(1);
        }
      } finally {
        client.disconnect();
      }
    });
}
