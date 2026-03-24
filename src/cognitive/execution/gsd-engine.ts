/**
 * GSD Engine — Project lifecycle and execution state management.
 *
 * CRUD operations for the execution_state table, plus high-level
 * state transitions and progress tracking. All JSON columns
 * (checkpoints, deviations, debug_state) are serialized/deserialized
 * transparently.
 *
 * State machine:
 *   pending → researching → planning → checking → executing → verifying → completed
 *   Any state → blocked | paused
 *   blocked | paused → previous state (resume)
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  ExecutionState,
  ExecutionStateInput,
  ExecutionStatus,
  ExecutionCheckpoint,
  ExecutionDeviation,
  DebugState,
} from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Row shape from SQLite
// ---------------------------------------------------------------------------

interface ExecutionRow {
  id: string;
  project_id: string;
  milestone: string | null;
  phase_number: number;
  plan_id: string | null;
  status: string;
  current_task: number | null;
  total_tasks: number | null;
  wave: number;
  checkpoints: string | null; // JSON
  deviations: string | null;  // JSON
  debug_state: string | null; // JSON
  created_at: string;
  updated_at: string;
}

function rowToState(row: ExecutionRow): ExecutionState {
  return {
    id: row.id,
    project_id: row.project_id,
    milestone: row.milestone,
    phase_number: row.phase_number,
    plan_id: row.plan_id,
    status: row.status as ExecutionStatus,
    current_task: row.current_task,
    total_tasks: row.total_tasks,
    wave: row.wave,
    checkpoints: row.checkpoints ? JSON.parse(row.checkpoints) : [],
    deviations: row.deviations ? JSON.parse(row.deviations) : [],
    debug_state: row.debug_state ? JSON.parse(row.debug_state) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Valid state transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  pending: ['researching', 'planning', 'executing', 'blocked', 'paused'],
  researching: ['planning', 'blocked', 'paused'],
  planning: ['checking', 'executing', 'blocked', 'paused'],
  checking: ['planning', 'executing', 'blocked', 'paused'],
  executing: ['verifying', 'completed', 'blocked', 'paused'],
  verifying: ['completed', 'executing', 'blocked', 'paused'],
  completed: [],
  blocked: ['pending', 'researching', 'planning', 'checking', 'executing', 'verifying', 'paused'],
  paused: ['pending', 'researching', 'planning', 'checking', 'executing', 'verifying', 'blocked'],
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new execution state for a project phase.
 */
export function createExecution(
  db: DatabaseConnection,
  input: ExecutionStateInput,
): ExecutionState {
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare<[
    string, string, string | null, number, string | null,
    string, number | null, number | null, number,
    string | null, string | null, string | null,
    string, string,
  ]>(`
    INSERT INTO execution_state (
      id, project_id, milestone, phase_number, plan_id,
      status, current_task, total_tasks, wave,
      checkpoints, deviations, debug_state,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?
    )
  `).run(
    id, input.project_id, input.milestone ?? null, input.phase_number ?? 0, input.plan_id ?? null,
    input.status ?? 'pending', null, null, 1,
    '[]', '[]', null,
    now, now,
  );

  return {
    id,
    project_id: input.project_id,
    milestone: input.milestone ?? null,
    phase_number: input.phase_number ?? 0,
    plan_id: input.plan_id ?? null,
    status: input.status ?? 'pending',
    current_task: null,
    total_tasks: null,
    wave: 1,
    checkpoints: [],
    deviations: [],
    debug_state: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get execution state by ID.
 */
export function getExecution(
  db: DatabaseConnection,
  id: string,
): ExecutionState | null {
  const row = db.prepare<[string], ExecutionRow>(
    'SELECT * FROM execution_state WHERE id = ?',
  ).get(id);
  return row ? rowToState(row) : null;
}

/**
 * Get execution state for a project and phase.
 */
export function getProjectPhaseExecution(
  db: DatabaseConnection,
  projectId: string,
  phaseNumber: number,
): ExecutionState | null {
  const row = db.prepare<[string, number], ExecutionRow>(
    'SELECT * FROM execution_state WHERE project_id = ? AND phase_number = ? ORDER BY created_at DESC LIMIT 1',
  ).get(projectId, phaseNumber);
  return row ? rowToState(row) : null;
}

/**
 * Get the current (most recent) execution state for a project.
 */
export function getCurrentExecution(
  db: DatabaseConnection,
  projectId: string,
): ExecutionState | null {
  const row = db.prepare<[string], ExecutionRow>(
    'SELECT * FROM execution_state WHERE project_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1',
  ).get(projectId);
  return row ? rowToState(row) : null;
}

/**
 * List all execution states for a project, ordered by phase.
 */
export function listExecutions(
  db: DatabaseConnection,
  projectId: string,
): ExecutionState[] {
  const rows = db.prepare<[string], ExecutionRow>(
    'SELECT * FROM execution_state WHERE project_id = ? ORDER BY phase_number ASC, created_at ASC',
  ).all(projectId);
  return rows.map(rowToState);
}

/**
 * Update an execution state.
 *
 * JSON columns (checkpoints, deviations, debug_state) are serialized.
 */
export function updateExecution(
  db: DatabaseConnection,
  id: string,
  updates: Partial<Omit<ExecutionState, 'id' | 'project_id' | 'created_at'>>,
): void {
  const existing = getExecution(db, id);
  if (!existing) throw new Error(`Execution state not found: ${id}`);

  const now = new Date().toISOString();

  const status = updates.status ?? existing.status;
  const checkpoints = updates.checkpoints !== undefined
    ? JSON.stringify(updates.checkpoints)
    : JSON.stringify(existing.checkpoints);
  const deviations = updates.deviations !== undefined
    ? JSON.stringify(updates.deviations)
    : JSON.stringify(existing.deviations);
  const debugState = updates.debug_state !== undefined
    ? (updates.debug_state ? JSON.stringify(updates.debug_state) : null)
    : (existing.debug_state ? JSON.stringify(existing.debug_state) : null);

  db.prepare<[
    string | null, number, string | null, string,
    number | null, number | null, number,
    string, string, string | null,
    string, string,
  ]>(`
    UPDATE execution_state SET
      milestone = ?, phase_number = ?, plan_id = ?, status = ?,
      current_task = ?, total_tasks = ?, wave = ?,
      checkpoints = ?, deviations = ?, debug_state = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    updates.milestone !== undefined ? updates.milestone : existing.milestone,
    updates.phase_number ?? existing.phase_number,
    updates.plan_id !== undefined ? updates.plan_id : existing.plan_id,
    status,
    updates.current_task !== undefined ? updates.current_task : existing.current_task,
    updates.total_tasks !== undefined ? updates.total_tasks : existing.total_tasks,
    updates.wave ?? existing.wave,
    checkpoints, deviations, debugState,
    now, id,
  );
}

/**
 * Delete an execution state.
 */
export function deleteExecution(db: DatabaseConnection, id: string): void {
  db.prepare<[string]>('DELETE FROM execution_state WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

/**
 * Transition execution to a new status.
 *
 * Validates the transition against the state machine.
 * Returns the updated state.
 */
export function transitionStatus(
  db: DatabaseConnection,
  id: string,
  newStatus: ExecutionStatus,
): ExecutionState {
  const existing = getExecution(db, id);
  if (!existing) throw new Error(`Execution state not found: ${id}`);

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${existing.status} → ${newStatus}. ` +
      `Allowed: ${allowed.join(', ') || 'none'}`,
    );
  }

  updateExecution(db, id, { status: newStatus });
  return getExecution(db, id)!;
}

/**
 * Check if a status transition is valid.
 */
export function isValidTransition(
  from: ExecutionStatus,
  to: ExecutionStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

export interface PhaseProgress {
  phase_number: number;
  status: ExecutionStatus;
  milestone: string | null;
  current_task: number | null;
  total_tasks: number | null;
  wave: number;
  checkpoint_count: number;
  unresolved_checkpoints: number;
  deviation_count: number;
}

export interface ProjectProgress {
  project_id: string;
  phases: PhaseProgress[];
  current_phase: number;
  overall_status: ExecutionStatus;
}

/**
 * Get progress summary for a project.
 */
export function getProjectProgress(
  db: DatabaseConnection,
  projectId: string,
): ProjectProgress {
  const executions = listExecutions(db, projectId);

  const phases: PhaseProgress[] = executions.map(exec => ({
    phase_number: exec.phase_number,
    status: exec.status,
    milestone: exec.milestone,
    current_task: exec.current_task,
    total_tasks: exec.total_tasks,
    wave: exec.wave,
    checkpoint_count: exec.checkpoints.length,
    unresolved_checkpoints: exec.checkpoints.filter(c => !c.resolved).length,
    deviation_count: exec.deviations.length,
  }));

  const current = executions.find(e =>
    e.status !== 'completed' && e.status !== 'paused',
  );

  const allCompleted = executions.length > 0 &&
    executions.every(e => e.status === 'completed');

  return {
    project_id: projectId,
    phases,
    current_phase: current?.phase_number ?? (phases.length > 0 ? phases[phases.length - 1].phase_number : 0),
    overall_status: allCompleted ? 'completed' : (current?.status ?? 'pending'),
  };
}
