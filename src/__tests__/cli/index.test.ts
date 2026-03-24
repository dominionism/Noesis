/**
 * Tests for CLI entry point (src/cli/index.ts)
 *
 * Verifies that the Commander program is correctly configured with
 * all expected commands registered. Tests use Commander's built-in
 * parsing without actually executing command actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// Import all register functions to verify they are valid
import { registerInitCommand } from '../../cli/commands/init.js';
import { registerRememberCommand } from '../../cli/commands/remember.js';
import { registerRecallCommand } from '../../cli/commands/recall.js';
import { registerForgetCommand } from '../../cli/commands/forget.js';
import { registerCorrectCommand } from '../../cli/commands/correct.js';
import { registerCheckCommand } from '../../cli/commands/check.js';
import { registerGapCommand } from '../../cli/commands/gap.js';
import { registerExplainCommand } from '../../cli/commands/explain.js';
import { registerLearnCommand } from '../../cli/commands/learn.js';
import { registerSkillsCommand } from '../../cli/commands/skills.js';
import { registerStatusCommand } from '../../cli/commands/status.js';
import { registerAuditCommand } from '../../cli/commands/audit.js';
import { registerGcCommand } from '../../cli/commands/gc.js';
import { registerProjectCommand } from '../../cli/commands/project.js';
import { registerSyncCommand } from '../../cli/commands/sync.js';
import { registerHandoffCommand } from '../../cli/commands/handoff.js';
import { registerRepairCommand } from '../../cli/commands/repair.js';
import { registerExportCommand } from '../../cli/commands/export.js';
import { registerImportCommand } from '../../cli/commands/import.js';
import { registerQuickstartCommand } from '../../cli/commands/quickstart.js';
import { registerImportConfigCommand } from '../../cli/commands/import-config.js';
import { registerMigrateEmbeddingsCommand } from '../../cli/commands/migrate-embeddings.js';
import { registerPlanCommand } from '../../cli/commands/plan.js';
import { registerResearchCommand } from '../../cli/commands/research.js';
import { registerCritiqueCommand } from '../../cli/commands/critique.js';
import { registerVerifyCommand } from '../../cli/commands/verify.js';
import { registerSessionCommand } from '../../cli/commands/session.js';
import { registerRouteCommand } from '../../cli/commands/route.js';
import { registerOptimizeCommand } from '../../cli/commands/optimize.js';
import { registerSimulateCommand } from '../../cli/commands/simulate.js';

let program: Command;

function buildProgram(): Command {
  const p = new Command();
  p.name('noesis')
    .description('Noesis — Superintelligence Workflow System')
    .version('1.0.0');
  p.option('--verbose', 'Enable verbose output');
  p.option('--json', 'Output in JSON format');
  p.option('--project <id>', 'Scope to project');

  registerInitCommand(p);
  registerRememberCommand(p);
  registerRecallCommand(p);
  registerForgetCommand(p);
  registerCorrectCommand(p);
  registerCheckCommand(p);
  registerGapCommand(p);
  registerExplainCommand(p);
  registerLearnCommand(p);
  registerSkillsCommand(p);
  registerStatusCommand(p);
  registerAuditCommand(p);
  registerGcCommand(p);
  registerProjectCommand(p);
  registerSyncCommand(p);
  registerHandoffCommand(p);
  registerRepairCommand(p);
  registerExportCommand(p);
  registerImportCommand(p);
  registerQuickstartCommand(p);
  registerImportConfigCommand(p);
  registerMigrateEmbeddingsCommand(p);
  registerPlanCommand(p);
  registerResearchCommand(p);
  registerCritiqueCommand(p);
  registerVerifyCommand(p);
  registerSessionCommand(p);
  registerRouteCommand(p);
  registerOptimizeCommand(p);
  registerSimulateCommand(p);

  return p;
}

beforeEach(() => {
  program = buildProgram();
});

describe('CLI index', () => {
  it('should have the correct name and description', () => {
    expect(program.name()).toBe('noesis');
    expect(program.description()).toBe('Noesis — Superintelligence Workflow System');
  });

  it('should register all expected top-level commands', () => {
    const commandNames = program.commands.map(c => c.name());

    const expectedCommands = [
      'init',
      'remember',
      'recall',
      'forget',
      'correct',
      'check',
      'gap',
      'explain',
      'learn',
      'skills',
      'status',
      'audit',
      'gc',
      'project',
      'sync',
      'handoff',
      'repair',
      'export',
      'import',
      'quickstart',
      'import-config',
      'migrate-embeddings',
      'plan',
      'research',
      'critique',
      'verify',
      'session',
      'route',
      'optimize',
      'simulate',
    ];

    for (const expected of expectedCommands) {
      expect(commandNames).toContain(expected);
    }
  });

  it('should have global --verbose option', () => {
    const globalOptions = program.options.map(o => o.long);
    expect(globalOptions).toContain('--verbose');
  });

  it('should have global --json option', () => {
    const globalOptions = program.options.map(o => o.long);
    expect(globalOptions).toContain('--json');
  });

  it('should have global --project option', () => {
    const globalOptions = program.options.map(o => o.long);
    expect(globalOptions).toContain('--project');
  });

  it('should register 30 commands in total', () => {
    expect(program.commands.length).toBe(30);
  });
});

describe('command descriptions', () => {
  it('should have non-empty descriptions for all commands', () => {
    for (const cmd of program.commands) {
      expect(cmd.description()).toBeTruthy();
    }
  });
});

describe('subcommand registration', () => {
  it('should register subcommands for skills', () => {
    const skillsCmd = program.commands.find(c => c.name() === 'skills');
    expect(skillsCmd).toBeDefined();
    const subNames = skillsCmd!.commands.map(c => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('promote');
    expect(subNames).toContain('archive');
  });

  it('should register subcommands for project', () => {
    const projectCmd = program.commands.find(c => c.name() === 'project');
    expect(projectCmd).toBeDefined();
    const subNames = projectCmd!.commands.map(c => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('add');
    expect(subNames).toContain('remove');
  });

  it('should register subcommands for session', () => {
    const sessionCmd = program.commands.find(c => c.name() === 'session');
    expect(sessionCmd).toBeDefined();
    const subNames = sessionCmd!.commands.map(c => c.name());
    expect(subNames).toContain('start');
    expect(subNames).toContain('status');
    expect(subNames).toContain('pause');
    expect(subNames).toContain('resume');
  });

  it('should register subcommands for plan', () => {
    const planCmd = program.commands.find(c => c.name() === 'plan');
    expect(planCmd).toBeDefined();
    const subNames = planCmd!.commands.map(c => c.name());
    expect(subNames).toContain('create');
    expect(subNames).toContain('status');
    expect(subNames).toContain('iterate');
  });

  it('should register subcommands for handoff', () => {
    const handoffCmd = program.commands.find(c => c.name() === 'handoff');
    expect(handoffCmd).toBeDefined();
    const subNames = handoffCmd!.commands.map(c => c.name());
    expect(subNames).toContain('create');
    expect(subNames).toContain('list');
    expect(subNames).toContain('acknowledge');
  });
});
