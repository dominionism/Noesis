/**
 * noesis status — System health dashboard
 *
 * Shows memory count, skill count, anti-pattern count, daemon state,
 * and database size. Operates directly on the database and filesystem.
 */

import { Command } from 'commander';
import { existsSync, readdirSync, statSync } from 'node:fs';

import {
  NOESIS_HOME,
  DB_PATH,
  SIGNING_KEY_PATH,
  CONFIG_PATH,
  DAEMON_SOCKET_PATH,
  SKILLS_DIR,
  ANTI_PATTERNS_DIR,
} from '../../constants.js';
import { DatabaseConnection } from '../../core/database.js';
import { countMemories } from '../../core/memory-crud.js';
import { createClient } from '../../daemon/client.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countYamlFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).length;
}

function isIpcPermissionDenied(error: unknown): boolean {
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!(current instanceof Error)) {
      continue;
    }

    const code = (current as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      return true;
    }

    if (
      /operation not permitted|permission denied|connect eperm|connect eacces|blocked for/i.test(
        current.message,
      )
    ) {
      return true;
    }

    const cause = (current as Error & { cause?: unknown }).cause;
    if (cause !== undefined) {
      queue.push(cause);
    }
  }

  return false;
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show system health dashboard')
    .action(async () => {
      const globalOpts = program.opts();

      const initialized = existsSync(NOESIS_HOME);
      const hasDb = existsSync(DB_PATH);
      const hasKey = existsSync(SIGNING_KEY_PATH);
      const hasConfig = existsSync(CONFIG_PATH);
      const daemonSocketPresent = existsSync(DAEMON_SOCKET_PATH);

      let memoryCount = 0;
      let dbSize = 0;

      if (hasDb) {
        let db: DatabaseConnection | null = null;
        try {
          db = DatabaseConnection.create();
          memoryCount = countMemories(db);
          dbSize = statSync(DB_PATH).size;
        } catch {
          // Database may be locked by daemon
        } finally {
          db?.close();
        }
      }

      let daemonRpcReachable = false;
      let daemonRpcStatus = daemonSocketPresent ? 'socket_present' : 'stopped';
      let daemonRpcError: string | null = null;

      if (daemonSocketPresent) {
        const client = createClient();
        try {
          await client.connect();
          await client.call<{ status: string }>('ping');
          daemonRpcReachable = true;
          daemonRpcStatus = 'reachable';
        } catch (err) {
          daemonRpcError = (err as Error).message;
          daemonRpcStatus = isIpcPermissionDenied(err)
            ? 'blocked_by_sandbox'
            : 'unreachable';
        } finally {
          client.disconnect();
        }
      }

      const skillCount = countYamlFiles(SKILLS_DIR);
      const antiPatternCount = countYamlFiles(ANTI_PATTERNS_DIR);

      const status: Record<string, unknown> = {
        initialized,
        noesis_home: NOESIS_HOME,
        database: hasDb,
        signing_key: hasKey,
        config: hasConfig,
        daemon_running: daemonRpcReachable,
        daemon_socket_present: daemonSocketPresent,
        daemon_rpc_reachable: daemonRpcReachable,
        daemon_rpc_status: daemonRpcStatus,
        daemon_rpc_error: daemonRpcError,
        memory_count: memoryCount,
        skill_count: skillCount,
        anti_pattern_count: antiPatternCount,
        db_size: dbSize,
      };

      if (globalOpts.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log('Noesis System Status\n');
        console.log(`  Initialized:    ${initialized ? 'yes' : 'no'}`);
        console.log(`  Home:           ${NOESIS_HOME}`);
        console.log(`  Database:       ${hasDb ? 'present' : 'missing'}`);
        console.log(`  Signing key:    ${hasKey ? 'present' : 'missing'}`);
        console.log(`  Config:         ${hasConfig ? 'present' : 'missing'}`);
        console.log(`  Daemon socket:  ${daemonSocketPresent ? 'present' : 'missing'}`);

        const daemonLabel = daemonRpcStatus === 'reachable'
          ? 'reachable'
          : daemonRpcStatus === 'blocked_by_sandbox'
            ? 'blocked by sandbox'
            : daemonRpcStatus === 'unreachable'
              ? 'unreachable'
              : 'stopped';

        console.log(`  Daemon RPC:     ${daemonLabel}`);
        if (daemonRpcError) {
          console.log(`  RPC error:      ${daemonRpcError}`);
        }

        console.log();
        console.log(`  Memories:       ${memoryCount}`);
        console.log(`  Skills:         ${skillCount}`);
        console.log(`  Anti-patterns:  ${antiPatternCount}`);
        console.log(`  DB size:        ${formatBytes(dbSize)}`);

        if (!initialized) {
          console.log('\nRun `noesis init` to set up.');
        }
      }
    });
}
