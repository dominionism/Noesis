/**
 * noesis correct <title> — Store a correction/lesson
 *
 * Creates a lesson-type memory with structured correction data.
 * This is a convenience wrapper around noesis.remember that
 * structures the content as a LessonMemory JSON object.
 */

import { Command } from 'commander';
import { createClient } from '../../daemon/client.js';

export function registerCorrectCommand(program: Command): void {
  program
    .command('correct <title>')
    .description('Store a correction or lesson learned')
    .option('--trigger <text>', 'What triggered the correction')
    .option('--original <text>', 'Original (incorrect) approach')
    .option('--corrected <text>', 'Corrected approach')
    .option('--root-cause <text>', 'Root cause of the error')
    .option('--project <id>', 'Project ID')
    .action(async (title: string, options: {
      trigger?: string;
      original?: string;
      corrected?: string;
      rootCause?: string;
      project?: string;
    }) => {
      const globalOpts = program.opts();
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        const lessonContent = JSON.stringify({
          trigger: options.trigger ?? '',
          original_approach: options.original ?? '',
          corrected_approach: options.corrected ?? '',
          root_cause: options.rootCause ?? '',
          applicable_when: '',
        });

        const params: Record<string, unknown> = {
          type: 'lesson',
          title,
          content: lessonContent,
          tags: ['lesson', 'correction'],
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
          console.log(`Lesson stored: ${mem.id}`);
          console.log(`  Title: ${title}`);
          if (options.trigger) console.log(`  Trigger: ${options.trigger}`);
          if (options.rootCause) console.log(`  Root cause: ${options.rootCause}`);
        } else {
          console.log('Failed to store lesson.');
          if (result.error) {
            console.log(`  Error: ${result.error}`);
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
