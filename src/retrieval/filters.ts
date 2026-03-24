/**
 * Retrieval Filter Builder
 *
 * Builds parameterized SQL WHERE clauses from RecallParams. All user-supplied
 * values are passed as bind parameters to prevent SQL injection (OWASP A03).
 *
 * Every query unconditionally filters on `status = 'active'`.
 */

import type { RecallParams } from '../types.js';

export interface FilterResult {
  where: string;
  values: unknown[];
}

/**
 * Build a parameterized SQL WHERE clause from retrieval parameters.
 *
 * All conditions are ANDed together. Tag filtering uses json_each() to
 * search the JSON array stored in the `tags` column.
 */
export function buildFilterSQL(params: RecallParams): FilterResult {
  const conditions: string[] = [];
  const values: unknown[] = [];

  // Mandatory: only active memories
  conditions.push("m.status = 'active'");

  // Project scope
  if (params.project_id !== undefined) {
    conditions.push('(m.project_id = ? OR m.project_id IS NULL)');
    values.push(params.project_id);
  }

  // Type inclusion filter
  if (params.type_filter !== undefined && params.type_filter.length > 0) {
    const placeholders = params.type_filter.map(() => '?').join(', ');
    conditions.push(`m.type IN (${placeholders})`);
    values.push(...params.type_filter);
  }

  // Type exclusion filter
  if (params.type_exclude !== undefined && params.type_exclude.length > 0) {
    const placeholders = params.type_exclude.map(() => '?').join(', ');
    conditions.push(`m.type NOT IN (${placeholders})`);
    values.push(...params.type_exclude);
  }

  // Tag filter — match if ANY tag in the memory's tags array is in the filter
  if (params.tag_filter !== undefined && params.tag_filter.length > 0) {
    const tagPlaceholders = params.tag_filter.map(() => '?').join(', ');
    conditions.push(
      `EXISTS (SELECT 1 FROM json_each(m.tags) AS jt WHERE jt.value IN (${tagPlaceholders}))`,
    );
    values.push(...params.tag_filter);
  }

  // Minimum confidence
  if (params.min_confidence !== undefined) {
    conditions.push('m.confidence >= ?');
    values.push(params.min_confidence);
  }

  // Outcome filter
  if (params.outcome_filter !== undefined && params.outcome_filter.length > 0) {
    const placeholders = params.outcome_filter.map(() => '?').join(', ');
    conditions.push(`m.outcome IN (${placeholders})`);
    values.push(...params.outcome_filter);
  }

  // Assemble
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where, values };
}
