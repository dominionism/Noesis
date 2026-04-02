/**
 * noesis workflow — CLI commands for workflow modules.
 *
 * Registers subcommand groups for: agents, checkpoint, debug, deviation,
 * workflow-plan, prompt-shape, artifact-verify.
 *
 * All commands proxy through the daemon's JSON-RPC interface via NoesisClient.
 */

import { Command } from 'commander';
import { NoesisClient } from '../../daemon/client.js';

// ---------------------------------------------------------------------------
// Helpers (same pattern as cognitive.ts)
// ---------------------------------------------------------------------------

function getClient(): NoesisClient {
  return new NoesisClient();
}

function getProjectId(options: Record<string, unknown>, program: Command): string | undefined {
  return (options['project'] as string | undefined) ?? program.opts()['project'] as string | undefined;
}

function output(data: unknown, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function rpcCall(method: string, params: Record<string, unknown>, json: boolean): Promise<void> {
  const client = getClient();
  try {
    const fullMethod = method.startsWith('noesis.') ? method : `noesis.${method}`;
    const result = await client.call(fullMethod, params);
    output(result, json);
  } finally {
    client.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorkflowCommands(program: Command): void {
  registerAgentsCommands(program);
  registerCheckpointCommands(program);
  registerDebugCommands(program);
  registerDeviationCommands(program);
  registerWorkflowPlanCommand(program);
  registerPromptShapeCommand(program);
  registerArtifactVerifyCommand(program);
}

// ---------------------------------------------------------------------------
// agents — Agent definition management
// ---------------------------------------------------------------------------

function registerAgentsCommands(program: Command): void {
  const agents = program
    .command('agents')
    .description('Manage agent definitions, commands, and rules');

  agents
    .command('list')
    .description('List all registered agent definitions')
    .action(async () => {
      const json = program.opts()['json'] === true;
      await rpcCall('getAgentDefinitions', {}, json);
    });

  agents
    .command('register')
    .description('Register a new agent definition')
    .requiredOption('--name <name>', 'Agent name')
    .requiredOption('--description <desc>', 'Agent description')
    .option('--display-name <name>', 'Display name (defaults to name)')
    .option('--capabilities <caps...>', 'Agent capabilities')
    .option('--triggers <triggers...>', 'Trigger conditions')
    .option('--constraints <constraints...>', 'Constraints')
    .option('--success-criteria <criteria...>', 'Success criteria')
    .option('--priority <n>', 'Priority (0-100)', parseInt)
    .option('--status <status>', 'Status: active, draft, archived', 'active')
    .action(async (options: {
      name: string;
      description: string;
      displayName?: string;
      capabilities?: string[];
      triggers?: string[];
      constraints?: string[];
      successCriteria?: string[];
      priority?: number;
      status?: string;
    }) => {
      const json = program.opts()['json'] === true;
      await rpcCall('registerAgent', {
        name: options.name,
        description: options.description,
        displayName: options.displayName ?? options.name,
        capabilities: options.capabilities ?? [],
        triggers: options.triggers ?? [],
        constraints: options.constraints ?? [],
        successCriteria: options.successCriteria ?? [],
        priority: options.priority ?? 0,
        status: options.status ?? 'active',
      }, json);
    });
}

// ---------------------------------------------------------------------------
// checkpoint — Execution checkpoint protocol
// ---------------------------------------------------------------------------

function registerCheckpointCommands(program: Command): void {
  const cp = program
    .command('checkpoint')
    .description('Manage execution checkpoints for human-in-the-loop workflows');

  cp
    .command('create')
    .description('Create a checkpoint requiring human input')
    .requiredOption('--type <type>', 'Type: human_verify, decision, human_action')
    .requiredOption('--description <desc>', 'What needs to happen')
    .option('--context <ctx>', 'Additional context')
    .option('--options <opts...>', 'Available options (for decision type)')
    .action(async (options: {
      type: string;
      description: string;
      context?: string;
      options?: string[];
    }) => {
      const json = program.opts()['json'] === true;
      await rpcCall('createCheckpoint', {
        type: options.type,
        description: options.description,
        context: options.context ?? '',
        options: options.options,
      }, json);
    });

  cp
    .command('resolve <id>')
    .description('Resolve a pending checkpoint')
    .option('--resolution <text>', 'Resolution details')
    .action(async (id: string, options: { resolution?: string }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = { id };
      if (options.resolution) params.resolution = options.resolution;
      await rpcCall('resolveCheckpoint', params, json);
    });

  cp
    .command('pending')
    .description('List pending checkpoints')
    .action(async () => {
      const json = program.opts()['json'] === true;
      await rpcCall('getPendingCheckpoints', {}, json);
    });
}

// ---------------------------------------------------------------------------
// debug — Structured bug investigation protocol
// ---------------------------------------------------------------------------

function registerDebugCommands(program: Command): void {
  const dbg = program
    .command('debug')
    .description('Structured bug investigation protocol (gather → investigate → fix → verify)');

  dbg
    .command('start <trigger>')
    .description('Start a new debug session')
    .action(async (trigger: string) => {
      const json = program.opts()['json'] === true;
      await rpcCall('createDebugSession', { trigger }, json);
    });

  dbg
    .command('update')
    .description('Update an active debug session')
    .requiredOption('--action <action>', 'Action: add_symptom, add_evidence, add_eliminated, set_focus, set_resolution, transition')
    .requiredOption('--session <json>', 'Session state (JSON)')
    .option('--symptom <text>', 'Symptom text (for add_symptom)')
    .option('--evidence <text>', 'Evidence text (for add_evidence)')
    .option('--eliminated <text>', 'Eliminated hypothesis (for add_eliminated)')
    .option('--hypothesis <text>', 'Focus hypothesis (for set_focus)')
    .option('--test <text>', 'Focus test (for set_focus)')
    .option('--expecting <text>', 'Focus expectation (for set_focus)')
    .option('--next-action <text>', 'Focus next action (for set_focus)')
    .option('--resolution <text>', 'Resolution (for set_resolution)')
    .option('--status <status>', 'New status (for transition)')
    .action(async (options: Record<string, string | undefined>) => {
      const json = program.opts()['json'] === true;
      let session: Record<string, unknown>;
      try {
        session = JSON.parse(options['session'] ?? '{}') as Record<string, unknown>;
      } catch {
        console.error('Error: --session must be valid JSON');
        process.exitCode = 1;
        return;
      }

      const params: Record<string, unknown> = {
        action: options['action'],
        session,
      };

      // Add action-specific parameters
      if (options['symptom']) params.symptom = options['symptom'];
      if (options['evidence']) params.evidence = options['evidence'];
      if (options['eliminated']) params.eliminated = options['eliminated'];
      if (options['resolution']) params.resolution = options['resolution'];
      if (options['status']) params.status = options['status'];
      if (options['action'] === 'set_focus') {
        params.focus = {
          hypothesis: options['hypothesis'] ?? '',
          test: options['test'] ?? '',
          expecting: options['expecting'] ?? '',
          nextAction: options['nextAction'] ?? '',
        };
      }

      await rpcCall('updateDebugSession', params, json);
    });
}

// ---------------------------------------------------------------------------
// deviation — Plan deviation tracking
// ---------------------------------------------------------------------------

function registerDeviationCommands(program: Command): void {
  const dev = program
    .command('deviation')
    .description('Track and monitor plan deviations');

  dev
    .command('record')
    .description('Record a plan deviation')
    .requiredOption('--rule <n>', 'Deviation rule (1-4)', parseInt)
    .requiredOption('--type <type>', 'Deviation type')
    .requiredOption('--description <desc>', 'What deviated')
    .requiredOption('--task-id <id>', 'Task ID')
    .action(async (options: { rule: number; type: string; description: string; taskId: string }) => {
      const json = program.opts()['json'] === true;
      await rpcCall('trackDeviation', {
        rule: options.rule,
        type: options.type,
        description: options.description,
        task_id: options.taskId,
      }, json);
    });

  dev
    .command('list')
    .description('List tracked deviations')
    .option('--task-id <id>', 'Filter by task')
    .action(async (options: { taskId?: string }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = {};
      if (options.taskId) params.task_id = options.taskId;
      await rpcCall('getDeviations', params, json);
    });
}

// ---------------------------------------------------------------------------
// workflow-plan — Structured workflow plan creation
// ---------------------------------------------------------------------------

function registerWorkflowPlanCommand(program: Command): void {
  program
    .command('workflow-plan <goal>')
    .description('Create a structured workflow plan with phases and tasks')
    .option('--context <ctx>', 'Additional context')
    .option('--constraints <items...>', 'Constraints to respect')
    .option('--deliverable <desc>', 'Expected deliverable')
    .option('--validation <items...>', 'Validation criteria')
    .action(async (goal: string, options: {
      context?: string;
      constraints?: string[];
      deliverable?: string;
      validation?: string[];
    }) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = { goal };
      if (options.context) params.context = options.context;
      if (options.constraints) params.constraints = options.constraints;
      if (options.deliverable) params.deliverable = options.deliverable;
      if (options.validation) params.validation = options.validation;
      if (projectId) params.project_id = projectId;
      await rpcCall('createWorkflowPlan', params, json);
    });
}

// ---------------------------------------------------------------------------
// prompt-shape — Extract structured prompt shape
// ---------------------------------------------------------------------------

function registerPromptShapeCommand(program: Command): void {
  program
    .command('prompt-shape <prompt>')
    .description('Extract structured shape (goal, constraints, deliverable) from a raw prompt')
    .action(async (prompt: string) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = { prompt };
      if (projectId) params.project_id = projectId;
      await rpcCall('optimizePrompt', params, json);
    });
}

// ---------------------------------------------------------------------------
// artifact-verify — Verify implementation artifacts
// ---------------------------------------------------------------------------

function registerArtifactVerifyCommand(program: Command): void {
  program
    .command('artifact-verify <artifact>')
    .description('Verify an implementation artifact exists, is substantive, and is wired')
    .option('--description <desc>', 'Artifact description')
    .option('--expected-patterns <patterns...>', 'Patterns that should exist in the artifact')
    .option('--expected-imports <imports...>', 'Files that should import this artifact')
    .option('--root-path <path>', 'Root path for verification', '.')
    .action(async (artifact: string, options: {
      description?: string;
      expectedPatterns?: string[];
      expectedImports?: string[];
      rootPath?: string;
    }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = { artifact };
      if (options.description) params.description = options.description;
      if (options.expectedPatterns) params.expected_patterns = options.expectedPatterns;
      if (options.expectedImports) params.expected_imports = options.expectedImports;
      if (options.rootPath) params.root_path = options.rootPath;
      await rpcCall('verifyArtifact', params, json);
    });
}
