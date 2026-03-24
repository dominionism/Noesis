/**
 * Structured Memory Templates
 *
 * Validation and construction utilities for all 5 structured memory types:
 * TaskMemory, LessonMemory, CheckpointMemory, SessionMemory, VerificationMemory.
 *
 * Each structured type has:
 * - A validate function that parses unknown data and returns a typed object
 * - Token limit enforcement via approximate tokenization (1 token ~ 4 chars)
 * - A canonical string representation used for embedding generation
 */

import type {
  MemoryType,
  TaskMemory,
  LessonMemory,
  CheckpointMemory,
  SessionMemory,
  VerificationMemory,
} from '../types.js';

const TOKEN_LIMIT_200 = 200;
const TOKEN_LIMIT_100 = 100;
const TOKEN_LIMIT_300 = 300;
const CHARS_PER_TOKEN = 4;

export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;

  const hardLimit = maxChars - 3;
  const searchStart = Math.floor(hardLimit * 0.8);
  const lastSpace = text.lastIndexOf(' ', hardLimit);

  if (lastSpace > searchStart) {
    return text.slice(0, lastSpace) + '...';
  }
  return text.slice(0, hardLimit) + '...';
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing or invalid required field: ${fieldName} (expected non-empty string)`);
  }
  return value;
}

function assertStringAllowEmpty(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Missing or invalid required field: ${fieldName} (expected string)`);
  }
  return value;
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Missing or invalid required field: ${fieldName} (expected string array)`);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new Error(`Invalid element at ${fieldName}[${i}] (expected string)`);
    }
  }
  return value as string[];
}

function assertOutcome(value: unknown, fieldName: string): TaskMemory['outcome'] {
  const valid = ['success', 'partial_success', 'failed_then_fixed', 'failed'];
  if (typeof value !== 'string' || !valid.includes(value)) {
    throw new Error(
      `Missing or invalid required field: ${fieldName} (expected one of: ${valid.join(', ')})`,
    );
  }
  return value as TaskMemory['outcome'];
}

function assertSessionStatus(value: unknown, fieldName: string): SessionMemory['status'] {
  const valid = ['active', 'completed', 'failed', 'handed_off'];
  if (typeof value !== 'string' || !valid.includes(value)) {
    throw new Error(
      `Missing or invalid required field: ${fieldName} (expected one of: ${valid.join(', ')})`,
    );
  }
  return value as SessionMemory['status'];
}

export function validateTaskMemory(data: unknown): TaskMemory {
  if (typeof data !== 'object' || data === null) {
    throw new Error('TaskMemory data must be a non-null object');
  }
  const obj = data as Record<string, unknown>;
  return {
    task_type: assertString(obj.task_type, 'task_type'),
    context: truncateToTokenLimit(assertString(obj.context, 'context'), TOKEN_LIMIT_200),
    action: truncateToTokenLimit(assertString(obj.action, 'action'), TOKEN_LIMIT_200),
    outcome: assertOutcome(obj.outcome, 'outcome'),
    key_insight: truncateToTokenLimit(assertString(obj.key_insight, 'key_insight'), TOKEN_LIMIT_100),
    artifacts: assertStringArray(obj.artifacts, 'artifacts'),
  };
}

export function validateLessonMemory(data: unknown): LessonMemory {
  if (typeof data !== 'object' || data === null) {
    throw new Error('LessonMemory data must be a non-null object');
  }
  const obj = data as Record<string, unknown>;
  return {
    trigger: assertString(obj.trigger, 'trigger'),
    original_approach: assertString(obj.original_approach, 'original_approach'),
    corrected_approach: assertString(obj.corrected_approach, 'corrected_approach'),
    root_cause: truncateToTokenLimit(assertString(obj.root_cause, 'root_cause'), TOKEN_LIMIT_100),
    applicable_when: truncateToTokenLimit(
      assertString(obj.applicable_when, 'applicable_when'), TOKEN_LIMIT_100,
    ),
  };
}

export function validateCheckpointMemory(data: unknown): CheckpointMemory {
  if (typeof data !== 'object' || data === null) {
    throw new Error('CheckpointMemory data must be a non-null object');
  }
  const obj = data as Record<string, unknown>;
  const result: CheckpointMemory = {
    task_description: assertString(obj.task_description, 'task_description'),
    completed_steps: assertStringArray(obj.completed_steps, 'completed_steps'),
    remaining_steps: assertStringArray(obj.remaining_steps, 'remaining_steps'),
    current_blockers: assertStringArray(obj.current_blockers, 'current_blockers'),
    relevant_files: assertStringArray(obj.relevant_files, 'relevant_files'),
    working_state: truncateToTokenLimit(
      assertString(obj.working_state, 'working_state'), TOKEN_LIMIT_300,
    ),
    handoff_source: assertString(obj.handoff_source, 'handoff_source'),
    handoff_target: assertString(obj.handoff_target, 'handoff_target'),
  };

  if (typeof obj.plan_name === 'string') {
    result.plan_name = obj.plan_name;
  }

  if (Array.isArray(obj.phases)) {
    const phases: Array<{ name: string; status: string; details: string }> = [];
    for (const phase of obj.phases) {
      if (typeof phase === 'object' && phase !== null) {
        const p = phase as Record<string, unknown>;
        phases.push({
          name: assertString(p.name, 'phases[].name'),
          status: assertString(p.status, 'phases[].status'),
          details: assertString(p.details, 'phases[].details'),
        });
      }
    }
    result.phases = phases;
  }

  return result;
}

export function validateSessionMemory(data: unknown): SessionMemory {
  if (typeof data !== 'object' || data === null) {
    throw new Error('SessionMemory data must be a non-null object');
  }
  const obj = data as Record<string, unknown>;

  let validatedSummary: string | null = null;
  if (typeof obj.summary === 'string') {
    validatedSummary = truncateToTokenLimit(obj.summary, TOKEN_LIMIT_200);
  } else if (obj.summary !== null && obj.summary !== undefined) {
    throw new Error('Invalid field: summary (expected string or null)');
  }

  return {
    agent: assertString(obj.agent, 'agent'),
    status: assertSessionStatus(obj.status, 'status'),
    started_at: assertString(obj.started_at, 'started_at'),
    ended_at: typeof obj.ended_at === 'string' ? obj.ended_at : null,
    token_estimate: typeof obj.token_estimate === 'number' ? obj.token_estimate : null,
    tool_calls: typeof obj.tool_calls === 'number' ? obj.tool_calls : null,
    summary: validatedSummary,
  };
}

export function validateVerificationMemory(data: unknown): VerificationMemory {
  if (typeof data !== 'object' || data === null) {
    throw new Error('VerificationMemory data must be a non-null object');
  }
  const obj = data as Record<string, unknown>;
  return {
    command: assertString(obj.command, 'command'),
    purpose: assertString(obj.purpose, 'purpose'),
    runner: assertString(obj.runner, 'runner'),
    typical_duration_ms:
      typeof obj.typical_duration_ms === 'number'
        ? obj.typical_duration_ms
        : (() => { throw new Error('Missing or invalid required field: typical_duration_ms'); })(),
    last_known_status: assertString(obj.last_known_status, 'last_known_status'),
    notes: truncateToTokenLimit(
      assertStringAllowEmpty(obj.notes, 'notes'), TOKEN_LIMIT_100,
    ),
  };
}

/**
 * Generate a canonical string representation of a memory for embedding.
 */
export function getCanonicalString(type: MemoryType, contentJson: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(contentJson) as Record<string, unknown>;
  } catch {
    return contentJson;
  }

  switch (type) {
    case 'task': {
      const taskType = typeof parsed.task_type === 'string' ? parsed.task_type : '';
      const context = typeof parsed.context === 'string' ? parsed.context : '';
      const action = typeof parsed.action === 'string' ? parsed.action : '';
      const keyInsight = typeof parsed.key_insight === 'string' ? parsed.key_insight : '';
      return `${taskType}: ${context} -> ${action} -> ${keyInsight}`;
    }
    case 'lesson': {
      const original = typeof parsed.original_approach === 'string' ? parsed.original_approach : '';
      const corrected = typeof parsed.corrected_approach === 'string' ? parsed.corrected_approach : '';
      const rootCause = typeof parsed.root_cause === 'string' ? parsed.root_cause : '';
      return `correction: ${original} -> ${corrected} because ${rootCause}`;
    }
    case 'checkpoint': {
      const taskDesc = typeof parsed.task_description === 'string' ? parsed.task_description : '';
      const completed = Array.isArray(parsed.completed_steps) ? parsed.completed_steps.length : 0;
      const remaining = Array.isArray(parsed.remaining_steps) ? parsed.remaining_steps.length : 0;
      return `checkpoint: ${taskDesc} | done: ${completed} | remaining: ${remaining}`;
    }
    case 'session': {
      const agent = typeof parsed.agent === 'string' ? parsed.agent : '';
      const status = typeof parsed.status === 'string' ? parsed.status : '';
      const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
      return `session: ${agent} ${status} | ${summary}`;
    }
    case 'verification': {
      const purpose = typeof parsed.purpose === 'string' ? parsed.purpose : '';
      const command = typeof parsed.command === 'string' ? parsed.command : '';
      return `verification: ${purpose} via ${command}`;
    }
    default:
      return contentJson;
  }
}
