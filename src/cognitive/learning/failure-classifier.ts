/**
 * Failure Classifier — Classify failures into cognitive failure classes.
 *
 * Six cognitive-level failure classes distinct from the base FailureClass
 * type (which covers code-level failures). These classes map to specific
 * writeback targets:
 *
 * - context_assembly → writeback to contexts
 * - planning → writeback to rules + contexts
 * - tool_use → writeback to skills
 * - verification → writeback to gates + contexts
 * - creative_taste → writeback to user_taste context
 * - api_contract → writeback to capsules + contexts
 */

import type { ReasoningPhase } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CognitiveFailureClass =
  | 'context_assembly'
  | 'planning'
  | 'tool_use'
  | 'verification'
  | 'creative_taste'
  | 'api_contract';

export interface FailureClassificationContext {
  phase: ReasoningPhase;
  hadReadiness: boolean;
  hadExpert: boolean;
  hadCapsule: boolean;
  hadRules: boolean;
}

export interface FailureClassification {
  failureClass: CognitiveFailureClass;
  confidence: number;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Classification patterns
// ---------------------------------------------------------------------------

interface ClassificationPattern {
  failureClass: CognitiveFailureClass;
  keywords: RegExp[];
  phaseHints: ReasoningPhase[];
  contextSignals: (ctx: FailureClassificationContext) => boolean;
  baseConfidence: number;
}

const CLASSIFICATION_PATTERNS: ClassificationPattern[] = [
  {
    failureClass: 'context_assembly',
    keywords: [
      /\bmissing\s+context\b/i,
      /\bdidn'?t\s+(?:load|include|consider)\b/i,
      /\bforgot\b/i,
      /\bignored\b/i,
      /\brelevant\s+(?:info|information|context)\b/i,
      /\bnot\s+aware\b/i,
    ],
    phaseHints: ['recall', 'understand'],
    contextSignals: () => false,
    baseConfidence: 0.7,
  },
  {
    failureClass: 'planning',
    keywords: [
      /\bplan\b/i,
      /\bstrategy\b/i,
      /\bapproach\b/i,
      /\bincomplete\b/i,
      /\bwrong\s+(?:order|sequence|approach)\b/i,
      /\bmissed\s+step/i,
      /\boverlooked\b/i,
    ],
    phaseHints: ['plan', 'assess'],
    contextSignals: ctx => !ctx.hadReadiness,
    baseConfidence: 0.6,
  },
  {
    failureClass: 'tool_use',
    keywords: [
      /\btool\b/i,
      /\bcommand\b/i,
      /\bwrong\s+(?:tool|command|function)\b/i,
      /\bshould\s+(?:have\s+)?used\b/i,
      /\bmisuse[d]?\b/i,
      /\bincorrect\s+(?:usage|invocation)\b/i,
    ],
    phaseHints: ['execute'],
    contextSignals: () => false,
    baseConfidence: 0.65,
  },
  {
    failureClass: 'verification',
    keywords: [
      /\btest\b/i,
      /\bverif(?:y|ication)\b/i,
      /\buntested\b/i,
      /\bdidn'?t\s+(?:test|check|verify)\b/i,
      /\bregression\b/i,
      /\bbroke\b/i,
      /\bfailing\s+test/i,
    ],
    phaseHints: ['verify'],
    contextSignals: ctx => !ctx.hadReadiness,
    baseConfidence: 0.7,
  },
  {
    failureClass: 'creative_taste',
    keywords: [
      /\btaste\b/i,
      /\bstyle\b/i,
      /\bprefer\b/i,
      /\bdesign\b/i,
      /\blook\b/i,
      /\bfeel\b/i,
      /\bui\b/i,
      /\bux\b/i,
      /\bnot\s+what\s+I\s+(?:wanted|asked|meant)\b/i,
      /\bugly\b/i,
    ],
    phaseHints: ['execute'],
    contextSignals: ctx => ctx.hadCapsule,
    baseConfidence: 0.55,
  },
  {
    failureClass: 'api_contract',
    keywords: [
      /\bapi\b/i,
      /\bcontract\b/i,
      /\bendpoint\b/i,
      /\bschema\b/i,
      /\bresponse\s+(?:format|shape|structure)\b/i,
      /\brequest\s+(?:format|shape|body)\b/i,
      /\bbreaking\s+change\b/i,
    ],
    phaseHints: ['execute', 'verify'],
    contextSignals: ctx => ctx.hadCapsule,
    baseConfidence: 0.6,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a failure description into a cognitive failure class.
 *
 * Scoring:
 * - Base confidence from best-matching pattern
 * - +0.1 if the failure phase matches pattern hints
 * - +0.1 if context signals match (e.g., no readiness check for planning failures)
 * - +0.05 per additional keyword match (up to 0.15)
 *
 * Falls back to 'context_assembly' at low confidence if no patterns match.
 */
export function classifyFailure(
  description: string,
  context: FailureClassificationContext,
): FailureClassification {
  const scores: { failureClass: CognitiveFailureClass; confidence: number; rationale: string }[] = [];

  for (const pattern of CLASSIFICATION_PATTERNS) {
    const keywordMatches = pattern.keywords.filter(k => k.test(description));
    if (keywordMatches.length === 0) continue;

    let confidence = pattern.baseConfidence;
    const reasons: string[] = [`${keywordMatches.length} keyword match(es)`];

    // Phase alignment boost
    if (pattern.phaseHints.includes(context.phase)) {
      confidence += 0.1;
      reasons.push(`phase ${context.phase} aligns`);
    }

    // Context signal boost
    if (pattern.contextSignals(context)) {
      confidence += 0.1;
      reasons.push('context signals present');
    }

    // Additional keyword matches boost (diminishing)
    const extraKeywords = Math.min(keywordMatches.length - 1, 3);
    confidence += extraKeywords * 0.05;

    scores.push({
      failureClass: pattern.failureClass,
      confidence: Math.min(confidence, 1.0),
      rationale: reasons.join('; '),
    });
  }

  // Sort by confidence descending
  scores.sort((a, b) => b.confidence - a.confidence);

  if (scores.length > 0) {
    return scores[0];
  }

  // Fallback: classify as context_assembly with low confidence
  return {
    failureClass: 'context_assembly',
    confidence: 0.3,
    rationale: 'No strong pattern match; defaulting to context_assembly',
  };
}

/**
 * Get all cognitive failure classes.
 */
export function getCognitiveFailureClasses(): CognitiveFailureClass[] {
  return [
    'context_assembly',
    'planning',
    'tool_use',
    'verification',
    'creative_taste',
    'api_contract',
  ];
}

/**
 * Map a cognitive failure class to its primary writeback targets.
 */
export function getWritebackTargets(
  failureClass: CognitiveFailureClass,
): ('rules' | 'contexts' | 'experts' | 'capsules' | 'skills')[] {
  switch (failureClass) {
    case 'context_assembly':
      return ['contexts'];
    case 'planning':
      return ['rules', 'contexts'];
    case 'tool_use':
      return ['skills', 'contexts'];
    case 'verification':
      return ['contexts'];
    case 'creative_taste':
      return ['contexts'];
    case 'api_contract':
      return ['capsules', 'contexts'];
  }
}
