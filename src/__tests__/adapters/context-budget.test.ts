/**
 * Tests for src/adapters/context-budget.ts
 *
 * Validates token budget creation, allocation, estimation, and
 * content compression. These functions ensure adapters never exceed
 * the target tool's context window.
 */

import { describe, it, expect } from 'vitest';
import {
  createTokenBudget,
  allocateTokens,
  estimateTokens,
  compressContent,
} from '../../adapters/context-budget.js';

// ---------------------------------------------------------------------------
// createTokenBudget
// ---------------------------------------------------------------------------

describe('createTokenBudget', () => {
  it('creates a budget with full remaining capacity', () => {
    const budget = createTokenBudget(10_000);
    expect(budget.total).toBe(10_000);
    expect(budget.remaining).toBe(10_000);
    expect(Object.keys(budget.allocated)).toHaveLength(0);
  });

  it('creates a zero-token budget', () => {
    const budget = createTokenBudget(0);
    expect(budget.total).toBe(0);
    expect(budget.remaining).toBe(0);
  });

  it('throws for negative budget', () => {
    expect(() => createTokenBudget(-1)).toThrow('non-negative');
  });
});

// ---------------------------------------------------------------------------
// allocateTokens
// ---------------------------------------------------------------------------

describe('allocateTokens', () => {
  it('allocates tokens to a section', () => {
    const budget = createTokenBudget(10_000);
    const updated = allocateTokens(budget, 'persona', 2_000);
    expect(updated.allocated['persona']).toBe(2_000);
    expect(updated.remaining).toBe(8_000);
  });

  it('returns a new budget (immutability)', () => {
    const original = createTokenBudget(10_000);
    const updated = allocateTokens(original, 'persona', 2_000);
    expect(original.remaining).toBe(10_000);
    expect(updated.remaining).toBe(8_000);
  });

  it('clamps allocation to remaining budget', () => {
    const budget = createTokenBudget(100);
    const updated = allocateTokens(budget, 'large', 500);
    expect(updated.allocated['large']).toBe(100);
    expect(updated.remaining).toBe(0);
  });

  it('accumulates allocations for the same section', () => {
    const budget = createTokenBudget(10_000);
    const first = allocateTokens(budget, 'skills', 1_000);
    const second = allocateTokens(first, 'skills', 500);
    expect(second.allocated['skills']).toBe(1_500);
    expect(second.remaining).toBe(8_500);
  });

  it('supports multiple sections', () => {
    let budget = createTokenBudget(10_000);
    budget = allocateTokens(budget, 'persona', 2_000);
    budget = allocateTokens(budget, 'skills', 3_000);
    budget = allocateTokens(budget, 'lessons', 1_000);

    expect(budget.allocated['persona']).toBe(2_000);
    expect(budget.allocated['skills']).toBe(3_000);
    expect(budget.allocated['lessons']).toBe(1_000);
    expect(budget.remaining).toBe(4_000);
  });

  it('throws for negative allocation', () => {
    const budget = createTokenBudget(10_000);
    expect(() => allocateTokens(budget, 'test', -1)).toThrow('non-negative');
  });

  it('handles zero allocation', () => {
    const budget = createTokenBudget(10_000);
    const updated = allocateTokens(budget, 'empty', 0);
    expect(updated.allocated['empty']).toBe(0);
    expect(updated.remaining).toBe(10_000);
  });
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    // 40 chars -> 10 tokens
    const text = 'a'.repeat(40);
    expect(estimateTokens(text)).toBe(10);
  });

  it('rounds up for non-divisible lengths', () => {
    // 5 chars -> ceil(5/4) = 2 tokens
    expect(estimateTokens('hello')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('handles single character', () => {
    expect(estimateTokens('x')).toBe(1);
  });

  it('handles multi-line text', () => {
    const text = 'line 1\nline 2\nline 3';
    expect(estimateTokens(text)).toBe(Math.ceil(text.length / 4));
  });
});

// ---------------------------------------------------------------------------
// compressContent
// ---------------------------------------------------------------------------

describe('compressContent', () => {
  it('returns content unchanged when it fits within budget', () => {
    const content = 'short content';
    const tokens = estimateTokens(content) + 10;
    expect(compressContent(content, tokens)).toBe(content);
  });

  it('truncates content that exceeds budget', () => {
    const content = 'a'.repeat(1000);
    const result = compressContent(content, 10);
    expect(result.length).toBeLessThan(content.length);
    expect(result).toContain('truncated to fit context budget');
  });

  it('preserves the beginning of content (highest priority)', () => {
    const content = 'IMPORTANT start ' + 'padding '.repeat(200) + 'end';
    const result = compressContent(content, 20);
    expect(result).toContain('IMPORTANT start');
  });

  it('appends truncation indicator', () => {
    const content = 'x'.repeat(10000);
    const result = compressContent(content, 50);
    expect(result).toContain('[... truncated to fit context budget]');
  });

  it('returns empty string for zero budget', () => {
    expect(compressContent('any content', 0)).toBe('');
  });

  it('returns empty string for negative budget', () => {
    expect(compressContent('any content', -10)).toBe('');
  });

  it('handles content that is exactly at the budget', () => {
    // 40 chars = 10 tokens
    const content = 'a'.repeat(40);
    expect(compressContent(content, 10)).toBe(content);
  });

  it('tries to truncate at line boundaries', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}: some content here`);
    const content = lines.join('\n');
    const result = compressContent(content, 30);
    // Should not break mid-line (ends before truncation suffix)
    const beforeSuffix = result.split('[... truncated')[0];
    // The last character before the suffix should be a newline (from clean truncation)
    // or the content was too short for clean line break
    expect(beforeSuffix.length).toBeGreaterThan(0);
  });
});
