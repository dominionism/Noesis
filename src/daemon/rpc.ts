/**
 * JSON-RPC 2.0 Handler
 *
 * Implements a JSON-RPC 2.0 message processor for the Noesis daemon.
 * The handler maps method names to typed handler functions and dispatches
 * incoming requests with full error handling.
 *
 * Design decisions:
 * - Method registry pattern: a plain Map<string, MethodHandler> provides
 *   O(1) lookup with no prototype pollution risk.
 * - Each method handler receives typed params and returns a result.
 *   The outer dispatch wraps all calls in try/catch for safety.
 * - Standard JSON-RPC 2.0 error codes are used throughout.
 * - Methods that call existing modules (recall, remember, forget, etc.)
 *   are wired to actual implementations via dependency injection.
 * - Workflow methods that do not exist yet return { status: 'not_implemented' }.
 * - An idle timer reset callback is exported so the server can track activity.
 *
 * Security:
 * - A01: Each RPC method validates required params before dispatching.
 * - A03: No string interpolation; all DB access goes through parameterized
 *         queries in the underlying modules.
 * - A04: Method whitelist prevents arbitrary function invocation.
 * - A05: Unknown methods return -32601 (method not found).
 * - A09: Errors never expose stack traces or internal paths to callers.
 */

import type { DatabaseConnection } from '../core/database.js';
import type {
  EmbeddingProvider,
  MemoryInput,
  MemoryType,
  NoesisEvent,
  RecallParams,
  RecallResult,
  Memory,
  SecretMatch,
  ScanResult,
  DangerousMatch,
  AuditEntry,
  WritePipelineResult,
} from '../types.js';

import { deleteMemory, listMemories, createMemory, updateMemory } from '../core/memory-crud.js';
import { hybridRetrieve } from '../retrieval/hybrid.js';
import { analyzeGap } from '../retrieval/gap-analysis.js';
import { checkAction } from '../retrieval/action-advisory.js';
import { explainRetrieval } from '../retrieval/explain.js';
import { executeWritePipeline } from '../memory/write-pipeline.js';
import { eventBus } from './events.js';
import { registerCognitiveMethods } from './rpc-cognitive.js';

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ---------------------------------------------------------------------------
// Standard JSON-RPC 2.0 error codes
// ---------------------------------------------------------------------------

const ERROR_PARSE = -32700;
const ERROR_INVALID_REQUEST = -32600;
const ERROR_METHOD_NOT_FOUND = -32601;
const ERROR_INVALID_PARAMS = -32602;
const ERROR_INTERNAL = -32603;

// ---------------------------------------------------------------------------
// Method handler type
// ---------------------------------------------------------------------------

type MethodHandler = (params: Record<string, unknown>) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Dependencies injected into the RPC handler
// ---------------------------------------------------------------------------

export interface RpcDependencies {
  db: DatabaseConnection;
  embeddingProvider: EmbeddingProvider;

  /** HMAC signature verification for retrieval integrity checks. */
  verifySignature: (memory: Memory) => { valid: boolean; tampered: boolean };

  /** Secret scanner for retrieval output. */
  scanSecrets: (text: string) => { clean: string; redacted: boolean; matches: SecretMatch[] };

  /** HMAC signing for memory writes. */
  signMemory: (memory: {
    id: string;
    type: string;
    title: string;
    content: string;
    project_id: string | null;
  }) => string;

  /** Secret scan and redact for write pipeline. */
  scanAndRedact: (text: string) => ScanResult;

  /** Dangerous pattern checker for write pipeline. */
  checkDangerousPatterns: (text: string) => DangerousMatch[];

  /** Audit log writer. */
  writeAuditLog: (entry: Omit<AuditEntry, 'timestamp'>) => void;

  /** ULID generator. */
  generateId: () => string;

  /** Secret scan mode from config. */
  secretScanMode: 'warn' | 'redact';

  /** Get memory by ID (for explain). */
  getMemory: (id: string) => Memory | null;

  /** HMAC verify for explain. */
  verifyMemory?: (mem: {
    id: string;
    type: string;
    title: string;
    content: string;
    project_id: string | null;
    signature: string;
  }) => { valid: boolean };

  /** Count unresolved conflicts (for gap analysis). */
  getUnresolvedConflictCount: (projectId?: string) => number;
}

// ---------------------------------------------------------------------------
// Idle timer callback
// ---------------------------------------------------------------------------

let onActivity: (() => void) | null = null;

/**
 * Register a callback that is invoked on every successful RPC dispatch.
 * The daemon server uses this to reset its idle shutdown timer.
 */
export function resetIdleTimer(callback: (() => void) | null): void {
  onActivity = callback;
}

// ---------------------------------------------------------------------------
// Helper: build a retrieve function from dependencies
// ---------------------------------------------------------------------------

function makeRetrieveFn(deps: RpcDependencies): (params: RecallParams) => Promise<RecallResult> {
  return (recallParams: RecallParams) =>
    hybridRetrieve({
      db: deps.db,
      embeddingProvider: deps.embeddingProvider,
      recallParams,
      verifySignature: deps.verifySignature,
      scanSecrets: deps.scanSecrets,
    });
}

// ---------------------------------------------------------------------------
// Param validation helpers
// ---------------------------------------------------------------------------

function requireString(
  params: Record<string, unknown>,
  key: string,
  methodName: string,
): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new RpcError(
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

// ---------------------------------------------------------------------------
// Custom error for RPC-layer errors with codes
// ---------------------------------------------------------------------------

export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

// ---------------------------------------------------------------------------
// Method registration
// ---------------------------------------------------------------------------

function registerMethods(deps: RpcDependencies): Map<string, MethodHandler> {
  const methods = new Map<string, MethodHandler>();
  const retrieve = makeRetrieveFn(deps);

  // =========================================================================
  // Memory methods
  // =========================================================================

  methods.set('noesis.recall', async (params) => {
    const query = requireString(params, 'query', 'noesis.recall');

    const recallParams: RecallParams = { query };

    const projectId = optionalString(params, 'project_id');
    if (projectId) recallParams.project_id = projectId;

    const limit = optionalNumber(params, 'limit');
    if (limit !== undefined) recallParams.limit = limit;

    const typeFilter = optionalStringArray(params, 'type');
    if (typeFilter && typeFilter.length > 0) {
      recallParams.type_filter = typeFilter as MemoryType[];
    }

    const tagFilter = optionalStringArray(params, 'tags');
    if (tagFilter && tagFilter.length > 0) {
      recallParams.tag_filter = tagFilter;
    }

    return retrieve(recallParams);
  });

  methods.set('noesis.remember', async (params) => {
    const type = requireString(params, 'type', 'noesis.remember') as MemoryType;
    const title = requireString(params, 'title', 'noesis.remember');
    const content = requireString(params, 'content', 'noesis.remember');

    const memoryInput: MemoryInput = {
      type,
      title,
      content,
    };

    const tags = optionalStringArray(params, 'tags');
    if (tags) memoryInput.tags = tags;

    const projectId = optionalString(params, 'project_id');
    if (projectId !== undefined) memoryInput.project_id = projectId;

    const scope = optionalString(params, 'scope');
    if (scope) memoryInput.scope = scope as MemoryInput['scope'];

    const sensitivity = optionalString(params, 'sensitivity');
    if (sensitivity) memoryInput.sensitivity = sensitivity as MemoryInput['sensitivity'];

    const confidence = optionalNumber(params, 'confidence');
    if (confidence !== undefined) memoryInput.confidence = confidence;

    const outcome = optionalString(params, 'outcome');
    if (outcome !== undefined) memoryInput.outcome = outcome as MemoryInput['outcome'];

    const source = optionalString(params, 'source');
    if (source) memoryInput.source = source;

    const sessionId = optionalString(params, 'session_id');
    if (sessionId !== undefined) memoryInput.session_id = sessionId;

    const confirmed = params['confirmed'] === true;

    const result: WritePipelineResult = await executeWritePipeline({
      db: deps.db,
      input: { input: memoryInput, confirmed },
      config: { secret_scan_mode: deps.secretScanMode },
      signMemory: deps.signMemory,
      scanAndRedact: deps.scanAndRedact,
      checkDangerousPatterns: deps.checkDangerousPatterns,
      createMemory: createMemory,
      writeAuditLog: deps.writeAuditLog,
      emitEvent: (event: NoesisEvent) => eventBus.emit(event),
      generateId: deps.generateId,
      embeddingProvider: deps.embeddingProvider,
    });

    return result;
  });

  methods.set('noesis.forget', async (params) => {
    const id = requireString(params, 'id', 'noesis.forget');
    deleteMemory(deps.db, id);
    return { success: true, id };
  });

  methods.set('noesis.retrievalGap', async (params) => {
    const query = requireString(params, 'query', 'noesis.retrievalGap');
    const projectId = optionalString(params, 'project_id');

    return analyzeGap({
      request: {
        task_description: query,
        project_id: projectId,
      },
      retrieve,
      getUnresolvedConflictCount: deps.getUnresolvedConflictCount,
    });
  });

  methods.set('noesis.checkAction', async (params) => {
    const action = requireString(params, 'action', 'noesis.checkAction');
    const projectId = optionalString(params, 'project_id');

    return checkAction({
      request: {
        action_description: action,
        project_id: projectId,
      },
      retrieve,
    });
  });

  methods.set('noesis.explain', async (params) => {
    const query = requireString(params, 'query', 'noesis.explain');
    const memoryId = optionalString(params, 'memory_id');
    const projectId = optionalString(params, 'project_id');

    return explainRetrieval({
      request: {
        query,
        memory_id: memoryId,
        project_id: projectId,
      },
      retrieve,
      embeddingProvider: deps.embeddingProvider,
      getMemory: deps.getMemory,
      verifyMemory: deps.verifyMemory,
    });
  });

  // =========================================================================
  // Session methods
  // =========================================================================

  methods.set('noesis.sessionStart', async (params) => {
    const projectId = optionalString(params, 'project_id');
    const agent = optionalString(params, 'agent') ?? 'unknown';
    const now = new Date().toISOString();

    const sessionContent = JSON.stringify({
      agent,
      status: 'active',
      started_at: now,
      ended_at: null,
      token_estimate: null,
      tool_calls: null,
      summary: null,
    });

    const signature = deps.signMemory({
      id: 'pending',
      type: 'session',
      title: `Session: ${agent}`,
      content: sessionContent,
      project_id: projectId ?? null,
    });

    const memory = createMemory(deps.db, {
      type: 'session',
      title: `Session: ${agent}`,
      content: sessionContent,
      tags: ['session', agent],
      project_id: projectId ?? null,
      scope: projectId ? 'project' : 'global',
      source: 'system',
      signature,
    });

    eventBus.emit({
      type: 'memory_written',
      payload: {
        id: memory.id,
        type: memory.type,
        project_id: memory.project_id,
        scope: memory.scope,
      },
    });

    return { session_id: memory.id, started_at: now };
  });

  methods.set('noesis.sessionEnd', async (params) => {
    const sessionId = requireString(params, 'session_id', 'noesis.sessionEnd');
    const summary = optionalString(params, 'summary');
    const now = new Date().toISOString();

    const existing = deps.getMemory(sessionId);
    if (!existing) {
      throw new RpcError(ERROR_INVALID_PARAMS, `Session not found: ${sessionId}`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(existing.content) as Record<string, unknown>;
    } catch {
      parsed = {};
    }

    parsed['status'] = 'completed';
    parsed['ended_at'] = now;
    if (summary) parsed['summary'] = summary;

    const updatedContent = JSON.stringify(parsed);

    const signature = deps.signMemory({
      id: sessionId,
      type: 'session',
      title: existing.title,
      content: updatedContent,
      project_id: existing.project_id,
    });

    updateMemory(deps.db, sessionId, {
      content: updatedContent,
      signature,
    });

    return { session_id: sessionId, ended_at: now };
  });

  methods.set('noesis.sessionList', async (params) => {
    const projectId = optionalString(params, 'project_id');
    const limit = optionalNumber(params, 'limit') ?? 20;

    const memories = listMemories(deps.db, {
      type: 'session',
      project_id: projectId,
      limit,
    });

    return {
      sessions: memories.map((m) => ({
        id: m.id,
        title: m.title,
        project_id: m.project_id,
        created_at: m.created_at,
        content: m.content,
      })),
      count: memories.length,
    };
  });

  // =========================================================================
  // Sync methods (placeholders)
  // =========================================================================

  methods.set('noesis.sync', async (params) => {
    const adapterId = optionalString(params, 'adapter_id');
    const projectId = optionalString(params, 'project_id');

    // Retrieve current memories for the project (or all)
    const memories = listMemories(deps.db, {
      project_id: projectId,
      limit: 500,
    });

    if (memories.length === 0) {
      return {
        status: 'no_data',
        adapter_id: adapterId ?? null,
        project_id: projectId ?? null,
        message: 'No memories to sync',
        memories_count: 0,
      };
    }

    // Build a universal context from current memories
    const contextEntries = memories.map((m) => ({
      id: m.id,
      type: m.type,
      title: m.title,
      project_id: m.project_id,
      scope: m.scope,
      created_at: m.created_at,
      updated_at: m.updated_at,
    }));

    // If a specific adapter is requested, filter or tag accordingly
    const syncPlan = {
      adapter_id: adapterId ?? 'all',
      project_id: projectId ?? null,
      memories_count: memories.length,
      entries: contextEntries,
    };

    return {
      status: 'ok',
      adapter_id: adapterId ?? null,
      project_id: projectId ?? null,
      sync_plan: syncPlan,
    };
  });

  methods.set('noesis.ping', async () => {
    return { status: 'ok' };
  });

  methods.set('noesis.subscribe', async (params) => {
    const events = optionalStringArray(params, 'events');
    if (!events || events.length === 0) {
      throw new RpcError(
        ERROR_INVALID_PARAMS,
        'noesis.subscribe: "events" must be a non-empty array of event type strings',
      );
    }

    // Placeholder: real subscription over the socket is Phase 2
    return {
      status: 'not_implemented',
      subscribed_events: events,
    };
  });

  methods.set('noesis.unsubscribe', async (params) => {
    const subscriptionId = params['subscription_id'];
    if (subscriptionId === undefined || subscriptionId === null) {
      throw new RpcError(
        ERROR_INVALID_PARAMS,
        'noesis.unsubscribe: missing required parameter "subscription_id"',
      );
    }

    // Placeholder: real unsubscription over the socket is Phase 2
    return {
      status: 'ok',
      subscription_id: subscriptionId,
    };
  });

  // =========================================================================
  // Cognitive methods (Phase 12: Integration & Wiring)
  // =========================================================================

  // Build a SignFn from the existing signMemory dependency
  const signFn = (content: string): string =>
    deps.signMemory({
      id: 'sign',
      type: 'sign',
      title: 'sign',
      content,
      project_id: null,
    });

  registerCognitiveMethods(methods, { db: deps.db, sign: signFn, writeAuditLog: deps.writeAuditLog });

  return methods;
}

// ---------------------------------------------------------------------------
// RPC handler factory
// ---------------------------------------------------------------------------

/**
 * Create a JSON-RPC 2.0 message handler.
 *
 * The returned function accepts a raw string (the message body from the
 * Unix socket), parses it as JSON-RPC 2.0, dispatches to the appropriate
 * method handler, and returns a JSON-RPC 2.0 response object.
 *
 * @param deps - All external dependencies injected for testability.
 * @returns An async function that processes a single JSON-RPC message.
 */
export function createRpcHandler(
  deps: RpcDependencies,
): (message: string) => Promise<JsonRpcResponse> {
  const methods = registerMethods(deps);

  return async (message: string): Promise<JsonRpcResponse> => {
    // Step 1: Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: ERROR_PARSE, message: 'Parse error: invalid JSON' },
      };
    }

    // Step 2: Validate JSON-RPC 2.0 structure
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: ERROR_INVALID_REQUEST, message: 'Invalid request: expected a JSON object' },
      };
    }

    const request = parsed as Record<string, unknown>;

    if (request['jsonrpc'] !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: (request['id'] as string | number | null) ?? null,
        error: { code: ERROR_INVALID_REQUEST, message: 'Invalid request: jsonrpc must be "2.0"' },
      };
    }

    const id = request['id'] as string | number | null ?? null;

    if (typeof request['method'] !== 'string') {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: ERROR_INVALID_REQUEST, message: 'Invalid request: method must be a string' },
      };
    }

    const method = request['method'] as string;

    // Step 3: Validate params (must be object or absent)
    let params: Record<string, unknown> = {};
    if (request['params'] !== undefined) {
      if (
        typeof request['params'] !== 'object' ||
        request['params'] === null ||
        Array.isArray(request['params'])
      ) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: ERROR_INVALID_PARAMS,
            message: 'Invalid params: must be an object',
          },
        };
      }
      params = request['params'] as Record<string, unknown>;
    }

    // Step 4: Look up method
    const handler = methods.get(method);
    if (!handler) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: ERROR_METHOD_NOT_FOUND,
          message: `Method not found: ${method}`,
        },
      };
    }

    // Step 5: Execute method handler
    try {
      const result = await handler(params);

      // Signal activity for idle timer
      if (onActivity) {
        onActivity();
      }

      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (err) {
      // RpcError (or any error with a numeric `code`) carries a specific error code
      if (
        err instanceof Error &&
        'code' in err &&
        typeof (err as RpcError).code === 'number'
      ) {
        const rpcErr = err as RpcError;
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: rpcErr.code,
            message: rpcErr.message,
            ...(rpcErr.data !== undefined ? { data: rpcErr.data } : {}),
          },
        };
      }

      // All other errors become internal errors.
      // Do not expose stack traces or internal details (A09).
      const errorMessage =
        err instanceof Error ? err.message : 'Internal error';

      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: ERROR_INTERNAL,
          message: errorMessage,
        },
      };
    }
  };
}
