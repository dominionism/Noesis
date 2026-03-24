/**
 * Tests for Structured Memory Templates (src/memory/templates.ts)
 *
 * Covers:
 * - truncateToTokenLimit: truncation at word boundaries and hard limit
 * - validateTaskMemory: all fields, outcome validation, token truncation
 * - validateLessonMemory: required fields
 * - validateCheckpointMemory: required fields, optional plan_name and phases
 * - validateSessionMemory: status validation, nullable fields
 * - validateVerificationMemory: numeric field, notes truncation
 * - getCanonicalString: string generation for each memory type
 * - Error cases: missing fields, wrong types, null input
 */

import { describe, it, expect } from 'vitest';

import {
  truncateToTokenLimit,
  validateTaskMemory,
  validateLessonMemory,
  validateCheckpointMemory,
  validateSessionMemory,
  validateVerificationMemory,
  getCanonicalString,
} from '../../memory/templates.js';

describe('truncateToTokenLimit', () => {
  it('returns text unchanged when under limit', () => {
    const text = 'Hello world';
    expect(truncateToTokenLimit(text, 100)).toBe(text);
  });

  it('truncates at word boundary when possible', () => {
    // 10 tokens = 40 chars max, minus 3 for "..." = 37 char hard limit
    // searchStart at 80% of 37 = ~29
    const text = 'The quick brown fox jumps over the lazy dog and then some more words';
    const result = truncateToTokenLimit(text, 10);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).toMatch(/\.\.\.$/);
  });

  it('hard-truncates when no word boundary found in range', () => {
    // A single long word with no spaces
    const text = 'a'.repeat(200);
    const result = truncateToTokenLimit(text, 10);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).toMatch(/\.\.\.$/);
  });

  it('returns exact input at boundary length', () => {
    // 5 tokens = 20 chars
    const text = '12345678901234567890'; // exactly 20 chars
    expect(truncateToTokenLimit(text, 5)).toBe(text);
  });

  it('handles empty string', () => {
    expect(truncateToTokenLimit('', 100)).toBe('');
  });
});

describe('validateTaskMemory', () => {
  const validTask = {
    task_type: 'refactoring',
    context: 'Needed to improve code quality',
    action: 'Extracted common logic into shared module',
    outcome: 'success',
    key_insight: 'Shared modules reduce duplication',
    artifacts: ['src/shared.ts'],
  };

  it('validates a correct TaskMemory object', () => {
    const result = validateTaskMemory(validTask);
    expect(result.task_type).toBe('refactoring');
    expect(result.outcome).toBe('success');
    expect(result.artifacts).toEqual(['src/shared.ts']);
  });

  it('truncates long context field', () => {
    const longContext = 'x'.repeat(2000);
    const result = validateTaskMemory({ ...validTask, context: longContext });
    // 200 tokens = 800 chars max
    expect(result.context.length).toBeLessThanOrEqual(800);
  });

  it('truncates long action field', () => {
    const result = validateTaskMemory({ ...validTask, action: 'a'.repeat(2000) });
    expect(result.action.length).toBeLessThanOrEqual(800);
  });

  it('truncates long key_insight field', () => {
    const result = validateTaskMemory({ ...validTask, key_insight: 'k'.repeat(1000) });
    // 100 tokens = 400 chars max
    expect(result.key_insight.length).toBeLessThanOrEqual(400);
  });

  it('throws on null input', () => {
    expect(() => validateTaskMemory(null)).toThrow('non-null object');
  });

  it('throws on non-object input', () => {
    expect(() => validateTaskMemory('string')).toThrow('non-null object');
  });

  it('throws on missing task_type', () => {
    expect(() => validateTaskMemory({ ...validTask, task_type: undefined })).toThrow('task_type');
  });

  it('throws on empty task_type', () => {
    expect(() => validateTaskMemory({ ...validTask, task_type: '' })).toThrow('task_type');
  });

  it('throws on invalid outcome', () => {
    expect(() => validateTaskMemory({ ...validTask, outcome: 'invalid' })).toThrow('outcome');
  });

  it('throws on non-string array in artifacts', () => {
    expect(() => validateTaskMemory({ ...validTask, artifacts: [1, 2] })).toThrow('artifacts');
  });

  it('accepts all valid outcomes', () => {
    for (const outcome of ['success', 'partial_success', 'failed_then_fixed', 'failed']) {
      const result = validateTaskMemory({ ...validTask, outcome });
      expect(result.outcome).toBe(outcome);
    }
  });
});

describe('validateLessonMemory', () => {
  const validLesson = {
    trigger: 'User reported incorrect output',
    original_approach: 'Used regex for parsing',
    corrected_approach: 'Used proper parser',
    root_cause: 'Regex cannot handle nested structures',
    applicable_when: 'Parsing structured data formats',
  };

  it('validates a correct LessonMemory object', () => {
    const result = validateLessonMemory(validLesson);
    expect(result.trigger).toBe(validLesson.trigger);
    expect(result.root_cause).toBe(validLesson.root_cause);
  });

  it('truncates long root_cause', () => {
    const result = validateLessonMemory({ ...validLesson, root_cause: 'r'.repeat(1000) });
    expect(result.root_cause.length).toBeLessThanOrEqual(400);
  });

  it('truncates long applicable_when', () => {
    const result = validateLessonMemory({ ...validLesson, applicable_when: 'a'.repeat(1000) });
    expect(result.applicable_when.length).toBeLessThanOrEqual(400);
  });

  it('throws on null input', () => {
    expect(() => validateLessonMemory(null)).toThrow('non-null object');
  });

  it('throws on missing trigger', () => {
    expect(() => validateLessonMemory({ ...validLesson, trigger: undefined })).toThrow('trigger');
  });

  it('throws on missing original_approach', () => {
    expect(() => validateLessonMemory({ ...validLesson, original_approach: undefined })).toThrow('original_approach');
  });
});

describe('validateCheckpointMemory', () => {
  const validCheckpoint = {
    task_description: 'Implement auth module',
    completed_steps: ['Set up project', 'Created schema'],
    remaining_steps: ['Implement login', 'Add tests'],
    current_blockers: [],
    relevant_files: ['src/auth.ts'],
    working_state: 'In progress, auth schema ready',
    handoff_source: 'claude-1',
    handoff_target: 'claude-2',
  };

  it('validates a correct CheckpointMemory object', () => {
    const result = validateCheckpointMemory(validCheckpoint);
    expect(result.task_description).toBe('Implement auth module');
    expect(result.completed_steps).toHaveLength(2);
  });

  it('includes optional plan_name when provided', () => {
    const result = validateCheckpointMemory({
      ...validCheckpoint,
      plan_name: 'Phase 1',
    });
    expect(result.plan_name).toBe('Phase 1');
  });

  it('does not include plan_name when not provided', () => {
    const result = validateCheckpointMemory(validCheckpoint);
    expect(result.plan_name).toBeUndefined();
  });

  it('includes optional phases when provided', () => {
    const result = validateCheckpointMemory({
      ...validCheckpoint,
      phases: [
        { name: 'Phase 1', status: 'completed', details: 'Done' },
        { name: 'Phase 2', status: 'active', details: 'In progress' },
      ],
    });
    expect(result.phases).toHaveLength(2);
    expect(result.phases![0].name).toBe('Phase 1');
  });

  it('throws on missing task_description', () => {
    expect(() => validateCheckpointMemory({
      ...validCheckpoint,
      task_description: undefined,
    })).toThrow('task_description');
  });

  it('throws on non-array completed_steps', () => {
    expect(() => validateCheckpointMemory({
      ...validCheckpoint,
      completed_steps: 'not-array',
    })).toThrow('completed_steps');
  });

  it('truncates long working_state', () => {
    const result = validateCheckpointMemory({
      ...validCheckpoint,
      working_state: 'w'.repeat(2000),
    });
    // 300 tokens = 1200 chars max
    expect(result.working_state.length).toBeLessThanOrEqual(1200);
  });
});

describe('validateSessionMemory', () => {
  const validSession = {
    agent: 'claude-code',
    status: 'completed',
    started_at: '2025-01-01T00:00:00.000Z',
    ended_at: '2025-01-01T01:00:00.000Z',
    token_estimate: 5000,
    tool_calls: 42,
    summary: 'Completed auth module implementation',
  };

  it('validates a correct SessionMemory object', () => {
    const result = validateSessionMemory(validSession);
    expect(result.agent).toBe('claude-code');
    expect(result.status).toBe('completed');
    expect(result.token_estimate).toBe(5000);
  });

  it('accepts null ended_at', () => {
    const result = validateSessionMemory({ ...validSession, ended_at: null });
    expect(result.ended_at).toBeNull();
  });

  it('sets ended_at to null for non-string value', () => {
    const result = validateSessionMemory({ ...validSession, ended_at: 123 });
    expect(result.ended_at).toBeNull();
  });

  it('accepts null summary', () => {
    const result = validateSessionMemory({ ...validSession, summary: null });
    expect(result.summary).toBeNull();
  });

  it('sets token_estimate to null for non-number', () => {
    const result = validateSessionMemory({ ...validSession, token_estimate: 'abc' });
    expect(result.token_estimate).toBeNull();
  });

  it('sets tool_calls to null for non-number', () => {
    const result = validateSessionMemory({ ...validSession, tool_calls: undefined });
    expect(result.tool_calls).toBeNull();
  });

  it('throws on invalid status', () => {
    expect(() => validateSessionMemory({ ...validSession, status: 'invalid' })).toThrow('status');
  });

  it('accepts all valid statuses', () => {
    for (const status of ['active', 'completed', 'failed', 'handed_off']) {
      const result = validateSessionMemory({ ...validSession, status });
      expect(result.status).toBe(status);
    }
  });

  it('throws on non-string, non-null summary (e.g. number)', () => {
    expect(() => validateSessionMemory({ ...validSession, summary: 123 })).toThrow('summary');
  });

  it('truncates long summary', () => {
    const result = validateSessionMemory({ ...validSession, summary: 's'.repeat(2000) });
    expect(result.summary!.length).toBeLessThanOrEqual(800);
  });
});

describe('validateVerificationMemory', () => {
  const validVerification = {
    command: 'npm test',
    purpose: 'Run unit tests',
    runner: 'vitest',
    typical_duration_ms: 5000,
    last_known_status: 'passing',
    notes: 'All 42 tests pass',
  };

  it('validates a correct VerificationMemory object', () => {
    const result = validateVerificationMemory(validVerification);
    expect(result.command).toBe('npm test');
    expect(result.typical_duration_ms).toBe(5000);
  });

  it('throws on missing typical_duration_ms', () => {
    expect(() => validateVerificationMemory({
      ...validVerification,
      typical_duration_ms: undefined,
    })).toThrow('typical_duration_ms');
  });

  it('throws on non-numeric typical_duration_ms', () => {
    expect(() => validateVerificationMemory({
      ...validVerification,
      typical_duration_ms: 'fast',
    })).toThrow('typical_duration_ms');
  });

  it('accepts empty notes string', () => {
    const result = validateVerificationMemory({ ...validVerification, notes: '' });
    expect(result.notes).toBe('');
  });

  it('truncates long notes', () => {
    const result = validateVerificationMemory({
      ...validVerification,
      notes: 'n'.repeat(1000),
    });
    expect(result.notes.length).toBeLessThanOrEqual(400);
  });

  it('throws on null input', () => {
    expect(() => validateVerificationMemory(null)).toThrow('non-null object');
  });
});

describe('getCanonicalString', () => {
  it('generates canonical string for task type', () => {
    const content = JSON.stringify({
      task_type: 'deploy',
      context: 'Prod release',
      action: 'Ran deploy script',
      key_insight: 'Always check staging first',
    });
    const result = getCanonicalString('task', content);
    expect(result).toBe('deploy: Prod release -> Ran deploy script -> Always check staging first');
  });

  it('generates canonical string for lesson type', () => {
    const content = JSON.stringify({
      original_approach: 'Manual deploy',
      corrected_approach: 'CI/CD pipeline',
      root_cause: 'Human error',
    });
    const result = getCanonicalString('lesson', content);
    expect(result).toBe('correction: Manual deploy -> CI/CD pipeline because Human error');
  });

  it('generates canonical string for checkpoint type', () => {
    const content = JSON.stringify({
      task_description: 'Auth module',
      completed_steps: ['a', 'b'],
      remaining_steps: ['c'],
    });
    const result = getCanonicalString('checkpoint', content);
    expect(result).toBe('checkpoint: Auth module | done: 2 | remaining: 1');
  });

  it('generates canonical string for session type', () => {
    const content = JSON.stringify({
      agent: 'claude',
      status: 'completed',
      summary: 'Built the thing',
    });
    const result = getCanonicalString('session', content);
    expect(result).toBe('session: claude completed | Built the thing');
  });

  it('generates canonical string for verification type', () => {
    const content = JSON.stringify({
      purpose: 'Run linter',
      command: 'eslint .',
    });
    const result = getCanonicalString('verification', content);
    expect(result).toBe('verification: Run linter via eslint .');
  });

  it('returns raw content for unknown types', () => {
    const content = 'raw content here';
    const result = getCanonicalString('decision', content);
    expect(result).toBe('raw content here');
  });

  it('returns raw content when JSON parsing fails', () => {
    const result = getCanonicalString('task', 'not-json');
    expect(result).toBe('not-json');
  });

  it('handles missing fields in task JSON gracefully', () => {
    const content = JSON.stringify({ task_type: 'deploy' });
    const result = getCanonicalString('task', content);
    expect(result).toBe('deploy:  ->  -> ');
  });

  it('handles missing fields in lesson JSON gracefully', () => {
    const content = JSON.stringify({});
    const result = getCanonicalString('lesson', content);
    expect(result).toBe('correction:  ->  because ');
  });
});
