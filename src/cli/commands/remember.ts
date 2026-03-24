/**
 * noesis remember <type> <title> — Store a memory
 *
 * Sends a noesis.remember RPC to the daemon, which runs the full
 * write pipeline (secret scanning, dangerous pattern check, signing).
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerRememberCommand(program: Command): void {
  program
    .command('remember <type> <title>')
    .description('Store a new memory')
    .option('--content <text>', 'Memory content')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--project <id>', 'Project ID')
    .option('--confidence <n>', 'Confidence score (0-1)', parseFloat)
    .option('--outcome <outcome>', 'Outcome: success, partial_success, failed_then_fixed, failed')
    .option('--force', 'Force storage even if a near-duplicate exists')
    .action(async (type: string, title: string, options: {
      content?: string;
      tags?: string;
      project?: string;
      confidence?: number;
      outcome?: string;
      force?: boolean;
    }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = {
          type,
          title,
          content: options.content ?? title,
        };

        // Only set confirmed when --force is used (bypasses dedup + dangerous patterns)
        if (options.force) {
          params.confirmed = true;
        }

        if (options.tags) {
          params.tags = options.tags.split(',').map((t: string) => t.trim());
        }

        const projectId = options.project ?? globalOpts.project;
        if (projectId) {
          params.project_id = projectId;
        }

        if (options.confidence !== undefined) {
          params.confidence = options.confidence;
        }

        if (options.outcome) {
          params.outcome = options.outcome;
        }

        let result = await client.call<Record<string, unknown>>('noesis.remember', params);

        // Handle dedup: warn the user but offer to re-store with confirmation
        if (result.confirmationRequired && result.duplicateOf) {
          const dup = result.duplicateOf as Record<string, unknown>;
          console.log(`Near-duplicate detected:`);
          console.log(`  Existing: ${dup.id} — "${dup.title}"`);
          console.log(`  Cosine:   ${(dup.cosineSimilarity as number).toFixed(3)}`);
          console.log(`  Jaccard:  ${(dup.jaccardSimilarity as number).toFixed(3)}`);
          console.log(`  Use --force to store anyway.`);

          if (globalOpts.json) {
            console.log(JSON.stringify(result, null, 2));
          }
          return;
        }

        // Handle dangerous patterns: retry with confirmed if user passed --force
        if (result.confirmationRequired && result.dangerousMatches) {
          if (options.force) {
            params.confirmed = true;
            result = await client.call<Record<string, unknown>>('noesis.remember', params);
          } else {
            console.log('Dangerous patterns detected. Pass --force to override.');
            if (result.dangerousMatches) {
              const matches = result.dangerousMatches as Array<Record<string, unknown>>;
              for (const match of matches) {
                console.log(`  - ${match.pattern}: "${match.matched}"`);
              }
            }
            return;
          }
        }

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success && result.memory) {
          const mem = result.memory as Record<string, unknown>;
          console.log(`Memory stored: ${mem.id}`);
          console.log(`  Type:       ${mem.type}`);
          console.log(`  Title:      ${mem.title}`);
          console.log(`  Confidence: ${mem.confidence}`);
        } else {
          console.log('Memory storage failed.');
          if (result.error) {
            console.log(`  Error: ${result.error}`);
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
