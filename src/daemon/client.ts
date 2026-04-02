/**
 * Noesis Daemon Client
 *
 * Communicates with the background daemon over a Unix domain socket using
 * JSON-RPC 2.0 with newline-delimited framing. Each request is a single
 * JSON object terminated by `\n`; each response follows the same format.
 *
 * The client auto-starts the daemon when it is not running, implements
 * connection and per-request timeouts, and provides typed convenience
 * methods for every RPC endpoint.
 *
 * Security notes:
 *   - The Unix socket inherits filesystem permissions (0o700 on NOESIS_HOME),
 *     so only the owning user can connect.
 *   - No secrets are transmitted; all sensitive data stays server-side.
 *   - No user-controlled data is interpolated into shell commands.
 */

import { connect, type Socket } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DAEMON_SOCKET_PATH } from '../constants.js';
import type { Memory, NoesisEvent, RecallResult } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time (ms) to wait for a socket connection. */
const CONNECTION_TIMEOUT_MS = 5_000;

/** Maximum time (ms) to wait for a single RPC response. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Maximum time (ms) to wait for the daemon to start and accept connections. */
const DAEMON_START_TIMEOUT_MS = 5_000;

/** Interval (ms) between daemon readiness polls during startup. */
const DAEMON_POLL_INTERVAL_MS = 100;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 types (internal)
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class DaemonConnectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DaemonConnectionError';
  }
}

export class DaemonRpcError extends Error {
  public readonly code: number;
  public readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'DaemonRpcError';
    this.code = code;
    this.data = data;
  }
}

export class DaemonTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`RPC call "${method}" timed out after ${timeoutMs}ms`);
    this.name = 'DaemonTimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Pending request tracking
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface LocalRpcRuntime {
  readonly mode: 'read' | 'write';
  call<T>(method: string, params?: Record<string, unknown>): Promise<T>;
  cleanup(): void;
}

// ---------------------------------------------------------------------------
// NoesisClient
// ---------------------------------------------------------------------------

export class NoesisClient {
  private readonly socketPath: string;
  private socket: Socket | null = null;
  private nextId = 1;
  private pending: Map<number, PendingRequest> = new Map();
  private buffer = '';
  private connected = false;
  private localOnlyMode = false;
  private localRuntime: LocalRpcRuntime | null = null;

  /**
   * Event subscriptions managed client-side. Each subscription registers a
   * handler that is called when matching notification events arrive over the
   * socket. The daemon pushes events as JSON-RPC notifications (no `id`).
   */
  private eventHandlers: Map<number, { events: string[]; handler: (event: NoesisEvent) => void }> = new Map();
  private nextSubscriptionId = 1;

  constructor(socketPath?: string) {
    this.socketPath = socketPath ?? DAEMON_SOCKET_PATH;
  }

  // -----------------------------------------------------------------------
  // Connection management
  // -----------------------------------------------------------------------

  /**
   * Connect to the daemon socket. Rejects after CONNECTION_TIMEOUT_MS if
   * the connection cannot be established.
   */
  connect(): Promise<void> {
    if (this.localOnlyMode) {
      return Promise.resolve();
    }

    if (this.connected && this.socket !== null) {
      return Promise.resolve();
    }

    return new Promise<void>((resolveConn, rejectConn) => {
      const timer = setTimeout(() => {
        if (this.socket !== null) {
          this.socket.destroy();
          this.socket = null;
        }
        rejectConn(
          new DaemonConnectionError(
            `Connection to daemon timed out after ${CONNECTION_TIMEOUT_MS}ms`,
          ),
        );
      }, CONNECTION_TIMEOUT_MS);

      const socket = connect({ path: this.socketPath }, () => {
        clearTimeout(timer);
        this.connected = true;
        resolveConn();
      });

      socket.setEncoding('utf-8');

      socket.on('data', (chunk: string) => {
        this.handleData(chunk);
      });

      socket.on('error', (err: Error) => {
        clearTimeout(timer);
        this.connected = false;
        this.rejectAllPending(err);
        // If we have not resolved yet, reject the connect promise
        rejectConn(
          new DaemonConnectionError(
            `Failed to connect to daemon at ${this.socketPath}: ${err.message}`,
            { cause: err },
          ),
        );
      });

      socket.on('close', () => {
        this.connected = false;
        this.socket = null;
        this.rejectAllPending(
          new DaemonConnectionError('Connection closed by daemon'),
        );
      });

      this.socket = socket;
    });
  }

  /**
   * Disconnect from the daemon. Safe to call even when not connected.
   */
  disconnect(): void {
    this.cleanupLocalRuntime();

    if (this.socket !== null) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.localOnlyMode = false;
    this.buffer = '';
    this.rejectAllPending(
      new DaemonConnectionError('Client disconnected'),
    );
  }

  /**
   * Returns true when the underlying socket is connected and writable.
   */
  isConnected(): boolean {
    return this.connected && this.socket !== null && !this.socket.destroyed;
  }

  // -----------------------------------------------------------------------
  // Auto-start
  // -----------------------------------------------------------------------

  /**
   * Ensure the daemon is running and connected. If the daemon is not
   * reachable, spawn it as a detached background process and wait for the
   * socket to become available (up to DAEMON_START_TIMEOUT_MS).
   */
  async ensureDaemon(): Promise<void> {
    // Fast path: already connected
    if (this.isConnected() || this.localOnlyMode) {
      return;
    }

    // Attempt to connect to an already-running daemon
    try {
      await this.connect();
      // Verify the connection is actually live with a ping
      await this.callConnected<{ status: string }>('noesis.ping');
      this.localOnlyMode = false;
      return;
    } catch (err) {
      // Daemon not running or not responding — proceed to spawn
      this.disconnect();
      // Only skip spawning if we know we can't spawn (e.g. sandbox permission denied)
      if (this.isIpcPermissionDenied(err)) {
        this.localOnlyMode = true;
        return;
      }
    }

    // Spawn the daemon as a detached background process.
    // The daemon entry point is resolved relative to this module's location
    // in the dist directory, but we reference it through the CLI bin path
    // to stay resilient to build layout changes.
    this.spawnDaemon();

    // Poll until the socket becomes available or timeout
    const deadline = Date.now() + DAEMON_START_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.sleep(DAEMON_POLL_INTERVAL_MS);

      if (!existsSync(this.socketPath)) {
        continue;
      }

      try {
        await this.connect();
        await this.callConnected<{ status: string }>('noesis.ping');
        this.localOnlyMode = false;
        return;
      } catch (err) {
        this.disconnect();
        if (this.shouldUseLocalFallback(err)) {
          this.localOnlyMode = true;
          return;
        }
      }
    }
    this.localOnlyMode = true;
  }

  // -----------------------------------------------------------------------
  // Generic RPC call
  // -----------------------------------------------------------------------

  /**
   * Send a JSON-RPC 2.0 request and return the parsed result. Rejects with
   * DaemonRpcError on application-level errors, DaemonTimeoutError if the
   * response does not arrive within REQUEST_TIMEOUT_MS, and
   * DaemonConnectionError if the socket is not connected.
   */
  async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const qualifiedMethod = method.startsWith('noesis.') ? method : `noesis.${method}`;

    if (this.localOnlyMode) {
      return this.callLocally<T>(qualifiedMethod, params);
    }

    if (!this.isConnected()) {
      try {
        await this.ensureDaemon();

        if (this.localOnlyMode) {
          return this.callLocally<T>(qualifiedMethod, params);
        }

        if (!this.isConnected()) {
          await this.connect();
        }
      } catch (err) {
        return this.handleCallFailure<T>(qualifiedMethod, params, err);
      }
    }

    try {
      return await this.callConnected<T>(qualifiedMethod, params);
    } catch (err) {
      return this.handleCallFailure<T>(qualifiedMethod, params, err);
    }
  }

  private callConnected<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.isConnected()) {
      return Promise.reject(
        new DaemonConnectionError('Not connected to daemon'),
      );
    }

    const id = this.nextId++;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
    };

    if (params !== undefined) {
      request.params = params;
    }

    return new Promise<T>((resolveCall, rejectCall) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectCall(new DaemonTimeoutError(method, REQUEST_TIMEOUT_MS));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: resolveCall as (value: unknown) => void,
        reject: rejectCall,
        timer,
      });

      const payload = JSON.stringify(request) + '\n';

      this.socket!.write(payload, (err) => {
        if (err !== undefined && err !== null) {
          clearTimeout(timer);
          this.pending.delete(id);
          rejectCall(
            new DaemonConnectionError(
              `Failed to write to socket: ${err.message}`,
              { cause: err },
            ),
          );
        }
      });
    });
  }

  private async handleCallFailure<T>(
    method: string,
    params: Record<string, unknown> | undefined,
    error: unknown,
  ): Promise<T> {
    if (!this.shouldUseLocalFallback(error)) {
      throw error;
    }

    this.localOnlyMode = true;
    return this.callLocally<T>(method, params);
  }

  private async callLocally<T>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const localRpc = await import('../runtime/local-rpc.js');
    const mode = localRpc.getLocalRpcMode(method);

    if (mode === null) {
      throw new DaemonConnectionError(
        `Noesis method "${method}" has no safe local fallback. Run \`noesis\` outside the sandbox or allowlist the \`noesis\` command.`,
      );
    }

    if (this.localRuntime?.mode !== mode) {
      this.cleanupLocalRuntime();
    }

    if (this.localRuntime === null) {
      this.localRuntime = await localRpc.createLocalRpcRuntime(mode);
    }

    return this.localRuntime.call<T>(method, params);
  }

  // -----------------------------------------------------------------------
  // Typed convenience methods — Memory operations
  // -----------------------------------------------------------------------

  recall(params: {
    query: string;
    project_id?: string;
    type?: string;
    tags?: string[];
    limit?: number;
  }): Promise<RecallResult> {
    return this.call<RecallResult>('recall', params as Record<string, unknown>);
  }

  getMemory(
    id: string,
    options?: { type?: string; project_id?: string },
  ): Promise<Memory | null> {
    const params: Record<string, unknown> = { id };
    if (options?.type !== undefined) {
      params.type = options.type;
    }
    if (options?.project_id !== undefined) {
      params.project_id = options.project_id;
    }
    return this.call<Memory | null>('getMemory', params);
  }

  remember(params: {
    type: string;
    title: string;
    content: string;
    tags?: string[];
    project_id?: string;
  }): Promise<Memory> {
    return this.call<Memory>('remember', params as Record<string, unknown>);
  }

  forget(id: string): Promise<void> {
    return this.call<void>('forget', { id });
  }

  retrievalGap(query: string, projectId?: string): Promise<unknown> {
    const params: Record<string, unknown> = { query };
    if (projectId !== undefined) {
      params.project_id = projectId;
    }
    return this.call<unknown>('retrievalGap', params);
  }

  checkAction(action: string, projectId?: string): Promise<unknown> {
    const params: Record<string, unknown> = { action };
    if (projectId !== undefined) {
      params.project_id = projectId;
    }
    return this.call<unknown>('checkAction', params);
  }

  explain(memoryId: string, query: string, projectId?: string): Promise<unknown> {
    const params: Record<string, unknown> = { memory_id: memoryId, query };
    if (projectId !== undefined) {
      params.project_id = projectId;
    }
    return this.call<unknown>('explain', params);
  }

  // -----------------------------------------------------------------------
  // Typed convenience methods — Session management
  // -----------------------------------------------------------------------

  sessionStart(params: {
    project_id?: string;
    agent?: string;
  }): Promise<{ session_id: string }> {
    return this.call<{ session_id: string }>('sessionStart', params as Record<string, unknown>);
  }

  sessionEnd(sessionId: string, summary?: string): Promise<void> {
    const params: Record<string, unknown> = { session_id: sessionId };
    if (summary !== undefined) {
      params.summary = summary;
    }
    return this.call<void>('sessionEnd', params);
  }

  sessionList(params?: {
    project_id?: string;
    limit?: number;
  }): Promise<Memory[]> {
    return this.call<Memory[]>('sessionList', params as Record<string, unknown> | undefined);
  }

  // -----------------------------------------------------------------------
  // Typed convenience methods — Sync & events
  // -----------------------------------------------------------------------

  sync(adapterId: string, projectId?: string): Promise<unknown> {
    const params: Record<string, unknown> = { adapter_id: adapterId };
    if (projectId !== undefined) {
      params.project_id = projectId;
    }
    return this.call<unknown>('sync', params);
  }

  /**
   * Subscribe to daemon events. The returned function unsubscribes when
   * called. Events arrive as JSON-RPC notifications (messages without an
   * `id` field) over the same socket connection.
   *
   * The client sends a `subscribe` RPC to tell the daemon which event types
   * to push, then routes incoming notifications to the matching handler.
   */
  async subscribe(
    events: string[],
    handler: (event: NoesisEvent) => void,
  ): Promise<() => void> {
    const subId = this.nextSubscriptionId++;

    // Register the handler locally before telling the daemon, so we do not
    // miss events that arrive between the RPC response and handler setup.
    this.eventHandlers.set(subId, { events, handler });

    try {
      await this.call<void>('subscribe', {
        subscription_id: subId,
        events,
      });
    } catch (err) {
      this.eventHandlers.delete(subId);
      throw err;
    }

    return () => {
      this.eventHandlers.delete(subId);
      // Best-effort unsubscribe — do not await or throw
      if (this.isConnected()) {
        this.call<void>('unsubscribe', { subscription_id: subId }).catch(() => {
          // Intentionally swallowed: unsubscribe is best-effort
        });
      }
    };
  }

  // -----------------------------------------------------------------------
  // Typed convenience methods — Cognitive operations
  // -----------------------------------------------------------------------

  orchestrate(
    request: string,
    options?: { project_id?: string; token_budget?: number },
  ): Promise<unknown> {
    const params: Record<string, unknown> = { request, ...options };
    return this.call<unknown>('orchestrate', params);
  }

  checkCompliance(
    taskContext: string,
    options?: {
      project_id?: string;
      phase?: string;
      has_readiness?: boolean;
      has_research?: boolean;
      has_plan?: boolean;
      has_verification?: boolean;
      is_substantial?: boolean;
    },
  ): Promise<unknown> {
    const params: Record<string, unknown> = { task_context: taskContext, ...options };
    return this.call<unknown>('checkCompliance', params);
  }

  routeExpertCognitive(
    task: string,
    options?: { keywords?: string[]; prefer_category?: string },
  ): Promise<unknown> {
    const params: Record<string, unknown> = { task, ...options };
    return this.call<unknown>('routeExpertCognitive', params);
  }

  matchCapsuleDeep(
    goal: string,
    options?: { context?: string; constraints?: string[]; deliverable?: string },
  ): Promise<unknown> {
    const params: Record<string, unknown> = { goal, ...options };
    return this.call<unknown>('matchCapsuleDeep', params);
  }

  matchSkills(
    task: string,
    options?: { category?: string; max?: number },
  ): Promise<unknown> {
    const params: Record<string, unknown> = { task, ...options };
    return this.call<unknown>('matchSkills', params);
  }

  getContexts(
    options?: { project_id?: string; types?: string[] },
  ): Promise<unknown> {
    return this.call<unknown>('getContexts', options as Record<string, unknown>);
  }

  updateContext(type: string, content: string, projectId?: string): Promise<unknown> {
    const params: Record<string, unknown> = { type, content };
    if (projectId !== undefined) {
      params.project_id = projectId;
    }
    return this.call<unknown>('updateContext', params);
  }

  checkReadinessEvidence(
    task: string,
    options?: Record<string, unknown>,
  ): Promise<unknown> {
    const params: Record<string, unknown> = { task, ...options };
    return this.call<unknown>('checkReadinessEvidence', params);
  }

  checkQualityGate(
    type: string,
    options?: Record<string, unknown>,
  ): Promise<unknown> {
    const params: Record<string, unknown> = { type, ...options };
    return this.call<unknown>('checkQualityGate', params);
  }

  predictFailures(task: string, projectId?: string): Promise<unknown> {
    const params: Record<string, unknown> = { task };
    if (projectId !== undefined) {
      params.project_id = projectId;
    }
    return this.call<unknown>('predictFailures', params);
  }

  processLearning(params: Record<string, unknown>): Promise<unknown> {
    return this.call<unknown>('processLearning', params);
  }

  createGsdProject(
    projectId: string,
    description: string,
    milestone?: string,
  ): Promise<unknown> {
    const params: Record<string, unknown> = { project_id: projectId, description };
    if (milestone !== undefined) {
      params.milestone = milestone;
    }
    return this.call<unknown>('createGsdProject', params);
  }

  executeGsdPhase(projectId: string, phase: string): Promise<unknown> {
    return this.call<unknown>('executeGsdPhase', {
      project_id: projectId,
      phase,
    });
  }

  getGsdState(projectId: string): Promise<unknown> {
    return this.call<unknown>('getGsdState', { project_id: projectId });
  }

  startSessionCognitive(projectId: string, agent?: string): Promise<unknown> {
    const params: Record<string, unknown> = { project_id: projectId };
    if (agent !== undefined) {
      params.agent = agent;
    }
    return this.call<unknown>('startSessionCognitive', params);
  }

  createHandoffCognitive(params: {
    source_agent: string;
    target_agent: string;
    reason: string;
    state_summary: string;
    project_id?: string;
    priority?: string;
    memory_refs?: string[];
  }): Promise<unknown> {
    return this.call<unknown>('createHandoff', params as Record<string, unknown>);
  }

  resumeHandoff(handoffId: string): Promise<unknown> {
    return this.call<unknown>('resumeHandoff', { handoff_id: handoffId });
  }

  listHandoffs(params?: { project_id?: string; limit?: number }): Promise<unknown> {
    return this.call<unknown>('listHandoffs', params as Record<string, unknown> | undefined);
  }

  checkDecisionFidelity(action: string, projectId: string): Promise<unknown> {
    return this.call<unknown>('checkDecisionFidelity', {
      action,
      project_id: projectId,
    });
  }

  listRules(
    options?: { category?: string; enabled?: boolean },
  ): Promise<unknown> {
    return this.call<unknown>('listRules', options as Record<string, unknown>);
  }

  listExperts(
    options?: { category?: string; enabled?: boolean },
  ): Promise<unknown> {
    return this.call<unknown>('listExperts', options as Record<string, unknown>);
  }

  listCapsules(options?: { enabled?: boolean }): Promise<unknown> {
    return this.call<unknown>('listCapsules', options as Record<string, unknown>);
  }

  detectVerification(projectRoot: string): Promise<unknown> {
    return this.call<unknown>('detectVerification', { project_root: projectRoot });
  }

  critiqueResearch(work: string): Promise<unknown> {
    return this.call<unknown>('critiqueResearch', { work });
  }

  critiquePlan(work: string): Promise<unknown> {
    return this.call<unknown>('critiquePlan', { work });
  }

  // -----------------------------------------------------------------------
  // Typed convenience methods — Intelligence operations
  // -----------------------------------------------------------------------

  clusterMemories(params: {
    project_id?: string;
    min_cluster_size?: number;
    max_clusters?: number;
  }): Promise<unknown> {
    return this.call<unknown>('clusterMemories', params as Record<string, unknown>);
  }

  synthesizeSkill(params: {
    project_id?: string;
    min_occurrences?: number;
  }): Promise<unknown> {
    return this.call<unknown>('synthesizeSkill', params as Record<string, unknown>);
  }

  synthesizeAntiPattern(params: {
    project_id?: string;
    min_occurrences?: number;
  }): Promise<unknown> {
    return this.call<unknown>('synthesizeAntiPattern', params as Record<string, unknown>);
  }

  distillMemories(params: {
    project_id?: string;
    dry_run?: boolean;
  }): Promise<unknown> {
    return this.call<unknown>('distillMemories', params as Record<string, unknown>);
  }

  buildCodebaseMap(params: {
    root_path: string;
    project_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('buildCodebaseMap', params as Record<string, unknown>);
  }

  buildWorldModel(params: {
    project_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('buildWorldModel', params as Record<string, unknown>);
  }

  getCognitiveProfile(params: {
    project_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('getCognitiveProfile', params as Record<string, unknown>);
  }

  updateCognitiveProfile(params: {
    action: 'correction' | 'preference' | 'style';
    project_id?: string;
    correction?: { expected: string; actual: string; context: string };
    preference?: { key: string; value: string; category: string };
    style?: { dimension: string; value: number };
  }): Promise<unknown> {
    return this.call<unknown>('updateCognitiveProfile', params as Record<string, unknown>);
  }

  selfEvaluate(params: {
    project_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('selfEvaluate', params as Record<string, unknown>);
  }

  computeIntelligenceMetrics(params: {
    totalRetrievals: number;
    helpfulRetrievals: number;
    totalGateChecks: number;
    gatesPassed: number;
    totalFailures: number;
    lessonsCaptured: number;
    skillsSynthesizedLast30Days: number;
    avgTimeCurrentPeriod: number;
    avgTimePreviousPeriod: number;
  }): Promise<unknown> {
    return this.call<unknown>('computeIntelligenceMetrics', params as Record<string, unknown>);
  }

  analyzeProgress(params: {
    project_id?: string;
    task_description?: string;
  }): Promise<unknown> {
    return this.call<unknown>('analyzeProgress', params as Record<string, unknown>);
  }

  simulateStrategy(params: {
    goal: string;
    strategies: string[];
    project_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('simulateStrategy', params as Record<string, unknown>);
  }

  planTask(params: {
    task: string;
    project_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('planTask', params as Record<string, unknown>);
  }

  routeModel(params: {
    operation: string;
    complexity?: string;
    latency_sensitive?: boolean;
  }): Promise<unknown> {
    return this.call<unknown>('routeModel', params as Record<string, unknown>);
  }

  detectFriction(params: {
    project_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('detectFriction', params as Record<string, unknown>);
  }

  distillTrace(params: {
    trace: string;
    project_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('distillTrace', params as Record<string, unknown>);
  }

  synthesizeExperience(params: {
    project_id?: string;
    session_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('synthesizeExperience', params as Record<string, unknown>);
  }

  selectCompute(params: {
    task: string;
    confidence?: number;
  }): Promise<unknown> {
    return this.call<unknown>('selectCompute', params as Record<string, unknown>);
  }

  checkVerification(params: {
    task: string;
    artifacts?: string[];
  }): Promise<unknown> {
    return this.call<unknown>('checkVerification', params as Record<string, unknown>);
  }

  updateConfidence(params: {
    successes: number;
    failures: number;
    confidence: number;
    outcome: 'success' | 'partial' | 'failure';
    last_used_at?: string;
  }): Promise<unknown> {
    return this.call<unknown>('updateConfidence', params as Record<string, unknown>);
  }

  runBenchmark(params: {
    action: 'create_task' | 'record_run' | 'compare' | 'report';
    [key: string]: unknown;
  }): Promise<unknown> {
    return this.call<unknown>('runBenchmark', params as Record<string, unknown>);
  }

  // -----------------------------------------------------------------------
  // Typed convenience methods — Workflow operations
  // -----------------------------------------------------------------------

  getAgentDefinitions(): Promise<unknown> {
    return this.call<unknown>('getAgentDefinitions', {});
  }

  registerAgent(params: {
    name: string;
    description: string;
    displayName?: string;
    capabilities?: string[];
    triggers?: string[];
    constraints?: string[];
    successCriteria?: string[];
    priority?: number;
    status?: 'active' | 'draft' | 'archived';
  }): Promise<unknown> {
    return this.call<unknown>('registerAgent', params as Record<string, unknown>);
  }

  createCheckpoint(params: {
    type: 'human_verify' | 'decision' | 'human_action';
    description: string;
    context?: string;
    options?: string[];
  }): Promise<unknown> {
    return this.call<unknown>('createCheckpoint', params as Record<string, unknown>);
  }

  resolveCheckpoint(id: string, resolution?: string): Promise<unknown> {
    const params: Record<string, unknown> = { id };
    if (resolution !== undefined) params.resolution = resolution;
    return this.call<unknown>('resolveCheckpoint', params);
  }

  getPendingCheckpoints(): Promise<unknown> {
    return this.call<unknown>('getPendingCheckpoints', {});
  }

  createDebugSession(trigger: string): Promise<unknown> {
    return this.call<unknown>('createDebugSession', { trigger });
  }

  updateDebugSession(params: {
    action: string;
    session: Record<string, unknown>;
    symptom?: string;
    evidence?: string;
    eliminated?: string;
    focus?: { hypothesis: string; test: string; expecting: string; nextAction: string };
    resolution?: string;
    status?: string;
  }): Promise<unknown> {
    return this.call<unknown>('updateDebugSession', params as Record<string, unknown>);
  }

  trackDeviation(params: {
    rule: 1 | 2 | 3 | 4;
    type: string;
    description: string;
    task_id: string;
  }): Promise<unknown> {
    return this.call<unknown>('trackDeviation', params as Record<string, unknown>);
  }

  getDeviations(taskId?: string): Promise<unknown> {
    const params: Record<string, unknown> = {};
    if (taskId !== undefined) params.task_id = taskId;
    return this.call<unknown>('getDeviations', params);
  }

  createWorkflowPlan(params: {
    goal: string;
    context?: string;
    constraints?: string[];
    deliverable?: string;
    validation?: string[];
    project_id?: string;
  }): Promise<unknown> {
    return this.call<unknown>('createWorkflowPlan', params as Record<string, unknown>);
  }

  optimizePrompt(prompt: string, projectId?: string): Promise<unknown> {
    const params: Record<string, unknown> = { prompt };
    if (projectId !== undefined) params.project_id = projectId;
    return this.call<unknown>('optimizePrompt', params);
  }

  verifyArtifact(params: {
    artifact: string;
    description?: string;
    expected_patterns?: string[];
    expected_imports?: string[];
    root_path?: string;
  }): Promise<unknown> {
    return this.call<unknown>('verifyArtifact', params as Record<string, unknown>);
  }

  // -----------------------------------------------------------------------
  // Internal: data framing and dispatch
  // -----------------------------------------------------------------------

  /**
   * Accumulate incoming data, split by newline, and dispatch each complete
   * JSON message. Handles partial reads gracefully by buffering.
   */
  private handleData(chunk: string): void {
    this.buffer += chunk;

    let newlineIdx: number;

    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (line.length === 0) {
        continue;
      }

      let parsed: JsonRpcResponse | JsonRpcNotification;
      try {
        parsed = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
      } catch {
        // Malformed JSON — skip this line. In production the daemon should
        // never send invalid JSON; logging would be appropriate here but
        // is deferred to the daemon's own monitoring infrastructure.
        continue;
      }

      // Distinguish response (has `id`) from notification (no `id`)
      if ('id' in parsed && typeof (parsed as JsonRpcResponse).id === 'number') {
        this.handleResponse(parsed as JsonRpcResponse);
      } else {
        this.handleNotification(parsed as JsonRpcNotification);
      }
    }
  }

  /**
   * Resolve or reject the pending promise for the given response ID.
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (pending === undefined) {
      // Response for unknown or timed-out request — discard
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.error !== undefined) {
      pending.reject(
        new DaemonRpcError(
          response.error.code,
          response.error.message,
          response.error.data,
        ),
      );
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Route incoming notifications to matching event subscription handlers.
   */
  private handleNotification(notification: JsonRpcNotification): void {
    if (notification.method !== 'event' || notification.params === undefined) {
      return;
    }

    const event = notification.params as unknown as NoesisEvent;

    for (const [, sub] of this.eventHandlers) {
      if (sub.events.includes(event.type)) {
        try {
          sub.handler(event);
        } catch {
          // Handler errors are swallowed to prevent one bad handler from
          // breaking the entire notification pipeline.
        }
      }
    }
  }

  /**
   * Reject all pending requests with the given error. Used when the
   * connection drops or the client disconnects.
   */
  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }


  private isIpcPermissionDenied(error: unknown): boolean {
    const queue: unknown[] = [error];

    while (queue.length > 0) {
      const current = queue.shift();

      if (!(current instanceof Error)) {
        continue;
      }

      const code = (current as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') {
        return true;
      }

      if (
        /operation not permitted|permission denied|connect eperm|connect eacces/i.test(
          current.message,
        )
      ) {
        return true;
      }

      const cause = (current as Error & { cause?: unknown }).cause;
      if (cause !== undefined) {
        queue.push(cause);
      }
    }

    return false;
  }

  private shouldUseLocalFallback(error: unknown): boolean {
    if (this.isIpcPermissionDenied(error)) {
      return true;
    }

    if (
      error instanceof DaemonConnectionError ||
      error instanceof DaemonTimeoutError
    ) {
      return true;
    }

    if (
      error instanceof Error &&
      /not connected to daemon|connection closed by daemon|failed to connect to daemon|daemon did not start/i.test(
        error.message,
      )
    ) {
      return true;
    }

    return false;
  }

  private makeIpcPermissionDeniedError(error: unknown): DaemonConnectionError {
    return new DaemonConnectionError(
      `Noesis daemon IPC is blocked for ${this.socketPath}. ` +
        'The daemon may be healthy, but this sandbox cannot connect to the Unix socket. ' +
        'Run `noesis` outside the sandbox or allowlist the `noesis` command.',
      { cause: error instanceof Error ? error : undefined },
    );
  }

  private cleanupLocalRuntime(): void {
    if (this.localRuntime !== null) {
      this.localRuntime.cleanup();
      this.localRuntime = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: daemon spawning
  // -----------------------------------------------------------------------

  /**
   * Spawn the daemon process in the background. The child is detached and
   * stdio is ignored so it survives the parent process exiting.
   *
   * The daemon binary is resolved from the project's dist output so that
   * both development (`tsx`) and production (`node`) scenarios work.
   */
  private spawnDaemon(): void {
    // Resolve the daemon entry point relative to this file's compiled
    // location. In the dist layout: dist/daemon/client.js -> dist/daemon/main.js
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const daemonScript = resolve(currentDir, 'main.js');

    const child = spawn(process.execPath, [daemonScript], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        NOESIS_DAEMON: '1',
      },
    });

    // Allow the parent to exit without waiting for the child
    child.unref();
  }

  // -----------------------------------------------------------------------
  // Internal: utilities
  // -----------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new NoesisClient instance. Optionally override the socket path
 * for testing or non-standard deployments.
 */
export function createClient(socketPath?: string): NoesisClient {
  return new NoesisClient(socketPath);
}
