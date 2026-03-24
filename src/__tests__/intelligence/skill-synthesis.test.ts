/**
 * Tests for Skill Synthesis (Learning Loop 3 — positive path)
 *
 * Covers:
 * - synthesizeSkill: happy path, cluster size validation, LLM error handling
 * - Response validation: missing fields, empty arrays, malformed JSON
 * - Skill output structure: draft status, confidence, source_lessons
 */

import { describe, it, expect } from 'vitest';
import { synthesizeSkill, type LlmProvider } from '../../intelligence/skill-synthesis.js';
import type { Memory } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: overrides.id ?? `mem-${Math.random().toString(36).slice(2)}`,
    type: 'task',
    title: overrides.title ?? 'Test task',
    content: overrides.content ?? 'Did something successfully',
    tags: overrides.tags ?? '["test"]',
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence: 0.8,
    outcome: 'success',
    source: 'agent',
    embedding: null,
    embedding_model: null,
    signature: 'test-sig',
    status: 'active',
    access_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
    expires_at: null,
    superseded_by: null,
    session_id: null,
    ...overrides,
  };
}

function makeValidLlmResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'Test Skill',
    description: 'A test skill for doing things correctly',
    trigger_pattern: 'When you need to do the thing',
    steps: [
      { description: 'Step 1: Do the first thing' },
      { description: 'Step 2: Do the second thing', command: 'npm test' },
    ],
    prerequisites: ['Node.js installed'],
    anti_patterns: ['Skipping step 1'],
    validation_criteria: [
      { check: 'Tests pass', method: 'Run npm test' },
    ],
    ...overrides,
  });
}

function makeMockLlm(response: string): LlmProvider {
  return {
    generate: async () => response,
  };
}

let idCounter = 0;
function stubGenerateId(): string {
  return `test-id-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('synthesizeSkill', () => {
  describe('happy path', () => {
    it('produces a SkillDefinition from a valid cluster of 3+ memories', async () => {
      const cluster = [makeMemory({ id: 'a' }), makeMemory({ id: 'b' }), makeMemory({ id: 'c' })];
      const llm = makeMockLlm(makeValidLlmResponse());

      const skill = await synthesizeSkill({
        cluster,
        llm,
        generateId: stubGenerateId,
      });

      expect(skill.kind).toBe('skill');
      expect(skill.name).toContain('Test Skill');
      expect(skill.description).toBe('A test skill for doing things correctly');
      expect(skill.trigger_pattern).toBe('When you need to do the thing');
      expect(skill.steps).toHaveLength(2);
      expect(skill.steps[0].description).toBe('Step 1: Do the first thing');
      expect(skill.steps[1].command).toBe('npm test');
      expect(skill.prerequisites).toEqual(['Node.js installed']);
      expect(skill.anti_patterns).toEqual(['Skipping step 1']);
      expect(skill.validation_criteria).toEqual([
        { check: 'Tests pass', method: 'Run npm test' },
      ]);
    });

    it('starts skill in draft status with 0.5 confidence', async () => {
      const cluster = [makeMemory(), makeMemory(), makeMemory()];
      const llm = makeMockLlm(makeValidLlmResponse());

      const skill = await synthesizeSkill({ cluster, llm, generateId: stubGenerateId });

      expect(skill.status).toBe('draft');
      expect(skill.confidence).toBe(0.5);
      expect(skill.successes).toBe(0);
      expect(skill.failures).toBe(0);
      expect(skill.last_used_at).toBeNull();
    });

    it('records source_lessons from cluster memory IDs', async () => {
      const cluster = [
        makeMemory({ id: 'mem-1' }),
        makeMemory({ id: 'mem-2' }),
        makeMemory({ id: 'mem-3' }),
      ];
      const llm = makeMockLlm(makeValidLlmResponse());

      const skill = await synthesizeSkill({ cluster, llm, generateId: stubGenerateId });

      expect(skill.source_lessons).toEqual(['mem-1', 'mem-2', 'mem-3']);
    });

    it('appends generated ID to the skill name', async () => {
      const cluster = [makeMemory(), makeMemory(), makeMemory()];
      const llm = makeMockLlm(makeValidLlmResponse({ name: 'My Skill' }));

      const skill = await synthesizeSkill({
        cluster,
        llm,
        generateId: () => 'unique-id-42',
      });

      expect(skill.name).toBe('My Skill [unique-id-42]');
    });

    it('passes cluster content to the LLM prompt', async () => {
      let capturedPrompt = '';
      const llm: LlmProvider = {
        generate: async (prompt) => {
          capturedPrompt = prompt;
          return makeValidLlmResponse();
        },
      };

      const cluster = [
        makeMemory({ id: 'mem-x', title: 'Special Title', content: 'Special content here' }),
        makeMemory({ id: 'mem-y' }),
        makeMemory({ id: 'mem-z' }),
      ];

      await synthesizeSkill({ cluster, llm, generateId: stubGenerateId });

      expect(capturedPrompt).toContain('mem-x');
      expect(capturedPrompt).toContain('Special Title');
      expect(capturedPrompt).toContain('Special content here');
      expect(capturedPrompt).toContain('3 successful task memories');
    });

    it('handles optional step fields (command, conditions)', async () => {
      const response = makeValidLlmResponse({
        steps: [
          { description: 'Step 1' },
          { description: 'Step 2', command: 'ls -la' },
          { description: 'Step 3', conditions: 'Only on Linux' },
          { description: 'Step 4', command: 'echo hi', conditions: 'When verbose' },
        ],
      });
      const llm = makeMockLlm(response);
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      const skill = await synthesizeSkill({ cluster, llm, generateId: stubGenerateId });

      expect(skill.steps).toHaveLength(4);
      expect(skill.steps[0]).toEqual({ description: 'Step 1' });
      expect(skill.steps[1]).toEqual({ description: 'Step 2', command: 'ls -la' });
      expect(skill.steps[2]).toEqual({ description: 'Step 3', conditions: 'Only on Linux' });
      expect(skill.steps[3]).toEqual({ description: 'Step 4', command: 'echo hi', conditions: 'When verbose' });
    });
  });

  describe('cluster size validation', () => {
    it('throws when cluster has fewer than 3 memories', async () => {
      const cluster = [makeMemory(), makeMemory()];
      const llm = makeMockLlm(makeValidLlmResponse());

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('requires at least 3 memories, received 2');
    });

    it('throws when cluster has 0 memories', async () => {
      const llm = makeMockLlm(makeValidLlmResponse());

      await expect(
        synthesizeSkill({ cluster: [], llm, generateId: stubGenerateId }),
      ).rejects.toThrow('requires at least 3 memories, received 0');
    });

    it('throws when cluster has 1 memory', async () => {
      const llm = makeMockLlm(makeValidLlmResponse());

      await expect(
        synthesizeSkill({ cluster: [makeMemory()], llm, generateId: stubGenerateId }),
      ).rejects.toThrow('requires at least 3 memories, received 1');
    });

    it('accepts exactly 3 memories', async () => {
      const cluster = [makeMemory(), makeMemory(), makeMemory()];
      const llm = makeMockLlm(makeValidLlmResponse());

      const skill = await synthesizeSkill({ cluster, llm, generateId: stubGenerateId });
      expect(skill.kind).toBe('skill');
    });
  });

  describe('LLM error handling', () => {
    it('throws when LLM returns invalid JSON', async () => {
      const llm = makeMockLlm('not valid json {{{');
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('LLM returned invalid JSON');
    });

    it('throws when LLM returns null', async () => {
      const llm = makeMockLlm('null');
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('LLM response is not an object');
    });

    it('throws when LLM returns a string instead of object', async () => {
      const llm = makeMockLlm('"just a string"');
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('LLM response is not an object');
    });
  });

  describe('response validation', () => {
    it('throws when name is missing', async () => {
      const response = makeValidLlmResponse({ name: '' });
      const llm = makeMockLlm(response);
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow("missing or empty required field 'name'");
    });

    it('throws when description is missing', async () => {
      const resp = JSON.parse(makeValidLlmResponse());
      delete resp.description;
      const llm = makeMockLlm(JSON.stringify(resp));
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow("missing or empty required field 'description'");
    });

    it('throws when steps is empty array', async () => {
      const response = makeValidLlmResponse({ steps: [] });
      const llm = makeMockLlm(response);
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('steps must be a non-empty array');
    });

    it('throws when steps is not an array', async () => {
      const response = makeValidLlmResponse({ steps: 'not an array' });
      const llm = makeMockLlm(response);
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('steps must be a non-empty array');
    });

    it('throws when step object is missing description', async () => {
      const response = makeValidLlmResponse({
        steps: [{ command: 'npm test' }],
      });
      const llm = makeMockLlm(response);
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('each step must have a string description');
    });

    it('throws when prerequisites contains non-strings', async () => {
      const response = makeValidLlmResponse({ prerequisites: [1, 2] });
      const llm = makeMockLlm(response);
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow("each item in 'prerequisites' must be a string");
    });

    it('throws when anti_patterns is not an array', async () => {
      const response = makeValidLlmResponse({ anti_patterns: 'not array' });
      const llm = makeMockLlm(response);
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow("'anti_patterns' must be an array");
    });

    it('throws when validation_criteria is not an array', async () => {
      const response = makeValidLlmResponse({ validation_criteria: {} });
      const llm = makeMockLlm(response);
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('validation_criteria must be an array');
    });

    it('throws when validation criterion is missing check field', async () => {
      const response = makeValidLlmResponse({
        validation_criteria: [{ method: 'Run test' }],
      });
      const llm = makeMockLlm(response);
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeSkill({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('validation criterion must have check and method strings');
    });
  });

  describe('edge cases', () => {
    it('handles memories with invalid JSON tags gracefully', async () => {
      const cluster = [
        makeMemory({ tags: 'not-json' }),
        makeMemory({ tags: '{"invalid": true}' }),
        makeMemory({ tags: '["valid", "tags"]' }),
      ];
      const llm = makeMockLlm(makeValidLlmResponse());

      // Should not throw — safeParseTags handles invalid JSON
      const skill = await synthesizeSkill({ cluster, llm, generateId: stubGenerateId });
      expect(skill.kind).toBe('skill');
    });

    it('handles large cluster sizes', async () => {
      const cluster = Array.from({ length: 20 }, (_, i) =>
        makeMemory({ id: `mem-${i}`, title: `Task ${i}` }),
      );
      const llm = makeMockLlm(makeValidLlmResponse());

      const skill = await synthesizeSkill({ cluster, llm, generateId: stubGenerateId });
      expect(skill.source_lessons).toHaveLength(20);
    });
  });
});
