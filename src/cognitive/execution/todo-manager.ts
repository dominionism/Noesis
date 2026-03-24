/**
 * TODO Manager — Lightweight project TODO tracking.
 *
 * Stores TODOs as execution_state rows with milestone='__todo__'.
 * Each TODO gets its own row with a unique ID, enabling direct
 * lookup and status updates without project-level scanning.
 *
 * The description and area are stored as JSON in the checkpoints column.
 */

import type { DatabaseConnection } from '../../core/database.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TodoItem {
  id: string;
  project_id: string;
  description: string;
  area: string | null;
  status: 'pending' | 'completed';
  created_at: string;
}

interface TodoRow {
  id: string;
  project_id: string;
  status: string;
  checkpoints: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TODO_MILESTONE = '__todo__';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a TODO to a project.
 */
export function addTodo(
  db: DatabaseConnection,
  projectId: string,
  description: string,
  area?: string,
): string {
  const id = generateId();
  const now = new Date().toISOString();
  const meta = JSON.stringify({ description, area: area ?? null });

  db.prepare<[
    string, string, string,
    string, string, string,
  ]>(`
    INSERT INTO execution_state (
      id, project_id, milestone, phase_number, status,
      checkpoints, created_at, updated_at
    ) VALUES (?, ?, ?, 0, 'pending', ?, ?, ?)
  `).run(id, projectId, TODO_MILESTONE, meta, now, now);

  return id;
}

/**
 * List TODOs for a project, optionally filtered by area.
 */
export function listTodos(
  db: DatabaseConnection,
  projectId: string,
  area?: string,
): TodoItem[] {
  const rows = db.prepare<[string, string], TodoRow>(
    'SELECT id, project_id, status, checkpoints, created_at FROM execution_state WHERE project_id = ? AND milestone = ? ORDER BY created_at ASC',
  ).all(projectId, TODO_MILESTONE);

  const items = rows.map(rowToTodo);

  if (area) {
    return items.filter(t => t.area === area);
  }

  return items;
}

/**
 * Complete a TODO by ID.
 */
export function completeTodo(
  db: DatabaseConnection,
  todoId: string,
): void {
  const now = new Date().toISOString();
  const result = db.prepare<[string, string, string]>(
    "UPDATE execution_state SET status = 'completed', updated_at = ? WHERE id = ? AND milestone = ?",
  ).run(now, todoId, TODO_MILESTONE);

  if (result.changes === 0) {
    throw new Error(`TODO not found: ${todoId}`);
  }
}

/**
 * Get a single TODO by ID.
 */
export function getTodo(
  db: DatabaseConnection,
  todoId: string,
): TodoItem | null {
  const row = db.prepare<[string, string], TodoRow>(
    'SELECT id, project_id, status, checkpoints, created_at FROM execution_state WHERE id = ? AND milestone = ?',
  ).get(todoId, TODO_MILESTONE);

  return row ? rowToTodo(row) : null;
}

/**
 * Delete a TODO by ID.
 */
export function deleteTodo(
  db: DatabaseConnection,
  todoId: string,
): void {
  db.prepare<[string, string]>(
    'DELETE FROM execution_state WHERE id = ? AND milestone = ?',
  ).run(todoId, TODO_MILESTONE);
}

/**
 * Count TODOs by status for a project.
 */
export function countTodos(
  db: DatabaseConnection,
  projectId: string,
): { pending: number; completed: number; total: number } {
  const rows = db.prepare<[string, string], { status: string; cnt: number }>(`
    SELECT status, COUNT(*) as cnt FROM execution_state
    WHERE project_id = ? AND milestone = ?
    GROUP BY status
  `).all(projectId, TODO_MILESTONE);

  let pending = 0;
  let completed = 0;
  for (const row of rows) {
    if (row.status === 'pending') pending = row.cnt;
    if (row.status === 'completed') completed = row.cnt;
  }

  return { pending, completed, total: pending + completed };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToTodo(row: TodoRow): TodoItem {
  let description = '';
  let area: string | null = null;

  if (row.checkpoints) {
    try {
      const meta = JSON.parse(row.checkpoints);
      description = meta.description ?? '';
      area = meta.area ?? null;
    } catch {
      description = row.checkpoints;
    }
  }

  return {
    id: row.id,
    project_id: row.project_id,
    description,
    area,
    status: row.status as 'pending' | 'completed',
    created_at: row.created_at,
  };
}
