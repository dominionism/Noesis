/**
 * Tests for CLI command registration
 *
 * Verifies each CLI command registers correctly on a Commander program
 * instance with the expected name, description, and options. These tests
 * do not execute command actions (they require a running daemon), but
 * validate the structural correctness of command definitions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';

// Import all register functions
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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function findCommand(program: Command, name: string): Command | undefined {
  return program.commands.find((c) => c.name() === name);
}

function findOptionLong(cmd: Command, longFlag: string): boolean {
  return cmd.options.some((o) => o.long === longFlag);
}

// ---------------------------------------------------------------------------
// Memory commands
// ---------------------------------------------------------------------------

describe('CLI commands — memory', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.name('noesis');
    program.option('--verbose', 'Enable verbose output');
    program.option('--json', 'Output in JSON format');
    program.option('--project <id>', 'Scope to project');
  });

  describe('init', () => {
    it('registers the init command', () => {
      registerInitCommand(program);
      const cmd = findCommand(program, 'init');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerInitCommand(program);
      const cmd = findCommand(program, 'init')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('remember', () => {
    it('registers the remember command', () => {
      registerRememberCommand(program);
      const cmd = findCommand(program, 'remember');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerRememberCommand(program);
      const cmd = findCommand(program, 'remember')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --content option', () => {
      registerRememberCommand(program);
      const cmd = findCommand(program, 'remember')!;
      expect(findOptionLong(cmd, '--content')).toBe(true);
    });

    it('has --tags option', () => {
      registerRememberCommand(program);
      const cmd = findCommand(program, 'remember')!;
      expect(findOptionLong(cmd, '--tags')).toBe(true);
    });

    it('has --project option', () => {
      registerRememberCommand(program);
      const cmd = findCommand(program, 'remember')!;
      expect(findOptionLong(cmd, '--project')).toBe(true);
    });

    it('has --confidence option', () => {
      registerRememberCommand(program);
      const cmd = findCommand(program, 'remember')!;
      expect(findOptionLong(cmd, '--confidence')).toBe(true);
    });

    it('has --outcome option', () => {
      registerRememberCommand(program);
      const cmd = findCommand(program, 'remember')!;
      expect(findOptionLong(cmd, '--outcome')).toBe(true);
    });
  });

  describe('recall', () => {
    it('registers the recall command', () => {
      registerRecallCommand(program);
      const cmd = findCommand(program, 'recall');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerRecallCommand(program);
      const cmd = findCommand(program, 'recall')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --type option', () => {
      registerRecallCommand(program);
      const cmd = findCommand(program, 'recall')!;
      expect(findOptionLong(cmd, '--type')).toBe(true);
    });

    it('has --tags option', () => {
      registerRecallCommand(program);
      const cmd = findCommand(program, 'recall')!;
      expect(findOptionLong(cmd, '--tags')).toBe(true);
    });

    it('has --limit option', () => {
      registerRecallCommand(program);
      const cmd = findCommand(program, 'recall')!;
      expect(findOptionLong(cmd, '--limit')).toBe(true);
    });
  });

  describe('forget', () => {
    it('registers the forget command', () => {
      registerForgetCommand(program);
      const cmd = findCommand(program, 'forget');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerForgetCommand(program);
      const cmd = findCommand(program, 'forget')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('correct', () => {
    it('registers the correct command', () => {
      registerCorrectCommand(program);
      const cmd = findCommand(program, 'correct');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerCorrectCommand(program);
      const cmd = findCommand(program, 'correct')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --trigger option', () => {
      registerCorrectCommand(program);
      const cmd = findCommand(program, 'correct')!;
      expect(findOptionLong(cmd, '--trigger')).toBe(true);
    });

    it('has --original option', () => {
      registerCorrectCommand(program);
      const cmd = findCommand(program, 'correct')!;
      expect(findOptionLong(cmd, '--original')).toBe(true);
    });

    it('has --corrected option', () => {
      registerCorrectCommand(program);
      const cmd = findCommand(program, 'correct')!;
      expect(findOptionLong(cmd, '--corrected')).toBe(true);
    });
  });

  describe('check', () => {
    it('registers the check command', () => {
      registerCheckCommand(program);
      const cmd = findCommand(program, 'check');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerCheckCommand(program);
      const cmd = findCommand(program, 'check')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --project option', () => {
      registerCheckCommand(program);
      const cmd = findCommand(program, 'check')!;
      expect(findOptionLong(cmd, '--project')).toBe(true);
    });
  });

  describe('gap', () => {
    it('registers the gap command', () => {
      registerGapCommand(program);
      const cmd = findCommand(program, 'gap');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerGapCommand(program);
      const cmd = findCommand(program, 'gap')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('explain', () => {
    it('registers the explain command', () => {
      registerExplainCommand(program);
      const cmd = findCommand(program, 'explain');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerExplainCommand(program);
      const cmd = findCommand(program, 'explain')!;
      expect(cmd.description()).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Workflow commands
// ---------------------------------------------------------------------------

describe('CLI commands — workflow', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.name('noesis');
    program.option('--verbose', 'Enable verbose output');
    program.option('--json', 'Output in JSON format');
    program.option('--project <id>', 'Scope to project');
  });

  describe('learn', () => {
    it('registers the learn command', () => {
      registerLearnCommand(program);
      const cmd = findCommand(program, 'learn');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerLearnCommand(program);
      const cmd = findCommand(program, 'learn')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --dry-run option', () => {
      registerLearnCommand(program);
      const cmd = findCommand(program, 'learn')!;
      expect(findOptionLong(cmd, '--dry-run')).toBe(true);
    });
  });

  describe('skills', () => {
    it('registers the skills command', () => {
      registerSkillsCommand(program);
      const cmd = findCommand(program, 'skills');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerSkillsCommand(program);
      const cmd = findCommand(program, 'skills')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has list, promote, and archive subcommands', () => {
      registerSkillsCommand(program);
      const cmd = findCommand(program, 'skills')!;
      const subNames = cmd.commands.map((c) => c.name());
      expect(subNames).toContain('list');
      expect(subNames).toContain('promote');
      expect(subNames).toContain('archive');
    });
  });

  describe('plan', () => {
    it('registers the plan command', () => {
      registerPlanCommand(program);
      const cmd = findCommand(program, 'plan');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerPlanCommand(program);
      const cmd = findCommand(program, 'plan')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has create, status, and iterate subcommands', () => {
      registerPlanCommand(program);
      const cmd = findCommand(program, 'plan')!;
      const subNames = cmd.commands.map((c) => c.name());
      expect(subNames).toContain('create');
      expect(subNames).toContain('status');
      expect(subNames).toContain('iterate');
    });
  });

  describe('research', () => {
    it('registers the research command', () => {
      registerResearchCommand(program);
      const cmd = findCommand(program, 'research');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerResearchCommand(program);
      const cmd = findCommand(program, 'research')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --depth option', () => {
      registerResearchCommand(program);
      const cmd = findCommand(program, 'research')!;
      expect(findOptionLong(cmd, '--depth')).toBe(true);
    });
  });

  describe('critique', () => {
    it('registers the critique command', () => {
      registerCritiqueCommand(program);
      const cmd = findCommand(program, 'critique');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerCritiqueCommand(program);
      const cmd = findCommand(program, 'critique')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --cycles option', () => {
      registerCritiqueCommand(program);
      const cmd = findCommand(program, 'critique')!;
      expect(findOptionLong(cmd, '--cycles')).toBe(true);
    });
  });

  describe('verify', () => {
    it('registers the verify command', () => {
      registerVerifyCommand(program);
      const cmd = findCommand(program, 'verify');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerVerifyCommand(program);
      const cmd = findCommand(program, 'verify')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --plan option', () => {
      registerVerifyCommand(program);
      const cmd = findCommand(program, 'verify')!;
      expect(findOptionLong(cmd, '--plan')).toBe(true);
    });
  });

  describe('session', () => {
    it('registers the session command', () => {
      registerSessionCommand(program);
      const cmd = findCommand(program, 'session');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerSessionCommand(program);
      const cmd = findCommand(program, 'session')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has start, status, pause, and resume subcommands', () => {
      registerSessionCommand(program);
      const cmd = findCommand(program, 'session')!;
      const subNames = cmd.commands.map((c) => c.name());
      expect(subNames).toContain('start');
      expect(subNames).toContain('status');
      expect(subNames).toContain('pause');
      expect(subNames).toContain('resume');
    });
  });

  describe('route', () => {
    it('registers the route command', () => {
      registerRouteCommand(program);
      const cmd = findCommand(program, 'route');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerRouteCommand(program);
      const cmd = findCommand(program, 'route')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --prefer option', () => {
      registerRouteCommand(program);
      const cmd = findCommand(program, 'route')!;
      expect(findOptionLong(cmd, '--prefer')).toBe(true);
    });
  });

  describe('optimize', () => {
    it('registers the optimize command', () => {
      registerOptimizeCommand(program);
      const cmd = findCommand(program, 'optimize');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerOptimizeCommand(program);
      const cmd = findCommand(program, 'optimize')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --max-tokens option', () => {
      registerOptimizeCommand(program);
      const cmd = findCommand(program, 'optimize')!;
      expect(findOptionLong(cmd, '--max-tokens')).toBe(true);
    });
  });

  describe('simulate', () => {
    it('registers the simulate command', () => {
      registerSimulateCommand(program);
      const cmd = findCommand(program, 'simulate');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerSimulateCommand(program);
      const cmd = findCommand(program, 'simulate')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --iterations option', () => {
      registerSimulateCommand(program);
      const cmd = findCommand(program, 'simulate')!;
      expect(findOptionLong(cmd, '--iterations')).toBe(true);
    });
  });

  describe('handoff', () => {
    it('registers the handoff command', () => {
      registerHandoffCommand(program);
      const cmd = findCommand(program, 'handoff');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerHandoffCommand(program);
      const cmd = findCommand(program, 'handoff')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has create, list, and acknowledge subcommands', () => {
      registerHandoffCommand(program);
      const cmd = findCommand(program, 'handoff')!;
      const subNames = cmd.commands.map((c) => c.name());
      expect(subNames).toContain('create');
      expect(subNames).toContain('list');
      expect(subNames).toContain('acknowledge');
    });
  });
});

// ---------------------------------------------------------------------------
// Operational commands
// ---------------------------------------------------------------------------

describe('CLI commands — operational', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.name('noesis');
    program.option('--verbose', 'Enable verbose output');
    program.option('--json', 'Output in JSON format');
    program.option('--project <id>', 'Scope to project');
  });

  describe('status', () => {
    it('registers the status command', () => {
      registerStatusCommand(program);
      const cmd = findCommand(program, 'status');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerStatusCommand(program);
      const cmd = findCommand(program, 'status')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('audit', () => {
    it('registers the audit command', () => {
      registerAuditCommand(program);
      const cmd = findCommand(program, 'audit');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerAuditCommand(program);
      const cmd = findCommand(program, 'audit')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('gc', () => {
    it('registers the gc command', () => {
      registerGcCommand(program);
      const cmd = findCommand(program, 'gc');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerGcCommand(program);
      const cmd = findCommand(program, 'gc')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('project', () => {
    it('registers the project command', () => {
      registerProjectCommand(program);
      const cmd = findCommand(program, 'project');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerProjectCommand(program);
      const cmd = findCommand(program, 'project')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has list, add, and remove subcommands', () => {
      registerProjectCommand(program);
      const cmd = findCommand(program, 'project')!;
      const subNames = cmd.commands.map((c) => c.name());
      expect(subNames).toContain('list');
      expect(subNames).toContain('add');
      expect(subNames).toContain('remove');
    });
  });

  describe('sync', () => {
    it('registers the sync command', () => {
      registerSyncCommand(program);
      const cmd = findCommand(program, 'sync');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerSyncCommand(program);
      const cmd = findCommand(program, 'sync')!;
      expect(cmd.description()).toBeTruthy();
    });

    it('has --adapter option', () => {
      registerSyncCommand(program);
      const cmd = findCommand(program, 'sync')!;
      expect(findOptionLong(cmd, '--adapter')).toBe(true);
    });
  });

  describe('repair', () => {
    it('registers the repair command', () => {
      registerRepairCommand(program);
      const cmd = findCommand(program, 'repair');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerRepairCommand(program);
      const cmd = findCommand(program, 'repair')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('export', () => {
    it('registers the export command', () => {
      registerExportCommand(program);
      const cmd = findCommand(program, 'export');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerExportCommand(program);
      const cmd = findCommand(program, 'export')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('import', () => {
    it('registers the import command', () => {
      registerImportCommand(program);
      const cmd = findCommand(program, 'import');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerImportCommand(program);
      const cmd = findCommand(program, 'import')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('quickstart', () => {
    it('registers the quickstart command', () => {
      registerQuickstartCommand(program);
      const cmd = findCommand(program, 'quickstart');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerQuickstartCommand(program);
      const cmd = findCommand(program, 'quickstart')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('import-config', () => {
    it('registers the import-config command', () => {
      registerImportConfigCommand(program);
      const cmd = findCommand(program, 'import-config');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerImportConfigCommand(program);
      const cmd = findCommand(program, 'import-config')!;
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('migrate-embeddings', () => {
    it('registers the migrate-embeddings command', () => {
      registerMigrateEmbeddingsCommand(program);
      const cmd = findCommand(program, 'migrate-embeddings');
      expect(cmd).toBeDefined();
    });

    it('has a description', () => {
      registerMigrateEmbeddingsCommand(program);
      const cmd = findCommand(program, 'migrate-embeddings')!;
      expect(cmd.description()).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: all commands registered together
// ---------------------------------------------------------------------------

describe('CLI commands — full registration', () => {
  it('registers all 30 commands without conflict', () => {
    const program = new Command();
    program.name('noesis');
    program.option('--verbose', 'Enable verbose output');
    program.option('--json', 'Output in JSON format');
    program.option('--project <id>', 'Scope to project');

    registerInitCommand(program);
    registerRememberCommand(program);
    registerRecallCommand(program);
    registerForgetCommand(program);
    registerCorrectCommand(program);
    registerCheckCommand(program);
    registerGapCommand(program);
    registerExplainCommand(program);
    registerLearnCommand(program);
    registerSkillsCommand(program);
    registerStatusCommand(program);
    registerAuditCommand(program);
    registerGcCommand(program);
    registerProjectCommand(program);
    registerSyncCommand(program);
    registerHandoffCommand(program);
    registerRepairCommand(program);
    registerExportCommand(program);
    registerImportCommand(program);
    registerQuickstartCommand(program);
    registerImportConfigCommand(program);
    registerMigrateEmbeddingsCommand(program);
    registerPlanCommand(program);
    registerResearchCommand(program);
    registerCritiqueCommand(program);
    registerVerifyCommand(program);
    registerSessionCommand(program);
    registerRouteCommand(program);
    registerOptimizeCommand(program);
    registerSimulateCommand(program);

    expect(program.commands).toHaveLength(30);
  });

  it('all commands have unique names', () => {
    const program = new Command();
    program.name('noesis');

    registerInitCommand(program);
    registerRememberCommand(program);
    registerRecallCommand(program);
    registerForgetCommand(program);
    registerCorrectCommand(program);
    registerCheckCommand(program);
    registerGapCommand(program);
    registerExplainCommand(program);
    registerLearnCommand(program);
    registerSkillsCommand(program);
    registerStatusCommand(program);
    registerAuditCommand(program);
    registerGcCommand(program);
    registerProjectCommand(program);
    registerSyncCommand(program);
    registerHandoffCommand(program);
    registerRepairCommand(program);
    registerExportCommand(program);
    registerImportCommand(program);
    registerQuickstartCommand(program);
    registerImportConfigCommand(program);
    registerMigrateEmbeddingsCommand(program);
    registerPlanCommand(program);
    registerResearchCommand(program);
    registerCritiqueCommand(program);
    registerVerifyCommand(program);
    registerSessionCommand(program);
    registerRouteCommand(program);
    registerOptimizeCommand(program);
    registerSimulateCommand(program);

    const names = program.commands.map((c) => c.name());
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it('every command has a non-empty description', () => {
    const program = new Command();
    program.name('noesis');

    registerInitCommand(program);
    registerRememberCommand(program);
    registerRecallCommand(program);
    registerForgetCommand(program);
    registerCorrectCommand(program);
    registerCheckCommand(program);
    registerGapCommand(program);
    registerExplainCommand(program);
    registerLearnCommand(program);
    registerSkillsCommand(program);
    registerStatusCommand(program);
    registerAuditCommand(program);
    registerGcCommand(program);
    registerProjectCommand(program);
    registerSyncCommand(program);
    registerHandoffCommand(program);
    registerRepairCommand(program);
    registerExportCommand(program);
    registerImportCommand(program);
    registerQuickstartCommand(program);
    registerImportConfigCommand(program);
    registerMigrateEmbeddingsCommand(program);
    registerPlanCommand(program);
    registerResearchCommand(program);
    registerCritiqueCommand(program);
    registerVerifyCommand(program);
    registerSessionCommand(program);
    registerRouteCommand(program);
    registerOptimizeCommand(program);
    registerSimulateCommand(program);

    for (const cmd of program.commands) {
      expect(cmd.description(), `Command '${cmd.name()}' should have a description`).toBeTruthy();
    }
  });
});
