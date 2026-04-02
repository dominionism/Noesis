/**
 * Active Learning — Multi-target writeback orchestration.
 *
 * Top-level pipeline that processes a learning event and writes back
 * corrections to all relevant cognitive subsystems:
 *
 * 1. Capture lesson (delegates to intelligence/learning-loop.ts)
 * 2. Classify failure
 * 3. Writeback to rules (if systemic — 3+ repeated)
 * 4. Writeback to contexts (always)
 * 5. Writeback to expert (if expert was involved)
 * 6. Writeback to capsule (if capsule was involved)
 * 7. Track effectiveness of involved subsystems
 *
 * This is the "active" part of the learning loop — instead of just
 * recording failures, it propagates corrections across the system.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { SignFn, ContextType, ReasoningPhase, MemorySignFn } from '../types.js';
import type { LearningTriggerType } from '../../types.js';
import type { CognitiveFailureClass } from './failure-classifier.js';
import { classifyFailure } from './failure-classifier.js';
import {
  writebackToRules,
  writebackToContexts,
  writebackToExpert,
  writebackToCapsule,
  writebackToSkill,
  type RuleWritebackResult,
} from './writeback-engine.js';
import { trackGateEffectiveness } from './effectiveness-tracker.js';
import { classifyFailure as classifyLesson, captureLesson as captureLessonOutput } from '../../intelligence/lesson-capture.js';
import { captureLesson as captureToLearningLoop } from '../../intelligence/learning-loop.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningEventInput {
  trigger: LearningTriggerType;
  description: string;
  rootCause: string;
  preventionRule: string;
  failureClass: CognitiveFailureClass;
  phase: ReasoningPhase;
  expertId?: string;
  capsuleId?: string;
  skillIds?: string[];
  ruleIds?: string[];
  memoryIds?: string[];
  projectId?: string | null;
  dryRun?: boolean;
}

export interface LearningEventResult {
  classified: CognitiveFailureClass;
  classificationConfidence: number;
  ruleAction: RuleWritebackResult['action'];
  contextsUpdated: ContextType[];
  expertUpdated: boolean;
  capsuleUpdated: boolean;
  skillsUpdated: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a learning event through the full active learning pipeline.
 *
 * Steps:
 * 1. Classify the failure (refine or confirm the provided class)
 * 2. Write back to rules if repeated failures detected
 * 3. Write back to contexts (always — failure_patterns + lessons_learned)
 * 4. Write back to expert performance (if expert was involved)
 * 5. Write back to capsule anti-patterns (if capsule was involved)
 * 6. Track gate effectiveness (if gates were involved)
 */
export function processLearningEvent(
  db: DatabaseConnection,
  event: LearningEventInput,
  sign: SignFn,
  signMemory?: MemorySignFn,
): LearningEventResult {
  const projectId = event.projectId ?? null;

  // Step 0: Enhanced classification via intelligence/lesson-capture
  try {
    const lessonTrigger = {
      type: 'correction' as const,
      description: event.description,
      evidence: [event.rootCause, event.preventionRule],
      context: `Phase: ${event.phase}, Class: ${event.failureClass}`,
    };
    const classifiedLesson = classifyLesson(lessonTrigger);
    const lessonOutput = captureLessonOutput(lessonTrigger);

    // Persist lesson via intelligence/learning-loop if signMemory available
    if (signMemory && !event.dryRun) {
      try {
        captureToLearningLoop(db, {
          description: event.description,
          rootCause: event.rootCause,
          preventionRule: event.preventionRule,
          triggerType: event.trigger,
          failureClass: classifiedLesson.failureClass as never,
          causalChainIds: event.memoryIds ?? [],
          projectId: projectId ?? undefined,
        }, signMemory);
      } catch { /* non-fatal — learning-loop persistence is additive */ }
    }
  } catch { /* non-fatal — enhanced classification is additive */ }

  // Step 1: Classify (refine the provided failure class)
  const classification = classifyFailure(event.description, {
    phase: event.phase,
    hadReadiness: event.ruleIds !== undefined && event.ruleIds.length > 0,
    hadExpert: event.expertId !== undefined,
    hadCapsule: event.capsuleId !== undefined,
    hadRules: event.ruleIds !== undefined && event.ruleIds.length > 0,
  });

  // Use provided class if confidence is higher, otherwise use classifier's result
  const effectiveClass = classification.confidence >= 0.5
    ? classification.failureClass
    : event.failureClass;

  if (event.dryRun === true) {
    return {
      classified: effectiveClass,
      classificationConfidence: classification.confidence,
      ruleAction: 'none',
      contextsUpdated: ['failure_patterns', 'lessons_learned'],
      expertUpdated: event.expertId !== undefined,
      capsuleUpdated: event.capsuleId !== undefined,
      skillsUpdated: (event.skillIds?.length ?? 0) > 0,
    };
  }

  // Step 2: Write back to rules
  const ruleResult = writebackToRules(db, effectiveClass, {
    description: event.description,
    memoryIds: event.memoryIds ?? [],
  }, sign);

  // Step 3: Write back to contexts (always)
  writebackToContexts(db, effectiveClass, {
    trigger: event.description,
    miss: `Failed during ${event.phase} phase`,
    rootCause: event.rootCause,
    prevention: event.preventionRule,
  }, projectId, sign);

  const contextsUpdated: ContextType[] = ['failure_patterns', 'lessons_learned'];

  // Step 4: Write back to expert (if involved)
  let expertUpdated = false;
  if (event.expertId) {
    writebackToExpert(db, event.expertId, 'failure', sign, effectiveClass);
    expertUpdated = true;
  }

  // Step 5: Write back to capsule (if involved)
  let capsuleUpdated = false;
  if (event.capsuleId) {
    const antiPatternEntry = [
      `**${effectiveClass}:** ${event.description}`,
      `Root cause: ${event.rootCause}`,
      `Prevention: ${event.preventionRule}`,
    ].join('\n');

    writebackToCapsule(db, event.capsuleId, 'anti_patterns', antiPatternEntry, sign);
    capsuleUpdated = true;
  }

  // Step 6: Write back to skills (if involved)
  let skillsUpdated = false;
  if (event.skillIds && event.skillIds.length > 0) {
    const outcome = event.trigger === 'user_correction' ? 'failure' as const : 'partial' as const;
    for (const skillId of event.skillIds) {
      try {
        writebackToSkill(db, skillId, outcome, sign);
      } catch {
        // Non-fatal: skill may have been deleted
      }
    }
    skillsUpdated = true;
  }

  return {
    classified: effectiveClass,
    classificationConfidence: classification.confidence,
    ruleAction: ruleResult.action,
    contextsUpdated,
    expertUpdated,
    capsuleUpdated,
    skillsUpdated,
  };
}

/**
 * Process a gate evaluation for effectiveness tracking.
 *
 * Called after task completion to record whether the gate's pass/block
 * decision was correct in hindsight.
 */
export function recordGateEvaluation(
  db: DatabaseConnection,
  gateType: 'readiness' | 'output_quality' | 'verification',
  passed: boolean,
  taskOutcome: 'success' | 'failure' | 'partial',
): void {
  trackGateEffectiveness(db, gateType, passed, taskOutcome);
}
