/**
 * noesis audit — Query the audit log
 *
 * Reads the append-only JSONL audit log directly from the filesystem.
 */

import { Command } from 'commander';
import { queryAuditLog } from '../../security/audit.js';
import type { AuditEventType } from '../../types.js';

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .description('Query the security audit log')
    .option('--type <type>', 'Filter by event type: MEMORY_WRITE, MEMORY_READ, CONFIG_WRITE, INTEGRITY_CHECK, SECURITY_EVENT')
    .option('--since <date>', 'Show entries after this ISO 8601 date')
    .option('--limit <n>', 'Maximum entries to display', parseInt)
    .action((options: {
      type?: string;
      since?: string;
      limit?: number;
    }) => {
      const globalOpts = program.opts();

      const entries = queryAuditLog({
        type: options.type as AuditEventType | undefined,
        last: options.since,
      });

      const limit = options.limit ?? 50;
      const displayed = entries.slice(-limit);

      if (globalOpts.json) {
        console.log(JSON.stringify(displayed, null, 2));
      } else {
        if (displayed.length === 0) {
          console.log('No audit log entries found.');
          return;
        }

        console.log(`Showing ${displayed.length} of ${entries.length} entries:\n`);

        for (const entry of displayed) {
          console.log(`  [${entry.timestamp}] ${entry.event_type}`);
          console.log(`    Source: ${entry.source}`);
          if (entry.memory_id) {
            console.log(`    Memory: ${entry.memory_id}`);
          }
          console.log(`    Hash: ${entry.content_hash.slice(0, 16)}...`);
          console.log();
        }
      }
    });
}
