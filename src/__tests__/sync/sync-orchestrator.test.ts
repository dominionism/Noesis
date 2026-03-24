/**
 * Tests for Sync Orchestrator
 */

import { describe, it, expect } from 'vitest';
import {
  createSyncPlan,
  canSync,
  executeSyncForTarget,
  aggregateResults,
  runSync,
  type SyncTarget,
} from '../../sync/sync-orchestrator.js';

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
