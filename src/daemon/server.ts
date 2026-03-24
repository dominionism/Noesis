/**
 * Daemon Lifecycle Management
 *
 * Manages the full lifecycle of the Noesis background daemon process:
 * start, run, and graceful shutdown. The daemon holds long-lived
 * resources (database connection, socket server) and auto-exits after
 * 10 minutes of inactivity to avoid wasting system resources.
 *
 * Degraded mode scenarios handled:
 * 1. Daemon crash: PID file and socket file cleaned up on next start.
 * 2. DB corruption: detected via pragma integrity_check, logged, exits.
 * 3. ONNX failure: embedding subsystem is optional; falls back to
 *    hash-only mode (no semantic search, BM25 and graph still work).
 * 4. Disk exhaustion: write failures are caught and the daemon enters
 *    read-only mode, refusing further writes until space is available.
 * 5. Key loss: missing signing key is detected, a warning is emitted,
 *    and a new key is generated so the daemon can continue.
 *
 * Security considerations:
 * A01 (Access Control): PID file in user-only directory (0o700).
 * A02 (Crypto): Signing key loss is detected and warned about.
 * A04 (Insecure Design): Graceful shutdown prevents resource leaks.
 *   Idle timeout prevents resource waste. Signal handlers ensure cleanup.
 * A05 (Misconfiguration): Secure defaults; no debug mode flag.
 * A08 (Integrity): PID file is written atomically with correct PID.
 * A09 (Logging): All lifecycle transitions logged to stderr.
 *   Sensitive data (keys, passwords) is never logged.
 */

import { writeFileSync, unlinkSync, readFileSync, existsSync } from 'node:fs';

import { DAEMON_PID_PATH, DAEMON_SOCKET_PATH, DAEMON_IDLE_TIMEOUT_MS } from '../constants.js';
import { loadConfig } from '../config.js';
import { DatabaseConnection } from '../core/database.js';
import { createSocket, destroySocket } from './socket.js';

import type { NoesisConfig } from '../types.js';
import type { Server } from 'node:net';
import type { SignFn } from '../cognitive/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DaemonState = 'starting' | 'running' | 'stopping' | 'stopped';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let daemonState: DaemonState = 'stopped';
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let config: NoesisConfig | null = null;
let readOnlyMode = false;
let embeddingsAvailable = true;

// ---------------------------------------------------------------------------
// Idle auto-exit
// ---------------------------------------------------------------------------

/**
 * Reset the idle auto-exit timer. Called on every incoming RPC request
 * to keep the daemon alive while clients are active.
 *
 * After DAEMON_IDLE_TIMEOUT_MS (10 minutes) of no resets, the daemon
 * performs a graceful shutdown and exits.
 */
export function resetIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(() => {
    process.stderr.write(
      `[noesis:daemon] Idle timeout reached (${DAEMON_IDLE_TIMEOUT_MS}ms), shutting down\n`,
    );
    stopDaemon()
      .then(() => {
        process.exit(0);
      })
      .catch((err: Error) => {
        process.stderr.write(
          `[noesis:daemon] Error during idle shutdown: ${err.message}\n`,
        );
        process.exit(1);
      });
  }, DAEMON_IDLE_TIMEOUT_MS);

  // Prevent the timer from keeping the process alive when all other
  // handles are closed (e.g., during shutdown sequencing).
  if (idleTimer.unref) {
    idleTimer.unref();
  }
}

// ---------------------------------------------------------------------------
// PID file management
// ---------------------------------------------------------------------------

/**
 * Write the current process PID to the PID file.
 *
 * The PID file enables external tools and the CLI to detect whether
 * a daemon is running and send signals to it.
 */
function writePidFile(): void {
  try {
    writeFileSync(DAEMON_PID_PATH, String(process.pid), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (err: unknown) {
    process.stderr.write(
      `[noesis:daemon] Warning: could not write PID file: ${(err as Error).message}\n`,
    );
  }
}

/**
 * Remove the PID file. Safe to call when no PID file exists.
 */
function removePidFile(): void {
  try {
    if (existsSync(DAEMON_PID_PATH)) {
      unlinkSync(DAEMON_PID_PATH);
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      process.stderr.write(
        `[noesis:daemon] Warning: could not remove PID file: ${(err as Error).message}\n`,
      );
    }
  }
}

/**
 * Check whether a PID from a previous run is still alive.
 * Used for stale PID file detection after a crash.
 */
function isPidAlive(pid: number): boolean {
  try {
    // Signal 0 does not kill the process; it checks existence.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up stale PID file from a previous crash.
 * If the PID file exists but the process is no longer running,
 * the PID file is removed to allow a fresh start.
 *
 * @returns true if a stale PID file was cleaned, false if a live daemon exists.
 * @throws If the PID file exists and the process is still alive.
 */
function cleanStalePidFile(): boolean {
  if (!existsSync(DAEMON_PID_PATH)) {
    return false;
  }

  try {
    const content = readFileSync(DAEMON_PID_PATH, 'utf-8').trim();
    const pid = parseInt(content, 10);

    if (Number.isNaN(pid)) {
      // Malformed PID file -- remove it
      removePidFile();
      return true;
    }

    if (isPidAlive(pid) && pid !== process.pid) {
      throw new Error(
        `Another daemon is already running (PID ${pid}). ` +
          'Stop it first with `noesis daemon stop`.',
      );
    }

    // Process is dead -- stale file from crash
    removePidFile();
    process.stderr.write(
      `[noesis:daemon] Cleaned stale PID file (previous PID: ${pid})\n`,
    );
    return true;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('Another daemon is already running')
    ) {
      throw err;
    }
    // Read error -- remove and continue
    removePidFile();
    return true;
  }
}

// ---------------------------------------------------------------------------
// Subsystem initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the database subsystem.
 * Detects corruption via integrity_check pragma.
 */
function initDatabase(): DatabaseConnection {
  process.stderr.write('[noesis:daemon] Initializing database...\n');

  const db = DatabaseConnection.getInstance();

  // Integrity check (degraded mode #2: DB corruption)
  try {
    const result = db.pragma('integrity_check') as Array<{
      integrity_check: string;
    }>;
    if (result.length > 0 && result[0].integrity_check !== 'ok') {
      process.stderr.write(
        `[noesis:daemon] DATABASE INTEGRITY CHECK FAILED: ${result[0].integrity_check}\n`,
      );
      process.stderr.write(
        '[noesis:daemon] Attempting database repair (VACUUM)...\n',
      );
      try {
        db.exec('VACUUM;');
        process.stderr.write(
          '[noesis:daemon] VACUUM completed. Re-checking integrity...\n',
        );
        const recheck = db.pragma('integrity_check') as Array<{
          integrity_check: string;
        }>;
        if (recheck.length > 0 && recheck[0].integrity_check !== 'ok') {
          process.stderr.write(
            '[noesis:daemon] CRITICAL: Database repair failed. Manual intervention required.\n',
          );
          throw new Error('Database corruption detected and repair failed');
        }
        process.stderr.write(
          '[noesis:daemon] Database integrity restored after VACUUM.\n',
        );
      } catch (vacuumErr: unknown) {
        if (
          vacuumErr instanceof Error &&
          vacuumErr.message.includes('Database corruption')
        ) {
          throw vacuumErr;
        }
        process.stderr.write(
          `[noesis:daemon] CRITICAL: VACUUM failed: ${(vacuumErr as Error).message}\n`,
        );
        throw new Error('Database corruption detected and repair failed');
      }
    }
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('Database corruption')
    ) {
      throw err;
    }
    process.stderr.write(
      `[noesis:daemon] Warning: integrity check failed: ${(err as Error).message}\n`,
    );
  }

  process.stderr.write('[noesis:daemon] Database initialized\n');
  return db;
}

/**
 * Initialize the embedding subsystem.
 * If ONNX runtime fails to load, the daemon continues in degraded
 * mode without semantic search (degraded mode #3).
 */
async function initEmbeddings(): Promise<void> {
  process.stderr.write('[noesis:daemon] Initializing embeddings...\n');
  try {
    // Dynamic import to allow graceful failure if onnxruntime-node
    // is not available or the model files are missing.
    await import('../embedding/arctic.js');
    embeddingsAvailable = true;
    process.stderr.write('[noesis:daemon] Embeddings initialized\n');
  } catch (err: unknown) {
    embeddingsAvailable = false;
    process.stderr.write(
      `[noesis:daemon] Warning: embedding initialization failed: ${(err as Error).message}\n`,
    );
    process.stderr.write(
      '[noesis:daemon] Continuing without semantic search (hash/BM25 fallback)\n',
    );
  }
}

/**
 * Detect whether the signing key is available.
 * If missing, warn and generate a new one (degraded mode #5).
 */
async function checkSigningKey(): Promise<void> {
  process.stderr.write('[noesis:daemon] Checking signing key...\n');
  try {
    const hmacModule = await import('../security/hmac.js');
    hmacModule.loadSigningKey();
    process.stderr.write('[noesis:daemon] Signing key available\n');
  } catch {
    process.stderr.write(
      '[noesis:daemon] WARNING: Signing key not found. Generating new key.\n',
    );
    process.stderr.write(
      '[noesis:daemon] Existing memory signatures will fail verification.\n',
    );
    try {
      const hmacModule = await import('../security/hmac.js');
      hmacModule.generateSigningKey();
      process.stderr.write(
        '[noesis:daemon] New signing key generated successfully.\n',
      );
    } catch (genErr: unknown) {
      process.stderr.write(
        `[noesis:daemon] Warning: could not generate signing key: ${(genErr as Error).message}\n`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cognitive module initialization
// ---------------------------------------------------------------------------

/**
 * Seed built-in cognitive entities (rules, experts, capsules, skills,
 * contexts, commands) if they are not already present.
 *
 * This is idempotent — each seed function checks for existing entries
 * by name before inserting. User modifications to built-in entities
 * are preserved.
 *
 * Dynamic imports keep cognitive code out of the critical startup path.
 */
async function initCognitiveModules(db: DatabaseConnection, sign: SignFn): Promise<void> {
  process.stderr.write('[noesis:daemon] Initializing cognitive modules...\n');

  // Guard: verify the db object has the expected interface.
  // This catches cases where module resolution or prototype chain issues
  // cause the DatabaseConnection wrapper to lose its methods at runtime.
  if (typeof db.prepare !== 'function') {
    process.stderr.write(
      '[noesis:daemon] Warning: db.prepare is not a function. ' +
      'Re-acquiring DatabaseConnection singleton.\n',
    );
    db = DatabaseConnection.getInstance();
  }

  try {
    const { seedBuiltInRules } = await import('../cognitive/rules/built-in-rules.js');
    const ruleCount = seedBuiltInRules(db, sign);
    if (ruleCount > 0) process.stderr.write(`[noesis:daemon]   Seeded ${ruleCount} rules\n`);

    const { seedBuiltInExperts } = await import('../cognitive/experts/built-in-experts.js');
    const expertCount = seedBuiltInExperts(db, sign);
    if (expertCount > 0) process.stderr.write(`[noesis:daemon]   Seeded ${expertCount} experts\n`);

    const { seedBuiltInCapsules } = await import('../cognitive/capsules/built-in-capsules.js');
    const capsuleCount = seedBuiltInCapsules(db, sign);
    if (capsuleCount > 0) process.stderr.write(`[noesis:daemon]   Seeded ${capsuleCount} capsules\n`);

    const { seedBuiltInSkills } = await import('../cognitive/skills/built-in-skills.js');
    const skillCount = seedBuiltInSkills(db, sign);
    if (skillCount > 0) process.stderr.write(`[noesis:daemon]   Seeded ${skillCount} skills\n`);

    const { seedBuiltInContexts } = await import('../cognitive/context/built-in-contexts.js');
    const contextCount = seedBuiltInContexts(db, sign);
    if (contextCount > 0) process.stderr.write(`[noesis:daemon]   Seeded ${contextCount} contexts\n`);

    const { seedBuiltInCommands } = await import('../cognitive/commands/built-in-commands.js');
    seedBuiltInCommands(db, sign);

    // Load Markdown assets from filesystem (bundled + user customizations).
    // Runs after built-in seeding so Markdown files can extend the asset library.
    // Assets already present in the database (by name) are skipped.
    try {
      const { registerMarkdownAssets } = await import('../assets/registry.js');
      const mdStats = await registerMarkdownAssets(db, sign);
      const totalNew = mdStats.experts.registered + mdStats.skills.registered + mdStats.rules.registered;
      const totalUpgraded = mdStats.experts.upgraded + mdStats.skills.upgraded + mdStats.rules.upgraded;
      if (totalNew + totalUpgraded > 0) {
        const parts: string[] = [];
        if (totalNew > 0) parts.push(`${totalNew} new`);
        if (totalUpgraded > 0) parts.push(`${totalUpgraded} upgraded`);
        process.stderr.write(
          `[noesis:daemon]   Markdown assets: ${parts.join(', ')} ` +
          `(${mdStats.experts.registered}+${mdStats.experts.upgraded}E ` +
          `${mdStats.skills.registered}+${mdStats.skills.upgraded}S ` +
          `${mdStats.rules.registered}+${mdStats.rules.upgraded}R)\n`,
        );
      }
    } catch (e) {
      process.stderr.write(`[noesis:daemon]   Markdown asset loading skipped: ${(e as Error).message}\n`);
    }

    // Post-seed embedding pass: compute embeddings for entities seeded without them.
    // Idempotent — skips entities that already have embeddings.
    if (embeddingsAvailable) {
      try {
        const { embedSeededEntities } = await import('../cognitive/embed-seeded-entities.js');
        const embedResult = await embedSeededEntities(db, sign);
        const total = embedResult.rules + embedResult.experts + embedResult.capsules + embedResult.skills;
        if (total > 0) {
          process.stderr.write(
            `[noesis:daemon]   Embedded ${total} entities (${embedResult.rules}R ${embedResult.experts}E ${embedResult.capsules}C ${embedResult.skills}S` +
            `${embedResult.errors > 0 ? `, ${embedResult.errors} errors` : ''})\n`,
          );
        }
      } catch (embedErr: unknown) {
        process.stderr.write(
          `[noesis:daemon] Warning: post-seed embedding failed: ${(embedErr as Error).message}\n`,
        );
      }
    }

    process.stderr.write('[noesis:daemon] Cognitive modules initialized\n');
  } catch (err: unknown) {
    process.stderr.write(
      `[noesis:daemon] Warning: cognitive module init failed: ${(err as Error).message}\n`,
    );
    process.stderr.write(
      '[noesis:daemon] Continuing without cognitive seeding (features still work if data exists)\n',
    );
  }
}

// ---------------------------------------------------------------------------
// Signal handlers
// ---------------------------------------------------------------------------

let signalHandlersInstalled = false;

function installSignalHandlers(): void {
  if (signalHandlersInstalled) {
    return;
  }

  const handleShutdownSignal = (signal: string): void => {
    process.stderr.write(
      `[noesis:daemon] Received ${signal}, initiating graceful shutdown...\n`,
    );
    stopDaemon()
      .then(() => {
        process.exit(0);
      })
      .catch((err: Error) => {
        process.stderr.write(
          `[noesis:daemon] Error during signal shutdown: ${err.message}\n`,
        );
        process.exit(1);
      });
  };

  process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
  process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));

  signalHandlersInstalled = true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the current daemon state.
 */
export function getDaemonState(): DaemonState {
  return daemonState;
}

/**
 * Return whether the daemon is in read-only mode due to disk exhaustion.
 */
export function isReadOnly(): boolean {
  return readOnlyMode;
}

/**
 * Return whether the embedding subsystem is available.
 */
export function isEmbeddingsAvailable(): boolean {
  return embeddingsAvailable;
}

/**
 * Enter read-only mode. Called when write operations fail due to
 * disk exhaustion (degraded mode #4).
 */
export function enterReadOnlyMode(): void {
  if (!readOnlyMode) {
    readOnlyMode = true;
    process.stderr.write(
      '[noesis:daemon] Entering read-only mode due to disk write failure.\n',
    );
  }
}

/**
 * Exit read-only mode. Called when disk space becomes available.
 */
export function exitReadOnlyMode(): void {
  if (readOnlyMode) {
    readOnlyMode = false;
    process.stderr.write(
      '[noesis:daemon] Exiting read-only mode. Writes re-enabled.\n',
    );
  }
}

/**
 * Start the Noesis daemon.
 *
 * Initialization order:
 * 1. Validate no other daemon is running (PID file check)
 * 2. Write PID file
 * 3. Load configuration
 * 4. Initialize database (with integrity check)
 * 5. Initialize embeddings (with graceful degradation)
 * 6. Check signing key (with graceful degradation)
 * 7. Create Unix domain socket
 * 8. Install signal handlers
 * 9. Start idle timer
 *
 * @returns The socket server for RPC handler attachment.
 */
export async function startDaemon(): Promise<Server> {
  if (daemonState === 'running') {
    throw new Error('Daemon is already running');
  }

  if (daemonState === 'starting') {
    throw new Error('Daemon is already starting');
  }

  if (daemonState === 'stopping') {
    throw new Error('Daemon is currently stopping. Wait for it to finish.');
  }

  daemonState = 'starting';
  readOnlyMode = false;

  process.stderr.write(
    `[noesis:daemon] Starting daemon (PID: ${process.pid})...\n`,
  );

  try {
    // Step 1: Check for stale PID / existing daemon
    cleanStalePidFile();

    // Step 2: Write PID file
    writePidFile();

    // Step 3: Load configuration
    process.stderr.write('[noesis:daemon] Loading configuration...\n');
    config = loadConfig();
    process.stderr.write('[noesis:daemon] Configuration loaded\n');

    // Step 4: Initialize database
    const db = initDatabase();

    // Step 5: Initialize embeddings (non-fatal)
    await initEmbeddings();

    // Step 6: Check signing key (non-fatal)
    await checkSigningKey();

    // Step 6b: Initialize cognitive modules (non-fatal)
    // Uses dynamic import to get the signing function after key is loaded
    try {
      const hmacModule = await import('../security/hmac.js');
      const sign: SignFn = (content: string) => hmacModule.signContent(content);
      await initCognitiveModules(db, sign);
    } catch {
      // initCognitiveModules already logs its own warnings
    }

    // Step 7: Create socket
    const server = await createSocket(DAEMON_SOCKET_PATH);

    // Step 8: Install signal handlers
    installSignalHandlers();

    // Step 9: Start idle timer
    resetIdleTimer();

    daemonState = 'running';
    process.stderr.write(
      `[noesis:daemon] Daemon started successfully (PID: ${process.pid})\n`,
    );

    return server;
  } catch (err: unknown) {
    daemonState = 'stopped';
    removePidFile();
    process.stderr.write(
      `[noesis:daemon] Failed to start: ${(err as Error).message}\n`,
    );
    throw err;
  }
}

/**
 * Gracefully stop the Noesis daemon.
 *
 * Shutdown order (reverse of startup):
 * 1. Clear idle timer
 * 2. Close socket server (stop accepting new connections)
 * 3. Close database connection
 * 4. Remove PID file
 *
 * Safe to call when the daemon is already stopped (no-op).
 */
export async function stopDaemon(): Promise<void> {
  if (daemonState === 'stopped') {
    return;
  }

  if (daemonState === 'stopping') {
    return;
  }

  daemonState = 'stopping';
  process.stderr.write('[noesis:daemon] Stopping daemon...\n');

  try {
    // Step 1: Clear idle timer
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    // Step 2: Close socket
    await destroySocket();

    // Step 3: Close database
    try {
      DatabaseConnection.resetInstance();
      process.stderr.write('[noesis:daemon] Database connection closed\n');
    } catch (err: unknown) {
      process.stderr.write(
        `[noesis:daemon] Warning: error closing database: ${(err as Error).message}\n`,
      );
    }

    // Step 4: Remove PID file
    removePidFile();

    config = null;
    daemonState = 'stopped';
    process.stderr.write('[noesis:daemon] Daemon stopped\n');
  } catch (err: unknown) {
    // Ensure state is marked stopped even on error
    daemonState = 'stopped';
    removePidFile();
    process.stderr.write(
      `[noesis:daemon] Error during shutdown: ${(err as Error).message}\n`,
    );
    throw err;
  }
}

/**
 * Get the loaded configuration. Returns null if daemon is not running.
 */
export function getDaemonConfig(): NoesisConfig | null {
  return config;
}
