import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  createRpcHandler,
  resetIdleTimer,
} from '../../daemon/rpc.js';
import type { JsonRpcResponse, RpcDependencies } from '../../daemon/rpc.js';
import { eventBus } from '../../daemon/events.js';
import { getMemory } from '../../core/memory-crud.js';

let db: DatabaseConnection;
let tempDir: string;
let handle: (message: string) => Promise<JsonRpcResponse>;

/**
 * Create a minimal RpcDependencies object with stubs for all
 * external dependencies. Tests that exercise specific methods
 * can override individual stubs.
 */
function makeDeps(overrides: Partial<RpcDependencies> = {}): RpcDependencies {
  return {
    db,
    embeddingProvider: {
      modelId: 'test-model',
      dimensions: 384,
      embed: vi.fn().mockResolvedValue(new Float32Array(384)),
      embedBatch: vi.fn().mockResolvedValue([new Float32Array(384)]),
    },
    verifySignature: vi.fn().mockReturnValue({ valid: true, tampered: false }),
    scanSecrets: vi.fn().mockImplementation((text: string) => ({
      clean: text,
      redacted: false,
      matches: [],
    })),
    signMemory: vi.fn().mockReturnValue('test-signature'),
    scanAndRedact: vi.fn().mockImplementation((text: string) => ({
      clean: text,
      redacted: false,
      matches: [],
    })),
    checkDangerousPatterns: vi.fn().mockReturnValue([]),
    writeAuditLog: vi.fn(),
    generateId: vi.fn().mockImplementation(() => {
      // Generate a unique-enough ID for tests
      return 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }),
    secretScanMode: 'redact',
    getMemory: (id: string) => getMemory(db, id),
    verifyMemory: vi.fn().mockReturnValue({ valid: true }),
    getUnresolvedConflictCount: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

function rpcMessage(method: string, params?: Record<string, unknown>, id: string | number = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params,
  });
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'noesis-rpc-test-'));
  db = DatabaseConnection.create(join(tempDir, 'test.db'));
  handle = createRpcHandler(makeDeps());
  eventBus.clear();
});

afterEach(() => {
  db.close();
  DatabaseConnection.resetInstance();
  rmSync(tempDir, { recursive: true, force: true });
  resetIdleTimer(null);
  eventBus.clear();
});

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 protocol compliance
// ---------------------------------------------------------------------------

describe('JSON-RPC 2.0 protocol', () => {
  it('returns parse error for invalid JSON', async () => {
    const res = await handle('not json at all');
    expect(res.error?.code).toBe(-32700);
    expect(res.id).toBeNull();
  });

  it('returns invalid request for non-object', async () => {
    const res = await handle(JSON.stringify([1, 2, 3]));
    expect(res.error?.code).toBe(-32600);
  });

  it('returns invalid request when jsonrpc is not "2.0"', async () => {
    const res = await handle(JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'test' }));
    expect(res.error?.code).toBe(-32600);
  });

  it('returns invalid request when method is not a string', async () => {
    const res = await handle(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 123 }));
    expect(res.error?.code).toBe(-32600);
  });

  it('returns invalid params when params is not an object', async () => {
    const res = await handle(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'noesis.recall', params: 'invalid' }));
    expect(res.error?.code).toBe(-32602);
  });

  it('returns invalid params when params is an array', async () => {
    const res = await handle(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'noesis.recall', params: [1, 2] }));
    expect(res.error?.code).toBe(-32602);
  });

  it('returns method not found for unknown methods', async () => {
    const res = await handle(rpcMessage('noesis.nonexistent'));
    expect(res.error?.code).toBe(-32601);
    expect(res.error?.message).toContain('noesis.nonexistent');
  });

  it('returns the request id in the response', async () => {
    const res = await handle(rpcMessage('noesis.nonexistent', {}, 42));
    expect(res.id).toBe(42);
  });

  it('handles null id', async () => {
    const msg = JSON.stringify({ jsonrpc: '2.0', id: null, method: 'noesis.planCreate' });
    const res = await handle(msg);
    expect(res.id).toBeNull();
    expect(res.jsonrpc).toBe('2.0');
  });

  it('accepts string id', async () => {
    const res = await handle(rpcMessage('noesis.sessionList', {}, 'uuid-123'));
    expect(res.id).toBe('uuid-123');
    expect(res.result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Idle timer
// ---------------------------------------------------------------------------

describe('idle timer', () => {
  it('calls the activity callback on successful dispatch', async () => {
    const callback = vi.fn();
    resetIdleTimer(callback);

    await handle(rpcMessage('noesis.sessionList'));

    expect(callback).toHaveBeenCalledOnce();
  });

  it('does not call activity callback on error', async () => {
    const callback = vi.fn();
    resetIdleTimer(callback);

    await handle('invalid json');

    expect(callback).not.toHaveBeenCalled();
  });

  it('does not call activity callback when null', async () => {
    resetIdleTimer(null);

    // Should not throw
    const res = await handle(rpcMessage('noesis.sessionList'));
    expect(res.result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Memory methods
// ---------------------------------------------------------------------------

describe('noesis.recall', () => {
  it('requires query parameter', async () => {
    const res = await handle(rpcMessage('noesis.recall', {}));
    expect(res.error?.code).toBe(-32602);
    expect(res.error?.message).toContain('query');
  });

  it('calls hybrid retrieval and returns results', async () => {
    const res = await handle(rpcMessage('noesis.recall', { query: 'test query' }));
    // With an empty database, expect empty results (no error)
    expect(res.error).toBeUndefined();
    expect(res.result).toBeDefined();

    const result = res.result as Record<string, unknown>;
    expect(result).toHaveProperty('memories');
    expect(result).toHaveProperty('total_candidates');
  });
});

describe('noesis.remember', () => {
  it('requires type, title, and content', async () => {
    const res1 = await handle(rpcMessage('noesis.remember', { title: 't', content: 'c' }));
    expect(res1.error?.code).toBe(-32602);

    const res2 = await handle(rpcMessage('noesis.remember', { type: 'task', content: 'c' }));
    expect(res2.error?.code).toBe(-32602);

    const res3 = await handle(rpcMessage('noesis.remember', { type: 'task', title: 't' }));
    expect(res3.error?.code).toBe(-32602);
  });

  it('creates a memory through the write pipeline', async () => {
    const res = await handle(rpcMessage('noesis.remember', {
      type: 'task',
      title: 'Test Task',
      content: 'This is a test task content',
      tags: ['test', 'unit'],
    }));

    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect(result['success']).toBe(true);
    expect(result['memory']).toBeDefined();

    const memory = result['memory'] as Record<string, unknown>;
    expect(memory['type']).toBe('task');
    expect(memory['title']).toBe('Test Task');
  });
});

describe('noesis.forget', () => {
  it('requires id parameter', async () => {
    const res = await handle(rpcMessage('noesis.forget', {}));
    expect(res.error?.code).toBe(-32602);
    expect(res.error?.message).toContain('id');
  });

  it('deletes a memory', async () => {
    // First create a memory
    const createRes = await handle(rpcMessage('noesis.remember', {
      type: 'task',
      title: 'To Delete',
      content: 'Will be deleted',
    }));
    const memory = (createRes.result as Record<string, unknown>)['memory'] as Record<string, unknown>;
    const memId = memory['id'] as string;

    // Then delete it
    const deleteRes = await handle(rpcMessage('noesis.forget', { id: memId }));
    expect(deleteRes.error).toBeUndefined();
    expect((deleteRes.result as Record<string, unknown>)['success']).toBe(true);
  });
});

describe('noesis.retrievalGap', () => {
  it('requires query parameter', async () => {
    const res = await handle(rpcMessage('noesis.retrievalGap', {}));
    expect(res.error?.code).toBe(-32602);
  });

  it('returns gap analysis results', async () => {
    const res = await handle(rpcMessage('noesis.retrievalGap', { query: 'build API' }));
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect(result).toHaveProperty('total_results');
    expect(result).toHaveProperty('missing_types');
    expect(result).toHaveProperty('coverage_summary');
  });
});

describe('noesis.checkAction', () => {
  it('requires action parameter', async () => {
    const res = await handle(rpcMessage('noesis.checkAction', {}));
    expect(res.error?.code).toBe(-32602);
    expect(res.error?.message).toContain('action');
  });

  it('returns action advisory results', async () => {
    const res = await handle(rpcMessage('noesis.checkAction', { action: 'deploy to prod' }));
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('warning_count');
  });
});

describe('noesis.explain', () => {
  it('requires query parameter', async () => {
    const res = await handle(rpcMessage('noesis.explain', {}));
    expect(res.error?.code).toBe(-32602);
    expect(res.error?.message).toContain('query');
  });

  it('returns explain results', async () => {
    const res = await handle(rpcMessage('noesis.explain', { query: 'test query' }));
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect(result).toHaveProperty('query_embedding_preview');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('applied_filters');
  });
});

// ---------------------------------------------------------------------------
// Session methods
// ---------------------------------------------------------------------------

describe('noesis.sessionStart', () => {
  it('creates a session memory and returns session_id', async () => {
    const res = await handle(rpcMessage('noesis.sessionStart', { agent: 'claude' }));
    expect(res.error).toBeUndefined();

    const result = res.result as Record<string, unknown>;
    expect(result['session_id']).toBeDefined();
    expect(typeof result['session_id']).toBe('string');
    expect(result['started_at']).toBeDefined();
  });

  it('creates session with project_id', async () => {
    const res = await handle(rpcMessage('noesis.sessionStart', {
      agent: 'codex',
      project_id: 'proj-1',
    }));
    expect(res.error).toBeUndefined();

    const result = res.result as Record<string, unknown>;
    const sessionId = result['session_id'] as string;

    // Verify the memory was created
    const mem = getMemory(db, sessionId);
    expect(mem).not.toBeNull();
    expect(mem!.type).toBe('session');
    expect(mem!.project_id).toBe('proj-1');
  });

  it('defaults agent to "unknown" when not provided', async () => {
    const res = await handle(rpcMessage('noesis.sessionStart', {}));
    expect(res.error).toBeUndefined();

    const result = res.result as Record<string, unknown>;
    const sessionId = result['session_id'] as string;
    const mem = getMemory(db, sessionId);
    expect(mem!.title).toContain('unknown');
  });
});

describe('noesis.sessionEnd', () => {
  it('requires session_id parameter', async () => {
    const res = await handle(rpcMessage('noesis.sessionEnd', {}));
    expect(res.error?.code).toBe(-32602);
  });

  it('returns error for nonexistent session', async () => {
    const res = await handle(rpcMessage('noesis.sessionEnd', { session_id: 'nonexistent' }));
    // getMemory returns null for nonexistent, then access_count increment causes it to return null
    // The RPC handler should return an error
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32602);
  });

  it('updates session with ended_at and summary', async () => {
    // Start a session first
    const startRes = await handle(rpcMessage('noesis.sessionStart', { agent: 'test' }));
    const sessionId = (startRes.result as Record<string, unknown>)['session_id'] as string;

    // End it
    const endRes = await handle(rpcMessage('noesis.sessionEnd', {
      session_id: sessionId,
      summary: 'Completed successfully',
    }));

    expect(endRes.error).toBeUndefined();
    const result = endRes.result as Record<string, unknown>;
    expect(result['session_id']).toBe(sessionId);
    expect(result['ended_at']).toBeDefined();

    // Verify the memory was updated
    const mem = getMemory(db, sessionId);
    const content = JSON.parse(mem!.content);
    expect(content.status).toBe('completed');
    expect(content.summary).toBe('Completed successfully');
  });
});

describe('noesis.sessionList', () => {
  it('returns empty list when no sessions exist', async () => {
    const res = await handle(rpcMessage('noesis.sessionList', {}));
    expect(res.error).toBeUndefined();

    const result = res.result as Record<string, unknown>;
    expect(result['sessions']).toEqual([]);
    expect(result['count']).toBe(0);
  });

  it('lists sessions after creation', async () => {
    await handle(rpcMessage('noesis.sessionStart', { agent: 'agent-a' }));
    await handle(rpcMessage('noesis.sessionStart', { agent: 'agent-b' }));

    const res = await handle(rpcMessage('noesis.sessionList', {}));
    expect(res.error).toBeUndefined();

    const result = res.result as Record<string, unknown>;
    const sessions = result['sessions'] as unknown[];
    expect(sessions.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Sync methods (placeholders)
// ---------------------------------------------------------------------------

describe('noesis.sync', () => {
  it('accepts empty params and returns a status', async () => {
    const res = await handle(rpcMessage('noesis.sync', {}));
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect(typeof result['status']).toBe('string');
  });

  it('returns a result with adapter_id', async () => {
    const res = await handle(rpcMessage('noesis.sync', { adapter_id: 'claude-code' }));
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect(typeof result['status']).toBe('string');
  });
});

describe('noesis.subscribe', () => {
  it('requires events array', async () => {
    const res = await handle(rpcMessage('noesis.subscribe', {}));
    expect(res.error?.code).toBe(-32602);
  });

  it('rejects empty events array', async () => {
    const res = await handle(rpcMessage('noesis.subscribe', { events: [] }));
    expect(res.error?.code).toBe(-32602);
  });

  it('returns not_implemented status', async () => {
    const res = await handle(rpcMessage('noesis.subscribe', {
      events: ['memory_written', 'skill_promoted'],
    }));
    expect(res.error).toBeUndefined();
    expect((res.result as Record<string, unknown>)['status']).toBe('not_implemented');
  });
});

// ---------------------------------------------------------------------------
// Cognitive methods registration
// ---------------------------------------------------------------------------

describe('cognitive methods registration', () => {
  const cognitiveMethods = [
    'noesis.orchestrate',
    'noesis.checkCompliance',
    'noesis.routeExpertCognitive',
    'noesis.matchCapsuleDeep',
    'noesis.matchSkills',
    'noesis.getContexts',
    'noesis.updateContext',
    'noesis.checkReadinessEvidence',
    'noesis.checkQualityGate',
    'noesis.predictFailures',
    'noesis.processLearning',
    'noesis.createGsdProject',
    'noesis.executeGsdPhase',
    'noesis.getGsdState',
    'noesis.startSessionCognitive',
    'noesis.createHandoff',
    'noesis.resumeHandoff',
    'noesis.checkDecisionFidelity',
    'noesis.listRules',
    'noesis.listExperts',
    'noesis.listCapsules',
    'noesis.detectVerification',
    'noesis.critiqueResearch',
    'noesis.critiquePlan',
  ];

  for (const method of cognitiveMethods) {
    it(`${method} is registered (not method-not-found)`, async () => {
      const res = await handle(rpcMessage(method));
      // Should not be method not found (-32601)
      // May fail with invalid params (-32602) or internal error (-32603),
      // but the method must be registered.
      if (res.error) {
        expect(res.error.code).not.toBe(-32601);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('catches internal errors and returns -32603', async () => {
    const badDeps = makeDeps({
      getMemory: () => {
        throw new Error('database exploded');
      },
    });
    const badHandle = createRpcHandler(badDeps);

    // sessionEnd calls getMemory internally
    const res = await badHandle(rpcMessage('noesis.sessionEnd', { session_id: 'test-id' }));
    // The error should be caught and returned as internal error
    expect(res.error).toBeDefined();
    expect(res.error?.message).toContain('database exploded');
  });

  it('does not leak stack traces in error responses', async () => {
    const res = await handle('{{invalid');
    expect(res.error).toBeDefined();
    expect(res.error?.message).not.toContain('at ');
    expect(res.error?.message).not.toContain('.ts:');
  });
});

// ---------------------------------------------------------------------------
// Event emission integration
// ---------------------------------------------------------------------------

describe('event emission', () => {
  it('emits memory_written event on noesis.sessionStart', async () => {
    const received: unknown[] = [];
    eventBus.subscribe('memory_written', (e) => received.push(e));

    await handle(rpcMessage('noesis.sessionStart', { agent: 'test-agent' }));

    expect(received.length).toBeGreaterThanOrEqual(1);
  });
});
