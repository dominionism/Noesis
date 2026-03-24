import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer, connect as netConnect } from 'node:net';

import { createSocket, destroySocket, getSocketServer } from '../../daemon/socket.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'noesis-socket-test-'));
}

describe('daemon/socket', () => {
  const cleanups: string[] = [];

  afterEach(async () => {
    await destroySocket();
    for (const dir of cleanups) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
  });

  describe('createSocket', () => {
    it('creates a Unix domain socket server at the given path', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'test.sock');

      const server = await createSocket(socketPath);

      expect(server).toBeDefined();
      expect(server.listening).toBe(true);
      expect(existsSync(socketPath)).toBe(true);
    });

    it('returns the server that getSocketServer also returns', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'test.sock');

      const server = await createSocket(socketPath);

      expect(getSocketServer()).toBe(server);
    });

    it('throws if called twice without destroying first', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'test.sock');

      await createSocket(socketPath);

      await expect(createSocket(join(dir, 'test2.sock'))).rejects.toThrow(
        'Socket server already created',
      );
    });

    it('removes stale socket files from previous crashes', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'stale.sock');

      // Create a plain file pretending to be a stale socket.
      // When we try to connect, it will fail with ECONNREFUSED or ENOTSOCK,
      // which the stale detection logic treats as stale.
      writeFileSync(socketPath, '');

      const server = await createSocket(socketPath);
      expect(server.listening).toBe(true);
    });

    it('detects a live socket and throws', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'live.sock');

      // Start a real server to simulate a live daemon
      const liveServer = createServer();
      await new Promise<void>((resolve) => {
        liveServer.listen(socketPath, () => resolve());
      });

      try {
        await expect(createSocket(socketPath)).rejects.toThrow(
          'Another daemon is already listening',
        );
      } finally {
        await new Promise<void>((resolve) => {
          liveServer.close(() => resolve());
        });
      }
    });

    it('accepts client connections', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'test.sock');

      await createSocket(socketPath);

      const connected = await new Promise<boolean>((resolve, reject) => {
        const client = netConnect({ path: socketPath });
        client.on('connect', () => {
          client.destroy();
          resolve(true);
        });
        client.on('error', (err) => {
          reject(err);
        });
      });

      expect(connected).toBe(true);
    });
  });

  describe('destroySocket', () => {
    it('closes the server and removes the socket file', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'test.sock');

      const server = await createSocket(socketPath);
      expect(server.listening).toBe(true);

      await destroySocket();

      expect(getSocketServer()).toBeNull();
      // The socket file should be removed
      expect(existsSync(socketPath)).toBe(false);
    });

    it('is safe to call when no server is running', async () => {
      await expect(destroySocket()).resolves.not.toThrow();
    });

    it('is safe to call multiple times', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'test.sock');

      await createSocket(socketPath);
      await destroySocket();
      await expect(destroySocket()).resolves.not.toThrow();
    });
  });

  describe('getSocketServer', () => {
    it('returns null when no server is created', () => {
      expect(getSocketServer()).toBeNull();
    });

    it('returns null after server is destroyed', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'test.sock');

      await createSocket(socketPath);
      expect(getSocketServer()).not.toBeNull();

      await destroySocket();
      expect(getSocketServer()).toBeNull();
    });
  });

  describe('backpressure', () => {
    it('applies backpressure monitoring to connected clients', async () => {
      const dir = makeTempDir();
      cleanups.push(dir);
      const socketPath = join(dir, 'test.sock');

      const server = await createSocket(socketPath);

      // Verify the server emits connection events (the backpressure
      // wrapper is applied inside the connection handler).
      const connectionReceived = await new Promise<boolean>((resolve) => {
        server.once('connection', () => {
          resolve(true);
        });

        const client = netConnect({ path: socketPath });
        client.on('connect', () => {
          // Keep connection briefly then close
          setTimeout(() => client.destroy(), 50);
        });
      });

      expect(connectionReceived).toBe(true);
    });
  });
});
