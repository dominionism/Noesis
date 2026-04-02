/**
 * noesis project — Project management
 *
 * Subcommands: list, add, remove
 * Operates on the durable Noesis config allowlist used for project-scoped
 * auto-injection and project-level defaults.
 */

import { Command } from 'commander';
import { resolve } from 'node:path';

import { loadConfig, saveConfig } from '../../config.js';
import type { Sensitivity } from '../../types.js';

interface RegisteredProjectRecord {
  id: string;
  name: string;
  path: string;
  sensitivity: Sensitivity;
  isolation_mode: boolean;
}

function listRegisteredProjects(): RegisteredProjectRecord[] {
  const config = loadConfig();

  return Object.entries(config.projects)
    .map(([id, project]) => ({
      id,
      name: id,
      path: project.path,
      sensitivity: project.sensitivity,
      isolation_mode: project.isolation_mode,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function registerProjectCommand(program: Command): void {
  const project = program
    .command('project')
    .description('Manage projects');

  project
    .command('list')
    .description('List all registered projects')
    .action(() => {
      const globalOpts = program.opts();

      try {
        const projects = listRegisteredProjects();

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

      try {
        const config = loadConfig();
        const projectPath = resolve(path);
        const project = {
          id: name,
          name,
          path: projectPath,
          sensitivity: (options.sensitivity as Sensitivity) ?? 'INTERNAL',
          isolation_mode: options.isolated ?? false,
        };

        config.projects[name] = {
          path: project.path,
          sensitivity: project.sensitivity,
          isolation_mode: project.isolation_mode,
        };
        saveConfig(config);

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
      }
    });

  project
    .command('remove <id>')
    .description('Remove a project by ID')
    .action((id: string) => {
      const globalOpts = program.opts();

      try {
        const config = loadConfig();
        delete config.projects[id];
        saveConfig(config);

        if (globalOpts.json) {
          console.log(JSON.stringify({ success: true, id }, null, 2));
        } else {
          console.log(`Project "${id}" removed.`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
