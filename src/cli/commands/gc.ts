/**
 * noesis gc — Garbage collection
 *
 * Removes archived/expired memories and compacts the database.
 * Operates directly on the database without going through the daemon.
 */

import { Command } from 'commander';
import { existsSync } from 'node:fs';

import { DB_PATH } from '../../constants.js';
import { DatabaseConnection } from '../../core/database.js';

export function registerGcCommand(program: Command): void {
  program
    .command('gc')
    .description('Run garbage collection on memories and database')
    .option('--dry-run', 'Show what would be removed without deleting')
    .option('--older-than <days>', 'Remove archived memories older than N days', parseInt)
    .action((options: { dryRun?: boolean; olderThan?: number }) => {
      const globalOpts = program.opts();
      const olderThanDays = options.olderThan ?? 180;

      if (!existsSync(DB_PATH)) {
        console.log('Database not found. Run `noesis init` first.');
        return;
      }

      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.create();

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        const cutoff = cutoffDate.toISOString();

        // Count candidates for GC
        const archivedCount = db.prepare<[string], { count: number }>(
          "SELECT COUNT(*) as count FROM memories WHERE status = 'archived' AND updated_at < ?",
        ).get(cutoff)?.count ?? 0;

        const expiredCount = db.prepare<[string], { count: number }>(
          'SELECT COUNT(*) as count FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?',
        ).get(new Date().toISOString())?.count ?? 0;

        const totalCandidates = archivedCount + expiredCount;

        if (options.dryRun) {
          console.log('Dry run - no changes made.\n');
          console.log(`  Archived memories older than ${olderThanDays} days: ${archivedCount}`);
          console.log(`  Expired memories: ${expiredCount}`);
          console.log(`  Total candidates for removal: ${totalCandidates}`);

          if (globalOpts.json) {
            console.log(JSON.stringify({
              dry_run: true,
              archived: archivedCount,
              expired: expiredCount,
              total: totalCandidates,
            }, null, 2));
          }
          return;
        }

        // Perform GC
        let removed = 0;

        if (archivedCount > 0) {
          const result = db.prepare<[string]>(
            "DELETE FROM memories WHERE status = 'archived' AND updated_at < ?",
          ).run(cutoff);
          removed += result.changes;
        }

        if (expiredCount > 0) {
          const result = db.prepare<[string]>(
            'DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?',
          ).run(new Date().toISOString());
          removed += result.changes;
        }

        // Vacuum to reclaim space
        db.exec('VACUUM;');

        if (globalOpts.json) {
          console.log(JSON.stringify({ removed, vacuumed: true }, null, 2));
        } else {
          console.log(`Garbage collection complete.`);
          console.log(`  Removed: ${removed} memories`);
          console.log(`  Database vacuumed.`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        db?.close();
      }
    });
}
