/**
 * noesis import <file> — Restore from backup
 *
 * Imports memories and projects from a JSON backup file.
 * Operates directly on the database.
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';

import { DB_PATH } from '../../constants.js';
import { DatabaseConnection } from '../../core/database.js';
import { createMemory, createProject } from '../../core/memory-crud.js';
import { signMemory } from '../../security/hmac.js';
import type { Memory, MemoryInput, Project, ProjectInput } from '../../types.js';

export function registerImportCommand(program: Command): void {
  program
    .command('import <file>')
    .description('Restore memories and projects from a backup file')
    .option('--skip-existing', 'Skip memories/projects that already exist')
    .action((file: string, options: { skipExisting?: boolean }) => {
      const globalOpts = program.opts();

      if (!existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }

      if (!existsSync(DB_PATH)) {
        console.error('Database not found. Run `noesis init` first.');
        process.exit(1);
      }

      let db: DatabaseConnection | null = null;
      try {
        const raw = readFileSync(file, 'utf-8');
        const backup = JSON.parse(raw) as {
          version: string;
          memories: Memory[];
          projects: Project[];
        };

        db = DatabaseConnection.create();

        let memoriesImported = 0;
        let memoriesSkipped = 0;
        let projectsImported = 0;
        let projectsSkipped = 0;

        // Import projects first
        if (backup.projects) {
          for (const project of backup.projects) {
            try {
              const input: ProjectInput = {
                name: project.name,
                path: project.path,
                sensitivity: project.sensitivity,
                isolation_mode: project.isolation_mode,
              };
              createProject(db, input);
              projectsImported++;
            } catch {
              if (options.skipExisting) {
                projectsSkipped++;
              } else {
                throw new Error(`Failed to import project: ${project.name}`);
              }
            }
          }
        }

        // Import memories
        if (backup.memories) {
          for (const memory of backup.memories) {
            try {
              const tags = typeof memory.tags === 'string' ? JSON.parse(memory.tags) : memory.tags;

              const input: MemoryInput & { signature: string } = {
                type: memory.type,
                title: memory.title,
                content: memory.content,
                tags,
                project_id: memory.project_id,
                scope: memory.scope,
                sensitivity: memory.sensitivity,
                confidence: memory.confidence,
                outcome: memory.outcome,
                source: memory.source,
                expires_at: memory.expires_at,
                session_id: memory.session_id,
                signature: signMemory({
                  id: memory.id,
                  type: memory.type,
                  title: memory.title,
                  content: memory.content,
                  project_id: memory.project_id,
                }),
              };

              createMemory(db, input);
              memoriesImported++;
            } catch {
              if (options.skipExisting) {
                memoriesSkipped++;
              } else {
                throw new Error(`Failed to import memory: ${memory.title}`);
              }
            }
          }
        }

        if (globalOpts.json) {
          console.log(JSON.stringify({
            success: true,
            memories_imported: memoriesImported,
            memories_skipped: memoriesSkipped,
            projects_imported: projectsImported,
            projects_skipped: projectsSkipped,
          }, null, 2));
        } else {
          console.log('Import complete.');
          console.log(`  Memories imported: ${memoriesImported}`);
          if (memoriesSkipped > 0) console.log(`  Memories skipped:  ${memoriesSkipped}`);
          console.log(`  Projects imported: ${projectsImported}`);
          if (projectsSkipped > 0) console.log(`  Projects skipped:  ${projectsSkipped}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        db?.close();
      }
    });
}
