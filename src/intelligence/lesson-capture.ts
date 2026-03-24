/**
 * Loop 5: Evidence-Backed Lesson Capture
 *
 * Systematic lesson capture with evidence, failure classification,
 * and confidence levels. Integrates with the existing 4 learning loops.
 *
 * Trigger: User correction, critic rejection, eval failure, repeated misses
 * Process:
 *   1. Classify failure type (6 classes)
 *   2. Diagnose root cause with evidence
 *   3. Extract reusable rule
 *   4. Store as lesson memory with confidence level
 *   5. Create causal edges to originating task memories
 *   6. Update relevant skill/anti-pattern confidence
 *   7. If systemic, surface workflow improvement suggestion
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export type LessonFailureClass =
  | 'context_assembly'
  | 'planning'
  | 'tool_use'
  | 'verification'
  | 'creative'
  | 'api_contract';

export interface LessonTrigger {
  type: 'correction' | 'critic_rejection' | 'eval_failure' | 'repeated_miss';
  description: string;
  originatingTaskId?: string;
  evidence: string[];
  context: string;
}

export interface ClassifiedFailure {
  failureClass: LessonFailureClass;
  confidence: number;
  rootCause: string;
  evidence: string[];
  reusableRule: string;
}

export interface LessonOutput {
  lesson: {
    id: string;
    title: string;
    content: string;
    failureClass: LessonFailureClass;
    rootCause: string;
    reusableRule: string;
    confidence: number;
  };
  edges: Array<{ from: string; to: string; relation: string }>;
  isSystemic: boolean;
  improvementSuggestion?: string;
}

// ===========================================================================
// Classification keywords
// ===========================================================================

const CLASSIFICATION_KEYWORDS: Record<LessonFailureClass, string[]> = {
  context_assembly: ['wrong context', 'missing context', 'wrong file', "didn't load", 'not loaded', 'context missing', 'failed to load'],
  planning: ['incomplete plan', 'missing edge case', 'wrong approach', 'overlooked', 'forgot', 'missed step', 'bad plan'],
  tool_use: ['wrong tool', 'wrong parameter', 'wrong api', 'misunderstood', 'incorrect usage', 'wrong command', 'misused'],
  verification: ['test missed', 'wrong assertion', 'incomplete coverage', 'false positive', 'untested', 'test failed', 'missing test'],
  creative: ['generic', 'off-brand', 'too vague', 'not specific', 'bland', 'uninspired', 'cookie-cutter'],
  api_contract: ['schema mismatch', 'wrong endpoint', 'missing auth', 'wrong format', 'contract', 'api error', 'wrong status'],
};

// ===========================================================================
// Systemic improvement suggestions per class
// ===========================================================================

const SYSTEMIC_SUGGESTIONS: Record<LessonFailureClass, string> = {
  context_assembly: 'Review context loading pipeline. Consider adding pre-task context verification.',
  planning: 'Strengthen readiness gate requirements. Add edge case checklist to plan template.',
  tool_use: 'Add tool usage validation. Consider creating tool usage guides in capsules.',
  verification: 'Enhance verification engine coverage. Add verification step to all task completions.',
  creative: 'Update cognitive profile for creative preferences. Add specificity checks to critique.',
  api_contract: 'Add API contract testing to verification. Consider schema validation in pre-flight.',
};

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Classify the failure type from a lesson trigger.
 *
 * Matches keywords in the trigger description and evidence against
 * the 6 failure classes. Returns the best match with confidence.
 */
export function classifyFailure(trigger: LessonTrigger): ClassifiedFailure {
  const searchText = [
    trigger.description,
    ...trigger.evidence,
    trigger.context,
  ].join(' ').toLowerCase();

  let bestClass: LessonFailureClass = 'planning';
  let bestScore = 0;

  for (const [cls, keywords] of Object.entries(CLASSIFICATION_KEYWORDS) as Array<[LessonFailureClass, string[]]>) {
    let score = 0;
    for (const keyword of keywords) {
      if (searchText.includes(keyword)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestClass = cls;
    }
  }

  const confidence = bestScore === 0 ? 0.3 : Math.min(0.3 + bestScore * 0.2, 0.95);

  const rootCause = bestScore > 0
    ? `${bestClass.replace(/_/g, ' ')} failure: ${trigger.description}`
    : `Unclassified failure: ${trigger.description}`;

  const reusableRule = generateReusableRule(bestClass, trigger);

  return {
    failureClass: bestClass,
    confidence,
    rootCause,
    evidence: trigger.evidence,
    reusableRule,
  };
}

/**
 * Capture a lesson from a trigger event.
 *
 * Classifies the failure, generates structured lesson content,
 * creates graph edges, and checks for systemic patterns.
 */
export function captureLesson(trigger: LessonTrigger): LessonOutput {
  const classification = classifyFailure(trigger);
  const lessonId = generateId();

  const content = [
    `## Root Cause\n${classification.rootCause}`,
    `## Evidence\n${classification.evidence.map((e) => `- ${e}`).join('\n')}`,
    `## Reusable Rule\n${classification.reusableRule}`,
    `## Context\n${trigger.context}`,
  ].join('\n\n');

  const edges: LessonOutput['edges'] = [];
  if (trigger.originatingTaskId) {
    edges.push({
      from: lessonId,
      to: trigger.originatingTaskId,
      relation: 'corrects',
    });
  }

  const isSystemic = trigger.type === 'repeated_miss';

  const output: LessonOutput = {
    lesson: {
      id: lessonId,
      title: `Lesson: ${classification.rootCause.slice(0, 80)}`,
      content,
      failureClass: classification.failureClass,
      rootCause: classification.rootCause,
      reusableRule: classification.reusableRule,
      confidence: classification.confidence,
    },
    edges,
    isSystemic,
  };

  if (isSystemic) {
    output.improvementSuggestion = SYSTEMIC_SUGGESTIONS[classification.failureClass];
  }

  return output;
}

/**
 * Detect systemic patterns across multiple lessons.
 *
 * If 3+ lessons share the same failure class, it indicates a
 * systemic issue that needs workflow-level intervention.
 */
export function detectSystemicPattern(
  lessons: LessonOutput[],
): { isSystemic: boolean; pattern: string; suggestion: string } {
  const classCounts: Record<string, number> = {};

  for (const lesson of lessons) {
    const cls = lesson.lesson.failureClass;
    classCounts[cls] = (classCounts[cls] ?? 0) + 1;
  }

  let maxClass: LessonFailureClass = 'planning';
  let maxCount = 0;

  for (const [cls, count] of Object.entries(classCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxClass = cls as LessonFailureClass;
    }
  }

  if (maxCount >= 3) {
    return {
      isSystemic: true,
      pattern: `Recurring ${maxClass.replace(/_/g, ' ')} failures (${maxCount} instances)`,
      suggestion: SYSTEMIC_SUGGESTIONS[maxClass],
    };
  }

  return {
    isSystemic: false,
    pattern: 'No systemic pattern detected',
    suggestion: '',
  };
}

/**
 * Generate a hot memory mirror for a lesson.
 *
 * Returns the path and content for writing to ~/.agents/memory/.
 */
export function mirrorToHotMemory(
  lesson: LessonOutput,
): { path: string; content: string } {
  const content = [
    `# ${lesson.lesson.title}`,
    '',
    `**Class:** ${lesson.lesson.failureClass}`,
    `**Confidence:** ${lesson.lesson.confidence.toFixed(2)}`,
    '',
    `## Root Cause`,
    lesson.lesson.rootCause,
    '',
    `## Rule`,
    lesson.lesson.reusableRule,
  ].join('\n');

  return {
    path: `lessons/${lesson.lesson.failureClass}.md`,
    content,
  };
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function generateReusableRule(cls: LessonFailureClass, trigger: LessonTrigger): string {
  const rules: Record<LessonFailureClass, string> = {
    context_assembly: `Before starting work, verify that all required context is loaded and current.`,
    planning: `During planning, explicitly enumerate edge cases and verify assumptions against the codebase.`,
    tool_use: `Before using a tool or API, verify the correct parameters and expected behavior.`,
    verification: `After implementation, verify all artifacts exist, are substantive, and are properly wired.`,
    creative: `Ensure output is specific to the project context, not generic boilerplate.`,
    api_contract: `Validate API contracts (schemas, endpoints, auth) before and after integration.`,
  };

  return `${rules[cls]} (Triggered by: ${trigger.type})`;
}
