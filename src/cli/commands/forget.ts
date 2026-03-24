/**
 * noesis forget <id> — Delete a memory by ID
 *
 * Sends a noesis.forget RPC to the daemon after confirming with the user.
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';
import { createInterface } from 'node:readline';

async function confirmDeletion(id: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`Delete memory "${id}"? This cannot be undone. (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export function registerForgetCommand(program: Command): void {
  program
    .command('forget <id>')
    .description('Delete a memory by ID')
    .option('--force', 'Skip confirmation prompt')
    .action(async (id: string, options: { force?: boolean }) => {
      const globalOpts = program.opts();

      if (!options.force) {
        const confirmed = await confirmDeletion(id);
        if (!confirmed) {
          console.log('Deletion cancelled.');
          return;
        }
      }

      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const result = await client.call<{ success: boolean; id: string }>('noesis.forget', { id });

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Memory "${id}" deleted.`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
