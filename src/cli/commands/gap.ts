/**
 * noesis gap <query> — Retrieval gap analysis
 *
 * Analyzes what memory types are present or missing for a given
 * query, helping identify knowledge gaps.
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';
import type { RetrievalGapResponse } from '../../types.js';

export function registerGapCommand(program: Command): void {
  program
    .command('gap <query>')
    .description('Analyze retrieval gaps for a query')
    .option('--project <id>', 'Project ID scope')
    .action(async (query: string, options: { project?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = { query };

        const projectId = options.project ?? globalOpts.project;
        if (projectId) {
          params.project_id = projectId;
        }

        const result = await client.call<RetrievalGapResponse>('noesis.retrievalGap', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Gap Analysis for: "${query}"\n`);
          console.log(`Total results: ${result.total_results}`);
          console.log(`Unresolved conflicts: ${result.unresolved_conflicts}\n`);

          console.log('Results by type:');
          for (const [type, count] of Object.entries(result.results_by_type)) {
            if (count > 0) {
              console.log(`  ${type}: ${count}`);
            }
          }

          if (result.missing_types.length > 0) {
            console.log(`\nMissing types: ${result.missing_types.join(', ')}`);
          }

          console.log('\nConfidence distribution:');
          console.log(`  High:   ${result.confidence_distribution.high}`);
          console.log(`  Medium: ${result.confidence_distribution.medium}`);
          console.log(`  Low:    ${result.confidence_distribution.low}`);

          console.log(`\nCoverage: ${result.coverage_summary}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
