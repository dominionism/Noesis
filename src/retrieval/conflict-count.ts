import type { DatabaseConnection } from '../core/database.js';

export function countUnresolvedConflicts(
  db: DatabaseConnection,
  projectId?: string,
): number {
  if (projectId) {
    const row = db.prepare<[string, string], { count: number }>(`
      SELECT COUNT(*) AS count
      FROM memory_conflicts mc
      JOIN memories a ON a.id = mc.memory_a_id
      JOIN memories b ON b.id = mc.memory_b_id
      WHERE mc.resolution IS NULL
        AND (a.project_id = ? OR b.project_id = ?)
    `).get(projectId, projectId);

    return row?.count ?? 0;
  }

  const row = db.prepare<[], { count: number }>(`
    SELECT COUNT(*) AS count
    FROM memory_conflicts
    WHERE resolution IS NULL
  `).get();

  return row?.count ?? 0;
}
