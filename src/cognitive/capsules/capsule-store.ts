/**
 * Capsule Store — CRUD operations for deep capsules and their components.
 *
 * Same patterns as expert-store.ts: explicit db injection, parameterized
 * queries, HMAC signing on write. Capsule components are stored in a
 * separate table with a foreign key cascade.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  DeepCapsuleDefinition,
  DeepCapsuleInput,
  CapsuleComponent,
  CapsuleComponentInput,
  CapsuleComponentType,
  SignFn,
} from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Row shapes from SQLite
// ---------------------------------------------------------------------------

interface CapsuleRow {
  id: string;
  name: string;
  display_name: string;
  description: string;
  trigger_patterns: string; // JSON
  version: number;
  enabled: number; // 0 or 1
  match_count: number;
  success_rate: number;
  embedding: Buffer | null;
  signature: string;
  created_at: string;
  updated_at: string;
}

interface ComponentRow {
  id: string;
  capsule_id: string;
  component_type: string;
  content: string;
  signature: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToCapsule(row: CapsuleRow): DeepCapsuleDefinition {
  return {
    id: row.id,
    name: row.name,
    display_name: row.display_name,
    description: row.description,
    trigger_patterns: JSON.parse(row.trigger_patterns),
    version: row.version,
    enabled: row.enabled === 1,
    match_count: row.match_count,
    success_rate: row.success_rate,
    embedding: row.embedding,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToComponent(row: ComponentRow): CapsuleComponent {
  return {
    id: row.id,
    capsule_id: row.capsule_id,
    component_type: row.component_type as CapsuleComponentType,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Capsule CRUD
// ---------------------------------------------------------------------------

export function insertCapsule(
  db: DatabaseConnection,
  input: DeepCapsuleInput,
  sign: SignFn,
): DeepCapsuleDefinition {
  const id = generateId();
  const now = new Date().toISOString();
  const signature = sign(input.description);

  db.prepare<[
    string, string, string, string, string,
    Buffer | null, string, string, string,
  ]>(`
    INSERT INTO deep_capsules (
      id, name, display_name, description, trigger_patterns,
      embedding, signature, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `).run(
    id, input.name, input.display_name, input.description,
    JSON.stringify(input.trigger_patterns),
    input.embedding ?? null, signature, now, now,
  );

  return {
    id,
    name: input.name,
    display_name: input.display_name,
    description: input.description,
    trigger_patterns: input.trigger_patterns,
    version: 1,
    enabled: true,
    match_count: 0,
    success_rate: 0.5,
    embedding: input.embedding ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function getCapsule(
  db: DatabaseConnection,
  id: string,
): DeepCapsuleDefinition | null {
  const row = db.prepare<[string], CapsuleRow>(
    'SELECT * FROM deep_capsules WHERE id = ?',
  ).get(id);
  return row ? rowToCapsule(row) : null;
}

export function getCapsuleByName(
  db: DatabaseConnection,
  name: string,
): DeepCapsuleDefinition | null {
  const row = db.prepare<[string], CapsuleRow>(
    'SELECT * FROM deep_capsules WHERE name = ?',
  ).get(name);
  return row ? rowToCapsule(row) : null;
}

export function updateCapsule(
  db: DatabaseConnection,
  id: string,
  updates: Partial<DeepCapsuleInput> & {
    version?: number;
    enabled?: boolean;
    match_count?: number;
    success_rate?: number;
  },
  sign: SignFn,
): void {
  const existing = db.prepare<[string], CapsuleRow>(
    'SELECT * FROM deep_capsules WHERE id = ?',
  ).get(id);
  if (!existing) throw new Error(`Capsule not found: ${id}`);

  const now = new Date().toISOString();
  const description = updates.description ?? existing.description;
  const signature = sign(description);

  db.prepare<[
    string, string, string, string,
    number, number, number, number,
    Buffer | null, string, string, string,
  ]>(`
    UPDATE deep_capsules SET
      name = ?, display_name = ?, description = ?, trigger_patterns = ?,
      version = ?, enabled = ?, match_count = ?, success_rate = ?,
      embedding = ?, signature = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updates.name ?? existing.name,
    updates.display_name ?? existing.display_name,
    description,
    updates.trigger_patterns
      ? JSON.stringify(updates.trigger_patterns)
      : existing.trigger_patterns,
    updates.version ?? existing.version,
    updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled,
    updates.match_count ?? existing.match_count,
    updates.success_rate ?? existing.success_rate,
    updates.embedding !== undefined ? (updates.embedding ?? null) : existing.embedding,
    signature,
    now,
    id,
  );
}

export function deleteCapsule(db: DatabaseConnection, id: string): void {
  db.prepare<[string]>('DELETE FROM deep_capsules WHERE id = ?').run(id);
}

export function listCapsules(
  db: DatabaseConnection,
  filters?: { enabled?: boolean },
): DeepCapsuleDefinition[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.enabled !== undefined) {
    conditions.push('enabled = ?');
    params.push(filters.enabled ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare<unknown[], CapsuleRow>(
    `SELECT * FROM deep_capsules ${where} ORDER BY success_rate DESC, name ASC`,
  ).all(...params);

  return rows.map(rowToCapsule);
}

// ---------------------------------------------------------------------------
// Component CRUD
// ---------------------------------------------------------------------------

export function insertComponent(
  db: DatabaseConnection,
  input: CapsuleComponentInput,
  sign: SignFn,
): CapsuleComponent {
  const id = generateId();
  const now = new Date().toISOString();
  const signature = sign(input.content);

  db.prepare<[
    string, string, string, string, string, string, string,
  ]>(`
    INSERT INTO capsule_components (
      id, capsule_id, component_type, content, signature, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.capsule_id, input.component_type, input.content, signature, now, now,
  );

  return {
    id,
    capsule_id: input.capsule_id,
    component_type: input.component_type,
    content: input.content,
    created_at: now,
    updated_at: now,
  };
}

export function getComponents(
  db: DatabaseConnection,
  capsuleId: string,
): CapsuleComponent[] {
  const rows = db.prepare<[string], ComponentRow>(
    'SELECT * FROM capsule_components WHERE capsule_id = ? ORDER BY component_type ASC',
  ).all(capsuleId);

  return rows.map(rowToComponent);
}

export function getComponent(
  db: DatabaseConnection,
  capsuleId: string,
  componentType: CapsuleComponentType,
): CapsuleComponent | null {
  const row = db.prepare<[string, string], ComponentRow>(
    'SELECT * FROM capsule_components WHERE capsule_id = ? AND component_type = ?',
  ).get(capsuleId, componentType);

  return row ? rowToComponent(row) : null;
}

export function updateComponent(
  db: DatabaseConnection,
  id: string,
  content: string,
  sign: SignFn,
): void {
  const existing = db.prepare<[string], ComponentRow>(
    'SELECT * FROM capsule_components WHERE id = ?',
  ).get(id);
  if (!existing) throw new Error(`Component not found: ${id}`);

  const now = new Date().toISOString();
  const signature = sign(content);

  db.prepare<[string, string, string, string]>(
    'UPDATE capsule_components SET content = ?, signature = ?, updated_at = ? WHERE id = ?',
  ).run(content, signature, now, id);
}

export function deleteComponent(db: DatabaseConnection, id: string): void {
  db.prepare<[string]>('DELETE FROM capsule_components WHERE id = ?').run(id);
}
