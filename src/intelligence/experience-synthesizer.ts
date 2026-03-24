/**
 * Experience Synthesizer
 *
 * Generates hypothetical task scenarios from existing memories and
 * simulates outcomes to pre-train the learning system.
 *
 * Process:
 * 1. Identify Gaps — areas with few memories but high task frequency
 * 2. Generate Scenarios — plausible success/failure variants
 * 3. Tag — synthetic memories tagged with source: 'synthetic'
 * 4. Validate — compare synthetic predictions against real outcomes
 *
 * Constraints:
 * - Synthetic memories never achieve 'approved' status
 * - Always clearly tagged
 * - Excluded from skill synthesis clusters
 * - Included in anti-pattern advisory checks
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export interface MemoryDensityEntry {
  domain: string;
  memoryCount: number;
  changeFrequency: number;
}

export interface KnowledgeGap {
  domain: string;
  memoryCount: number;
  changeFrequency: number;
  gapScore: number; // Higher = bigger gap
}

export interface SyntheticScenario {
  id: string;
  domain: string;
  title: string;
  content: string;
  variant: 'success' | 'failure';
  basedOnPattern: string;
  confidence: number;
  tags: string[];
  source: 'synthetic';
}

export interface ValidationResult {
  scenarioId: string;
  predicted: 'success' | 'failure';
  actual: 'success' | 'failure' | 'unknown';
  confidenceAdjustment: number;
  validated: boolean;
}

export interface SynthesisResult {
  gaps: KnowledgeGap[];
  scenarios: SyntheticScenario[];
  gapsIdentified: number;
  scenariosGenerated: number;
}

// ===========================================================================
// Constants
// ===========================================================================

const SYNTHETIC_CONFIDENCE = 0.5;
const SYNTHETIC_CONFIDENCE_MULTIPLIER = 0.7;
const VALIDATION_BOOST = 0.15;
const VALIDATION_PENALTY = -0.1;
const MIN_GAP_SCORE = 0.3;

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Identify knowledge gaps by comparing memory density against change frequency.
 *
 * A gap exists when a domain has high change frequency but low memory count.
 */
export function identifyGaps(
  densityEntries: MemoryDensityEntry[],
): KnowledgeGap[] {
  if (densityEntries.length === 0) return [];

  // Normalize change frequency to 0-1 range
  const maxFreq = Math.max(...densityEntries.map((e) => e.changeFrequency));
  const maxCount = Math.max(...densityEntries.map((e) => e.memoryCount), 1);

  const gaps: KnowledgeGap[] = [];

  for (const entry of densityEntries) {
    const normalizedFreq = maxFreq > 0 ? entry.changeFrequency / maxFreq : 0;
    const normalizedDensity = entry.memoryCount / maxCount;

    // Gap score: high frequency + low density = big gap
    const gapScore = normalizedFreq * (1 - normalizedDensity);

    if (gapScore >= MIN_GAP_SCORE) {
      gaps.push({
        domain: entry.domain,
        memoryCount: entry.memoryCount,
        changeFrequency: entry.changeFrequency,
        gapScore,
      });
    }
  }

  // Sort by gap score descending
  gaps.sort((a, b) => b.gapScore - a.gapScore);

  return gaps;
}

/**
 * Generate synthetic scenarios for a knowledge gap.
 *
 * Creates both success and failure variants based on known patterns
 * from other domains.
 */
export function generateScenarios(
  gap: KnowledgeGap,
  knownPatterns: string[],
): SyntheticScenario[] {
  const scenarios: SyntheticScenario[] = [];

  // Generate failure scenario from each known pattern
  for (const pattern of knownPatterns) {
    const failureId = generateId();
    scenarios.push({
      id: failureId,
      domain: gap.domain,
      title: `[Synthetic] Potential failure in ${gap.domain}: ${pattern}`,
      content: `Hypothetical failure scenario for ${gap.domain} based on pattern: ${pattern}. This is a synthetic experience generated from known anti-patterns in other domains.`,
      variant: 'failure',
      basedOnPattern: pattern,
      confidence: SYNTHETIC_CONFIDENCE * SYNTHETIC_CONFIDENCE_MULTIPLIER,
      tags: ['synthetic', gap.domain, 'failure'],
      source: 'synthetic',
    });

    // Generate corresponding success scenario
    const successId = generateId();
    scenarios.push({
      id: successId,
      domain: gap.domain,
      title: `[Synthetic] Successful approach for ${gap.domain}: avoiding ${pattern}`,
      content: `Hypothetical success scenario for ${gap.domain} where the pattern "${pattern}" is proactively avoided. This is a synthetic experience.`,
      variant: 'success',
      basedOnPattern: pattern,
      confidence: SYNTHETIC_CONFIDENCE * SYNTHETIC_CONFIDENCE_MULTIPLIER,
      tags: ['synthetic', gap.domain, 'success'],
      source: 'synthetic',
    });
  }

  return scenarios;
}

/**
 * Validate a synthetic scenario against real outcomes.
 *
 * Adjusts confidence based on whether the prediction matched reality.
 */
export function validateScenario(
  scenario: SyntheticScenario,
  actualOutcome: 'success' | 'failure' | 'unknown',
): ValidationResult {
  if (actualOutcome === 'unknown') {
    return {
      scenarioId: scenario.id,
      predicted: scenario.variant,
      actual: actualOutcome,
      confidenceAdjustment: 0,
      validated: false,
    };
  }

  const predictionCorrect = scenario.variant === actualOutcome;

  return {
    scenarioId: scenario.id,
    predicted: scenario.variant,
    actual: actualOutcome,
    confidenceAdjustment: predictionCorrect ? VALIDATION_BOOST : VALIDATION_PENALTY,
    validated: true,
  };
}

/**
 * Apply a validation result to update a scenario's confidence.
 */
export function applyValidation(
  scenario: SyntheticScenario,
  validation: ValidationResult,
): SyntheticScenario {
  const newConfidence = Math.max(
    0.1,
    Math.min(0.9, scenario.confidence + validation.confidenceAdjustment),
  );

  return {
    ...scenario,
    confidence: newConfidence,
  };
}

/**
 * Run the full synthesis pipeline.
 *
 * Identifies gaps, generates scenarios for top gaps.
 */
export function synthesize(
  densityEntries: MemoryDensityEntry[],
  knownPatterns: string[],
  maxGaps: number = 5,
): SynthesisResult {
  const gaps = identifyGaps(densityEntries);
  const topGaps = gaps.slice(0, maxGaps);

  const allScenarios: SyntheticScenario[] = [];

  for (const gap of topGaps) {
    const scenarios = generateScenarios(gap, knownPatterns);
    allScenarios.push(...scenarios);
  }

  return {
    gaps: topGaps,
    scenarios: allScenarios,
    gapsIdentified: gaps.length,
    scenariosGenerated: allScenarios.length,
  };
}

/**
 * Check if a memory is synthetic.
 */
export function isSynthetic(tags: string[]): boolean {
  return tags.includes('synthetic');
}

/**
 * Apply the synthetic confidence multiplier.
 */
export function applySyntheticMultiplier(confidence: number): number {
  return confidence * SYNTHETIC_CONFIDENCE_MULTIPLIER;
}
