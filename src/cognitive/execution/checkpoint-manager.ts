/**
 * Checkpoint Manager — Checkpoint creation, resolution, and blocking.
 *
 * Operates on the checkpoints JSON array within an execution_state row.
 * Three checkpoint types with different blocking semantics:
 *
 * - human_verify: Blocks in standard mode, auto-resolves in auto mode
 * - decision: Always blocks until resolved
 * - human_action: Always blocks until resolved
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { ExecutionCheckpoint } from '../types.js';
import { getExecution, updateExecution } from './gsd-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlockStatus {
  blocked: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a checkpoint to an execution state.
 */
export function createCheckpoint(
  db: DatabaseConnection,
  executionId: string,
  checkpoint: Omit<ExecutionCheckpoint, 'resolved' | 'resolved_at'>,
): ExecutionCheckpoint {
  const exec = getExecution(db, executionId);
  if (!exec) throw new Error(`Execution state not found: ${executionId}`);

  const newCheckpoint: ExecutionCheckpoint = {
    type: checkpoint.type,
    description: checkpoint.description,
    resolved: false,
    resolved_at: null,
  };

  const updatedCheckpoints = [...exec.checkpoints, newCheckpoint];
  updateExecution(db, executionId, { checkpoints: updatedCheckpoints });

  return newCheckpoint;
}

/**
 * Resolve a checkpoint by index.
 */
export function resolveCheckpoint(
  db: DatabaseConnection,
  executionId: string,
  checkpointIndex: number,
  _resolution?: string,
): void {
  const exec = getExecution(db, executionId);
  if (!exec) throw new Error(`Execution state not found: ${executionId}`);

  if (checkpointIndex < 0 || checkpointIndex >= exec.checkpoints.length) {
    throw new Error(`Checkpoint index out of range: ${checkpointIndex}`);
  }

  const updated = [...exec.checkpoints];
  updated[checkpointIndex] = {
    ...updated[checkpointIndex],
    resolved: true,
    resolved_at: new Date().toISOString(),
  };

  updateExecution(db, executionId, { checkpoints: updated });
}

/**
 * Get all unresolved checkpoints for an execution.
 */
export function getUnresolvedCheckpoints(
  db: DatabaseConnection,
  executionId: string,
): ExecutionCheckpoint[] {
  const exec = getExecution(db, executionId);
  if (!exec) return [];

  return exec.checkpoints.filter(c => !c.resolved);
}

/**
 * Determine if execution should be blocked based on checkpoints.
 *
 * Blocking rules:
 * - Any unresolved 'decision' checkpoint → blocked
 * - Any unresolved 'human_action' checkpoint → blocked
 * - Unresolved 'human_verify' → blocked in standard mode only
 */
export function shouldBlockExecution(
  checkpoints: ExecutionCheckpoint[],
  mode: 'interactive' | 'auto' = 'interactive',
): BlockStatus {
  const unresolved = checkpoints.filter(c => !c.resolved);

  for (const cp of unresolved) {
    if (cp.type === 'decision') {
      return {
        blocked: true,
        reason: `Decision required: ${cp.description}`,
      };
    }

    if (cp.type === 'human_action') {
      return {
        blocked: true,
        reason: `Human action required: ${cp.description}`,
      };
    }

    if (cp.type === 'human_verify' && mode === 'interactive') {
      return {
        blocked: true,
        reason: `Verification required: ${cp.description}`,
      };
    }
  }

  return { blocked: false, reason: '' };
}

/**
 * Auto-resolve all human_verify checkpoints (for auto mode).
 */
export function autoResolveVerifyCheckpoints(
  db: DatabaseConnection,
  executionId: string,
): number {
  const exec = getExecution(db, executionId);
  if (!exec) return 0;

  let resolved = 0;
  const updated = exec.checkpoints.map(cp => {
    if (cp.type === 'human_verify' && !cp.resolved) {
      resolved++;
      return { ...cp, resolved: true, resolved_at: new Date().toISOString() };
    }
    return cp;
  });

  if (resolved > 0) {
    updateExecution(db, executionId, { checkpoints: updated });
  }

  return resolved;
}
