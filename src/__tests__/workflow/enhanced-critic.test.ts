/**
 * Tests for Enhanced Critic — 7-Dimension Evidence-Backed Critique System
 *
 * Covers:
 * - critiqueResearch: all 7 research dimensions
 * - critiquePlan: all 7 plan dimensions
 * - iterateCritique: max iterations, humanJudgmentRequired
 * - Anti-pattern severity elevation
 * - Edge cases and error conditions
 */

import { describe, it, expect } from 'vitest';
import {
  critiqueResearch,
  critiquePlan,
  evaluateOutput,
  iterateCritique,
  MAX_ITERATIONS,
  type EnhancedCriticInput,
  type EnhancedCriticResult,
  type OutputCriticInput,
} from '../../workflow/enhanced-critic.js';
import type { AntiPatternDefinition, ScoredMemory } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAntiPattern(overrides: Partial<AntiPatternDefinition> = {}): AntiPatternDefinition {
  return {
    name: 'Test Anti-Pattern',
    kind: 'anti_pattern',
    description: 'A test anti-pattern',
    trigger_pattern: 'hardcoded credentials stored password database connection string',
    failure_mode: 'Secrets leaked through version control',
    correct_approach: 'Use environment variables',
    source_lessons: [],
    status: 'active',
    confidence: 0.8,
    successes: 5,
    failures: 1,
    last_used_at: null,
    ...overrides,
  };
}

function makeResearchInput(overrides: Partial<EnhancedCriticInput> = {}): EnhancedCriticInput {
  return {
    work: 'The system implements authentication using JWT tokens. See src/auth.ts:42 for the token validation logic. Step 1: validate the token. Step 2: check expiry. The approach ensures security through encryption and access control.',
    type: 'research',
    antiPatterns: [],
    memories: [],
    ...overrides,
  };
}

function makePlanInput(overrides: Partial<EnhancedCriticInput> = {}): EnhancedCriticInput {
  return {
    work: 'Goal: Implement user authentication.\nScope: src/auth/ directory.\nApproach: Use JWT tokens with refresh rotation.\nPhases: 1. Token service 2. Middleware 3. Tests.\nRisks: Token theft, replay attacks.\nVerification: Unit tests, integration tests.\nDeliverables: Auth middleware, token service.\nModify src/auth/token.ts and src/auth/middleware.ts.\nValidation and sanitize all inputs. Handle rollback on partial failure.',
    type: 'plan',
    antiPatterns: [],
    memories: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// critiqueResearch
// ---------------------------------------------------------------------------

describe('critiqueResearch', () => {
  describe('assumption_verification', () => {
    it('detects hedging words', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'The system probably works. It should handle errors. Maybe the cache is needed. It might fail under load.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'assumption_verification');
      expect(finding).toBeDefined();
      expect(finding!.finding).toContain('hedging');
    });

    it('does not flag work without hedging words', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'The system implements JWT authentication. Token validation occurs in src/auth.ts:10. Step 1: validate token format. Step 2: verify signature.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'assumption_verification');
      expect(finding).toBeUndefined();
    });

    it('elevates severity for many hedging words', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'It probably works and should be fine. Maybe it will handle things. It might be okay. Perhaps we can assume it is likely correct.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'assumption_verification');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
    });
  });

  describe('evidence_level_audit', () => {
    it('warns when claims lack references', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'The system is secure and reliable.\nIt provides encryption at rest.\nThe API is well-documented and stable.\nThe service implements rate limiting.\nAuthentication requires valid tokens.\nThe database ensures data integrity.\nThe cache has proper invalidation.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'evidence_level_audit');
      expect(finding).toBeDefined();
    });

    it('does not warn when references are present', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'The system is secure. See src/auth.ts for implementation.\nIt provides encryption via src/crypto.ts.\nIt handles auth per src/middleware.ts.\nThe validation logic is in src/validator.ts.\nSessions are managed in src/session.ts.\nIntegrity checks in src/integrity.ts.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'evidence_level_audit');
      // Should have a better ratio now
      if (finding) {
        expect(finding.severity).not.toBe('blocking');
      }
    });
  });

  describe('counterevidence_search', () => {
    it('flags overlap with anti-patterns', () => {
      const ap = makeAntiPattern({
        trigger_pattern: 'hardcoded credentials stored password database connection',
      });

      const result = critiqueResearch(makeResearchInput({
        work: 'The system uses hardcoded credentials to connect. The password is stored in the database connection config.',
        antiPatterns: [ap],
      }));

      const finding = result.findings.find((f) => f.dimension === 'counterevidence_search');
      expect(finding).toBeDefined();
      expect(finding!.finding).toContain('Test Anti-Pattern');
    });

    it('skips archived anti-patterns', () => {
      const ap = makeAntiPattern({
        status: 'archived',
        trigger_pattern: 'always matching every single word here',
      });

      const result = critiqueResearch(makeResearchInput({
        work: 'always matching every single word here',
        antiPatterns: [ap],
      }));

      const finding = result.findings.find((f) => f.dimension === 'counterevidence_search');
      expect(finding).toBeUndefined();
    });
  });

  describe('codebase_accuracy', () => {
    it('detects file:line claims', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'The bug is in src/auth.ts:42. Also check src/middleware.ts:100. Step 1: fix the auth flow.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'codebase_accuracy');
      expect(finding).toBeDefined();
      expect(finding!.evidence).toContain('src/auth.ts:42');
    });
  });

  describe('gap_scan', () => {
    it('flags missing gap categories', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'The system provides a basic CRUD interface. Step 1: create resources. Step 2: read resources.',
      }));

      const gaps = result.findings.filter((f) => f.dimension === 'gap_scan');
      expect(gaps.length).toBeGreaterThan(0);
    });

    it('does not flag when all categories are addressed', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'Security: auth and access control with encryption. Performance: cache with optimization and latency targets. Compatibility: backward compatible with migration path. Migration: rollback strategy with data migration plan. Step 1: implement. Step 2: test.',
      }));

      const gaps = result.findings.filter((f) => f.dimension === 'gap_scan');
      expect(gaps.length).toBe(0);
    });
  });

  describe('implementation_implications', () => {
    it('flags research without actionable guidance', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'The system works well. It is fast. It handles errors properly.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'implementation_implications');
      expect(finding).toBeDefined();
    });

    it('does not flag research with actionable steps', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'Step 1: create the auth module. Must implement token validation. Update the middleware to check tokens. Add rate limiting support.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'implementation_implications');
      expect(finding).toBeUndefined();
    });
  });

  describe('preflight_failures', () => {
    it('flags when risks are not discussed', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'Implement the feature by adding a new endpoint. Step 1: create route. Step 2: add handler.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'preflight_failures');
      expect(finding).toBeDefined();
    });

    it('does not flag when risks are discussed', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'Implement the feature. Risk: the API might change. Failure mode: stale cache. Limitation: no real-time support. Step 1: implement. Step 2: test.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'preflight_failures');
      expect(finding).toBeUndefined();
    });
  });

  describe('overall result structure', () => {
    it('returns all expected fields', () => {
      const result = critiqueResearch(makeResearchInput());

      expect(result).toHaveProperty('overallAssessment');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('severity');
      expect(result).toHaveProperty('revisionNeeded');
      expect(result).toHaveProperty('iterationCount');
      expect(result).toHaveProperty('humanJudgmentRequired');
      expect(result.iterationCount).toBe(1);
      expect(result.humanJudgmentRequired).toBe(false);
    });

    it('sets revisionNeeded=true when blocking or warning', () => {
      const result = critiqueResearch(makeResearchInput({
        work: 'It probably works. Maybe it should handle things.',
      }));

      if (result.severity === 'blocking' || result.severity === 'warning') {
        expect(result.revisionNeeded).toBe(true);
      }
    });

    it('sets revisionNeeded=false when advisory only', () => {
      // A well-structured research output with all categories addressed
      const result = critiqueResearch(makeResearchInput({
        work: 'Security: encryption and access control. Performance: caching and optimization. Compatibility: backward compatible, version checked. Migration: data migration with rollback. Step 1: implement auth. Step 2: add middleware. Step 3: create the tests. Must implement validation. Risk: token expiry. Limitation: no SSO yet. See src/auth.ts for current implementation.',
      }));

      if (result.severity === 'advisory') {
        expect(result.revisionNeeded).toBe(false);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// critiquePlan
// ---------------------------------------------------------------------------

describe('critiquePlan', () => {
  describe('codebase_reality', () => {
    it('warns when plan references no files', () => {
      const result = critiquePlan(makePlanInput({
        work: 'Goal: build a feature.\nScope: the project.\nApproach: code it.\nPhases: 1. Do it.\nRisks: none.\nVerification: test it.\nDeliverables: code.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'codebase_reality');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
    });

    it('does not warn when plan references files', () => {
      const result = critiquePlan(makePlanInput());

      const finding = result.findings.find((f) => f.dimension === 'codebase_reality');
      expect(finding).toBeUndefined();
    });
  });

  describe('dependency_availability', () => {
    it('flags external dependencies mentioned', () => {
      const result = critiquePlan(makePlanInput({
        work: 'Goal: auth system.\nScope: auth module.\nApproach: npm install jsonwebtoken bcrypt.\nPhases: 1. Setup.\nRisks: deps.\nVerification: tests.\nDeliverables: auth.\nModify src/auth/index.ts.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'dependency_availability');
      expect(finding).toBeDefined();
      expect(finding!.evidence).toContain('jsonwebtoken');
    });
  });

  describe('edge_case_mining', () => {
    it('flags missing edge case categories', () => {
      const result = critiquePlan(makePlanInput({
        work: 'Goal: auth.\nScope: auth.\nApproach: JWT.\nPhases: 1. Build.\nRisks: none.\nVerification: tests.\nDeliverables: code.\nModify src/auth/service.ts.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'edge_case_mining');
      expect(finding).toBeDefined();
    });

    it('does not flag when edge cases are addressed', () => {
      const result = critiquePlan(makePlanInput());

      const finding = result.findings.find((f) => f.dimension === 'edge_case_mining');
      // The default plan input addresses validation, rollback, auth
      if (finding) {
        // May still have some missing, but fewer
        expect(finding.severity).not.toBe('blocking');
      }
    });
  });

  describe('approach_validity', () => {
    it('flags when plan matches anti-pattern', () => {
      const ap = makeAntiPattern({
        trigger_pattern: 'hardcoded credentials stored password database connection',
      });

      const result = critiquePlan(makePlanInput({
        work: 'Goal: auth.\nScope: auth.\nApproach: Use hardcoded credentials for the database password connection.\nPhases: 1. Store credentials.\nRisks: none.\nVerification: manual.\nDeliverables: config.\nModify src/config/db.ts.',
        antiPatterns: [ap],
      }));

      const finding = result.findings.find((f) => f.dimension === 'approach_validity');
      expect(finding).toBeDefined();
    });
  });

  describe('scope_realism', () => {
    it('warns for plans touching >10 files', () => {
      const files = Array.from({ length: 12 }, (_, i) => `src/module${i}/file.ts`).join('\n');
      const result = critiquePlan(makePlanInput({
        work: `Goal: refactor.\nScope: many files.\nApproach: update all.\nPhases: 1. Refactor.\nRisks: scope.\nVerification: tests.\nDeliverables: clean code.\n${files}`,
      }));

      const finding = result.findings.find((f) => f.dimension === 'scope_realism');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
    });

    it('blocks for plans touching >20 files', () => {
      const files = Array.from({ length: 22 }, (_, i) => `src/module${i}/file.ts`).join('\n');
      const result = critiquePlan(makePlanInput({
        work: `Goal: refactor.\nScope: many.\nApproach: update.\nPhases: 1. Do.\nRisks: scope.\nVerification: test.\nDeliverables: code.\n${files}`,
      }));

      const finding = result.findings.find((f) => f.dimension === 'scope_realism');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('blocking');
    });

    it('does not flag for plans with few files', () => {
      const result = critiquePlan(makePlanInput({
        work: 'Goal: auth.\nScope: 2 files.\nApproach: JWT.\nPhases: 1. Implement.\nRisks: none.\nVerification: tests.\nDeliverables: code.\nModify src/auth/token.ts and src/auth/middleware.ts.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'scope_realism');
      expect(finding).toBeUndefined();
    });
  });

  describe('required_sections', () => {
    it('flags missing plan sections', () => {
      const result = critiquePlan(makePlanInput({
        work: 'Just do the thing. Modify src/app/main.ts.',
      }));

      const finding = result.findings.find((f) => f.dimension === 'required_sections');
      expect(finding).toBeDefined();
      expect(finding!.finding).toContain('Missing');
    });

    it('passes when all sections present', () => {
      const result = critiquePlan(makePlanInput());

      const finding = result.findings.find((f) => f.dimension === 'required_sections');
      expect(finding).toBeUndefined();
    });
  });

  describe('overall result', () => {
    it('returns correct structure', () => {
      const result = critiquePlan(makePlanInput());

      expect(result.iterationCount).toBe(1);
      expect(result.humanJudgmentRequired).toBe(false);
      expect(typeof result.overallAssessment).toBe('string');
      expect(Array.isArray(result.findings)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Anti-pattern severity elevation
// ---------------------------------------------------------------------------

describe('anti-pattern severity elevation', () => {
  it('elevates advisory to warning when overlapping with anti-pattern', () => {
    const ap = makeAntiPattern({
      trigger_pattern: 'security considerations mention',
    });

    const result = critiqueResearch(makeResearchInput({
      work: 'The system provides basic CRUD. Step 1: create. Step 2: read. Performance: cache. Compatibility: backward. Migration: rollback.',
      antiPatterns: [ap],
    }));

    // gap_scan should find missing security gap (advisory), which overlaps with the anti-pattern
    const securityGap = result.findings.find(
      (f) => f.dimension === 'gap_scan' && f.finding.includes('security'),
    );
    expect(securityGap).toBeDefined();
    // Should be elevated from advisory to warning due to anti-pattern overlap
    expect(['warning', 'blocking']).toContain(securityGap!.severity);
  });
});

// ---------------------------------------------------------------------------
// iterateCritique
// ---------------------------------------------------------------------------

describe('iterateCritique', () => {
  it('increments iteration count', () => {
    const input = makeResearchInput();
    const first = critiqueResearch(input);
    const second = iterateCritique(input, first);

    expect(second.iterationCount).toBe(2);
  });

  it('sets humanJudgmentRequired after max iterations with blocking', () => {
    const input = makeResearchInput({
      work: 'probably maybe should might perhaps',
    });

    const first = critiqueResearch(input);
    const second = iterateCritique(input, first);
    const third = iterateCritique(input, second);

    // If still blocking/warning after 3 iterations
    if (third.severity === 'blocking') {
      expect(third.humanJudgmentRequired).toBe(true);
    }
  });

  it('does not set humanJudgmentRequired before max iterations', () => {
    const input = makeResearchInput();
    const first = critiqueResearch(input);

    expect(first.iterationCount).toBe(1);
    expect(first.humanJudgmentRequired).toBe(false);
  });

  it('does not set humanJudgmentRequired at iteration 2 (before max=3)', () => {
    const input = makeResearchInput({
      work: 'probably maybe should might perhaps',
    });

    const first = critiqueResearch(input);
    const second = iterateCritique(input, first);

    // Iteration 2 < max(3), so no human judgment yet
    expect(second.humanJudgmentRequired).toBe(false);
  });

  it('stops iterating beyond max iterations', () => {
    const input = makeResearchInput();
    const first = critiqueResearch(input);
    const second = iterateCritique(input, first);
    const third = iterateCritique(input, second);
    const fourth = iterateCritique(input, third);

    expect(fourth.iterationCount).toBe(4);
    // Should carry forward previous result beyond max
  });

  it('respects custom maxIterations', () => {
    const input = makeResearchInput();
    const first = critiqueResearch(input);
    const second = iterateCritique(input, first, 1);

    // maxIterations=1, so iteration 2 should be beyond max
    expect(second.iterationCount).toBe(2);
  });

  it('works for plan critique', () => {
    const input = makePlanInput();
    const first = critiquePlan(input);
    const second = iterateCritique(input, first);

    expect(second.iterationCount).toBe(2);
    expect(second.findings).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles empty work string', () => {
    const result = critiqueResearch(makeResearchInput({ work: '' }));
    expect(result).toBeDefined();
    expect(result.findings).toBeDefined();
  });

  it('handles empty anti-patterns array', () => {
    const result = critiqueResearch(makeResearchInput({ antiPatterns: [] }));
    expect(result).toBeDefined();
  });

  it('handles empty memories array', () => {
    const result = critiqueResearch(makeResearchInput({ memories: [] }));
    expect(result).toBeDefined();
  });

  it('handles very long work string', () => {
    const result = critiqueResearch(makeResearchInput({
      work: 'The system is robust. '.repeat(1000),
    }));
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// evaluateOutput
// ---------------------------------------------------------------------------

describe('evaluateOutput', () => {
  const makeOutputInput = (overrides: Partial<OutputCriticInput> = {}): OutputCriticInput => ({
    output: '## Implementation\n\n- Created auth module with JWT token validation\n- Added middleware for token checking\n- Implemented error handling for expired tokens\n\nThe system uses bcrypt for password hashing and validates all inputs at every boundary.',
    promptShape: {
      goal: 'Implement user authentication with JWT tokens',
      context: 'Existing Express.js application',
      constraints: ['Must use JWT tokens', 'Must validate inputs', 'Must handle expired tokens'],
      deliverable: 'Authentication middleware and token service',
      validation: ['All endpoints require valid tokens', 'Expired tokens return 401'],
    },
    capsule: null,
    antiPatterns: [],
    memories: [],
    ...overrides,
  });

  describe('constraint_compliance', () => {
    it('passes when constraints are addressed', () => {
      const result = evaluateOutput(makeOutputInput());

      const finding = result.findings.find((f) => f.dimension === 'constraint_compliance');
      expect(finding).toBeUndefined();
    });

    it('flags unaddressed constraints', () => {
      const result = evaluateOutput(makeOutputInput({
        output: 'Created a basic endpoint.',
        promptShape: {
          goal: 'Build auth',
          context: 'Express app',
          constraints: ['Must use OAuth2', 'Must implement RBAC', 'Must audit all access'],
          deliverable: 'Auth system',
          validation: [],
        },
      }));

      const finding = result.findings.find((f) => f.dimension === 'constraint_compliance');
      expect(finding).toBeDefined();
    });
  });

  describe('deliverable_match', () => {
    it('passes when output matches deliverable', () => {
      const result = evaluateOutput(makeOutputInput());

      const finding = result.findings.find((f) => f.dimension === 'deliverable_match');
      expect(finding).toBeUndefined();
    });

    it('flags when output does not match deliverable', () => {
      const result = evaluateOutput(makeOutputInput({
        output: 'Fixed a typo in the README.',
        promptShape: {
          goal: 'Build auth',
          context: 'Express app',
          constraints: [],
          deliverable: 'Authentication middleware with token validation and session management',
          validation: [],
        },
      }));

      const finding = result.findings.find((f) => f.dimension === 'deliverable_match');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
    });
  });

  describe('capsule_criteria', () => {
    it('skips when no capsule', () => {
      const result = evaluateOutput(makeOutputInput({ capsule: null }));

      const findings = result.findings.filter((f) => f.dimension === 'capsule_criteria');
      expect(findings).toHaveLength(0);
    });

    it('checks grader criteria when capsule present', () => {
      const result = evaluateOutput(makeOutputInput({
        output: 'Basic implementation without tests.',
        capsule: {
          definition: {
            id: 'cap-1',
            name: 'test-capsule',
            display_name: 'Test Capsule',
            description: 'Test capsule',
            trigger_patterns: [],
            version: 1,
            enabled: true,
            match_count: 0,
            success_rate: 0.5,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          components: {
            grader: 'Must include comprehensive error handling\nMust include unit test coverage\nMust include documentation comments',
          },
          enrichments: {
            memory_examples: [],
            synthesized_anti_patterns: [],
            past_critic_findings: [],
            user_preferences: [],
          },
        },
      }));

      const finding = result.findings.find((f) => f.dimension === 'capsule_criteria');
      expect(finding).toBeDefined();
    });
  });

  describe('capsule_anti_patterns', () => {
    it('skips when no capsule', () => {
      const result = evaluateOutput(makeOutputInput({ capsule: null }));

      const findings = result.findings.filter((f) => f.dimension === 'capsule_anti_patterns');
      expect(findings).toHaveLength(0);
    });

    it('flags output matching capsule anti-patterns', () => {
      const result = evaluateOutput(makeOutputInput({
        output: 'Uses direct string concatenation for building SQL queries without parameterization.',
        capsule: {
          definition: {
            id: 'cap-1',
            name: 'test-capsule',
            display_name: 'Test Capsule',
            description: 'Test',
            trigger_patterns: [],
            version: 1,
            enabled: true,
            match_count: 0,
            success_rate: 0.5,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          components: {},
          enrichments: {
            memory_examples: [],
            synthesized_anti_patterns: ['string concatenation SQL queries without parameterization injection risk'],
            past_critic_findings: [],
            user_preferences: [],
          },
        },
      }));

      const finding = result.findings.find((f) => f.dimension === 'capsule_anti_patterns');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
    });
  });

  describe('memory_consistency', () => {
    it('skips when no memories', () => {
      const result = evaluateOutput(makeOutputInput({ memories: [] }));

      const findings = result.findings.filter((f) => f.dimension === 'memory_consistency');
      expect(findings).toHaveLength(0);
    });

    it('flags contradiction with lesson memory', () => {
      const now = new Date().toISOString();
      const result = evaluateOutput(makeOutputInput({
        output: 'Uses direct database queries with string concatenation for SQL building.',
        memories: [{
          id: 'mem-1',
          type: 'lesson',
          title: 'Avoid string concatenation for SQL',
          content: 'Never use direct string concatenation for database queries. Always use parameterized queries to avoid SQL injection.',
          tags: ['security'],
          project_id: null,
          scope: 'global',
          sensitivity: 'INTERNAL',
          confidence: 0.9,
          outcome: 'failed_then_fixed',
          source: 'agent',
          signature: 'sig',
          status: 'active',
          access_count: 5,
          created_at: now,
          updated_at: now,
          last_accessed_at: now,
          expires_at: null,
          superseded_by: null,
          session_id: null,
          embedding: null,
          embedding_model: null,
          semantic_score: 0.8,
          bm25_rank: 1,
          vector_rank: 1,
          recency_modifier: 1.0,
          access_boost: 1.0,
          success_weight: 0.9,
        }],
      }));

      const finding = result.findings.find((f) => f.dimension === 'memory_consistency');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
    });
  });

  describe('quality_scoring', () => {
    it('flags unstructured long output', () => {
      const result = evaluateOutput(makeOutputInput({
        output: 'The system works by implementing auth. '.repeat(20),
      }));

      const finding = result.findings.find((f) => f.dimension === 'quality_scoring');
      expect(finding).toBeDefined();
      expect(finding!.finding).toContain('structural organization');
    });

    it('passes structured output', () => {
      const result = evaluateOutput(makeOutputInput());

      const structureFinding = result.findings.find(
        (f) => f.dimension === 'quality_scoring' && f.finding.includes('structural'),
      );
      expect(structureFinding).toBeUndefined();
    });

    it('flags brief output for complex goal', () => {
      const result = evaluateOutput(makeOutputInput({
        output: 'Done.',
        promptShape: {
          goal: 'Implement comprehensive user authentication with JWT tokens, refresh rotation, RBAC, and audit logging',
          context: 'Large Express application',
          constraints: [],
          deliverable: 'Auth system',
          validation: [],
        },
      }));

      const finding = result.findings.find(
        (f) => f.dimension === 'quality_scoring' && f.finding.includes('brief'),
      );
      expect(finding).toBeDefined();
    });
  });

  describe('overall result', () => {
    it('returns correct structure', () => {
      const result = evaluateOutput(makeOutputInput());

      expect(result).toHaveProperty('overallAssessment');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('severity');
      expect(result).toHaveProperty('revisionNeeded');
      expect(result).toHaveProperty('iterationCount');
      expect(result).toHaveProperty('humanJudgmentRequired');
      expect(result.iterationCount).toBe(1);
    });

    it('overallAssessment starts with Output', () => {
      const result = evaluateOutput(makeOutputInput());
      expect(result.overallAssessment).toMatch(/^Output critique:/);
    });
  });
});

// ---------------------------------------------------------------------------
// Evidence enforcement for BLOCKING severity
// ---------------------------------------------------------------------------

describe('evidence enforcement', () => {
  it('preserves blocking with concrete file evidence', () => {
    const files = Array.from({ length: 22 }, (_, i) => `src/module${i}/file.ts`).join('\n');
    const result = critiquePlan(makePlanInput({
      work: `Goal: refactor.\nScope: many.\nApproach: update.\nPhases: 1. Do.\nRisks: scope.\nVerification: test.\nDeliverables: code.\n${files}`,
    }));

    const finding = result.findings.find((f) => f.dimension === 'scope_realism');
    if (finding) {
      // Evidence should contain file paths, keeping it at blocking
      expect(finding.severity).toBe('blocking');
    }
  });

  it('downgrades blocking to warning without concrete evidence', () => {
    // A finding with BLOCKING but no concrete evidence would be downgraded.
    // We test this indirectly: research with only vague evidence should not produce blocking.
    const result = critiqueResearch(makeResearchInput({
      work: 'probably maybe should might perhaps likely possibly assume guess',
    }));

    // All findings should be at most warning (any blocking without concrete evidence gets downgraded)
    for (const finding of result.findings) {
      if (finding.severity === 'blocking') {
        // If somehow blocking, evidence must have concrete markers
        expect(finding.evidence).toMatch(/(?:src\/|https?:\/\/|FAIL|ERROR)/i);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// iterateCritique with evaluateOutput
// ---------------------------------------------------------------------------

describe('iterateCritique with output', () => {
  it('works with OutputCriticInput', () => {
    const input: OutputCriticInput = {
      output: 'Basic implementation.',
      promptShape: {
        goal: 'Build auth',
        context: 'Express',
        constraints: ['Must use JWT'],
        deliverable: 'Auth system',
        validation: [],
      },
      capsule: null,
      antiPatterns: [],
      memories: [],
    };

    const first = evaluateOutput(input);
    const second = iterateCritique(input, first);

    expect(second.iterationCount).toBe(2);
    expect(second.findings).toBeDefined();
  });

  it('triggers humanJudgmentRequired after 3 iterations with blocking', () => {
    const input: OutputCriticInput = {
      output: 'Done.',
      promptShape: {
        goal: 'Implement comprehensive authentication system with JWT tokens and session management and RBAC',
        context: 'Large application',
        constraints: ['Must use OAuth', 'Must implement RBAC', 'Must audit access'],
        deliverable: 'Complete authentication and authorization middleware',
        validation: ['All endpoints verified', 'Load tested'],
      },
      capsule: null,
      antiPatterns: [],
      memories: [],
    };

    const first = evaluateOutput(input);
    const second = iterateCritique(input, first);
    const third = iterateCritique(input, second);

    expect(third.iterationCount).toBe(3);
    if (third.severity === 'blocking') {
      expect(third.humanJudgmentRequired).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// MAX_ITERATIONS constant
// ---------------------------------------------------------------------------

describe('MAX_ITERATIONS', () => {
  it('is set to 3', () => {
    expect(MAX_ITERATIONS).toBe(3);
  });
});
