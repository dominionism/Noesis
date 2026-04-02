import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DB_PATH } from '../constants.js';
import { DatabaseConnection } from '../core/database.js';
import { getMemory } from '../core/memory-crud.js';
import { generateId } from '../core/ulid.js';
import { createRpcHandler, type RpcDependencies, type JsonRpcResponse } from '../daemon/rpc.js';
import { countUnresolvedConflicts } from '../retrieval/conflict-count.js';
import { writeAuditLog } from '../security/audit.js';
import { checkDangerousPatterns } from '../security/dangerous-patterns.js';
import { scanAndRedact, scanForSecrets, redactSecrets } from '../security/secret-scanner.js';

import type { EmbeddingProvider, Memory, SecretMatch } from '../types.js';

export type LocalRpcMode = 'read' | 'write';

export interface LocalRpcRuntime {
  readonly mode: LocalRpcMode;
  call<T>(method: string, params?: Record<string, unknown>): Promise<T>;
  cleanup(): void;
}

export class LocalRpcUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalRpcUnsupportedError';
  }
}

export class LocalRpcWriteAccessError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalRpcWriteAccessError';
  }
}

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

let embeddingProviderPromise: Promise<EmbeddingProvider> | null = null;
let signingDepsPromise:
  Promise<Pick<RpcDependencies, 'signMemory' | 'verifySignature' | 'verifyMemory'>> | null = null;

const READ_METHODS = new Set<string>([
  'noesis.ping',
  'noesis.recall',
  'noesis.getMemory',
  'noesis.retrievalGap',
  'noesis.checkAction',
  'noesis.explain',
  'noesis.sessionList',
  'noesis.orchestrate',
  'noesis.checkCompliance',
  'noesis.routeExpertCognitive',
  'noesis.matchCapsuleDeep',
  'noesis.matchSkills',
  'noesis.getContexts',
  'noesis.checkReadinessEvidence',
  'noesis.checkQualityGate',
  'noesis.getEffectivenessMetrics',
  'noesis.predictFailures',
  'noesis.getGsdState',
  'noesis.resumeHandoff',
  'noesis.listHandoffs',
  'noesis.checkDecisionFidelity',
  'noesis.listRules',
  'noesis.listExperts',
  'noesis.listCapsules',
  'noesis.detectVerification',
  'noesis.critiqueResearch',
  'noesis.critiquePlan',
  'noesis.learn',
]);

const WRITE_METHODS = new Set<string>([
  'noesis.remember',
  'noesis.forget',
  'noesis.sessionStart',
  'noesis.sessionEnd',
  'noesis.updateContext',
  'noesis.processLearning',
  'noesis.createGsdProject',
  'noesis.executeGsdPhase',
  'noesis.startSessionCognitive',
  'noesis.createHandoff',
  'noesis.sync',
]);

const UNSUPPORTED_LOCAL_METHODS = new Set<string>([
  'noesis.subscribe',
  'noesis.unsubscribe',
]);

const COGNITIVE_METHODS = new Set<string>([
  'noesis.orchestrate',
  'noesis.checkCompliance',
  'noesis.routeExpertCognitive',
  'noesis.matchCapsuleDeep',
  'noesis.matchSkills',
  'noesis.getContexts',
  'noesis.updateContext',
  'noesis.checkReadinessEvidence',
  'noesis.checkQualityGate',
  'noesis.getEffectivenessMetrics',
  'noesis.predictFailures',
  'noesis.processLearning',
  'noesis.createGsdProject',
  'noesis.executeGsdPhase',
  'noesis.getGsdState',
  'noesis.startSessionCognitive',
  'noesis.createHandoff',
  'noesis.resumeHandoff',
  'noesis.listHandoffs',
  'noesis.checkDecisionFidelity',
  'noesis.listRules',
  'noesis.listExperts',
  'noesis.listCapsules',
  'noesis.detectVerification',
  'noesis.critiqueResearch',
  'noesis.critiquePlan',
  'noesis.learn',
]);

function normalizeMethod(method: string): string {
  return method.startsWith('noesis.') ? method : `noesis.${method}`;
}

function isPermissionDenied(error: unknown): boolean {
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
      /operation not permitted|permission denied|readonly database|attempt to write a readonly database|read-only|eacces|eperm/i.test(
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

function createSnapshotDbPath(): { dbPath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'noesis-local-rpc-'));
  const snapshotDbPath = join(tempDir, 'noesis.db');

  if (existsSync(DB_PATH)) {
    for (const suffix of ['', '-wal', '-shm']) {
      const sourcePath = `${DB_PATH}${suffix}`;
      if (existsSync(sourcePath)) {
        copyFileSync(sourcePath, `${snapshotDbPath}${suffix}`);
      }
    }
  }

  return {
    dbPath: snapshotDbPath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

async function createEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (embeddingProviderPromise === null) {
    embeddingProviderPromise = (async () => {
      try {
        const { createArcticProvider } = await import('../embedding/arctic.js');
        return await createArcticProvider();
      } catch {
        return nullEmbeddingProvider;
      }
    })();
  }

  return embeddingProviderPromise;
}

async function createSigningDeps(): Promise<Pick<RpcDependencies, 'signMemory' | 'verifySignature' | 'verifyMemory'>> {
  if (signingDepsPromise === null) {
    signingDepsPromise = (async () => {
      try {
        const hmac = await import('../security/hmac.js');

        return {
          signMemory: (mem) => hmac.signMemory(mem),
          verifySignature: (mem: Memory) => hmac.verifyMemory({
            id: mem.id,
            type: mem.type,
            title: mem.title,
            content: mem.content,
            project_id: mem.project_id,
            signature: mem.signature || '',
          }),
          verifyMemory: (mem) => {
            const result = hmac.verifyMemory({
              id: mem.id,
              type: mem.type,
              title: mem.title,
              content: mem.content,
              project_id: mem.project_id,
              signature: mem.signature,
            });
            return { valid: result.valid };
          },
        };
      } catch {
        return {
          signMemory: () => 'unsigned',
          verifySignature: () => ({ valid: false, tampered: false }),
          verifyMemory: () => ({ valid: false }),
        };
      }
    })();
  }

  return signingDepsPromise;
}

function createScanSecrets(text: string): { clean: string; redacted: boolean; matches: SecretMatch[] } {
  const matches = scanForSecrets(text);
  if (matches.length === 0) {
    return { clean: text, redacted: false, matches: [] };
  }
  return { clean: redactSecrets(text, matches), redacted: true, matches };
}

async function initializeCognitiveModules(db: DatabaseConnection, sign: (content: string) => string): Promise<void> {
  try {
    const { seedBuiltInRules } = await import('../cognitive/rules/built-in-rules.js');
    seedBuiltInRules(db, sign);

    const { seedBuiltInExperts } = await import('../cognitive/experts/built-in-experts.js');
    seedBuiltInExperts(db, sign);

    const { seedBuiltInCapsules } = await import('../cognitive/capsules/built-in-capsules.js');
    seedBuiltInCapsules(db, sign);

    const { seedBuiltInSkills } = await import('../cognitive/skills/built-in-skills.js');
    seedBuiltInSkills(db, sign);

    const { seedBuiltInContexts } = await import('../cognitive/context/built-in-contexts.js');
    seedBuiltInContexts(db, sign);

    const { seedBuiltInCommands } = await import('../cognitive/commands/built-in-commands.js');
    seedBuiltInCommands(db, sign);

    try {
      const { registerMarkdownAssets } = await import('../assets/registry.js');
      await registerMarkdownAssets(db, sign);
    } catch {
      // Optional asset loading.
    }
  } catch {
    // Cognitive methods still work if the snapshot already contains data.
  }
}

async function buildDeps(
  db: DatabaseConnection,
  mode: LocalRpcMode,
): Promise<{ deps: RpcDependencies; signContent: (content: string) => string }> {
  const embeddingProvider = await createEmbeddingProvider();
  const signingDeps = await createSigningDeps();

  const signContent = (content: string): string =>
    signingDeps.signMemory({
      id: 'sign',
      type: 'sign',
      title: 'sign',
      content,
      project_id: null,
    });

  return {
    deps: {
      db,
      embeddingProvider,
      verifySignature: signingDeps.verifySignature,
      verifyMemory: signingDeps.verifyMemory,
      scanSecrets: createScanSecrets,
      signMemory: signingDeps.signMemory,
      scanAndRedact,
      checkDangerousPatterns,
      writeAuditLog: mode === 'write' ? writeAuditLog : () => {},
      generateId,
      secretScanMode: 'redact',
      getMemory: (id: string) => getMemory(db, id),
      getUnresolvedConflictCount: (projectId?: string) => countUnresolvedConflicts(db, projectId),
    },
    signContent,
  };
}

function makeWriteAccessError(method: string, error: unknown): LocalRpcWriteAccessError {
  return new LocalRpcWriteAccessError(
    `Noesis method "${method}" requires persistent write access to ~/.agents (database, signing key, and audit log). ` +
      'This sandbox cannot provide that safely, so the write is intentionally blocked. ' +
      'Run `noesis` outside the sandbox or allowlist the `noesis` command.',
    { cause: error instanceof Error ? error : undefined },
  );
}

function parseResponse<T>(method: string, response: JsonRpcResponse): T {
  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.result as T;
}

export function getLocalRpcMode(method: string): LocalRpcMode | null {
  const normalized = normalizeMethod(method);

  if (READ_METHODS.has(normalized)) {
    return 'read';
  }

  if (WRITE_METHODS.has(normalized)) {
    return 'write';
  }

  return null;
}

export async function createLocalRpcRuntime(mode: LocalRpcMode): Promise<LocalRpcRuntime> {
  if (mode === 'read') {
    const snapshot = createSnapshotDbPath();
    const db = DatabaseConnection.create(snapshot.dbPath);
    const { deps, signContent } = await buildDeps(db, mode);
    const handler = createRpcHandler(deps);
    let cognitiveInitialized = false;

    return {
      mode,
      async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
        const normalized = normalizeMethod(method);

        if (UNSUPPORTED_LOCAL_METHODS.has(normalized)) {
          throw new LocalRpcUnsupportedError(`Noesis method "${normalized}" requires a live daemon socket and cannot run locally.`);
        }

        if (getLocalRpcMode(normalized) !== 'read') {
          throw new LocalRpcUnsupportedError(
            `Noesis method "${normalized}" cannot run against a read-only local fallback runtime.`,
          );
        }

        if (!cognitiveInitialized && COGNITIVE_METHODS.has(normalized)) {
          await initializeCognitiveModules(db, signContent);
          cognitiveInitialized = true;
        }

        const response = await handler(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: normalized,
          params,
        }));

        return parseResponse<T>(normalized, response);
      },
      cleanup(): void {
        db.close();
        snapshot.cleanup();
      },
    };
  }

  let db: DatabaseConnection;
  try {
    db = DatabaseConnection.create();
  } catch (error) {
    throw makeWriteAccessError('noesis.write', error);
  }

  const { deps, signContent } = await buildDeps(db, mode);
  const handler = createRpcHandler(deps);
  let cognitiveInitialized = false;

  return {
    mode,
    async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
      const normalized = normalizeMethod(method);

      if (UNSUPPORTED_LOCAL_METHODS.has(normalized)) {
        throw new LocalRpcUnsupportedError(`Noesis method "${normalized}" requires a live daemon socket and cannot run locally.`);
      }

      if (getLocalRpcMode(normalized) !== 'write') {
        throw new LocalRpcUnsupportedError(
          `Noesis method "${normalized}" cannot run against a write local fallback runtime.`,
        );
      }

      if (!cognitiveInitialized && COGNITIVE_METHODS.has(normalized)) {
        await initializeCognitiveModules(db, signContent);
        cognitiveInitialized = true;
      }

      try {
        const response = await handler(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: normalized,
          params,
        }));

        return parseResponse<T>(normalized, response);
      } catch (error) {
        if (isPermissionDenied(error)) {
          throw makeWriteAccessError(normalized, error);
        }
        throw error;
      }
    },
    cleanup(): void {
      db.close();
    },
  };
}
