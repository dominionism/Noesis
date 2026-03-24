/**
 * noesis sync — Bidirectional adapter sync
 *
 * Triggers synchronization between Noesis and external tool adapters.
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Synchronize with external tool adapters')
    .option('--adapter <id>', 'Target adapter ID (e.g., claude-code, cursor)')
    .option('--project <id>', 'Project ID scope')
    .action(async (options: { adapter?: string; project?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = {
          adapter_id: options.adapter ?? 'all',
        };

        const projectId = options.project ?? globalOpts.project;
        if (projectId) {
          params.project_id = projectId;
        }

        const result = await client.call<Record<string, unknown>>('noesis.sync', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.status === 'not_implemented') {
          console.log('Adapter sync is not yet fully implemented.');
          console.log('This will be available when the integration engine is complete.');
        } else {
          console.log('Sync complete.');
          if (result.tokens_injected !== undefined) {
            console.log(`  Tokens injected: ${result.tokens_injected}`);
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
