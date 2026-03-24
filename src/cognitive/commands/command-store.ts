/**
 * Command Store — CRUD operations for structured commands.
 *
 * Follows the same patterns as rule-store, expert-store, etc:
 * - Explicit DatabaseConnection injection
 * - Parameterized queries (no SQL interpolation)
 * - HMAC signing on writes via SignFn dependency injection
 * - Row-to-definition mapping with JSON field parsing
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  CommandDefinition,
  CommandDefinitionInput,
  CommandCategory,
  SignFn,
} from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Row shape from SQLite
// ---------------------------------------------------------------------------

interface CommandRow {
  id: string;
  name: string;
  description: string;
  category: string;
  argument_hint: string | null;
  allowed_tools: string | null; // JSON array
  content: string;
  enabled: number; // 0 or 1
  signature: string;
  created_at: string;
  updated_at: string;
}

function rowToDefinition(row: CommandRow): CommandDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as CommandCategory,
    argument_hint: row.argument_hint ?? '',
    allowed_tools: row.allowed_tools ? JSON.parse(row.allowed_tools) : [],
    content: row.content,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a new command.
 */
export function insertCommand(
  db: DatabaseConnection,
  input: CommandDefinitionInput,
  sign: SignFn,
): CommandDefinition {
  const id = generateId();
  const now = new Date().toISOString();
  const signature = sign(input.content);
  const allowedToolsJson = input.allowed_tools
    ? JSON.stringify(input.allowed_tools)
    : null;

  db.prepare<[
    string, string, string, string,
    string | null, string | null, string,
    string, string, string,
  ]>(`
    INSERT INTO commands (
      id, name, description, category,
      argument_hint, allowed_tools, content,
      signature, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
  `).run(
    id, input.name, input.description, input.category,
    input.argument_hint ?? null, allowedToolsJson, input.content,
    signature, now, now,
  );

  return {
    id,
    name: input.name,
    description: input.description,
    category: input.category,
    argument_hint: input.argument_hint ?? '',
    allowed_tools: input.allowed_tools ?? [],
    content: input.content,
    enabled: true,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get a command by ID.
 */
export function getCommand(
  db: DatabaseConnection,
  id: string,
): CommandDefinition | null {
  const row = db.prepare<[string], CommandRow>(
    'SELECT * FROM commands WHERE id = ?',
  ).get(id);
  return row ? rowToDefinition(row) : null;
}

/**
 * Get a command by name.
 */
export function getCommandByName(
  db: DatabaseConnection,
  name: string,
): CommandDefinition | null {
  const row = db.prepare<[string], CommandRow>(
    'SELECT * FROM commands WHERE name = ?',
  ).get(name);
  return row ? rowToDefinition(row) : null;
}

/**
 * Update a command.
 */
export function updateCommand(
  db: DatabaseConnection,
  id: string,
  updates: Partial<CommandDefinitionInput> & { enabled?: boolean },
  sign: SignFn,
): void {
  const existing = db.prepare<[string], CommandRow>(
    'SELECT * FROM commands WHERE id = ?',
  ).get(id);
  if (!existing) throw new Error(`Command not found: ${id}`);

  const now = new Date().toISOString();
  const content = updates.content ?? existing.content;
  const signature = sign(content);

  const allowedTools = updates.allowed_tools !== undefined
    ? JSON.stringify(updates.allowed_tools)
    : existing.allowed_tools;

  db.prepare<[
    string, string, string | null,
    string | null, string,
    number, string, string,
    string, string,
  ]>(`
    UPDATE commands SET
      description = ?, category = ?, argument_hint = ?,
      allowed_tools = ?, content = ?,
      enabled = ?, signature = ?, updated_at = ?
    WHERE name = ? AND id = ?
  `).run(
    updates.description ?? existing.description,
    updates.category ?? existing.category,
    updates.argument_hint ?? existing.argument_hint,
    allowedTools, content,
    updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled,
    signature, now,
    updates.name ?? existing.name, id,
  );
}

/**
 * Delete a command by ID.
 */
export function deleteCommand(db: DatabaseConnection, id: string): void {
  db.prepare<[string]>('DELETE FROM commands WHERE id = ?').run(id);
}

/**
 * List commands, optionally filtered by category and/or enabled status.
 */
export function listCommands(
  db: DatabaseConnection,
  options?: { category?: CommandCategory; enabledOnly?: boolean },
): CommandDefinition[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options?.category) {
    conditions.push('category = ?');
    params.push(options.category);
  }

  if (options?.enabledOnly) {
    conditions.push('enabled = 1');
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const rows = db.prepare<unknown[], CommandRow>(
    `SELECT * FROM commands ${where} ORDER BY category ASC, name ASC`,
  ).all(...params);

  return rows.map(rowToDefinition);
}

/**
 * Count commands by category.
 */
export function countCommands(
  db: DatabaseConnection,
): Record<CommandCategory, number> {
  const rows = db.prepare<[], { category: string; cnt: number }>(`
    SELECT category, COUNT(*) as cnt FROM commands
    GROUP BY category
  `).all();

  const counts: Record<string, number> = {
    workflow: 0,
    gsd: 0,
    memory: 0,
    session: 0,
    utility: 0,
  };

  for (const row of rows) {
    counts[row.category] = row.cnt;
  }

  return counts as Record<CommandCategory, number>;
}
