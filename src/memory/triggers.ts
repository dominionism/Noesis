/**
 * Trigger-driven Memory Accumulation (Loop 1)
 *
 * Handles 8 trigger conditions that cause agents to accumulate
 * structured memories during a session:
 *   1. Task completion -> TaskMemory
 *   2. User correction -> LessonMemory
 *   3. Repeated failure -> LessonMemory
 *   4. Skill contradiction -> LessonMemory
 *   5. Verification failure -> IncidentMemory + LessonMemory
 *   6. Session handoff -> CheckpointMemory
 *   7. Session start -> SessionMemory (active)
 *   8. Session end -> SessionMemory update
 */

import type {
  MemoryInput,
  MemoryType,
  MemoryScope,
  TaskMemory,
  LessonMemory,
  CheckpointMemory,
  SessionMemory,
} from '../types.js';

import {
  validateTaskMemory,
  validateLessonMemory,
  validateCheckpointMemory,
  validateSessionMemory,
} from './templates.js';

export interface TriggerContext {
  triggerType: number;
  data: Record<string, unknown>;
  projectId?: string;
  sessionId?: string;
}

function deriveScope(context: TriggerContext): MemoryScope {
  if (context.sessionId) return 'session';
  if (context.projectId) return 'project';
  return 'global';
}

function getString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getStringArray(data: Record<string, unknown>, key: string): string[] | null {
  const value = data[key];
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (typeof item !== 'string') return null;
  }
  return value as string[];
}

function buildBase(
  context: TriggerContext,
  type: MemoryType,
  title: string,
  content: string,
  tags: string[],
): MemoryInput {
  return {
    type,
    title,
    content,
    tags,
    scope: deriveScope(context),
    source: 'agent',
    confidence: 0.5,
    project_id: context.projectId ?? null,
    session_id: context.sessionId ?? null,
  };
}

function handleTaskCompletion(context: TriggerContext): MemoryInput | null {
  const { data } = context;
  const taskType = getString(data, 'task_type');
  const ctx = getString(data, 'context');
  const action = getString(data, 'action');
  const outcome = getString(data, 'outcome');
  const keyInsight = getString(data, 'key_insight');
  if (!taskType || !ctx || !action || !outcome || !keyInsight) return null;
  const artifacts = getStringArray(data, 'artifacts') ?? [];

  let validated: TaskMemory;
  try {
    validated = validateTaskMemory({
      task_type: taskType, context: ctx, action, outcome, key_insight: keyInsight, artifacts,
    });
  } catch { return null; }

  return buildBase(context, 'task', `Task: ${taskType}`, JSON.stringify(validated), [taskType, outcome]);
}

function handleUserCorrection(context: TriggerContext): MemoryInput | null {
  const { data } = context;
  const trigger = getString(data, 'trigger');
  const originalApproach = getString(data, 'original_approach');
  const correctedApproach = getString(data, 'corrected_approach');
  const rootCause = getString(data, 'root_cause');
  const applicableWhen = getString(data, 'applicable_when');
  if (!trigger || !originalApproach || !correctedApproach || !rootCause || !applicableWhen) return null;

  let validated: LessonMemory;
  try {
    validated = validateLessonMemory({
      trigger, original_approach: originalApproach, corrected_approach: correctedApproach,
      root_cause: rootCause, applicable_when: applicableWhen,
    });
  } catch { return null; }

  return buildBase(context, 'lesson', `Correction: ${rootCause}`, JSON.stringify(validated), ['correction', 'user-feedback']);
}

function handleRepeatedFailure(context: TriggerContext): MemoryInput | null {
  const { data } = context;
  const trigger = getString(data, 'trigger');
  const originalApproach = getString(data, 'original_approach');
  const correctedApproach = getString(data, 'corrected_approach');
  const rootCause = getString(data, 'root_cause');
  const applicableWhen = getString(data, 'applicable_when');
  const errorClass = getString(data, 'error_class');
  if (!trigger || !originalApproach || !correctedApproach || !rootCause || !applicableWhen || !errorClass) return null;

  let validated: LessonMemory;
  try {
    validated = validateLessonMemory({
      trigger, original_approach: originalApproach, corrected_approach: correctedApproach,
      root_cause: rootCause, applicable_when: applicableWhen,
    });
  } catch { return null; }

  return buildBase(context, 'lesson', `Repeated failure: ${errorClass}`, JSON.stringify(validated), ['repeated-failure', errorClass]);
}

function handleSkillContradiction(context: TriggerContext): MemoryInput | null {
  const { data } = context;
  const trigger = getString(data, 'trigger');
  const originalApproach = getString(data, 'original_approach');
  const correctedApproach = getString(data, 'corrected_approach');
  const rootCause = getString(data, 'root_cause');
  const applicableWhen = getString(data, 'applicable_when');
  const contradictedSkillName = getString(data, 'contradicted_skill_name');
  if (!trigger || !originalApproach || !correctedApproach || !rootCause || !applicableWhen || !contradictedSkillName) return null;

  let validated: LessonMemory;
  try {
    validated = validateLessonMemory({
      trigger, original_approach: originalApproach, corrected_approach: correctedApproach,
      root_cause: rootCause, applicable_when: applicableWhen,
    });
  } catch { return null; }

  return buildBase(context, 'lesson', `Skill contradiction: ${contradictedSkillName}`, JSON.stringify(validated), ['skill-contradiction']);
}

function handleVerificationFailure(context: TriggerContext): MemoryInput[] | null {
  const { data } = context;
  const command = getString(data, 'command');
  const expectedResult = getString(data, 'expected_result');
  const actualResult = getString(data, 'actual_result');
  const ctx = getString(data, 'context');
  const rootCause = getString(data, 'root_cause');
  const applicableWhen = getString(data, 'applicable_when');
  if (!command || !expectedResult || !actualResult || !ctx || !rootCause || !applicableWhen) return null;

  const incidentContent = JSON.stringify({
    command, expected_result: expectedResult, actual_result: actualResult, context: ctx,
  });
  const incidentMemory = buildBase(context, 'incident', `Verification failed: ${command}`, incidentContent, ['verification-failure', 'incident']);

  let validated: LessonMemory;
  try {
    validated = validateLessonMemory({
      trigger: `Verification failure: ${command}`,
      original_approach: `Expected: ${expectedResult}`,
      corrected_approach: `Actual: ${actualResult}`,
      root_cause: rootCause,
      applicable_when: applicableWhen,
    });
  } catch { return null; }

  const lessonMemory = buildBase(context, 'lesson', 'Lesson from verification failure', JSON.stringify(validated), ['verification-failure', 'lesson']);
  return [incidentMemory, lessonMemory];
}

function handleSessionHandoff(context: TriggerContext): MemoryInput | null {
  const { data } = context;
  const taskDescription = getString(data, 'task_description');
  const completedSteps = getStringArray(data, 'completed_steps');
  const remainingSteps = getStringArray(data, 'remaining_steps');
  const currentBlockers = getStringArray(data, 'current_blockers');
  const relevantFiles = getStringArray(data, 'relevant_files');
  const workingState = getString(data, 'working_state');
  const handoffSource = getString(data, 'handoff_source');
  const handoffTarget = getString(data, 'handoff_target');
  if (!taskDescription || !completedSteps || !remainingSteps || !currentBlockers || !relevantFiles || !workingState || !handoffSource || !handoffTarget) return null;

  let validated: CheckpointMemory;
  try {
    validated = validateCheckpointMemory({
      task_description: taskDescription, completed_steps: completedSteps,
      remaining_steps: remainingSteps, current_blockers: currentBlockers,
      relevant_files: relevantFiles, working_state: workingState,
      handoff_source: handoffSource, handoff_target: handoffTarget,
    });
  } catch { return null; }

  return buildBase(context, 'checkpoint', `Checkpoint: ${taskDescription}`, JSON.stringify(validated), ['handoff', handoffSource, handoffTarget]);
}

function handleSessionStart(context: TriggerContext): MemoryInput | null {
  const { data } = context;
  const agent = getString(data, 'agent');
  if (!agent) return null;

  const now = new Date().toISOString();
  let validated: SessionMemory;
  try {
    validated = validateSessionMemory({
      agent, status: 'active', started_at: now, ended_at: null,
      token_estimate: null, tool_calls: null, summary: null,
    });
  } catch { return null; }

  return buildBase(context, 'session', `Session: ${agent}`, JSON.stringify(validated), ['session-start', agent]);
}

function handleSessionEnd(context: TriggerContext): MemoryInput | null {
  const { data } = context;
  const status = getString(data, 'status');
  if (!status) return null;
  const validStatuses = ['active', 'completed', 'failed', 'handed_off'];
  if (!validStatuses.includes(status)) return null;

  const now = new Date().toISOString();
  const summary = typeof data.summary === 'string' ? data.summary : null;
  const tokenEstimate = typeof data.token_estimate === 'number' ? data.token_estimate : null;
  const toolCalls = typeof data.tool_calls === 'number' ? data.tool_calls : null;

  let validated: SessionMemory;
  try {
    validated = validateSessionMemory({
      agent: 'unknown', status, started_at: now, ended_at: now,
      token_estimate: tokenEstimate, tool_calls: toolCalls, summary,
    });
  } catch { return null; }

  return buildBase(context, 'session', `Session ended: ${status}`, JSON.stringify(validated), ['session-end', status]);
}

/**
 * Detect a trigger condition and produce structured MemoryInput(s).
 * Returns null for invalid/incomplete data.
 */
export function detectTrigger(context: TriggerContext): MemoryInput | MemoryInput[] | null {
  if (
    typeof context.triggerType !== 'number' ||
    context.triggerType < 1 ||
    context.triggerType > 8 ||
    !Number.isInteger(context.triggerType)
  ) return null;

  if (typeof context.data !== 'object' || context.data === null) return null;

  switch (context.triggerType) {
    case 1: return handleTaskCompletion(context);
    case 2: return handleUserCorrection(context);
    case 3: return handleRepeatedFailure(context);
    case 4: return handleSkillContradiction(context);
    case 5: return handleVerificationFailure(context);
    case 6: return handleSessionHandoff(context);
    case 7: return handleSessionStart(context);
    case 8: return handleSessionEnd(context);
    default: return null;
  }
}
