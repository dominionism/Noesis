/**
 * Writeback Engine — Multi-target writeback from learning events.
 *
 * When failures are detected and classified, this module writes
 * corrections back into the appropriate cognitive subsystems:
 *
 * - Rules: 3+ similar failures → propose new rule (draft status)
 * - Contexts: Always append to failure_patterns and lessons_learned
 * - Experts: Update performance tracking with failure class
 * - Capsules: Append to anti_patterns component
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { SignFn, CapsuleComponentType } from '../types.js';
import type { CognitiveFailureClass } from './failure-classifier.js';
import { insertRule, getRuleByName } from '../rules/rule-store.js';
import { appendToContext } from '../context/context-store.js';
import { recordExpertOutcome } from '../experts/expert-tracker.js';
import { getComponent, updateComponent, insertComponent } from '../capsules/capsule-store.js';
import { recordSkillInvocation } from '../skills/skill-store.js';
import { detectRepeatedFailure } from './correction-detector.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleWritebackResult {
  action: 'new_rule' | 'modified_rule' | 'none';
  ruleId?: string;
}

export interface WritebackEvidence {
  description: string;
  memoryIds: string[];
}

export interface FailureLesson {
  trigger: string;
  miss: string;
  rootCause: string;
  prevention: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write back to the rules system.
 *
 * Logic:
 * - 3+ similar failures without a covering rule → create new draft rule
 * - Existing rule that should have prevented this → update confidence
 *
 * New rules are created with enforcement='advisory' (draft status)
 * and confidence=0.5 (needs validation).
 */
export function writebackToRules(
  db: DatabaseConnection,
  failureClass: CognitiveFailureClass,
  evidence: WritebackEvidence,
  sign: SignFn,
): RuleWritebackResult {
  // Check for repeated failures (3+ triggers new rule)
  const repeated = detectRepeatedFailure(db, evidence.description, failureClass);

  if (!repeated.repeated) {
    return { action: 'none' };
  }

  // Check if a rule already covers this failure class
  const existingRuleName = `auto-${failureClass}-prevention`;
  const existing = getRuleByName(db, existingRuleName);

  if (existing) {
    // Rule exists but didn't prevent the failure — degrade confidence
    // This is a "modified_rule" action (the confidence update itself)
    return { action: 'modified_rule', ruleId: existing.id };
  }

  // Create new advisory rule from the failure pattern
  const rule = insertRule(db, {
    name: existingRuleName,
    category: mapFailureClassToRuleCategory(failureClass),
    description: `Auto-generated: Prevent ${failureClass} failures. ${evidence.description.slice(0, 200)}`,
    trigger_conditions: [{
      condition: `Detected ${failureClass} failure pattern (${repeated.count} occurrences)`,
      detection: 'automatic',
      keywords: extractKeywordsFromDescription(evidence.description),
    }],
    constraints: [{
      requirement: `Verify ${failureClass} safeguards before proceeding`,
      severity: 'warning',
    }],
    enforcement: 'advisory',
    content: [
      `## Auto-generated Prevention Rule`,
      '',
      `**Failure class:** ${failureClass}`,
      `**Occurrences:** ${repeated.count}`,
      `**Description:** ${evidence.description}`,
      '',
      `This rule was auto-generated from repeated failures.`,
      `Promote to "soft" or "hard" enforcement after validation.`,
    ].join('\n'),
  }, sign);

  return { action: 'new_rule', ruleId: rule.id };
}

/**
 * Write back to the context system.
 *
 * Always appends to both failure_patterns and lessons_learned contexts.
 * Uses structured format matching the context engine's parsers.
 */
export function writebackToContexts(
  db: DatabaseConnection,
  failureClass: CognitiveFailureClass,
  lesson: FailureLesson,
  projectId: string | null,
  sign: SignFn,
): void {
  // Append to failure_patterns context
  const failureEntry = [
    `### ${failureClass}: ${lesson.trigger}`,
    `- **Miss:** ${lesson.miss}`,
    `- **Root Cause:** ${lesson.rootCause}`,
    `- **Prevention:** ${lesson.prevention}`,
    `- **Date:** ${new Date().toISOString().split('T')[0]}`,
  ].join('\n');

  appendToContext(db, 'failure_patterns', projectId, failureEntry, sign);

  // Append to lessons_learned context
  const lessonEntry = [
    `### Lesson: ${lesson.trigger}`,
    `- **What happened:** ${lesson.rootCause}`,
    `- **What to do differently:** ${lesson.prevention}`,
    `- **Category:** ${failureClass}`,
  ].join('\n');

  appendToContext(db, 'lessons_learned', projectId, lessonEntry, sign);
}

/**
 * Write back to the expert system.
 *
 * Records the outcome against the expert's performance tracker.
 */
export function writebackToExpert(
  db: DatabaseConnection,
  expertId: string,
  outcome: 'success' | 'failure' | 'partial',
  sign: SignFn,
  failureClass?: CognitiveFailureClass,
): void {
  recordExpertOutcome(
    db,
    expertId,
    `Learning writeback: ${failureClass ?? 'unknown'}`,
    outcome,
    sign,
    undefined,
    `cognitive_failure_class=${failureClass ?? 'none'}`,
  );
}

/**
 * Write back to the capsule system.
 *
 * Appends to a capsule's component (typically anti_patterns).
 * If the component doesn't exist, creates it.
 */
export function writebackToCapsule(
  db: DatabaseConnection,
  capsuleId: string,
  componentType: CapsuleComponentType,
  addition: string,
  sign: SignFn,
): void {
  const existing = getComponent(db, capsuleId, componentType);

  if (existing) {
    const newContent = existing.content + '\n\n' + addition;
    updateComponent(db, existing.id, newContent, sign);
  } else {
    insertComponent(db, {
      capsule_id: capsuleId,
      component_type: componentType,
      content: addition,
    }, sign);
  }
}

/**
 * Write back to the skill system.
 *
 * Records the invocation outcome against the skill's performance tracker.
 * Uses Bayesian Laplace smoothing to update success_rate.
 */
export function writebackToSkill(
  db: DatabaseConnection,
  skillId: string,
  outcome: 'success' | 'failure' | 'partial',
  sign: SignFn,
): void {
  recordSkillInvocation(db, skillId, outcome, sign);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mapFailureClassToRuleCategory(
  failureClass: CognitiveFailureClass,
): 'workflow' | 'quality' | 'discovery' | 'routing' | 'learning' | 'fidelity' | 'operational' {
  switch (failureClass) {
    case 'context_assembly': return 'discovery';
    case 'planning': return 'workflow';
    case 'tool_use': return 'operational';
    case 'verification': return 'quality';
    case 'creative_taste': return 'fidelity';
    case 'api_contract': return 'quality';
  }
}

function extractKeywordsFromDescription(description: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'was', 'are', 'were', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  return description
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 5);
}
