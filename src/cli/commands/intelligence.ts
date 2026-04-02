/**
 * noesis intelligence — CLI commands for intelligence modules.
 *
 * Registers subcommand groups for: cluster, synthesize, distill, profile,
 * evaluate, metrics, analyze, friction, benchmark, confidence, codebase-map,
 * world-model, task-plan, model-route, compute, trace, experience, verify-req.
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

export function registerIntelligenceCommands(program: Command): void {
  registerClusterCommand(program);
  registerSynthesizeCommands(program);
  registerDistillCommand(program);
  registerProfileCommands(program);
  registerEvaluateCommand(program);
  registerMetricsCommand(program);
  registerAnalyzeCommand(program);
  registerFrictionCommand(program);
  registerBenchmarkCommands(program);
  registerConfidenceCommand(program);
  registerCodebaseMapCommand(program);
  registerWorldModelCommand(program);
  registerTaskPlanCommand(program);
  registerModelRouteCommand(program);
  registerComputeCommand(program);
  registerTraceCommand(program);
  registerExperienceCommand(program);
  registerVerifyReqCommand(program);
}

// ---------------------------------------------------------------------------
// cluster — Cluster memories by embedding similarity
// ---------------------------------------------------------------------------

function registerClusterCommand(program: Command): void {
  program
    .command('cluster')
    .description('Cluster memories by embedding similarity to find patterns')
    .option('--min-size <n>', 'Minimum cluster size', parseInt)
    .option('--max-clusters <n>', 'Maximum clusters', parseInt)
    .action(async (options: { minSize?: number; maxClusters?: number }) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      if (options.minSize) params.min_cluster_size = options.minSize;
      if (options.maxClusters) params.max_clusters = options.maxClusters;
      await rpcCall('clusterMemories', params, json);
    });
}

// ---------------------------------------------------------------------------
// synthesize — Synthesize skills and anti-patterns from memory patterns
// ---------------------------------------------------------------------------

function registerSynthesizeCommands(program: Command): void {
  const synth = program
    .command('synthesize')
    .description('Synthesize skills or anti-patterns from memory patterns');

  synth
    .command('skill')
    .description('Synthesize a new executable skill from repeated patterns')
    .option('--min-occurrences <n>', 'Minimum pattern occurrences', parseInt)
    .action(async (options: { minOccurrences?: number }) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      if (options.minOccurrences) params.min_occurrences = options.minOccurrences;
      await rpcCall('synthesizeSkill', params, json);
    });

  synth
    .command('anti-pattern')
    .description('Synthesize anti-patterns from repeated failures')
    .option('--min-occurrences <n>', 'Minimum failure occurrences', parseInt)
    .action(async (options: { minOccurrences?: number }) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      if (options.minOccurrences) params.min_occurrences = options.minOccurrences;
      await rpcCall('synthesizeAntiPattern', params, json);
    });
}

// ---------------------------------------------------------------------------
// distill — Distill and compact memory knowledge
// ---------------------------------------------------------------------------

function registerDistillCommand(program: Command): void {
  program
    .command('distill')
    .description('Distill memories — merge near-duplicates and compact knowledge')
    .option('--dry-run', 'Preview without modifying')
    .action(async (options: { dryRun?: boolean }) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      if (options.dryRun) params.dry_run = true;
      await rpcCall('distillMemories', params, json);
    });
}

// ---------------------------------------------------------------------------
// profile — Cognitive profile management
// ---------------------------------------------------------------------------

function registerProfileCommands(program: Command): void {
  const profile = program
    .command('profile')
    .description('View and update cognitive profile (strengths, blind spots, preferences)');

  profile
    .command('show')
    .description('Show current cognitive profile')
    .action(async () => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      await rpcCall('getCognitiveProfile', params, json);
    });

  profile
    .command('correction')
    .description('Record a correction to update the cognitive profile')
    .requiredOption('--expected <text>', 'What was expected')
    .requiredOption('--actual <text>', 'What actually happened')
    .requiredOption('--context <text>', 'Context of the correction')
    .action(async (options: { expected: string; actual: string; context: string }) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      await rpcCall('updateCognitiveProfile', {
        action: 'correction',
        correction: { expected: options.expected, actual: options.actual, context: options.context },
        ...(projectId ? { project_id: projectId } : {}),
      }, json);
    });

  profile
    .command('preference')
    .description('Record a preference')
    .requiredOption('--key <key>', 'Preference key')
    .requiredOption('--value <value>', 'Preference value')
    .option('--category <cat>', 'Category: technology, style, workflow', 'workflow')
    .action(async (options: { key: string; value: string; category: string }) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      await rpcCall('updateCognitiveProfile', {
        action: 'preference',
        preference: { key: options.key, value: options.value, category: options.category },
        ...(projectId ? { project_id: projectId } : {}),
      }, json);
    });
}

// ---------------------------------------------------------------------------
// evaluate — Self-evaluate performance
// ---------------------------------------------------------------------------

function registerEvaluateCommand(program: Command): void {
  program
    .command('evaluate')
    .description('Self-evaluate cognitive performance (retrieval accuracy, learning rate)')
    .action(async () => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      await rpcCall('selfEvaluate', params, json);
    });
}

// ---------------------------------------------------------------------------
// metrics — Compute intelligence metrics
// ---------------------------------------------------------------------------

function registerMetricsCommand(program: Command): void {
  program
    .command('metrics')
    .description('Compute intelligence system metrics')
    .requiredOption('--total-retrievals <n>', 'Total retrieval count', parseInt)
    .requiredOption('--helpful-retrievals <n>', 'Helpful retrieval count', parseInt)
    .option('--total-gate-checks <n>', 'Total gate checks', parseInt)
    .option('--gates-passed <n>', 'Gates passed', parseInt)
    .option('--total-failures <n>', 'Total failures', parseInt)
    .option('--lessons-captured <n>', 'Lessons captured', parseInt)
    .action(async (options: Record<string, unknown>) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      await rpcCall('computeIntelligenceMetrics', {
        totalRetrievals: options['totalRetrievals'] ?? 0,
        helpfulRetrievals: options['helpfulRetrievals'] ?? 0,
        totalGateChecks: options['totalGateChecks'] ?? 0,
        gatesPassed: options['gatesPassed'] ?? 0,
        totalFailures: options['totalFailures'] ?? 0,
        lessonsCaptured: options['lessonsCaptured'] ?? 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      }, json);
    });
}

// ---------------------------------------------------------------------------
// analyze — Meta-reasoning progress analysis
// ---------------------------------------------------------------------------

function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description('Analyze reasoning progress and identify stalls or loops')
    .option('--task <description>', 'Task being analyzed')
    .action(async (options: { task?: string }) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      if (options.task) params.task_description = options.task;
      await rpcCall('analyzeProgress', params, json);
    });
}

// ---------------------------------------------------------------------------
// friction — Detect session friction points
// ---------------------------------------------------------------------------

function registerFrictionCommand(program: Command): void {
  program
    .command('friction')
    .description('Detect friction points in the current session')
    .action(async () => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      await rpcCall('detectFriction', params, json);
    });
}

// ---------------------------------------------------------------------------
// benchmark — Noesis-on vs Noesis-off benchmarking
// ---------------------------------------------------------------------------

function registerBenchmarkCommands(program: Command): void {
  const bench = program
    .command('benchmark')
    .description('Benchmark Noesis-on vs Noesis-off performance');

  bench
    .command('create <id> <task-class> <description>')
    .description('Create a benchmark task (task-class: bug_fix, refactor, migration, etc.)')
    .option('--difficulty <level>', 'easy, medium, hard', 'medium')
    .action(async (id: string, taskClass: string, description: string, options: { difficulty: string }) => {
      const json = program.opts()['json'] === true;
      await rpcCall('runBenchmark', {
        action: 'create_task',
        id,
        task_class: taskClass,
        description,
        difficulty: options.difficulty,
      }, json);
    });

  bench
    .command('compare')
    .description('Compare Noesis-on vs Noesis-off results (pass runs as JSON via stdin)')
    .requiredOption('--task-class <class>', 'Task class to compare')
    .requiredOption('--model-tier <tier>', 'Model tier to compare')
    .action(async (options: { taskClass: string; modelTier: string }) => {
      const json = program.opts()['json'] === true;
      await rpcCall('runBenchmark', {
        action: 'compare',
        task_class: options.taskClass,
        model_tier: options.modelTier,
        runs: [],
      }, json);
    });
}

// ---------------------------------------------------------------------------
// confidence — Bayesian confidence tracking
// ---------------------------------------------------------------------------

function registerConfidenceCommand(program: Command): void {
  program
    .command('confidence')
    .description('Update Bayesian confidence for a skill or anti-pattern')
    .requiredOption('--outcome <result>', 'Outcome: success, partial, failure')
    .option('--successes <n>', 'Current success count', parseInt)
    .option('--failures <n>', 'Current failure count', parseInt)
    .action(async (options: { outcome: string; successes?: number; failures?: number }) => {
      const json = program.opts()['json'] === true;
      await rpcCall('updateConfidence', {
        successes: options.successes ?? 0,
        failures: options.failures ?? 0,
        confidence: 0,
        outcome: options.outcome,
      }, json);
    });
}

// ---------------------------------------------------------------------------
// codebase-map — Build codebase knowledge map
// ---------------------------------------------------------------------------

function registerCodebaseMapCommand(program: Command): void {
  program
    .command('codebase-map <root-path>')
    .description('Build a codebase knowledge map for intelligent navigation')
    .action(async (rootPath: string) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = { root_path: rootPath };
      if (projectId) params.project_id = projectId;
      await rpcCall('buildCodebaseMap', params, json);
    });
}

// ---------------------------------------------------------------------------
// world-model — Build world model from memories
// ---------------------------------------------------------------------------

function registerWorldModelCommand(program: Command): void {
  program
    .command('world-model')
    .description('Build a world model synthesizing all knowledge for a project')
    .action(async () => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      await rpcCall('buildWorldModel', params, json);
    });
}

// ---------------------------------------------------------------------------
// task-plan — Decompose task into steps
// ---------------------------------------------------------------------------

function registerTaskPlanCommand(program: Command): void {
  program
    .command('task-plan <task>')
    .description('Decompose a task into execution steps with dependency analysis')
    .action(async (task: string) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = { task };
      if (projectId) params.project_id = projectId;
      await rpcCall('planTask', params, json);
    });
}

// ---------------------------------------------------------------------------
// model-route — Route to optimal model for an operation
// ---------------------------------------------------------------------------

function registerModelRouteCommand(program: Command): void {
  program
    .command('model-route <operation>')
    .description('Route an operation to the optimal model tier')
    .option('--complexity <level>', 'Complexity: low, medium, high')
    .option('--latency-sensitive', 'Prioritize low latency')
    .action(async (operation: string, options: { complexity?: string; latencySensitive?: boolean }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = { operation };
      if (options.complexity) params.complexity = options.complexity;
      if (options.latencySensitive) params.latency_sensitive = true;
      await rpcCall('routeModel', params, json);
    });
}

// ---------------------------------------------------------------------------
// compute — Select test-time compute strategy
// ---------------------------------------------------------------------------

function registerComputeCommand(program: Command): void {
  program
    .command('compute <task>')
    .description('Select the optimal test-time compute strategy for a task')
    .option('--confidence <n>', 'Current confidence level (0-1)', parseFloat)
    .action(async (task: string, options: { confidence?: number }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = { task };
      if (options.confidence !== undefined) params.confidence = options.confidence;
      await rpcCall('selectCompute', params, json);
    });
}

// ---------------------------------------------------------------------------
// trace — Distill execution trace into lessons
// ---------------------------------------------------------------------------

function registerTraceCommand(program: Command): void {
  program
    .command('trace <trace>')
    .description('Distill an execution trace into transferable lessons')
    .action(async (trace: string) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = { trace };
      if (projectId) params.project_id = projectId;
      await rpcCall('distillTrace', params, json);
    });
}

// ---------------------------------------------------------------------------
// experience — Synthesize session experience into knowledge
// ---------------------------------------------------------------------------

function registerExperienceCommand(program: Command): void {
  program
    .command('experience')
    .description('Synthesize session experience into durable knowledge')
    .option('--session-id <id>', 'Session to synthesize')
    .action(async (options: { sessionId?: string }) => {
      const globalOpts = program.opts();
      const json = globalOpts['json'] === true;
      const projectId = getProjectId(globalOpts as Record<string, unknown>, program);
      const params: Record<string, unknown> = {};
      if (projectId) params.project_id = projectId;
      if (options.sessionId) params.session_id = options.sessionId;
      await rpcCall('synthesizeExperience', params, json);
    });
}

// ---------------------------------------------------------------------------
// verify-req — Determine verification requirements for a change
// ---------------------------------------------------------------------------

function registerVerifyReqCommand(program: Command): void {
  program
    .command('verify-req <task>')
    .description('Determine verification requirements for a proposed change')
    .option('--criticality <level>', 'Change criticality: low, medium, high, critical')
    .option('--language <lang>', 'Programming language')
    .action(async (task: string, options: { criticality?: string; language?: string }) => {
      const json = program.opts()['json'] === true;
      const params: Record<string, unknown> = { task };
      if (options.criticality) params.criticality = options.criticality;
      if (options.language) params.language = options.language;
      await rpcCall('checkVerification', params, json);
    });
}
