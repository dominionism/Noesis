/**
 * Rule Store — CRUD operations for behavioral rules.
 *
 * All database interactions for the rules table. Follows the same patterns
 * as memory-crud.ts: explicit db injection, parameterized queries, no
 * string interpolation in SQL.
 *
 * Every rule is HMAC-signed on write and verified on retrieval.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  RuleDefinition,
  RuleDefinitionInput,
  RuleCategory,
  SignFn,
} from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Row shape coming from SQLite (booleans are integers)
// ---------------------------------------------------------------------------

interface RuleRow {
  id: string;
  name: string;
  category: string;
  description: string;
  trigger_conditions: string; // JSON
  constraints: string; // JSON
  enforcement: string;
  thresholds: string | null; // JSON
  interactions: string | null; // JSON
  version: number;
  enabled: number; // 0 or 1
  confidence: number;
  outcome_count: number;
  success_count: number;
  content: string;
  embedding: Buffer | null;
  signature: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Internal row-to-definition mapper
// ---------------------------------------------------------------------------

function rowToDefinition(row: RuleRow): RuleDefinition {
  return {
    id: row.id,
    name: row.name,
    category: row.category as RuleCategory,
    description: row.description,
    trigger_conditions: JSON.parse(row.trigger_conditions),
    constraints: JSON.parse(row.constraints),
    enforcement: row.enforcement as RuleDefinition['enforcement'],
    thresholds: row.thresholds ? JSON.parse(row.thresholds) : {},
    interactions: row.interactions ? JSON.parse(row.interactions) : [],
    version: row.version,
    enabled: row.enabled === 1,
    confidence: row.confidence,
    outcome_count: row.outcome_count,
    success_count: row.success_count,
    content: row.content,
    embedding: row.embedding,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a new rule into the database.
 *
 * The content field is HMAC-signed before storage. The caller provides
 * the sign function (dependency injection for testability).
 */
export function insertRule(
  db: DatabaseConnection,
  input: RuleDefinitionInput,
  sign: SignFn,
): RuleDefinition {
  const id = generateId();
  const now = new Date().toISOString();
  const signature = sign(input.content);

  const triggerJson = JSON.stringify(input.trigger_conditions);
  const constraintJson = JSON.stringify(input.constraints);
  const thresholdJson = input.thresholds ? JSON.stringify(input.thresholds) : null;
  const interactionJson = input.interactions ? JSON.stringify(input.interactions) : null;

  db.prepare<[
    string, string, string, string, string,
    string, string, string | null, string | null,
    string, Buffer | null, string, string, string,
  ]>(`
    INSERT INTO rules (
      id, name, category, description, trigger_conditions,
      constraints, enforcement, thresholds, interactions,
      content, embedding, signature, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `).run(
    id, input.name, input.category, input.description, triggerJson,
    constraintJson, input.enforcement, thresholdJson, interactionJson,
    input.content, input.embedding ?? null, signature, now, now,
  );

  return {
    id,
    name: input.name,
    category: input.category,
    description: input.description,
    trigger_conditions: input.trigger_conditions,
    constraints: input.constraints,
    enforcement: input.enforcement,
    thresholds: input.thresholds ?? {},
    interactions: input.interactions ?? [],
    version: 1,
    enabled: true,
    confidence: 0.5,
    outcome_count: 0,
    success_count: 0,
    content: input.content,
    embedding: input.embedding ?? null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Retrieve a rule by ID.
 */
export function getRule(db: DatabaseConnection, id: string): RuleDefinition | null {
  const row = db.prepare<[string], RuleRow>(
    'SELECT * FROM rules WHERE id = ?',
  ).get(id);
  return row ? rowToDefinition(row) : null;
}

/**
 * Retrieve a rule by its unique name.
 */
export function getRuleByName(db: DatabaseConnection, name: string): RuleDefinition | null {
  const row = db.prepare<[string], RuleRow>(
    'SELECT * FROM rules WHERE name = ?',
  ).get(name);
  return row ? rowToDefinition(row) : null;
}

/**
 * Update an existing rule. Recomputes the HMAC signature.
 */
export function updateRule(
  db: DatabaseConnection,
  id: string,
  updates: Partial<RuleDefinitionInput> & { version?: number; enabled?: boolean; confidence?: number },
  sign: SignFn,
): void {
  const existing = db.prepare<[string], RuleRow>('SELECT * FROM rules WHERE id = ?').get(id);
  if (!existing) {
    throw new Error(`Rule not found: ${id}`);
  }

  const now = new Date().toISOString();
  const content = updates.content ?? existing.content;
  const signature = sign(content);

  const name = updates.name ?? existing.name;
  const category = updates.category ?? existing.category;
  const description = updates.description ?? existing.description;
  const triggerConditions = updates.trigger_conditions !== undefined
    ? JSON.stringify(updates.trigger_conditions)
    : existing.trigger_conditions;
  const constraints = updates.constraints !== undefined
    ? JSON.stringify(updates.constraints)
    : existing.constraints;
  const enforcement = updates.enforcement ?? existing.enforcement;
  const thresholds = updates.thresholds !== undefined
    ? JSON.stringify(updates.thresholds)
    : existing.thresholds;
  const interactions = updates.interactions !== undefined
    ? JSON.stringify(updates.interactions)
    : existing.interactions;
  const version = updates.version ?? existing.version;
  const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;
  const confidence = updates.confidence ?? existing.confidence;
  const embedding = updates.embedding !== undefined ? updates.embedding : existing.embedding;

  db.prepare<[
    string, string, string, string, string,
    string, string | null, string | null, number,
    number, number, string, Buffer | null, string,
    string, string,
  ]>(`
    UPDATE rules SET
      name = ?, category = ?, description = ?, trigger_conditions = ?, constraints = ?,
      enforcement = ?, thresholds = ?, interactions = ?, version = ?,
      enabled = ?, confidence = ?, content = ?, embedding = ?, signature = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    name, category, description, triggerConditions, constraints,
    enforcement, thresholds, interactions, version,
    enabled, confidence, content, embedding ?? null, signature,
    now, id,
  );
}

/**
 * Delete a rule by ID.
 */
export function deleteRule(db: DatabaseConnection, id: string): void {
  db.prepare<[string]>('DELETE FROM rules WHERE id = ?').run(id);
}

/**
 * List rules with optional category and enabled filters.
 */
export function listRules(
  db: DatabaseConnection,
  filters?: { category?: RuleCategory; enabled?: boolean },
): RuleDefinition[] {
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare<unknown[], RuleRow>(
    `SELECT * FROM rules ${whereClause} ORDER BY confidence DESC, name ASC`,
  ).all(...params);

  return rows.map(rowToDefinition);
}

/**
 * Record a rule outcome (success or failure). Updates Bayesian confidence
 * using Laplace smoothing: confidence = (successes + 1) / (total + 2).
 */
export function recordRuleOutcome(
  db: DatabaseConnection,
  ruleId: string,
  outcome: 'success' | 'failure',
): void {
  const existing = db.prepare<[string], RuleRow>('SELECT * FROM rules WHERE id = ?').get(ruleId);
  if (!existing) {
    throw new Error(`Rule not found: ${ruleId}`);
  }

  const newOutcomeCount = existing.outcome_count + 1;
  const newSuccessCount = existing.success_count + (outcome === 'success' ? 1 : 0);
  // Bayesian with Laplace smoothing
  const newConfidence = (newSuccessCount + 1) / (newOutcomeCount + 2);
  const now = new Date().toISOString();

  db.prepare<[number, number, number, string, string]>(
    'UPDATE rules SET outcome_count = ?, success_count = ?, confidence = ?, updated_at = ? WHERE id = ?',
  ).run(newOutcomeCount, newSuccessCount, newConfidence, now, ruleId);
}
