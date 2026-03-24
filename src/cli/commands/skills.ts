/**
 * noesis skills — List and manage skills
 *
 * Subcommands: list, promote, archive
 * Reads skill YAML files from the skills directory.
 */

import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

import { SKILLS_DIR } from '../../constants.js';
import type { SkillDefinition } from '../../types.js';

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description('List and manage synthesized skills');

  skills
    .command('list')
    .description('List all skills')
    .option('--status <status>', 'Filter by status: draft, active, archived')
    .action((options: { status?: string }) => {
      const globalOpts = program.opts();

      if (!existsSync(SKILLS_DIR)) {
        console.log('No skills directory found. Run `noesis init` first.');
        return;
      }

      const files = readdirSync(SKILLS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      if (files.length === 0) {
        console.log('No skills found. Run `noesis learn` to synthesize skills from memories.');
        return;
      }

      const skills: SkillDefinition[] = [];
      for (const file of files) {
        try {
          const content = readFileSync(join(SKILLS_DIR, file), 'utf-8');
          const parsed = parse(content) as SkillDefinition;
          if (parsed && parsed.name) {
            skills.push(parsed);
          }
        } catch {
          // Skip malformed files
        }
      }

      if (options.status) {
        const filtered = skills.filter(s => s.status === options.status);
        if (filtered.length === 0) {
          console.log(`No skills with status "${options.status}".`);
          return;
        }
        displaySkills(filtered, globalOpts.json === true);
      } else {
        displaySkills(skills, globalOpts.json === true);
      }
    });

  skills
    .command('promote <name>')
    .description('Promote a draft skill to active')
    .action((name: string) => {
      const globalOpts = program.opts();
      const filePath = findSkillFile(name);

      if (!filePath) {
        console.error(`Skill file not found for: "${name}"`);
        process.exit(1);
      }

      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parse(content) as SkillDefinition;

        if (parsed.status === 'active') {
          console.log(`Skill "${name}" is already active.`);
          return;
        }

        parsed.status = 'active';
        writeFileSync(filePath, stringify(parsed), 'utf-8');

        if (globalOpts.json) {
          console.log(JSON.stringify({ success: true, name, status: 'active', path: filePath }, null, 2));
        } else {
          console.log(`Skill "${name}" promoted to active.`);
          console.log(`  File: ${filePath}`);
        }
      } catch (err) {
        console.error(`Error promoting skill: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  skills
    .command('archive <name>')
    .description('Archive a skill')
    .action((name: string) => {
      const globalOpts = program.opts();
      const filePath = findSkillFile(name);

      if (!filePath) {
        console.error(`Skill file not found for: "${name}"`);
        process.exit(1);
      }

      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parse(content) as SkillDefinition;

        if (parsed.status === 'archived') {
          console.log(`Skill "${name}" is already archived.`);
          return;
        }

        parsed.status = 'archived';
        writeFileSync(filePath, stringify(parsed), 'utf-8');

        if (globalOpts.json) {
          console.log(JSON.stringify({ success: true, name, status: 'archived', path: filePath }, null, 2));
        } else {
          console.log(`Skill "${name}" archived.`);
          console.log(`  File: ${filePath}`);
        }
      } catch (err) {
        console.error(`Error archiving skill: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

function findSkillFile(name: string): string | null {
  if (!existsSync(SKILLS_DIR)) {
    return null;
  }

  const files = readdirSync(SKILLS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of files) {
    const filePath = join(SKILLS_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parse(content) as SkillDefinition;
      if (parsed && parsed.name === name) {
        return filePath;
      }
    } catch {
      // Skip malformed files
    }
  }

  return null;
}

function displaySkills(skills: SkillDefinition[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(skills, null, 2));
    return;
  }

  console.log(`Found ${skills.length} skill(s):\n`);

  for (const skill of skills) {
    console.log(`  ${skill.name}`);
    console.log(`    Status:     ${skill.status}`);
    console.log(`    Confidence: ${skill.confidence.toFixed(2)}`);
    console.log(`    Successes:  ${skill.successes}`);
    console.log(`    Failures:   ${skill.failures}`);
    console.log(`    ${skill.description}`);
    console.log();
  }
}
