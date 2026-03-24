/**
 * Noesis Hybrid Retrieval Engine
 *
 * 8-step retrieval algorithm that fuses BM25 full-text search with vector
 * similarity, applies Reciprocal Rank Fusion (RRF), traverses the typed
 * knowledge graph with edge-aware boosting, re-ranks with composite
 * scoring, and enforces integrity and secret-scanning gates.
 *
 * Steps:
 *   1. Pre-filter    — Build SQL WHERE clause from RecallParams
 *   2. FTS5 BM25     — Full-text search on the pre-filtered set
 *   3. Vector sim    — Cosine similarity against query embedding
 *   4. Fusion        — Cosine-primary fusion with BM25 boost + relevance floor
 *   5. Graph walk    — Multi-hop typed traversal with edge-aware boosting (ENHANCED)
 *   6. Re-rank       — Composite scoring (recency, access, outcome, scope)
 *   7. HMAC verify   — Exclude tampered memories (OWASP A08)
 *   8. Secret scan   — Redact secrets from returned content (OWASP A02)
 *
 * Enhancement over UAWL in Step 5:
 *   UAWL used simple 1-hop adjacency. Noesis uses typed edge relationships
 *   and weights for multi-hop traversal with relation-specific boosting,
 *   contradiction detection, and supersession awareness.
 *
 * Security:
 *   - All SQL uses parameterized queries (OWASP A03)
 *   - HMAC verification ensures data integrity (OWASP A08)
 *   - Secret scanning prevents credential leakage (OWASP A02)
 *   - No user input is interpolated into SQL strings
 */

import type { DatabaseConnection } from '../core/database.js';
import type {
  EmbeddingProvider,
  Memory,
  MemoryConflict,
  MemoryOutcome,
  MemoryScope,
  RecallParams,
  RecallResult,
  ScoredMemory,
  SecretMatch,
} from '../types.js';
import {
  RRF_K,
  EPSILON_GREEDY,
  VECTOR_SIMILARITY_FLOOR,
  BM25_BOOST_WEIGHT,
  BM25_ONLY_BASELINE,
} from '../constants.js';
import { buildFilterSQL } from './filters.js';
import { graphRerank } from './graph-rerank.js';
import { computeCompositeScore } from './scoring.js';

/**
 * Compute cosine similarity between two vectors stored as Float32Array or
 * raw Buffer. Returns 0 when either vector has zero magnitude.
 */
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

// Row types for prepared statements

interface FtsRow {
  rowid: number;
  rank: number;
}

interface RowidMapRow {
  rowid: number;
  id: string;
}

interface VecRow {
  memory_id: string;
  embedding: Buffer;
}

interface MemoryRow {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string;
  project_id: string | null;
  scope: string;
  sensitivity: string;
  confidence: number;
  outcome: string | null;
  source: string;
  embedding: Buffer | null;
  embedding_model: string | null;
  signature: string;
  status: string;
  access_count: number;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  expires_at: string | null;
  superseded_by: string | null;
  session_id: string | null;
}

interface ConflictRow {
  id: string;
  memory_a_id: string;
  memory_b_id: string;
  conflict_type: string;
  similarity_score: number;
  resolution: string | null;
  resolution_notes: string | null;
  created_at: string;
}

/**
 * Execute the 8-step hybrid retrieval algorithm.
 */
export async function hybridRetrieve(params: {
  db: DatabaseConnection;
  embeddingProvider: EmbeddingProvider;
  recallParams: RecallParams;
  verifySignature: (memory: Memory) => { valid: boolean; tampered: boolean };
  scanSecrets: (text: string) => { clean: string; redacted: boolean; matches: SecretMatch[] };
  updateAccessMetadata?: boolean;
}): Promise<RecallResult> {
  const {
    db,
    embeddingProvider,
    recallParams,
    verifySignature,
    scanSecrets,
    updateAccessMetadata = true,
  } = params;
  const startTime = performance.now();

  const limit = recallParams.limit ?? 10;

  // =========================================================================
  // Step 1 — Pre-filter: build SQL WHERE clause
  // =========================================================================

  const { where, values: filterValues } = buildFilterSQL(recallParams);

  // =========================================================================
  // Step 2 — FTS5 BM25 search
  // =========================================================================

  const preFilterSQL = `SELECT rowid, id FROM memories m ${where}`;
  const preFilterStmt = db.prepare<unknown[], RowidMapRow>(preFilterSQL);
  const preFilteredRows = preFilterStmt.all(...filterValues);

  const rowidToId = new Map<number, string>();
  const idSet = new Set<string>();
  for (const row of preFilteredRows) {
    rowidToId.set(row.rowid, row.id);
    idSet.add(row.id);
  }

  const totalCandidates = preFilteredRows.length;

  const bm25Ranked: Array<{ id: string; rank: number }> = [];

  if (recallParams.query.trim().length > 0 && preFilteredRows.length > 0) {
    const ftsQuery = sanitizeFtsQuery(recallParams.query);

    if (ftsQuery.length > 0) {
      const ftsStmt = db.prepare<unknown[], FtsRow>(
        'SELECT rowid, rank FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT 50',
      );
      const ftsRows = ftsStmt.all(ftsQuery);

      for (const row of ftsRows) {
        const memoryId = rowidToId.get(row.rowid);
        if (memoryId !== undefined) {
          bm25Ranked.push({ id: memoryId, rank: row.rank });
        }
      }
    }
  }

  const bm25RankMap = new Map<string, number>();
  for (let i = 0; i < bm25Ranked.length; i++) {
    bm25RankMap.set(bm25Ranked[i].id, i + 1);
  }

  // =========================================================================
  // Step 3 — Vector similarity search
  // =========================================================================

  const queryEmbedding = await embeddingProvider.embed(recallParams.query);

  const vectorRanked: Array<{ id: string; similarity: number }> = [];

  if (preFilteredRows.length > 0) {
    const vecPlaceholders = preFilteredRows.map(() => '?').join(', ');
    const vecSQL = `SELECT memory_id, embedding FROM memories_vec WHERE memory_id IN (${vecPlaceholders})`;
    const vecStmt = db.prepare<unknown[], VecRow>(vecSQL);
    const vecRows = vecStmt.all(...preFilteredRows.map((r) => r.id));

    for (const row of vecRows) {
      if (row.embedding !== null) {
        const similarity = cosineSimilarity(queryEmbedding, row.embedding);
        vectorRanked.push({ id: row.memory_id, similarity });
      }
    }

    vectorRanked.sort((a, b) => b.similarity - a.similarity);
  }

  const vectorRankMap = new Map<string, number>();
  for (let i = 0; i < vectorRanked.length; i++) {
    vectorRankMap.set(vectorRanked[i].id, i + 1);
  }

  // =========================================================================
  // Step 4 — Cosine-primary fusion with BM25 boost
  // =========================================================================
  //
  // Instead of pure RRF (which compresses score ranges and loses magnitude),
  // use the raw cosine similarity as the primary score. BM25 keyword matches
  // provide a multiplicative boost. Memories below the vector similarity
  // floor are excluded unless they match on BM25 keywords.

  const cosineMap = new Map<string, number>();
  for (const entry of vectorRanked) {
    cosineMap.set(entry.id, entry.similarity);
  }

  const allRankedIds = new Set<string>();
  for (const id of bm25RankMap.keys()) allRankedIds.add(id);
  for (const id of cosineMap.keys()) allRankedIds.add(id);

  const fusedScores = new Map<string, number>();
  for (const id of allRankedIds) {
    const cosine = cosineMap.get(id) ?? 0;
    const bm25Rank = bm25RankMap.get(id);
    const hasBm25 = bm25Rank !== undefined;

    // Apply relevance floor: exclude vector-only matches below threshold
    if (!hasBm25 && cosine < VECTOR_SIMILARITY_FLOOR) {
      continue;
    }

    let score: number;

    if (cosine >= VECTOR_SIMILARITY_FLOOR) {
      // Primary case: cosine similarity is the base score
      score = cosine;
      if (hasBm25) {
        // BM25 boost: rank 1 gets full boost, diminishes with rank
        score *= (1.0 + BM25_BOOST_WEIGHT / bm25Rank!);
      }
    } else {
      // BM25-only: keyword match but no meaningful vector similarity
      score = BM25_ONLY_BASELINE / bm25Rank!;
    }

    fusedScores.set(id, score);
  }

  // Backward-compatible alias so graph walk and downstream code work unchanged
  const rrfScores = fusedScores;

  const fusedSorted = Array.from(fusedScores.entries()).sort((a, b) => b[1] - a[1]);
  const rrfSorted = fusedSorted; // alias for graph walk code
  const topKForGraph = fusedSorted.slice(0, 10).map(([id]) => id);

  // =========================================================================
  // Step 5 — Graph-aware re-ranking (ENHANCED over UAWL)
  // =========================================================================
  //
  // UAWL: Simple 1-hop traversal, all edges treated equally.
  // Noesis: Multi-hop typed traversal with relation-specific boosting,
  // contradiction detection, and supersession awareness.

  const graphResult = graphRerank(db, topKForGraph);

  // Add graph-discovered memories to candidates with boosted RRF scores
  const newCandidateIds: string[] = [];

  for (const [discoveredId, entry] of graphResult.boosted) {
    if (!allRankedIds.has(discoveredId)) {
      // Verify this memory passes pre-filter
      const checkSQL = `SELECT id FROM memories m ${where} AND m.id = ?`;
      const checkStmt = db.prepare<unknown[], { id: string }>(checkSQL);
      const exists = checkStmt.get(...filterValues, discoveredId);

      if (exists) {
        newCandidateIds.push(discoveredId);

        // Assign boosted baseline score (half the lowest fused score)
        const minFused =
          fusedSorted.length > 0 ? fusedSorted[fusedSorted.length - 1][1] * 0.5 : 0.05;
        rrfScores.set(discoveredId, minFused * entry.boost);
      }
    } else {
      // Already in candidates — apply graph boost to existing score
      const existing = rrfScores.get(discoveredId);
      if (existing !== undefined) {
        rrfScores.set(discoveredId, existing * entry.boost);
      }
    }
  }

  // Handle supersessions: boost the newer memory, demote the older
  for (const sup of graphResult.supersessions) {
    const newerScore = rrfScores.get(sup.newerId);
    if (newerScore !== undefined) {
      rrfScores.set(sup.newerId, newerScore * 1.5);
    }
    const olderScore = rrfScores.get(sup.olderId);
    if (olderScore !== undefined) {
      rrfScores.set(sup.olderId, olderScore * 0.5);
    }
  }

  // Combine all candidate IDs (only those that passed the relevance floor)
  const allCandidateIds = [...Array.from(fusedScores.keys()), ...newCandidateIds];

  if (allCandidateIds.length === 0) {
    return {
      memories: [],
      conflicts: [],
      total_candidates: totalCandidates,
      retrieval_time_ms: performance.now() - startTime,
    };
  }

  // =========================================================================
  // Step 6 — Composite re-ranking
  // =========================================================================

  const candidatePlaceholders = allCandidateIds.map(() => '?').join(', ');
  const memorySQL = `SELECT * FROM memories WHERE id IN (${candidatePlaceholders})`;
  const memoryStmt = db.prepare<unknown[], MemoryRow>(memorySQL);
  const memoryRows = memoryStmt.all(...allCandidateIds);

  const memoryMap = new Map<string, MemoryRow>();
  for (const row of memoryRows) {
    memoryMap.set(row.id, row);
  }

  const scoredCandidates: ScoredMemory[] = [];

  for (const id of allCandidateIds) {
    const mem = memoryMap.get(id);
    if (mem === undefined) continue;

    const semanticScore = rrfScores.get(id) ?? 0;

    const composite = computeCompositeScore({
      semanticScore,
      lastAccessedAt: mem.last_accessed_at,
      accessCount: mem.access_count,
      outcome: mem.outcome as MemoryOutcome | null,
      memoryProjectId: mem.project_id,
      memoryScope: mem.scope as MemoryScope,
      queryProjectId: recallParams.project_id,
    });

    const scored: ScoredMemory = {
      ...(mem as unknown as Memory),
      semantic_score: semanticScore,
      bm25_rank: bm25RankMap.get(id) ?? 0,
      vector_rank: vectorRankMap.get(id) ?? 0,
      recency_modifier: composite.recencyModifier,
      access_boost: composite.accessBoost,
      success_weight: composite.successWeight,
      scope_boost: composite.scopeBoost,
      final_score: composite.finalScore,
    };

    scoredCandidates.push(scored);
  }

  scoredCandidates.sort((a, b) => b.final_score - a.final_score);
  let results = scoredCandidates.slice(0, limit);

  // =========================================================================
  // Epsilon-greedy exploration
  // =========================================================================

  if (results.length > 0 && Math.random() < EPSILON_GREEDY) {
    const resultIds = new Set(results.map((r) => r.id));
    const excludePlaceholders = Array.from(resultIds)
      .map(() => '?')
      .join(', ');

    let explorationSQL: string;
    const explorationValues: unknown[] = [];

    if (recallParams.project_id !== undefined) {
      explorationSQL = `
        SELECT * FROM memories
        WHERE status = 'active'
          AND access_count < 3
          AND (project_id = ? OR project_id IS NULL)
          AND id NOT IN (${excludePlaceholders})
        ORDER BY RANDOM()
        LIMIT 1
      `;
      explorationValues.push(recallParams.project_id, ...Array.from(resultIds));
    } else {
      explorationSQL = `
        SELECT * FROM memories
        WHERE status = 'active'
          AND access_count < 3
          AND id NOT IN (${excludePlaceholders})
        ORDER BY RANDOM()
        LIMIT 1
      `;
      explorationValues.push(...Array.from(resultIds));
    }

    const explorationStmt = db.prepare<unknown[], MemoryRow>(explorationSQL);
    const explorationRow = explorationStmt.get(...explorationValues);

    if (explorationRow !== undefined) {
      const explorationScored: ScoredMemory = {
        ...(explorationRow as unknown as Memory),
        semantic_score: 0,
        bm25_rank: 0,
        vector_rank: 0,
        recency_modifier: 1.0,
        access_boost: 1.0,
        success_weight: 1.0,
        scope_boost: 1.0,
        final_score: 0,
      };

      results[results.length - 1] = explorationScored;
    }
  }

  // =========================================================================
  // Step 7 — HMAC verification
  // =========================================================================

  const verified: ScoredMemory[] = [];
  for (const mem of results) {
    const check = verifySignature(mem);
    if (check.tampered) {
      continue;
    }
    verified.push(mem);
  }
  results = verified;

  // =========================================================================
  // Step 8 — Secret scan
  // =========================================================================

  for (let i = 0; i < results.length; i++) {
    const scanResult = scanSecrets(results[i].content);
    if (scanResult.redacted) {
      results[i] = {
        ...results[i],
        content: scanResult.clean,
      };
    }
  }

  // =========================================================================
  // Conflict detection at retrieval time
  // =========================================================================

  const conflicts: MemoryConflict[] = [];

  if (results.length > 0) {
    const resultIds = results.map((r) => r.id);
    const conflictPlaceholders = resultIds.map(() => '?').join(', ');

    const conflictSQL = `
      SELECT * FROM memory_conflicts
      WHERE resolution IS NULL
        AND (memory_a_id IN (${conflictPlaceholders}) OR memory_b_id IN (${conflictPlaceholders}))
    `;
    const conflictStmt = db.prepare<unknown[], ConflictRow>(conflictSQL);
    const conflictRows = conflictStmt.all(...resultIds, ...resultIds);

    for (const row of conflictRows) {
      conflicts.push({
        id: row.id,
        memory_a_id: row.memory_a_id,
        memory_b_id: row.memory_b_id,
        conflict_type: row.conflict_type,
        similarity_score: row.similarity_score,
        resolution: row.resolution,
        resolution_notes: row.resolution_notes,
        created_at: row.created_at,
      });
    }
  }

  // Also surface graph-detected contradictions as conflicts
  for (const contra of graphResult.contradictions) {
    const existingConflict = conflicts.find(
      (c) =>
        (c.memory_a_id === contra.memoryId && c.memory_b_id === contra.contradictsId) ||
        (c.memory_a_id === contra.contradictsId && c.memory_b_id === contra.memoryId),
    );
    if (!existingConflict) {
      conflicts.push({
        id: `graph-${contra.memoryId}-${contra.contradictsId}`,
        memory_a_id: contra.contradictsId,
        memory_b_id: contra.memoryId,
        conflict_type: 'graph_contradiction',
        similarity_score: contra.weight,
        resolution: null,
        resolution_notes: null,
        created_at: new Date().toISOString(),
      });
    }
  }

  // =========================================================================
  // Update access metadata
  // =========================================================================

  if (updateAccessMetadata && results.length > 0) {
    const now = new Date().toISOString();
    const updateStmt = db.prepare<[string, string], void>(
      'UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?',
    );
    const updateAll = db.transaction(() => {
      for (const mem of results) {
        updateStmt.run(now, mem.id);
      }
    });
    updateAll();
  }

  return {
    memories: results,
    conflicts,
    total_candidates: totalCandidates,
    retrieval_time_ms: performance.now() - startTime,
  };
}

/**
 * Sanitize user input for use in an FTS5 MATCH expression.
 *
 * Strips FTS5 operators and special characters, splits into tokens,
 * wraps each in double quotes for literal matching. Prevents query
 * injection into the FTS5 engine.
 */
function sanitizeFtsQuery(query: string): string {
  const cleaned = query.replace(/[*^"():{}\-\\]/g, ' ');

  const tokens = cleaned
    .split(/\s+/)
    .filter((t) => t.length > 0);

  // Use prefix matching for tokens >= 3 chars to catch partial word
  // matches (e.g., "auth" matches "authentication"). The FTS5 prefix
  // operator (*) is appended after sanitization — it's safe because
  // we stripped all special chars above.
  const ftsTokens = tokens.map((t) => {
    // Sanitized token — safe to use in FTS5 expression
    const safe = t.replace(/[^a-zA-Z0-9]/g, '');
    if (safe.length === 0) return '';
    return safe.length >= 3 ? `${safe}*` : `"${safe}"`;
  }).filter((t) => t.length > 0);

  return ftsTokens.join(' ');
}
