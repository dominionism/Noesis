/**
 * Cognitive RPC Method Registration
 *
 * Registers all cognitive architecture RPC methods onto the shared
 * method registry. Separated from rpc.ts to keep the core handler
 * manageable and cognitive concerns isolated.
 *
 * 26 methods covering: orchestration, rules, experts, capsules, skills,
 * contexts, gates, learning, execution, sessions, handoffs, decisions,
 * verification, and critic.
 *
 * Security:
 * - A01: Each method validates required params; project scoping enforced.
 * - A03: All DB access via parameterized queries in underlying modules.
 * - A04: Method whitelist only; no arbitrary invocation.
 * - A09: No sensitive data in responses; only identifiers and scores.
 */

import { createHash } from 'node:crypto';
import type { DatabaseConnection } from '../core/database.js';
import type { EmbeddingProvider, Memory, PromptShape, HandoffInput, SecretMatch } from '../types.js';
import type {
  SignFn,
  MemorySignFn,
  RuleDefinition,
  RuleCategory,
  ComplianceContext,
  ReasoningPhase,
  ContextType,
  ExpertCategory,
  ExpertMatch,
  SkillMatch,
  AssembledCapsule,
  ExecutionState,
  PromptAssembly,
} from '../cognitive/types.js';

import { eventBus } from './events.js';

/** SHA-256 content hash for audit entries. */
function auditHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MethodHandler = (params: Record<string, unknown>) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Param validation helpers
// ---------------------------------------------------------------------------

/**
 * RPC error with a JSON-RPC 2.0 error code.
 * Must have a `code` property so the main rpc.ts handler can detect it.
 */
class CognitiveRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const ERROR_INVALID_PARAMS = -32602;

function requireString(
  params: Record<string, unknown>,
  key: string,
  methodName: string,
): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new CognitiveRpcError(
      ERROR_INVALID_PARAMS,
      `${methodName}: missing or invalid required parameter "${key}"`,
    );
  }
  return value;
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  return value;
}

function optionalNumber(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number') return undefined;
  return value;
}

function optionalStringArray(params: Record<string, unknown>, key: string): string[] | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string');
}

function optionalBoolean(params: Record<string, unknown>, key: string): boolean | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') return undefined;
  return value;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface CognitiveRpcDependencies {
  db: DatabaseConnection;
  sign: SignFn;
  signMemory: MemorySignFn;
  embeddingProvider: EmbeddingProvider;
  verifySignature: (memory: Memory) => { valid: boolean; tampered: boolean };
  scanSecrets: (text: string) => { clean: string; redacted: boolean; matches: SecretMatch[] };
  writeAuditLog: (entry: Omit<import('../types.js').AuditEntry, 'timestamp'>) => void;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all cognitive architecture RPC methods onto the method map.
 *
 * Dynamic imports are used so that the cognitive subsystem modules are
 * only loaded when a cognitive RPC method is first called. This keeps
 * the base RPC handler fast for non-cognitive requests.
 */
export function registerCognitiveMethods(
  methods: Map<string, MethodHandler>,
  deps: CognitiveRpcDependencies,
): void {
  const { db, sign, signMemory, embeddingProvider, verifySignature, scanSecrets, writeAuditLog } = deps;

  // =========================================================================
  // 1. orchestrate — Full cognitive orchestration
  // =========================================================================

  methods.set('noesis.orchestrate', async (params) => {
    const request = requireString(params, 'request', 'noesis.orchestrate');
    const projectId = optionalString(params, 'project_id') ?? null;
    const tokenBudget = optionalNumber(params, 'token_budget') ?? 8000;

    const { orchestratePrompt } = await import('../cognitive/prompt/prompt-engine.js');
    const { hybridRetrieve } = await import('../retrieval/hybrid.js');

    const promptShape: PromptShape = {
      goal: request,
      context: '',
      constraints: [],
      deliverable: '',
      validation: [],
    };

    // Retrieve relevant memories for the task
    let memories: Memory[] = [];
    try {
      const result = await hybridRetrieve({
        db,
        embeddingProvider,
        recallParams: { query: request, project_id: projectId ?? undefined, limit: 10 },
        verifySignature,
        scanSecrets,
      });
      memories = result.memories;
    } catch {
      // Non-fatal: proceed without memories
    }

    const assembly: PromptAssembly = orchestratePrompt(
      db, promptShape, projectId, memories,
      { sign, tokenBudget },
    );

    return assembly;
  });

  // =========================================================================
  // 2. checkCompliance — Rule compliance check
  // =========================================================================

  methods.set('noesis.checkCompliance', async (params) => {
    const taskContext = requireString(params, 'task_context', 'noesis.checkCompliance');
    const projectId = optionalString(params, 'project_id');

    const { listRules } = await import('../cognitive/rules/rule-store.js');
    const { checkCompliance } = await import('../cognitive/rules/rule-compliance.js');

    const rules: RuleDefinition[] = listRules(db, { enabled: true });

    const context: ComplianceContext = {
      phase: (optionalString(params, 'phase') as ReasoningPhase) ?? 'execute',
      hasReadiness: params['has_readiness'] === true,
      hasResearch: params['has_research'] === true,
      hasPlan: params['has_plan'] === true,
      hasVerification: params['has_verification'] === true,
      isSubstantial: params['is_substantial'] === true,
      isCreative: params['is_creative'] === true,
      isApiWork: params['is_api_work'] === true,
      searchCompleted: params['search_completed'] === true,
      decisionsHonored: params['decisions_honored'] !== false,
    };

    const results = checkCompliance(rules, context);

    // Emit events for matched/violated rules
    for (const r of results) {
      eventBus.emit({
        type: 'rule_matched',
        payload: {
          rule_id: r.rule_id,
          rule_name: r.rule_name,
          task_id: taskContext.slice(0, 64),
          matched_triggers: r.violations.length + r.warnings.length,
        },
      });

      if (!r.compliant) {
        eventBus.emit({
          type: 'rule_violated',
          payload: {
            rule_id: r.rule_id,
            rule_name: r.rule_name,
            violation_count: r.violations.length,
            blocking: r.violations.some(v => v.severity === 'blocking'),
          },
        });
      }
    }

    return {
      results,
      project_id: projectId ?? null,
    };
  });

  // =========================================================================
  // 3. routeExpertCognitive — Expert routing with memory
  // =========================================================================

  methods.set('noesis.routeExpertCognitive', async (params) => {
    const task = requireString(params, 'task', 'noesis.routeExpertCognitive');
    const keywords = optionalStringArray(params, 'keywords') ?? [];
    const preferCategory = optionalString(params, 'prefer_category');

    const { routeToExpert } = await import('../cognitive/experts/expert-router.js');

    const matches: ExpertMatch[] = routeToExpert(
      db, task, keywords, null,
      preferCategory ? { preferCategory: preferCategory as ExpertCategory } : undefined,
    );

    // Emit routing event for top match
    if (matches.length > 0) {
      eventBus.emit({
        type: 'expert_routed',
        payload: {
          expert_id: matches[0].expert.id,
          expert_name: matches[0].expert.name,
          task_id: task.slice(0, 64),
          score: matches[0].score,
        },
      });
    }

    return { matches };
  });

  // =========================================================================
  // 4. matchCapsuleDeep — Match and assemble deep capsule
  // =========================================================================

  methods.set('noesis.matchCapsuleDeep', async (params) => {
    const goal = requireString(params, 'goal', 'noesis.matchCapsuleDeep');
    const context = optionalString(params, 'context') ?? '';

    const { matchCapsule } = await import('../cognitive/capsules/capsule-engine.js');
    const { assembleCapsule } = await import('../cognitive/capsules/capsule-assembly.js');

    const promptShape: PromptShape = {
      goal,
      context,
      constraints: optionalStringArray(params, 'constraints') ?? [],
      deliverable: optionalString(params, 'deliverable') ?? '',
      validation: optionalStringArray(params, 'validation') ?? [],
    };

    const capsuleMatches = matchCapsule(db, goal, [], null);

    if (capsuleMatches.length === 0) {
      return { capsule: null };
    }

    const top = capsuleMatches[0];

    eventBus.emit({
      type: 'capsule_matched',
      payload: {
        capsule_id: top.capsule.id,
        capsule_name: top.capsule.name,
        task_id: goal.slice(0, 64),
        score: top.score,
      },
    });

    const assembled: AssembledCapsule = assembleCapsule(db, top.capsule, [], []);

    eventBus.emit({
      type: 'capsule_assembled',
      payload: {
        capsule_id: top.capsule.id,
        capsule_name: top.capsule.name,
        component_count: Object.keys(assembled.components).length,
        enrichment_count:
          assembled.enrichments.memory_examples.length +
          assembled.enrichments.synthesized_anti_patterns.length +
          assembled.enrichments.past_critic_findings.length +
          assembled.enrichments.user_preferences.length,
      },
    });

    return { capsule: assembled };
  });

  // =========================================================================
  // 5. matchSkills — Find relevant skills
  // =========================================================================

  methods.set('noesis.matchSkills', async (params) => {
    const task = requireString(params, 'task', 'noesis.matchSkills');
    const category = optionalString(params, 'category');
    const max = optionalNumber(params, 'max') ?? 5;

    const { matchSkills } = await import('../cognitive/skills/skill-matcher.js');

    const matches: SkillMatch[] = matchSkills(db, task, [], null, { maxResults: max });

    for (const m of matches) {
      eventBus.emit({
        type: 'skill_invoked',
        payload: {
          skill_id: m.skill.id,
          skill_name: m.skill.name,
          task_id: task.slice(0, 64),
        },
      });
    }

    return {
      matches: category
        ? matches.filter(m => m.skill.category === category)
        : matches,
    };
  });

  // =========================================================================
  // 6. getContexts — Get context files
  // =========================================================================

  methods.set('noesis.getContexts', async (params) => {
    const projectId = optionalString(params, 'project_id') ?? null;
    const types = optionalStringArray(params, 'types');
    const useEconomist = params.use_economist === true;
    const tokenBudget = typeof params.token_budget === 'number' ? params.token_budget : 50000;

    if (useEconomist) {
      // Value-based allocation via context-economist
      const { assembleContextsWithEconomist } = await import('../cognitive/context/context-engine.js');
      const result = assembleContextsWithEconomist(db, projectId, tokenBudget);
      if (types && types.length > 0) {
        const typeSet = new Set(types);
        result.contexts = result.contexts.filter(c => typeSet.has(c.context_type));
      }
      return result;
    }

    const { listContexts } = await import('../cognitive/context/context-store.js');

    let contexts = listContexts(db, projectId);

    if (types && types.length > 0) {
      const typeSet = new Set(types);
      contexts = contexts.filter(c => typeSet.has(c.context_type));
    }

    return { contexts };
  });

  // =========================================================================
  // 7. updateContext — Update context file
  // =========================================================================

  methods.set('noesis.updateContext', async (params) => {
    const contextType = requireString(params, 'type', 'noesis.updateContext') as ContextType;
    const content = requireString(params, 'content', 'noesis.updateContext');
    const projectId = optionalString(params, 'project_id') ?? null;

    const { upsertContext } = await import('../cognitive/context/context-store.js');

    const entry = upsertContext(db, { context_type: contextType, project_id: projectId, content }, sign);

    eventBus.emit({
      type: 'context_updated',
      payload: {
        context_type: contextType,
        project_id: projectId,
        version: entry.version,
      },
    });

    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(content),
      source: 'system',
      details: { method: 'noesis.updateContext', context_type: contextType, project_id: projectId, version: entry.version },
    });

    return { id: entry.id, version: entry.version };
  });

  // =========================================================================
  // 8. checkReadinessEvidence — Evidence-backed readiness scoring
  // =========================================================================

  methods.set('noesis.checkReadinessEvidence', async (params) => {
    const task = requireString(params, 'task', 'noesis.checkReadinessEvidence');

    const { computeEvidenceBackedReadiness, getHistoricalReadinessCorrelation } =
      await import('../cognitive/gates/readiness-gate.js');

    const input = {
      taskDescription: task,
      hasGoal: params['has_goal'] === true,
      hasDeliverable: params['has_deliverable'] === true,
      constraintsIdentified: optionalNumber(params, 'constraints_identified') ?? 0,
      codebaseExplored: params['codebase_explored'] === true,
      architectureUnderstood: params['architecture_understood'] === true,
      risksIdentified: optionalNumber(params, 'risks_identified') ?? 0,
      hasVerificationPlan: params['has_verification_plan'] === true,
      validationCriteria: optionalNumber(params, 'validation_criteria') ?? 0,
    };

    const evidence = {
      similarPastTasks: [] as Memory[],
      pastReadinessOutcomes: [] as { score: number; outcome: 'success' | 'failure' | 'partial' }[],
      relevantFailures: [] as Memory[],
      relevantAntiPatternCount: 0,
    };

    // Try to enrich with historical data
    try {
      const projectId = optionalString(params, 'project_id');
      const correlation = getHistoricalReadinessCorrelation(db, projectId);
      if (correlation.correlation > 0) {
        evidence.pastReadinessOutcomes = [
          { score: correlation.averagePassedScore, outcome: 'success' },
          { score: correlation.averageFailedScore, outcome: 'failure' },
        ];
      }
    } catch {
      // Non-fatal
    }

    const score = computeEvidenceBackedReadiness(input, evidence);

    eventBus.emit({
      type: 'quality_gate_checked',
      payload: {
        gate_type: 'readiness',
        passed: score.passed,
        score: score.total,
      },
    });

    return score;
  });

  // =========================================================================
  // 9. checkQualityGate — Creative/API quality gate
  // =========================================================================

  methods.set('noesis.checkQualityGate', async (params) => {
    const gateType = requireString(params, 'type', 'noesis.checkQualityGate');

    const { checkCreativeGate, checkApiGate } = await import('../cognitive/gates/output-quality-gate.js');

    let result;
    if (gateType === 'creative') {
      result = checkCreativeGate({
        objective: optionalString(params, 'objective'),
        audience: optionalString(params, 'audience'),
        visual_direction: optionalString(params, 'visual_direction'),
        references: optionalStringArray(params, 'references'),
        banned_patterns: optionalStringArray(params, 'banned_patterns'),
        success_criteria: optionalStringArray(params, 'success_criteria'),
      });
    } else if (gateType === 'api') {
      result = checkApiGate({
        contract_target: optionalString(params, 'contract_target'),
        reference_examples: optionalStringArray(params, 'reference_examples'),
        edge_cases: optionalStringArray(params, 'edge_cases'),
        verification_plan: optionalString(params, 'verification_plan'),
      });
    } else {
      throw new CognitiveRpcError(ERROR_INVALID_PARAMS, `Unknown gate type: ${gateType}`);
    }

    eventBus.emit({
      type: 'quality_gate_checked',
      payload: {
        gate_type: gateType,
        passed: result.passed,
        score: result.missing.length === 0 ? 100 : Math.max(0, 100 - result.missing.length * 20),
      },
    });

    return result;
  });

  // =========================================================================
  // 10. getEffectivenessMetrics — Gate effectiveness metrics
  // =========================================================================

  methods.set('noesis.getEffectivenessMetrics', async (params) => {
    type EffectivenessGate = 'readiness' | 'output_quality' | 'verification';
    const isEffectivenessGate = (value: string): value is EffectivenessGate =>
      value === 'readiness' || value === 'output_quality' || value === 'verification';

    const requestedGate = optionalString(params, 'gate_type');

    if (requestedGate && !isEffectivenessGate(requestedGate)) {
      throw new CognitiveRpcError(
        ERROR_INVALID_PARAMS,
        `noesis.getEffectivenessMetrics: unsupported gate_type "${requestedGate}"`,
      );
    }

    const {
      getEffectivenessMetrics,
      getCrossSubsystemEffectiveness,
      suggestAdjustment,
    } = await import('../cognitive/learning/effectiveness-tracker.js');

    if (requestedGate) {
      const gateType = requestedGate as EffectivenessGate;
      const metrics = getEffectivenessMetrics(db, gateType);
      return {
        gate_type: gateType,
        metrics,
        suggestion: suggestAdjustment(metrics),
      };
    }

    const summary = getCrossSubsystemEffectiveness(db);
    return {
      gates: {
        readiness: {
          metrics: summary.readiness,
          suggestion: suggestAdjustment(summary.readiness),
        },
        output_quality: {
          metrics: summary.output_quality,
          suggestion: suggestAdjustment(summary.output_quality),
        },
        verification: {
          metrics: summary.verification,
          suggestion: suggestAdjustment(summary.verification),
        },
      },
      overall: summary.overall,
    };
  });

  // =========================================================================
  // 11. predictFailures — Predictive failure detection
  // =========================================================================

  methods.set('noesis.predictFailures', async (params) => {
    const task = requireString(params, 'task', 'noesis.predictFailures');

    const { predictFailureModes, getPreventiveGuidance } =
      await import('../cognitive/learning/predictive-failure.js');

    const result = predictFailureModes(db, task);

    eventBus.emit({
      type: 'prediction_generated',
      payload: {
        task_id: task.slice(0, 64),
        prediction_count: result.predictions.length,
        highest_risk: result.predictions.length > 0
          ? Math.max(...result.predictions.map(p => p.likelihood))
          : 0,
      },
    });

    return {
      predictions: result.predictions,
      guidance: getPreventiveGuidance(result.predictions),
    };
  });

  // =========================================================================
  // 12. processLearning — Multi-target learning writeback
  // =========================================================================

  methods.set('noesis.processLearning', async (params) => {
    const trigger = requireString(params, 'trigger', 'noesis.processLearning');
    const description = requireString(params, 'description', 'noesis.processLearning');
    const rootCause = requireString(params, 'root_cause', 'noesis.processLearning');
    const preventionRule = requireString(params, 'prevention_rule', 'noesis.processLearning');
    const failureClass = requireString(params, 'failure_class', 'noesis.processLearning');
    const phase = requireString(params, 'phase', 'noesis.processLearning') as ReasoningPhase;

    const { processLearningEvent } = await import('../cognitive/learning/active-learning.js');

    const result = processLearningEvent(db, {
      trigger: trigger as 'user_correction' | 'eval_failure',
      description,
      rootCause: rootCause,
      preventionRule: preventionRule,
      failureClass: failureClass as never,
      phase,
      expertId: optionalString(params, 'expert_id'),
      capsuleId: optionalString(params, 'capsule_id'),
      skillIds: optionalStringArray(params, 'skill_ids'),
      ruleIds: optionalStringArray(params, 'rule_ids'),
      memoryIds: optionalStringArray(params, 'memory_ids'),
      projectId: optionalString(params, 'project_id') ?? null,
      dryRun: optionalBoolean(params, 'dry_run') ?? false,
    }, sign);

    eventBus.emit({
      type: 'learning_writeback',
      payload: {
        target_type: result.ruleAction,
        target_id: failureClass,
        modification_type: result.ruleAction,
        trigger,
      },
    });

    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(description),
      source: 'system',
      details: { method: 'noesis.processLearning', trigger, failureClass, phase, ruleAction: result.ruleAction },
    });

    return result;
  });

  // =========================================================================
  // 13. createGsdProject — Create GSD execution project
  // =========================================================================

  methods.set('noesis.createGsdProject', async (params) => {
    const projectId = requireString(params, 'project_id', 'noesis.createGsdProject');
    const description = requireString(params, 'description', 'noesis.createGsdProject');
    const planId = optionalString(params, 'plan_id') ?? null;

    const { createExecution } = await import('../cognitive/execution/gsd-engine.js');

    const state: ExecutionState = createExecution(db, {
      project_id: projectId,
      milestone: optionalString(params, 'milestone') ?? description,
      plan_id: planId,
    });

    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(projectId + description),
      source: 'system',
      details: {
        method: 'noesis.createGsdProject',
        project_id: projectId,
        execution_id: state.id,
        plan_id: planId,
      },
    });

    return state;
  });

  // =========================================================================
  // 14. executeGsdPhase — Execute GSD phase transition
  // =========================================================================

  methods.set('noesis.executeGsdPhase', async (params) => {
    const projectId = requireString(params, 'project_id', 'noesis.executeGsdPhase');
    const phase = requireString(params, 'phase', 'noesis.executeGsdPhase');

    const { getCurrentExecution, transitionStatus } =
      await import('../cognitive/execution/gsd-engine.js');

    const current = getCurrentExecution(db, projectId);
    if (!current) {
      throw new CognitiveRpcError(ERROR_INVALID_PARAMS, `No active execution for project: ${projectId}`);
    }

    const statusMap: Record<string, 'researching' | 'planning' | 'checking' | 'executing' | 'verifying' | 'completed'> = {
      research: 'researching',
      plan: 'planning',
      check: 'checking',
      execute: 'executing',
      verify: 'verifying',
      complete: 'completed',
    };

    const targetStatus = statusMap[phase];
    if (!targetStatus) {
      throw new CognitiveRpcError(ERROR_INVALID_PARAMS, `Unknown phase: ${phase}`);
    }

    const updated = transitionStatus(db, current.id, targetStatus);

    eventBus.emit({
      type: 'workflow_state_changed',
      payload: {
        workflow_id: current.id,
        from_phase: current.status,
        to_phase: targetStatus,
      },
    });

    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(projectId + targetStatus),
      source: 'system',
      details: { method: 'noesis.executeGsdPhase', project_id: projectId, from: current.status, to: targetStatus },
    });

    return updated;
  });

  // =========================================================================
  // 15. getGsdState — Get execution state
  // =========================================================================

  methods.set('noesis.getGsdState', async (params) => {
    const projectId = requireString(params, 'project_id', 'noesis.getGsdState');

    const { getCurrentExecution, getProjectProgress } =
      await import('../cognitive/execution/gsd-engine.js');

    const current = getCurrentExecution(db, projectId);
    const progress = getProjectProgress(db, projectId);

    return { execution: current, progress };
  });

  // =========================================================================
  // 16. startSessionCognitive — Start session with cognitive context
  // =========================================================================

  methods.set('noesis.startSessionCognitive', async (params) => {
    const projectId = requireString(params, 'project_id', 'noesis.startSessionCognitive');
    const agent = optionalString(params, 'agent') ?? 'unknown';

    const { startSession, getSession } =
      await import('../cognitive/continuity/session-manager.js');

    const state = startSession(db, projectId, agent, sign);

    eventBus.emit({
      type: 'session_started',
      payload: {
        session_id: projectId,
        project_id: projectId,
        agent,
      },
    });

    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(projectId + agent),
      source: 'system',
      details: { method: 'noesis.startSessionCognitive', project_id: projectId, agent },
    });

    return { session: state, agent };
  });

  // =========================================================================
  // 17. createHandoff — Create rich handoff
  // =========================================================================

  methods.set('noesis.createHandoff', async (params) => {
    const sourceAgent = requireString(params, 'source_agent', 'noesis.createHandoff');
    const targetAgent = requireString(params, 'target_agent', 'noesis.createHandoff');
    const reason = requireString(params, 'reason', 'noesis.createHandoff');
    const stateSummary = requireString(params, 'state_summary', 'noesis.createHandoff');
    const projectId = optionalString(params, 'project_id') ?? null;
    const priority = optionalString(params, 'priority') as 'immediate' | 'normal' | undefined;
    const memoryRefs = optionalStringArray(params, 'memory_refs');

    const { createHandoff } = await import('../cognitive/continuity/handoff-manager.js');

    const input: HandoffInput = {
      source_agent: sourceAgent,
      target_agent: targetAgent,
      reason: reason as HandoffInput['reason'],
      state_summary: stateSummary,
      priority: priority ?? 'normal',
      memory_refs: memoryRefs ?? [],
    };

    const handoff = await createHandoff(db, input, projectId, signMemory, embeddingProvider);

    eventBus.emit({
      type: 'handoff_created',
      payload: {
        handoff_id: handoff.id,
        source_agent: sourceAgent,
        target_agent: targetAgent,
        reason,
      },
    });

    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(sourceAgent + targetAgent + reason),
      source: 'system',
      details: { method: 'noesis.createHandoff', handoff_id: handoff.id, source_agent: sourceAgent, target_agent: targetAgent },
    });

    return handoff;
  });

  // =========================================================================
  // 18. resumeHandoff — Resume from handoff with context
  // =========================================================================

  methods.set('noesis.resumeHandoff', async (params) => {
    const handoffId = requireString(params, 'handoff_id', 'noesis.resumeHandoff');

    const { resumeFromHandoff, getHandoffMemories, formatHandoffResumption } =
      await import('../cognitive/continuity/handoff-manager.js');

    const handoff = resumeFromHandoff(db, handoffId);
    if (!handoff) {
      throw new CognitiveRpcError(ERROR_INVALID_PARAMS, `Handoff not found: ${handoffId}`);
    }

    const memories = getHandoffMemories(db, handoff);
    const resumption = formatHandoffResumption(handoff, memories);

    return { handoff, memories, resumption };
  });

  // =========================================================================
  // 19. listHandoffs — List persisted handoffs
  // =========================================================================

  methods.set('noesis.listHandoffs', async (params) => {
    const projectId = optionalString(params, 'project_id') ?? null;
    const limit = optionalNumber(params, 'limit');

    const { listHandoffs } = await import('../cognitive/continuity/handoff-manager.js');

    return {
      handoffs: listHandoffs(db, projectId, limit),
    };
  });

  // =========================================================================
  // 20. checkDecisionFidelity — Decision fidelity check
  // =========================================================================

  methods.set('noesis.checkDecisionFidelity', async (params) => {
    const action = requireString(params, 'action', 'noesis.checkDecisionFidelity');
    const projectId = requireString(params, 'project_id', 'noesis.checkDecisionFidelity');

    const { checkDecisionFidelity } = await import('../cognitive/continuity/decision-fidelity.js');

    const result = checkDecisionFidelity(db, projectId, action);

    return result;
  });

  // =========================================================================
  // 21. listRules — List rules
  // =========================================================================

  methods.set('noesis.listRules', async (params) => {
    const category = optionalString(params, 'category') as RuleCategory | undefined;
    const enabled = optionalBoolean(params, 'enabled');

    const { listRules } = await import('../cognitive/rules/rule-store.js');

    const filters: { category?: RuleCategory; enabled?: boolean } = {};
    if (category) filters.category = category;
    if (enabled !== undefined) filters.enabled = enabled;

    return { rules: listRules(db, filters) };
  });

  // =========================================================================
  // 22. listExperts — List experts
  // =========================================================================

  methods.set('noesis.listExperts', async (params) => {
    const category = optionalString(params, 'category') as ExpertCategory | undefined;
    const enabled = optionalBoolean(params, 'enabled');

    const { listExperts } = await import('../cognitive/experts/expert-store.js');

    const filters: { category?: ExpertCategory; enabled?: boolean } = {};
    if (category) filters.category = category;
    if (enabled !== undefined) filters.enabled = enabled;

    return { experts: listExperts(db, filters) };
  });

  // =========================================================================
  // 23. listCapsules — List deep capsules
  // =========================================================================

  methods.set('noesis.listCapsules', async (params) => {
    const enabled = optionalBoolean(params, 'enabled');

    const { listCapsules } = await import('../cognitive/capsules/capsule-store.js');

    const filters: { enabled?: boolean } = {};
    if (enabled !== undefined) filters.enabled = enabled;

    return { capsules: listCapsules(db, filters) };
  });

  // =========================================================================
  // 24. detectVerification — Detect verification capabilities
  // =========================================================================

  methods.set('noesis.detectVerification', async (params) => {
    const projectRoot = requireString(params, 'project_root', 'noesis.detectVerification');

    const { detectVerificationCapabilities, createVerificationPlan } =
      await import('../cognitive/gates/verification-gate.js');

    const capabilities = detectVerificationCapabilities(projectRoot);
    const plan = createVerificationPlan(capabilities);

    return { capabilities, plan };
  });

  // =========================================================================
  // 25. critiqueResearch / critiquePlan — Enhanced critic
  // =========================================================================

  methods.set('noesis.critiqueResearch', async (params) => {
    const work = requireString(params, 'work', 'noesis.critiqueResearch');

    const maxIterations = optionalNumber(params, 'max_iterations') ?? 1;
    const { critiqueResearch, iterateCritique } = await import('../workflow/enhanced-critic.js');

    const input: import('../workflow/enhanced-critic.js').EnhancedCriticInput = {
      work,
      type: 'research',
      antiPatterns: [],
      memories: [],
    };

    let result = critiqueResearch(input);
    while (result.revisionNeeded && result.iterationCount < maxIterations) {
      result = iterateCritique(input, result, maxIterations);
    }

    return result;
  });

  methods.set('noesis.critiquePlan', async (params) => {
    const work = requireString(params, 'work', 'noesis.critiquePlan');

    const maxIterations = optionalNumber(params, 'max_iterations') ?? 1;
    const { critiquePlan, iterateCritique } = await import('../workflow/enhanced-critic.js');

    const input: import('../workflow/enhanced-critic.js').EnhancedCriticInput = {
      work,
      type: 'plan',
      antiPatterns: [],
      memories: [],
    };

    let result = critiquePlan(input);
    while (result.revisionNeeded && result.iterationCount < maxIterations) {
      result = iterateCritique(input, result, maxIterations);
    }

    return result;
  });

  // =========================================================================
  // 26. learn — Run basic pattern detection on recent memories
  // =========================================================================

  methods.set('noesis.learn', async (params) => {
    const projectId = optionalString(params, 'project_id') ?? null;

    // Query recent memories to analyze
    const { listMemories } = await import('../core/memory-crud.js');

    const memories = listMemories(db, {
      project_id: projectId ?? undefined,
      limit: 200,
    });

    if (memories.length < 3) {
      return {
        status: 'no_data',
        message: 'Not enough memories for pattern detection',
        memories_analyzed: memories.length,
        clusters_found: 0,
        patterns_detected: 0,
        skills_synthesized: 0,
      };
    }

    // Run pattern detection: group memories by type and tags
    const typeClusters = new Map<string, number>();
    const tagFrequency = new Map<string, number>();

    for (const mem of memories) {
      // Cluster by type
      typeClusters.set(mem.type, (typeClusters.get(mem.type) ?? 0) + 1);

      // Count tag frequencies for pattern detection
      if (mem.tags) {
        const tags: string[] = typeof mem.tags === 'string'
          ? JSON.parse(mem.tags)
          : mem.tags;
        for (const tag of tags) {
          tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
        }
      }
    }

    // Detect patterns: tags that appear in 3+ memories indicate a pattern
    const patterns: Array<{ tag: string; frequency: number }> = [];
    for (const [tag, count] of tagFrequency) {
      if (count >= 3) {
        patterns.push({ tag, frequency: count });
      }
    }
    patterns.sort((a, b) => b.frequency - a.frequency);

    // Synthesize skills: type clusters with 5+ entries suggest potential skills
    const potentialSkills: Array<{ type: string; count: number }> = [];
    for (const [type, count] of typeClusters) {
      if (count >= 5) {
        potentialSkills.push({ type, count });
      }
    }

    const clusters = Array.from(typeClusters.entries()).map(
      ([type, count]) => ({ type, count }),
    );

    eventBus.emit({
      type: 'learning_writeback',
      payload: {
        target_type: 'pattern_detection',
        target_id: projectId ?? 'global',
        modification_type: 'analysis',
        trigger: 'noesis.learn',
      },
    });

    return {
      status: 'ok',
      memories_analyzed: memories.length,
      clusters_found: clusters.length,
      patterns_detected: patterns.length,
      skills_synthesized: potentialSkills.length,
      clusters,
      patterns: patterns.slice(0, 20),
      potential_skills: potentialSkills,
    };
  });
}
