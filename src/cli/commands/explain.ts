/**
 * noesis explain <memory_id> <query> — Retrieval scoring breakdown
 *
 * Shows the full scoring breakdown for how a specific memory was
 * (or would be) scored against a query.
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';
import type { ExplainResponse } from '../../types.js';

export function registerExplainCommand(program: Command): void {
  program
    .command('explain <memory_id> <query>')
    .description('Show full retrieval scoring breakdown for a memory against a query')
    .option('--project <id>', 'Project ID scope')
    .action(async (memoryId: string, query: string, options: { project?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = {
          memory_id: memoryId,
          query,
        };

        const projectId = options.project ?? globalOpts.project;
        if (projectId) {
          params.project_id = projectId;
        }

        const result = await client.call<ExplainResponse>('noesis.explain', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Explain: query="${query}"\n`);
          console.log(`Query embedding preview: ${result.query_embedding_preview}\n`);

          for (const entry of result.results) {
            console.log(`Memory: ${entry.memory_id}`);
            console.log(`  Title:          ${entry.title}`);
            console.log(`  Semantic:       ${entry.semantic_score.toFixed(4)}`);
            console.log(`  BM25 rank:      ${entry.bm25_rank}`);
            console.log(`  Vector rank:    ${entry.vector_rank}`);
            console.log(`  Recency mod:    ${entry.recency_modifier.toFixed(4)}`);
            console.log(`  Access boost:   ${entry.access_boost.toFixed(4)}`);
            console.log(`  Success weight: ${entry.success_weight.toFixed(4)}`);
            console.log(`  Scope boost:    ${entry.scope_boost.toFixed(4)}`);
            console.log(`  Final score:    ${entry.final_score.toFixed(4)}`);
            console.log(`  Included:       ${entry.included ? 'yes' : 'no'}`);
            if (entry.exclusion_reason) {
              console.log(`  Excluded:       ${entry.exclusion_reason}`);
            }
            console.log();
          }

          if (Object.keys(result.applied_filters).length > 0) {
            console.log('Applied filters:');
            for (const [key, value] of Object.entries(result.applied_filters)) {
              console.log(`  ${key}: ${JSON.stringify(value)}`);
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
