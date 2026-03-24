/**
 * Context Engine — Priority-ordered context assembly with token budgets.
 *
 * Loads contexts in CONTEXT_LOAD_PRIORITY order, respecting token budgets.
 * Project-specific contexts override global contexts of the same type.
 *
 * Also provides structured parsers for specific context types:
 * decisions, failure_patterns, user_taste.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { ContextEntry, ContextType } from '../types.js';
import { getContext } from './context-store.js';
import { CONTEXT_LOAD_PRIORITY } from '../../constants.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble contexts in priority order within a token budget.
 *
 * Iterates CONTEXT_LOAD_PRIORITY, loading each context (project-specific
 * with global fallback). Stops when the token budget is exhausted.
 */
export function assembleContexts(
  db: DatabaseConnection,
  projectId: string | null,
  tokenBudget: number,
): { contexts: ContextEntry[]; totalTokens: number } {
  const loaded: ContextEntry[] = [];
  let totalTokens = 0;

  for (const contextType of CONTEXT_LOAD_PRIORITY) {
    const entry = getContext(db, contextType as ContextType, projectId);
    if (!entry) continue;

    const entryTokens = estimateTokens(entry.content);

    if (totalTokens + entryTokens > tokenBudget) {
      // Try to fit a truncated version if remaining budget is meaningful
      const remainingTokens = tokenBudget - totalTokens;
      if (remainingTokens > 50) {
        const truncated = truncateToTokens(entry, remainingTokens);
        loaded.push(truncated);
        totalTokens += remainingTokens;
      }
      break;
    }

    loaded.push(entry);
    totalTokens += entryTokens;
  }

  return { contexts: loaded, totalTokens };
}

/**
 * Parse the 'decisions' context into structured categories.
 *
 * Expected format:
 * ## Locked Decisions
 * - decision 1
 *
 * ## Deferred
 * - deferred item
 *
 * ## Discretion
 * - discretionary item
 */
export function getDecisions(
  db: DatabaseConnection,
  projectId?: string | null,
): { locked: string[]; deferred: string[]; discretion: string[] } {
  const entry = getContext(db, 'decisions', projectId);
  if (!entry) return { locked: [], deferred: [], discretion: [] };

  return parseDecisions(entry.content);
}

/**
 * Parse the 'failure_patterns' context into structured patterns.
 */
export function getFailurePatterns(
  db: DatabaseConnection,
  projectId?: string | null,
): FailurePattern[] {
  const entry = getContext(db, 'failure_patterns', projectId);
  if (!entry) return [];

  return parseFailurePatterns(entry.content);
}

/**
 * Parse the 'user_taste' context into structured preferences.
 */
export function getUserTaste(
  db: DatabaseConnection,
): { preferred: string[]; disliked: string[]; confirmations: string[] } {
  const entry = getContext(db, 'user_taste', null);
  if (!entry) return { preferred: [], disliked: [], confirmations: [] };

  return parseUserTaste(entry.content);
}

/**
 * Format contexts as markdown for prompt injection.
 */
export function formatContextsForPrompt(
  contexts: ContextEntry[],
  tokenBudget: number,
): string {
  const sections: string[] = [];
  let usedChars = 0;
  const charBudget = tokenBudget * 4;

  for (const ctx of contexts) {
    const section = `### ${formatContextLabel(ctx.context_type)} (v${ctx.version})\n${ctx.content}`;

    if (usedChars + section.length > charBudget) {
      const remaining = charBudget - usedChars;
      if (remaining > 20) {
        const truncContent = section.slice(0, remaining - 15) + '\n[truncated]';
        sections.push(truncContent);
      }
      break;
    }

    sections.push(section);
    usedChars += section.length;
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FailurePattern {
  trigger: string;
  miss: string;
  rootCause: string;
  prevention: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function truncateToTokens(entry: ContextEntry, tokenBudget: number): ContextEntry {
  const charBudget = tokenBudget * 4;
  return {
    ...entry,
    content: entry.content.slice(0, charBudget) + '\n[truncated]',
  };
}

function formatContextLabel(type: ContextType): string {
  const labels: Record<ContextType, string> = {
    state: 'Project State',
    decisions: 'Locked Decisions',
    failure_patterns: 'Failure Patterns',
    lessons_learned: 'Lessons Learned',
    user_taste: 'User Preferences',
    verification: 'Verification',
    reference_library: 'Reference Library',
    ui_ux: 'UI/UX Brief',
    artifacts: 'Artifacts',
    tooling: 'Tooling',
    research_index: 'Research Index',
    session_index: 'Session Index',
    agent_catalog: 'Agent Catalog',
  };
  return labels[type] ?? type;
}

function parseDecisions(content: string): {
  locked: string[];
  deferred: string[];
  discretion: string[];
} {
  const locked: string[] = [];
  const deferred: string[] = [];
  const discretion: string[] = [];

  let current: string[] | null = null;
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('## locked') || lower.startsWith('# locked')) {
      current = locked;
    } else if (lower.startsWith('## deferred') || lower.startsWith('# deferred')) {
      current = deferred;
    } else if (lower.startsWith('## discretion') || lower.startsWith('# discretion')) {
      current = discretion;
    } else if (trimmed.startsWith('- ') && current) {
      current.push(trimmed.slice(2).trim());
    }
  }

  return { locked, deferred, discretion };
}

function parseFailurePatterns(content: string): FailurePattern[] {
  const patterns: FailurePattern[] = [];
  const blocks = content.split(/^##\s+/m).filter(b => b.trim());

  for (const block of blocks) {
    const lines = block.split('\n');
    let trigger = '';
    let miss = '';
    let rootCause = '';
    let prevention = '';

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.startsWith('- trigger:') || trimmed.startsWith('trigger:')) {
        trigger = line.replace(/^.*?:\s*/, '').trim();
      } else if (trimmed.startsWith('- miss:') || trimmed.startsWith('miss:')) {
        miss = line.replace(/^.*?:\s*/, '').trim();
      } else if (trimmed.startsWith('- root cause:') || trimmed.startsWith('root cause:') || trimmed.startsWith('- rootcause:')) {
        rootCause = line.replace(/^.*?:\s*/, '').trim();
      } else if (trimmed.startsWith('- prevention:') || trimmed.startsWith('prevention:')) {
        prevention = line.replace(/^.*?:\s*/, '').trim();
      }
    }

    if (trigger || miss || rootCause || prevention) {
      patterns.push({ trigger, miss, rootCause, prevention });
    }
  }

  return patterns;
}

function parseUserTaste(content: string): {
  preferred: string[];
  disliked: string[];
  confirmations: string[];
} {
  const preferred: string[] = [];
  const disliked: string[] = [];
  const confirmations: string[] = [];

  let current: string[] | null = null;
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('## preferred') || lower.startsWith('# preferred')) {
      current = preferred;
    } else if (lower.startsWith('## disliked') || lower.startsWith('# disliked')) {
      current = disliked;
    } else if (lower.startsWith('## confirmation') || lower.startsWith('# confirmation')) {
      current = confirmations;
    } else if (trimmed.startsWith('- ') && current) {
      current.push(trimmed.slice(2).trim());
    }
  }

  return { preferred, disliked, confirmations };
}
