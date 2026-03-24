/**
 * Artifact Manager — Working set and artifact tracking.
 *
 * The working set (active file paths) and artifact catalog are stored
 * in `context_state` with `context_type='artifacts'` per project.
 *
 * This provides persistent tracking of which files are actively in use,
 * which artifacts have been produced, and suggestions for what to track
 * based on execution state.
 *
 * Follows standard patterns: explicit DatabaseConnection injection,
 * parameterized queries, HMAC signing.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { SignFn } from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkingSet {
  files: string[];
  updated_at: string;
}

export interface Artifact {
  path: string;
  type: 'source' | 'test' | 'config' | 'doc' | 'generated';
  description: string;
  created_at: string;
}

export interface ArtifactState {
  working_set: WorkingSet;
  artifacts: Artifact[];
}

// ---------------------------------------------------------------------------
// Row shape
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

const ARTIFACTS_CONTEXT_TYPE = 'artifacts';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getArtifactState(db: DatabaseConnection, projectId: string): { row: ContextRow | undefined; state: ArtifactState } {
  const row = db.prepare<[string, string], ContextRow>(
    'SELECT * FROM context_state WHERE context_type = ? AND project_id = ?',
  ).get(ARTIFACTS_CONTEXT_TYPE, projectId);

  if (row) {
    try {
      return { row, state: JSON.parse(row.content) };
    } catch {
      // Fall through to default
    }
  }

  return {
    row,
    state: {
      working_set: { files: [], updated_at: new Date().toISOString() },
      artifacts: [],
    },
  };
}

function saveArtifactState(
  db: DatabaseConnection,
  projectId: string,
  state: ArtifactState,
  existing: ContextRow | undefined,
  sign: SignFn,
): void {
  const now = new Date().toISOString();
  const content = JSON.stringify(state);
  const signature = sign(content);

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
    `).run(id, ARTIFACTS_CONTEXT_TYPE, projectId, content, signature, now, now);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current working set for a project.
 */
export function getWorkingSet(
  db: DatabaseConnection,
  projectId: string,
): WorkingSet {
  const { state } = getArtifactState(db, projectId);
  return state.working_set;
}

/**
 * Persist the working set (active file paths) for a project.
 * Replaces the entire file list.
 */
export function persistWorkingSet(
  db: DatabaseConnection,
  projectId: string,
  files: string[],
  sign: SignFn,
): void {
  const { row, state } = getArtifactState(db, projectId);

  state.working_set = {
    files: [...new Set(files)], // deduplicate
    updated_at: new Date().toISOString(),
  };

  saveArtifactState(db, projectId, state, row, sign);
}

/**
 * Add files to the working set without replacing existing ones.
 */
export function addToWorkingSet(
  db: DatabaseConnection,
  projectId: string,
  files: string[],
  sign: SignFn,
): void {
  const { row, state } = getArtifactState(db, projectId);

  const combined = new Set(state.working_set.files);
  for (const f of files) combined.add(f);

  state.working_set = {
    files: [...combined],
    updated_at: new Date().toISOString(),
  };

  saveArtifactState(db, projectId, state, row, sign);
}

/**
 * Remove files from the working set.
 */
export function removeFromWorkingSet(
  db: DatabaseConnection,
  projectId: string,
  files: string[],
  sign: SignFn,
): void {
  const { row, state } = getArtifactState(db, projectId);

  const toRemove = new Set(files);
  state.working_set = {
    files: state.working_set.files.filter(f => !toRemove.has(f)),
    updated_at: new Date().toISOString(),
  };

  saveArtifactState(db, projectId, state, row, sign);
}

/**
 * Record a produced artifact.
 */
export function recordArtifact(
  db: DatabaseConnection,
  projectId: string,
  artifact: Omit<Artifact, 'created_at'>,
  sign: SignFn,
): void {
  const { row, state } = getArtifactState(db, projectId);

  // Avoid duplicates by path
  const existing = state.artifacts.findIndex(a => a.path === artifact.path);
  const entry: Artifact = {
    ...artifact,
    created_at: new Date().toISOString(),
  };

  if (existing >= 0) {
    state.artifacts[existing] = entry;
  } else {
    state.artifacts.push(entry);
  }

  saveArtifactState(db, projectId, state, row, sign);
}

/**
 * Get all recorded artifacts for a project, optionally filtered by type.
 */
export function getArtifacts(
  db: DatabaseConnection,
  projectId: string,
  typeFilter?: Artifact['type'],
): Artifact[] {
  const { state } = getArtifactState(db, projectId);

  if (typeFilter) {
    return state.artifacts.filter(a => a.type === typeFilter);
  }

  return state.artifacts;
}

/**
 * Suggest artifacts based on the current working set.
 * Returns file paths from the working set that haven't been recorded
 * as artifacts yet, with inferred types.
 */
export function suggestArtifacts(
  db: DatabaseConnection,
  projectId: string,
): Array<Omit<Artifact, 'created_at'>> {
  const { state } = getArtifactState(db, projectId);
  const recordedPaths = new Set(state.artifacts.map(a => a.path));

  return state.working_set.files
    .filter(f => !recordedPaths.has(f))
    .map(path => ({
      path,
      type: inferArtifactType(path),
      description: `Auto-suggested from working set`,
    }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferArtifactType(path: string): Artifact['type'] {
  if (path.includes('.test.') || path.includes('.spec.') || path.includes('__tests__')) {
    return 'test';
  }
  if (path.endsWith('.json') || path.endsWith('.yaml') || path.endsWith('.yml') || path.endsWith('.toml') || path.endsWith('.env')) {
    return 'config';
  }
  if (path.endsWith('.md') || path.endsWith('.txt') || path.endsWith('.rst')) {
    return 'doc';
  }
  if (/(?:^|\/)(?:generated|dist|build)\//.test(path)) {
    return 'generated';
  }
  return 'source';
}
