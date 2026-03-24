/**
 * noesis plan -- Create, check status, and iterate plans
 *
 * Subcommands: create, status, iterate
 * Wired to: noesis.orchestrate, noesis.checkReadinessEvidence,
 *           noesis.recall, noesis.getGsdState, noesis.critiquePlan
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerPlanCommand(program: Command): void {
  const plan = program
    .command('plan')
    .description('Create and manage execution plans');

  // ---------------------------------------------------------------------------
  // plan create <description>
  // ---------------------------------------------------------------------------

  plan
    .command('create <description>')
    .description('Create a new plan with readiness scoring')
    .option('--project <id>', 'Project ID')
    .action(async (description: string, options: { project?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const projectId = options.project ?? globalOpts.project;

        // Step 1: Orchestrate the prompt assembly
        const orchestrateParams: Record<string, unknown> = {
          request: description,
          token_budget: 8000,
        };
        if (projectId) {
          orchestrateParams.project_id = projectId;
        }

        const assembly = await client.call<Record<string, unknown>>(
          'noesis.orchestrate',
          orchestrateParams,
        );

        // Step 2: Check readiness evidence
        const readinessParams: Record<string, unknown> = {
          task: description,
        };
        if (projectId) {
          readinessParams.project_id = projectId;
        }

        const readiness = await client.call<Record<string, unknown>>(
          'noesis.checkReadinessEvidence',
          readinessParams,
        );

        if (globalOpts.json) {
          console.log(JSON.stringify({ assembly, readiness }, null, 2));
        } else {
          // Display assembled prompt sections
          console.log('Plan created for: ' + description);
          console.log();

          if (assembly.priority_order && Array.isArray(assembly.priority_order)) {
            console.log('Prompt sections (priority order):');
            for (const section of assembly.priority_order as string[]) {
              console.log(`  - ${section}`);
            }
            console.log();
          }

          if (assembly.expert) {
            const expert = assembly.expert as Record<string, unknown>;
            console.log(`Expert: ${expert.display_name ?? expert.name}`);
          }

          if (assembly.rules && Array.isArray(assembly.rules)) {
            console.log(`Rules applied: ${(assembly.rules as unknown[]).length}`);
          }

          if (assembly.memories && Array.isArray(assembly.memories)) {
            console.log(`Relevant memories: ${(assembly.memories as unknown[]).length}`);
          }

          console.log();

          // Display readiness score
          const total = readiness.total as number ?? 0;
          const passed = readiness.passed as boolean ?? false;

          console.log(`Readiness: ${total}/100 ${passed ? '[PASS]' : '[FAIL]'}`);
          console.log(`  Clarity:      ${readiness.clarity ?? 0}/20`);
          console.log(`  Codebase:     ${readiness.codebase ?? 0}/20`);
          console.log(`  Constraints:  ${readiness.constraints ?? 0}/20`);
          console.log(`  Risks:        ${readiness.risks ?? 0}/20`);
          console.log(`  Verification: ${readiness.verification ?? 0}/20`);

          // Display gaps / rule violations
          const gaps = readiness.gaps as Array<Record<string, unknown>> | undefined;
          if (gaps && gaps.length > 0) {
            console.log();
            console.log('Gaps:');
            for (const gap of gaps) {
              console.log(`  [${gap.dimension}] ${gap.current}/${gap.required} -- ${gap.suggestion}`);
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

  // ---------------------------------------------------------------------------
  // plan status [plan_id]
  // ---------------------------------------------------------------------------

  plan
    .command('status [plan_id]')
    .description('Check plan status')
    .option('--project <id>', 'Project ID')
    .action(async (planId: string | undefined, options: { project?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const projectId = options.project ?? globalOpts.project;

        if (planId) {
          // Look up a specific plan by ID
          const result = await client.call<Record<string, unknown>>(
            'noesis.recall',
            { query: planId, type: ['task'] },
          );

          if (globalOpts.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            const memories = (result.memories ?? []) as Array<Record<string, unknown>>;
            if (memories.length === 0) {
              console.log(`No plan found for: ${planId}`);
            } else {
              console.log(`Plan: ${planId}`);
              console.log();
              for (const mem of memories) {
                console.log(`  ID:      ${mem.id}`);
                console.log(`  Title:   ${mem.title}`);
                console.log(`  Type:    ${mem.type}`);
                console.log(`  Created: ${mem.created_at}`);
                if (mem.content) {
                  const content = String(mem.content);
                  console.log(`  Content: ${content.length > 200 ? content.slice(0, 200) + '...' : content}`);
                }
                console.log();
              }
            }
          }
        } else {
          // Get overall GSD state for the project
          if (!projectId) {
            console.error('Error: --project is required when no plan_id is given.');
            process.exit(1);
          }

          const result = await client.call<Record<string, unknown>>(
            'noesis.getGsdState',
            { project_id: projectId },
          );

          if (globalOpts.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            const execution = result.execution as Record<string, unknown> | null;
            const progress = result.progress as Record<string, unknown> | null;

            if (!execution) {
              console.log(`No active execution for project: ${projectId}`);
            } else {
              console.log(`Project: ${projectId}`);
              console.log(`  Status:  ${execution.status}`);
              console.log(`  ID:      ${execution.id}`);
              if (execution.created_at) {
                console.log(`  Started: ${execution.created_at}`);
              }
            }

            if (progress) {
              console.log();
              console.log('Progress:');
              for (const [key, value] of Object.entries(progress)) {
                console.log(`  ${key}: ${value}`);
              }
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

  // ---------------------------------------------------------------------------
  // plan iterate <plan_id>
  // ---------------------------------------------------------------------------

  plan
    .command('iterate <plan_id>')
    .description('Run critique iteration on a plan')
    .action(async (planId: string) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        // Step 1: Recall the plan content
        const recallResult = await client.call<Record<string, unknown>>(
          'noesis.recall',
          { query: planId, type: ['task'] },
        );

        const memories = (recallResult.memories ?? []) as Array<Record<string, unknown>>;
        if (memories.length === 0) {
          console.error(`No plan found for: ${planId}`);
          process.exit(1);
        }

        // Use the first matching memory's content
        const planContent = String(memories[0].content ?? memories[0].title ?? planId);

        // Step 2: Critique the plan content
        const critique = await client.call<Record<string, unknown>>(
          'noesis.critiquePlan',
          { work: planContent },
        );

        if (globalOpts.json) {
          console.log(JSON.stringify(critique, null, 2));
        } else {
          console.log(`Critique for plan: ${planId}`);
          console.log();

          if (critique.overallAssessment) {
            console.log(`Assessment: ${critique.overallAssessment}`);
          }

          console.log(`Severity: ${critique.severity ?? 'unknown'}`);
          console.log(`Revision needed: ${critique.revisionNeeded ? 'yes' : 'no'}`);
          if (critique.iterationCount !== undefined) {
            console.log(`Iteration: ${critique.iterationCount}`);
          }
          if (critique.humanJudgmentRequired) {
            console.log('** Human judgment required **');
          }

          const findings = (critique.findings ?? []) as Array<Record<string, unknown>>;
          if (findings.length > 0) {
            console.log();
            console.log('Findings:');
            for (const f of findings) {
              const severity = String(f.severity ?? '').toUpperCase();
              console.log(`  [${severity}] (${f.dimension}) ${f.finding}`);
              if (f.evidence) {
                console.log(`    Evidence: ${f.evidence}`);
              }
              if (f.suggestion) {
                console.log(`    Suggestion: ${f.suggestion}`);
              }
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
