/**
 * Session Manager — Database-backed session lifecycle for the cognitive layer.
 *
 * Sessions are stored as JSON in `context_state` with `context_type='session_index'`
 * and project-scoped via the UNIQUE(context_type, project_id) constraint.
 *
 * This provides persistence across agent restarts, complementing the in-memory
 * workflow/session-manager.ts which handles transient session state.
 *
 * Follows standard patterns: explicit DatabaseConnection injection,
 * parameterized queries, HMAC signing.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { SessionState, EmbeddingProvider } from '../../types.js';
import type { MemorySignFn, SignFn } from '../types.js';
import { createMemory } from '../../core/memory-crud.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Internal row shape
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
// Constants
// ---------------------------------------------------------------------------

const SESSION_CONTEXT_TYPE = 'session_index';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a new session for a project. If a session already exists for this
 * project, it is replaced (the previous session content is overwritten).
 */
export function startSession(
  db: DatabaseConnection,
  projectId: string,
  agent: string,
  sign: SignFn,
): SessionState {
  const now = new Date().toISOString();

  const state: SessionState = {
    project_id: projectId,
    current_phase: 'starting',
    blockers: [],
    working_set: [],
    decisions_made: [],
    started_at: now,
    updated_at: now,
  };

  const content = JSON.stringify({ agent, ...state });
  const signature = sign(content);

  const existing = db.prepare<[string, string], ContextRow>(
    'SELECT * FROM context_state WHERE context_type = ? AND project_id = ?',
  ).get(SESSION_CONTEXT_TYPE, projectId);

  if (existing) {
    db.prepare<[string, number, string, string, string]>(
      'UPDATE context_state SET content = ?, version = ?, signature = ?, updated_at = ? WHERE id = ?',
    ).run(content, existing.version + 1, signature, now, existing.id);
  } else {
    const id = generateId();
    db.prepare<[string, string, string, string, string, string, string]>(`
      INSERT INTO context_state (
        id, context_type, project_id, content, signature, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, SESSION_CONTEXT_TYPE, projectId, content, signature, now, now);
  }

  return state;
}

/**
 * Get the current session for a project, or null if none exists.
 */
export function getSession(
  db: DatabaseConnection,
  projectId: string,
): (SessionState & { agent: string }) | null {
  const row = db.prepare<[string, string], ContextRow>(
    'SELECT * FROM context_state WHERE context_type = ? AND project_id = ?',
  ).get(SESSION_CONTEXT_TYPE, projectId);

  if (!row) return null;

  try {
    return JSON.parse(row.content);
  } catch {
    return null;
  }
}

/**
 * Update the current session state. Merges provided fields into the
 * existing session. Throws if no session exists.
 */
export function updateSession(
  db: DatabaseConnection,
  projectId: string,
  updates: Partial<Pick<SessionState, 'current_phase' | 'blockers' | 'working_set' | 'decisions_made'>>,
  sign: SignFn,
): SessionState {
  const row = db.prepare<[string, string], ContextRow>(
    'SELECT * FROM context_state WHERE context_type = ? AND project_id = ?',
  ).get(SESSION_CONTEXT_TYPE, projectId);

  if (!row) throw new Error(`No active session for project: ${projectId}`);

  const existing = JSON.parse(row.content);
  const now = new Date().toISOString();

  const merged = {
    ...existing,
    ...updates,
    updated_at: now,
  };

  const content = JSON.stringify(merged);
  const signature = sign(content);

  db.prepare<[string, number, string, string, string]>(
    'UPDATE context_state SET content = ?, version = ?, signature = ?, updated_at = ? WHERE id = ?',
  ).run(content, row.version + 1, signature, now, row.id);

  return merged;
}

/**
 * End the current session. Stores a summary and marks the session as ended.
 * The session state remains in the database for future reference.
 */
export function endSession(
  db: DatabaseConnection,
  projectId: string,
  summary: string,
  sign: SignFn,
): void {
  const row = db.prepare<[string, string], ContextRow>(
    'SELECT * FROM context_state WHERE context_type = ? AND project_id = ?',
  ).get(SESSION_CONTEXT_TYPE, projectId);

  if (!row) throw new Error(`No active session for project: ${projectId}`);

  const existing = JSON.parse(row.content);
  const now = new Date().toISOString();

  const ended = {
    ...existing,
    current_phase: 'ended',
    summary,
    ended_at: now,
    updated_at: now,
  };

  const content = JSON.stringify(ended);
  const signature = sign(content);

  db.prepare<[string, number, string, string, string]>(
    'UPDATE context_state SET content = ?, version = ?, signature = ?, updated_at = ? WHERE id = ?',
  ).run(content, row.version + 1, signature, now, row.id);
}

/**
 * Create a session checkpoint — a snapshot of the current session state
 * stored as a memory of type 'checkpoint'. This enables resumption across
 * context windows or agent switches.
 */
export async function createSessionCheckpoint(
  db: DatabaseConnection,
  projectId: string,
  checkpointData: {
    task_description: string;
    completed_steps: string[];
    remaining_steps: string[];
    current_blockers: string[];
    relevant_files: string[];
    working_state: string;
  },
  signMemory: MemorySignFn,
  embeddingProvider?: EmbeddingProvider,
): Promise<string> {
  const session = getSession(db, projectId);

  const checkpoint = {
    ...checkpointData,
    handoff_source: session?.agent ?? 'unknown',
    handoff_target: '',
    session_phase: session?.current_phase ?? 'unknown',
  };

  const content = JSON.stringify(checkpoint);
  const id = generateId();
  const title = `Checkpoint: ${checkpointData.task_description}`;
  const signature = signMemory({
    id,
    type: 'checkpoint',
    title,
    content,
    project_id: projectId,
  });

  // Compute embedding so checkpoint memories are discoverable via semantic search
  let embedding: Buffer | null = null;
  let embeddingModel: string | null = null;
  if (embeddingProvider) {
    try {
      const vector = await embeddingProvider.embed(title + ' ' + content);
      embedding = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
      embeddingModel = embeddingProvider.modelId;
    } catch { /* non-fatal — store without embedding */ }
  }

  createMemory(db, {
    type: 'checkpoint',
    title,
    content,
    project_id: projectId,
    signature,
    embedding,
    embedding_model: embeddingModel,
  }, id);

  return id;
}

/**
 * Get the most recent checkpoint for a project.
 */
export function getLatestCheckpoint(
  db: DatabaseConnection,
  projectId: string,
): { id: string; content: Record<string, unknown>; created_at: string } | null {
  const row = db.prepare<[string], { id: string; content: string; created_at: string }>(
    "SELECT id, content, created_at FROM memories WHERE type = 'checkpoint' AND project_id = ? ORDER BY rowid DESC LIMIT 1",
  ).get(projectId);

  if (!row) return null;

  try {
    return { id: row.id, content: JSON.parse(row.content), created_at: row.created_at };
  } catch {
    return null;
  }
}
