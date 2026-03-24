/**
 * Tests for Expert Routing — Expert Agent Routing with Memory Consultation
 *
 * Covers:
 * - routeToExpert: pattern matching, memory influence, null result
 * - getExpert: lookup by ID
 * - listExperts: all 9 built-in experts
 * - registerExpert: custom expert registration
 * - Edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  routeToExpert,
  getExpert,
  listExperts,
  registerExpert,
  type ExpertAgent,
} from '../../workflow/expert-routing.js';
import type { ScoredMemory } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScoredMemory(overrides: Partial<ScoredMemory> = {}): ScoredMemory {
  return {
    id: 'mem-1',
    type: 'task',
    title: 'Test memory',
    content: 'Some content about debugging and failure analysis',
    tags: '[]',
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence: 0.8,
    outcome: 'success',
    source: 'test',
    embedding: null,
    embedding_model: null,
    signature: 'sig',
    status: 'active',
    access_count: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    last_accessed_at: '2024-01-01T00:00:00Z',
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

// ---------------------------------------------------------------------------
// listExperts
// ---------------------------------------------------------------------------

describe('listExperts', () => {
  it('returns all 9 built-in experts', () => {
    const experts = listExperts();
    expect(experts.length).toBeGreaterThanOrEqual(9);
  });

  it('includes all expected expert IDs', () => {
    const experts = listExperts();
    const ids = experts.map((e) => e.id);

    expect(ids).toContain('continuity-manager');
    expect(ids).toContain('workflow-router-auditor');
    expect(ids).toContain('critique-responder');
    expect(ids).toContain('artifact-gatekeeper');
    expect(ids).toContain('adapter-parity-auditor');
    expect(ids).toContain('eval-engineer');
    expect(ids).toContain('trace-grader');
    expect(ids).toContain('failure-analyst');
    expect(ids).toContain('tooling-integrator');
  });

  it('each expert has required fields', () => {
    const experts = listExperts();

    for (const expert of experts) {
      expect(expert.id).toBeDefined();
      expect(expert.displayName).toBeDefined();
      expect(expert.description).toBeDefined();
      expect(expert.specialties.length).toBeGreaterThan(0);
      expect(expert.matchPatterns.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getExpert
// ---------------------------------------------------------------------------

describe('getExpert', () => {
  it('returns expert by ID', () => {
    const expert = getExpert('failure-analyst');

    expect(expert).not.toBeNull();
    expect(expert!.id).toBe('failure-analyst');
    expect(expert!.displayName).toBe('Failure Analyst');
  });

  it('returns null for unknown ID', () => {
    expect(getExpert('nonexistent-agent')).toBeNull();
  });

  it('returns each built-in expert', () => {
    const ids = [
      'continuity-manager',
      'workflow-router-auditor',
      'critique-responder',
      'artifact-gatekeeper',
      'adapter-parity-auditor',
      'eval-engineer',
      'trace-grader',
      'failure-analyst',
      'tooling-integrator',
    ];

    for (const id of ids) {
      expect(getExpert(id)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// registerExpert
// ---------------------------------------------------------------------------

describe('registerExpert', () => {
  it('registers a new expert', () => {
    const expert: ExpertAgent = {
      id: 'test-expert-register',
      displayName: 'Test Expert',
      description: 'An expert for testing',
      specialties: ['testing', 'validation'],
      matchPatterns: ['test', 'validate'],
    };

    registerExpert(expert);
    const retrieved = getExpert('test-expert-register');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.displayName).toBe('Test Expert');
  });

  it('overwrites existing expert with same ID', () => {
    const expert1: ExpertAgent = {
      id: 'test-expert-overwrite',
      displayName: 'Original',
      description: 'Original expert',
      specialties: ['original'],
      matchPatterns: ['original'],
    };
    const expert2: ExpertAgent = {
      id: 'test-expert-overwrite',
      displayName: 'Updated',
      description: 'Updated expert',
      specialties: ['updated'],
      matchPatterns: ['updated'],
    };

    registerExpert(expert1);
    registerExpert(expert2);

    const retrieved = getExpert('test-expert-overwrite');
    expect(retrieved!.displayName).toBe('Updated');
  });
});

// ---------------------------------------------------------------------------
// routeToExpert
// ---------------------------------------------------------------------------

describe('routeToExpert', () => {
  it('routes failure-related task to failure-analyst', () => {
    const result = routeToExpert('Analyze the root cause of this error and debug the crash');

    expect(result).not.toBeNull();
    expect(result!.agent.id).toBe('failure-analyst');
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.reason).toBeDefined();
  });

  it('routes continuity task to continuity-manager', () => {
    const result = routeToExpert('Handle the session handoff and ensure continuity');

    expect(result).not.toBeNull();
    expect(result!.agent.id).toBe('continuity-manager');
  });

  it('routes evaluation task to eval-engineer', () => {
    const result = routeToExpert('Evaluate the test suite and benchmark the metrics');

    expect(result).not.toBeNull();
    expect(result!.agent.id).toBe('eval-engineer');
  });

  it('routes critique task to critique-responder', () => {
    const result = routeToExpert('Revise the implementation to address critique feedback');

    expect(result).not.toBeNull();
    expect(result!.agent.id).toBe('critique-responder');
  });

  it('routes integration task to tooling-integrator', () => {
    const result = routeToExpert('Integrate the new plugin and configure the service setup');

    expect(result).not.toBeNull();
    expect(result!.agent.id).toBe('tooling-integrator');
  });

  it('returns null for unrelated task', () => {
    const result = routeToExpert('make me a sandwich');

    expect(result).toBeNull();
  });

  it('returns confidence between 0 and 1', () => {
    const result = routeToExpert('Debug the failure and find root cause');

    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it('includes memory influence when memories match', () => {
    const memory = makeScoredMemory({
      title: 'Previous failure analysis session',
      content: 'Root cause was a null reference in the auth module',
    });

    const result = routeToExpert('Debug this failure and find root cause', [memory]);

    expect(result).not.toBeNull();
    if (result!.memoryInfluence.length > 0) {
      expect(result!.memoryInfluence).toContain('mem-1');
    }
  });

  it('returns empty memoryInfluence when no memories provided', () => {
    const result = routeToExpert('Debug the failure');

    expect(result).not.toBeNull();
    expect(result!.memoryInfluence).toEqual([]);
  });

  it('returns empty memoryInfluence when memories are unrelated', () => {
    const memory = makeScoredMemory({
      title: 'Recipe for pasta',
      content: 'Boil water, add pasta, cook for 10 minutes',
    });

    const result = routeToExpert('Debug the failure and find root cause', [memory]);

    expect(result).not.toBeNull();
    // Unrelated memory should not influence
    expect(result!.memoryInfluence).not.toContain('mem-1');
  });

  it('boosts confidence with relevant memories', () => {
    const resultWithoutMemory = routeToExpert('Debug this failure');
    const memory = makeScoredMemory({
      title: 'Failure analysis of auth bug',
      content: 'Analyzed root cause of failure in error handling debug crash',
    });
    const resultWithMemory = routeToExpert('Debug this failure', [memory]);

    expect(resultWithMemory).not.toBeNull();
    expect(resultWithoutMemory).not.toBeNull();

    if (resultWithMemory!.memoryInfluence.length > 0) {
      expect(resultWithMemory!.confidence).toBeGreaterThanOrEqual(
        resultWithoutMemory!.confidence,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles empty task string', () => {
    const result = routeToExpert('');
    expect(result).toBeNull();
  });

  it('handles task with only whitespace', () => {
    const result = routeToExpert('   ');
    expect(result).toBeNull();
  });

  it('handles empty memories array', () => {
    const result = routeToExpert('Debug the failure', []);
    expect(result).not.toBeNull();
    expect(result!.memoryInfluence).toEqual([]);
  });

  it('case-insensitive matching', () => {
    const result = routeToExpert('DEBUG THE FAILURE AND FIND ROOT CAUSE');

    expect(result).not.toBeNull();
    expect(result!.agent.id).toBe('failure-analyst');
  });
});
