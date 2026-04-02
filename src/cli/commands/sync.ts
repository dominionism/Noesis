/**
 * noesis sync — Bidirectional adapter sync
 *
 * Triggers synchronization between Noesis and external tool adapters.
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { createClient } from '../../daemon/client.js';

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Synchronize with external tool adapters')
    .option('--adapter <id>', 'Target adapter ID (e.g., claude-code, cursor)')
    .option('--project <id>', 'Project ID scope')
    .option('--dry-run', 'Preview sync without writing files or ingesting inbox entries')
    .action(async (options: { adapter?: string; project?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = {
          adapter_id: options.adapter ?? 'all',
          project_root: resolve(process.cwd()),
        };

        const projectId = options.project ?? globalOpts.project;
        if (projectId) {
          params.project_id = projectId;
        }
        if ((options as { dryRun?: boolean }).dryRun === true) {
          params.dry_run = true;
        }

        const result = await client.call<Record<string, unknown>>('noesis.sync', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.status === 'dry_run' ? 'Sync preview complete.' : 'Sync complete.');
          if (result.totalFilesWritten !== undefined) {
            console.log(`  Files written: ${result.totalFilesWritten}`);
          }
          if (result.totalTokensInjected !== undefined) {
            console.log(`  Tokens injected: ${result.totalTokensInjected}`);
          }
          if (result.writeback && typeof result.writeback === 'object') {
            const writeback = result.writeback as Record<string, unknown>;
            console.log(`  Inbox memories created: ${writeback.memoriesCreated ?? 0}`);
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
