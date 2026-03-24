/**
 * Context Economist
 *
 * Intelligent allocation of context budget across competing demands,
 * maximizing information density per token.
 *
 * Economy Model:
 * 1. Value Scoring — relevance * recency * uniqueness * importance_class
 * 2. Budget Allocation — fixed + dynamic by value score
 * 3. Compression Strategies — skill/lesson/task compression at 3 levels
 * 4. Tracking — per-sync metrics
 * 5. Learning — track which truncated memories would have been useful
 */

// ===========================================================================
// Types
// ===========================================================================

export type ImportanceClass =
  | 'skill'
  | 'anti_pattern'
  | 'lesson'
  | 'task'
  | 'preference'
  | 'other';

export type CompressionLevel = 'none' | 'moderate' | 'aggressive';

export interface ContextItem {
  id: string;
  content: string;
  tokenCount: number;
  importanceClass: ImportanceClass;
  relevance: number;   // 0-1, from retrieval
  recency: number;     // 0-1, from temporal model
  uniqueness: number;  // 0-1, how non-redundant
}

export interface ValuedItem extends ContextItem {
  value: number;
  compressedContent?: string;
  compressedTokenCount?: number;
  finalTokenCount: number;
  compressionLevel: CompressionLevel;
}

export interface BudgetAllocation {
  systemPrompt: number;
  conventions: number;
  activePlan: number;
  dynamic: number;
  total: number;
}

export interface AllocationResult {
  included: ValuedItem[];
  truncated: Array<{ id: string; value: number; reason: string }>;
  tokensUsed: number;
  tokensBudget: number;
  tokensRemaining: number;
}

export interface TruncationRecord {
  itemId: string;
  value: number;
  wasUseful: boolean;
  timestamp: string;
}

// ===========================================================================
// Constants
// ===========================================================================

const IMPORTANCE_WEIGHTS: Record<ImportanceClass, number> = {
  skill: 1.0,
  anti_pattern: 0.9,
  lesson: 0.8,
  task: 0.6,
  preference: 0.5,
  other: 0.3,
};

const BUDGET_RATIOS = {
  systemPrompt: 0.10,
  conventions: 0.15,
  activePlan: 0.20,
  dynamic: 0.55,
};

const TOKEN_ESTIMATE_PER_CHAR = 0.25; // ~4 chars per token

// ===========================================================================
// Module state for learning
// ===========================================================================

const truncationHistory: TruncationRecord[] = [];

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Compute the information value of a context item.
 *
 * value = relevance * recency * uniqueness * importance_class_weight
 */
export function computeValue(item: ContextItem): number {
  const importanceWeight = IMPORTANCE_WEIGHTS[item.importanceClass] ?? 0.3;
  return item.relevance * item.recency * item.uniqueness * importanceWeight;
}

/**
 * Compute budget allocation from total token budget.
 */
export function allocateBudget(totalTokens: number): BudgetAllocation {
  return {
    systemPrompt: Math.floor(totalTokens * BUDGET_RATIOS.systemPrompt),
    conventions: Math.floor(totalTokens * BUDGET_RATIOS.conventions),
    activePlan: Math.floor(totalTokens * BUDGET_RATIOS.activePlan),
    dynamic: Math.floor(totalTokens * BUDGET_RATIOS.dynamic),
    total: totalTokens,
  };
}

/**
 * Estimate token count for a string.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKEN_ESTIMATE_PER_CHAR);
}

/**
 * Compress a context item to reduce token cost.
 *
 * Compression levels:
 * - none: full content
 * - moderate: first sentence + key details (~50% reduction)
 * - aggressive: title/key only (~75% reduction)
 */
export function compress(item: ContextItem, level: CompressionLevel): {
  content: string;
  tokenCount: number;
} {
  if (level === 'none') {
    return { content: item.content, tokenCount: item.tokenCount };
  }

  if (level === 'moderate') {
    // Keep first sentence and key terms
    const firstSentence = item.content.split(/[.\n]/)[0]?.trim() ?? '';
    const compressed = firstSentence.length > 0 ? firstSentence + '.' : item.content.slice(0, 100);
    return {
      content: compressed,
      tokenCount: estimateTokens(compressed),
    };
  }

  // Aggressive: just the ID and importance class
  const minimal = `[${item.importanceClass}] ${item.content.slice(0, 50)}...`;
  return {
    content: minimal,
    tokenCount: estimateTokens(minimal),
  };
}

/**
 * Allocate context items within a token budget.
 *
 * Items are sorted by value, included in order, with compression
 * applied to fit more items.
 */
export function allocateItems(
  items: ContextItem[],
  budgetTokens: number,
): AllocationResult {
  // Score and sort by value descending
  const valued: ValuedItem[] = items.map((item) => ({
    ...item,
    value: computeValue(item),
    finalTokenCount: item.tokenCount,
    compressionLevel: 'none' as CompressionLevel,
  }));

  valued.sort((a, b) => b.value - a.value);

  const included: ValuedItem[] = [];
  const truncated: AllocationResult['truncated'] = [];
  let tokensUsed = 0;

  for (const item of valued) {
    // Try to fit at full size
    if (tokensUsed + item.tokenCount <= budgetTokens) {
      included.push(item);
      tokensUsed += item.tokenCount;
      continue;
    }

    // Try moderate compression
    const moderate = compress(item, 'moderate');
    if (tokensUsed + moderate.tokenCount <= budgetTokens) {
      included.push({
        ...item,
        compressedContent: moderate.content,
        compressedTokenCount: moderate.tokenCount,
        finalTokenCount: moderate.tokenCount,
        compressionLevel: 'moderate',
      });
      tokensUsed += moderate.tokenCount;
      continue;
    }

    // Try aggressive compression
    const aggressive = compress(item, 'aggressive');
    if (tokensUsed + aggressive.tokenCount <= budgetTokens) {
      included.push({
        ...item,
        compressedContent: aggressive.content,
        compressedTokenCount: aggressive.tokenCount,
        finalTokenCount: aggressive.tokenCount,
        compressionLevel: 'aggressive',
      });
      tokensUsed += aggressive.tokenCount;
      continue;
    }

    // Cannot fit even with aggressive compression
    truncated.push({
      id: item.id,
      value: item.value,
      reason: 'Insufficient budget even with aggressive compression',
    });
  }

  return {
    included,
    truncated,
    tokensUsed,
    tokensBudget: budgetTokens,
    tokensRemaining: budgetTokens - tokensUsed,
  };
}

/**
 * Record whether a truncated item turned out to be useful.
 */
export function recordTruncationOutcome(record: TruncationRecord): void {
  truncationHistory.push(record);
}

/**
 * Get truncation history for analysis.
 */
export function getTruncationHistory(): TruncationRecord[] {
  return [...truncationHistory];
}

/**
 * Compute the useful-truncation rate.
 *
 * If many truncated items turned out to be useful, the value scoring
 * or budget allocation needs adjustment.
 */
export function computeTruncationWasteRate(): number {
  if (truncationHistory.length === 0) return 0;
  const useful = truncationHistory.filter((r) => r.wasUseful).length;
  return useful / truncationHistory.length;
}

/**
 * Get the importance weight for a class.
 */
export function getImportanceWeight(cls: ImportanceClass): number {
  return IMPORTANCE_WEIGHTS[cls] ?? 0.3;
}
