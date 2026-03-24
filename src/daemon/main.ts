/**
 * Daemon Entry Point
 *
 * This is the file spawned by NoesisClient.spawnDaemon() and by NemoClaw's
 * noesis-bridge.ensureDaemon(). It wires together:
 *   1. startDaemon() — lifecycle, database, embeddings, signing key, socket
 *   2. createRpcHandler() — JSON-RPC 2.0 method dispatch
 *   3. Socket connection handling — newline-delimited JSON-RPC framing
 *   4. Idle timer integration — RPC activity resets the shutdown timer
 *
 * Security: inherits all protections from server.ts (PID file, socket
 * permissions, database integrity checks) and rpc.ts (method whitelist,
 * parameterized queries, no stack traces in error responses).
 */

import { startDaemon, resetIdleTimer as resetServerIdleTimer } from './server.js';
import { createRpcHandler, resetIdleTimer as setRpcActivityCallback } from './rpc.js';
import { DatabaseConnection } from '../core/database.js';
import { generateId } from '../core/ulid.js';
import { getMemory } from '../core/memory-crud.js';
import { writeAuditLog } from '../security/audit.js';
import { checkDangerousPatterns } from '../security/dangerous-patterns.js';
import { scanForSecrets, redactSecrets, scanAndRedact } from '../security/secret-scanner.js';

import type { RpcDependencies } from './rpc.js';
import type { EmbeddingProvider } from '../types.js';
import type { Memory, SecretMatch } from '../types.js';
import type { Socket } from 'node:net';

// ---------------------------------------------------------------------------
// Null embedding provider (used when ONNX is unavailable)
// ---------------------------------------------------------------------------

const nullEmbeddingProvider: EmbeddingProvider = {
  modelId: 'none',
  dimensions: 384,
  async embed(): Promise<Float32Array> {
    return new Float32Array(384);
  },
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array(384));
  },
};

// ---------------------------------------------------------------------------
// Build RPC dependencies from initialized daemon state
// ---------------------------------------------------------------------------

async function buildRpcDeps(): Promise<RpcDependencies> {
  const db = DatabaseConnection.getInstance();

  // Try to load real embedding provider; fall back to null provider
  let embeddingProvider: EmbeddingProvider = nullEmbeddingProvider;
  try {
    const { createArcticProvider } = await import('../embedding/arctic.js');
    embeddingProvider = await createArcticProvider();
  } catch {
    process.stderr.write('[noesis:main] Embedding provider unavailable, using null provider\n');
  }

  // Load HMAC functions (signing key was initialized by startDaemon)
  let signMemory: RpcDependencies['signMemory'];
  let verifySignature: RpcDependencies['verifySignature'];
  let verifyMemory: RpcDependencies['verifyMemory'];

  try {
    const hmac = await import('../security/hmac.js');
    signMemory = (mem) => hmac.signMemory(mem);
    verifySignature = (mem: Memory) => hmac.verifyMemory({
      id: mem.id,
      type: mem.type,
      title: mem.title,
      content: mem.content,
      project_id: mem.project_id,
      signature: mem.signature || '',
    });
    verifyMemory = (mem) => {
      const result = hmac.verifyMemory({
        id: mem.id,
        type: mem.type,
        title: mem.title,
        content: mem.content,
        project_id: mem.project_id,
        signature: mem.signature,
      });
      return { valid: result.valid };
    };
  } catch {
    signMemory = () => 'unsigned';
    verifySignature = () => ({ valid: false, tampered: false });
    verifyMemory = () => ({ valid: false });
  }

  const scanSecrets = (text: string): { clean: string; redacted: boolean; matches: SecretMatch[] } => {
    const matches = scanForSecrets(text);
    if (matches.length === 0) return { clean: text, redacted: false, matches: [] };
    return { clean: redactSecrets(text, matches), redacted: true, matches };
  };

  return {
    db,
    embeddingProvider,
    verifySignature,
    scanSecrets,
    signMemory,
    scanAndRedact,
    checkDangerousPatterns,
    writeAuditLog,
    generateId,
    secretScanMode: 'redact',
    getMemory: (id: string) => getMemory(db, id),
    verifyMemory,
    getUnresolvedConflictCount: () => 0,
  };
}

// ---------------------------------------------------------------------------
// Socket → RPC wiring
// ---------------------------------------------------------------------------

function wireRpcToSocket(
  server: import('node:net').Server,
  handler: (message: string) => Promise<import('./rpc.js').JsonRpcResponse>,
): void {
  server.on('connection', (socket: Socket) => {
    let buffer = '';

    socket.on('data', async (chunk: Buffer) => {
      buffer += chunk.toString();
      let newlineIndex: number;

      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.trim()) continue;

        try {
          const response = await handler(line);
          socket.write(JSON.stringify(response) + '\n');
        } catch {
          socket.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32603, message: 'Internal error' },
            }) + '\n',
          );
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Step 1: Start daemon (database, embeddings, signing key, socket, signal handlers)
  const server = await startDaemon();

  // Step 2: Build RPC dependencies from initialized state
  const deps = await buildRpcDeps();

  // Step 3: Create RPC handler
  const handler = createRpcHandler(deps);

  // Step 4: Wire idle timer — RPC activity resets the server's shutdown timer
  setRpcActivityCallback(() => resetServerIdleTimer());

  // Step 5: Wire RPC handler to socket connections
  wireRpcToSocket(server, handler);

  process.stderr.write('[noesis:main] Daemon is ready and accepting RPC connections.\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`[noesis:daemon] Fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
