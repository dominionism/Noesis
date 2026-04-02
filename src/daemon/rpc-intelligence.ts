/**
 * Intelligence RPC Method Registration
 *
 * Registers all intelligence module RPC methods onto the shared
 * method registry. Separated from rpc.ts and rpc-cognitive.ts to
 * keep concerns isolated.
 *
 * 19 methods covering: clustering, synthesis, distillation, profiling,
 * evaluation, planning, routing, friction detection, and more.
 *
 * All modules use lazy dynamic imports to avoid loading until first call.
 */

import { createHash } from 'node:crypto';
import type { DatabaseConnection } from '../core/database.js';
import type { EmbeddingProvider } from '../types.js';
import type { LlmProvider } from '../intelligence/skill-synthesis.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MethodHandler = (params: Record<string, unknown>) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

class IntelligenceRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const ERROR_INVALID_PARAMS = -32602;
const ERROR_INTERNAL = -32603;

// ---------------------------------------------------------------------------
// Param helpers
// ---------------------------------------------------------------------------

function requireString(params: Record<string, unknown>, key: string, method: string): string {
  const v = params[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new IntelligenceRpcError(ERROR_INVALID_PARAMS, `${method}: missing required parameter "${key}"`);
  }
  return v;
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  return typeof v === 'string' ? v : undefined;
}

function optionalNumber(params: Record<string, unknown>, key: string): number | undefined {
  const v = params[key];
  return typeof v === 'number' ? v : undefined;
}

function optionalBoolean(params: Record<string, unknown>, key: string): boolean | undefined {
  const v = params[key];
  return typeof v === 'boolean' ? v : undefined;
}

function optionalStringArray(params: Record<string, unknown>, key: string): string[] | undefined {
  const v = params[key];
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === 'string');
}

function requireObject(params: Record<string, unknown>, key: string, method: string): Record<string, unknown> {
  const v = params[key];
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new IntelligenceRpcError(ERROR_INVALID_PARAMS, `${method}: missing required object parameter "${key}"`);
  }
  return v as Record<string, unknown>;
}

function auditHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface IntelligenceRpcDependencies {
  db: DatabaseConnection;
  embeddingProvider: EmbeddingProvider;
  writeAuditLog: (entry: Omit<import('../types.js').AuditEntry, 'timestamp'>) => void;
  llmProvider?: LlmProvider;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerIntelligenceMethods(
  methods: Map<string, MethodHandler>,
  deps: IntelligenceRpcDependencies,
): void {
  const { db, writeAuditLog, llmProvider } = deps;

  function requireLlm(method: string): LlmProvider {
    if (!llmProvider) {
      throw new IntelligenceRpcError(ERROR_INTERNAL, `${method}: LLM provider not configured. Set ANTHROPIC_API_KEY or configure llm_provider in noesis.yaml.`);
    }
    return llmProvider;
  }

  function audit(method: string, hash: string, extra?: Record<string, unknown>): void {
    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(hash),
      source: 'system',
      details: { method, ...extra },
    });
  }

  // =========================================================================
  // 1. clusterMemories — Cluster memories by embedding similarity
  // =========================================================================

  methods.set('noesis.clusterMemories', async (params) => {
    const projectId = optionalString(params, 'project_id') ?? null;

    const { clusterMemories } = await import('../intelligence/clustering.js');

    const getAllMemories = () => {
      const sql = projectId
        ? "SELECT id, type, outcome, embedding, tags FROM memories WHERE status = 'active' AND embedding IS NOT NULL AND (project_id = ? OR project_id IS NULL)"
        : "SELECT id, type, outcome, embedding, tags FROM memories WHERE status = 'active' AND embedding IS NOT NULL";
      const stmt = db.prepare<unknown[], { id: string; type: string; outcome: string | null; embedding: Buffer; tags: string }>(sql);
      return projectId ? stmt.all(projectId) : stmt.all();
    };

    const countStmt = db.prepare<[], { cnt: number }>("SELECT COUNT(*) as cnt FROM memories WHERE status = 'active'");
    const totalCount = countStmt.get()?.cnt ?? 0;

    const result = await clusterMemories({ getAllMemories, totalMemoryCount: totalCount });

    audit('noesis.clusterMemories', JSON.stringify(result), {
      positive_clusters: result.positiveClusters.length,
      negative_clusters: result.negativeClusters.length,
    });

    return result;
  });

  // =========================================================================
  // 2. synthesizeSkill — Create skill from positive memory cluster
  // =========================================================================

  methods.set('noesis.synthesizeSkill', async (params) => {
    const explicitIds = optionalStringArray(params, 'memory_ids');
    const projectId = optionalString(params, 'project_id') ?? null;
    let memoryIds: string[];

    if (explicitIds && explicitIds.length >= 3) {
      memoryIds = explicitIds;
    } else {
      // Auto-discover: cluster memories and use the largest positive cluster
      const { clusterMemories } = await import('../intelligence/clustering.js');
      const sql = projectId
        ? "SELECT id, type, outcome, embedding, tags FROM memories WHERE status = 'active' AND embedding IS NOT NULL AND (project_id = ? OR project_id IS NULL)"
        : "SELECT id, type, outcome, embedding, tags FROM memories WHERE status = 'active' AND embedding IS NOT NULL";
      const stmt = db.prepare<unknown[], { id: string; type: string; outcome: string | null; embedding: Buffer; tags: string }>(sql);
      const getAllMemories = () => projectId ? stmt.all(projectId) : stmt.all();
      const countStmt = db.prepare<[], { cnt: number }>("SELECT COUNT(*) as cnt FROM memories WHERE status = 'active'");
      const totalCount = countStmt.get()?.cnt ?? 0;
      const clusters = await clusterMemories({ getAllMemories, totalMemoryCount: totalCount });
      const best = clusters.positiveClusters.sort((a, b) => b.length - a.length)[0];
      if (!best || best.length < 3) {
        throw new IntelligenceRpcError(ERROR_INVALID_PARAMS, 'noesis.synthesizeSkill: not enough positive memories to form a cluster (need at least 3 successful memories)');
      }
      memoryIds = best;
    }

    const llm = requireLlm('noesis.synthesizeSkill');
    const { synthesizeSkill } = await import('../intelligence/skill-synthesis.js');
    const { generateId } = await import('../core/ulid.js');

    const memories = memoryIds.map(id => {
      const row = db.prepare<[string], { id: string; type: string; title: string; content: string; tags: string; confidence: number; outcome: string | null }>(
        'SELECT id, type, title, content, tags, confidence, outcome FROM memories WHERE id = ?',
      ).get(id);
      if (!row) throw new IntelligenceRpcError(ERROR_INVALID_PARAMS, `noesis.synthesizeSkill: memory not found: ${id}`);
      return row;
    });

    const skill = await synthesizeSkill({ cluster: memories as never[], llm, generateId });

    audit('noesis.synthesizeSkill', skill.name, { source_count: memoryIds.length });
    return skill;
  });

  // =========================================================================
  // 3. synthesizeAntiPattern — Create anti-pattern from negative cluster
  // =========================================================================

  methods.set('noesis.synthesizeAntiPattern', async (params) => {
    const explicitIds = optionalStringArray(params, 'memory_ids');
    const projectId = optionalString(params, 'project_id') ?? null;
    let memoryIds: string[];

    if (explicitIds && explicitIds.length >= 3) {
      memoryIds = explicitIds;
    } else {
      // Auto-discover: cluster memories and use the largest negative cluster
      const { clusterMemories } = await import('../intelligence/clustering.js');
      const sql = projectId
        ? "SELECT id, type, outcome, embedding, tags FROM memories WHERE status = 'active' AND embedding IS NOT NULL AND (project_id = ? OR project_id IS NULL)"
        : "SELECT id, type, outcome, embedding, tags FROM memories WHERE status = 'active' AND embedding IS NOT NULL";
      const stmt = db.prepare<unknown[], { id: string; type: string; outcome: string | null; embedding: Buffer; tags: string }>(sql);
      const getAllMemories = () => projectId ? stmt.all(projectId) : stmt.all();
      const countStmt = db.prepare<[], { cnt: number }>("SELECT COUNT(*) as cnt FROM memories WHERE status = 'active'");
      const totalCount = countStmt.get()?.cnt ?? 0;
      const clusters = await clusterMemories({ getAllMemories, totalMemoryCount: totalCount });
      const best = clusters.negativeClusters.sort((a, b) => b.length - a.length)[0];
      if (!best || best.length < 3) {
        throw new IntelligenceRpcError(ERROR_INVALID_PARAMS, 'noesis.synthesizeAntiPattern: not enough negative memories to form a cluster (need at least 3 failed memories)');
      }
      memoryIds = best;
    }

    const llm = requireLlm('noesis.synthesizeAntiPattern');
    const { synthesizeAntiPattern } = await import('../intelligence/antipattern-synthesis.js');
    const { generateId } = await import('../core/ulid.js');

    const memories = memoryIds.map(id => {
      const row = db.prepare<[string], { id: string; type: string; title: string; content: string; tags: string; confidence: number; outcome: string | null }>(
        'SELECT id, type, title, content, tags, confidence, outcome FROM memories WHERE id = ?',
      ).get(id);
      if (!row) throw new IntelligenceRpcError(ERROR_INVALID_PARAMS, `noesis.synthesizeAntiPattern: memory not found: ${id}`);
      return row;
    });

    const pattern = await synthesizeAntiPattern({ cluster: memories as never[], llm, generateId });

    audit('noesis.synthesizeAntiPattern', pattern.name, { source_count: memoryIds.length });
    return pattern;
  });

  // =========================================================================
  // 4. distillMemories — Merge similar memories into distilled knowledge
  // =========================================================================

  methods.set('noesis.distillMemories', async (params) => {
    const projectId = optionalString(params, 'project_id') ?? null;
    const minClusterSize = optionalNumber(params, 'min_cluster_size');
    const similarityThreshold = optionalNumber(params, 'similarity_threshold');

    const { runDistillation } = await import('../intelligence/knowledge-distiller.js');

    const sql = projectId
      ? "SELECT id, type, title, content, tags, embedding, confidence FROM memories WHERE status = 'active' AND (project_id = ? OR project_id IS NULL)"
      : "SELECT id, type, title, content, tags, embedding, confidence FROM memories WHERE status = 'active'";
    const stmt = db.prepare<unknown[], { id: string; type: string; title: string; content: string; tags: string; embedding: Buffer | null; confidence: number }>(sql);
    const memories = (projectId ? stmt.all(projectId) : stmt.all()).map(m => ({
      ...m,
      tags: (() => { try { return JSON.parse(m.tags) as string[]; } catch { return [] as string[]; } })(),
    }));

    const result = runDistillation(memories as never[], minClusterSize, similarityThreshold);

    audit('noesis.distillMemories', JSON.stringify(result), {
      candidates_found: result.candidatesFound,
      candidates_distilled: result.candidatesDistilled,
    });

    return result;
  });

  // =========================================================================
  // 5. buildCodebaseMap — Analyze project file structure
  // =========================================================================

  methods.set('noesis.buildCodebaseMap', async (params) => {
    const rootPath = requireString(params, 'root_path', 'noesis.buildCodebaseMap');

    const { buildCodebaseMap, summarizeCodebaseMap } = await import('../intelligence/codebase-map.js');
    const map = buildCodebaseMap(rootPath);
    const summary = summarizeCodebaseMap(map);

    audit('noesis.buildCodebaseMap', rootPath, { file_count: map.files.length });
    return { map, summary };
  });

  // =========================================================================
  // 6. buildWorldModel — Build project world model
  // =========================================================================

  methods.set('noesis.buildWorldModel', async (params) => {
    const projectId = requireString(params, 'project_id', 'noesis.buildWorldModel');
    const packageJsonContent = requireString(params, 'package_json', 'noesis.buildWorldModel');
    const filePaths = optionalStringArray(params, 'file_paths') ?? [];
    const sourceFiles = (params.source_files ?? []) as Array<{ path: string; content: string }>;
    const gitLogLines = optionalStringArray(params, 'git_log_lines') ?? [];
    const period = optionalString(params, 'period') ?? '30d';

    const { buildWorldModel, serializeWorldModel } = await import('../intelligence/world-model.js');

    const model = buildWorldModel({ projectId, packageJsonContent, filePaths, sourceFiles, gitLogLines, period });

    audit('noesis.buildWorldModel', projectId);
    return { model, serialized: serializeWorldModel(model) };
  });

  // =========================================================================
  // 7. getCognitiveProfile — Retrieve user cognitive profile
  // =========================================================================

  methods.set('noesis.getCognitiveProfile', async (params) => {
    const projectId = optionalString(params, 'project_id') ?? null;

    const { createProfile, deserializeProfile } = await import('../intelligence/cognitive-profile.js');

    const sql = projectId
      ? "SELECT content FROM memories WHERE type = 'preference' AND tags LIKE '%cognitive_profile%' AND (project_id = ? OR project_id IS NULL) ORDER BY updated_at DESC LIMIT 1"
      : "SELECT content FROM memories WHERE type = 'preference' AND tags LIKE '%cognitive_profile%' ORDER BY updated_at DESC LIMIT 1";
    const row = projectId
      ? db.prepare<[string], { content: string }>(sql).get(projectId)
      : db.prepare<[], { content: string }>(sql).get();

    if (row) {
      try { return deserializeProfile(row.content); } catch { /* fall through */ }
    }

    return createProfile();
  });

  // =========================================================================
  // 8. updateCognitiveProfile — Update profile from event
  // =========================================================================

  methods.set('noesis.updateCognitiveProfile', async (params) => {
    const eventType = requireString(params, 'event_type', 'noesis.updateCognitiveProfile');
    const eventData = requireObject(params, 'event_data', 'noesis.updateCognitiveProfile');

    const {
      createProfile, deserializeProfile, serializeProfile,
      updateFromCorrection, updateFromTaskCompletion, updateLearningStyle,
      updateWorkPatterns, updatePreference,
    } = await import('../intelligence/cognitive-profile.js');

    const row = db.prepare<[], { content: string }>(
      "SELECT content FROM memories WHERE type = 'preference' AND tags LIKE '%cognitive_profile%' ORDER BY updated_at DESC LIMIT 1",
    ).get();

    let profile = row ? (() => { try { return deserializeProfile(row.content); } catch { return createProfile(); } })() : createProfile();

    switch (eventType) {
      case 'correction':
        profile = updateFromCorrection(profile, eventData as never);
        break;
      case 'task_completion':
        profile = updateFromTaskCompletion(profile, eventData as never);
        break;
      case 'learning_style':
        profile = updateLearningStyle(profile, eventData as never);
        break;
      case 'work_patterns':
        profile = updateWorkPatterns(profile, eventData as never);
        break;
      case 'preference':
        profile = updatePreference(
          profile,
          eventData.category as 'technology' | 'style' | 'workflow',
          eventData.key as string,
          eventData.value as string,
        );
        break;
      default:
        throw new IntelligenceRpcError(ERROR_INVALID_PARAMS, `noesis.updateCognitiveProfile: unknown event_type "${eventType}"`);
    }

    audit('noesis.updateCognitiveProfile', eventType);
    return { profile, serialized: serializeProfile(profile) };
  });

  // =========================================================================
  // 9. selfEvaluate — Run system health evaluation
  // =========================================================================

  methods.set('noesis.selfEvaluate', async (params) => {
    const { evaluate } = await import('../intelligence/self-evaluator.js');

    const result = evaluate({
      helpfulRetrievals: optionalNumber(params, 'helpful_retrievals') ?? 0,
      totalRetrievals: optionalNumber(params, 'total_retrievals') ?? 0,
      repeatFailures: optionalNumber(params, 'repeat_failures') ?? 0,
      totalFailures: optionalNumber(params, 'total_failures') ?? 0,
      skillsApplied: optionalNumber(params, 'skills_applied') ?? 0,
      skillsRetrieved: optionalNumber(params, 'skills_retrieved') ?? 0,
      correctPredictions: optionalNumber(params, 'correct_predictions') ?? 0,
      totalPredictions: optionalNumber(params, 'total_predictions') ?? 0,
      corrections: optionalNumber(params, 'corrections') ?? 0,
      totalTasks: optionalNumber(params, 'total_tasks') ?? 0,
    });

    return result;
  });

  // =========================================================================
  // 10. computeIntelligenceMetrics — Compute intelligence system metrics
  // =========================================================================

  methods.set('noesis.computeIntelligenceMetrics', async (params) => {
    const { computeMetrics } = await import('../intelligence/metrics.js');

    const result = computeMetrics({
      totalRetrievals: optionalNumber(params, 'total_retrievals') ?? 0,
      helpfulRetrievals: optionalNumber(params, 'helpful_retrievals') ?? 0,
      totalGateChecks: optionalNumber(params, 'total_gate_checks') ?? 0,
      gatesPassed: optionalNumber(params, 'gates_passed') ?? 0,
      totalFailures: optionalNumber(params, 'total_failures') ?? 0,
      lessonsCaptured: optionalNumber(params, 'lessons_captured') ?? 0,
      skillsSynthesizedLast30Days: optionalNumber(params, 'skills_synthesized_last_30_days') ?? 0,
      avgTimeCurrentPeriod: optionalNumber(params, 'avg_time_current_period') ?? 0,
      avgTimePreviousPeriod: optionalNumber(params, 'avg_time_previous_period') ?? 0,
    });

    return result;
  });

  // =========================================================================
  // 11. analyzeProgress — Meta-reasoning on task progress
  // =========================================================================

  methods.set('noesis.analyzeProgress', async (params) => {
    const { analyze } = await import('../intelligence/meta-reasoner.js');

    const result = analyze({
      progress: params.progress as never,
      currentStrategyScore: optionalNumber(params, 'current_strategy_score'),
      alternativeStrategyScore: optionalNumber(params, 'alternative_strategy_score'),
      confidenceRecords: params.confidence_records as never,
      resourceUsage: params.resource_usage as never,
      learningMetrics: params.learning_metrics as never,
    });

    return result;
  });

  // =========================================================================
  // 12. simulateStrategy — Simulate task approaches
  // =========================================================================

  methods.set('noesis.simulateStrategy', async (params) => {
    const task = requireString(params, 'task', 'noesis.simulateStrategy');
    const constraints = optionalStringArray(params, 'constraints') ?? [];

    const { generateStrategies, evaluateStrategies } = await import('../intelligence/strategy-simulator.js');

    const input = {
      task,
      constraints,
      skills: (params.skills ?? []) as never[],
      antiPatterns: (params.anti_patterns ?? []) as never[],
      pastTasks: (params.past_tasks ?? []) as never[],
    };

    const strategies = generateStrategies(input);
    const result = evaluateStrategies(strategies);

    return result;
  });

  // =========================================================================
  // 13. planTask — Decompose task into subtasks
  // =========================================================================

  methods.set('noesis.planTask', async (params) => {
    const task = requireString(params, 'task', 'noesis.planTask');

    const { decompose } = await import('../intelligence/task-planner.js');
    const plan = decompose(task);

    return plan;
  });

  // =========================================================================
  // 14. routeModel — Select model tier for operation
  // =========================================================================

  methods.set('noesis.routeModel', async (params) => {
    const operation = requireString(params, 'operation', 'noesis.routeModel');

    const { routeOperation } = await import('../intelligence/model-router.js');
    const decision = routeOperation(operation as never);

    return decision;
  });

  // =========================================================================
  // 15. detectFriction — Analyze session for friction signals
  // =========================================================================

  methods.set('noesis.detectFriction', async (params) => {
    const { analyzeSession } = await import('../intelligence/friction-detector.js');

    const activity = {
      corrections: optionalNumber(params, 'corrections') ?? 0,
      queries: optionalStringArray(params, 'queries') ?? [],
      errors: optionalStringArray(params, 'errors') ?? [],
      taskStarted: optionalBoolean(params, 'task_started') ?? false,
      taskCompleted: optionalBoolean(params, 'task_completed') ?? false,
      lastInteractionAt: optionalString(params, 'last_interaction_at') ?? new Date().toISOString(),
      startedAt: optionalString(params, 'started_at') ?? new Date().toISOString(),
    };

    const analysis = analyzeSession(activity);
    return analysis;
  });

  // =========================================================================
  // 16. distillTrace — Learn from model execution traces
  // =========================================================================

  methods.set('noesis.distillTrace', async (params) => {
    const traceData = requireObject(params, 'trace', 'noesis.distillTrace');

    const { distillTrace } = await import('../intelligence/frontier-distillation.js');
    const result = distillTrace(traceData as never);

    audit('noesis.distillTrace', JSON.stringify(result.assets.length), { assets_generated: result.assets.length });
    return result;
  });

  // =========================================================================
  // 17. synthesizeExperience — Fill knowledge gaps
  // =========================================================================

  methods.set('noesis.synthesizeExperience', async (params) => {
    const densityEntries = (params.density_entries ?? []) as never[];
    const knownPatterns = optionalStringArray(params, 'known_patterns') ?? [];
    const maxGaps = optionalNumber(params, 'max_gaps');

    const { synthesize } = await import('../intelligence/experience-synthesizer.js');
    const result = synthesize(densityEntries, knownPatterns, maxGaps);

    return result;
  });

  // =========================================================================
  // 18. selectCompute — Select compute strategy for task
  // =========================================================================

  methods.set('noesis.selectCompute', async (params) => {
    const complexity = optionalNumber(params, 'complexity') ?? 0.5;
    const uncertainty = optionalNumber(params, 'uncertainty') ?? 0.5;
    const hasVerification = optionalBoolean(params, 'has_verification') ?? false;

    const { selectComputeStrategy } = await import('../intelligence/test-time-compute.js');
    const result = selectComputeStrategy(complexity, uncertainty, hasVerification);

    return result;
  });

  // =========================================================================
  // 19. checkVerification — Determine verification requirements
  // =========================================================================

  methods.set('noesis.checkVerification', async (params) => {
    const { determineVerificationRequirements } = await import('../intelligence/verification-separation.js');

    const proposal = {
      proposerModel: optionalString(params, 'proposer_model') ?? 'unknown',
      criticality: (optionalString(params, 'criticality') ?? 'medium') as never,
      language: optionalString(params, 'language'),
      filePaths: optionalStringArray(params, 'file_paths') ?? [],
      content: optionalString(params, 'content') ?? '',
    };

    const requirements = determineVerificationRequirements(proposal as never);
    return requirements;
  });

  // =========================================================================
  // 20. updateConfidence — Bayesian confidence tracking for skills/anti-patterns
  // =========================================================================

  methods.set('noesis.updateConfidence', async (params) => {
    const successes = params.successes as number ?? 0;
    const failures = params.failures as number ?? 0;
    const confidence = params.confidence as number ?? 0;
    const outcome = requireString(params, 'outcome', 'noesis.updateConfidence') as 'success' | 'partial' | 'failure';

    const { updateConfidence, shouldArchive, applyMonthlyDecay } = await import('../intelligence/feedback.js');

    const updated = updateConfidence({
      current: { successes, failures, confidence },
      outcome,
    });

    const archive = shouldArchive(updated.confidence, updated.successes + updated.failures);
    const lastUsedAt = optionalString(params, 'last_used_at') ?? null;
    const decayedConfidence = applyMonthlyDecay({
      confidence: updated.confidence,
      lastUsedAt,
    });

    return {
      ...updated,
      decayedConfidence,
      shouldArchive: archive,
    };
  });

  // =========================================================================
  // 21. runBenchmark — Benchmark comparison (Noesis-on vs Noesis-off)
  // =========================================================================

  methods.set('noesis.runBenchmark', async (params) => {
    const action = requireString(params, 'action', 'noesis.runBenchmark');

    const mod = await import('../intelligence/benchmark.js');

    switch (action) {
      case 'create_task': {
        const id = requireString(params, 'id', 'noesis.runBenchmark');
        const taskClass = requireString(params, 'task_class', 'noesis.runBenchmark') as import('../intelligence/benchmark.js').TaskClass;
        const description = requireString(params, 'description', 'noesis.runBenchmark');
        return mod.createBenchmarkTask(id, taskClass, description, {
          expected_artifacts: optionalStringArray(params, 'expected_artifacts'),
          verification_criteria: optionalStringArray(params, 'verification_criteria'),
          difficulty: optionalString(params, 'difficulty') as 'easy' | 'medium' | 'hard' | undefined,
        });
      }
      case 'record_run': {
        const taskId = requireString(params, 'task_id', 'noesis.runBenchmark');
        const noesisEnabled = params.noesis_enabled === true;
        const modelTier = requireString(params, 'model_tier', 'noesis.runBenchmark');
        const metrics = params.metrics as import('../intelligence/benchmark.js').BenchmarkMetrics;
        if (!metrics) {
          throw new IntelligenceRpcError(ERROR_INVALID_PARAMS, 'noesis.runBenchmark: missing metrics');
        }
        return mod.createBenchmarkRun(taskId, noesisEnabled, modelTier, metrics);
      }
      case 'compare': {
        const runs = params.runs as import('../intelligence/benchmark.js').BenchmarkRun[];
        const taskClass = requireString(params, 'task_class', 'noesis.runBenchmark') as import('../intelligence/benchmark.js').TaskClass;
        const modelTier = requireString(params, 'model_tier', 'noesis.runBenchmark');
        return mod.comparePerformance(runs ?? [], taskClass, modelTier);
      }
      case 'report': {
        const comparisons = params.comparisons as import('../intelligence/benchmark.js').BenchmarkComparison[];
        return { report: mod.generateBenchmarkReport(comparisons ?? []) };
      }
      default:
        throw new IntelligenceRpcError(ERROR_INVALID_PARAMS, `noesis.runBenchmark: unknown action "${action}"`);
    }
  });
}
