/**
 * noesis optimize <prompt> — Prompt optimization
 *
 * Runs full cognitive orchestration on a prompt, assembling the
 * optimal context from rules, experts, capsules, memories, and skills.
 *
 * RPC call:
 *   noesis.orchestrate — full cognitive prompt orchestration
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerOptimizeCommand(program: Command): void {
  program
    .command('optimize <prompt>')
    .description('Optimize a prompt with memory-enriched context')
    .option('--project <id>', 'Project ID')
    .option('--max-tokens <n>', 'Maximum token budget', parseInt)
    .action(async (prompt: string, options: { project?: string; maxTokens?: number }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const projectId = options.project ?? globalOpts.project;
        const tokenBudget = options.maxTokens ?? 8000;

        const params: Record<string, unknown> = {
          request: prompt,
          token_budget: tokenBudget,
        };
        if (projectId) {
          params.project_id = projectId;
        }

        const result = await client.call<{
          reasoning_scaffold: string;
          rules: Array<{ id: string; name: string; category?: string }>;
          expert: { id: string; name: string; category: string } | null;
          capsule: { id: string; name?: string; goal?: string } | null;
          skills: Array<{ id: string; name: string; category?: string }>;
          memories: Array<{ id: string; type: string; title: string }>;
          contexts: Array<{ context_type: string }>;
          prompt_shape: {
            goal: string;
            context: string;
            constraints: string[];
            deliverable: string;
            validation: string[];
          };
          token_budget: number;
          priority_order: string[];
        }>('noesis.orchestrate', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Orchestration for: "${prompt.slice(0, 80)}"\n`);

          // Prompt shape
          console.log('--- Prompt Shape ---');
          console.log(`  Goal:        ${result.prompt_shape.goal.slice(0, 100)}`);
          if (result.prompt_shape.context) {
            console.log(`  Context:     ${result.prompt_shape.context.slice(0, 100)}`);
          }
          if (result.prompt_shape.constraints.length > 0) {
            console.log(`  Constraints: ${result.prompt_shape.constraints.join('; ')}`);
          }
          if (result.prompt_shape.deliverable) {
            console.log(`  Deliverable: ${result.prompt_shape.deliverable.slice(0, 100)}`);
          }
          if (result.prompt_shape.validation.length > 0) {
            console.log(`  Validation:  ${result.prompt_shape.validation.join('; ')}`);
          }

          // Matched rules
          console.log(`\n--- Matched Rules (${result.rules.length}) ---`);
          if (result.rules.length === 0) {
            console.log('  No rules matched.');
          } else {
            for (const rule of result.rules) {
              console.log(`  ${rule.name} (${rule.id})`);
            }
          }

          // Routed expert
          console.log('\n--- Routed Expert ---');
          if (result.expert) {
            console.log(`  ${result.expert.name} [${result.expert.category}] (${result.expert.id})`);
          } else {
            console.log('  No expert routed.');
          }

          // Matched capsule
          console.log('\n--- Matched Capsule ---');
          if (result.capsule) {
            const label = result.capsule.name ?? result.capsule.goal ?? result.capsule.id;
            console.log(`  ${label} (${result.capsule.id})`);
          } else {
            console.log('  No capsule matched.');
          }

          // Discovery level summary
          console.log(`\n--- Assembly ---`);
          console.log(`  Token budget:  ${result.token_budget}`);
          console.log(`  Skills:        ${result.skills.length}`);
          console.log(`  Memories:      ${result.memories.length}`);
          console.log(`  Contexts:      ${result.contexts.length}`);
          if (result.priority_order.length > 0) {
            console.log(`  Priority:      ${result.priority_order.join(' > ')}`);
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
