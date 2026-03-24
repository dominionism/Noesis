/**
 * Temporal Modeler
 *
 * Models temporal relevance of knowledge beyond simple recency decay.
 * Different knowledge types have different value curves.
 *
 * 5 Temporal Models:
 * 1. Linear Decay — relevance decreases linearly with age
 * 2. Step Decay — discrete relevance steps at time boundaries
 * 3. Event-Triggered Refresh — resets to 1.0 on relevant events
 * 4. Cyclical Relevance — periodic relevance based on cycle position
 * 5. Context-Dependent — full relevance when context matches
 */

import type { MemoryType } from '../types.js';

// ===========================================================================
// Types
// ===========================================================================

export type TemporalModel =
  | 'linear_decay'
  | 'step_decay'
  | 'event_triggered'
  | 'cyclical'
  | 'context_dependent'
  | 'flat';

export interface TemporalConfig {
  model: TemporalModel;
  maxAgeDays?: number;
  steps?: Array<{ days: number; relevance: number }>;
  cycleLengthDays?: number;
  baseRelevance?: number;
  amplitude?: number;
}

export interface TemporalContext {
  currentProjectId?: string;
  memoryProjectId?: string | null;
  recentEventTypes?: string[];
  memoryType?: MemoryType;
  currentDayOfYear?: number;
}

// ===========================================================================
// Default model assignments per memory type
// ===========================================================================

const DEFAULT_MODEL_ASSIGNMENTS: Record<MemoryType, TemporalConfig> = {
  task: {
    model: 'step_decay',
    steps: [
      { days: 7, relevance: 1.0 },
      { days: 30, relevance: 0.9 },
      { days: 90, relevance: 0.8 },
      { days: 365, relevance: 0.7 },
    ],
    baseRelevance: 0.5,
  },
  lesson: {
    model: 'event_triggered',
    steps: [
      { days: 7, relevance: 1.0 },
      { days: 30, relevance: 0.9 },
      { days: 90, relevance: 0.8 },
      { days: 365, relevance: 0.7 },
    ],
    baseRelevance: 0.5,
  },
  skill: {
    model: 'step_decay',
    steps: [
      { days: 7, relevance: 1.0 },
      { days: 30, relevance: 0.9 },
      { days: 90, relevance: 0.8 },
      { days: 365, relevance: 0.7 },
    ],
    baseRelevance: 0.5,
  },
  incident: {
    model: 'event_triggered',
    steps: [
      { days: 7, relevance: 1.0 },
      { days: 30, relevance: 0.9 },
      { days: 90, relevance: 0.8 },
      { days: 365, relevance: 0.7 },
    ],
    baseRelevance: 0.5,
  },
  decision: {
    model: 'context_dependent',
    steps: [
      { days: 7, relevance: 1.0 },
      { days: 30, relevance: 0.9 },
      { days: 90, relevance: 0.8 },
      { days: 365, relevance: 0.7 },
    ],
    baseRelevance: 0.5,
  },
  preference: {
    model: 'flat',
    baseRelevance: 1.0,
  },
  checkpoint: {
    model: 'step_decay',
    steps: [
      { days: 7, relevance: 1.0 },
      { days: 14, relevance: 0.5 },
      { days: 30, relevance: 0.1 },
    ],
    baseRelevance: 0.05,
  },
  session: {
    model: 'step_decay',
    steps: [
      { days: 7, relevance: 1.0 },
      { days: 14, relevance: 0.5 },
      { days: 30, relevance: 0.1 },
    ],
    baseRelevance: 0.05,
  },
  verification: {
    model: 'context_dependent',
    steps: [
      { days: 7, relevance: 1.0 },
      { days: 30, relevance: 0.9 },
      { days: 90, relevance: 0.8 },
      { days: 365, relevance: 0.7 },
    ],
    baseRelevance: 0.5,
  },
};

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Get the temporal config for a memory type.
 */
export function getTemporalConfig(memoryType: MemoryType): TemporalConfig {
  return DEFAULT_MODEL_ASSIGNMENTS[memoryType];
}

/**
 * Get the assigned temporal model for a memory type.
 */
export function getAssignedModel(memoryType: MemoryType): TemporalModel {
  return DEFAULT_MODEL_ASSIGNMENTS[memoryType].model;
}

/**
 * Compute temporal relevance for a memory.
 */
export function computeRelevance(
  ageDays: number,
  config: TemporalConfig,
  context?: TemporalContext,
): number {
  switch (config.model) {
    case 'linear_decay':
      return linearDecay(ageDays, config.maxAgeDays ?? 365);

    case 'step_decay':
      return stepDecay(ageDays, config.steps ?? [], config.baseRelevance ?? 0.5);

    case 'event_triggered':
      return eventTriggeredRelevance(ageDays, config, context);

    case 'cyclical':
      return cyclicalRelevance(config, context);

    case 'context_dependent':
      return contextDependentRelevance(ageDays, config, context);

    case 'flat':
      return config.baseRelevance ?? 1.0;

    default:
      return stepDecay(ageDays, config.steps ?? [], config.baseRelevance ?? 0.5);
  }
}

/**
 * Compute temporal relevance for a memory by its type.
 */
export function computeRelevanceForType(
  memoryType: MemoryType,
  ageDays: number,
  context?: TemporalContext,
): number {
  const config = getTemporalConfig(memoryType);
  return computeRelevance(ageDays, config, context);
}

/**
 * Linear decay: relevance decreases linearly from 1.0 to 0.0.
 */
export function linearDecay(ageDays: number, maxAgeDays: number): number {
  if (ageDays <= 0) return 1.0;
  if (ageDays >= maxAgeDays) return 0.0;
  return 1.0 - ageDays / maxAgeDays;
}

/**
 * Step decay: relevance drops at defined thresholds.
 */
export function stepDecay(
  ageDays: number,
  steps: Array<{ days: number; relevance: number }>,
  fallback: number,
): number {
  if (steps.length === 0) return fallback;

  // Sort by days ascending
  const sorted = [...steps].sort((a, b) => a.days - b.days);

  // Find the applicable step
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (ageDays <= sorted[i].days) {
      continue;
    }
    // Age exceeds this step boundary
    if (i === sorted.length - 1) {
      return fallback;
    }
    return sorted[i + 1].relevance;
  }

  // Age is within the first step
  return sorted[0].relevance;
}

/**
 * Cyclical relevance: varies with cycle position.
 *
 * relevance = base + amplitude * cos(2pi * dayOfCycle / cycleLength)
 */
export function cyclicalRelevance(
  config: TemporalConfig,
  context?: TemporalContext,
): number {
  const cycleLength = config.cycleLengthDays ?? 14;
  const base = config.baseRelevance ?? 0.5;
  const amplitude = config.amplitude ?? 0.3;
  const dayOfCycle = (context?.currentDayOfYear ?? 0) % cycleLength;

  const relevance = base + amplitude * Math.cos(2 * Math.PI * dayOfCycle / cycleLength);
  return Math.max(0, Math.min(1, relevance));
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function eventTriggeredRelevance(
  ageDays: number,
  config: TemporalConfig,
  context?: TemporalContext,
): number {
  // If a relevant event occurred recently, refresh to 1.0
  if (context?.recentEventTypes && context.recentEventTypes.length > 0) {
    return 1.0;
  }

  // Otherwise, fall back to step decay
  return stepDecay(ageDays, config.steps ?? [], config.baseRelevance ?? 0.5);
}

function contextDependentRelevance(
  ageDays: number,
  config: TemporalConfig,
  context?: TemporalContext,
): number {
  // Full relevance if working in the same project
  if (
    context?.currentProjectId &&
    context.memoryProjectId &&
    context.currentProjectId === context.memoryProjectId
  ) {
    return 1.0;
  }

  // Otherwise, fall back to step decay
  return stepDecay(ageDays, config.steps ?? [], config.baseRelevance ?? 0.5);
}
