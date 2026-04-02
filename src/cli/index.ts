#!/usr/bin/env node
/**
 * Noesis CLI Entry Point
 *
 * Commander-based CLI that dispatches to command handlers. Each command
 * lives in its own module under ./commands/ and registers itself on the
 * program instance.
 *
 * The CLI is the primary user-facing surface for Noesis. Commands fall
 * into three categories:
 *
 * 1. Daemon-proxied: remember, recall, forget, check, gap, explain,
 *    session, sync, handoff, learn, skills — these call through the
 *    daemon's JSON-RPC interface via NoesisClient.
 *
 * 2. Direct-operational: init, status, gc, repair, export, import,
 *    audit, project, quickstart, import-config, migrate-embeddings —
 *    these operate directly on the database and filesystem.
 *
 * 3. Workflow: plan, research, critique, verify, route, optimize,
 *    simulate — workflow orchestration.
 *
 * 4. Cognitive: rules, experts, capsules, cognitive-skills, context,
 *    orchestrate, predict, gsd, decision, readiness, quality-gate,
 *    handoff-create, handoff-resume, cognitive-session — cognitive
 *    architecture commands.
 */

import { Command } from 'commander';

import { registerInitCommand } from './commands/init.js';
import { registerRememberCommand } from './commands/remember.js';
import { registerRecallCommand } from './commands/recall.js';
import { registerForgetCommand } from './commands/forget.js';
import { registerCorrectCommand } from './commands/correct.js';
import { registerCheckCommand } from './commands/check.js';
import { registerGapCommand } from './commands/gap.js';
import { registerExplainCommand } from './commands/explain.js';
import { registerLearnCommand } from './commands/learn.js';
import { registerSkillsCommand } from './commands/skills.js';
import { registerStatusCommand } from './commands/status.js';
import { registerAuditCommand } from './commands/audit.js';
import { registerGcCommand } from './commands/gc.js';
import { registerProjectCommand } from './commands/project.js';
import { registerSyncCommand } from './commands/sync.js';
import { registerHandoffCommand } from './commands/handoff.js';
import { registerRepairCommand } from './commands/repair.js';
import { registerExportCommand } from './commands/export.js';
import { registerImportCommand } from './commands/import.js';
import { registerQuickstartCommand } from './commands/quickstart.js';
import { registerImportConfigCommand } from './commands/import-config.js';
import { registerMigrateEmbeddingsCommand } from './commands/migrate-embeddings.js';
import { registerPlanCommand } from './commands/plan.js';
import { registerResearchCommand } from './commands/research.js';
import { registerCritiqueCommand } from './commands/critique.js';
import { registerVerifyCommand } from './commands/verify.js';
import { registerSessionCommand } from './commands/session.js';
import { registerRouteCommand } from './commands/route.js';
import { registerOptimizeCommand } from './commands/optimize.js';
import { registerSimulateCommand } from './commands/simulate.js';
import { registerCognitiveCommands } from './commands/cognitive.js';
import { registerIntelligenceCommands } from './commands/intelligence.js';
import { registerWorkflowCommands } from './commands/workflow-cmds.js';

const program = new Command();

program
  .name('noesis')
  .description('Noesis — Superintelligence Workflow System')
  .version('1.0.0');

// Global options available to all commands
program.option('--verbose', 'Enable verbose output');
program.option('--json', 'Output in JSON format');
program.option('--project <id>', 'Scope to project');

// Register all command groups
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
registerCognitiveCommands(program);
registerIntelligenceCommands(program);
registerWorkflowCommands(program);

program.parse();
