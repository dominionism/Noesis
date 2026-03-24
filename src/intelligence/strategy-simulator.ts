/**
 * Strategy Simulation Layer
 *
 * Before committing to an approach, simulate multiple strategies using
 * compressed memory state and evaluate outcomes probabilistically.
 *
 * Algorithm:
 * 1. GENERATE: Given a task, generate N candidate strategies (N=3-5)
 * 2. SIMULATE: For each strategy, estimate P(success), time, risk
 * 3. EVALUATE: Score strategies
 * 4. RECOMMEND: Present top strategies with reasoning
 * 5. LEARN: Compare predicted vs actual outcomes
 */

import { generateId } from '../core/ulid.js';
import type { ScoredMemory, AntiPatternDefinition, SkillDefinition } from '../types.js';

// ===========================================================================
// Types
// ===========================================================================

export interface StrategyStep {
  description: string;
  expectedOutcome: string;
  riskFactors: string[];
}

export interface StrategyMetrics {
  successProbability: number;
  expectedTimeMs: number;
  riskFactor: number;
  prerequisiteSatisfaction: number;
  overallScore: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  steps: StrategyStep[];
  metrics: StrategyMetrics;
}

export interface SimulationInput {
  task: string;
  constraints: string[];
  skills: SkillDefinition[];
  antiPatterns: AntiPatternDefinition[];
  pastTasks: ScoredMemory[];
  numStrategies?: number;
}

export interface SimulationResult {
  strategies: Strategy[];
  recommended: Strategy;
  needsMoreResearch: boolean;
  isDecisionPoint: boolean;
  reasoning: string;
}

export interface StrategyOutcome {
  strategyId: string;
  predictedSuccess: number;
  actualSuccess: boolean;
  predictedTimeMs: number;
  actualTimeMs: number;
  keyDifferences: string[];
}

// ===========================================================================
// Module-level outcome storage
// ===========================================================================

const outcomes: StrategyOutcome[] = [];

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Calculate overall strategy score from metrics.
 *
 * score = P(success) * (1 / (1 + timeMs/300000)) * (1 - risk) * prerequisites
 */
export function calculateStrategyScore(metrics: StrategyMetrics): number {
  const timeFactor = 1 / (1 + metrics.expectedTimeMs / 300_000);
  return metrics.successProbability * timeFactor * (1 - metrics.riskFactor) * metrics.prerequisiteSatisfaction;
}

/**
 * Simulate a single strategy against the input context.
 *
 * Estimates success probability, time, risk, and prerequisite satisfaction.
 */
export function simulateStrategy(
  strategy: Strategy,
  input: SimulationInput,
): StrategyMetrics {
  const taskLower = input.task.toLowerCase();

  // Base success probability
  let successProbability = 0.6;

  // Boost for matching skills
  for (const skill of input.skills) {
    if (skill.status !== 'active' && skill.status !== 'draft') continue;
    const nameWords = skill.name.toLowerCase().split(/[\s_-]+/).filter((w) => w.length > 3);
    const matches = nameWords.some((w) => taskLower.includes(w));
    if (matches) {
      successProbability = Math.min(successProbability + 0.1, 0.95);
    }
  }

  // Reduce for matching anti-patterns
  for (const ap of input.antiPatterns) {
    if (ap.status !== 'active' && ap.status !== 'draft') continue;
    const triggerWords = ap.trigger_pattern.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const matches = triggerWords.some((w) => taskLower.includes(w));
    if (matches) {
      successProbability = Math.max(successProbability - 0.1, 0.1);
    }
  }

  // Time estimate
  const timeMultiplier = strategy.name.toLowerCase().includes('research') ? 1.5 : 1.0;
  const expectedTimeMs = 300_000 * strategy.steps.length * timeMultiplier;

  // Risk factor: proportion of steps with risk factors
  const stepsWithRisk = strategy.steps.filter((s) => s.riskFactors.length > 0).length;
  const riskFactor = strategy.steps.length > 0 ? stepsWithRisk / strategy.steps.length : 0;

  // Prerequisite satisfaction
  let prerequisiteSatisfaction = 1.0;
  if (input.constraints.length > 0) {
    const stepText = strategy.steps.map((s) => s.description).join(' ').toLowerCase();
    const addressed = input.constraints.filter((c) => {
      const words = c.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      return words.some((w) => stepText.includes(w));
    });
    prerequisiteSatisfaction = addressed.length / input.constraints.length;
  }

  const metrics: StrategyMetrics = {
    successProbability,
    expectedTimeMs,
    riskFactor,
    prerequisiteSatisfaction,
    overallScore: 0,
  };

  metrics.overallScore = calculateStrategyScore(metrics);

  return metrics;
}

/**
 * Generate N candidate strategies for a task.
 *
 * Always generates at least 3 base strategies (Direct, Incremental, Research-First).
 * Adds bonus strategies when skills or anti-patterns match the task.
 */
export function generateStrategies(input: SimulationInput): Strategy[] {
  const numBase = input.numStrategies ?? 3;
  const taskLower = input.task.toLowerCase();

  const templates: Array<{ name: string; description: string; steps: StrategyStep[] }> = [
    {
      name: 'Direct Approach',
      description: `Execute ${input.task} directly with minimal preparation`,
      steps: [
        { description: 'Analyze requirements', expectedOutcome: 'Clear understanding of scope', riskFactors: [] },
        { description: 'Implement solution', expectedOutcome: 'Working implementation', riskFactors: ['may miss edge cases'] },
        { description: 'Validate results', expectedOutcome: 'Verified output', riskFactors: [] },
      ],
    },
    {
      name: 'Incremental Approach',
      description: `Break ${input.task} into small steps and implement incrementally`,
      steps: [
        { description: 'Define subtasks', expectedOutcome: 'Task breakdown', riskFactors: [] },
        { description: 'Implement first subtask', expectedOutcome: 'Partial implementation', riskFactors: [] },
        { description: 'Implement remaining subtasks', expectedOutcome: 'Complete implementation', riskFactors: [] },
        { description: 'Integration testing', expectedOutcome: 'All parts working together', riskFactors: ['integration issues'] },
      ],
    },
    {
      name: 'Research-First Approach',
      description: `Research thoroughly before implementing ${input.task}`,
      steps: [
        { description: 'Research existing solutions', expectedOutcome: 'Survey of approaches', riskFactors: [] },
        { description: 'Evaluate trade-offs', expectedOutcome: 'Decision on approach', riskFactors: [] },
        { description: 'Create detailed plan', expectedOutcome: 'Step-by-step plan', riskFactors: [] },
        { description: 'Implement chosen approach', expectedOutcome: 'Working implementation', riskFactors: [] },
        { description: 'Validate against research', expectedOutcome: 'Verified correctness', riskFactors: [] },
      ],
    },
  ];

  // Add skill-based strategy if skills match
  const matchingSkills = input.skills.filter((s) => {
    const words = s.name.toLowerCase().split(/[\s_-]+/).filter((w) => w.length > 3);
    return words.some((w) => taskLower.includes(w));
  });

  if (matchingSkills.length > 0) {
    const skill = matchingSkills[0];
    templates.push({
      name: 'Skill-Based Approach',
      description: `Apply known skill "${skill.name}" to ${input.task}`,
      steps: skill.steps.map((step) => ({
        description: step.description,
        expectedOutcome: 'Step completed per skill template',
        riskFactors: [],
      })),
    });
  }

  // Add safe strategy if anti-patterns match
  const matchingAPs = input.antiPatterns.filter((ap) => {
    const words = ap.trigger_pattern.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return words.some((w) => taskLower.includes(w));
  });

  if (matchingAPs.length > 0) {
    templates.push({
      name: 'Safe Approach',
      description: `Implement ${input.task} while avoiding known pitfalls`,
      steps: [
        { description: 'Review known anti-patterns', expectedOutcome: 'Pitfalls identified', riskFactors: [] },
        ...matchingAPs.map((ap) => ({
          description: `Guard against: ${ap.failure_mode}`,
          expectedOutcome: `${ap.correct_approach}`,
          riskFactors: [ap.trigger_pattern],
        })),
        { description: 'Implement with safeguards', expectedOutcome: 'Safe implementation', riskFactors: [] },
        { description: 'Verify against anti-patterns', expectedOutcome: 'No known pitfalls triggered', riskFactors: [] },
      ],
    });
  }

  // Build strategies up to requested count
  const strategies: Strategy[] = [];
  const count = Math.min(numBase + (matchingSkills.length > 0 ? 1 : 0) + (matchingAPs.length > 0 ? 1 : 0), templates.length);

  for (let i = 0; i < count; i++) {
    const template = templates[i];
    const strategy: Strategy = {
      id: generateId(),
      name: template.name,
      description: template.description,
      steps: template.steps,
      metrics: { successProbability: 0, expectedTimeMs: 0, riskFactor: 0, prerequisiteSatisfaction: 0, overallScore: 0 },
    };

    strategy.metrics = simulateStrategy(strategy, input);
    strategies.push(strategy);
  }

  return strategies;
}

/**
 * Evaluate a set of strategies and produce a recommendation.
 */
export function evaluateStrategies(strategies: Strategy[]): SimulationResult {
  if (strategies.length === 0) {
    throw new Error('Cannot evaluate empty strategy list');
  }

  // Sort by overall score descending
  const sorted = [...strategies].sort((a, b) => b.metrics.overallScore - a.metrics.overallScore);
  const recommended = sorted[0];

  const needsMoreResearch = recommended.metrics.overallScore < 0.5;
  const isDecisionPoint = sorted.length >= 2
    && (sorted[0].metrics.overallScore - sorted[1].metrics.overallScore) > 0.3;

  let reasoning = `Recommended "${recommended.name}" with score ${recommended.metrics.overallScore.toFixed(3)}.`;
  if (needsMoreResearch) {
    reasoning += ' Score is below 0.5 — consider gathering more information before proceeding.';
  }
  if (isDecisionPoint) {
    reasoning += ` Significant gap (>${(sorted[0].metrics.overallScore - sorted[1].metrics.overallScore).toFixed(2)}) between top strategies — clear winner.`;
  }

  return {
    strategies: sorted,
    recommended,
    needsMoreResearch,
    isDecisionPoint,
    reasoning,
  };
}

/**
 * Record a strategy outcome for future learning.
 */
export function recordOutcome(outcome: StrategyOutcome): void {
  outcomes.push(outcome);
}

/**
 * Get all recorded outcomes (for testing/inspection).
 */
export function getOutcomes(): StrategyOutcome[] {
  return [...outcomes];
}
