/**
 * noesis route -- Expert agent routing
 *
 * Routes a task to the best expert agent based on trigger matching,
 * keyword analysis, and optional category preference.
 *
 * Wired to: noesis.routeExpertCognitive
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerRouteCommand(program: Command): void {
  program
    .command('route <task>')
    .description('Route a task to the best expert agent')
    .option('--project <id>', 'Project ID')
    .option('--prefer <category>', 'Preferred expert category')
    .action(async (task: string, options: { project?: string; prefer?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const result = await client.call<Record<string, unknown>>(
          'noesis.routeExpertCognitive',
          {
            task,
            keywords: [],
            prefer_category: options.prefer,
          },
        );

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const matches = (result.matches ?? []) as Array<Record<string, unknown>>;

          if (matches.length === 0) {
            console.log('No expert matches found for this task.');
          } else {
            console.log(`Expert routing for: ${task}`);
            console.log();

            // Display top 5 matches
            const top = matches.slice(0, 5);
            for (let i = 0; i < top.length; i++) {
              const match = top[i];
              const expert = match.expert as Record<string, unknown>;
              const score = match.score as number ?? 0;
              const triggers = (match.matched_triggers ?? []) as string[];

              console.log(`  ${i + 1}. ${expert.display_name ?? expert.name} (${expert.category})`);
              console.log(`     Score: ${(score * 100).toFixed(1)}%`);
              if (triggers.length > 0) {
                console.log(`     Matched: ${triggers.join(', ')}`);
              }
              console.log();
            }
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
