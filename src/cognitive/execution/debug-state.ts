/**
 * Debug State — Persistent debug session management.
 *
 * Manages structured debug sessions that survive context resets.
 * Stored as JSON in the execution_state.debug_state column.
 *
 * Debug lifecycle:
 *   gathering → investigating → fixing → verifying → resolved
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { DebugState, DebugHypothesis } from '../types.js';
import { getExecution, getCurrentExecution, updateExecution } from './gsd-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DebugStatus = DebugState['status'];

const VALID_DEBUG_TRANSITIONS: Record<DebugStatus, DebugStatus[]> = {
  gathering: ['investigating'],
  investigating: ['fixing', 'gathering'],
  fixing: ['verifying'],
  verifying: ['resolved', 'investigating'],
  resolved: [],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new debug session on an execution state.
 *
 * Sets the debug_state JSON and optionally transitions status to 'blocked'.
 */
export function createDebugSession(
  db: DatabaseConnection,
  executionId: string,
  slug: string,
  symptoms: string[],
): DebugState {
  const exec = getExecution(db, executionId);
  if (!exec) throw new Error(`Execution state not found: ${executionId}`);

  if (exec.debug_state && exec.debug_state.status !== 'resolved') {
    throw new Error(`Active debug session already exists: ${exec.debug_state.slug}`);
  }

  const debugState: DebugState = {
    slug,
    status: 'gathering',
    symptoms,
    hypotheses: [],
    root_cause: null,
    fix_description: null,
  };

  updateExecution(db, executionId, { debug_state: debugState });

  return debugState;
}

/**
 * Add a hypothesis to the active debug session.
 */
export function addHypothesis(
  db: DatabaseConnection,
  executionId: string,
  hypothesis: Omit<DebugHypothesis, 'tested' | 'result'>,
): void {
  const exec = getExecution(db, executionId);
  if (!exec?.debug_state) throw new Error('No active debug session');

  const fullHypothesis: DebugHypothesis = {
    ...hypothesis,
    tested: false,
    result: null,
  };

  const updated: DebugState = {
    ...exec.debug_state,
    hypotheses: [...exec.debug_state.hypotheses, fullHypothesis],
    status: exec.debug_state.status === 'gathering' ? 'investigating' : exec.debug_state.status,
  };

  updateExecution(db, executionId, { debug_state: updated });
}

/**
 * Update the result of a hypothesis after testing.
 */
export function updateHypothesisResult(
  db: DatabaseConnection,
  executionId: string,
  hypothesisIndex: number,
  result: 'confirmed' | 'rejected' | 'inconclusive',
  evidence: string[],
): void {
  const exec = getExecution(db, executionId);
  if (!exec?.debug_state) throw new Error('No active debug session');

  const hypotheses = [...exec.debug_state.hypotheses];
  if (hypothesisIndex < 0 || hypothesisIndex >= hypotheses.length) {
    throw new Error(`Hypothesis index out of range: ${hypothesisIndex}`);
  }

  hypotheses[hypothesisIndex] = {
    ...hypotheses[hypothesisIndex],
    tested: true,
    result,
    evidence_for: result === 'confirmed'
      ? [...hypotheses[hypothesisIndex].evidence_for, ...evidence]
      : hypotheses[hypothesisIndex].evidence_for,
    evidence_against: result === 'rejected'
      ? [...hypotheses[hypothesisIndex].evidence_against, ...evidence]
      : hypotheses[hypothesisIndex].evidence_against,
  };

  // Transition to 'fixing' if a hypothesis is confirmed
  const newStatus = result === 'confirmed' && exec.debug_state.status === 'investigating'
    ? 'fixing' as const
    : exec.debug_state.status;

  updateExecution(db, executionId, {
    debug_state: { ...exec.debug_state, hypotheses, status: newStatus },
  });
}

/**
 * Resolve the debug session with root cause and fix.
 */
export function resolveDebug(
  db: DatabaseConnection,
  executionId: string,
  rootCause: string,
  fixDescription: string,
): void {
  const exec = getExecution(db, executionId);
  if (!exec?.debug_state) throw new Error('No active debug session');

  updateExecution(db, executionId, {
    debug_state: {
      ...exec.debug_state,
      status: 'resolved',
      root_cause: rootCause,
      fix_description: fixDescription,
    },
  });
}

/**
 * Get the active debug session for a project.
 *
 * Scans execution states for the most recent active debug session.
 */
export function getActiveDebugSession(
  db: DatabaseConnection,
  projectId: string,
): { executionId: string; debugState: DebugState } | null {
  const exec = getCurrentExecution(db, projectId);
  if (!exec?.debug_state) return null;
  if (exec.debug_state.status === 'resolved') return null;

  return { executionId: exec.id, debugState: exec.debug_state };
}

/**
 * Check if a debug transition is valid.
 */
export function isValidDebugTransition(
  from: DebugStatus,
  to: DebugStatus,
): boolean {
  return VALID_DEBUG_TRANSITIONS[from]?.includes(to) ?? false;
}
