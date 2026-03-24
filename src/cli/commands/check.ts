/**
 * noesis check <action> — Action advisory check
 *
 * Checks a proposed action against stored anti-patterns and past
 * failures, returning warnings if relevant memories match.
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';
import type { CheckActionResponse } from '../../types.js';

export function registerCheckCommand(program: Command): void {
  program
    .command('check <action>')
    .description('Check an action against known anti-patterns and past failures')
    .option('--project <id>', 'Project ID scope')
    .action(async (action: string, options: { project?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = { action };

        const projectId = options.project ?? globalOpts.project;
        if (projectId) {
          params.project_id = projectId;
        }

        const result = await client.call<CheckActionResponse>('noesis.checkAction', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.warning_count === 0) {
          console.log('No warnings. Action appears safe based on stored memories.');
        } else {
          console.log(`${result.warning_count} warning(s) found:\n`);
          for (const warning of result.warnings) {
            console.log(`  [${warning.type}] ${warning.title}`);
            console.log(`    Relevance: ${warning.relevance_score.toFixed(3)}`);
            console.log(`    ${warning.summary}`);
            console.log(`    Memory: ${warning.memory_id}\n`);
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
