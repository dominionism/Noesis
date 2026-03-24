/**
 * Tests for Trigger-driven Memory Accumulation (src/memory/triggers.ts)
 *
 * Covers:
 * - detectTrigger with all 8 trigger types
 * - Scope derivation: session > project > global
 * - Invalid/incomplete data returns null
 * - Trigger type validation (range, integer)
 * - Verification failure returns array of 2 memories
 */

import { describe, it, expect } from 'vitest';

import { detectTrigger } from '../../memory/triggers.js';
import type { TriggerContext } from '../../memory/triggers.js';

function makeContext(triggerType: number, data: Record<string, unknown>, overrides?: Partial<TriggerContext>): TriggerContext {
  return {
    triggerType,
    data,
    ...overrides,
  };
}

describe('detectTrigger', () => {
  describe('input validation', () => {
    it('returns null for triggerType 0', () => {
      expect(detectTrigger(makeContext(0, {}))).toBeNull();
    });

    it('returns null for triggerType 9', () => {
      expect(detectTrigger(makeContext(9, {}))).toBeNull();
    });

    it('returns null for negative triggerType', () => {
      expect(detectTrigger(makeContext(-1, {}))).toBeNull();
    });

    it('returns null for non-integer triggerType', () => {
      expect(detectTrigger(makeContext(1.5, {}))).toBeNull();
    });

    it('returns null when data is null', () => {
      expect(detectTrigger({ triggerType: 1, data: null as any })).toBeNull();
    });

    it('returns null when data is not an object', () => {
      expect(detectTrigger({ triggerType: 1, data: 'string' as any })).toBeNull();
    });
  });

  describe('scope derivation', () => {
    it('uses session scope when sessionId is provided', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude' }, { sessionId: 'ses-1' }));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.scope).toBe('session');
    });

    it('uses project scope when projectId is provided but no sessionId', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude' }, { projectId: 'proj-1' }));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.scope).toBe('project');
    });

    it('uses global scope when neither sessionId nor projectId is provided', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude' }));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.scope).toBe('global');
    });
  });

  describe('trigger 1: task completion', () => {
    const validTaskData = {
      task_type: 'refactoring',
      context: 'Code was messy',
      action: 'Extracted functions',
      outcome: 'success',
      key_insight: 'Small functions are better',
      artifacts: ['src/utils.ts'],
    };

    it('creates a task memory for valid data', () => {
      const result = detectTrigger(makeContext(1, validTaskData));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.type).toBe('task');
      expect(memory.title).toBe('Task: refactoring');
      expect(memory.tags).toContain('refactoring');
      expect(memory.tags).toContain('success');
    });

    it('returns null when task_type is missing', () => {
      const { task_type, ...incomplete } = validTaskData;
      expect(detectTrigger(makeContext(1, incomplete))).toBeNull();
    });

    it('returns null when context is missing', () => {
      const { context, ...incomplete } = validTaskData;
      expect(detectTrigger(makeContext(1, incomplete))).toBeNull();
    });

    it('returns null when outcome is missing', () => {
      const { outcome, ...incomplete } = validTaskData;
      expect(detectTrigger(makeContext(1, incomplete))).toBeNull();
    });

    it('defaults artifacts to empty array when missing', () => {
      const { artifacts, ...withoutArtifacts } = validTaskData;
      const result = detectTrigger(makeContext(1, withoutArtifacts));
      expect(result).not.toBeNull();
      const parsed = JSON.parse((result as any).content);
      expect(parsed.artifacts).toEqual([]);
    });
  });

  describe('trigger 2: user correction', () => {
    const validCorrectionData = {
      trigger: 'User said approach was wrong',
      original_approach: 'Used global state',
      corrected_approach: 'Used dependency injection',
      root_cause: 'Global state causes coupling',
      applicable_when: 'Managing shared dependencies',
    };

    it('creates a lesson memory for valid correction', () => {
      const result = detectTrigger(makeContext(2, validCorrectionData));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.type).toBe('lesson');
      expect(memory.tags).toContain('correction');
      expect(memory.tags).toContain('user-feedback');
    });

    it('returns null when trigger is missing', () => {
      const { trigger, ...incomplete } = validCorrectionData;
      expect(detectTrigger(makeContext(2, incomplete))).toBeNull();
    });

    it('returns null when corrected_approach is missing', () => {
      const { corrected_approach, ...incomplete } = validCorrectionData;
      expect(detectTrigger(makeContext(2, incomplete))).toBeNull();
    });
  });

  describe('trigger 3: repeated failure', () => {
    const validData = {
      trigger: 'Same error 3 times',
      original_approach: 'Retry with same config',
      corrected_approach: 'Update configuration',
      root_cause: 'Stale config cache',
      applicable_when: 'Config changes not taking effect',
      error_class: 'config_staleness',
    };

    it('creates a lesson memory with repeated-failure tag', () => {
      const result = detectTrigger(makeContext(3, validData));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.type).toBe('lesson');
      expect(memory.tags).toContain('repeated-failure');
      expect(memory.tags).toContain('config_staleness');
    });

    it('returns null when error_class is missing', () => {
      const { error_class, ...incomplete } = validData;
      expect(detectTrigger(makeContext(3, incomplete))).toBeNull();
    });
  });

  describe('trigger 4: skill contradiction', () => {
    const validData = {
      trigger: 'Skill output was wrong',
      original_approach: 'Used old skill definition',
      corrected_approach: 'Updated approach',
      root_cause: 'Skill was outdated',
      applicable_when: 'Using auto-generated skills',
      contradicted_skill_name: 'deploy-checker',
    };

    it('creates a lesson memory with skill-contradiction tag', () => {
      const result = detectTrigger(makeContext(4, validData));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.type).toBe('lesson');
      expect(memory.title).toContain('deploy-checker');
      expect(memory.tags).toContain('skill-contradiction');
    });

    it('returns null when contradicted_skill_name is missing', () => {
      const { contradicted_skill_name, ...incomplete } = validData;
      expect(detectTrigger(makeContext(4, incomplete))).toBeNull();
    });
  });

  describe('trigger 5: verification failure', () => {
    const validData = {
      command: 'npm test',
      expected_result: 'All tests pass',
      actual_result: '3 tests failed',
      context: 'After auth refactor',
      root_cause: 'Missing mock for new dependency',
      applicable_when: 'Refactoring modules with external deps',
    };

    it('returns an array of 2 memories (incident + lesson)', () => {
      const result = detectTrigger(makeContext(5, validData));
      expect(Array.isArray(result)).toBe(true);
      const memories = result as any[];
      expect(memories).toHaveLength(2);

      expect(memories[0].type).toBe('incident');
      expect(memories[0].tags).toContain('verification-failure');
      expect(memories[0].tags).toContain('incident');

      expect(memories[1].type).toBe('lesson');
      expect(memories[1].tags).toContain('verification-failure');
      expect(memories[1].tags).toContain('lesson');
    });

    it('returns null when command is missing', () => {
      const { command, ...incomplete } = validData;
      expect(detectTrigger(makeContext(5, incomplete))).toBeNull();
    });

    it('returns null when root_cause is missing', () => {
      const { root_cause, ...incomplete } = validData;
      expect(detectTrigger(makeContext(5, incomplete))).toBeNull();
    });
  });

  describe('trigger 6: session handoff', () => {
    const validData = {
      task_description: 'Build REST API',
      completed_steps: ['Schema done', 'Routes done'],
      remaining_steps: ['Add tests'],
      current_blockers: [],
      relevant_files: ['src/api.ts'],
      working_state: 'Routes implemented, need tests',
      handoff_source: 'claude-1',
      handoff_target: 'claude-2',
    };

    it('creates a checkpoint memory for valid handoff', () => {
      const result = detectTrigger(makeContext(6, validData));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.type).toBe('checkpoint');
      expect(memory.title).toContain('Build REST API');
      expect(memory.tags).toContain('handoff');
      expect(memory.tags).toContain('claude-1');
      expect(memory.tags).toContain('claude-2');
    });

    it('returns null when task_description is missing', () => {
      const { task_description, ...incomplete } = validData;
      expect(detectTrigger(makeContext(6, incomplete))).toBeNull();
    });

    it('returns null when handoff_source is missing', () => {
      const { handoff_source, ...incomplete } = validData;
      expect(detectTrigger(makeContext(6, incomplete))).toBeNull();
    });
  });

  describe('trigger 7: session start', () => {
    it('creates a session memory with active status', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude-code' }));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.type).toBe('session');
      expect(memory.title).toBe('Session: claude-code');
      expect(memory.tags).toContain('session-start');
      expect(memory.tags).toContain('claude-code');

      const parsed = JSON.parse(memory.content);
      expect(parsed.status).toBe('active');
    });

    it('returns null when agent is missing', () => {
      expect(detectTrigger(makeContext(7, {}))).toBeNull();
    });

    it('returns null when agent is empty string', () => {
      expect(detectTrigger(makeContext(7, { agent: '' }))).toBeNull();
    });
  });

  describe('trigger 8: session end', () => {
    it('creates a session memory for completed status', () => {
      const result = detectTrigger(makeContext(8, { status: 'completed' }));
      expect(result).not.toBeNull();
      const memory = result as any;
      expect(memory.type).toBe('session');
      expect(memory.title).toBe('Session ended: completed');
      expect(memory.tags).toContain('session-end');
    });

    it('includes optional summary and token counts', () => {
      const result = detectTrigger(makeContext(8, {
        status: 'completed',
        summary: 'All done',
        token_estimate: 5000,
        tool_calls: 10,
      }));
      const parsed = JSON.parse((result as any).content);
      expect(parsed.summary).toBe('All done');
      expect(parsed.token_estimate).toBe(5000);
      expect(parsed.tool_calls).toBe(10);
    });

    it('returns null when status is missing', () => {
      expect(detectTrigger(makeContext(8, {}))).toBeNull();
    });

    it('returns null for invalid status', () => {
      expect(detectTrigger(makeContext(8, { status: 'unknown' }))).toBeNull();
    });

    it('accepts all valid statuses', () => {
      for (const status of ['active', 'completed', 'failed', 'handed_off']) {
        const result = detectTrigger(makeContext(8, { status }));
        expect(result).not.toBeNull();
      }
    });
  });

  describe('common behavior', () => {
    it('sets source to agent for all triggers', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude' }));
      expect((result as any).source).toBe('agent');
    });

    it('sets default confidence to 0.5', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude' }));
      expect((result as any).confidence).toBe(0.5);
    });

    it('sets project_id from context', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude' }, { projectId: 'proj-x' }));
      expect((result as any).project_id).toBe('proj-x');
    });

    it('sets session_id from context', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude' }, { sessionId: 'ses-x' }));
      expect((result as any).session_id).toBe('ses-x');
    });

    it('defaults project_id to null when not provided', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude' }));
      expect((result as any).project_id).toBeNull();
    });

    it('defaults session_id to null when not provided', () => {
      const result = detectTrigger(makeContext(7, { agent: 'claude' }));
      expect((result as any).session_id).toBeNull();
    });
  });
});
