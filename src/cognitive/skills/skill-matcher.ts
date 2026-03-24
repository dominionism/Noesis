/**
 * Skill Matcher — Semantic skill matching and chaining.
 *
 * Three-factor matching:
 * 1. Keyword matching: task keywords against skill trigger conditions (weight 0.4)
 * 2. Semantic matching: embedding cosine similarity (weight 0.35)
 * 3. Success rate: historical invocation success (weight 0.25)
 *
 * Skill chaining resolves chain_with references up to SKILL_MAX_CHAIN_DEPTH,
 * preventing cycles.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { ExecutableSkill, SkillCategory, SkillMatch } from '../types.js';
import { listSkills, getSkill, getSkillByName } from './skill-store.js';
import { SKILL_MATCH_THRESHOLD, SKILL_MAX_CHAIN_DEPTH } from '../../constants.js';

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

const SKILL_KEYWORD_WEIGHT = 0.4;
const SKILL_SEMANTIC_WEIGHT = 0.35;
const SKILL_SUCCESS_WEIGHT = 0.25;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Match skills to a task description using composite scoring.
 */
export function matchSkills(
  db: DatabaseConnection,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null,
  options?: {
    category?: SkillCategory;
    maxResults?: number;
    excludeSkills?: string[];
  },
): SkillMatch[] {
  const skills = listSkills(db, {
    enabled: true,
    category: options?.category,
  });
  const lowerKeywords = taskKeywords.map(k => k.toLowerCase());
  const lowerDesc = taskDescription.toLowerCase();
  const maxResults = options?.maxResults ?? 5;
  const excludeSet = new Set(options?.excludeSkills ?? []);

  const scored: SkillMatch[] = [];

  for (const skill of skills) {
    if (excludeSet.has(skill.id) || excludeSet.has(skill.name)) continue;

    // Factor 1: Keyword matching
    const { keywordScore, matchedTriggers } = computeKeywordScore(
      skill, lowerKeywords, lowerDesc,
    );

    // Factor 2: Semantic similarity
    const semanticScore = embedding && skill.embedding
      ? cosineSimilarity(embedding, skill.embedding)
      : 0;

    // Factor 3: Success rate
    const successScore = skill.invocation_count >= 3
      ? skill.success_rate
      : 0.5; // Prior for insufficient data

    const compositeScore =
      keywordScore * SKILL_KEYWORD_WEIGHT +
      semanticScore * SKILL_SEMANTIC_WEIGHT +
      successScore * SKILL_SUCCESS_WEIGHT;

    if (compositeScore >= SKILL_MATCH_THRESHOLD) {
      scored.push({
        skill,
        score: compositeScore,
        matched_triggers: matchedTriggers,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

/**
 * Resolve a skill chain starting from a primary skill.
 *
 * Follows chain_with references recursively up to SKILL_MAX_CHAIN_DEPTH.
 * Prevents cycles by tracking visited skill names.
 */
export function resolveSkillChain(
  db: DatabaseConnection,
  primarySkillId: string,
): ExecutableSkill[] {
  const primary = getSkill(db, primarySkillId);
  if (!primary) return [];

  const chain: ExecutableSkill[] = [primary];
  const visited = new Set<string>([primary.name]);

  resolveChainRecursive(db, primary, chain, visited, 1);

  return chain;
}

/**
 * Format a skill as structured markdown for context injection.
 */
export function formatSkillForContext(
  skill: ExecutableSkill,
  tokenBudget: number,
): string {
  const lines: string[] = [
    `## Skill: ${skill.name} (v${skill.version})`,
    `**Description:** ${skill.description}`,
    `**Category:** ${skill.category}`,
    `**Success Rate:** ${(skill.success_rate * 100).toFixed(0)}% (${skill.invocation_count} invocations)`,
  ];

  if (skill.trigger_conditions.length > 0) {
    lines.push('**Triggers:**');
    for (const trigger of skill.trigger_conditions) {
      lines.push(`- ${trigger}`);
    }
  }

  if (skill.anti_patterns.length > 0) {
    lines.push('**Anti-patterns:**');
    for (const ap of skill.anti_patterns) {
      lines.push(`- ${ap}`);
    }
  }

  if (skill.rules.length > 0) {
    lines.push('**Rules:**');
    for (const rule of skill.rules) {
      lines.push(`- ${rule}`);
    }
  }

  if (skill.chain_with.length > 0) {
    lines.push(`**Chains with:** ${skill.chain_with.join(', ')}`);
  }

  if (skill.content) {
    lines.push('### Content');
    lines.push(skill.content);
  }

  const result = lines.join('\n');
  const estimatedTokens = Math.ceil(result.length / 4);

  if (estimatedTokens > tokenBudget) {
    const charBudget = tokenBudget * 4;
    return result.slice(0, charBudget) + '\n[truncated]';
  }

  return result;
}

/**
 * Format multiple skills for context, distributing token budget evenly.
 */
export function formatSkillsForContext(
  skills: ExecutableSkill[],
  totalTokenBudget: number,
): string {
  if (skills.length === 0) return '';

  const perSkillBudget = Math.floor(totalTokenBudget / skills.length);
  const sections = skills.map(s => formatSkillForContext(s, perSkillBudget));
  return sections.join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveChainRecursive(
  db: DatabaseConnection,
  skill: ExecutableSkill,
  chain: ExecutableSkill[],
  visited: Set<string>,
  depth: number,
): void {
  if (depth >= SKILL_MAX_CHAIN_DEPTH) return;

  for (const chainName of skill.chain_with) {
    if (visited.has(chainName)) continue;

    const linked = getSkillByName(db, chainName);
    if (!linked || !linked.enabled) continue;

    visited.add(chainName);
    chain.push(linked);
    resolveChainRecursive(db, linked, chain, visited, depth + 1);
  }
}

function computeKeywordScore(
  skill: ExecutableSkill,
  lowerKeywords: string[],
  lowerDesc: string,
): { keywordScore: number; matchedTriggers: string[] } {
  const matchedTriggers: string[] = [];
  let hits = 0;

  for (const trigger of skill.trigger_conditions) {
    const triggerLower = trigger.toLowerCase();

    // Direct keyword match
    for (const kw of lowerKeywords) {
      if (triggerLower.includes(kw)) {
        matchedTriggers.push(trigger);
        hits++;
        break;
      }
    }

    // Description phrase match
    if (!matchedTriggers.includes(trigger)) {
      const words = triggerLower.split(/\s+/).filter(w => w.length > 3);
      if (words.length > 0) {
        const descHits = words.filter(w => lowerDesc.includes(w)).length;
        if (descHits >= Math.ceil(words.length * 0.5)) {
          matchedTriggers.push(trigger);
          hits++;
        }
      }
    }
  }

  const keywordScore = skill.trigger_conditions.length > 0
    ? hits / skill.trigger_conditions.length
    : 0;

  return { keywordScore: Math.min(keywordScore, 1.0), matchedTriggers };
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
