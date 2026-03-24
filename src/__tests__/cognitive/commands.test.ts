import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';

// Command Store
import {
  insertCommand,
  getCommand,
  getCommandByName,
  updateCommand,
  deleteCommand,
  listCommands,
  countCommands,
} from '../../cognitive/commands/command-store.js';

// Command Registry
import {
  routeCommand,
  matchCommands,
  getCommandsByCategory,
  formatCommandHelp,
  formatCommandIndex,
} from '../../cognitive/commands/command-registry.js';

// Built-in Commands
import {
  seedBuiltInCommands,
  getBuiltInCommandNames,
  getBuiltInCommandCount,
  getBuiltInCommandsByCategory,
} from '../../cognitive/commands/built-in-commands.js';

import type { CommandDefinitionInput } from '../../cognitive/types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-commands-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Command System', () => {
  const cleanups: Array<{ db: DatabaseConnection; dir: string }> = [];

  afterEach(() => {
    for (const { db, dir } of cleanups) {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
    DatabaseConnection.resetInstance();
  });

  function setup() {
    const ctx = createTestDb();
    cleanups.push(ctx);
    return ctx;
  }

  const sampleCommand: CommandDefinitionInput = {
    name: 'test-cmd',
    description: 'A test command',
    category: 'utility',
    argument_hint: '<arg>',
    allowed_tools: ['read', 'write'],
    content: 'Execute test command with the given argument.',
  };

  // ==========================================================================
  // Command Store — CRUD
  // ==========================================================================

  describe('Command Store', () => {
    it('should insert a command', () => {
      const { db } = setup();
      const cmd = insertCommand(db, sampleCommand, sign);

      expect(cmd.id).toBeTruthy();
      expect(cmd.name).toBe('test-cmd');
      expect(cmd.category).toBe('utility');
      expect(cmd.enabled).toBe(true);
      expect(cmd.allowed_tools).toEqual(['read', 'write']);
    });

    it('should get command by ID', () => {
      const { db } = setup();
      const created = insertCommand(db, sampleCommand, sign);
      const retrieved = getCommand(db, created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('test-cmd');
    });

    it('should get command by name', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);

      const cmd = getCommandByName(db, 'test-cmd');
      expect(cmd).not.toBeNull();
      expect(cmd!.description).toBe('A test command');
    });

    it('should return null for nonexistent command', () => {
      const { db } = setup();
      expect(getCommand(db, 'nonexistent')).toBeNull();
      expect(getCommandByName(db, 'nonexistent')).toBeNull();
    });

    it('should update command', () => {
      const { db } = setup();
      const cmd = insertCommand(db, sampleCommand, sign);

      updateCommand(db, cmd.id, {
        description: 'Updated description',
        enabled: false,
      }, sign);

      const updated = getCommand(db, cmd.id)!;
      expect(updated.description).toBe('Updated description');
      expect(updated.enabled).toBe(false);
    });

    it('should delete command', () => {
      const { db } = setup();
      const cmd = insertCommand(db, sampleCommand, sign);
      deleteCommand(db, cmd.id);

      expect(getCommand(db, cmd.id)).toBeNull();
    });

    it('should list commands', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);
      insertCommand(db, { ...sampleCommand, name: 'test-cmd-2', category: 'workflow' }, sign);

      const all = listCommands(db);
      expect(all).toHaveLength(2);
    });

    it('should filter by category', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);
      insertCommand(db, { ...sampleCommand, name: 'workflow-cmd', category: 'workflow' }, sign);

      const utility = listCommands(db, { category: 'utility' });
      expect(utility).toHaveLength(1);
      expect(utility[0].category).toBe('utility');
    });

    it('should filter by enabled', () => {
      const { db } = setup();
      const cmd = insertCommand(db, sampleCommand, sign);
      insertCommand(db, { ...sampleCommand, name: 'test-cmd-2' }, sign);

      updateCommand(db, cmd.id, { enabled: false }, sign);

      const enabled = listCommands(db, { enabledOnly: true });
      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe('test-cmd-2');
    });

    it('should enforce unique name constraint', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);

      expect(() => insertCommand(db, sampleCommand, sign)).toThrow();
    });

    it('should count commands by category', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);
      insertCommand(db, { ...sampleCommand, name: 'wf-1', category: 'workflow' }, sign);
      insertCommand(db, { ...sampleCommand, name: 'wf-2', category: 'workflow' }, sign);

      const counts = countCommands(db);
      expect(counts.utility).toBe(1);
      expect(counts.workflow).toBe(2);
      expect(counts.gsd).toBe(0);
    });
  });

  // ==========================================================================
  // Command Registry
  // ==========================================================================

  describe('Command Registry', () => {
    it('should route exact command match', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);

      const route = routeCommand(db, '/test-cmd some args');
      expect(route).not.toBeNull();
      expect(route!.command.name).toBe('test-cmd');
      expect(route!.args).toBe('some args');
    });

    it('should route command without args', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);

      const route = routeCommand(db, '/test-cmd');
      expect(route).not.toBeNull();
      expect(route!.args).toBe('');
    });

    it('should return null for non-slash input', () => {
      const { db } = setup();
      expect(routeCommand(db, 'test-cmd')).toBeNull();
    });

    it('should return null for unknown command', () => {
      const { db } = setup();
      expect(routeCommand(db, '/unknown')).toBeNull();
    });

    it('should route prefix match when unique', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);

      const route = routeCommand(db, '/test-');
      expect(route).not.toBeNull();
      expect(route!.command.name).toBe('test-cmd');
    });

    it('should not route ambiguous prefix', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);
      insertCommand(db, { ...sampleCommand, name: 'test-other' }, sign);

      const route = routeCommand(db, '/test-');
      expect(route).toBeNull();
    });

    it('should match commands by keyword', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);
      insertCommand(db, {
        name: 'deploy',
        description: 'Deploy to production',
        category: 'workflow',
        content: 'Deploy the application to production environment.',
      }, sign);

      const matches = matchCommands(db, 'production deploy');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].command.name).toBe('deploy');
    });

    it('should return exact match with highest score', () => {
      const { db } = setup();
      insertCommand(db, sampleCommand, sign);

      const matches = matchCommands(db, 'test-cmd');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchType).toBe('exact');
      expect(matches[0].score).toBe(1.0);
    });

    it('should group commands by category', () => {
      const { db } = setup();
      seedBuiltInCommands(db, sign);

      const grouped = getCommandsByCategory(db);
      expect(grouped.workflow.length).toBeGreaterThan(0);
      expect(grouped.gsd.length).toBeGreaterThan(0);
      expect(grouped.memory.length).toBeGreaterThan(0);
    });

    it('should format command help', () => {
      const { db } = setup();
      const cmd = insertCommand(db, sampleCommand, sign);

      const help = formatCommandHelp(cmd);
      expect(help).toContain('/test-cmd');
      expect(help).toContain('A test command');
      expect(help).toContain('<arg>');
    });

    it('should format command index', () => {
      const { db } = setup();
      seedBuiltInCommands(db, sign);

      const index = formatCommandIndex(db);
      expect(index).toContain('Available Commands');
      expect(index).toContain('Workflow');
      expect(index).toContain('GSD');
    });
  });

  // ==========================================================================
  // Built-in Commands
  // ==========================================================================

  describe('Built-in Commands', () => {
    it('should have 51 built-in commands', () => {
      expect(getBuiltInCommandCount()).toBe(51);
    });

    it('should seed all built-in commands', () => {
      const { db } = setup();
      seedBuiltInCommands(db, sign);

      const all = listCommands(db);
      expect(all).toHaveLength(51);
    });

    it('should be idempotent on re-seed', () => {
      const { db } = setup();
      seedBuiltInCommands(db, sign);
      seedBuiltInCommands(db, sign);

      const all = listCommands(db);
      expect(all).toHaveLength(51);
    });

    it('should have commands in all 5 categories', () => {
      const { db } = setup();
      seedBuiltInCommands(db, sign);

      const counts = countCommands(db);
      expect(counts.workflow).toBeGreaterThan(0);
      expect(counts.gsd).toBeGreaterThan(0);
      expect(counts.memory).toBeGreaterThan(0);
      expect(counts.session).toBeGreaterThan(0);
      expect(counts.utility).toBeGreaterThan(0);
    });

    it('should have expected category distribution', () => {
      const byCategory = getBuiltInCommandsByCategory();
      expect(byCategory['workflow']?.length).toBe(10);
      expect(byCategory['gsd']?.length).toBe(20);
      expect(byCategory['memory']?.length).toBe(8);
      expect(byCategory['session']?.length).toBe(8);
      expect(byCategory['utility']?.length).toBe(5);
    });

    it('should include core commands', () => {
      const names = getBuiltInCommandNames();
      expect(names).toContain('plan');
      expect(names).toContain('execute');
      expect(names).toContain('verify');
      expect(names).toContain('new-project');
      expect(names).toContain('recall');
      expect(names).toContain('help');
    });

    it('should have unique names', () => {
      const names = getBuiltInCommandNames();
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });

    it('should have non-empty content for all commands', () => {
      const { db } = setup();
      seedBuiltInCommands(db, sign);

      const all = listCommands(db);
      for (const cmd of all) {
        expect(cmd.content.length).toBeGreaterThan(10);
      }
    });

    it('should route built-in commands correctly', () => {
      const { db } = setup();
      seedBuiltInCommands(db, sign);

      const route = routeCommand(db, '/plan Create auth module');
      expect(route).not.toBeNull();
      expect(route!.command.name).toBe('plan');
      expect(route!.args).toBe('Create auth module');
    });
  });
});
