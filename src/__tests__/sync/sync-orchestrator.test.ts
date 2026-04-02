/**
 * Tests for Sync Orchestrator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSyncPlan,
  canSync,
  executeSyncForTarget,
  aggregateResults,
  runSync,
  runRuntimeSync,
  type SyncTarget,
} from '../../sync/sync-orchestrator.js';
import { DatabaseConnection } from '../../core/database.js';
import { createProject, listMemories } from '../../core/memory-crud.js';
import { generateId } from '../../core/ulid.js';

function makeTarget(overrides?: Partial<SyncTarget>): SyncTarget {
  return {
    adapterId: 'claude-code',
    displayName: 'Claude Code',
    detected: true,
    configPaths: ['/home/.claude/CLAUDE.md'],
    maxContextTokens: 50000,
    supportsManagedSections: true,
    canWriteBack: true,
    ...overrides,
  };
}

let tempDir: string;
let projectRoot: string;
let inboxDir: string;
let processedInboxDir: string;
let db: DatabaseConnection;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'noesis-sync-test-'));
  projectRoot = join(tempDir, 'project');
  inboxDir = join(tempDir, 'inbox');
  processedInboxDir = join(inboxDir, 'processed');

  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(inboxDir, { recursive: true });

  db = DatabaseConnection.create(join(tempDir, 'test.db'));
});

afterEach(() => {
  db.close();
  DatabaseConnection.resetInstance();
  rmSync(tempDir, { recursive: true, force: true });
});

function makeRuntimeDeps() {
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
    emitEvent: vi.fn(),
    generateId,
    inboxDir,
    processedInboxDir,
  };
}

describe('createSyncPlan', () => {
  it('filters to detected targets only', () => {
    const targets = [
      makeTarget({ adapterId: 'a', detected: true }),
      makeTarget({ adapterId: 'b', detected: false }),
    ];

    const plan = createSyncPlan(targets);
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0].adapterId).toBe('a');
  });

  it('computes total token budget', () => {
    const targets = [
      makeTarget({ adapterId: 'a', maxContextTokens: 1000 }),
      makeTarget({ adapterId: 'b', maxContextTokens: 2000 }),
    ];

    const plan = createSyncPlan(targets);
    expect(plan.totalTokensBudget).toBe(3000);
  });

  it('assigns a unique plan ID', () => {
    const plan = createSyncPlan([makeTarget()]);
    expect(plan.id).toBeTruthy();
  });
});

describe('canSync', () => {
  it('allows sync with force option', () => {
    expect(canSync({ force: true }).allowed).toBe(true);
  });
});

describe('executeSyncForTarget', () => {
  it('returns zero-write outcome for dry run', () => {
    const target = makeTarget();
    const outcome = executeSyncForTarget(target, 5000, { dryRun: true });

    expect(outcome.tokensInjected).toBe(0);
    expect(outcome.filesWritten).toBe(0);
    expect(outcome.errors).toHaveLength(0);
  });

  it('caps tokens to adapter max', () => {
    const target = makeTarget({ maxContextTokens: 100 });
    const outcome = executeSyncForTarget(target, 5000);

    expect(outcome.tokensInjected).toBeLessThanOrEqual(100);
  });

  it('writes files when managed sections supported', () => {
    const target = makeTarget({ supportsManagedSections: true });
    const outcome = executeSyncForTarget(target, 1000);
    expect(outcome.filesWritten).toBe(1);
  });

  it('writes no files when managed sections not supported', () => {
    const target = makeTarget({ supportsManagedSections: false });
    const outcome = executeSyncForTarget(target, 1000);
    expect(outcome.filesWritten).toBe(0);
  });
});

describe('aggregateResults', () => {
  it('sums all outcomes', () => {
    const outcomes = [
      { adapterId: 'a', tokensInjected: 100, tokensBudget: 1000, filesWritten: 1, errors: [], durationMs: 10 },
      { adapterId: 'b', tokensInjected: 200, tokensBudget: 2000, filesWritten: 1, errors: ['err'], durationMs: 20 },
    ];

    const result = aggregateResults('plan-1', outcomes, Date.now() - 100);
    expect(result.totalTokensInjected).toBe(300);
    expect(result.totalFilesWritten).toBe(2);
    expect(result.totalErrors).toBe(1);
  });
});

describe('runSync', () => {
  it('syncs all detected targets', () => {
    const targets = [
      makeTarget({ adapterId: 'a' }),
      makeTarget({ adapterId: 'b' }),
    ];

    const result = runSync(targets, 5000, { force: true });
    expect(result.outcomes).toHaveLength(2);
    expect(result.totalErrors).toBe(0);
  });

  it('filters by adapter when specified', () => {
    const targets = [
      makeTarget({ adapterId: 'a' }),
      makeTarget({ adapterId: 'b' }),
    ];

    const result = runSync(targets, 5000, { force: true, adapterFilter: ['a'] });
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].adapterId).toBe('a');
  });

  it('handles empty target list', () => {
    const result = runSync([], 5000, { force: true });
    expect(result.outcomes).toHaveLength(0);
    expect(result.totalTokensInjected).toBe(0);
  });
});

describe('runRuntimeSync', () => {
  it('writes adapter files with managed sections while preserving user content', async () => {
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    mkdirSync(join(projectRoot, '.git'), { recursive: true });
    writeFileSync(join(projectRoot, 'CLAUDE.md'), '# Existing Instructions\n\nKeep this content.\n');

    const first = await runRuntimeSync(makeRuntimeDeps(), {
      projectRoot,
      adapterFilter: ['claude-code'],
      force: true,
    });
    const second = await runRuntimeSync(makeRuntimeDeps(), {
      projectRoot,
      adapterFilter: ['claude-code'],
      force: true,
    });

    const claudePath = join(projectRoot, 'CLAUDE.md');
    const canonicalPath = join(projectRoot, 'Context', 'CLAUDE.md');
    const content = readFileSync(canonicalPath, 'utf-8');
    const gitignoreContent = readFileSync(join(projectRoot, '.gitignore'), 'utf-8');

    expect(first.status).toBe('completed');
    expect(first.totalFilesWritten).toBe(3);
    expect(second.totalFilesWritten).toBe(1);
    expect(existsSync(canonicalPath)).toBe(true);
    expect(existsSync(claudePath)).toBe(true);
    expect(lstatSync(claudePath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(claudePath)).toBe('Context/CLAUDE.md');
    expect(content).toContain('# Existing Instructions');
    expect(content).toContain('Keep this content.');
    expect(content).toContain('<!-- NOESIS:BEGIN adapter=claude-code');
    expect(content.match(/NOESIS:BEGIN adapter=claude-code/g)).toHaveLength(1);
    expect(gitignoreContent).toContain('/CLAUDE.md');
    expect(gitignoreContent).toContain('/Context/CLAUDE.md');
  });

  it('ingests inbox learnings into persisted memories and archives the source file', async () => {
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    const project = createProject(db, { name: 'sync-project', path: projectRoot });

    const adapterInboxDir = join(inboxDir, 'claude-code');
    const sourceFile = join(adapterInboxDir, 'feedback.md');
    mkdirSync(adapterInboxDir, { recursive: true });
    writeFileSync(
      sourceFile,
      'LESSON: Validate inputs before writes\n\nPREFERENCE: Prefer explicit assertions',
    );

    const result = await runRuntimeSync(makeRuntimeDeps(), {
      projectRoot,
      adapterFilter: ['claude-code'],
      force: true,
    });

    const stored = listMemories(db, { project_id: project.id, limit: 10 })
      .filter((memory) => memory.source === 'adapter:claude-code');

    expect(result.status).toBe('completed');
    expect(result.writeback.entriesFound).toBe(1);
    expect(result.writeback.entriesProcessed).toBe(1);
    expect(result.writeback.memoriesCreated).toBe(2);
    expect(stored.map((memory) => memory.type).sort()).toEqual(['lesson', 'preference']);
    expect(existsSync(sourceFile)).toBe(false);
    expect(readdirSync(processedInboxDir)).toHaveLength(1);
  });

  it('does not write files, persist memories, or archive inbox entries during dry run', async () => {
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });

    const adapterInboxDir = join(inboxDir, 'claude-code');
    const sourceFile = join(adapterInboxDir, 'feedback.md');
    mkdirSync(adapterInboxDir, { recursive: true });
    writeFileSync(sourceFile, 'LESSON: Dry runs should not mutate state');

    const result = await runRuntimeSync(makeRuntimeDeps(), {
      projectRoot,
      adapterFilter: ['claude-code'],
      dryRun: true,
      force: true,
    });

    expect(result.status).toBe('dry_run');
    expect(result.totalFilesWritten).toBe(0);
    expect(result.writeback.memoriesCreated).toBe(1);
    expect(existsSync(join(projectRoot, 'CLAUDE.md'))).toBe(false);
    expect(existsSync(join(projectRoot, 'Context', 'CLAUDE.md'))).toBe(false);
    expect(existsSync(sourceFile)).toBe(true);
    expect(existsSync(processedInboxDir)).toBe(false);
    expect(listMemories(db, { limit: 10 })).toHaveLength(0);
  });
});
