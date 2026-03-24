/**
 * Unix Domain Socket Management
 *
 * Creates and manages a Unix domain socket server for IPC between the
 * daemon process and CLI/agent clients. The socket is the sole entry
 * point for all RPC communication with the daemon.
 *
 * Security considerations:
 * - Socket file inherits parent directory permissions (0o700 on ~/.agents)
 * - No authentication at the socket level; the directory ACL is the boundary
 * - Stale socket detection prevents hijacking by checking connect-then-unlink
 * - Backpressure: slow clients are tracked and disconnected if write buffer
 *   exceeds the high-water mark to prevent memory exhaustion
 *
 * A01 (Access Control): Socket in user-only directory; OS enforces access.
 * A03 (Injection): No user input parsed here; raw transport only.
 * A04 (Insecure Design): Stale socket cleanup prevents denial-of-service
 *   from leftover files after crash.
 * A05 (Misconfiguration): No configurable options that weaken security.
 * A09 (Logging): Connection lifecycle events are logged via stderr.
 * A10 (SSRF): Socket is local-only; no network exposure.
 */

import { createServer, connect as netConnect } from 'node:net';
import { unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Server, Socket } from 'node:net';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * High-water mark (bytes) for per-client write buffer.
 * If a client's writableLength exceeds this, the connection is destroyed
 * to prevent unbounded memory growth from slow consumers.
 */
const BACKPRESSURE_HIGH_WATER_MARK = 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let socketServer: Server | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a socket file at `socketPath` belongs to a running
 * process or is a stale leftover from a crash.
 *
 * Strategy: attempt a client connection. If the connection succeeds, the
 * socket is live (another daemon is running). If the connection is refused
 * (ECONNREFUSED) or times out, the socket file is stale and safe to unlink.
 *
 * Returns `true` if the socket is stale (safe to remove), `false` if live.
 */
function isStaleSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = netConnect({ path: socketPath });
    const timeout = setTimeout(() => {
      probe.destroy();
      resolve(true);
    }, 1000);

    probe.on('connect', () => {
      clearTimeout(timeout);
      probe.destroy();
      // Another daemon is running -- socket is live
      resolve(false);
    });

    probe.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      probe.destroy();
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOENT') {
        // No process listening -- stale socket
        resolve(true);
      } else {
        // Unknown error -- treat as stale to allow recovery
        resolve(true);
      }
    });
  });
}

/**
 * Apply backpressure monitoring to a connected client socket.
 *
 * When the client's write buffer exceeds the high-water mark, the
 * connection is forcibly closed. This prevents a single slow client
 * from consuming unbounded daemon memory.
 */
function applyBackpressure(client: Socket): void {
  const originalWrite = client.write.bind(client);

  client.write = function (
    chunk: Uint8Array | string,
    encodingOrCb?: BufferEncoding | ((error?: Error | null) => void),
    cb?: (error?: Error | null) => void,
  ): boolean {
    if (client.writableLength > BACKPRESSURE_HIGH_WATER_MARK) {
      const remoteId = `${client.remoteAddress ?? 'unix'}:${client.remotePort ?? 'local'}`;
      process.stderr.write(
        `[noesis:socket] Backpressure limit exceeded for client ${remoteId}, disconnecting\n`,
      );
      client.destroy(new Error('Backpressure limit exceeded'));
      return false;
    }

    if (typeof encodingOrCb === 'function') {
      return originalWrite(chunk, encodingOrCb);
    }
    return originalWrite(chunk, encodingOrCb, cb);
  } as typeof client.write;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a Unix domain socket server at the given path.
 *
 * Handles stale socket cleanup from previous crashes: if a socket file
 * exists but no process is listening, the file is unlinked before binding.
 *
 * @param socketPath - Absolute path for the Unix domain socket file.
 * @returns The created net.Server. Callers attach 'connection' handlers
 *          for RPC processing.
 * @throws If another daemon is already listening on the socket path.
 * @throws If the socket file cannot be created (permissions, disk, etc).
 */
export async function createSocket(socketPath: string): Promise<Server> {
  if (socketServer !== null) {
    throw new Error('Socket server already created. Call destroySocket() first.');
  }

  const resolvedPath = resolve(socketPath);

  // Handle stale socket from previous crash
  if (existsSync(resolvedPath)) {
    const stale = await isStaleSocket(resolvedPath);
    if (stale) {
      process.stderr.write(
        `[noesis:socket] Removing stale socket file: ${resolvedPath}\n`,
      );
      try {
        unlinkSync(resolvedPath);
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          throw err;
        }
        // File already gone -- race condition is fine
      }
    } else {
      throw new Error(
        `Another daemon is already listening on ${resolvedPath}. ` +
          'Stop the existing daemon first or remove the socket file manually.',
      );
    }
  }

  const server = createServer();

  server.on('connection', (client: Socket) => {
    applyBackpressure(client);

    client.on('error', (err: Error) => {
      process.stderr.write(
        `[noesis:socket] Client connection error: ${err.message}\n`,
      );
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    process.stderr.write(
      `[noesis:socket] Server error: ${err.message}\n`,
    );
  });

  // Bind to the Unix domain socket
  await new Promise<void>((resolvePromise, reject) => {
    server.listen(resolvedPath, () => {
      resolvePromise();
    });

    server.once('error', (err: Error) => {
      reject(err);
    });
  });

  socketServer = server;

  process.stderr.write(
    `[noesis:socket] Listening on ${resolvedPath}\n`,
  );

  return server;
}

/**
 * Close the socket server and remove the socket file.
 *
 * Safe to call when no server is running (no-op).
 * Waits for the server to fully close before returning.
 */
export async function destroySocket(): Promise<void> {
  if (socketServer === null) {
    return;
  }

  const server = socketServer;
  socketServer = null;

  // Close the server and wait for completion.
  // server.close() stops accepting new connections and calls the
  // callback once all existing connections have ended.
  await new Promise<void>((resolvePromise) => {
    server.close(() => {
      resolvePromise();
    });
  });

  // The socket file is automatically removed by Node when the server
  // closes on some platforms, but we unlink explicitly to be safe.
  const address = server.address();
  if (typeof address === 'string' && existsSync(address)) {
    try {
      unlinkSync(address);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        process.stderr.write(
          `[noesis:socket] Warning: could not remove socket file: ${(err as Error).message}\n`,
        );
      }
    }
  }

  process.stderr.write('[noesis:socket] Socket server destroyed\n');
}

/**
 * Return the current socket server instance, or null if not created.
 *
 * Used by the RPC handler layer to attach message-level listeners
 * to the server's connection events.
 */
export function getSocketServer(): Server | null {
  return socketServer;
}
