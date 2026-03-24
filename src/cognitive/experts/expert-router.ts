/**
 * Expert Router — Task-to-expert matching with memory-backed evidence.
 *
 * Three-factor routing:
 * 1. Trigger matching: task keywords against expert trigger conditions (weight 0.4)
 * 2. Semantic matching: embedding similarity against expert embeddings (weight 0.3)
 * 3. Performance matching: past success rate for similar tasks (weight 0.3)
 *
 * Returns matches sorted by composite score, filtered by minimum threshold.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  ExpertDefinition,
  ExpertCategory,
  ExpertMatch,
} from '../types.js';
import { listExperts } from './expert-store.js';
import {
  EXPERT_ROUTING_MIN_SCORE,
  EXPERT_ROUTING_TRIGGER_WEIGHT,
  EXPERT_ROUTING_SEMANTIC_WEIGHT,
  EXPERT_ROUTING_PERFORMANCE_WEIGHT,
} from '../../constants.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Route a task to the best-matching expert(s).
 *
 * Three-factor composite scoring ensures routing considers both
 * static definitions (triggers, embeddings) and dynamic evidence
 * (past performance).
 */
export function routeToExpert(
  db: DatabaseConnection,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null,
  options?: {
    preferCategory?: ExpertCategory;
    excludeExperts?: string[];
    maxResults?: number;
  },
): ExpertMatch[] {
  const experts = listExperts(db, { enabled: true });
  const lowerKeywords = taskKeywords.map(k => k.toLowerCase());
  const lowerDesc = taskDescription.toLowerCase();
  const maxResults = options?.maxResults ?? 3;
  const excludeSet = new Set(options?.excludeExperts ?? []);

  const scored: ExpertMatch[] = [];

  for (const expert of experts) {
    if (excludeSet.has(expert.id) || excludeSet.has(expert.name)) continue;

    // Factor 1: Trigger matching
    const { triggerScore, matchedTriggers } = computeTriggerScore(expert, lowerKeywords, lowerDesc);

    // Factor 2: Semantic matching
    const semanticScore = embedding && expert.embedding
      ? cosineSimilarity(embedding, expert.embedding)
      : 0;

    // Factor 3: Performance
    const performanceScore = expert.task_count >= 3
      ? expert.success_rate
      : 0.5; // Prior for insufficient data

    // Category preference boost
    const categoryBoost = options?.preferCategory === expert.category ? 0.1 : 0;

    const compositeScore =
      triggerScore * EXPERT_ROUTING_TRIGGER_WEIGHT +
      semanticScore * EXPERT_ROUTING_SEMANTIC_WEIGHT +
      performanceScore * EXPERT_ROUTING_PERFORMANCE_WEIGHT +
      categoryBoost;

    if (compositeScore >= EXPERT_ROUTING_MIN_SCORE) {
      scored.push({
        expert,
        score: compositeScore,
        matched_triggers: matchedTriggers,
        memory_evidence: [],
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

/**
 * Quick check: is this task substantial enough to warrant expert routing?
 */
export function shouldRouteToExpert(taskDescription: string): boolean {
  const desc = taskDescription.toLowerCase();

  // Length heuristic: short tasks rarely need experts
  if (desc.length < 50) return false;

  // Complexity indicators
  const complexitySignals = [
    /\b(refactor|architect|redesign|migrate|integrate)\b/,
    /\b(security|vulnerability|auth|permission)\b/,
    /\b(performance|optimization|latency|throughput)\b/,
    /\b(design|ux|ui|layout|component)\b/,
    /\b(test|quality|review|critique|evaluate)\b/,
    /\b(debug|investigate|diagnose|root.?cause)\b/,
    /\b(api|endpoint|contract|schema)\b/,
    /\b(deploy|infrastructure|ci.?cd|pipeline)\b/,
    /\d+\s*files?/,
    /multiple\s*(subsystem|module|service)/,
  ];

  let hits = 0;
  for (const pattern of complexitySignals) {
    if (pattern.test(desc)) hits++;
  }

  return hits >= 1;
}

/**
 * Render expert definition as structured markdown for context injection.
 */
export function formatExpertForContext(expert: ExpertDefinition, tokenBudget: number): string {
  const lines: string[] = [
    `## Expert: ${expert.display_name} (${expert.name})`,
    `**Role:** ${expert.role}`,
    `**Domain:** ${expert.domain}`,
    `**Success Rate:** ${(expert.success_rate * 100).toFixed(0)}% (${expert.task_count} tasks)`,
  ];

  if (expert.scope.can.length > 0) {
    lines.push('**Can:**');
    for (const item of expert.scope.can) {
      lines.push(`- ${item}`);
    }
  }

  if (expert.scope.cannot.length > 0) {
    lines.push('**Cannot:**');
    for (const item of expert.scope.cannot) {
      lines.push(`- ${item}`);
    }
  }

  if (expert.deliverables.length > 0) {
    lines.push('**Deliverables:**');
    for (const item of expert.deliverables) {
      lines.push(`- ${item}`);
    }
  }

  if (expert.anti_patterns.length > 0) {
    lines.push('**Anti-patterns:**');
    for (const item of expert.anti_patterns) {
      lines.push(`- ${item}`);
    }
  }

  const result = lines.join('\n');
  const estimatedTokens = Math.ceil(result.length / 4);

  if (estimatedTokens > tokenBudget) {
    // Truncate to fit budget
    const charBudget = tokenBudget * 4;
    return result.slice(0, charBudget) + '\n[truncated]';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeTriggerScore(
  expert: ExpertDefinition,
  lowerKeywords: string[],
  lowerDesc: string,
): { triggerScore: number; matchedTriggers: string[] } {
  const matchedTriggers: string[] = [];
  let hits = 0;

  for (const trigger of expert.trigger_conditions) {
    const triggerLower = trigger.toLowerCase();

    // Check if any task keyword appears in the trigger
    for (const kw of lowerKeywords) {
      if (triggerLower.includes(kw)) {
        matchedTriggers.push(trigger);
        hits++;
        break;
      }
    }

    // Check if the trigger phrase appears in the task description
    if (!matchedTriggers.includes(trigger)) {
      const words = triggerLower.split(/\s+/).filter(w => w.length > 3);
      const descHits = words.filter(w => lowerDesc.includes(w)).length;
      if (descHits >= Math.ceil(words.length * 0.5)) {
        matchedTriggers.push(trigger);
        hits++;
      }
    }
  }

  const triggerScore = expert.trigger_conditions.length > 0
    ? hits / expert.trigger_conditions.length
    : 0;

  return { triggerScore: Math.min(triggerScore, 1.0), matchedTriggers };
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
