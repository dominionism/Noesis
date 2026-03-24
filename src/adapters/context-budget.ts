/**
 * Token Budget Management
 *
 * Manages allocation of a fixed token budget across named sections of
 * adapter output. The budget ensures adapters never exceed the target
 * tool's context window.
 *
 * Token estimation uses the ~4 characters per token approximation,
 * which is intentionally conservative for English text. This avoids
 * the dependency on a full tokenizer while staying within safe bounds.
 *
 * Content compression truncates to fit within a token limit, preserving
 * the beginning of the text (highest-priority information) and appending
 * a truncation indicator.
 */

import type { TokenBudget } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Average characters per token for English text (conservative estimate). */
const CHARS_PER_TOKEN = 4;

/** Suffix appended when content is truncated to fit budget. */
const TRUNCATION_SUFFIX = '\n\n[... truncated to fit context budget]';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a fresh token budget with no allocations.
 *
 * @param totalTokens - Maximum tokens available for allocation.
 * @returns A new TokenBudget with full remaining capacity.
 */
export function createTokenBudget(totalTokens: number): TokenBudget {
  if (totalTokens < 0) {
    throw new Error('Token budget must be non-negative');
  }

  return {
    total: totalTokens,
    allocated: {},
    remaining: totalTokens,
  };
}

/**
 * Allocate tokens to a named section.
 *
 * Returns a new TokenBudget (immutable pattern). The allocation is
 * clamped to the remaining budget: if you request more than available,
 * only the remaining tokens are allocated.
 *
 * @param budget - Current budget state.
 * @param section - Section name (e.g. 'persona', 'skills', 'lessons').
 * @param tokens - Number of tokens to allocate.
 * @returns Updated TokenBudget with the new allocation.
 */
export function allocateTokens(
  budget: TokenBudget,
  section: string,
  tokens: number,
): TokenBudget {
  if (tokens < 0) {
    throw new Error('Token allocation must be non-negative');
  }

  // Clamp to remaining budget
  const actual = Math.min(tokens, budget.remaining);
  const previousAllocation = budget.allocated[section] ?? 0;

  return {
    total: budget.total,
    allocated: {
      ...budget.allocated,
      [section]: previousAllocation + actual,
    },
    remaining: budget.remaining - actual,
  };
}

/**
 * Estimate the token count for a text string.
 *
 * Uses ~4 characters per token as a conservative approximation.
 * Rounds up to avoid underestimation.
 *
 * @param text - The text to estimate tokens for.
 * @returns Estimated token count.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Compress content to fit within a maximum token budget.
 *
 * Strategy: truncate at a character boundary that corresponds to the
 * token limit, preserving the beginning of the content (highest
 * priority). Appends a truncation indicator if content was cut.
 *
 * If the content already fits, it is returned unchanged.
 *
 * @param content - The content to compress.
 * @param maxTokens - Maximum tokens allowed.
 * @returns Content that fits within the token budget.
 */
export function compressContent(content: string, maxTokens: number): string {
  if (maxTokens <= 0) {
    return '';
  }

  const estimated = estimateTokens(content);
  if (estimated <= maxTokens) {
    return content;
  }

  // Reserve tokens for the truncation suffix
  const suffixTokens = estimateTokens(TRUNCATION_SUFFIX);
  const contentTokens = maxTokens - suffixTokens;

  if (contentTokens <= 0) {
    return TRUNCATION_SUFFIX.trim();
  }

  const maxChars = contentTokens * CHARS_PER_TOKEN;
  // Truncate at the last newline before the limit to avoid breaking mid-line
  const truncated = content.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  const cleanTruncation = lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated;

  return cleanTruncation + TRUNCATION_SUFFIX;
}
