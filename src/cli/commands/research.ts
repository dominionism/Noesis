/**
 * noesis research <query> — Research current state
 *
 * Combines memory retrieval, gap analysis, and context loading to
 * provide a comprehensive research view for a given query.
 *
 * RPC calls:
 *   1. noesis.recall       — retrieve relevant memories
 *   2. noesis.retrievalGap — identify knowledge gaps
 *   3. noesis.getContexts  — list loaded context types
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

const DEPTH_LIMITS: Record<string, number> = {
  shallow: 5,
  medium: 10,
  deep: 20,
};

export function registerResearchCommand(program: Command): void {
  program
    .command('research <query>')
    .description('Research current state using memory and context')
    .option('--project <id>', 'Project ID')
    .option('--depth <level>', 'Research depth: shallow, medium, deep', 'medium')
    .action(async (query: string, options: { project?: string; depth: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const projectId = options.project ?? globalOpts.project;
        const limit = DEPTH_LIMITS[options.depth] ?? DEPTH_LIMITS.medium;

        // 1. Recall relevant memories
        const recallParams: Record<string, unknown> = { query, limit };
        if (projectId) {
          recallParams.project_id = projectId;
        }
        const recallResult = await client.call<{
          memories: Array<{
            id: string;
            type: string;
            title: string;
            final_score: number;
            confidence: number;
          }>;
          total_candidates: number;
          retrieval_time_ms: number;
          conflicts: unknown[];
        }>('noesis.recall', recallParams);

        // 2. Retrieval gap analysis
        const gapParams: Record<string, unknown> = { query };
        if (projectId) {
          gapParams.project_id = projectId;
        }
        const gapResult = await client.call<{
          total_results: number;
          unresolved_conflicts: number;
          results_by_type: Record<string, number>;
          missing_types: string[];
          confidence_distribution: { high: number; medium: number; low: number };
          coverage_summary: string;
        }>('noesis.retrievalGap', gapParams);

        // 3. Loaded contexts
        const contextParams: Record<string, unknown> = {};
        if (projectId) {
          contextParams.project_id = projectId;
        }
        const contextResult = await client.call<{
          contexts: Array<{
            context_type: string;
            content: string;
          }>;
        }>('noesis.getContexts', contextParams);

        if (globalOpts.json) {
          console.log(JSON.stringify({
            query,
            depth: options.depth,
            project_id: projectId ?? null,
            recall: recallResult,
            gap_analysis: gapResult,
            contexts: contextResult,
          }, null, 2));
        } else {
          console.log(`Research: "${query}" (depth: ${options.depth})\n`);

          // Memories section
          console.log(`--- Memories (${recallResult.memories.length} of ${recallResult.total_candidates} candidates, ${recallResult.retrieval_time_ms}ms) ---`);
          if (recallResult.memories.length === 0) {
            console.log('  No relevant memories found.');
          } else {
            for (const mem of recallResult.memories) {
              console.log(`  [${mem.type}] ${mem.title.slice(0, 70)} (score: ${mem.final_score.toFixed(3)})`);
            }
          }

          // Gap analysis section
          console.log(`\n--- Gap Analysis ---`);
          console.log(`  Total results: ${gapResult.total_results}`);
          console.log(`  Unresolved conflicts: ${gapResult.unresolved_conflicts}`);
          if (gapResult.missing_types.length > 0) {
            console.log(`  Missing types: ${gapResult.missing_types.join(', ')}`);
          }
          console.log(`  Confidence: high=${gapResult.confidence_distribution.high} medium=${gapResult.confidence_distribution.medium} low=${gapResult.confidence_distribution.low}`);
          console.log(`  Coverage: ${gapResult.coverage_summary}`);

          // Contexts section
          const contexts = contextResult.contexts;
          console.log(`\n--- Loaded Contexts (${contexts.length}) ---`);
          if (contexts.length === 0) {
            console.log('  No contexts loaded.');
          } else {
            const types = contexts.map(c => c.context_type);
            console.log(`  Types: ${types.join(', ')}`);
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
