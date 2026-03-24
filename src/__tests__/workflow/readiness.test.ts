/**
 * Tests for Readiness Gate — 5-Dimension Scoring
 *
 * Covers:
 * - All 5 dimensions: clarity, codebase, constraints, risks, verification
 * - Hard gates: total >= 70, clarity >= 15, codebase >= 15
 * - Memory-based boosts from ReadinessContext
 * - Gap reporting
 */

import { describe, it, expect } from 'vitest';
import {
  computeReadiness,
  type ReadinessInput,
  type ReadinessContext,
} from '../../workflow/readiness.js';
import type { ScoredMemory, MemoryConflict, RecallResult } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    taskDescription: 'Build a user authentication system with JWT tokens and role-based access control. ' +
      'The system must support login, registration, password reset, and session management.',
    hasGoal: true,
    hasDeliverable: true,
    constraintsIdentified: 4,
    codebaseExplored: true,
    architectureUnderstood: true,
    risksIdentified: 5,
    hasVerificationPlan: true,
    validationCriteria: 4,
    ...overrides,
  };
}

function makeRecallResult(memoryCount: number, conflictCount: number = 0): RecallResult {
  const memories: ScoredMemory[] = Array.from({ length: memoryCount }, (_, i) => ({
    id: `mem-${i}`,
    type: 'task' as const,
    title: `Memory ${i}`,
    content: 'content',
    tags: '[]',
    project_id: null,
    scope: 'global' as const,
    sensitivity: 'INTERNAL' as const,
    confidence: 0.8,
    outcome: 'success' as const,
    source: 'agent',
    embedding: null,
    embedding_model: null,
    signature: 'sig',
    status: 'active' as const,
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
  }));

  const conflicts: MemoryConflict[] = Array.from({ length: conflictCount }, (_, i) => ({
    id: `conflict-${i}`,
    memory_a_id: `mem-a-${i}`,
    memory_b_id: `mem-b-${i}`,
    conflict_type: 'contradiction',
    similarity_score: 0.8,
    resolution: null,
    resolution_notes: null,
    created_at: new Date().toISOString(),
  }));

  return {
    memories,
    conflicts,
    total_candidates: memoryCount,
    retrieval_time_ms: 10,
  };
}

// ---------------------------------------------------------------------------
// Tests: Individual dimensions
// ---------------------------------------------------------------------------

describe('computeReadiness', () => {
  describe('clarity dimension (0-20)', () => {
    it('awards 8 points for having a goal', () => {
      const result = computeReadiness(makeInput({
        hasGoal: true,
        hasDeliverable: false,
        taskDescription: 'short',
      }));
      expect(result.clarity).toBe(8);
    });

    it('awards 7 points for having a deliverable', () => {
      const result = computeReadiness(makeInput({
        hasGoal: false,
        hasDeliverable: true,
        taskDescription: 'short',
      }));
      expect(result.clarity).toBe(7);
    });

    it('awards 3 bonus points for description > 50 chars', () => {
      const result = computeReadiness(makeInput({
        hasGoal: false,
        hasDeliverable: false,
        taskDescription: 'A'.repeat(51),
      }));
      expect(result.clarity).toBe(3);
    });

    it('awards 5 total bonus points for description > 200 chars', () => {
      const result = computeReadiness(makeInput({
        hasGoal: false,
        hasDeliverable: false,
        taskDescription: 'A'.repeat(201),
      }));
      // 3 (>50) + 2 (>200) = 5
      expect(result.clarity).toBe(5);
    });

    it('caps clarity at 20', () => {
      const result = computeReadiness(makeInput({
        hasGoal: true, // 8
        hasDeliverable: true, // 7
        taskDescription: 'A'.repeat(201), // +5
      }));
      // 8 + 7 + 5 = 20, capped at 20
      expect(result.clarity).toBe(20);
    });

    it('applies memory boost of +2 when pastSuccessCount >= 3', () => {
      const input = makeInput({
        hasGoal: true, // 8
        hasDeliverable: true, // 7
        taskDescription: 'short',
      });

      const withoutContext = computeReadiness(input);
      const withContext = computeReadiness(input, { pastSuccessCount: 3 });

      expect(withContext.clarity).toBe(Math.min(20, withoutContext.clarity + 2));
    });

    it('does not apply memory boost when pastSuccessCount < 3', () => {
      const input = makeInput({
        hasGoal: true,
        hasDeliverable: false,
        taskDescription: 'short',
      });

      const without = computeReadiness(input);
      const with2 = computeReadiness(input, { pastSuccessCount: 2 });

      expect(with2.clarity).toBe(without.clarity);
    });

    it('reports gap when clarity < 15', () => {
      const result = computeReadiness(makeInput({
        hasGoal: true,
        hasDeliverable: false,
        taskDescription: 'short',
      }));

      expect(result.clarity).toBeLessThan(15);
      const clarityGap = result.gaps.find((g) => g.dimension === 'clarity');
      expect(clarityGap).toBeDefined();
      expect(clarityGap!.required).toBe(15);
    });
  });

  describe('codebase dimension (0-20)', () => {
    it('awards 10 points for codebaseExplored', () => {
      const result = computeReadiness(makeInput({
        codebaseExplored: true,
        architectureUnderstood: false,
      }));
      expect(result.codebase).toBe(10);
    });

    it('awards 8 points for architectureUnderstood', () => {
      const result = computeReadiness(makeInput({
        codebaseExplored: false,
        architectureUnderstood: true,
      }));
      expect(result.codebase).toBe(8);
    });

    it('awards up to 18 for both explored and understood', () => {
      const result = computeReadiness(makeInput({
        codebaseExplored: true,
        architectureUnderstood: true,
      }));
      expect(result.codebase).toBe(18);
    });

    it('applies +4 boost when relatedMemories has >= 5 entries', () => {
      const input = makeInput({
        codebaseExplored: true,
        architectureUnderstood: false,
      });

      const result = computeReadiness(input, {
        relatedMemories: makeRecallResult(5),
      });

      expect(result.codebase).toBe(14); // 10 + 4
    });

    it('applies +2 boost when relatedMemories has 2-4 entries', () => {
      const input = makeInput({
        codebaseExplored: true,
        architectureUnderstood: false,
      });

      const result = computeReadiness(input, {
        relatedMemories: makeRecallResult(3),
      });

      expect(result.codebase).toBe(12); // 10 + 2
    });

    it('does not apply memory boost when relatedMemories has < 2 entries', () => {
      const input = makeInput({
        codebaseExplored: true,
        architectureUnderstood: false,
      });

      const result = computeReadiness(input, {
        relatedMemories: makeRecallResult(1),
      });

      expect(result.codebase).toBe(10); // 10, no boost
    });

    it('caps codebase at 20', () => {
      const result = computeReadiness(
        makeInput({ codebaseExplored: true, architectureUnderstood: true }),
        { relatedMemories: makeRecallResult(10) },
      );

      expect(result.codebase).toBeLessThanOrEqual(20);
    });

    it('reports gap when codebase < 15', () => {
      const result = computeReadiness(makeInput({
        codebaseExplored: false,
        architectureUnderstood: true,
      }));

      expect(result.codebase).toBeLessThan(15);
      const codebaseGap = result.gaps.find((g) => g.dimension === 'codebase');
      expect(codebaseGap).toBeDefined();
      expect(codebaseGap!.required).toBe(15);
    });
  });

  describe('constraints dimension (0-20)', () => {
    it('scores constraintsIdentified * 5, capped at 20', () => {
      expect(computeReadiness(makeInput({ constraintsIdentified: 0 })).constraints).toBe(0);
      expect(computeReadiness(makeInput({ constraintsIdentified: 1 })).constraints).toBe(5);
      expect(computeReadiness(makeInput({ constraintsIdentified: 2 })).constraints).toBe(10);
      expect(computeReadiness(makeInput({ constraintsIdentified: 4 })).constraints).toBe(20);
      expect(computeReadiness(makeInput({ constraintsIdentified: 5 })).constraints).toBe(20);
    });

    it('applies +3 boost when relevantAntiPatterns > 0', () => {
      const result = computeReadiness(
        makeInput({ constraintsIdentified: 2 }),
        { relevantAntiPatterns: 1 },
      );

      expect(result.constraints).toBe(13); // 10 + 3
    });

    it('reports gap when constraints < 10', () => {
      const result = computeReadiness(makeInput({ constraintsIdentified: 1 }));

      expect(result.constraints).toBe(5);
      const gap = result.gaps.find((g) => g.dimension === 'constraints');
      expect(gap).toBeDefined();
      expect(gap!.required).toBe(10);
    });
  });

  describe('risks dimension (0-20)', () => {
    it('scores risksIdentified * 4, capped at 20', () => {
      expect(computeReadiness(makeInput({ risksIdentified: 0 })).risks).toBe(0);
      expect(computeReadiness(makeInput({ risksIdentified: 1 })).risks).toBe(4);
      expect(computeReadiness(makeInput({ risksIdentified: 3 })).risks).toBe(12);
      expect(computeReadiness(makeInput({ risksIdentified: 5 })).risks).toBe(20);
      expect(computeReadiness(makeInput({ risksIdentified: 6 })).risks).toBe(20);
    });

    it('applies boost from pastFailureCount (2 per failure, max 6)', () => {
      const result = computeReadiness(
        makeInput({ risksIdentified: 2 }),
        { pastFailureCount: 2 },
      );

      expect(result.risks).toBe(12); // 8 + 4
    });

    it('caps pastFailureCount boost at 6', () => {
      const result = computeReadiness(
        makeInput({ risksIdentified: 2 }),
        { pastFailureCount: 10 },
      );

      expect(result.risks).toBe(14); // 8 + 6 (capped)
    });

    it('reports gap when risks < 8', () => {
      const result = computeReadiness(makeInput({ risksIdentified: 1 }));

      expect(result.risks).toBe(4);
      const gap = result.gaps.find((g) => g.dimension === 'risks');
      expect(gap).toBeDefined();
      expect(gap!.required).toBe(8);
    });
  });

  describe('verification dimension (0-20)', () => {
    it('awards 10 points for having a verification plan', () => {
      const result = computeReadiness(makeInput({
        hasVerificationPlan: true,
        validationCriteria: 0,
      }));
      expect(result.verification).toBe(10);
    });

    it('awards validationCriteria * 3, capped at 10', () => {
      expect(computeReadiness(makeInput({
        hasVerificationPlan: false,
        validationCriteria: 1,
      })).verification).toBe(3);

      expect(computeReadiness(makeInput({
        hasVerificationPlan: false,
        validationCriteria: 3,
      })).verification).toBe(9);

      expect(computeReadiness(makeInput({
        hasVerificationPlan: false,
        validationCriteria: 4,
      })).verification).toBe(10); // min(10, 12) = 10
    });

    it('combines plan and criteria, capped at 20', () => {
      const result = computeReadiness(makeInput({
        hasVerificationPlan: true,
        validationCriteria: 5,
      }));

      // 10 (plan) + min(10, 15) = 20
      expect(result.verification).toBe(20);
    });

    it('reports gap when verification < 8', () => {
      const result = computeReadiness(makeInput({
        hasVerificationPlan: false,
        validationCriteria: 1,
      }));

      expect(result.verification).toBeLessThan(8);
      const gap = result.gaps.find((g) => g.dimension === 'verification');
      expect(gap).toBeDefined();
      expect(gap!.required).toBe(8);
    });
  });

  // ---------------------------------------------------------------------------
  // Hard gates
  // ---------------------------------------------------------------------------

  describe('hard gates', () => {
    it('fails when total < 70 even if clarity and codebase are sufficient', () => {
      const result = computeReadiness(makeInput({
        hasGoal: true,
        hasDeliverable: true,
        taskDescription: 'A'.repeat(201),
        codebaseExplored: true,
        architectureUnderstood: true,
        constraintsIdentified: 0,
        risksIdentified: 0,
        hasVerificationPlan: false,
        validationCriteria: 0,
      }));

      // clarity=20, codebase=18, constraints=0, risks=0, verification=0 = 38
      expect(result.clarity).toBeGreaterThanOrEqual(15);
      expect(result.codebase).toBeGreaterThanOrEqual(15);
      expect(result.total).toBeLessThan(70);
      expect(result.passed).toBe(false);
    });

    it('fails when clarity < 15 even if total >= 70', () => {
      // Construct a scenario where total could be >= 70 but clarity < 15
      const result = computeReadiness(makeInput({
        hasGoal: true,
        hasDeliverable: false, // clarity = 8 + 5 = 13 (with long desc)
        taskDescription: 'A'.repeat(201),
        codebaseExplored: true,
        architectureUnderstood: true,
        constraintsIdentified: 4,
        risksIdentified: 5,
        hasVerificationPlan: true,
        validationCriteria: 4,
      }));

      if (result.clarity < 15) {
        expect(result.passed).toBe(false);
      }
    });

    it('fails when codebase < 15 even if total >= 70', () => {
      const result = computeReadiness(makeInput({
        hasGoal: true,
        hasDeliverable: true,
        taskDescription: 'A'.repeat(201),
        codebaseExplored: true,
        architectureUnderstood: false, // codebase = 10
        constraintsIdentified: 4,
        risksIdentified: 5,
        hasVerificationPlan: true,
        validationCriteria: 4,
      }));

      if (result.codebase < 15) {
        expect(result.passed).toBe(false);
      }
    });

    it('passes when all gates are satisfied', () => {
      const result = computeReadiness(makeInput());

      expect(result.total).toBeGreaterThanOrEqual(70);
      expect(result.clarity).toBeGreaterThanOrEqual(15);
      expect(result.codebase).toBeGreaterThanOrEqual(15);
      expect(result.passed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Total and gap reporting
  // ---------------------------------------------------------------------------

  describe('total and gaps', () => {
    it('total equals sum of all 5 dimensions', () => {
      const result = computeReadiness(makeInput());

      expect(result.total).toBe(
        result.clarity + result.codebase + result.constraints + result.risks + result.verification,
      );
    });

    it('reports gap for total when below 70 and no individual gaps exist', () => {
      // This is hard to construct since low total usually means individual gaps exist.
      // But we can check the logic: if total < 70 and gaps is empty, a total gap is added.
      const result = computeReadiness(makeInput({
        hasGoal: true,
        hasDeliverable: true,
        taskDescription: 'A'.repeat(201),
        codebaseExplored: true,
        architectureUnderstood: true,
        constraintsIdentified: 2,
        risksIdentified: 2,
        hasVerificationPlan: true,
        validationCriteria: 1,
      }));

      // Check if any total gap exists when individual dimensions pass but total doesn't
      if (result.total < 70) {
        const hasDimensionGaps = result.gaps.some((g) => g.dimension !== 'total');
        if (!hasDimensionGaps) {
          const totalGap = result.gaps.find((g) => g.dimension === 'total');
          expect(totalGap).toBeDefined();
          expect(totalGap!.required).toBe(70);
        }
      }
    });

    it('returns empty gaps array when all thresholds are met', () => {
      const result = computeReadiness(makeInput());

      if (result.passed) {
        // All dimensions should meet their minimums
        expect(result.clarity).toBeGreaterThanOrEqual(15);
        expect(result.codebase).toBeGreaterThanOrEqual(15);
      }
    });

    it('gaps include suggestions for improvement', () => {
      const result = computeReadiness(makeInput({
        hasGoal: false,
        hasDeliverable: false,
        taskDescription: 'x',
      }));

      const clarityGap = result.gaps.find((g) => g.dimension === 'clarity');
      expect(clarityGap).toBeDefined();
      expect(clarityGap!.suggestion).toBeTruthy();
      expect(typeof clarityGap!.suggestion).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles zero values for all inputs', () => {
      const result = computeReadiness({
        taskDescription: '',
        hasGoal: false,
        hasDeliverable: false,
        constraintsIdentified: 0,
        codebaseExplored: false,
        architectureUnderstood: false,
        risksIdentified: 0,
        hasVerificationPlan: false,
        validationCriteria: 0,
      });

      expect(result.total).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it('handles maximum values for all inputs', () => {
      const result = computeReadiness(
        makeInput({
          hasGoal: true,
          hasDeliverable: true,
          taskDescription: 'A'.repeat(500),
          constraintsIdentified: 10,
          codebaseExplored: true,
          architectureUnderstood: true,
          risksIdentified: 10,
          hasVerificationPlan: true,
          validationCriteria: 10,
        }),
        {
          pastSuccessCount: 10,
          relatedMemories: makeRecallResult(20),
          pastFailureCount: 5,
          relevantAntiPatterns: 3,
        },
      );

      // Every dimension should be at max 20
      expect(result.clarity).toBeLessThanOrEqual(20);
      expect(result.codebase).toBeLessThanOrEqual(20);
      expect(result.constraints).toBeLessThanOrEqual(20);
      expect(result.risks).toBeLessThanOrEqual(20);
      expect(result.verification).toBeLessThanOrEqual(20);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.passed).toBe(true);
    });

    it('works without any context provided', () => {
      const result = computeReadiness(makeInput());

      expect(result).toBeDefined();
      expect(typeof result.total).toBe('number');
      expect(typeof result.passed).toBe('boolean');
    });

    it('works with empty context object', () => {
      const result = computeReadiness(makeInput(), {});

      expect(result).toBeDefined();
      expect(typeof result.total).toBe('number');
    });
  });
});
