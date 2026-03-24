/**
 * noesis handoff — Cross-agent handoff management
 *
 * Subcommands: create, list, acknowledge
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerHandoffCommand(program: Command): void {
  const handoff = program
    .command('handoff')
    .description('Manage cross-agent handoffs');

  handoff
    .command('create')
    .description('Create a new handoff')
    .requiredOption('--source <agent>', 'Source agent name')
    .requiredOption('--target <agent>', 'Target agent name')
    .requiredOption('--summary <text>', 'State summary for the handoff')
    .option('--reason <reason>', 'Handoff reason: context_limit, session_end, tool_switch, explicit_transfer', 'session_end')
    .option('--priority <level>', 'Priority: immediate, normal', 'normal')
    .option('--project <id>', 'Project ID')
    .action(async (options: {
      source: string;
      target: string;
      summary: string;
      reason: string;
      priority: string;
      project?: string;
    }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        // Create a checkpoint memory with handoff metadata
        const checkpointContent = JSON.stringify({
          task_description: options.summary,
          completed_steps: [],
          remaining_steps: [],
          current_blockers: [],
          relevant_files: [],
          working_state: 'handoff',
          handoff_source: options.source,
          handoff_target: options.target,
        });

        const params: Record<string, unknown> = {
          type: 'checkpoint',
          title: `Handoff: ${options.source} -> ${options.target}`,
          content: checkpointContent,
          tags: ['handoff', options.source, options.target],
          confirmed: true,
        };

        const projectId = options.project ?? globalOpts.project;
        if (projectId) {
          params.project_id = projectId;
        }

        const result = await client.call<Record<string, unknown>>('noesis.remember', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success && result.memory) {
          const mem = result.memory as Record<string, unknown>;
          console.log(`Handoff created: ${mem.id}`);
          console.log(`  From: ${options.source}`);
          console.log(`  To:   ${options.target}`);
          console.log(`  Reason: ${options.reason}`);
        } else {
          console.log('Failed to create handoff.');
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  handoff
    .command('list')
    .description('List recent handoffs')
    .option('--limit <n>', 'Maximum results', parseInt)
    .action(async (options: { limit?: number }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const result = await client.call<Record<string, unknown>>('noesis.recall', {
          query: 'handoff',
          type: ['checkpoint'],
          tags: ['handoff'],
          limit: options.limit ?? 10,
        });

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const memories = (result as Record<string, unknown>).memories as Array<Record<string, unknown>> | undefined;
          if (!memories || memories.length === 0) {
            console.log('No handoffs found.');
          } else {
            console.log(`${memories.length} handoff(s):\n`);
            for (const mem of memories) {
              console.log(`  ${mem.id}`);
              console.log(`    Title: ${mem.title}`);
              console.log(`    Created: ${mem.created_at}`);
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

  handoff
    .command('acknowledge <id>')
    .description('Acknowledge a handoff')
    .action(async (id: string) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const result = await client.call<{
          handoff: Record<string, unknown>;
          memories: Array<Record<string, unknown>>;
          resumption: string;
        }>('noesis.resumeHandoff', { handoff_id: id });

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const h = result.handoff;
          console.log(`Handoff acknowledged: ${id}`);
          console.log(`  Source: ${h.source_agent ?? 'unknown'}`);
          console.log(`  Target: ${h.target_agent ?? 'unknown'}`);
          console.log(`  Reason: ${h.reason ?? 'unknown'}`);
          console.log(`  Priority: ${h.priority ?? 'normal'}`);
          console.log(`  Summary: ${h.state_summary ?? ''}`);
          console.log(`  Created: ${h.created_at ?? ''}`);

          if (result.memories.length > 0) {
            console.log(`\nAssociated memories (${result.memories.length}):`);
            for (const mem of result.memories) {
              console.log(`  - [${mem.type}] ${mem.title} (${mem.id})`);
            }
          }

          console.log('\nResumption context:');
          console.log(result.resumption);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
