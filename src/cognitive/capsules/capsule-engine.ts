/**
 * Capsule Engine — Task-to-capsule matching with composite scoring.
 *
 * Three-factor matching:
 * 1. Keyword matching: task keywords against capsule trigger patterns (weight 0.5)
 * 2. Semantic matching: embedding cosine similarity (weight 0.3)
 * 3. Historical success: past success rate for this capsule (weight 0.2)
 *
 * Returns matches sorted by composite score, filtered by CAPSULE_MATCH_THRESHOLD.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { DeepCapsuleDefinition, SignFn } from '../types.js';
import { listCapsules, updateCapsule } from './capsule-store.js';
import { CAPSULE_MATCH_THRESHOLD } from '../../constants.js';

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

const CAPSULE_KEYWORD_WEIGHT = 0.5;
const CAPSULE_SEMANTIC_WEIGHT = 0.3;
const CAPSULE_HISTORY_WEIGHT = 0.2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CapsuleMatch {
  capsule: DeepCapsuleDefinition;
  score: number;
  matched_patterns: string[];
}

/**
 * Match a task to the best capsule(s).
 *
 * Combines keyword trigger matching, semantic similarity, and
 * historical performance into a composite score.
 */
export function matchCapsule(
  db: DatabaseConnection,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null,
  options?: {
    excludeCapsules?: string[];
    maxResults?: number;
  },
): CapsuleMatch[] {
  const capsules = listCapsules(db, { enabled: true });
  const lowerKeywords = taskKeywords.map(k => k.toLowerCase());
  const lowerDesc = taskDescription.toLowerCase();
  const maxResults = options?.maxResults ?? 1;
  const excludeSet = new Set(options?.excludeCapsules ?? []);

  const scored: CapsuleMatch[] = [];

  for (const capsule of capsules) {
    if (excludeSet.has(capsule.id) || excludeSet.has(capsule.name)) continue;

    // Factor 1: Keyword/trigger pattern matching
    const { keywordScore, matchedPatterns } = computeKeywordScore(
      capsule, lowerKeywords, lowerDesc,
    );

    // Factor 2: Semantic similarity
    const semanticScore = embedding && capsule.embedding
      ? cosineSimilarity(embedding, capsule.embedding)
      : 0;

    // Factor 3: Historical success
    const historyScore = capsule.match_count >= 3
      ? capsule.success_rate
      : 0.5; // Prior for insufficient data

    const compositeScore =
      keywordScore * CAPSULE_KEYWORD_WEIGHT +
      semanticScore * CAPSULE_SEMANTIC_WEIGHT +
      historyScore * CAPSULE_HISTORY_WEIGHT;

    if (compositeScore >= CAPSULE_MATCH_THRESHOLD) {
      scored.push({
        capsule,
        score: compositeScore,
        matched_patterns: matchedPatterns,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

/**
 * Record that a capsule was matched (increments match_count).
 * Called when a capsule is selected for assembly.
 */
export function recordCapsuleMatch(
  db: DatabaseConnection,
  capsuleId: string,
  sign: SignFn,
): void {
  const capsules = listCapsules(db);
  const capsule = capsules.find(c => c.id === capsuleId);
  if (!capsule) return;

  updateCapsule(db, capsuleId, {
    match_count: capsule.match_count + 1,
  }, sign);
}

/**
 * Record a capsule outcome. Updates success_rate using Bayesian smoothing.
 */
export function recordCapsuleOutcome(
  db: DatabaseConnection,
  capsuleId: string,
  outcome: 'success' | 'failure' | 'partial',
  sign: SignFn,
): void {
  const capsules = listCapsules(db);
  const capsule = capsules.find(c => c.id === capsuleId);
  if (!capsule) return;

  const successIncrement = outcome === 'success' ? 1 : (outcome === 'partial' ? 0.5 : 0);
  const rawSuccesses = capsule.success_rate * capsule.match_count + successIncrement;
  const newCount = capsule.match_count + 1;
  // Bayesian with Laplace smoothing
  const newRate = (rawSuccesses + 1) / (newCount + 2);

  updateCapsule(db, capsuleId, {
    match_count: newCount,
    success_rate: newRate,
  }, sign);
}

/**
 * Format capsule metadata for context injection.
 */
export function formatCapsuleForContext(
  capsule: DeepCapsuleDefinition,
  tokenBudget: number,
): string {
  const lines: string[] = [
    `## Capsule: ${capsule.display_name} (${capsule.name})`,
    `**Description:** ${capsule.description}`,
    `**Success Rate:** ${(capsule.success_rate * 100).toFixed(0)}% (${capsule.match_count} uses)`,
  ];

  if (capsule.trigger_patterns.length > 0) {
    lines.push('**Triggers:**');
    for (const pattern of capsule.trigger_patterns) {
      lines.push(`- ${pattern}`);
    }
  }

  const result = lines.join('\n');
  const estimatedTokens = Math.ceil(result.length / 4);

  if (estimatedTokens > tokenBudget) {
    const charBudget = tokenBudget * 4;
    return result.slice(0, charBudget) + '\n[truncated]';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeKeywordScore(
  capsule: DeepCapsuleDefinition,
  lowerKeywords: string[],
  lowerDesc: string,
): { keywordScore: number; matchedPatterns: string[] } {
  const matchedPatterns: string[] = [];
  let hits = 0;

  for (const pattern of capsule.trigger_patterns) {
    const patternLower = pattern.toLowerCase();

    // Direct keyword match
    for (const kw of lowerKeywords) {
      if (patternLower.includes(kw)) {
        matchedPatterns.push(pattern);
        hits++;
        break;
      }
    }

    // Description phrase match (if not already matched)
    if (!matchedPatterns.includes(pattern)) {
      const words = patternLower.split(/\s+/).filter(w => w.length > 3);
      if (words.length > 0) {
        const descHits = words.filter(w => lowerDesc.includes(w)).length;
        if (descHits >= Math.ceil(words.length * 0.5)) {
          matchedPatterns.push(pattern);
          hits++;
        }
      }
    }
  }

  const keywordScore = capsule.trigger_patterns.length > 0
    ? hits / capsule.trigger_patterns.length
    : 0;

  return { keywordScore: Math.min(keywordScore, 1.0), matchedPatterns };
}

function cosineSimilarity(a: Buffer, b: Buffer): number {
  if (a.length !== b.length || a.length === 0) return 0;

  const fa = new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  const fb = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < fa.length; i++) {
    dot += fa[i] * fb[i];
    normA += fa[i] * fa[i];
    normB += fb[i] * fb[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
