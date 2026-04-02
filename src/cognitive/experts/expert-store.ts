/**
 * Expert Store — CRUD operations for expert agent definitions.
 *
 * All database interactions for the experts table. Same patterns as
 * rule-store.ts: explicit db injection, parameterized queries,
 * HMAC signing on write.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  ExpertDefinition,
  ExpertDefinitionInput,
  ExpertCategory,
  SignFn,
} from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Row shape from SQLite
// ---------------------------------------------------------------------------

interface ExpertRow {
  id: string;
  name: string;
  display_name: string | null;
  role: string;
  domain: string;
  category: string;
  trigger_conditions: string;
  scope: string;
  deliverables: string;
  anti_patterns: string | null;
  grading_criteria: string | null;
  tools: string | null;
  model_preference: string | null;
  version: number;
  enabled: number;
  task_count: number;
  success_rate: number;
  content: string;
  embedding: Buffer | null;
  signature: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function rowToDefinition(row: ExpertRow): ExpertDefinition {
  return {
    id: row.id,
    name: row.name,
    display_name: row.display_name ?? row.name,
    role: row.role,
    domain: row.domain,
    category: row.category as ExpertCategory,
    trigger_conditions: JSON.parse(row.trigger_conditions),
    scope: JSON.parse(row.scope),
    deliverables: JSON.parse(row.deliverables),
    anti_patterns: row.anti_patterns ? JSON.parse(row.anti_patterns) : [],
    grading_criteria: row.grading_criteria ? JSON.parse(row.grading_criteria) : [],
    tools: row.tools ? JSON.parse(row.tools) : [],
    model_preference: row.model_preference ?? undefined,
    version: row.version,
    enabled: row.enabled === 1,
    task_count: row.task_count,
    success_rate: row.success_rate,
    content: row.content,
    embedding: row.embedding,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function insertExpert(
  db: DatabaseConnection,
  input: ExpertDefinitionInput,
  sign: SignFn,
): ExpertDefinition {
  const id = generateId();
  const now = new Date().toISOString();
  const signature = sign(input.content);

  db.prepare<[
    string, string, string, string, string,
    string, string, string, string,
    string | null, string | null, string | null, string | null,
    string, Buffer | null, string, string, string,
  ]>(`
    INSERT INTO experts (
      id, name, display_name, role, domain,
      category, trigger_conditions, scope, deliverables,
      anti_patterns, grading_criteria, tools, model_preference,
      content, embedding, signature, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `).run(
    id, input.name, input.display_name, input.role, input.domain,
    input.category, JSON.stringify(input.trigger_conditions), JSON.stringify(input.scope), JSON.stringify(input.deliverables),
    input.anti_patterns ? JSON.stringify(input.anti_patterns) : null,
    input.grading_criteria ? JSON.stringify(input.grading_criteria) : null,
    input.tools ? JSON.stringify(input.tools) : null,
    input.model_preference ?? null,
    input.content, input.embedding ?? null, signature, now, now,
  );

  return {
    id,
    name: input.name,
    display_name: input.display_name,
    role: input.role,
    domain: input.domain,
    category: input.category,
    trigger_conditions: input.trigger_conditions,
    scope: input.scope,
    deliverables: input.deliverables,
    anti_patterns: input.anti_patterns ?? [],
    grading_criteria: input.grading_criteria ?? [],
    tools: input.tools ?? [],
    model_preference: input.model_preference,
    version: 1,
    enabled: true,
    task_count: 0,
    success_rate: 0.5,
    content: input.content,
    embedding: input.embedding ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function getExpert(db: DatabaseConnection, id: string): ExpertDefinition | null {
  const row = db.prepare<[string], ExpertRow>(
    'SELECT * FROM experts WHERE id = ?',
  ).get(id);
  return row ? rowToDefinition(row) : null;
}

export function getExpertByName(db: DatabaseConnection, name: string): ExpertDefinition | null {
  const row = db.prepare<[string], ExpertRow>(
    'SELECT * FROM experts WHERE name = ?',
  ).get(name);
  return row ? rowToDefinition(row) : null;
}

export function updateExpert(
  db: DatabaseConnection,
  id: string,
  updates: Partial<Omit<ExpertDefinitionInput, 'model_preference'>> & {
    model_preference?: string | null;
    version?: number;
    enabled?: boolean;
    task_count?: number;
    success_rate?: number;
  },
  sign: SignFn,
): void {
  const existing = db.prepare<[string], ExpertRow>('SELECT * FROM experts WHERE id = ?').get(id);
  if (!existing) throw new Error(`Expert not found: ${id}`);

  const now = new Date().toISOString();
  const content = updates.content ?? existing.content;
  const signature = sign(content);

  db.prepare<[
    string, string, string, string, string,
    string, string, string, string | null,
    string | null, string | null, string | null,
    number, number, number, number,
    string, Buffer | null, string, string, string,
  ]>(`
    UPDATE experts SET
      name = ?, display_name = ?, role = ?, domain = ?, category = ?,
      trigger_conditions = ?, scope = ?, deliverables = ?, anti_patterns = ?,
      grading_criteria = ?, tools = ?, model_preference = ?,
      version = ?, enabled = ?, task_count = ?, success_rate = ?,
      content = ?, embedding = ?, signature = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updates.name ?? existing.name,
    updates.display_name ?? existing.display_name ?? existing.name,
    updates.role ?? existing.role,
    updates.domain ?? existing.domain,
    updates.category ?? existing.category,
    updates.trigger_conditions !== undefined ? JSON.stringify(updates.trigger_conditions) : existing.trigger_conditions,
    updates.scope !== undefined ? JSON.stringify(updates.scope) : existing.scope,
    updates.deliverables !== undefined ? JSON.stringify(updates.deliverables) : existing.deliverables,
    updates.anti_patterns !== undefined ? JSON.stringify(updates.anti_patterns) : existing.anti_patterns,
    updates.grading_criteria !== undefined ? JSON.stringify(updates.grading_criteria) : existing.grading_criteria,
    updates.tools !== undefined ? JSON.stringify(updates.tools) : existing.tools,
    updates.model_preference !== undefined ? (updates.model_preference ?? null) : existing.model_preference,
    updates.version ?? existing.version,
    updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled,
    updates.task_count ?? existing.task_count,
    updates.success_rate ?? existing.success_rate,
    content,
    updates.embedding !== undefined ? (updates.embedding ?? null) : existing.embedding,
    signature,
    now,
    id,
  );
}

export function deleteExpert(db: DatabaseConnection, id: string): void {
  db.prepare<[string]>('DELETE FROM experts WHERE id = ?').run(id);
}

export function listExperts(
  db: DatabaseConnection,
  filters?: { category?: ExpertCategory; enabled?: boolean },
): ExpertDefinition[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.category) {
    conditions.push('category = ?');
    params.push(filters.category);
  }
  if (filters?.enabled !== undefined) {
    conditions.push('enabled = ?');
    params.push(filters.enabled ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare<unknown[], ExpertRow>(
    `SELECT * FROM experts ${where} ORDER BY success_rate DESC, name ASC`,
  ).all(...params);

  return rows.map(rowToDefinition);
}
