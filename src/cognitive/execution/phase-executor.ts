/**
 * Phase Executor — Task execution with deviation tracking.
 *
 * Orchestrates task execution within a phase:
 * 1. Group tasks by wave (via wave-scheduler)
 * 2. Execute waves sequentially
 * 3. Track deviations per task (rules 1-3 auto-fix, rule 4 ask)
 * 4. Handle checkpoints at task boundaries
 * 5. Update execution state after each task
 *
 * Delegates to:
 * - wave-scheduler for task ordering
 * - checkpoint-manager for blocking decisions
 * - gsd-engine for state persistence
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  ExecutionState,
  ExecutionDeviation,
  ExecutionCheckpoint,
} from '../types.js';
import { getExecution, updateExecution, transitionStatus } from './gsd-engine.js';
import {
  shouldBlockExecution,
  createCheckpoint,
} from './checkpoint-manager.js';
import {
  createWaveSchedule,
  isWaveComplete,
  getExecutableTasks,
  type WaveTask,
} from './wave-scheduler.js';
import { GSD_MAX_AUTO_FIX_ATTEMPTS } from '../../constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeviationRule = 1 | 2 | 3 | 4;

export interface TaskResult {
  taskId: string;
  status: 'completed' | 'failed';
  deviations: ExecutionDeviation[];
}

export interface PhaseExecutionResult {
  executionId: string;
  status: 'completed' | 'blocked' | 'paused';
  tasksCompleted: number;
  tasksFailed: number;
  deviations: ExecutionDeviation[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start executing a phase.
 *
 * Transitions to 'executing' status and initializes task tracking.
 */
export function startPhaseExecution(
  db: DatabaseConnection,
  executionId: string,
  totalTasks: number,
): ExecutionState {
  const exec = getExecution(db, executionId);
  if (!exec) throw new Error(`Execution state not found: ${executionId}`);

  transitionStatus(db, executionId, 'executing');

  updateExecution(db, executionId, {
    current_task: 0,
    total_tasks: totalTasks,
    wave: 1,
  });

  return getExecution(db, executionId)!;
}

/**
 * Record a task result and advance execution state.
 */
export function recordTaskResult(
  db: DatabaseConnection,
  executionId: string,
  result: TaskResult,
): void {
  const exec = getExecution(db, executionId);
  if (!exec) throw new Error(`Execution state not found: ${executionId}`);

  // Append deviations
  const updatedDeviations = [...exec.deviations, ...result.deviations];

  // Advance current task
  const newCurrentTask = (exec.current_task ?? 0) + 1;

  updateExecution(db, executionId, {
    current_task: newCurrentTask,
    deviations: updatedDeviations,
  });
}

/**
 * Record a deviation during task execution.
 *
 * Rules 1-3: auto-fixable (up to MAX_AUTO_FIX_ATTEMPTS per task)
 * Rule 4: always requires human decision
 */
export function recordDeviation(
  db: DatabaseConnection,
  executionId: string,
  rule: DeviationRule,
  type: string,
  description: string,
  taskId: string,
): { shouldStop: boolean; reason: string } {
  const exec = getExecution(db, executionId);
  if (!exec) throw new Error(`Execution state not found: ${executionId}`);

  const deviation: ExecutionDeviation = {
    rule,
    type,
    description,
    task_id: taskId,
    auto_fixed: rule !== 4,
    timestamp: new Date().toISOString(),
  };

  const updatedDeviations = [...exec.deviations, deviation];
  updateExecution(db, executionId, { deviations: updatedDeviations });

  // Rule 4 always stops
  if (rule === 4) {
    // Create a decision checkpoint
    createCheckpoint(db, executionId, {
      type: 'decision',
      description: `Architectural deviation: ${description}`,
    });

    return {
      shouldStop: true,
      reason: `Rule 4 deviation: ${description}. Human decision required.`,
    };
  }

  // Check auto-fix limit for rules 1-3
  const taskDeviations = updatedDeviations.filter(
    d => d.task_id === taskId && d.rule !== 4,
  );

  if (taskDeviations.length >= GSD_MAX_AUTO_FIX_ATTEMPTS) {
    return {
      shouldStop: true,
      reason: `Auto-fix limit reached: ${taskDeviations.length} attempts on task ${taskId}.`,
    };
  }

  return { shouldStop: false, reason: '' };
}

/**
 * Check if execution should proceed or is blocked.
 */
export function checkExecutionStatus(
  db: DatabaseConnection,
  executionId: string,
  mode: 'interactive' | 'auto' = 'interactive',
): { canProceed: boolean; reason: string } {
  const exec = getExecution(db, executionId);
  if (!exec) return { canProceed: false, reason: 'Execution not found' };

  if (exec.status === 'completed') {
    return { canProceed: false, reason: 'Phase already completed' };
  }

  if (exec.status === 'blocked' || exec.status === 'paused') {
    return { canProceed: false, reason: `Phase is ${exec.status}` };
  }

  // Check checkpoint blocking
  const blockStatus = shouldBlockExecution(exec.checkpoints, mode);
  if (blockStatus.blocked) {
    return { canProceed: false, reason: blockStatus.reason };
  }

  return { canProceed: true, reason: '' };
}

/**
 * Complete a phase execution.
 *
 * Transitions to 'verifying' if all tasks done, then to 'completed'
 * after verification.
 */
export function completePhaseExecution(
  db: DatabaseConnection,
  executionId: string,
  verified: boolean = true,
): ExecutionState {
  const exec = getExecution(db, executionId);
  if (!exec) throw new Error(`Execution state not found: ${executionId}`);

  if (verified) {
    // Skip verifying, go straight to completed
    updateExecution(db, executionId, { status: 'completed' });
  } else {
    transitionStatus(db, executionId, 'verifying');
  }

  return getExecution(db, executionId)!;
}

/**
 * Get execution summary for a phase.
 */
export function getExecutionSummary(
  db: DatabaseConnection,
  executionId: string,
): {
  total_tasks: number;
  completed_tasks: number;
  deviation_count: number;
  rule4_count: number;
  checkpoint_count: number;
  unresolved_checkpoints: number;
} {
  const exec = getExecution(db, executionId);
  if (!exec) throw new Error(`Execution state not found: ${executionId}`);

  return {
    total_tasks: exec.total_tasks ?? 0,
    completed_tasks: exec.current_task ?? 0,
    deviation_count: exec.deviations.length,
    rule4_count: exec.deviations.filter(d => d.rule === 4).length,
    checkpoint_count: exec.checkpoints.length,
    unresolved_checkpoints: exec.checkpoints.filter(c => !c.resolved).length,
  };
}
