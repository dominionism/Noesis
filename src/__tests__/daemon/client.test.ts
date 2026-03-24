/**
 * Tests for src/daemon/client.ts
 *
 * Exercises connection lifecycle, auto-start logic, JSON-RPC 2.0 serialization,
 * timeout handling, event subscriptions, and all typed convenience methods.
 *
 * Uses a real Unix domain socket (via Node's net module) with a lightweight
 * mock server so that framing, buffering, and partial-read handling are tested
 * end-to-end without mocking internal implementation details.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server, type Socket as NetSocket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  NoesisClient,
  createClient,
  DaemonConnectionError,
  DaemonRpcError,
  DaemonTimeoutError,
} from '../../daemon/client.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Create a temporary directory for socket files. Each test gets a fresh
 * directory to avoid cross-test interference.
 */
function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'noesis-client-test-'));
}

/**
 * Minimal JSON-RPC 2.0 mock server. Listens on a Unix socket, echoes
 * requests through a configurable handler, and supports notifications.
 */
class MockDaemonServer {
  private server: Server;
  private clients: NetSocket[] = [];
  readonly socketPath: string;
  handler: (method: string, params: Record<string, unknown> | undefined, id: number) => unknown;

  constructor(socketPath: string) {
    this.socketPath = socketPath;
    // Default handler: return { ok: true }
    this.handler = () => ({ ok: true });

    this.server = createServer((socket) => {
      this.clients.push(socket);
      let buffer = '';

      socket.setEncoding('utf-8');

      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line.length === 0) continue;

          let request: {
            jsonrpc: string;
            id: number;
            method: string;
            params?: Record<string, unknown>;
          };

          try {
            request = JSON.parse(line);
          } catch {
            // Malformed JSON — ignore in tests
            continue;
          }

          try {
            const result = this.handler(request.method, request.params, request.id);

            // Allow handler to return a Promise
            if (result instanceof Promise) {
              result.then(
                (val) => {
                  const response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: val,
                  };
                  socket.write(JSON.stringify(response) + '\n');
                },
                (err) => {
                  const response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                      code: -32000,
                      message: String(err),
                    },
                  };
                  socket.write(JSON.stringify(response) + '\n');
                },
              );
            } else {
              const response = {
                jsonrpc: '2.0',
                id: request.id,
                result,
              };
              socket.write(JSON.stringify(response) + '\n');
            }
          } catch (handlerErr) {
            // Handler threw synchronously — send an error response
            const errorResponse = {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32000,
                message: String(handlerErr),
              },
            };
            socket.write(JSON.stringify(errorResponse) + '\n');
          }
        }
      });

      socket.on('close', () => {
        this.clients = this.clients.filter((c) => c !== socket);
      });
    });
  }

  /** Start listening on the socket path. */
  start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.on('error', reject);
      this.server.listen(this.socketPath, () => {
        resolve();
      });
    });
  }

  /** Send a JSON-RPC notification to all connected clients. */
  notify(method: string, params: Record<string, unknown>): void {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  /** Shut down the server and all connections. */
  async close(): Promise<void> {
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients = [];
    return new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NoesisClient', () => {
  let tmpDir: string;
  let socketPath: string;
  let server: MockDaemonServer;
  let client: NoesisClient;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    socketPath = join(tmpDir, 'test.sock');
    server = new MockDaemonServer(socketPath);
    await server.start();
    client = new NoesisClient(socketPath);
  });

  afterEach(async () => {
    client.disconnect();
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // createClient factory
  // -----------------------------------------------------------------------

  describe('createClient', () => {
    it('returns a NoesisClient instance', () => {
      const c = createClient(socketPath);
      expect(c).toBeInstanceOf(NoesisClient);
      c.disconnect();
    });

    it('uses default socket path when none provided', () => {
      const c = createClient();
      expect(c).toBeInstanceOf(NoesisClient);
      c.disconnect();
    });
  });

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  describe('connection lifecycle', () => {
    it('connects to a running daemon', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });

    it('reports not connected before connect() is called', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('disconnect() transitions to not connected', async () => {
      await client.connect();
      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('disconnect() is safe to call when already disconnected', () => {
      expect(() => client.disconnect()).not.toThrow();
    });

    it('connect() is idempotent when already connected', async () => {
      await client.connect();
      await client.connect(); // Should not throw
      expect(client.isConnected()).toBe(true);
    });

    it('rejects connection to non-existent socket', async () => {
      const badClient = new NoesisClient(join(tmpDir, 'nonexistent.sock'));
      await expect(badClient.connect()).rejects.toThrow(DaemonConnectionError);
      badClient.disconnect();
    });

    it('rejects pending requests when connection closes', async () => {
      await client.connect();

      // Set handler to never respond (simulates hanging server)
      server.handler = () => new Promise(() => { /* never resolves */ });

      const callPromise = client.call('slow_method');

      // Close server to trigger connection close
      await server.close();

      await expect(callPromise).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // RPC call serialization
  // -----------------------------------------------------------------------

  describe('RPC call serialization', () => {
    it('sends valid JSON-RPC 2.0 request and receives result', async () => {
      server.handler = (method, params) => {
        return { method, params, echo: true };
      };

      await client.connect();

      const result = await client.call<{
        method: string;
        params: Record<string, unknown> | undefined;
        echo: boolean;
      }>('test_method', { foo: 'bar' });

      expect(result.method).toBe('noesis.test_method');
      expect(result.params).toEqual({ foo: 'bar' });
      expect(result.echo).toBe(true);
    });

    it('sends request without params when none provided', async () => {
      server.handler = (method, params) => {
        return { method, hasParams: params !== undefined };
      };

      await client.connect();

      const result = await client.call<{
        method: string;
        hasParams: boolean;
      }>('no_params');

      expect(result.method).toBe('noesis.no_params');
    });

    it('uses auto-incrementing request IDs', async () => {
      const seenIds: number[] = [];

      server.handler = (_method, _params, id) => {
        seenIds.push(id);
        return { ok: true };
      };

      await client.connect();

      await client.call('first');
      await client.call('second');
      await client.call('third');

      expect(seenIds).toHaveLength(3);
      // IDs should be monotonically increasing
      expect(seenIds[1]).toBeGreaterThan(seenIds[0]);
      expect(seenIds[2]).toBeGreaterThan(seenIds[1]);
    });

    it('rejects when server returns an RPC error', async () => {
      server.handler = () => {
        throw new Error('Something broke');
      };

      await client.connect();

      await expect(client.call('failing_method')).rejects.toThrow(DaemonRpcError);
    });

    it('auto-connects when call() is invoked before connect()', async () => {
      server.handler = () => ({ ok: true });

      await expect(client.call('any_method')).resolves.toEqual({ ok: true });
      expect(client.isConnected()).toBe(true);
    });

    it('handles concurrent requests correctly', async () => {
      server.handler = (method) => {
        return { result: method };
      };

      await client.connect();

      const [r1, r2, r3] = await Promise.all([
        client.call<{ result: string }>('method_a'),
        client.call<{ result: string }>('method_b'),
        client.call<{ result: string }>('method_c'),
      ]);

      expect(r1.result).toBe('noesis.method_a');
      expect(r2.result).toBe('noesis.method_b');
      expect(r3.result).toBe('noesis.method_c');
    });
  });

  // -----------------------------------------------------------------------
  // Data framing: partial reads and buffering
  // -----------------------------------------------------------------------

  describe('data framing', () => {
    it('handles responses split across multiple chunks', async () => {
      // Override server to send response in two chunks
      const originalServer = server;
      await originalServer.close();

      const splitServer = createServer((socket) => {
        let buf = '';
        socket.setEncoding('utf-8');
        socket.on('data', (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (line.length === 0) continue;

            const request = JSON.parse(line);
            const response = JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: { split: true },
            }) + '\n';

            // Send first half, then second half after a short delay
            const mid = Math.floor(response.length / 2);
            socket.write(response.slice(0, mid));
            setTimeout(() => {
              socket.write(response.slice(mid));
            }, 10);
          }
        });
      });

      await new Promise<void>((resolve) => {
        splitServer.listen(socketPath, resolve);
      });

      const splitClient = new NoesisClient(socketPath);

      try {
        await splitClient.connect();
        const result = await splitClient.call<{ split: boolean }>('test');
        expect(result.split).toBe(true);
      } finally {
        splitClient.disconnect();
        await new Promise<void>((resolve) => {
          splitServer.close(() => resolve());
        });
      }

      // Re-create original server for afterEach cleanup
      server = new MockDaemonServer(socketPath);
      await server.start();
    });

    it('handles multiple responses in a single chunk', async () => {
      // Override server to batch two responses in one write
      const originalServer = server;
      await originalServer.close();

      let requestCount = 0;
      const batchServer = createServer((socket) => {
        let buf = '';
        const responses: string[] = [];
        socket.setEncoding('utf-8');
        socket.on('data', (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (line.length === 0) continue;

            const request = JSON.parse(line);
            requestCount++;
            responses.push(
              JSON.stringify({
                jsonrpc: '2.0',
                id: request.id,
                result: { n: requestCount },
              }),
            );

            // After collecting 2 responses, send them in one write
            if (responses.length === 2) {
              socket.write(responses.join('\n') + '\n');
              responses.length = 0;
            }
          }
        });
      });

      await new Promise<void>((resolve) => {
        batchServer.listen(socketPath, resolve);
      });

      const batchClient = new NoesisClient(socketPath);

      try {
        await batchClient.connect();
        const [r1, r2] = await Promise.all([
          batchClient.call<{ n: number }>('a'),
          batchClient.call<{ n: number }>('b'),
        ]);

        expect(r1.n).toBeDefined();
        expect(r2.n).toBeDefined();
        // Both should have resolved
        expect(new Set([r1.n, r2.n]).size).toBe(2);
      } finally {
        batchClient.disconnect();
        await new Promise<void>((resolve) => {
          batchServer.close(() => resolve());
        });
      }

      // Re-create original server for afterEach cleanup
      server = new MockDaemonServer(socketPath);
      await server.start();
    });
  });

  // -----------------------------------------------------------------------
  // Timeout handling
  // -----------------------------------------------------------------------

  describe('timeout handling', () => {
    it('DaemonTimeoutError has correct properties', () => {
      const err = new DaemonTimeoutError('test_method', 5000);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DaemonTimeoutError);
      expect(err.message).toContain('test_method');
      expect(err.message).toContain('5000');
    });

    it('connection times out when socket is unreachable', async () => {
      await server.close();

      const badSocketPath = join(tmpDir, 'unreachable.sock');
      const badClient = new NoesisClient(badSocketPath);

      await expect(badClient.connect()).rejects.toThrow(DaemonConnectionError);
      badClient.disconnect();

      // Re-create server for afterEach cleanup
      server = new MockDaemonServer(socketPath);
      await server.start();
    });
  });

  // -----------------------------------------------------------------------
  // Typed convenience methods
  // -----------------------------------------------------------------------

  describe('typed convenience methods', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('recall() sends correct method and params', async () => {
      let capturedMethod = '';
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (method, params) => {
        capturedMethod = method;
        capturedParams = params;
        return {
          memories: [],
          conflicts: [],
          total_candidates: 0,
          retrieval_time_ms: 5,
        };
      };

      const result = await client.recall({
        query: 'test query',
        project_id: 'proj-1',
        limit: 10,
      });

      expect(capturedMethod).toBe('noesis.recall');
      expect(capturedParams).toMatchObject({
        query: 'test query',
        project_id: 'proj-1',
        limit: 10,
      });
      expect(result.memories).toEqual([]);
      expect(result.total_candidates).toBe(0);
    });

    it('remember() sends correct method and params', async () => {
      let capturedMethod = '';

      server.handler = (method) => {
        capturedMethod = method;
        return {
          id: 'test-id',
          type: 'decision',
          title: 'Test',
          content: 'content',
        };
      };

      await client.remember({
        type: 'decision',
        title: 'Test Decision',
        content: 'We decided X',
        tags: ['arch'],
      });

      expect(capturedMethod).toBe('noesis.remember');
    });

    it('forget() sends correct method and params', async () => {
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (_method, params) => {
        capturedParams = params;
        return null;
      };

      await client.forget('memory-123');

      expect(capturedParams).toEqual({ id: 'memory-123' });
    });

    it('retrievalGap() sends query and optional projectId', async () => {
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (_method, params) => {
        capturedParams = params;
        return { total_results: 0, missing_types: [] };
      };

      await client.retrievalGap('how to deploy', 'proj-x');

      expect(capturedParams).toEqual({
        query: 'how to deploy',
        project_id: 'proj-x',
      });
    });

    it('retrievalGap() omits projectId when not provided', async () => {
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (_method, params) => {
        capturedParams = params;
        return { total_results: 0 };
      };

      await client.retrievalGap('some query');

      expect(capturedParams).toEqual({ query: 'some query' });
      expect(capturedParams).not.toHaveProperty('project_id');
    });

    it('checkAction() sends correct params', async () => {
      let capturedMethod = '';
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (method, params) => {
        capturedMethod = method;
        capturedParams = params;
        return { warnings: [], warning_count: 0 };
      };

      await client.checkAction('delete database', 'proj-1');

      expect(capturedMethod).toBe('noesis.check_action');
      expect(capturedParams).toEqual({
        action: 'delete database',
        project_id: 'proj-1',
      });
    });

    it('explain() sends correct params', async () => {
      let capturedMethod = '';
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (method, params) => {
        capturedMethod = method;
        capturedParams = params;
        return { results: [] };
      };

      await client.explain('mem-1', 'why this?', 'proj-2');

      expect(capturedMethod).toBe('noesis.explain');
      expect(capturedParams).toEqual({
        memory_id: 'mem-1',
        query: 'why this?',
        project_id: 'proj-2',
      });
    });

    it('sessionStart() sends correct params', async () => {
      let capturedMethod = '';
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (method, params) => {
        capturedMethod = method;
        capturedParams = params;
        return { session_id: 'sess-abc' };
      };

      const result = await client.sessionStart({
        project_id: 'proj-1',
        agent: 'claude',
      });

      expect(capturedMethod).toBe('noesis.session_start');
      expect(capturedParams).toMatchObject({
        project_id: 'proj-1',
        agent: 'claude',
      });
      expect(result.session_id).toBe('sess-abc');
    });

    it('sessionEnd() sends correct params with optional summary', async () => {
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (_method, params) => {
        capturedParams = params;
        return null;
      };

      await client.sessionEnd('sess-abc', 'Completed migration');

      expect(capturedParams).toEqual({
        session_id: 'sess-abc',
        summary: 'Completed migration',
      });
    });

    it('sessionEnd() omits summary when not provided', async () => {
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (_method, params) => {
        capturedParams = params;
        return null;
      };

      await client.sessionEnd('sess-abc');

      expect(capturedParams).toEqual({ session_id: 'sess-abc' });
      expect(capturedParams).not.toHaveProperty('summary');
    });

    it('sessionList() sends correct params', async () => {
      let capturedMethod = '';

      server.handler = (method) => {
        capturedMethod = method;
        return [];
      };

      const result = await client.sessionList({ project_id: 'proj-1', limit: 5 });

      expect(capturedMethod).toBe('noesis.session_list');
      expect(result).toEqual([]);
    });

    it('sync() sends correct params', async () => {
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (_method, params) => {
        capturedParams = params;
        return { tokens_injected: 100 };
      };

      await client.sync('claude-code', 'proj-1');

      expect(capturedParams).toEqual({
        adapter_id: 'claude-code',
        project_id: 'proj-1',
      });
    });

    it('sync() omits projectId when not provided', async () => {
      let capturedParams: Record<string, unknown> | undefined;

      server.handler = (_method, params) => {
        capturedParams = params;
        return { tokens_injected: 0 };
      };

      await client.sync('cursor');

      expect(capturedParams).toEqual({ adapter_id: 'cursor' });
      expect(capturedParams).not.toHaveProperty('project_id');
    });
  });

  // -----------------------------------------------------------------------
  // Event subscription
  // -----------------------------------------------------------------------

  describe('event subscription', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('subscribe() registers handler and receives matching events', async () => {
      const received: unknown[] = [];

      server.handler = (method) => {
        if (method === 'noesis.subscribe') return null;
        if (method === 'noesis.unsubscribe') return null;
        return { ok: true };
      };

      const unsubscribe = await client.subscribe(
        ['memory_written'],
        (event) => {
          received.push(event);
        },
      );

      // Simulate the daemon sending a notification
      server.notify('event', {
        type: 'memory_written',
        payload: { id: 'mem-1', type: 'task', project_id: null, scope: 'global' },
      });

      // Give the notification time to arrive
      await new Promise((r) => setTimeout(r, 50));

      expect(received).toHaveLength(1);
      expect((received[0] as { type: string }).type).toBe('memory_written');

      // Unsubscribe
      unsubscribe();
    });

    it('unsubscribe function stops event delivery', async () => {
      const received: unknown[] = [];

      server.handler = () => null;

      const unsubscribe = await client.subscribe(
        ['memory_written'],
        (event) => {
          received.push(event);
        },
      );

      unsubscribe();

      // Send event after unsubscribe
      server.notify('event', {
        type: 'memory_written',
        payload: { id: 'mem-1', type: 'task', project_id: null, scope: 'global' },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(received).toHaveLength(0);
    });

    it('filters events by subscribed types', async () => {
      const received: unknown[] = [];

      server.handler = () => null;

      const unsubscribe = await client.subscribe(
        ['skill_promoted'],
        (event) => {
          received.push(event);
        },
      );

      // Send non-matching event
      server.notify('event', {
        type: 'memory_written',
        payload: { id: 'mem-1', type: 'task', project_id: null, scope: 'global' },
      });

      // Send matching event
      server.notify('event', {
        type: 'skill_promoted',
        payload: { skill_name: 'deployment', confidence: 0.9 },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(received).toHaveLength(1);
      expect((received[0] as { type: string }).type).toBe('skill_promoted');

      unsubscribe();
    });

    it('handler errors do not break other subscriptions', async () => {
      const received: unknown[] = [];

      server.handler = () => null;

      // First subscription throws
      const unsub1 = await client.subscribe(
        ['memory_written'],
        () => {
          throw new Error('Handler blew up');
        },
      );

      // Second subscription records
      const unsub2 = await client.subscribe(
        ['memory_written'],
        (event) => {
          received.push(event);
        },
      );

      server.notify('event', {
        type: 'memory_written',
        payload: { id: 'mem-1', type: 'task', project_id: null, scope: 'global' },
      });

      await new Promise((r) => setTimeout(r, 50));

      // Second handler should still receive the event
      expect(received).toHaveLength(1);

      unsub1();
      unsub2();
    });
  });

  // -----------------------------------------------------------------------
  // Error types
  // -----------------------------------------------------------------------

  describe('error types', () => {
    it('DaemonConnectionError has correct name', () => {
      const err = new DaemonConnectionError('test');
      expect(err.name).toBe('DaemonConnectionError');
      expect(err.message).toBe('test');
    });

    it('DaemonRpcError exposes code and data', () => {
      const err = new DaemonRpcError(-32600, 'Invalid request', { detail: 'x' });
      expect(err.name).toBe('DaemonRpcError');
      expect(err.code).toBe(-32600);
      expect(err.data).toEqual({ detail: 'x' });
    });

    it('DaemonTimeoutError has correct name and message', () => {
      const err = new DaemonTimeoutError('test_method', 5000);
      expect(err.name).toBe('DaemonTimeoutError');
      expect(err.message).toContain('test_method');
      expect(err.message).toContain('5000');
    });
  });

  // -----------------------------------------------------------------------
  // RPC error handling
  // -----------------------------------------------------------------------

  describe('RPC error handling', () => {
    it('surfaces server-side errors as DaemonRpcError', async () => {
      // Override server to return an explicit error response
      const originalServer = server;
      await originalServer.close();

      const errorServer = createServer((socket) => {
        let buf = '';
        socket.setEncoding('utf-8');
        socket.on('data', (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (line.length === 0) continue;

            const request = JSON.parse(line);
            const response = {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: 'Method not found',
                data: { method: request.method },
              },
            };
            socket.write(JSON.stringify(response) + '\n');
          }
        });
      });

      await new Promise<void>((resolve) => {
        errorServer.listen(socketPath, resolve);
      });

      const errorClient = new NoesisClient(socketPath);

      try {
        await errorClient.connect();
        const err = await errorClient.call('unknown_method').catch((e) => e);
        expect(err).toBeInstanceOf(DaemonRpcError);
        expect((err as DaemonRpcError).code).toBe(-32601);
        expect((err as DaemonRpcError).message).toBe('Method not found');
      } finally {
        errorClient.disconnect();
        await new Promise<void>((resolve) => {
          errorServer.close(() => resolve());
        });
      }

      // Re-create original server for afterEach cleanup
      server = new MockDaemonServer(socketPath);
      await server.start();
    });
  });

  // -----------------------------------------------------------------------
  // ensureDaemon (auto-start logic)
  // -----------------------------------------------------------------------

  describe('ensureDaemon', () => {
    it('succeeds when daemon is already running', async () => {
      server.handler = (method) => {
        if (method === 'noesis.ping') return { status: 'ok' };
        return { ok: true };
      };

      await client.ensureDaemon();
      expect(client.isConnected()).toBe(true);
    });

    it('skips spawn when already connected', async () => {
      server.handler = (method) => {
        if (method === 'noesis.ping') return { status: 'ok' };
        return { ok: true };
      };

      await client.connect();
      await client.call('ping'); // verify connection

      // Calling ensureDaemon when already connected should be a no-op
      await client.ensureDaemon();
      expect(client.isConnected()).toBe(true);
    });

    it('falls back to local read mode when daemon cannot be started', async () => {
      await server.close();

      // With no live daemon socket available, the client should fall back to
      // the local read-only runtime for safe methods like ping.
      const isolatedClient = new NoesisClient(join(tmpDir, 'no-daemon.sock'));

      await expect(isolatedClient.ensureDaemon()).resolves.toBeUndefined();
      await expect(isolatedClient.call('ping')).resolves.toEqual({ status: 'ok' });

      isolatedClient.disconnect();

      // Re-create server for afterEach cleanup
      server = new MockDaemonServer(socketPath);
      await server.start();
    });
  });
});
