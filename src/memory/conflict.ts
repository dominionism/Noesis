/**
 * Memory Conflict Detection
 *
 * Detects conflicts between a newly written memory and existing memories
 * using embedding-based cosine similarity combined with structural analysis.
 *
 * Pipeline:
 * 1. Retrieve all existing embeddings (excluding the new memory)
 * 2. Compute cosine similarity above CONFLICT_SIMILARITY_THRESHOLD (0.70)
 * 3. Check structural overlap: same type, overlapping tags, different outcome
 * 4. Attempt auto-resolution (supersession keywords or different projects)
 * 5. Persist unresolved conflicts and emit events
 *
 * Security:
 * - A03: Tags parsed from JSON with try-catch
 * - A04: Defense-in-depth against contradictory knowledge
 */

import type { DatabaseConnection } from '../core/database.js';
import type { Memory, MemoryConflict, ConflictInput, NoesisEvent } from '../types.js';
import type { KnowledgeEdgeInput } from '../types.js';
import { CONFLICT_SIMILARITY_THRESHOLD } from '../constants.js';

function cosineSimilarity(a: Float32Array | Buffer, b: Float32Array | Buffer): number {
  const va =
    a instanceof Float32Array ? a : new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  const vb =
    b instanceof Float32Array ? b : new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < va.length; i++) {
    dot += va[i] * vb[i];
    normA += va[i] * va[i];
    normB += vb[i] * vb[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function parseTags(tagsJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch { /* malformed JSON */ }
  return [];
}

function hasOverlappingTags(tagsA: string[], tagsB: string[]): boolean {
  if (tagsA.length === 0 || tagsB.length === 0) return false;
  const setA = new Set(tagsA);
  for (const tag of tagsB) {
    if (setA.has(tag)) return true;
  }
  return false;
}

function containsAutoResolveKeyword(content: string): boolean {
  const lower = content.toLowerCase();
  return lower.includes('supersedes') || lower.includes('replaces') || lower.includes('overrides');
}

interface ExistingEmbeddingRecord {
  id: string;
  type: string;
  tags: string;
  outcome: string | null;
  project_id: string | null;
  embedding: Buffer;
}

export async function detectConflicts(params: {
  db: DatabaseConnection;
  newMemory: Memory;
  embedding: Float32Array;
  getAllEmbeddings: (db: DatabaseConnection, excludeId: string) => Array<ExistingEmbeddingRecord>;
  createConflict: (db: DatabaseConnection, conflict: ConflictInput) => MemoryConflict;
  createEdge: (db: DatabaseConnection, edge: KnowledgeEdgeInput) => void;
  updateMemoryStatus: (db: DatabaseConnection, id: string, status: string) => void;
  emitEvent?: (event: NoesisEvent) => void;
  generateId: () => string;
}): Promise<{ conflicts: MemoryConflict[]; autoResolved: string[] }> {
  const {
    db, newMemory, embedding, getAllEmbeddings,
    createConflict, createEdge, updateMemoryStatus, emitEvent,
  } = params;

  const unresolvedConflicts: MemoryConflict[] = [];
  const autoResolved: string[] = [];

  const existingRecords = getAllEmbeddings(db, newMemory.id);
  if (existingRecords.length === 0) {
    return { conflicts: unresolvedConflicts, autoResolved };
  }

  const newTags = parseTags(newMemory.tags);

  for (const existing of existingRecords) {
    const similarity = cosineSimilarity(embedding, existing.embedding);
    if (similarity <= CONFLICT_SIMILARITY_THRESHOLD) continue;

    const sameType = existing.type === newMemory.type;
    const existingTags = parseTags(existing.tags);
    const overlapping = hasOverlappingTags(newTags, existingTags);
    const differentOutcome =
      existing.outcome !== null &&
      newMemory.outcome !== null &&
      existing.outcome !== newMemory.outcome;

    if (!sameType || !overlapping || !differentOutcome) continue;

    // Auto-resolve: supersession keywords
    if (containsAutoResolveKeyword(newMemory.content)) {
      createEdge(db, {
        source_id: newMemory.id,
        target_id: existing.id,
        relation: 'supersedes',
        metadata: JSON.stringify({
          auto_resolved: true,
          similarity_score: similarity,
          resolved_at: new Date().toISOString(),
        }),
      });
      updateMemoryStatus(db, existing.id, 'superseded');
      autoResolved.push(existing.id);
      continue;
    }

    // Auto-resolve: different projects
    if (
      existing.project_id !== null &&
      newMemory.project_id !== null &&
      existing.project_id !== newMemory.project_id
    ) continue;

    // Create unresolved conflict
    const conflict = createConflict(db, {
      memory_a_id: existing.id,
      memory_b_id: newMemory.id,
      conflict_type: 'structural',
      similarity_score: similarity,
    });
    unresolvedConflicts.push(conflict);

    if (emitEvent) {
      try {
        emitEvent({
          type: 'memory_conflict_detected',
          payload: {
            conflict_id: conflict.id,
            memory_a_id: existing.id,
            memory_b_id: newMemory.id,
            conflict_type: 'structural',
          },
        });
      } catch { /* non-fatal */ }
    }
  }

  return { conflicts: unresolvedConflicts, autoResolved };
}
