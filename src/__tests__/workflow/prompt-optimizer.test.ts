/**
 * Tests for Prompt Optimization
 *
 * Covers:
 * - extractPromptShape: structured extraction from raw input, fallback behavior
 * - enrichWithMemories: memory-retrieved context enrichment
 */

import { describe, it, expect } from 'vitest';
import {
  extractPromptShape,
  enrichWithMemories,
  type PromptInput,
} from '../../workflow/prompt-optimizer.js';
import type { RecallResult, ScoredMemory, MemoryConflict, MemoryType } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScoredMemory(overrides: Partial<ScoredMemory> = {}): ScoredMemory {
  return {
    id: 'mem-1',
    type: 'task' as MemoryType,
    title: 'Test Memory',
    content: 'content',
    tags: '[]',
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence: 0.8,
    outcome: 'success',
    source: 'agent',
    embedding: null,
    embedding_model: null,
    signature: 'sig',
    status: 'active',
    access_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
    expires_at: null,
    superseded_by: null,
    session_id: null,
    semantic_score: 0.9,
    bm25_rank: 1,
    vector_rank: 1,
    recency_modifier: 1,
    access_boost: 0,
    success_weight: 1,
    scope_boost: 0,
    final_score: 0.9,
    ...overrides,
  };
}

function makeRecallResult(
  memories: ScoredMemory[] = [],
  conflicts: MemoryConflict[] = [],
): RecallResult {
  return {
    memories,
    conflicts,
    total_candidates: memories.length,
    retrieval_time_ms: 5,
  };
}

// ---------------------------------------------------------------------------
// extractPromptShape
// ---------------------------------------------------------------------------

describe('extractPromptShape', () => {
  describe('unstructured input (single line)', () => {
    it('uses the raw prompt as the goal when no structure detected', () => {
      const result = extractPromptShape({
        rawPrompt: 'Fix the login page',
      });

      expect(result.goal).toBe('Fix the login page');
    });

    it('derives deliverable from goal when no explicit deliverable', () => {
      const result = extractPromptShape({
        rawPrompt: 'Fix the login page',
      });

      expect(result.deliverable).toBe('Fix the login page');
    });

    it('truncates long goal for deliverable with ellipsis', () => {
      const longGoal = 'A'.repeat(150);
      const result = extractPromptShape({ rawPrompt: longGoal });

      expect(result.deliverable).toBe('A'.repeat(100) + '...');
    });

    it('returns empty constraints and validation for plain input', () => {
      const result = extractPromptShape({ rawPrompt: 'Build a thing' });

      expect(result.constraints).toEqual([]);
      expect(result.validation).toEqual([]);
    });

    it('returns empty context for plain input', () => {
      const result = extractPromptShape({ rawPrompt: 'Build a thing' });
      expect(result.context).toBe('');
    });
  });

  describe('structured input (multi-line with prefixes)', () => {
    it('extracts goal from "goal:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: 'goal: Build a REST API',
      });
      expect(result.goal).toBe('Build a REST API');
    });

    it('extracts goal from "objective:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: 'objective: Implement caching layer',
      });
      expect(result.goal).toBe('Implement caching layer');
    });

    it('extracts context from "context:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: 'goal: Build API\ncontext: We use Express with TypeScript',
      });
      expect(result.context).toBe('We use Express with TypeScript');
    });

    it('extracts context from "background:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: 'background: Legacy system migration\ngoal: Rewrite auth module',
      });
      expect(result.context).toBe('Legacy system migration');
    });

    it('extracts constraints from "constraint:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: [
          'goal: Build API',
          'constraint: Must support pagination',
          'constraint: Rate limit to 100 req/min',
        ].join('\n'),
      });

      expect(result.constraints).toContain('Must support pagination');
      expect(result.constraints).toContain('Rate limit to 100 req/min');
    });

    it('extracts constraints from "requirement:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: 'requirement: Must be backward compatible',
      });

      expect(result.constraints).toContain('Must be backward compatible');
    });

    it('extracts deliverable from "deliverable:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: 'goal: Build API\ndeliverable: Working REST endpoint with tests',
      });
      expect(result.deliverable).toBe('Working REST endpoint with tests');
    });

    it('extracts deliverable from "output:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: 'output: A production-ready module',
      });
      expect(result.deliverable).toBe('A production-ready module');
    });

    it('extracts validation from "validation:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: [
          'goal: Build API',
          'validation: All tests pass',
          'validation: No TypeScript errors',
        ].join('\n'),
      });

      expect(result.validation).toContain('All tests pass');
      expect(result.validation).toContain('No TypeScript errors');
    });

    it('extracts validation from "test:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: 'test: Integration tests cover all endpoints',
      });
      expect(result.validation).toContain('Integration tests cover all endpoints');
    });

    it('extracts validation from "verify:" prefix', () => {
      const result = extractPromptShape({
        rawPrompt: 'verify: Response matches schema',
      });
      expect(result.validation).toContain('Response matches schema');
    });
  });

  describe('implicit constraints from modal verbs', () => {
    it('captures lines containing "must " as constraints', () => {
      const result = extractPromptShape({
        rawPrompt: [
          'goal: Build API',
          'The API must handle concurrent requests',
        ].join('\n'),
      });

      expect(result.constraints).toContain('The API must handle concurrent requests');
    });

    it('captures lines containing "should " as constraints', () => {
      const result = extractPromptShape({
        rawPrompt: [
          'goal: Build API',
          'Response times should be under 200ms',
        ].join('\n'),
      });

      expect(result.constraints).toContain('Response times should be under 200ms');
    });

    it('captures lines containing "cannot " as constraints', () => {
      const result = extractPromptShape({
        rawPrompt: [
          'goal: Build API',
          'The system cannot expose PII in logs',
        ].join('\n'),
      });

      expect(result.constraints).toContain('The system cannot expose PII in logs');
    });
  });

  describe('full structured input', () => {
    it('extracts all fields from a fully structured prompt', () => {
      const result = extractPromptShape({
        rawPrompt: [
          'goal: Implement user auth',
          'context: Express + PostgreSQL stack',
          'constraint: Must use bcrypt for hashing',
          'constraint: Session timeout 15 min',
          'deliverable: Auth middleware and routes',
          'validation: All unit tests pass',
          'verify: Login flow works end-to-end',
        ].join('\n'),
      });

      expect(result.goal).toBe('Implement user auth');
      expect(result.context).toBe('Express + PostgreSQL stack');
      expect(result.constraints).toEqual([
        'Must use bcrypt for hashing',
        'Session timeout 15 min',
      ]);
      expect(result.deliverable).toBe('Auth middleware and routes');
      expect(result.validation).toEqual([
        'All unit tests pass',
        'Login flow works end-to-end',
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = extractPromptShape({ rawPrompt: '' });
      expect(result.goal).toBe('');
      expect(result.deliverable).toBe('');
    });

    it('handles whitespace-only input', () => {
      const result = extractPromptShape({ rawPrompt: '   \n  \n  ' });
      expect(result.goal).toBe('');
    });

    it('handles input with blank lines', () => {
      const result = extractPromptShape({
        rawPrompt: 'goal: Build it\n\n\ncontext: Some context',
      });

      expect(result.goal).toBe('Build it');
      expect(result.context).toBe('Some context');
    });

    it('is case-insensitive for prefixes', () => {
      const result = extractPromptShape({
        rawPrompt: 'GOAL: Build it\nCONTEXT: Some context\nCONSTRAINT: Must work',
      });

      expect(result.goal).toBe('Build it');
      expect(result.context).toBe('Some context');
      expect(result.constraints).toContain('Must work');
    });

    it('preserves projectId in input (passthrough)', () => {
      const input: PromptInput = {
        rawPrompt: 'goal: Build it',
        projectId: 'proj-123',
      };

      // extractPromptShape doesn't use projectId directly,
      // but it should not fail with it present
      const result = extractPromptShape(input);
      expect(result.goal).toBe('Build it');
    });
  });
});

// ---------------------------------------------------------------------------
// enrichWithMemories
// ---------------------------------------------------------------------------

describe('enrichWithMemories', () => {
  it('returns shape unchanged when no memories in recall result', () => {
    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });
    const result = enrichWithMemories(shape, makeRecallResult([]));

    expect(result).toEqual(shape);
  });

  it('adds skill memories to enriched context', () => {
    const memories = [
      makeScoredMemory({ type: 'skill', title: 'API Design Pattern' }),
    ];

    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });
    const result = enrichWithMemories(shape, makeRecallResult(memories));

    expect(result.enriched_context).toContain('Relevant skills');
    expect(result.enriched_context).toContain('API Design Pattern');
  });

  it('adds lesson memories to enriched context', () => {
    const memories = [
      makeScoredMemory({ type: 'lesson', title: 'Always validate input' }),
    ];

    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });
    const result = enrichWithMemories(shape, makeRecallResult(memories));

    expect(result.enriched_context).toContain('Past lessons');
    expect(result.enriched_context).toContain('Always validate input');
  });

  it('adds decision memories to enriched context', () => {
    const memories = [
      makeScoredMemory({ type: 'decision', title: 'Use PostgreSQL over MongoDB' }),
    ];

    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });
    const result = enrichWithMemories(shape, makeRecallResult(memories));

    expect(result.enriched_context).toContain('Prior decisions');
    expect(result.enriched_context).toContain('Use PostgreSQL over MongoDB');
  });

  it('adds incident memories to enriched context', () => {
    const memories = [
      makeScoredMemory({ type: 'incident', title: 'Production outage from missing index' }),
    ];

    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });
    const result = enrichWithMemories(shape, makeRecallResult(memories));

    expect(result.enriched_context).toContain('Past incidents');
    expect(result.enriched_context).toContain('Production outage from missing index');
  });

  it('includes all memory types in enriched context', () => {
    const memories = [
      makeScoredMemory({ type: 'skill', title: 'Skill A' }),
      makeScoredMemory({ type: 'lesson', title: 'Lesson B' }),
      makeScoredMemory({ type: 'decision', title: 'Decision C' }),
      makeScoredMemory({ type: 'incident', title: 'Incident D' }),
    ];

    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });
    const result = enrichWithMemories(shape, makeRecallResult(memories));

    expect(result.enriched_context).toContain('Skill A');
    expect(result.enriched_context).toContain('Lesson B');
    expect(result.enriched_context).toContain('Decision C');
    expect(result.enriched_context).toContain('Incident D');
  });

  it('surfaces conflict warnings when conflicts exist', () => {
    const memories = [makeScoredMemory()];
    const conflicts: MemoryConflict[] = [
      {
        id: 'c1',
        memory_a_id: 'a',
        memory_b_id: 'b',
        conflict_type: 'contradiction',
        similarity_score: 0.9,
        resolution: null,
        resolution_notes: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 'c2',
        memory_a_id: 'c',
        memory_b_id: 'd',
        conflict_type: 'contradiction',
        similarity_score: 0.85,
        resolution: null,
        resolution_notes: null,
        created_at: new Date().toISOString(),
      },
    ];

    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });
    const result = enrichWithMemories(shape, makeRecallResult(memories, conflicts));

    expect(result.enriched_context).toContain('2 unresolved knowledge conflict(s)');
  });

  it('appends enriched context to existing context', () => {
    const shape = extractPromptShape({
      rawPrompt: 'goal: Build API\ncontext: We use Express',
    });

    const memories = [
      makeScoredMemory({ type: 'skill', title: 'REST Pattern' }),
    ];

    const result = enrichWithMemories(shape, makeRecallResult(memories));

    expect(result.context).toContain('We use Express');
    expect(result.context).toContain('--- Retrieved Context ---');
    expect(result.context).toContain('REST Pattern');
  });

  it('sets context to enriched content when no existing context', () => {
    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });

    const memories = [
      makeScoredMemory({ type: 'lesson', title: 'Validate inputs' }),
    ];

    const result = enrichWithMemories(shape, makeRecallResult(memories));

    expect(result.context).toContain('Past lessons');
    expect(result.context).toContain('Validate inputs');
    expect(result.context).not.toContain('--- Retrieved Context ---');
  });

  it('does not modify other shape fields', () => {
    const shape = extractPromptShape({
      rawPrompt: [
        'goal: Build auth',
        'constraint: Must use JWT',
        'deliverable: Auth module',
        'validation: Tests pass',
      ].join('\n'),
    });

    const memories = [makeScoredMemory({ type: 'skill', title: 'JWT Pattern' })];
    const result = enrichWithMemories(shape, makeRecallResult(memories));

    expect(result.goal).toBe(shape.goal);
    expect(result.constraints).toEqual(shape.constraints);
    expect(result.deliverable).toBe(shape.deliverable);
    expect(result.validation).toEqual(shape.validation);
  });

  it('ignores task-type memories (no special section for them)', () => {
    const memories = [
      makeScoredMemory({ type: 'task', title: 'Some task' }),
    ];

    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });
    const result = enrichWithMemories(shape, makeRecallResult(memories));

    // Task memories are not specifically sectioned
    // enriched_context should be empty or not contain "Some task" in a labeled section
    if (result.enriched_context) {
      expect(result.enriched_context).not.toContain('Relevant skills');
      expect(result.enriched_context).not.toContain('Past lessons');
    }
  });

  it('handles multiple memories of the same type', () => {
    const memories = [
      makeScoredMemory({ type: 'skill', title: 'Skill Alpha' }),
      makeScoredMemory({ type: 'skill', title: 'Skill Beta' }),
      makeScoredMemory({ type: 'skill', title: 'Skill Gamma' }),
    ];

    const shape = extractPromptShape({ rawPrompt: 'goal: Build API' });
    const result = enrichWithMemories(shape, makeRecallResult(memories));

    expect(result.enriched_context).toContain('Skill Alpha');
    expect(result.enriched_context).toContain('Skill Beta');
    expect(result.enriched_context).toContain('Skill Gamma');
  });

  it('does not mutate the original shape', () => {
    const shape = extractPromptShape({ rawPrompt: 'goal: Build API\ncontext: Original' });
    const originalContext = shape.context;

    const memories = [makeScoredMemory({ type: 'skill', title: 'Test' })];
    enrichWithMemories(shape, makeRecallResult(memories));

    // Original shape should be unchanged (spread operator creates new object)
    expect(shape.context).toBe(originalContext);
    expect(shape.enriched_context).toBeUndefined();
  });
});
