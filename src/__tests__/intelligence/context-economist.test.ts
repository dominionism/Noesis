/**
 * Tests for Context Economist
 */

import { describe, it, expect } from 'vitest';
import {
  computeValue,
  allocateBudget,
  estimateTokens,
  compress,
  allocateItems,
  recordTruncationOutcome,
  getTruncationHistory,
  computeTruncationWasteRate,
  getImportanceWeight,
  type ContextItem,
} from '../../intelligence/context-economist.js';

function makeItem(overrides?: Partial<ContextItem>): ContextItem {
  return {
    id: 'item-1',
    content: 'This is a test content item for context allocation.',
    tokenCount: 20,
    importanceClass: 'task',
    relevance: 0.8,
    recency: 0.9,
    uniqueness: 0.7,
    ...overrides,
  };
}

describe('computeValue', () => {
  it('computes value as relevance * recency * uniqueness * importance', () => {
    const item = makeItem({
      relevance: 0.8,
      recency: 0.9,
      uniqueness: 0.7,
      importanceClass: 'skill',
    });
    // 0.8 * 0.9 * 0.7 * 1.0 = 0.504
    expect(computeValue(item)).toBeCloseTo(0.504, 3);
  });

  it('returns 0 when any factor is 0', () => {
    const item = makeItem({ relevance: 0 });
    expect(computeValue(item)).toBe(0);
  });

  it('weights skills highest', () => {
    const skill = computeValue(makeItem({ importanceClass: 'skill' }));
    const task = computeValue(makeItem({ importanceClass: 'task' }));
    const other = computeValue(makeItem({ importanceClass: 'other' }));

    expect(skill).toBeGreaterThan(task);
    expect(task).toBeGreaterThan(other);
  });
});

describe('allocateBudget', () => {
  it('allocates correct percentages', () => {
    const budget = allocateBudget(10000);
    expect(budget.systemPrompt).toBe(1000);
    expect(budget.conventions).toBe(1500);
    expect(budget.activePlan).toBe(2000);
    expect(budget.dynamic).toBe(5500);
    expect(budget.total).toBe(10000);
  });
});

describe('estimateTokens', () => {
  it('estimates tokens at ~4 chars per token', () => {
    const tokens = estimateTokens('abcd'); // 4 chars = 1 token
    expect(tokens).toBe(1);
  });

  it('rounds up', () => {
    const tokens = estimateTokens('abcde'); // 5 chars * 0.25 = 1.25 → 2
    expect(tokens).toBe(2);
  });
});

describe('compress', () => {
  it('returns full content at none level', () => {
    const item = makeItem();
    const result = compress(item, 'none');
    expect(result.content).toBe(item.content);
    expect(result.tokenCount).toBe(item.tokenCount);
  });

  it('reduces content at moderate level', () => {
    const item = makeItem({
      content: 'First sentence here. Second sentence with more details. Third sentence.',
      tokenCount: 50,
    });
    const result = compress(item, 'moderate');
    expect(result.content).toBe('First sentence here.');
    expect(result.tokenCount).toBeLessThan(50);
  });

  it('reduces content significantly at aggressive level', () => {
    const item = makeItem({
      content: 'A very long content string that should be heavily compressed to save tokens.',
      tokenCount: 40,
    });
    const result = compress(item, 'aggressive');
    expect(result.tokenCount).toBeLessThan(40);
    expect(result.content).toContain('[task]');
  });
});

describe('allocateItems', () => {
  it('includes all items when budget is sufficient', () => {
    const items = [
      makeItem({ id: 'a', tokenCount: 10 }),
      makeItem({ id: 'b', tokenCount: 10 }),
    ];

    const result = allocateItems(items, 100);
    expect(result.included).toHaveLength(2);
    expect(result.truncated).toHaveLength(0);
    expect(result.tokensUsed).toBe(20);
  });

  it('truncates low-value items when budget is tight', () => {
    const items = [
      makeItem({ id: 'high', tokenCount: 95, importanceClass: 'skill', relevance: 1.0 }),
      makeItem({ id: 'low', tokenCount: 95, importanceClass: 'other', relevance: 0.1 }),
    ];

    // Budget of 100 can barely fit 1 item, second cannot fit even compressed
    const result = allocateItems(items, 100);
    expect(result.included.length).toBeLessThanOrEqual(2);
    // At least one item should be truncated or compressed
    expect(result.truncated.length + result.included.filter((i) => i.compressionLevel !== 'none').length).toBeGreaterThan(0);
  });

  it('applies compression to fit more items', () => {
    const items = [
      makeItem({
        id: 'big',
        content: 'First sentence. Lots more content here that could be compressed.',
        tokenCount: 60,
        importanceClass: 'skill',
        relevance: 1.0,
      }),
      makeItem({
        id: 'medium',
        content: 'Another item. More stuff.',
        tokenCount: 50,
        importanceClass: 'anti_pattern',
        relevance: 0.9,
      }),
    ];

    const result = allocateItems(items, 80);
    // At least one item should be compressed
    const compressed = result.included.filter((i) => i.compressionLevel !== 'none');
    if (result.included.length > 1) {
      expect(compressed.length).toBeGreaterThan(0);
    }
  });

  it('sorts by value descending', () => {
    const items = [
      makeItem({ id: 'low', relevance: 0.1, tokenCount: 5 }),
      makeItem({ id: 'high', relevance: 1.0, tokenCount: 5 }),
    ];

    const result = allocateItems(items, 100);
    expect(result.included[0].id).toBe('high');
  });

  it('handles empty item list', () => {
    const result = allocateItems([], 100);
    expect(result.included).toHaveLength(0);
    expect(result.tokensRemaining).toBe(100);
  });
});

describe('getImportanceWeight', () => {
  it('returns 1.0 for skills', () => {
    expect(getImportanceWeight('skill')).toBe(1.0);
  });

  it('returns 0.3 for other', () => {
    expect(getImportanceWeight('other')).toBe(0.3);
  });
});

describe('truncation tracking', () => {
  it('records and retrieves truncation outcomes', () => {
    const initial = getTruncationHistory().length;
    recordTruncationOutcome({
      itemId: 'test-item',
      value: 0.5,
      wasUseful: true,
      timestamp: new Date().toISOString(),
    });

    expect(getTruncationHistory().length).toBe(initial + 1);
  });

  it('computes waste rate', () => {
    // Rate depends on accumulated state from prior tests, just verify it returns a number
    const rate = computeTruncationWasteRate();
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });
});
