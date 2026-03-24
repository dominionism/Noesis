/**
 * noesis export — Full backup to file
 *
 * Exports all memories, projects, and configuration to a JSON file.
 * Operates directly on the database.
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { DB_PATH, BACKUPS_DIR, FILE_PERMISSIONS } from '../../constants.js';
import { DatabaseConnection } from '../../core/database.js';
import { listMemories, listProjects } from '../../core/memory-crud.js';
import { loadConfig } from '../../config.js';

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export full backup to a JSON file')
    .option('--output <path>', 'Output file path')
    .action((options: { output?: string }) => {
      const globalOpts = program.opts();

      if (!existsSync(DB_PATH)) {
        console.log('Database not found. Run `noesis init` first.');
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = options.output ?? join(BACKUPS_DIR, `noesis-backup-${timestamp}.json`);

      // Ensure output directory exists
      const outDir = dirname(outputPath);
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true, mode: FILE_PERMISSIONS['DIR'] });
      }

      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.create();

        // Export all data
        const memories = listMemories(db, { limit: 100_000 });
        const projects = listProjects(db);
        const config = loadConfig();

        const backup = {
          version: '1.0.0',
          exported_at: new Date().toISOString(),
          memory_count: memories.length,
          project_count: projects.length,
          memories,
          projects,
          config,
        };

        writeFileSync(outputPath, JSON.stringify(backup, null, 2), {
          encoding: 'utf-8',
          mode: FILE_PERMISSIONS['CONFIG'],
        });

        if (globalOpts.json) {
          console.log(JSON.stringify({
            success: true,
            path: outputPath,
            memory_count: memories.length,
            project_count: projects.length,
          }, null, 2));
        } else {
          console.log(`Backup exported to: ${outputPath}`);
          console.log(`  Memories: ${memories.length}`);
          console.log(`  Projects: ${projects.length}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        db?.close();
      }
    });
}
