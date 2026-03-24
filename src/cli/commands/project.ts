/**
 * noesis project — Project management
 *
 * Subcommands: list, add, remove
 * Operates directly on the database.
 */

import { Command } from 'commander';
import { existsSync } from 'node:fs';

import { DB_PATH } from '../../constants.js';
import { DatabaseConnection } from '../../core/database.js';
import { createProject, listProjects } from '../../core/memory-crud.js';
import type { Sensitivity } from '../../types.js';

export function registerProjectCommand(program: Command): void {
  const project = program
    .command('project')
    .description('Manage projects');

  project
    .command('list')
    .description('List all registered projects')
    .action(() => {
      const globalOpts = program.opts();

      if (!existsSync(DB_PATH)) {
        console.log('Database not found. Run `noesis init` first.');
        return;
      }

      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.create();
        const projects = listProjects(db);

        if (globalOpts.json) {
          console.log(JSON.stringify(projects, null, 2));
        } else if (projects.length === 0) {
          console.log('No projects registered.');
        } else {
          console.log(`${projects.length} project(s):\n`);
          for (const p of projects) {
            console.log(`  ${p.name} (${p.id})`);
            console.log(`    Path:       ${p.path}`);
            console.log(`    Sensitivity: ${p.sensitivity}`);
            console.log(`    Isolated:    ${p.isolation_mode ? 'yes' : 'no'}`);
            console.log();
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        db?.close();
      }
    });

  project
    .command('add <name> <path>')
    .description('Register a new project')
    .option('--sensitivity <level>', 'Sensitivity level: PUBLIC, INTERNAL, RESTRICTED, CONFIDENTIAL')
    .option('--isolated', 'Enable project isolation mode')
    .action((name: string, path: string, options: {
      sensitivity?: string;
      isolated?: boolean;
    }) => {
      const globalOpts = program.opts();

      if (!existsSync(DB_PATH)) {
        console.log('Database not found. Run `noesis init` first.');
        return;
      }

      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.create();
        const project = createProject(db, {
          name,
          path,
          sensitivity: (options.sensitivity as Sensitivity) ?? 'INTERNAL',
          isolation_mode: options.isolated ?? false,
        });

        if (globalOpts.json) {
          console.log(JSON.stringify(project, null, 2));
        } else {
          console.log(`Project registered: ${project.id}`);
          console.log(`  Name: ${project.name}`);
          console.log(`  Path: ${project.path}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        db?.close();
      }
    });

  project
    .command('remove <id>')
    .description('Remove a project by ID')
    .action((id: string) => {
      const globalOpts = program.opts();

      if (!existsSync(DB_PATH)) {
        console.log('Database not found. Run `noesis init` first.');
        return;
      }

      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.create();
        db.prepare<[string]>('DELETE FROM projects WHERE id = ?').run(id);

        if (globalOpts.json) {
          console.log(JSON.stringify({ success: true, id }, null, 2));
        } else {
          console.log(`Project "${id}" removed.`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        db?.close();
      }
    });
}
