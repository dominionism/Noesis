/**
 * Workflow RPC Method Registration
 *
 * Registers RPC methods for non-deprecated workflow modules:
 * agent-definitions, checkpoint-protocol, debug-protocol,
 * deviation-tracker, plan-engine, prompt-optimizer, verification-engine.
 *
 * Stateful modules (checkpoint-protocol, deviation-tracker) maintain
 * one instance per daemon lifecycle held in the registration closure.
 */

import { createHash } from 'node:crypto';
import type { DatabaseConnection } from '../core/database.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MethodHandler = (params: Record<string, unknown>) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

class WorkflowRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const ERROR_INVALID_PARAMS = -32602;

// ---------------------------------------------------------------------------
// Param helpers
// ---------------------------------------------------------------------------

function requireString(params: Record<string, unknown>, key: string, method: string): string {
  const v = params[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new WorkflowRpcError(ERROR_INVALID_PARAMS, `${method}: missing required parameter "${key}"`);
  }
  return v;
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  return typeof v === 'string' ? v : undefined;
}

function optionalStringArray(params: Record<string, unknown>, key: string): string[] | undefined {
  const v = params[key];
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === 'string');
}

function optionalNumber(params: Record<string, unknown>, key: string): number | undefined {
  const v = params[key];
  return typeof v === 'number' ? v : undefined;
}

function auditHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface WorkflowRpcDependencies {
  db: DatabaseConnection;
  writeAuditLog: (entry: Omit<import('../types.js').AuditEntry, 'timestamp'>) => void;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorkflowMethods(
  methods: Map<string, MethodHandler>,
  deps: WorkflowRpcDependencies,
): void {
  const { db, writeAuditLog } = deps;

  // Lazily-initialized stateful module instances (one per daemon lifecycle).
  // Use import() return types to stay in sync with source modules.
  let checkpointInstance: import('../workflow/checkpoint-protocol.js').CheckpointProtocol | null = null;
  let deviationInstance: import('../workflow/deviation-tracker.js').DeviationTracker | null = null;

  // =========================================================================
  // 1. getAgentDefinitions — List registered agents
  // =========================================================================

  methods.set('noesis.getAgentDefinitions', async () => {
    const { getAgentDefinitions, getRules, getCommands } = await import('../workflow/agent-definitions.js');
    return {
      agents: getAgentDefinitions(),
      rules: getRules(),
      commands: getCommands(),
    };
  });

  // =========================================================================
  // 2. registerAgent — Register a new agent definition
  // =========================================================================

  methods.set('noesis.registerAgent', async (params) => {
    const name = requireString(params, 'name', 'noesis.registerAgent');
    const displayName = optionalString(params, 'displayName') ?? name;
    const description = requireString(params, 'description', 'noesis.registerAgent');
    const capabilities = optionalStringArray(params, 'capabilities') ?? [];
    const triggers = optionalStringArray(params, 'triggers') ?? [];
    const constraints = optionalStringArray(params, 'constraints') ?? [];
    const successCriteria = optionalStringArray(params, 'successCriteria') ?? [];
    const priority = optionalNumber(params, 'priority') ?? 0;
    const status = (optionalString(params, 'status') ?? 'active') as 'active' | 'draft' | 'archived';

    const { registerAgent } = await import('../workflow/agent-definitions.js');
    const agent = registerAgent({
      name,
      displayName,
      description,
      capabilities,
      triggers,
      constraints,
      successCriteria,
      priority,
      status,
    });

    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(name),
      source: 'system',
      details: { method: 'noesis.registerAgent', agent_id: agent.id, name },
    });

    return agent;
  });

  // =========================================================================
  // 3. createCheckpoint — Create execution checkpoint
  // =========================================================================

  methods.set('noesis.createCheckpoint', async (params) => {
    const type = requireString(params, 'type', 'noesis.createCheckpoint') as
      'human_verify' | 'decision' | 'human_action';
    const description = requireString(params, 'description', 'noesis.createCheckpoint');
    const context = optionalString(params, 'context') ?? '';
    const options = optionalStringArray(params, 'options');

    if (!checkpointInstance) {
      const { createCheckpointProtocol } = await import('../workflow/checkpoint-protocol.js');
      checkpointInstance = createCheckpointProtocol();
    }

    const checkpoint = checkpointInstance.create(type, description, context, options);
    return checkpoint;
  });

  // =========================================================================
  // 4. resolveCheckpoint — Resolve a pending checkpoint
  // =========================================================================

  methods.set('noesis.resolveCheckpoint', async (params) => {
    const id = requireString(params, 'id', 'noesis.resolveCheckpoint');
    const resolution = optionalString(params, 'resolution');

    if (!checkpointInstance) {
      throw new WorkflowRpcError(ERROR_INVALID_PARAMS, 'noesis.resolveCheckpoint: no checkpoint protocol initialized');
    }

    const result = checkpointInstance.resolve(id, resolution);
    return result;
  });

  // =========================================================================
  // 5. getPendingCheckpoints — List pending checkpoints
  // =========================================================================

  methods.set('noesis.getPendingCheckpoints', async () => {
    if (!checkpointInstance) {
      return { pending: [], blocked: false };
    }

    return {
      pending: checkpointInstance.getPending(),
      blocked: checkpointInstance.isBlocked(),
    };
  });

  // =========================================================================
  // 6. createDebugSession — Start bug investigation
  // =========================================================================

  methods.set('noesis.createDebugSession', async (params) => {
    const trigger = requireString(params, 'trigger', 'noesis.createDebugSession');

    const { createDebugSession } = await import('../workflow/debug-protocol.js');
    const session = createDebugSession(trigger);

    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(trigger),
      source: 'system',
      details: { method: 'noesis.createDebugSession', session_id: session.id },
    });

    return session;
  });

  // =========================================================================
  // 7. updateDebugSession — Add evidence/symptoms to debug session
  // =========================================================================

  methods.set('noesis.updateDebugSession', async (params) => {
    const action = requireString(params, 'action', 'noesis.updateDebugSession');
    const sessionState = params.session as Record<string, unknown>;
    if (!sessionState) {
      throw new WorkflowRpcError(ERROR_INVALID_PARAMS, 'noesis.updateDebugSession: missing session state');
    }

    const mod = await import('../workflow/debug-protocol.js');

    let updated: unknown;
    switch (action) {
      case 'add_symptom':
        updated = mod.addSymptom(sessionState as never, requireString(params, 'symptom', 'noesis.updateDebugSession'));
        break;
      case 'add_evidence':
        updated = mod.addEvidence(sessionState as never, requireString(params, 'evidence', 'noesis.updateDebugSession'));
        break;
      case 'add_eliminated':
        updated = mod.addEliminated(sessionState as never, requireString(params, 'eliminated', 'noesis.updateDebugSession'));
        break;
      case 'set_focus': {
        // updateDebugFocus expects { hypothesis, test, expecting, nextAction }
        const focus = params.focus as Record<string, unknown> | undefined;
        if (!focus || typeof focus !== 'object') {
          throw new WorkflowRpcError(ERROR_INVALID_PARAMS, 'noesis.updateDebugSession: focus must be object with {hypothesis, test, expecting, nextAction}');
        }
        const focusObj = {
          hypothesis: typeof focus.hypothesis === 'string' ? focus.hypothesis : '',
          test: typeof focus.test === 'string' ? focus.test : '',
          expecting: typeof focus.expecting === 'string' ? focus.expecting : '',
          nextAction: typeof focus.nextAction === 'string' ? focus.nextAction : '',
        };
        updated = mod.updateDebugFocus(sessionState as never, focusObj as never);
        break;
      }
      case 'set_resolution':
        updated = mod.setResolution(sessionState as never, requireString(params, 'resolution', 'noesis.updateDebugSession'));
        break;
      case 'transition':
        updated = mod.transitionDebugStatus(sessionState as never, requireString(params, 'status', 'noesis.updateDebugSession') as never);
        break;
      default:
        throw new WorkflowRpcError(ERROR_INVALID_PARAMS, `noesis.updateDebugSession: unknown action "${action}"`);
    }

    return updated;
  });

  // =========================================================================
  // 8. trackDeviation — Record a plan deviation
  // =========================================================================

  methods.set('noesis.trackDeviation', async (params) => {
    // DeviationRule is 1 | 2 | 3 | 4
    const ruleRaw = params.rule;
    if (typeof ruleRaw !== 'number' || ![1, 2, 3, 4].includes(ruleRaw)) {
      throw new WorkflowRpcError(ERROR_INVALID_PARAMS, 'noesis.trackDeviation: rule must be 1, 2, 3, or 4');
    }
    const rule = ruleRaw as 1 | 2 | 3 | 4;
    const type = requireString(params, 'type', 'noesis.trackDeviation');
    const description = requireString(params, 'description', 'noesis.trackDeviation');
    const taskId = requireString(params, 'task_id', 'noesis.trackDeviation');

    if (!deviationInstance) {
      const { createDeviationTracker } = await import('../workflow/deviation-tracker.js');
      deviationInstance = createDeviationTracker();
    }

    const entry = deviationInstance.record(rule, type, description, taskId);
    const shouldStop = deviationInstance.shouldStop(taskId);

    return { entry, shouldStop };
  });

  // =========================================================================
  // 9. getDeviations — List all tracked deviations
  // =========================================================================

  methods.set('noesis.getDeviations', async (params) => {
    if (!deviationInstance) {
      return { deviations: [] };
    }

    const taskId = optionalString(params, 'task_id');

    return {
      deviations: taskId ? deviationInstance.getByTask(taskId) : deviationInstance.getAll(),
    };
  });

  // =========================================================================
  // 10. createWorkflowPlan — Create structured task plan
  // =========================================================================

  methods.set('noesis.createWorkflowPlan', async (params) => {
    const goal = requireString(params, 'goal', 'noesis.createWorkflowPlan');
    const context = optionalString(params, 'context') ?? '';
    const constraints = optionalStringArray(params, 'constraints') ?? [];
    const deliverable = optionalString(params, 'deliverable') ?? '';

    const { createPlan } = await import('../workflow/plan-engine.js');

    const promptShape = {
      goal,
      context,
      constraints,
      deliverable,
      validation: optionalStringArray(params, 'validation') ?? [],
    };

    const result = createPlan({
      promptShape,
      researchResults: {
        memories: [],
        antiPatternWarnings: [],
        gapAnalysis: {},
        codebaseState: {},
      },
      skills: [],
      antiPatterns: [],
      projectId: optionalString(params, 'project_id'),
    });

    writeAuditLog({
      event_type: 'COGNITIVE_WRITE',
      content_hash: auditHash(goal),
      source: 'system',
      details: { method: 'noesis.createWorkflowPlan', phases: result.plan.phases.length },
    });

    return result;
  });

  // =========================================================================
  // 11. optimizePrompt — Extract structured prompt shape
  // =========================================================================

  methods.set('noesis.optimizePrompt', async (params) => {
    const rawPrompt = requireString(params, 'prompt', 'noesis.optimizePrompt');
    const projectId = optionalString(params, 'project_id');

    const { extractPromptShape } = await import('../workflow/prompt-optimizer.js');

    const shape = extractPromptShape({ rawPrompt, projectId });
    return shape;
  });

  // =========================================================================
  // 12. verifyArtifact — Verify implementation artifact
  // =========================================================================

  methods.set('noesis.verifyArtifact', async (params) => {
    const artifact = requireString(params, 'artifact', 'noesis.verifyArtifact');
    const description = optionalString(params, 'description') ?? '';
    const expectedPatterns = optionalStringArray(params, 'expected_patterns');
    const expectedImports = optionalStringArray(params, 'expected_imports');
    const rootPath = optionalString(params, 'root_path') ?? '.';

    const { verifyArtifact } = await import('../workflow/verification-engine.js');
    const { readFile } = await import('node:fs/promises');
    const { existsSync, globSync } = await import('node:fs');
    const { join } = await import('node:path');

    const query = {
      glob: async (pattern: string) => {
        try {
          return globSync(join(rootPath, pattern));
        } catch {
          return [];
        }
      },
      read: async (path: string) => {
        try {
          return await readFile(path, 'utf-8');
        } catch {
          return '';
        }
      },
      exists: async (path: string) => existsSync(path),
    };

    const target = { artifact, description, expectedPatterns, expectedImports };
    const result = await verifyArtifact(target as never, query);

    return result;
  });
}
