/**
 * Context Store — CRUD operations for dynamic context state.
 *
 * Contexts are per-project with global fallback. The UNIQUE(context_type,
 * project_id) constraint ensures at most one context of each type per
 * project (null project_id = global).
 *
 * Same patterns: explicit db injection, parameterized queries, HMAC signing.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  ContextEntry,
  ContextEntryInput,
  ContextType,
  SignFn,
} from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Row shape from SQLite
// ---------------------------------------------------------------------------

interface ContextRow {
  id: string;
  context_type: string;
  project_id: string | null;
  content: string;
  version: number;
  signature: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function rowToEntry(row: ContextRow): ContextEntry {
  return {
    id: row.id,
    context_type: row.context_type as ContextType,
    project_id: row.project_id,
    content: row.content,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create or update a context entry. Uses INSERT OR REPLACE keyed on
 * the UNIQUE(context_type, project_id) constraint.
 *
 * If a context of this type+project already exists, it is replaced
 * with an incremented version.
 */
export function upsertContext(
  db: DatabaseConnection,
  input: ContextEntryInput,
  sign: SignFn,
): ContextEntry {
  const projectId = input.project_id ?? null;
  const now = new Date().toISOString();
  const signature = sign(input.content);

  // Check for existing
  const existing = db.prepare<[string, string | null], ContextRow>(
    'SELECT * FROM context_state WHERE context_type = ? AND project_id IS ?',
  ).get(input.context_type, projectId);

  if (existing) {
    const newVersion = existing.version + 1;
    db.prepare<[string, number, string, string, string]>(
      'UPDATE context_state SET content = ?, version = ?, signature = ?, updated_at = ? WHERE id = ?',
    ).run(input.content, newVersion, signature, now, existing.id);

    return {
      id: existing.id,
      context_type: input.context_type,
      project_id: projectId,
      content: input.content,
      version: newVersion,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  const id = generateId();
  db.prepare<[
    string, string, string | null, string, string, string, string,
  ]>(`
    INSERT INTO context_state (
      id, context_type, project_id, content, signature, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.context_type, projectId, input.content, signature, now, now);

  return {
    id,
    context_type: input.context_type,
    project_id: projectId,
    content: input.content,
    version: 1,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get a context entry. Returns project-specific if it exists,
 * otherwise falls back to global (project_id IS NULL).
 */
export function getContext(
  db: DatabaseConnection,
  contextType: ContextType,
  projectId?: string | null,
): ContextEntry | null {
  // Try project-specific first
  if (projectId) {
    const row = db.prepare<[string, string], ContextRow>(
      'SELECT * FROM context_state WHERE context_type = ? AND project_id = ?',
    ).get(contextType, projectId);
    if (row) return rowToEntry(row);
  }

  // Fall back to global
  const row = db.prepare<[string], ContextRow>(
    'SELECT * FROM context_state WHERE context_type = ? AND project_id IS NULL',
  ).get(contextType);
  return row ? rowToEntry(row) : null;
}

/**
 * Get a context entry by ID.
 */
export function getContextById(
  db: DatabaseConnection,
  id: string,
): ContextEntry | null {
  const row = db.prepare<[string], ContextRow>(
    'SELECT * FROM context_state WHERE id = ?',
  ).get(id);
  return row ? rowToEntry(row) : null;
}

/**
 * List all contexts, optionally filtered by project.
 */
export function listContexts(
  db: DatabaseConnection,
  projectId?: string | null,
): ContextEntry[] {
  if (projectId !== undefined) {
    const rows = projectId === null
      ? db.prepare<[], ContextRow>(
          'SELECT * FROM context_state WHERE project_id IS NULL ORDER BY context_type ASC',
        ).all()
      : db.prepare<[string], ContextRow>(
          'SELECT * FROM context_state WHERE project_id = ? ORDER BY context_type ASC',
        ).all(projectId);
    return rows.map(rowToEntry);
  }

  // All contexts
  const rows = db.prepare<[], ContextRow>(
    'SELECT * FROM context_state ORDER BY context_type ASC, project_id ASC',
  ).all();
  return rows.map(rowToEntry);
}

/**
 * Update context content by ID. Increments version and re-signs.
 */
export function updateContext(
  db: DatabaseConnection,
  id: string,
  content: string,
  sign: SignFn,
): void {
  const existing = db.prepare<[string], ContextRow>(
    'SELECT * FROM context_state WHERE id = ?',
  ).get(id);
  if (!existing) throw new Error(`Context not found: ${id}`);

  const now = new Date().toISOString();
  const newVersion = existing.version + 1;
  const signature = sign(content);

  db.prepare<[string, number, string, string, string]>(
    'UPDATE context_state SET content = ?, version = ?, signature = ?, updated_at = ? WHERE id = ?',
  ).run(content, newVersion, signature, now, id);
}

/**
 * Append content to an existing context. For accumulative contexts
 * like failure_patterns, lessons_learned, research_index, session_index.
 *
 * Creates the context if it does not exist.
 */
export function appendToContext(
  db: DatabaseConnection,
  contextType: ContextType,
  projectId: string | null,
  addition: string,
  sign: SignFn,
): ContextEntry {
  const existing = projectId
    ? db.prepare<[string, string], ContextRow>(
        'SELECT * FROM context_state WHERE context_type = ? AND project_id = ?',
      ).get(contextType, projectId)
    : db.prepare<[string], ContextRow>(
        'SELECT * FROM context_state WHERE context_type = ? AND project_id IS NULL',
      ).get(contextType);

  if (existing) {
    const newContent = existing.content + '\n' + addition;
    const now = new Date().toISOString();
    const newVersion = existing.version + 1;
    const signature = sign(newContent);

    db.prepare<[string, number, string, string, string]>(
      'UPDATE context_state SET content = ?, version = ?, signature = ?, updated_at = ? WHERE id = ?',
    ).run(newContent, newVersion, signature, now, existing.id);

    return {
      id: existing.id,
      context_type: contextType,
      project_id: projectId,
      content: newContent,
      version: newVersion,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  // Create new context with the addition as initial content
  return upsertContext(db, {
    context_type: contextType,
    project_id: projectId,
    content: addition,
  }, sign);
}

/**
 * Delete a context by ID.
 */
export function deleteContext(db: DatabaseConnection, id: string): void {
  db.prepare<[string]>('DELETE FROM context_state WHERE id = ?').run(id);
}
