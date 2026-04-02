/**
 * noesis plan -- Create, check status, and iterate plans
 *
 * Subcommands: create, status, iterate
 * Wired to: noesis.orchestrate, noesis.checkReadinessEvidence,
 *           noesis.remember, noesis.getMemory, noesis.createGsdProject,
 *           noesis.getGsdState, noesis.critiquePlan
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';
import type { Memory, WritePipelineResult } from '../../types.js';
import {
  buildPlanTitle,
  createStoredPlan,
  extractPlanText,
  isPlanMemory,
  parseStoredPlanContent,
} from './plan-memory.js';

function formatPlanSummary(memory: Memory): {
  storedPlan: ReturnType<typeof parseStoredPlanContent>;
  title: string;
} {
  return {
    storedPlan: parseStoredPlanContent(memory.content),
    title: memory.title,
  };
}

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

        const storedPlan = createStoredPlan(
          description,
          projectId ?? null,
          assembly,
          readiness,
        );

        const rememberResult = await client.call<WritePipelineResult>(
          'noesis.remember',
          {
            type: 'task',
            title: buildPlanTitle(description),
            content: JSON.stringify(storedPlan),
            tags: ['plan'],
            source: 'system',
            scope: projectId ? 'project' : 'global',
            ...(projectId ? { project_id: projectId } : {}),
          },
        );

        if (!rememberResult.success || !rememberResult.memory) {
          throw new Error(rememberResult.error ?? 'Plan persistence failed.');
        }

        const planMemory = rememberResult.memory;
        let execution: Record<string, unknown> | null = null;

        if (projectId) {
          execution = await client.call<Record<string, unknown>>(
            'noesis.createGsdProject',
            {
              project_id: projectId,
              description,
              plan_id: planMemory.id,
            },
          );
        }

        if (globalOpts.json) {
          console.log(JSON.stringify({
            plan: planMemory,
            stored_plan: storedPlan,
            execution,
            assembly,
            readiness,
          }, null, 2));
        } else {
          console.log(`Plan created: ${planMemory.id}`);
          console.log(`  Title: ${planMemory.title}`);
          if (projectId) {
            console.log(`  Project: ${projectId}`);
          }
          if (execution?.id) {
            console.log(`  Execution: ${execution.id}`);
          }
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
          console.log(storedPlan.summary);
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
          const planMemory = await client.getMemory(planId, {
            type: 'task',
            ...(projectId ? { project_id: projectId } : {}),
          });

          if (globalOpts.json) {
            if (!planMemory || !isPlanMemory(planMemory)) {
              console.log(JSON.stringify({ plan: null }, null, 2));
              return;
            }

            const executionResult = planMemory.project_id
              ? await client.call<Record<string, unknown>>(
                'noesis.getGsdState',
                { project_id: planMemory.project_id },
              )
              : null;

            console.log(JSON.stringify({
              plan: planMemory,
              stored_plan: parseStoredPlanContent(planMemory.content),
              execution: executionResult?.execution ?? null,
              progress: executionResult?.progress ?? null,
            }, null, 2));
          } else {
            if (!planMemory || !isPlanMemory(planMemory)) {
              console.log(`No plan found for: ${planId}`);
            } else {
              const { storedPlan } = formatPlanSummary(planMemory);
              const executionResult = planMemory.project_id
                ? await client.call<Record<string, unknown>>(
                  'noesis.getGsdState',
                  { project_id: planMemory.project_id },
                )
                : null;
              const execution = executionResult?.execution as Record<string, unknown> | null;

              console.log(`Plan: ${planMemory.id}`);
              console.log();
              console.log(`  Title:   ${planMemory.title}`);
              console.log(`  Type:    ${planMemory.type}`);
              console.log(`  Created: ${planMemory.created_at}`);
              if (planMemory.project_id) {
                console.log(`  Project: ${planMemory.project_id}`);
              }
              if (storedPlan) {
                const total = typeof storedPlan.readiness.total === 'number'
                  ? storedPlan.readiness.total
                  : 0;
                const passed = storedPlan.readiness.passed === true;
                console.log(`  Readiness: ${total}/100 ${passed ? '[PASS]' : '[FAIL]'}`);
              }
              if (execution?.plan_id === planMemory.id) {
                console.log(`  Execution: ${execution.id}`);
                console.log(`  Status:    ${execution.status}`);
              }
              console.log();
              if (storedPlan?.summary) {
                console.log(storedPlan.summary);
              } else if (planMemory.content) {
                console.log(planMemory.content);
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
              if (execution.plan_id) {
                console.log(`  Plan ID:  ${execution.plan_id}`);
              }
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

        const planMemory = await client.getMemory(planId, { type: 'task' });
        if (!planMemory || !isPlanMemory(planMemory)) {
          console.error(`No plan found for: ${planId}`);
          process.exit(1);
        }

        const planContent = extractPlanText(planMemory);

        // Step 2: Critique the plan content
        const critique = await client.call<Record<string, unknown>>(
          'noesis.critiquePlan',
          { work: planContent },
        );

        if (globalOpts.json) {
          console.log(JSON.stringify({
            plan: planMemory,
            critique,
          }, null, 2));
        } else {
          console.log(`Critique for plan: ${planMemory.id}`);
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
