/**
 * Memory Partitioning & Project Isolation
 *
 * Two modes:
 * - Default: Single SQLite DB with project_id scoping on queries
 * - Isolated: Opt-in per project, separate DB at
 *   ~/.agents/isolated/<project>/db.sqlite
 *
 * Global promotion: After a memory is accessed across 3+ projects,
 * auto-promote to global scope (scope='global', project_id=NULL).
 */

import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

import { NOESIS_HOME, DB_PATH, FILE_PERMISSIONS } from '../constants.js';

const ISOLATED_DIR = join(NOESIS_HOME, 'isolated');
const GLOBAL_PROMOTION_THRESHOLD = 3;

/**
 * Return the database path for a project.
 *
 * Default mode returns shared DB. Isolated mode returns per-project DB.
 */
export function getProjectDatabase(
  projectId: string,
  isolationMode: boolean,
): string {
  if (!isolationMode) return DB_PATH;

  const projectDir = join(ISOLATED_DIR, projectId);
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true, mode: FILE_PERMISSIONS.DIR });
  }
  return join(projectDir, 'db.sqlite');
}

/**
 * Determine whether a memory should be promoted to global scope.
 *
 * Qualifies when accessed from 3+ distinct projects (via edge analysis).
 */
export function shouldPromoteToGlobal(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<{ project_id: string | null }> } },
  memoryId: string,
): boolean {
  const stmt = db.prepare(`
    SELECT DISTINCT m.project_id
    FROM memory_edges e
    JOIN memories m ON (
      (e.source_id = ? AND m.id = e.target_id)
      OR
      (e.target_id = ? AND m.id = e.source_id)
    )
    WHERE m.project_id IS NOT NULL
  `);
  const rows = stmt.all(memoryId, memoryId);

  const ownStmt = db.prepare(`SELECT project_id FROM memories WHERE id = ?`);
  const ownRows = ownStmt.all(memoryId) as Array<{ project_id: string | null }>;

  const distinctProjects = new Set<string>();
  for (const row of rows) {
    if (row.project_id) distinctProjects.add(row.project_id);
  }
  for (const row of ownRows) {
    if (row.project_id) distinctProjects.add(row.project_id);
  }

  return distinctProjects.size >= GLOBAL_PROMOTION_THRESHOLD;
}

/**
 * Promote a memory to global scope.
 */
export function promoteToGlobal(
  db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } },
  memoryId: string,
): void {
  db.prepare(`
    UPDATE memories
    SET scope = 'global',
        project_id = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), memoryId);
}
