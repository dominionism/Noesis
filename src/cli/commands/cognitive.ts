/**
 * noesis cognitive — CLI commands for the cognitive architecture.
 *
 * Registers subcommand groups for: rules, experts, capsules, cognitive-skills,
 * context, orchestrate, predict, gsd, decision, readiness, quality-gate.
 *
 * All commands proxy through the daemon's JSON-RPC interface via NoesisClient.
 */

import { Command } from 'commander';
import { NoesisClient } from '../../daemon/client.js';

// ---------------------------------------------------------------------------
// Helpers
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
    // Methods are registered with 'noesis.' prefix in the RPC handler
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

export function registerCognitiveCommands(program: Command): void {
  registerRulesCommands(program);
  registerExpertsCommands(program);
  registerCapsulesCommands(program);
  registerCognitiveSkillsCommands(program);
  registerContextCommands(program);
  registerOrchestrateCommand(program);
  registerPredictCommand(program);
  registerGsdCommands(program);
  registerDecisionCommands(program);
  registerReadinessCommand(program);
  registerQualityGateCommand(program);
  registerCognitiveSessionCommands(program);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function registerRulesCommands(program: Command): void {
  const rules = program
    .command('rules')
    .description('Rule management');

  rules
    .command('list')
    .description('List active rules')
    .option('--category <cat>', 'Filter by category')
    .option('--all', 'Include disabled rules')
    .action(async (options: { category?: string; all?: boolean }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = {};
      if (options.category) params.category = options.category;
      if (!options.all) params.enabled = true;
      await rpcCall('listRules', params, json);
    });

  rules
    .command('show <name>')
    .description('Show rule details')
    .action(async (name: string) => {
      const json = program.opts()['json'] === true;
      const client = getClient();
      try {
        const result = await client.call<{ rules: Array<{ name: string }> }>('listRules', {});
        const rule = (result.rules ?? []).find((r: { name: string }) => r.name === name);
        if (rule) {
          output(rule, json);
        } else {
          console.error(`Rule not found: ${name}`);
          process.exitCode = 1;
        }
      } finally {
        client.disconnect();
      }
    });

  rules
    .command('compliance <task>')
    .description('Check task against rules')
    .action(async (task: string) => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program);
      await rpcCall('checkCompliance', {
        task_context: task,
        project_id: projectId,
        is_substantial: true,
      }, json);
    });
}

// ---------------------------------------------------------------------------
// Experts
// ---------------------------------------------------------------------------

function registerExpertsCommands(program: Command): void {
  const experts = program
    .command('experts')
    .description('Expert agent management');

  experts
    .command('list')
    .description('List experts')
    .option('--category <cat>', 'Filter by category')
    .action(async (options: { category?: string }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = {};
      if (options.category) params.category = options.category;
      await rpcCall('listExperts', params, json);
    });

  experts
    .command('show <name>')
    .description('Show expert details')
    .action(async (name: string) => {
      const json = program.opts()['json'] === true;
      const client = getClient();
      try {
        const result = await client.call<{ experts: Array<{ name: string }> }>('listExperts', {});
        const expert = (result.experts ?? []).find((e: { name: string }) => e.name === name);
        if (expert) {
          output(expert, json);
        } else {
          console.error(`Expert not found: ${name}`);
          process.exitCode = 1;
        }
      } finally {
        client.disconnect();
      }
    });

  experts
    .command('route <task>')
    .description('Route task to expert')
    .option('--prefer <category>', 'Prefer category')
    .action(async (task: string, options: { prefer?: string }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = { task };
      if (options.prefer) params.prefer_category = options.prefer;
      await rpcCall('routeExpertCognitive', params, json);
    });
}

// ---------------------------------------------------------------------------
// Capsules
// ---------------------------------------------------------------------------

function registerCapsulesCommands(program: Command): void {
  const capsules = program
    .command('capsules')
    .description('Deep capsule management');

  capsules
    .command('list')
    .description('List capsules')
    .action(async () => {
      const json = program.opts()['json'] === true;
      await rpcCall('listCapsules', {}, json);
    });

  capsules
    .command('show <name>')
    .description('Show capsule with components')
    .action(async (name: string) => {
      const json = program.opts()['json'] === true;
      const client = getClient();
      try {
        const result = await client.call<{ capsules: Array<{ name: string }> }>('listCapsules', {});
        const capsule = (result.capsules ?? []).find((c: { name: string }) => c.name === name);
        if (capsule) {
          output(capsule, json);
        } else {
          console.error(`Capsule not found: ${name}`);
          process.exitCode = 1;
        }
      } finally {
        client.disconnect();
      }
    });

  capsules
    .command('match <task>')
    .description('Match task to capsule')
    .action(async (task: string) => {
      const json = program.opts()['json'] === true;
      await rpcCall('matchCapsuleDeep', { goal: task }, json);
    });
}

// ---------------------------------------------------------------------------
// Cognitive Skills (separate from legacy YAML skills)
// ---------------------------------------------------------------------------

function registerCognitiveSkillsCommands(program: Command): void {
  const cskills = program
    .command('cognitive-skills')
    .description('Cognitive skill matching');

  cskills
    .command('match <task>')
    .description('Match task to skills')
    .option('--max <n>', 'Max results', '5')
    .option('--category <cat>', 'Filter by category')
    .action(async (task: string, options: { max?: string; category?: string }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = { task, max: parseInt(options.max ?? '5', 10) };
      if (options.category) params.category = options.category;
      await rpcCall('matchSkills', params, json);
    });
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

function registerContextCommands(program: Command): void {
  const ctx = program
    .command('context')
    .description('Context file management');

  ctx
    .command('list')
    .description('List context files')
    .action(async () => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      await rpcCall('getContexts', params, json);
    });

  ctx
    .command('show <type>')
    .description('Show context content')
    .action(async (type: string) => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program);
      await rpcCall('getContexts', {
        project_id: projectId,
        types: [type],
      }, json);
    });

  ctx
    .command('update <type> <content>')
    .description('Update context content')
    .action(async (type: string, content: string) => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program);
      await rpcCall('updateContext', {
        type,
        content,
        project_id: projectId,
      }, json);
    });
}

// ---------------------------------------------------------------------------
// Orchestrate
// ---------------------------------------------------------------------------

function registerOrchestrateCommand(program: Command): void {
  program
    .command('orchestrate <request>')
    .description('Full cognitive orchestration')
    .option('--budget <tokens>', 'Token budget', '8000')
    .action(async (request: string, options: { budget?: string }) => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program);
      await rpcCall('orchestrate', {
        request,
        project_id: projectId,
        token_budget: parseInt(options.budget ?? '8000', 10),
      }, json);
    });
}

// ---------------------------------------------------------------------------
// Predict
// ---------------------------------------------------------------------------

function registerPredictCommand(program: Command): void {
  program
    .command('predict <task>')
    .description('Predictive failure detection')
    .action(async (task: string) => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program);
      await rpcCall('predictFailures', {
        task,
        project_id: projectId,
      }, json);
    });
}

// ---------------------------------------------------------------------------
// GSD Execution
// ---------------------------------------------------------------------------

function registerGsdCommands(program: Command): void {
  const gsd = program
    .command('gsd')
    .description('GSD execution engine');

  gsd
    .command('new <project> <description>')
    .description('Create GSD project')
    .option('--milestone <name>', 'Milestone name')
    .action(async (project: string, description: string, options: { milestone?: string }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = {
        project_id: project,
        description,
      };
      if (options.milestone) params.milestone = options.milestone;
      await rpcCall('createGsdProject', params, json);
    });

  gsd
    .command('execute <project> <phase>')
    .description('Execute GSD phase (research|plan|check|execute|verify|complete)')
    .action(async (project: string, phase: string) => {
      const json = program.opts()['json'] === true;
      await rpcCall('executeGsdPhase', {
        project_id: project,
        phase,
      }, json);
    });

  gsd
    .command('progress <project>')
    .description('Show GSD progress')
    .action(async (project: string) => {
      const json = program.opts()['json'] === true;
      await rpcCall('getGsdState', { project_id: project }, json);
    });
}

// ---------------------------------------------------------------------------
// Decision fidelity
// ---------------------------------------------------------------------------

function registerDecisionCommands(program: Command): void {
  const decision = program
    .command('decision')
    .description('Decision fidelity management');

  decision
    .command('check <action>')
    .description('Check decision fidelity')
    .action(async (action: string) => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program) ?? 'default';
      await rpcCall('checkDecisionFidelity', {
        action,
        project_id: projectId,
      }, json);
    });

  decision
    .command('list')
    .description('List locked decisions')
    .action(async () => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program);
      // Use getContexts with decisions type
      await rpcCall('getContexts', {
        project_id: projectId,
        types: ['decisions'],
      }, json);
    });
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

function registerReadinessCommand(program: Command): void {
  program
    .command('readiness <task>')
    .description('Evidence-backed readiness scoring')
    .option('--goal', 'Has explicit goal')
    .option('--deliverable', 'Has deliverable defined')
    .option('--explored', 'Codebase explored')
    .option('--architecture', 'Architecture understood')
    .option('--verification', 'Has verification plan')
    .action(async (task: string, options: {
      goal?: boolean;
      deliverable?: boolean;
      explored?: boolean;
      architecture?: boolean;
      verification?: boolean;
    }) => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program);
      await rpcCall('checkReadinessEvidence', {
        task,
        project_id: projectId,
        has_goal: options.goal === true,
        has_deliverable: options.deliverable === true,
        codebase_explored: options.explored === true,
        architecture_understood: options.architecture === true,
        has_verification_plan: options.verification === true,
      }, json);
    });
}

// ---------------------------------------------------------------------------
// Quality gate
// ---------------------------------------------------------------------------

function registerQualityGateCommand(program: Command): void {
  program
    .command('quality-gate <type>')
    .description('Creative or API quality gate check')
    .option('--objective <text>', 'Creative objective')
    .option('--audience <text>', 'Target audience')
    .option('--contract <text>', 'API contract target')
    .option('--verification-plan <text>', 'Verification plan')
    .action(async (type: string, options: {
      objective?: string;
      audience?: string;
      contract?: string;
      verificationPlan?: string;
    }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = { type };
      if (options.objective) params.objective = options.objective;
      if (options.audience) params.audience = options.audience;
      if (options.contract) params.contract_target = options.contract;
      if (options.verificationPlan) params.verification_plan = options.verificationPlan;
      await rpcCall('checkQualityGate', params, json);
    });
}

// ---------------------------------------------------------------------------
// Cognitive session commands (complement existing session commands)
// ---------------------------------------------------------------------------

function registerCognitiveSessionCommands(program: Command): void {
  // Create rich handoff (complements existing handoff command)
  program
    .command('handoff-create')
    .description('Create rich cognitive handoff')
    .requiredOption('--source <agent>', 'Source agent')
    .requiredOption('--target <agent>', 'Target agent')
    .requiredOption('--reason <reason>', 'Handoff reason')
    .requiredOption('--summary <text>', 'State summary')
    .option('--priority <level>', 'Priority: normal|immediate', 'normal')
    .action(async (options: {
      source: string;
      target: string;
      reason: string;
      summary: string;
      priority?: string;
    }) => {
      const json = program.opts()['json'] === true;
      const projectId = getProjectId({}, program);
      await rpcCall('createHandoff', {
        source_agent: options.source,
        target_agent: options.target,
        reason: options.reason,
        state_summary: options.summary,
        project_id: projectId,
        priority: options.priority ?? 'normal',
      }, json);
    });

  // Resume handoff
  program
    .command('handoff-resume <id>')
    .description('Resume from handoff')
    .action(async (id: string) => {
      const json = program.opts()['json'] === true;
      await rpcCall('resumeHandoff', { handoff_id: id }, json);
    });

  // Detect verification
  program
    .command('detect-verification <project-root>')
    .description('Detect verification capabilities')
    .action(async (projectRoot: string) => {
      const json = program.opts()['json'] === true;
      await rpcCall('detectVerification', { project_root: projectRoot }, json);
    });

  // Critique research
  program
    .command('critique-research <work>')
    .description('7-dimension research critique')
    .action(async (work: string) => {
      const json = program.opts()['json'] === true;
      await rpcCall('critiqueResearch', { work }, json);
    });

  // Critique plan
  program
    .command('critique-plan <work>')
    .description('7-dimension plan critique')
    .action(async (work: string) => {
      const json = program.opts()['json'] === true;
      await rpcCall('critiquePlan', { work }, json);
    });

  // Process learning
  program
    .command('process-learning')
    .description('Process a learning event')
    .requiredOption('--trigger <type>', 'Trigger type')
    .requiredOption('--description <text>', 'Description')
    .requiredOption('--root-cause <text>', 'Root cause')
    .requiredOption('--prevention <text>', 'Prevention rule')
    .requiredOption('--failure-class <class>', 'Failure class')
    .requiredOption('--phase <phase>', 'Phase')
    .action(async (options: {
      trigger: string;
      description: string;
      rootCause: string;
      prevention: string;
      failureClass: string;
      phase: string;
    }) => {
      const json = program.opts()['json'] === true;
      await rpcCall('processLearning', {
        trigger: options.trigger,
        description: options.description,
        root_cause: options.rootCause,
        prevention_rule: options.prevention,
        failure_class: options.failureClass,
        phase: options.phase,
      }, json);
    });

  // Start cognitive session
  program
    .command('cognitive-session <project>')
    .description('Start session with cognitive context')
    .option('--agent <name>', 'Agent name', 'default')
    .action(async (project: string, options: { agent?: string }) => {
      const json = program.opts()['json'] === true;
      await rpcCall('startSessionCognitive', {
        project_id: project,
        agent: options.agent ?? 'default',
      }, json);
    });

  // Gate effectiveness
  program
    .command('effectiveness')
    .description('Show gate effectiveness metrics')
    .option('--gate <type>', 'Gate type filter')
    .action(async (options: { gate?: string }) => {
      const json = program.opts()['json'] === true;
      // Effectiveness comes from the readiness gate metrics
      const params: Record<string, unknown> = {};
      if (options.gate) params.gate_type = options.gate;
      // This uses the getContexts endpoint to get effectiveness data
      await rpcCall('getContexts', { types: ['failure_patterns'] }, json);
    });
}
