/**
 * noesis verify -- Goal-backward verification
 *
 * Verifies readiness against a stated goal using evidence-backed scoring
 * across 5 dimensions, and retrieves relevant historical failures.
 *
 * Wired to: noesis.checkReadinessEvidence, noesis.recall, noesis.getMemory
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';
import type { Memory } from '../../types.js';
import { extractPlanText, isPlanMemory } from './plan-memory.js';

export function registerVerifyCommand(program: Command): void {
  program
    .command('verify <goal>')
    .description('Run goal-backward verification')
    .option('--project <id>', 'Project ID')
    .option('--plan <id>', 'Plan ID to verify against')
    .action(async (goal: string, options: { project?: string; plan?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const projectId = options.project ?? globalOpts.project;
        let referencedPlan: Memory | null = null;
        let effectiveGoal = goal;

        if (options.plan) {
          const planMemory = await client.getMemory(options.plan, {
            type: 'task',
            ...(projectId ? { project_id: projectId } : {}),
          });

          if (!planMemory || !isPlanMemory(planMemory)) {
            throw new Error(`Plan not found: ${options.plan}`);
          }

          referencedPlan = planMemory;
          const planContent = extractPlanText(planMemory);
          effectiveGoal = `${goal}\n\nPlan Context:\n${planContent}`;
        }

        // Step 1: Check readiness evidence against the goal
        const readinessParams: Record<string, unknown> = {
          task: effectiveGoal,
        };
        if (projectId) {
          readinessParams.project_id = projectId;
        }
        if (options.plan) {
          readinessParams.has_verification_plan = true;
        }

        // Step 2: Recall relevant past failures and lessons
        const recallParams: Record<string, unknown> = {
          query: effectiveGoal,
          type: ['lesson', 'incident'],
          limit: 10,
        };

        // Execute both calls
        const [readiness, recallResult] = await Promise.all([
          client.call<Record<string, unknown>>(
            'noesis.checkReadinessEvidence',
            readinessParams,
          ),
          client.call<Record<string, unknown>>(
            'noesis.recall',
            recallParams,
          ),
        ]);

        if (globalOpts.json) {
          console.log(JSON.stringify({ readiness, history: recallResult, plan: referencedPlan }, null, 2));
        } else {
          const total = readiness.total as number ?? 0;
          const passed = readiness.passed as boolean ?? false;

          console.log(`Verification for: ${goal}`);
          if (referencedPlan) {
            console.log(`Plan: ${referencedPlan.title ?? referencedPlan.id ?? options.plan}`);
          }
          console.log();

          // Readiness score with all 5 dimensions
          console.log(`Readiness: ${total}/100 ${passed ? '[PASS]' : '[FAIL]'}`);
          console.log();
          console.log('Dimensions:');
          console.log(`  Clarity:      ${readiness.clarity ?? 0}/20  ${(readiness.clarity as number ?? 0) >= 15 ? '[PASS]' : '[FAIL]'}`);
          console.log(`  Codebase:     ${readiness.codebase ?? 0}/20  ${(readiness.codebase as number ?? 0) >= 15 ? '[PASS]' : '[FAIL]'}`);
          console.log(`  Constraints:  ${readiness.constraints ?? 0}/20`);
          console.log(`  Risks:        ${readiness.risks ?? 0}/20`);
          console.log(`  Verification: ${readiness.verification ?? 0}/20`);

          // Display gaps
          const gaps = readiness.gaps as Array<Record<string, unknown>> | undefined;
          if (gaps && gaps.length > 0) {
            console.log();
            console.log('Gaps:');
            for (const gap of gaps) {
              console.log(`  [${gap.dimension}] ${gap.current}/${gap.required} -- ${gap.suggestion}`);
            }
          }

          // Display related historical failures
          const memories = (recallResult.memories ?? []) as Array<Record<string, unknown>>;
          if (memories.length > 0) {
            console.log();
            console.log(`Related historical failures/lessons (${memories.length}):`);
            console.log();
            for (const mem of memories) {
              console.log(`  ${mem.type}: ${mem.title}`);
              if (mem.content) {
                const content = String(mem.content);
                console.log(`    ${content.length > 150 ? content.slice(0, 150) + '...' : content}`);
              }
              console.log();
            }
          } else {
            console.log();
            console.log('No related historical failures found.');
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
