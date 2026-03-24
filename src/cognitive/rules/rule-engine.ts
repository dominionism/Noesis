/**
 * Rule Engine — Matching, formatting, and lifecycle management.
 *
 * Three-pass matching:
 * 1. Keyword match: task keywords against rule trigger keywords
 * 2. Semantic match: embedding similarity against rule embeddings
 * 3. Category match: task type maps to rule categories
 *
 * Rules are formatted for context injection with token budget awareness.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { RuleDefinition, RuleCategory } from '../types.js';
import { listRules } from './rule-store.js';
import {
  RULE_SEMANTIC_MATCH_THRESHOLD,
  RULE_DECAY_FACTOR,
  RULE_DECAY_THRESHOLD_DAYS,
} from '../../constants.js';

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Match rules relevant to a task using three-pass matching.
 *
 * Pass 1 — Keyword: checks if any task keyword appears in any rule trigger keyword.
 * Pass 2 — Semantic: cosine similarity between task embedding and rule embeddings.
 * Pass 3 — Category: maps task type keywords to rule categories.
 *
 * Returns de-duplicated union of all matched rules, sorted by confidence DESC.
 */
export function matchRulesForTask(
  db: DatabaseConnection,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null,
): RuleDefinition[] {
  const allRules = listRules(db, { enabled: true });
  const matched = new Map<string, RuleDefinition>();

  // Pass 1: Keyword matching
  const lowerKeywords = taskKeywords.map(k => k.toLowerCase());
  for (const rule of allRules) {
    for (const trigger of rule.trigger_conditions) {
      if (!trigger.keywords) continue;
      const triggerLower = trigger.keywords.map(k => k.toLowerCase());
      if (lowerKeywords.some(k => triggerLower.includes(k))) {
        matched.set(rule.id, rule);
        break;
      }
    }
  }

  // Pass 2: Semantic matching (only if embedding provided)
  if (embedding) {
    for (const rule of allRules) {
      if (matched.has(rule.id)) continue;
      if (!rule.embedding) continue;

      const similarity = cosineSimilarity(embedding, rule.embedding);
      if (similarity >= RULE_SEMANTIC_MATCH_THRESHOLD) {
        matched.set(rule.id, rule);
      }
    }
  }

  // Pass 3: Category matching from task description keywords
  const categoryMatches = inferCategories(taskDescription, lowerKeywords);
  for (const rule of allRules) {
    if (matched.has(rule.id)) continue;
    if (categoryMatches.includes(rule.category)) {
      matched.set(rule.id, rule);
    }
  }

  // Sort by confidence descending
  return Array.from(matched.values()).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get all enabled rules sorted by confidence descending.
 */
export function getActiveRules(db: DatabaseConnection): RuleDefinition[] {
  return listRules(db, { enabled: true });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Render matched rules as structured markdown for context injection.
 * Respects token budget — higher confidence rules get priority.
 * Rough token estimation: 1 token per 4 characters.
 */
export function formatRulesForContext(rules: RuleDefinition[], tokenBudget: number): string {
  const sections: string[] = [];
  let estimatedTokens = 0;

  // Already sorted by confidence from matchRulesForTask
  for (const rule of rules) {
    const section = formatSingleRule(rule);
    const sectionTokens = Math.ceil(section.length / 4);

    if (estimatedTokens + sectionTokens > tokenBudget) {
      break; // Budget exhausted
    }

    sections.push(section);
    estimatedTokens += sectionTokens;
  }

  return sections.join('\n\n');
}

function formatSingleRule(rule: RuleDefinition): string {
  const lines: string[] = [
    `## Rule: ${rule.name}`,
    `**Enforcement:** ${rule.enforcement}`,
    `**Category:** ${rule.category}`,
    `**Confidence:** ${(rule.confidence * 100).toFixed(0)}%`,
  ];

  // What
  lines.push(`**What:** ${rule.description}`);

  // Why (from content, first paragraph)
  const whyMatch = rule.content.match(/\*\*Why:\*\*\s*(.*?)(?:\n\n|\*\*)/s);
  if (whyMatch) {
    lines.push(`**Why:** ${whyMatch[1].trim()}`);
  }

  // When to apply
  if (rule.trigger_conditions.length > 0) {
    lines.push('**When:**');
    for (const trigger of rule.trigger_conditions) {
      lines.push(`- ${trigger.condition}`);
    }
  }

  // Requirements
  const blockingConstraints = rule.constraints.filter(c => c.severity === 'blocking');
  const warningConstraints = rule.constraints.filter(c => c.severity === 'warning');

  if (blockingConstraints.length > 0) {
    lines.push('**Requirements (blocking):**');
    for (const c of blockingConstraints) {
      lines.push(`- ${c.requirement}`);
    }
  }

  if (warningConstraints.length > 0) {
    lines.push('**Requirements (warning):**');
    for (const c of warningConstraints) {
      lines.push(`- ${c.requirement}`);
    }
  }

  // Thresholds
  const thresholdEntries = Object.entries(rule.thresholds);
  if (thresholdEntries.length > 0) {
    lines.push('**Thresholds:**');
    for (const [key, value] of thresholdEntries) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Decay
// ---------------------------------------------------------------------------

/**
 * Apply confidence decay to rules unused for longer than the threshold.
 * Returns the count of rules that were decayed.
 */
export function applyRuleDecay(
  db: DatabaseConnection,
  decayFactor: number = RULE_DECAY_FACTOR,
  thresholdDays: number = RULE_DECAY_THRESHOLD_DAYS,
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);
  const cutoffIso = cutoff.toISOString();

  const staleRules = db.prepare<[string], { id: string; confidence: number }>(
    'SELECT id, confidence FROM rules WHERE enabled = 1 AND updated_at < ?',
  ).all(cutoffIso);

  let decayed = 0;
  const now = new Date().toISOString();
  const updateStmt = db.prepare<[number, string, string]>(
    'UPDATE rules SET confidence = ?, updated_at = ? WHERE id = ?',
  );

  for (const rule of staleRules) {
    const newConfidence = rule.confidence * decayFactor;
    updateStmt.run(newConfidence, now, rule.id);
    decayed++;
  }

  return decayed;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two embedding buffers (Float32Array encoded).
 */
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

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Infer rule categories from task keywords.
 */
function inferCategories(taskDescription: string, keywords: string[]): RuleCategory[] {
  const categories: Set<RuleCategory> = new Set();
  const text = `${taskDescription} ${keywords.join(' ')}`.toLowerCase();

  if (/workflow|phase|plan|implement|research|validate/.test(text)) {
    categories.add('workflow');
  }
  if (/quality|test|review|lint|gate/.test(text)) {
    categories.add('quality');
  }
  if (/discover|research|explore|investigate/.test(text)) {
    categories.add('discovery');
  }
  if (/route|expert|agent|delegate/.test(text)) {
    categories.add('routing');
  }
  if (/learn|correct|fix|lesson|failure/.test(text)) {
    categories.add('learning');
  }
  if (/session|resume|handoff|continue|checkpoint/.test(text)) {
    categories.add('continuity');
  }
  if (/decision|lock|defer|commit/.test(text)) {
    categories.add('fidelity');
  }
  if (/package|install|npm|yarn|bun|pnpm/.test(text)) {
    categories.add('operational');
  }

  return Array.from(categories);
}
