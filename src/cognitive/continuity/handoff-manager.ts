/**
 * Handoff Manager — Database-backed handoff creation and resumption.
 *
 * Handoffs are stored as checkpoint memories with structured JSON content
 * matching the Handoff type from types.ts. Memory refs are HMAC-signed
 * memory IDs that the receiving agent can use to recall relevant context.
 *
 * The distinction from workflow/handoff-protocol.ts:
 * - workflow layer: in-memory, transient packaging for immediate use
 * - cognitive layer: persistent, database-backed for cross-session resumption
 *
 * Follows standard patterns: explicit DatabaseConnection injection,
 * parameterized queries, HMAC signing.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { Handoff, HandoffInput } from '../../types.js';
import type { SignFn } from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface MemoryRow {
  id: string;
  type: string;
  title: string;
  content: string;
  project_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new handoff and persist it as a checkpoint memory.
 *
 * Returns the complete Handoff object with generated ID and timestamp.
 * The memory_refs are expected to be already-validated memory IDs.
 */
export function createHandoff(
  db: DatabaseConnection,
  input: HandoffInput,
  projectId: string | null,
  sign: SignFn,
): Handoff {
  const id = generateId();
  const now = new Date().toISOString();

  const handoff: Handoff = {
    id,
    source_agent: input.source_agent,
    target_agent: input.target_agent,
    reason: input.reason,
    priority: input.priority ?? 'normal',
    state_summary: input.state_summary,
    memory_refs: input.memory_refs ?? [],
    created_at: now,
  };

  const content = JSON.stringify(handoff);
  const signature = sign(content);
  const title = `Handoff: ${input.source_agent} → ${input.target_agent} (${input.reason})`;

  db.prepare<[
    string, string, string, string | null,
    string, string, string, string,
  ]>(`
    INSERT INTO memories (
      id, type, title, content, project_id,
      signature, created_at, updated_at, last_accessed_at
    ) VALUES (
      ?, 'checkpoint', ?, ?, ?,
      ?, ?, ?, ?
    )
  `).run(
    id, title, content, projectId,
    signature, now, now, now,
  );

  return handoff;
}

/**
 * Resume from a handoff by ID. Loads the handoff data and marks the
 * memory as accessed (incrementing access_count).
 *
 * Returns null if the handoff is not found.
 */
export function resumeFromHandoff(
  db: DatabaseConnection,
  handoffId: string,
): Handoff | null {
  const row = db.prepare<[string], MemoryRow>(
    "SELECT id, type, title, content, project_id, created_at FROM memories WHERE id = ? AND type = 'checkpoint'",
  ).get(handoffId);

  if (!row) return null;

  // Mark as accessed
  const now = new Date().toISOString();
  db.prepare<[string, string]>(
    'UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?',
  ).run(now, handoffId);

  try {
    const handoff: Handoff = JSON.parse(row.content);
    return handoff;
  } catch {
    return null;
  }
}

/**
 * List handoffs for a project, most recent first.
 *
 * Filters checkpoint memories whose content contains handoff structure
 * (has source_agent and target_agent fields).
 */
export function listHandoffs(
  db: DatabaseConnection,
  projectId: string,
  limit?: number,
): Handoff[] {
  const rows = db.prepare<[string], MemoryRow>(
    "SELECT id, type, title, content, project_id, created_at FROM memories WHERE type = 'checkpoint' AND project_id = ? ORDER BY created_at DESC",
  ).all(projectId);

  const handoffs: Handoff[] = [];

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.content);
      // Only include rows that look like handoffs
      if (parsed.source_agent && parsed.target_agent && parsed.reason) {
        handoffs.push(parsed);
      }
    } catch {
      // Skip non-JSON or malformed entries
    }
  }

  return limit ? handoffs.slice(0, limit) : handoffs;
}

/**
 * Get referenced memories from a handoff. Resolves the memory_refs
 * array to actual memory content.
 */
export function getHandoffMemories(
  db: DatabaseConnection,
  handoff: Handoff,
): Array<{ id: string; title: string; content: string }> {
  if (handoff.memory_refs.length === 0) return [];

  const results: Array<{ id: string; title: string; content: string }> = [];

  for (const memId of handoff.memory_refs) {
    const row = db.prepare<[string], { id: string; title: string; content: string }>(
      'SELECT id, title, content FROM memories WHERE id = ?',
    ).get(memId);

    if (row) {
      results.push(row);
    }
  }

  return results;
}

/**
 * Format a handoff as a resumption prompt for the receiving agent.
 * Produces a structured summary the agent can use to continue work.
 */
export function formatHandoffResumption(
  handoff: Handoff,
  referencedMemories: Array<{ id: string; title: string; content: string }>,
): string {
  const lines: string[] = [
    `## Handoff from ${handoff.source_agent}`,
    '',
    `**Reason:** ${handoff.reason}`,
    `**Priority:** ${handoff.priority}`,
    '',
    '### State Summary',
    handoff.state_summary,
  ];

  if (referencedMemories.length > 0) {
    lines.push('', '### Referenced Context');
    for (const mem of referencedMemories) {
      lines.push(`- **${mem.title}**: ${mem.content.slice(0, 200)}...`);
    }
  }

  return lines.join('\n');
}
