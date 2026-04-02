/**
 * noesis skills — List and manage runtime executable skills.
 *
 * Subcommands: list, promote, archive
 * Uses the SQLite-backed executable_skills store that the cognitive runtime
 * actually executes against.
 */

import { Command } from 'commander';
import { existsSync } from 'node:fs';

import { DB_PATH } from '../../constants.js';
import { DatabaseConnection } from '../../core/database.js';
import { getSkillByName, listSkills, updateSkill } from '../../cognitive/skills/skill-store.js';
import { signContent } from '../../security/hmac.js';
import type { ExecutableSkill } from '../../cognitive/types.js';

type SkillStatusFilter = 'active' | 'archived' | 'enabled' | 'disabled' | 'draft';

interface SkillStatusResolution {
  enabled?: boolean;
  supported: boolean;
  statusLabel?: string;
}

export function resolveSkillStatusFilter(status?: string): SkillStatusResolution {
  if (!status) {
    return { supported: true };
  }

  const normalized = status.toLowerCase() as SkillStatusFilter;

  switch (normalized) {
    case 'active':
    case 'enabled':
      return { enabled: true, supported: true, statusLabel: 'active' };
    case 'archived':
    case 'disabled':
      return { enabled: false, supported: true, statusLabel: 'archived' };
    case 'draft':
      return { supported: false };
    default:
      return { supported: false };
  }
}

export function loadRuntimeSkills(
  db: DatabaseConnection,
  status?: string,
): ExecutableSkill[] {
  const filter = resolveSkillStatusFilter(status);

  if (!filter.supported) {
    return [];
  }

  return listSkills(db, filter.enabled === undefined ? undefined : { enabled: filter.enabled });
}

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description('List and manage runtime executable skills');

  skills
    .command('list')
    .description('List runtime skills from the executable skill store')
    .option('--status <status>', 'Filter by status: active, archived, enabled, disabled')
    .action((options: { status?: string }) => {
      const globalOpts = program.opts();
      const filter = resolveSkillStatusFilter(options.status);

      if (!existsSync(DB_PATH)) {
        console.log('No Noesis database found. Run `noesis init` first.');
        return;
      }

      if (!filter.supported) {
        const message = options.status?.toLowerCase() === 'draft'
          ? 'Runtime skills do not track a draft state. Use active/archived.'
          : `Unsupported runtime skill status: "${options.status}". Use active/archived.`;
        console.log(message);
        return;
      }

      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.createReadOnly();
        const runtimeSkills = loadRuntimeSkills(db, options.status);

        if (runtimeSkills.length === 0) {
          if (options.status) {
            console.log(`No runtime skills with status "${filter.statusLabel ?? options.status}".`);
          } else {
            console.log('No runtime skills found.');
          }
          return;
        }

        displaySkills(runtimeSkills, globalOpts.json === true);
      } catch (err) {
        console.error(`Error reading runtime skills: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        db?.close();
      }
    });

  skills
    .command('promote <name>')
    .description('Activate a runtime skill')
    .action((name: string) => {
      const globalOpts = program.opts();

      if (!existsSync(DB_PATH)) {
        console.error('No Noesis database found. Run `noesis init` first.');
        process.exit(1);
      }

      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.create();
        const skill = getSkillByName(db, name);

        if (!skill) {
          console.error(`Runtime skill not found: "${name}"`);
          process.exit(1);
        }

        if (skill.enabled) {
          console.log(`Skill "${name}" is already active.`);
          return;
        }

        updateSkill(db, skill.id, { enabled: true }, signContent);

        if (globalOpts.json) {
          console.log(JSON.stringify({ success: true, name, status: 'active', id: skill.id }, null, 2));
        } else {
          console.log(`Skill "${name}" promoted to active.`);
        }
      } catch (err) {
        console.error(`Error promoting skill: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        db?.close();
      }
    });

  skills
    .command('archive <name>')
    .description('Archive a runtime skill')
    .action((name: string) => {
      const globalOpts = program.opts();

      if (!existsSync(DB_PATH)) {
        console.error('No Noesis database found. Run `noesis init` first.');
        process.exit(1);
      }

      let db: DatabaseConnection | null = null;
      try {
        db = DatabaseConnection.create();
        const skill = getSkillByName(db, name);

        if (!skill) {
          console.error(`Runtime skill not found: "${name}"`);
          process.exit(1);
        }

        if (!skill.enabled) {
          console.log(`Skill "${name}" is already archived.`);
          return;
        }

        updateSkill(db, skill.id, { enabled: false }, signContent);

        if (globalOpts.json) {
          console.log(JSON.stringify({ success: true, name, status: 'archived', id: skill.id }, null, 2));
        } else {
          console.log(`Skill "${name}" archived.`);
        }
      } catch (err) {
        console.error(`Error archiving skill: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        db?.close();
      }
    });
}

function displaySkills(skills: ExecutableSkill[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(skills, null, 2));
    return;
  }

  console.log(`Found ${skills.length} runtime skill(s):\n`);

  for (const skill of skills) {
    console.log(`  ${skill.name}`);
    console.log(`    Status:      ${skill.enabled ? 'active' : 'archived'}`);
    console.log(`    Category:    ${skill.category}`);
    console.log(`    Version:     ${skill.version}`);
    console.log(`    Invocations: ${skill.invocation_count}`);
    console.log(`    Success:     ${(skill.success_rate * 100).toFixed(1)}%`);
    console.log(`    ${skill.description}`);
    console.log();
  }
}
