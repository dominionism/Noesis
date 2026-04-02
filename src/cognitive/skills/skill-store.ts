/**
 * Skill Store — CRUD operations for executable skill definitions.
 *
 * Same patterns as expert-store.ts and capsule-store.ts: explicit db
 * injection, parameterized queries, HMAC signing on write.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  ExecutableSkill,
  ExecutableSkillInput,
  SkillCategory,
  CognitiveOutcomeResult,
  SignFn,
} from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Row shape from SQLite
// ---------------------------------------------------------------------------

interface SkillRow {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger_conditions: string; // JSON
  anti_patterns: string | null; // JSON
  rules: string | null; // JSON
  chain_with: string | null; // JSON
  version: string;
  enabled: number; // 0 or 1
  invocation_count: number;
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

function rowToSkill(row: SkillRow): ExecutableSkill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as SkillCategory,
    trigger_conditions: JSON.parse(row.trigger_conditions),
    anti_patterns: row.anti_patterns ? JSON.parse(row.anti_patterns) : [],
    rules: row.rules ? JSON.parse(row.rules) : [],
    chain_with: row.chain_with ? JSON.parse(row.chain_with) : [],
    version: row.version,
    enabled: row.enabled === 1,
    invocation_count: row.invocation_count,
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

export function insertSkill(
  db: DatabaseConnection,
  input: ExecutableSkillInput,
  sign: SignFn,
): ExecutableSkill {
  const id = generateId();
  const now = new Date().toISOString();
  const signature = sign(input.content);

  db.prepare<[
    string, string, string, string, string,
    string | null, string | null, string | null, string,
    string, Buffer | null, string, string, string,
  ]>(`
    INSERT INTO executable_skills (
      id, name, description, category, trigger_conditions,
      anti_patterns, rules, chain_with, version,
      content, embedding, signature, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `).run(
    id, input.name, input.description, input.category,
    JSON.stringify(input.trigger_conditions),
    input.anti_patterns ? JSON.stringify(input.anti_patterns) : null,
    input.rules ? JSON.stringify(input.rules) : null,
    input.chain_with ? JSON.stringify(input.chain_with) : null,
    input.version ?? '1.0.0',
    input.content, input.embedding ?? null, signature, now, now,
  );

  return {
    id,
    name: input.name,
    description: input.description,
    category: input.category,
    trigger_conditions: input.trigger_conditions,
    anti_patterns: input.anti_patterns ?? [],
    rules: input.rules ?? [],
    chain_with: input.chain_with ?? [],
    version: input.version ?? '1.0.0',
    enabled: true,
    invocation_count: 0,
    success_rate: 0.5,
    content: input.content,
    embedding: input.embedding ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function getSkill(
  db: DatabaseConnection,
  id: string,
): ExecutableSkill | null {
  const row = db.prepare<[string], SkillRow>(
    'SELECT * FROM executable_skills WHERE id = ?',
  ).get(id);
  return row ? rowToSkill(row) : null;
}

export function getSkillByName(
  db: DatabaseConnection,
  name: string,
): ExecutableSkill | null {
  const row = db.prepare<[string], SkillRow>(
    'SELECT * FROM executable_skills WHERE name = ?',
  ).get(name);
  return row ? rowToSkill(row) : null;
}

export function updateSkill(
  db: DatabaseConnection,
  id: string,
  updates: Partial<ExecutableSkillInput> & {
    enabled?: boolean;
    invocation_count?: number;
    success_rate?: number;
  },
  sign: SignFn,
): void {
  const existing = db.prepare<[string], SkillRow>(
    'SELECT * FROM executable_skills WHERE id = ?',
  ).get(id);
  if (!existing) throw new Error(`Skill not found: ${id}`);

  const now = new Date().toISOString();
  const content = updates.content ?? existing.content;
  const signature = sign(content);

  db.prepare<[
    string, string, string, string,
    string | null, string | null, string | null, string,
    number, number, number,
    string, Buffer | null, string, string, string,
  ]>(`
    UPDATE executable_skills SET
      name = ?, description = ?, category = ?, trigger_conditions = ?,
      anti_patterns = ?, rules = ?, chain_with = ?, version = ?,
      enabled = ?, invocation_count = ?, success_rate = ?,
      content = ?, embedding = ?, signature = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updates.name ?? existing.name,
    updates.description ?? existing.description,
    updates.category ?? existing.category,
    updates.trigger_conditions !== undefined ? JSON.stringify(updates.trigger_conditions) : existing.trigger_conditions,
    updates.anti_patterns !== undefined ? JSON.stringify(updates.anti_patterns) : existing.anti_patterns,
    updates.rules !== undefined ? JSON.stringify(updates.rules) : existing.rules,
    updates.chain_with !== undefined ? JSON.stringify(updates.chain_with) : existing.chain_with,
    updates.version ?? existing.version,
    updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled,
    updates.invocation_count ?? existing.invocation_count,
    updates.success_rate ?? existing.success_rate,
    content,
    updates.embedding !== undefined ? (updates.embedding ?? null) : existing.embedding,
    signature,
    now,
    id,
  );
}

export function deleteSkill(db: DatabaseConnection, id: string): void {
  db.prepare<[string]>('DELETE FROM executable_skills WHERE id = ?').run(id);
}

export function listSkills(
  db: DatabaseConnection,
  filters?: { category?: SkillCategory; enabled?: boolean },
): ExecutableSkill[] {
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
  const rows = db.prepare<unknown[], SkillRow>(
    `SELECT * FROM executable_skills ${where} ORDER BY success_rate DESC, name ASC`,
  ).all(...params);

  return rows.map(rowToSkill);
}

/**
 * Record a skill invocation outcome. Updates invocation_count and
 * success_rate using Bayesian Laplace smoothing.
 */
export function recordSkillInvocation(
  db: DatabaseConnection,
  skillId: string,
  outcome: CognitiveOutcomeResult,
  sign: SignFn,
): void {
  const skill = getSkill(db, skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);

  const successIncrement = outcome === 'success' ? 1 : (outcome === 'partial' ? 0.5 : 0);
  const rawSuccesses = skill.success_rate * skill.invocation_count + successIncrement;
  const newCount = skill.invocation_count + 1;
  const newRate = (rawSuccesses + 1) / (newCount + 2);

  updateSkill(db, skillId, {
    invocation_count: newCount,
    success_rate: newRate,
  }, sign);
}
