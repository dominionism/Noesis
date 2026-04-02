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

        const projectId = options.project ?? globalOpts.project;
        const result = await client.call<Record<string, unknown>>('noesis.createHandoff', {
          source_agent: options.source,
          target_agent: options.target,
          reason: options.reason,
          state_summary: options.summary,
          priority: options.priority,
          ...(projectId ? { project_id: projectId } : {}),
        });

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.id) {
          console.log(`Handoff created: ${result.id}`);
          console.log(`  From: ${options.source}`);
          console.log(`  To:   ${options.target}`);
          console.log(`  Reason: ${options.reason}`);
          console.log(`  Priority: ${options.priority}`);
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
    .option('--project <id>', 'Project ID')
    .action(async (options: { limit?: number }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const projectId = (options as { project?: string }).project ?? globalOpts.project;
        const result = await client.call<Record<string, unknown>>('noesis.listHandoffs', {
          limit: options.limit ?? 10,
          ...(projectId ? { project_id: projectId } : {}),
        });

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const handoffs = (result as Record<string, unknown>).handoffs as Array<Record<string, unknown>> | undefined;
          if (!handoffs || handoffs.length === 0) {
            console.log('No handoffs found.');
          } else {
            console.log(`${handoffs.length} handoff(s):\n`);
            for (const handoff of handoffs) {
              console.log(`  ${handoff.id}`);
              console.log(`    From: ${handoff.source_agent}`);
              console.log(`    To: ${handoff.target_agent}`);
              console.log(`    Reason: ${handoff.reason}`);
              console.log(`    Priority: ${handoff.priority ?? 'normal'}`);
              console.log(`    Created: ${handoff.created_at}`);
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
