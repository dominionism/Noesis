/**
 * noesis session — Session management
 *
 * Subcommands: start, status, pause, resume
 * Calls through to the daemon's session RPC methods.
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerSessionCommand(program: Command): void {
  const session = program
    .command('session')
    .description('Manage agent sessions');

  session
    .command('start')
    .description('Start a new session')
    .option('--agent <name>', 'Agent name', 'cli')
    .option('--project <id>', 'Project ID')
    .action(async (options: { agent: string; project?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = {
          agent: options.agent,
        };

        const projectId = options.project ?? globalOpts.project;
        if (projectId) {
          params.project_id = projectId;
        }

        const result = await client.call<{ session_id: string; started_at: string }>(
          'noesis.sessionStart',
          params,
        );

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Session started: ${result.session_id}`);
          console.log(`  Agent:   ${options.agent}`);
          console.log(`  Started: ${result.started_at}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  session
    .command('status')
    .description('Show active sessions')
    .option('--project <id>', 'Filter by project')
    .option('--limit <n>', 'Maximum results', parseInt)
    .action(async (options: { project?: string; limit?: number }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = {};

        const projectId = options.project ?? globalOpts.project;
        if (projectId) {
          params.project_id = projectId;
        }

        if (options.limit !== undefined) {
          params.limit = options.limit;
        }

        const result = await client.call<{
          sessions: Array<Record<string, unknown>>;
          count: number;
        }>('noesis.sessionList', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.count === 0) {
          console.log('No sessions found.');
        } else {
          console.log(`${result.count} session(s):\n`);
          for (const s of result.sessions) {
            console.log(`  ${s.id}`);
            console.log(`    Title:   ${s.title}`);
            console.log(`    Created: ${s.created_at}`);
            console.log();
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  session
    .command('pause <session_id>')
    .description('Pause a session')
    .option('--summary <text>', 'Session summary')
    .action(async (sessionId: string, options: { summary?: string }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const params: Record<string, unknown> = {
          session_id: sessionId,
        };

        if (options.summary) {
          params.summary = options.summary;
        }

        const result = await client.call<Record<string, unknown>>('noesis.sessionEnd', params);

        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Session paused: ${sessionId}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  session
    .command('resume <session_id>')
    .description('Resume a paused session')
    .action(async (sessionId: string) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const sessionMemory = await client.getMemory(sessionId, { type: 'session' });
        if (!sessionMemory) {
          console.error(`No session memory found for: ${sessionId}`);
          process.exit(1);
        }

        // Parse session content to recover state
        let sessionContent: Record<string, unknown> = {};
        if (typeof sessionMemory.content === 'string') {
          try {
            sessionContent = JSON.parse(sessionMemory.content) as Record<string, unknown>;
          } catch {
            sessionContent = { raw: sessionMemory.content };
          }
        }

        const agent = (sessionContent.agent as string) ?? 'cli';
        const projectId =
          (sessionMemory.project_id as string) ??
          (sessionContent.project_id as string) ??
          program.opts().project;

        // Start a new session with the same project/agent
        const startParams: Record<string, unknown> = { agent };
        if (projectId) {
          startParams.project_id = projectId;
        }

        const newSession = await client.call<{ session_id: string; started_at: string }>(
          'noesis.sessionStart',
          startParams,
        );

        if (globalOpts.json) {
          console.log(JSON.stringify({
            previous_session: sessionId,
            recovered_context: sessionContent,
            new_session: newSession,
          }, null, 2));
        } else {
          console.log(`Session resumed from: ${sessionId}`);
          console.log(`  New session: ${newSession.session_id}`);
          console.log(`  Agent:       ${agent}`);
          console.log(`  Started:     ${newSession.started_at}`);

          console.log('\nRecovered context:');
          if (sessionContent.summary) {
            console.log(`  Summary: ${sessionContent.summary}`);
          }
          if (sessionContent.status) {
            console.log(`  Previous status: ${sessionContent.status}`);
          }
          if (projectId) {
            console.log(`  Project: ${projectId}`);
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
