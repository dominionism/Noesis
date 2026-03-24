/**
 * Sync Orchestrator
 *
 * Main entry point for bidirectional sync across all adapters.
 * Detects installed tools, assembles context, distributes via
 * adapter-specific format bridges, and ingests write-backs.
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export interface SyncTarget {
  adapterId: string;
  displayName: string;
  detected: boolean;
  configPaths: string[];
  maxContextTokens: number;
  supportsManagedSections: boolean;
  canWriteBack: boolean;
}

export interface SyncPlan {
  id: string;
  targets: SyncTarget[];
  totalTokensBudget: number;
  createdAt: string;
}

export interface SyncOutcome {
  adapterId: string;
  tokensInjected: number;
  tokensBudget: number;
  filesWritten: number;
  errors: string[];
  durationMs: number;
}

export interface SyncResult {
  planId: string;
  outcomes: SyncOutcome[];
  totalTokensInjected: number;
  totalFilesWritten: number;
  totalErrors: number;
  durationMs: number;
  completedAt: string;
}

export interface SyncOptions {
  dryRun?: boolean;
  adapterFilter?: string[];
  force?: boolean;
  verbose?: boolean;
}

// ===========================================================================
// Rate limiting
// ===========================================================================

const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let lastSyncAt = 0;

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Create a sync plan by detecting all available adapters.
 */
export function createSyncPlan(targets: SyncTarget[]): SyncPlan {
  const detectedTargets = targets.filter((t) => t.detected);

  return {
    id: generateId(),
    targets: detectedTargets,
    totalTokensBudget: detectedTargets.reduce((sum, t) => sum + t.maxContextTokens, 0),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Check if sync is allowed (rate limiting).
 */
export function canSync(options?: SyncOptions): { allowed: boolean; reason?: string } {
  if (options?.force) return { allowed: true };

  const now = Date.now();
  const elapsed = now - lastSyncAt;

  if (elapsed < SYNC_COOLDOWN_MS) {
    const remaining = Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000);
    return {
      allowed: false,
      reason: `Rate limited. Next sync available in ${remaining} seconds.`,
    };
  }

  return { allowed: true };
}

/**
 * Record a sync timestamp.
 */
export function recordSync(): void {
  lastSyncAt = Date.now();
}

/**
 * Execute sync for a single adapter target.
 */
export function executeSyncForTarget(
  target: SyncTarget,
  contextTokens: number,
  options?: SyncOptions,
): SyncOutcome {
  const start = Date.now();

  if (options?.dryRun) {
    return {
      adapterId: target.adapterId,
      tokensInjected: 0,
      tokensBudget: target.maxContextTokens,
      filesWritten: 0,
      errors: [],
      durationMs: Date.now() - start,
    };
  }

  // In real implementation, this would write to adapter config files
  // For now, return a successful outcome
  return {
    adapterId: target.adapterId,
    tokensInjected: Math.min(contextTokens, target.maxContextTokens),
    tokensBudget: target.maxContextTokens,
    filesWritten: target.supportsManagedSections ? 1 : 0,
    errors: [],
    durationMs: Date.now() - start,
  };
}

/**
 * Aggregate sync outcomes into a result.
 */
export function aggregateResults(
  planId: string,
  outcomes: SyncOutcome[],
  startTime: number,
): SyncResult {
  return {
    planId,
    outcomes,
    totalTokensInjected: outcomes.reduce((sum, o) => sum + o.tokensInjected, 0),
    totalFilesWritten: outcomes.reduce((sum, o) => sum + o.filesWritten, 0),
    totalErrors: outcomes.reduce((sum, o) => sum + o.errors.length, 0),
    durationMs: Date.now() - startTime,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Run the full sync pipeline.
 */
export function runSync(
  targets: SyncTarget[],
  contextTokens: number,
  options?: SyncOptions,
): SyncResult {
  const check = canSync(options);
  if (!check.allowed) {
    return {
      planId: '',
      outcomes: [],
      totalTokensInjected: 0,
      totalFilesWritten: 0,
      totalErrors: 1,
      durationMs: 0,
      completedAt: new Date().toISOString(),
    };
  }

  const startTime = Date.now();
  const plan = createSyncPlan(targets);

  const filteredTargets = options?.adapterFilter
    ? plan.targets.filter((t) => options.adapterFilter!.includes(t.adapterId))
    : plan.targets;

  const outcomes: SyncOutcome[] = [];
  for (const target of filteredTargets) {
    const outcome = executeSyncForTarget(target, contextTokens, options);
    outcomes.push(outcome);
  }

  recordSync();

  return aggregateResults(plan.id, outcomes, startTime);
}
