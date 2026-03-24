/**
 * Tests for Anti-Pattern Synthesis (Learning Loop 3 — negative path)
 *
 * Covers:
 * - synthesizeAntiPattern: happy path, cluster size validation, LLM errors
 * - Response validation: missing/empty fields
 * - Output structure: draft status, confidence, source_lessons
 */

import { describe, it, expect } from 'vitest';
import { synthesizeAntiPattern } from '../../intelligence/antipattern-synthesis.js';
import type { LlmProvider } from '../../intelligence/skill-synthesis.js';
import type { Memory } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: overrides.id ?? `mem-${Math.random().toString(36).slice(2)}`,
    type: overrides.type ?? 'lesson',
    title: overrides.title ?? 'Lesson: something went wrong',
    content: overrides.content ?? 'Failed because of bad approach',
    tags: overrides.tags ?? '["lesson"]',
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence: 0.5,
    outcome: overrides.outcome ?? 'failed',
    source: 'learning_loop',
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

function makeValidResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'Hardcoded Credentials',
    description: 'Embedding secrets directly in source code',
    trigger_pattern: 'When connecting to external services',
    failure_mode: 'Credentials leaked through version control',
    correct_approach: 'Use environment variables or a secret manager',
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
  return `ap-id-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('synthesizeAntiPattern', () => {
  describe('happy path', () => {
    it('produces an AntiPatternDefinition from valid cluster', async () => {
      const cluster = [makeMemory({ id: 'f1' }), makeMemory({ id: 'f2' }), makeMemory({ id: 'f3' })];
      const llm = makeMockLlm(makeValidResponse());

      const ap = await synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId });

      expect(ap.kind).toBe('anti_pattern');
      expect(ap.name).toContain('Hardcoded Credentials');
      expect(ap.description).toBe('Embedding secrets directly in source code');
      expect(ap.trigger_pattern).toBe('When connecting to external services');
      expect(ap.failure_mode).toBe('Credentials leaked through version control');
      expect(ap.correct_approach).toBe('Use environment variables or a secret manager');
    });

    it('starts in draft status with confidence 0.5', async () => {
      const cluster = [makeMemory(), makeMemory(), makeMemory()];
      const llm = makeMockLlm(makeValidResponse());

      const ap = await synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId });

      expect(ap.status).toBe('draft');
      expect(ap.confidence).toBe(0.5);
      expect(ap.successes).toBe(0);
      expect(ap.failures).toBe(0);
      expect(ap.last_used_at).toBeNull();
    });

    it('records source_lessons from cluster memory IDs', async () => {
      const cluster = [
        makeMemory({ id: 'lesson-1' }),
        makeMemory({ id: 'lesson-2' }),
        makeMemory({ id: 'lesson-3' }),
      ];
      const llm = makeMockLlm(makeValidResponse());

      const ap = await synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId });

      expect(ap.source_lessons).toEqual(['lesson-1', 'lesson-2', 'lesson-3']);
    });

    it('appends generated ID to the anti-pattern name', async () => {
      const cluster = [makeMemory(), makeMemory(), makeMemory()];
      const llm = makeMockLlm(makeValidResponse({ name: 'Bad Practice' }));

      const ap = await synthesizeAntiPattern({
        cluster,
        llm,
        generateId: () => 'unique-ap-99',
      });

      expect(ap.name).toBe('Bad Practice [unique-ap-99]');
    });

    it('passes cluster content to the LLM prompt', async () => {
      let capturedPrompt = '';
      const llm: LlmProvider = {
        generate: async (prompt) => {
          capturedPrompt = prompt;
          return makeValidResponse();
        },
      };

      const cluster = [
        makeMemory({ id: 'x1', title: 'Lesson: XSS attack', content: 'Unescaped HTML output' }),
        makeMemory({ id: 'x2' }),
        makeMemory({ id: 'x3' }),
      ];

      await synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId });

      expect(capturedPrompt).toContain('x1');
      expect(capturedPrompt).toContain('Lesson: XSS attack');
      expect(capturedPrompt).toContain('Unescaped HTML output');
      expect(capturedPrompt).toContain('3 failure or lesson memories');
    });
  });

  describe('cluster size validation', () => {
    it('throws when cluster has fewer than 3 memories', async () => {
      const cluster = [makeMemory(), makeMemory()];
      const llm = makeMockLlm(makeValidResponse());

      await expect(
        synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('requires at least 3 memories, received 2');
    });

    it('throws when cluster is empty', async () => {
      const llm = makeMockLlm(makeValidResponse());

      await expect(
        synthesizeAntiPattern({ cluster: [], llm, generateId: stubGenerateId }),
      ).rejects.toThrow('requires at least 3 memories, received 0');
    });

    it('accepts exactly 3 memories', async () => {
      const cluster = [makeMemory(), makeMemory(), makeMemory()];
      const llm = makeMockLlm(makeValidResponse());

      const ap = await synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId });
      expect(ap.kind).toBe('anti_pattern');
    });
  });

  describe('LLM error handling', () => {
    it('throws when LLM returns invalid JSON', async () => {
      const llm = makeMockLlm('this is {not} valid json!!!');
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('LLM returned invalid JSON');
    });

    it('throws when LLM returns null', async () => {
      const llm = makeMockLlm('null');
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('LLM response is not an object');
    });

    it('throws when LLM returns a number', async () => {
      const llm = makeMockLlm('42');
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      await expect(
        synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow('LLM response is not an object');
    });

    it('throws when LLM returns an array', async () => {
      const llm = makeMockLlm('[1, 2, 3]');
      const cluster = [makeMemory(), makeMemory(), makeMemory()];

      // Array is typeof 'object' but passes the null check
      // The validateResponse will fail on missing required string fields
      await expect(
        synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId }),
      ).rejects.toThrow();
    });
  });

  describe('response validation', () => {
    const requiredFields = ['name', 'description', 'trigger_pattern', 'failure_mode', 'correct_approach'];

    for (const field of requiredFields) {
      it(`throws when '${field}' is empty`, async () => {
        const response = makeValidResponse({ [field]: '' });
        const llm = makeMockLlm(response);
        const cluster = [makeMemory(), makeMemory(), makeMemory()];

        await expect(
          synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId }),
        ).rejects.toThrow(`missing or empty required field '${field}'`);
      });

      it(`throws when '${field}' is missing`, async () => {
        const resp = JSON.parse(makeValidResponse());
        delete resp[field];
        const llm = makeMockLlm(JSON.stringify(resp));
        const cluster = [makeMemory(), makeMemory(), makeMemory()];

        await expect(
          synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId }),
        ).rejects.toThrow(`missing or empty required field '${field}'`);
      });

      it(`throws when '${field}' is a number instead of string`, async () => {
        const response = makeValidResponse({ [field]: 123 });
        const llm = makeMockLlm(response);
        const cluster = [makeMemory(), makeMemory(), makeMemory()];

        await expect(
          synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId }),
        ).rejects.toThrow(`missing or empty required field '${field}'`);
      });
    }
  });

  describe('edge cases', () => {
    it('handles memories with invalid JSON tags gracefully', async () => {
      const cluster = [
        makeMemory({ tags: 'invalid json' }),
        makeMemory({ tags: '42' }),
        makeMemory({ tags: '["valid"]' }),
      ];
      const llm = makeMockLlm(makeValidResponse());

      const ap = await synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId });
      expect(ap.kind).toBe('anti_pattern');
    });

    it('handles large cluster sizes', async () => {
      const cluster = Array.from({ length: 15 }, (_, i) =>
        makeMemory({ id: `fail-${i}` }),
      );
      const llm = makeMockLlm(makeValidResponse());

      const ap = await synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId });
      expect(ap.source_lessons).toHaveLength(15);
    });

    it('preserves memory metadata in LLM prompt', async () => {
      let capturedPrompt = '';
      const llm: LlmProvider = {
        generate: async (prompt) => {
          capturedPrompt = prompt;
          return makeValidResponse();
        },
      };

      const cluster = [
        makeMemory({ id: 'id-1', type: 'lesson', outcome: 'failed' }),
        makeMemory({ id: 'id-2', type: 'task', outcome: 'failed_then_fixed' }),
        makeMemory({ id: 'id-3' }),
      ];

      await synthesizeAntiPattern({ cluster, llm, generateId: stubGenerateId });

      expect(capturedPrompt).toContain('Type: lesson');
      expect(capturedPrompt).toContain('Type: task');
      expect(capturedPrompt).toContain('Outcome: failed');
      expect(capturedPrompt).toContain('Outcome: failed_then_fixed');
    });
  });
});
