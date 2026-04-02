/**
 * noesis learn — Process a learning event through active learning
 *
 * Sends a structured learning event to the daemon's processLearning
 * RPC, which classifies the failure and writes back corrections to
 * rules, contexts, experts, capsules, and skills as appropriate.
 *
 * RPC call:
 *   noesis.processLearning — multi-target learning writeback
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerLearnCommand(program: Command): void {
  program
    .command('learn')
    .description('Process a learning event through active learning')
    .requiredOption('--description <text>', 'What went wrong')
    .requiredOption('--root-cause <text>', 'Why it went wrong')
    .requiredOption('--prevention <text>', 'How to prevent it')
    .requiredOption(
      '--failure-class <class>',
      'Failure class: context_assembly, planning, tool_use, verification, creative, api_contract',
    )
    .option(
      '--trigger <type>',
      'Trigger type: user_correction, eval_failure',
      'user_correction',
    )
    .option(
      '--phase <phase>',
      'Reasoning phase: recall, predict, understand, constrain, route, assess, plan, execute, verify, learn',
      'execute',
    )
    .option('--dry-run', 'Show what would be learned without persisting')
    .option('--project <id>', 'Project ID')
    .option('--expert-id <id>', 'Expert ID involved in the failure')
    .option('--capsule-id <id>', 'Capsule ID involved in the failure')
    .option('--skill-ids <ids>', 'Comma-separated skill IDs involved')
    .option('--rule-ids <ids>', 'Comma-separated rule IDs involved')
    .option('--memory-ids <ids>', 'Comma-separated memory IDs involved')
    .action(async (options: {
      description: string;
      rootCause: string;
      prevention: string;
      failureClass: string;
      trigger: string;
      phase: string;
      dryRun?: boolean;
      project?: string;
      expertId?: string;
      capsuleId?: string;
      skillIds?: string;
      ruleIds?: string;
      memoryIds?: string;
    }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const projectId = options.project ?? globalOpts.project;

        const params: Record<string, unknown> = {
          trigger: options.trigger,
          description: options.description,
          root_cause: options.rootCause,
          prevention_rule: options.prevention,
          failure_class: options.failureClass,
          phase: options.phase,
        };

        if (projectId) {
          params.project_id = projectId;
        }
        if (options.expertId) {
          params.expert_id = options.expertId;
        }
        if (options.capsuleId) {
          params.capsule_id = options.capsuleId;
        }
        if (options.skillIds) {
          params.skill_ids = options.skillIds.split(',').map((s: string) => s.trim());
        }
        if (options.ruleIds) {
          params.rule_ids = options.ruleIds.split(',').map((s: string) => s.trim());
        }
        if (options.memoryIds) {
          params.memory_ids = options.memoryIds.split(',').map((s: string) => s.trim());
        }
        if (options.dryRun === true) {
          params.dry_run = true;
        }

        console.log(options.dryRun === true ? 'Previewing learning event...' : 'Processing learning event...');

        const result = await client.call<{
          classified: string;
          classificationConfidence: number;
          ruleAction: string;
          contextsUpdated: string[];
          expertUpdated: boolean;
          capsuleUpdated: boolean;
          skillsUpdated: boolean;
        }>('noesis.processLearning', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(options.dryRun === true ? 'Learning event preview.\n' : 'Learning event processed.\n');

          console.log('--- Classification ---');
          console.log(`  Failure class: ${result.classified}`);
          console.log(`  Confidence:    ${(result.classificationConfidence * 100).toFixed(0)}%`);

          console.log('\n--- Writeback ---');
          console.log(`  Rule action:      ${result.ruleAction}`);
          if (result.contextsUpdated.length > 0) {
            console.log(`  Contexts updated: ${result.contextsUpdated.join(', ')}`);
          } else {
            console.log('  Contexts updated: none');
          }
          console.log(`  Expert updated:   ${result.expertUpdated ? 'yes' : 'no'}`);
          console.log(`  Capsule updated:  ${result.capsuleUpdated ? 'yes' : 'no'}`);
          console.log(`  Skills updated:   ${result.skillsUpdated ? 'yes' : 'no'}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
