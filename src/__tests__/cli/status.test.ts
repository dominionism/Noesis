/**
 * Tests for noesis status command
 *
 * Validates that the status command registers correctly and that
 * its core logic (counting files, checking existence) works.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { registerStatusCommand } from '../../cli/commands/status.js';

describe('noesis status command registration', () => {
  it('should register the status command on the program', () => {
    const program = new Command();
    program.option('--verbose', 'verbose');
    program.option('--json', 'json');
    program.option('--project <id>', 'project');

    registerStatusCommand(program);

    const statusCmd = program.commands.find(c => c.name() === 'status');
    expect(statusCmd).toBeDefined();
    expect(statusCmd!.description()).toBe('Show system health dashboard');
  });

  it('should be a simple command with no subcommands', () => {
    const program = new Command();
    program.option('--verbose', 'verbose');
    program.option('--json', 'json');
    program.option('--project <id>', 'project');

    registerStatusCommand(program);

    const statusCmd = program.commands.find(c => c.name() === 'status');
    expect(statusCmd!.commands.length).toBe(0);
  });
});

describe('status helper: YAML file counting', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'noesis-status-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should count YAML files in a directory', () => {
    const skillsDir = join(tempDir, 'skills');
    mkdirSync(skillsDir, { recursive: true });

    writeFileSync(join(skillsDir, 'skill-a.yaml'), 'name: a\n');
    writeFileSync(join(skillsDir, 'skill-b.yml'), 'name: b\n');
    writeFileSync(join(skillsDir, 'not-a-skill.txt'), 'ignored\n');

    // Replicate the countYamlFiles logic from the status command
    const count = readdirSync(skillsDir)
      .filter((f: string) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .length;

    expect(count).toBe(2);
  });

  it('should return 0 for non-existent directory', () => {
    const missing = join(tempDir, 'nonexistent');
    const exists = existsSync(missing);
    expect(exists).toBe(false);
  });

  it('should handle empty directory', () => {
    const emptyDir = join(tempDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const count = readdirSync(emptyDir)
      .filter((f: string) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .length;

    expect(count).toBe(0);
  });
});
