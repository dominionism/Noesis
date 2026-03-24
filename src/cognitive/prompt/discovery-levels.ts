/**
 * Discovery Levels — Adaptive research depth assessment.
 *
 * Level 0: Pattern extension — similar past tasks with high confidence
 * Level 1: Quick verification — approach known, details needed
 * Level 2: Standard research — multiple options, new integration
 * Level 3: Architectural — long-term design, cross-provider, shared abstractions
 */

import type { DiscoveryLevel, DiscoveryAssessment } from '../types.js';
import type { PromptShape, Memory } from '../../types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assess the appropriate discovery level for a task.
 *
 * Uses memory evidence and task characteristics to determine how
 * much research is needed before implementation.
 */
export function assessDiscoveryLevel(
  promptShape: PromptShape,
  memories: Memory[],
  codebaseExplored: boolean,
): DiscoveryAssessment {
  const highConfMemories = memories.filter(m => m.confidence >= 0.7);
  const successMemories = highConfMemories.filter(m => m.outcome === 'success');
  const taskComplexity = estimateComplexity(promptShape);

  // Level 0: Strong memory evidence, simple task
  if (successMemories.length >= 2 && taskComplexity <= 1) {
    return {
      level: 0,
      rationale: `${successMemories.length} high-confidence success memories found for similar tasks. Pattern extension sufficient.`,
      expected_artifacts: ['Implementation following established pattern'],
      estimated_scope: 'narrow',
    };
  }

  // Level 1: Some evidence, moderate task
  if (highConfMemories.length >= 1 && taskComplexity <= 2 && codebaseExplored) {
    return {
      level: 1,
      rationale: 'Approach known from memory and codebase exploration. Quick verification of specific details needed.',
      expected_artifacts: ['Verified approach', 'Implementation'],
      estimated_scope: 'narrow',
    };
  }

  // Level 3: High complexity or architectural
  if (taskComplexity >= 4 || isArchitectural(promptShape)) {
    return {
      level: 3,
      rationale: 'Architectural task requiring deep research across multiple subsystems and long-term design consideration.',
      expected_artifacts: [
        'Architecture analysis',
        'Trade-off evaluation',
        'Implementation plan with phases',
        'Verification strategy',
      ],
      estimated_scope: 'broad',
    };
  }

  // Level 2: Default for moderate complexity
  return {
    level: 2,
    rationale: 'Multiple options or new integration. Standard research needed to evaluate approaches.',
    expected_artifacts: [
      'Research findings',
      'Approach comparison',
      'Implementation plan',
    ],
    estimated_scope: 'moderate',
  };
}

/**
 * Format discovery level guidance as markdown.
 */
export function formatDiscoveryGuidance(assessment: DiscoveryAssessment): string {
  const levelNames: Record<DiscoveryLevel, string> = {
    0: 'Pattern Extension',
    1: 'Quick Verification',
    2: 'Standard Research',
    3: 'Architectural Research',
  };

  const lines: string[] = [
    `### Discovery Level: ${assessment.level} — ${levelNames[assessment.level]}`,
    `**Rationale:** ${assessment.rationale}`,
    `**Scope:** ${assessment.estimated_scope}`,
  ];

  if (assessment.expected_artifacts.length > 0) {
    lines.push('**Expected Artifacts:**');
    for (const artifact of assessment.expected_artifacts) {
      lines.push(`- ${artifact}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get the guidance text for a specific discovery level.
 */
export function getDiscoveryLevelGuidance(level: DiscoveryLevel): string {
  const guidance: Record<DiscoveryLevel, string> = {
    0: 'Similar past tasks found with high-confidence outcomes. Extend the established pattern. Minimal research needed — verify the pattern still applies, then implement.',
    1: 'Approach is known but specific details need verification. Quick check of relevant code/docs, then proceed with known approach.',
    2: 'Multiple viable options or new integration required. Research each approach, evaluate trade-offs, present options before implementing.',
    3: 'Architectural scope requiring deep analysis. Map dependencies across subsystems, evaluate long-term implications, design for extensibility.',
  };

  return guidance[level];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function estimateComplexity(shape: PromptShape): number {
  let complexity = 0;
  const combined = `${shape.goal} ${shape.context} ${shape.deliverable}`.toLowerCase();

  // Length-based complexity
  if (combined.length > 500) complexity++;
  if (combined.length > 1000) complexity++;

  // Multi-step indicators
  const multiStepPatterns = [
    /\band\s+then\b/, /\bafter\s+that\b/, /\bfirst.*then\b/,
    /\bmultiple\b/, /\bseveral\b/, /\bacross\b/,
  ];
  for (const p of multiStepPatterns) {
    if (p.test(combined)) complexity++;
  }

  // Architecture indicators
  const archPatterns = [
    /\barchitect/i, /\bredesign/i, /\bmigrat/i, /\bintegrat/i,
    /\brefactor/i, /\bscalabil/i, /\bcross.?cutting/i,
  ];
  for (const p of archPatterns) {
    if (p.test(combined)) complexity++;
  }

  // Constraint complexity
  complexity += Math.min(shape.constraints.length, 3);

  return complexity;
}

function isArchitectural(shape: PromptShape): boolean {
  const combined = `${shape.goal} ${shape.context} ${shape.deliverable}`.toLowerCase();
  const archSignals = [
    /\barchitect/i, /\bsystem\s+design/i, /\bcross.?service/i,
    /\bmicroservice/i, /\blong.?term/i, /\bshared\s+abstraction/i,
    /\bcross.?provider/i, /\bplatform\s+level/i,
  ];

  let hits = 0;
  for (const p of archSignals) {
    if (p.test(combined)) hits++;
  }
  return hits >= 2;
}
