/**
 * Model Router
 *
 * Selects the optimal LLM tier for each sub-operation based on task
 * characteristics, cost, and historical performance.
 *
 * Routing Matrix:
 * - Tier 1 (Opus/GPT-4): skill synthesis, anti-pattern synthesis, strategy simulation, blocking critiques
 * - Tier 2 (Sonnet/GPT-4-mini): knowledge distillation, prompt optimization, plan decomposition, advisory critiques
 * - Tier 3 (Haiku/fast): content classification
 *
 * Learning: tracks cost and quality per operation per model,
 * stored as 'decision' type memories tagged 'model_routing'.
 */

// ===========================================================================
// Types
// ===========================================================================

export type ModelTier = 'tier1' | 'tier2' | 'tier3';

export type OperationType =
  | 'skill_synthesis'
  | 'antipattern_synthesis'
  | 'knowledge_distillation'
  | 'prompt_optimization'
  | 'content_classification'
  | 'strategy_simulation'
  | 'plan_decomposition'
  | 'critique_blocking'
  | 'critique_advisory';

export interface TierConfig {
  provider: string;
  model: string;
  maxTokensPerCall: number;
  costPer1kTokens: number;
}

export interface RouterConfig {
  tier1: TierConfig;
  tier2: TierConfig;
  tier3: TierConfig;
}

export interface RoutingDecision {
  operation: OperationType;
  selectedTier: ModelTier;
  selectedModel: string;
  confidence: number;
  reasoning: string;
}

export interface RoutingOutcome {
  operation: OperationType;
  tier: ModelTier;
  qualityScore: number; // 0-1
  tokensCost: number;
  durationMs: number;
  timestamp: string;
}

export interface RoutingStats {
  operation: OperationType;
  tier: ModelTier;
  avgQuality: number;
  avgCost: number;
  sampleCount: number;
}

// ===========================================================================
// Default routing table
// ===========================================================================

const DEFAULT_ROUTING: Record<OperationType, ModelTier> = {
  skill_synthesis: 'tier1',
  antipattern_synthesis: 'tier1',
  knowledge_distillation: 'tier2',
  prompt_optimization: 'tier2',
  content_classification: 'tier3',
  strategy_simulation: 'tier1',
  plan_decomposition: 'tier2',
  critique_blocking: 'tier1',
  critique_advisory: 'tier2',
};

const COMPLEXITY_SCORES: Record<OperationType, number> = {
  skill_synthesis: 0.9,
  antipattern_synthesis: 0.85,
  knowledge_distillation: 0.6,
  prompt_optimization: 0.5,
  content_classification: 0.2,
  strategy_simulation: 0.85,
  plan_decomposition: 0.6,
  critique_blocking: 0.8,
  critique_advisory: 0.5,
};

// ===========================================================================
// Default configuration
// ===========================================================================

const DEFAULT_CONFIG: RouterConfig = {
  tier1: {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    maxTokensPerCall: 4096,
    costPer1kTokens: 0.015,
  },
  tier2: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    maxTokensPerCall: 2048,
    costPer1kTokens: 0.003,
  },
  tier3: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokensPerCall: 1024,
    costPer1kTokens: 0.00025,
  },
};

// ===========================================================================
// Module state
// ===========================================================================

const outcomes: RoutingOutcome[] = [];

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Route an operation to the appropriate model tier.
 *
 * Uses default routing table, adjusted by historical performance
 * data when available.
 */
export function routeOperation(
  operation: OperationType,
  config: RouterConfig = DEFAULT_CONFIG,
  history?: RoutingOutcome[],
): RoutingDecision {
  const defaultTier = DEFAULT_ROUTING[operation];
  const complexity = COMPLEXITY_SCORES[operation];

  // Check if history suggests a different tier
  if (history && history.length > 0) {
    const learned = learnFromHistory(operation, history);
    if (learned) {
      const tierConfig = config[learned.tier];
      return {
        operation,
        selectedTier: learned.tier,
        selectedModel: tierConfig.model,
        confidence: learned.confidence,
        reasoning: `Historical data (${learned.sampleCount} samples) suggests ${learned.tier} for ${operation}: avg quality ${learned.avgQuality.toFixed(2)}, avg cost ${learned.avgCost.toFixed(4)}`,
      };
    }
  }

  const tierConfig = config[defaultTier];

  return {
    operation,
    selectedTier: defaultTier,
    selectedModel: tierConfig.model,
    confidence: 0.7,
    reasoning: `Default routing: ${operation} (complexity ${complexity.toFixed(1)}) → ${defaultTier}`,
  };
}

/**
 * Get the default tier for an operation.
 */
export function getDefaultTier(operation: OperationType): ModelTier {
  return DEFAULT_ROUTING[operation];
}

/**
 * Get the complexity score for an operation.
 */
export function getComplexity(operation: OperationType): number {
  return COMPLEXITY_SCORES[operation];
}

/**
 * Get the tier configuration.
 */
export function getTierConfig(
  tier: ModelTier,
  config: RouterConfig = DEFAULT_CONFIG,
): TierConfig {
  return config[tier];
}

/**
 * Record a routing outcome for learning.
 */
export function recordRoutingOutcome(outcome: RoutingOutcome): void {
  outcomes.push(outcome);
}

/**
 * Get all recorded routing outcomes.
 */
export function getRoutingOutcomes(): RoutingOutcome[] {
  return [...outcomes];
}

/**
 * Compute routing statistics grouped by operation and tier.
 */
export function computeRoutingStats(
  history?: RoutingOutcome[],
): RoutingStats[] {
  const data = history ?? outcomes;
  const groups = new Map<string, RoutingOutcome[]>();

  for (const outcome of data) {
    const key = `${outcome.operation}:${outcome.tier}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(outcome);
  }

  const stats: RoutingStats[] = [];
  for (const [key, group] of groups) {
    const [operation, tier] = key.split(':') as [OperationType, ModelTier];
    const avgQuality = group.reduce((s, o) => s + o.qualityScore, 0) / group.length;
    const avgCost = group.reduce((s, o) => s + o.tokensCost, 0) / group.length;

    stats.push({
      operation,
      tier,
      avgQuality,
      avgCost,
      sampleCount: group.length,
    });
  }

  return stats;
}

/**
 * Estimate the cost for an operation.
 */
export function estimateCost(
  operation: OperationType,
  estimatedTokens: number,
  config: RouterConfig = DEFAULT_CONFIG,
): { tier: ModelTier; estimatedCost: number } {
  const tier = DEFAULT_ROUTING[operation];
  const tierConfig = config[tier];
  const estimatedCost = (estimatedTokens / 1000) * tierConfig.costPer1kTokens;

  return { tier, estimatedCost };
}

// ===========================================================================
// Internal helpers
// ===========================================================================

/**
 * Learn from historical outcomes to potentially override default routing.
 *
 * If a lower tier consistently delivers good quality for an operation,
 * recommend it to save cost.
 */
function learnFromHistory(
  operation: OperationType,
  history: RoutingOutcome[],
): { tier: ModelTier; confidence: number; sampleCount: number; avgQuality: number; avgCost: number } | null {
  const operationHistory = history.filter((o) => o.operation === operation);
  if (operationHistory.length < 3) return null;

  // Group by tier
  const tierGroups = new Map<ModelTier, RoutingOutcome[]>();
  for (const outcome of operationHistory) {
    if (!tierGroups.has(outcome.tier)) tierGroups.set(outcome.tier, []);
    tierGroups.get(outcome.tier)!.push(outcome);
  }

  // Find the tier with best quality-to-cost ratio
  let bestTier: ModelTier | null = null;
  let bestRatio = -1;
  let bestQuality = 0;
  let bestCost = 0;
  let bestCount = 0;

  for (const [tier, group] of tierGroups) {
    if (group.length < 2) continue;

    const avgQuality = group.reduce((s, o) => s + o.qualityScore, 0) / group.length;
    const avgCost = group.reduce((s, o) => s + o.tokensCost, 0) / group.length;

    // Quality must be acceptable (> 0.6)
    if (avgQuality < 0.6) continue;

    const ratio = avgCost > 0 ? avgQuality / avgCost : avgQuality * 1000;

    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestTier = tier;
      bestQuality = avgQuality;
      bestCost = avgCost;
      bestCount = group.length;
    }
  }

  if (bestTier === null) return null;

  const confidence = Math.min(0.5 + bestCount * 0.05, 0.95);

  return {
    tier: bestTier,
    confidence,
    sampleCount: bestCount,
    avgQuality: bestQuality,
    avgCost: bestCost,
  };
}

// ===========================================================================
// Cost-aware model cascade routing
// ===========================================================================

/**
 * Cost-aware model cascade routing.
 *
 * Routes tasks to the cheapest model tier that can handle them,
 * based on task complexity and historical success rates.
 * Records routing decisions for learning.
 *
 * Implements cost-aware model cascade routing.
 */
export function cascadeRoute(
  task: string,
  context: {
    taskComplexity: 'low' | 'medium' | 'high' | 'critical';
    hasVerification: boolean;
    pastSuccessRateByTier: Map<string, number>;
    confidenceThreshold: number;
  },
): {
  recommended_tier: string;
  reasoning: string;
  fallback_tier: string;
  estimated_cost_ratio: number;
} {
  const { taskComplexity, hasVerification, pastSuccessRateByTier, confidenceThreshold } = context;

  // Tier definitions with relative cost
  const tiers = [
    { name: 'haiku', cost: 0.05, minComplexity: 'low' as const, capabilities: ['search', 'extraction', 'localization', 'summarization', 'schema_transform'] },
    { name: 'sonnet', cost: 0.25, minComplexity: 'medium' as const, capabilities: ['implementation', 'debugging', 'refactoring', 'testing', 'analysis'] },
    { name: 'opus', cost: 1.0, minComplexity: 'high' as const, capabilities: ['architecture', 'ambiguity_resolution', 'novel_design', 'hard_debugging', 'arbitration'] },
  ];

  const complexityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  const taskLevel = complexityOrder[taskComplexity];

  // Try cheapest sufficient tier first
  for (const tier of tiers) {
    const tierLevel = complexityOrder[tier.minComplexity];

    // Skip if tier is too weak for this complexity
    if (tierLevel < taskLevel - 1) continue;

    // Check historical success rate for this tier
    const successRate = pastSuccessRateByTier.get(tier.name) ?? 0.5;

    // If verification exists, we can be more aggressive with cheaper tiers
    const adjustedThreshold = hasVerification
      ? confidenceThreshold * 0.8  // Lower threshold when we can verify
      : confidenceThreshold;

    if (successRate >= adjustedThreshold || taskLevel <= tierLevel) {
      const fallbackIdx = tiers.indexOf(tier) + 1;
      const fallback = fallbackIdx < tiers.length ? tiers[fallbackIdx] : tier;

      return {
        recommended_tier: tier.name,
        reasoning: `Task complexity "${taskComplexity}" with ${(successRate * 100).toFixed(0)}% historical success rate at ${tier.name} tier` +
          (hasVerification ? ' (verification available, lower threshold applied)' : ''),
        fallback_tier: fallback.name,
        estimated_cost_ratio: tier.cost,
      };
    }
  }

  // Fallback to strongest tier
  return {
    recommended_tier: 'opus',
    reasoning: `Task complexity "${taskComplexity}" exceeds confidence thresholds for cheaper tiers`,
    fallback_tier: 'opus',
    estimated_cost_ratio: 1.0,
  };
}
