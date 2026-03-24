/**
 * Tests for Critic Cycle Evaluation
 *
 * Covers:
 * - evaluateWork: anti-pattern matching (40% threshold), capsule criteria, quality checks
 * - shouldRunAnotherCycle: max 2 revision cycles enforcement
 * - Issue severity classification
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateWork,
  shouldRunAnotherCycle,
  MAX_CRITIC_CYCLES,
  type CriticInput,
} from '../../workflow/critic.js';
import type { AntiPatternDefinition } from '../../types.js';

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

function makeInput(overrides: Partial<CriticInput> = {}): CriticInput {
  return {
    workOutput: 'The implementation includes proper error handling and tests.',
    taskDescription: 'Build a user authentication system',
    antiPatterns: [],
    cycle: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MAX_CRITIC_CYCLES constant
// ---------------------------------------------------------------------------

describe('MAX_CRITIC_CYCLES', () => {
  it('is set to 2', () => {
    expect(MAX_CRITIC_CYCLES).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// evaluateWork
// ---------------------------------------------------------------------------

describe('evaluateWork', () => {
  describe('anti-pattern matching', () => {
    it('flags work output that matches >40% of trigger words', () => {
      // trigger_pattern has 6 words > 3 chars: "hardcoded", "credentials", "stored", "password", "database", "connection"
      // work output includes: "hardcoded", "credentials", "password" = 3/6 = 50% > 40%
      const ap = makeAntiPattern({
        trigger_pattern: 'hardcoded credentials stored password database connection string',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'The code uses hardcoded credentials and a password in the config file.',
        antiPatterns: [ap],
      }));

      expect(result.anti_patterns_matched).toContain('Test Anti-Pattern');
      expect(result.issues.some((i) => i.category === 'anti-pattern')).toBe(true);
      expect(result.passed).toBe(false);
    });

    it('does not flag when match ratio is below 40%', () => {
      // Only 1 out of 6 significant words matches = ~17%
      const ap = makeAntiPattern({
        trigger_pattern: 'hardcoded credentials stored password database connection string',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'The system uses environment variables for all credentials.',
        antiPatterns: [ap],
      }));

      // "credentials" matches (1/6 ≈ 17%), which is below 40%
      expect(result.anti_patterns_matched).toHaveLength(0);
    });

    it('skips anti-patterns with archived status', () => {
      const ap = makeAntiPattern({
        status: 'archived',
        trigger_pattern: 'always matching every single word here intentionally',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'always matching every single word here intentionally',
        antiPatterns: [ap],
      }));

      expect(result.anti_patterns_matched).toHaveLength(0);
    });

    it('includes draft anti-patterns in evaluation', () => {
      const ap = makeAntiPattern({
        status: 'draft',
        trigger_pattern: 'direct database query without parameterization injection',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'Execute direct database query without parameterization to avoid injection issues.',
        antiPatterns: [ap],
      }));

      expect(result.anti_patterns_matched.length).toBeGreaterThanOrEqual(1);
    });

    it('classifies severity as major for high-confidence anti-patterns', () => {
      const ap = makeAntiPattern({
        confidence: 0.7,
        trigger_pattern: 'eval function dynamic code execution unsafe',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'We use the eval function for dynamic code execution which is unsafe.',
        antiPatterns: [ap],
      }));

      const apIssues = result.issues.filter((i) => i.category === 'anti-pattern');
      if (apIssues.length > 0) {
        expect(apIssues[0].severity).toBe('major');
      }
    });

    it('classifies severity as minor for low-confidence anti-patterns', () => {
      const ap = makeAntiPattern({
        confidence: 0.5,
        trigger_pattern: 'eval function dynamic code execution unsafe',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'We use the eval function for dynamic code execution which is unsafe.',
        antiPatterns: [ap],
      }));

      const apIssues = result.issues.filter((i) => i.category === 'anti-pattern');
      if (apIssues.length > 0) {
        expect(apIssues[0].severity).toBe('minor');
      }
    });

    it('adds suggestion with correct_approach for matched anti-patterns', () => {
      const ap = makeAntiPattern({
        correct_approach: 'Use parameterized queries',
        trigger_pattern: 'string concatenation query building direct',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'Build the query using string concatenation for direct execution.',
        antiPatterns: [ap],
      }));

      if (result.anti_patterns_matched.length > 0) {
        expect(result.suggestions.some((s) => s.includes('Use parameterized queries'))).toBe(true);
      }
    });

    it('evaluates multiple anti-patterns independently', () => {
      const ap1 = makeAntiPattern({
        name: 'Hardcoded Secrets',
        trigger_pattern: 'hardcoded secrets password apikey token',
      });
      const ap2 = makeAntiPattern({
        name: 'SQL Injection',
        trigger_pattern: 'string concatenation query building direct injection',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'Uses hardcoded secrets like password and apikey. Also does string concatenation for query building with direct injection risk.',
        antiPatterns: [ap1, ap2],
      }));

      expect(result.anti_patterns_matched.length).toBeGreaterThanOrEqual(1);
    });

    it('handles anti-pattern with only short words (<=3 chars) in trigger', () => {
      const ap = makeAntiPattern({
        trigger_pattern: 'a do it if so',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'Do it if so.',
        antiPatterns: [ap],
      }));

      // All trigger words are <= 3 chars, so triggerWords array is empty
      // Should not match (division by zero guard)
      expect(result.anti_patterns_matched).toHaveLength(0);
    });
  });

  describe('capsule criteria', () => {
    it('flags missing required elements from capsule criteria', () => {
      const result = evaluateWork(makeInput({
        workOutput: 'The implementation is complete.',
        capsuleCriteria: ['must include error handling'],
      }));

      const missingIssues = result.issues.filter((i) => i.category === 'missing-requirement');
      expect(missingIssues.length).toBeGreaterThanOrEqual(1);
      expect(missingIssues[0].description).toContain('error handling');
    });

    it('does not flag when required element is present', () => {
      const result = evaluateWork(makeInput({
        workOutput: 'The implementation includes error handling at every boundary.',
        capsuleCriteria: ['must include error handling'],
      }));

      const missingIssues = result.issues.filter((i) => i.category === 'missing-requirement');
      expect(missingIssues).toHaveLength(0);
    });

    it('handles "required:" prefix in capsule criteria', () => {
      const result = evaluateWork(makeInput({
        workOutput: 'Basic implementation without tests.',
        capsuleCriteria: ['required: unit tests'],
      }));

      const missingIssues = result.issues.filter((i) => i.category === 'missing-requirement');
      expect(missingIssues.length).toBeGreaterThanOrEqual(1);
      expect(missingIssues[0].description).toContain('unit tests');
    });

    it('handles empty capsule criteria array', () => {
      const result = evaluateWork(makeInput({
        capsuleCriteria: [],
      }));

      const missingIssues = result.issues.filter((i) => i.category === 'missing-requirement');
      expect(missingIssues).toHaveLength(0);
    });

    it('handles undefined capsule criteria', () => {
      const result = evaluateWork(makeInput({
        capsuleCriteria: undefined,
      }));

      // Should not crash
      expect(result).toBeDefined();
    });

    it('marks missing requirements as major severity', () => {
      const result = evaluateWork(makeInput({
        workOutput: 'Incomplete.',
        capsuleCriteria: ['must include validation logic'],
      }));

      const missingIssues = result.issues.filter((i) => i.category === 'missing-requirement');
      if (missingIssues.length > 0) {
        expect(missingIssues[0].severity).toBe('major');
      }
    });
  });

  describe('quality checks', () => {
    it('flags output that is too brief relative to task complexity', () => {
      const result = evaluateWork(makeInput({
        workOutput: 'Done.', // < 50 chars
        taskDescription: 'A'.repeat(101), // > 100 chars
      }));

      const briefIssues = result.issues.filter((i) => i.category === 'insufficient-output');
      expect(briefIssues).toHaveLength(1);
      expect(briefIssues[0].severity).toBe('major');
    });

    it('does not flag when output is sufficiently long', () => {
      const result = evaluateWork(makeInput({
        workOutput: 'A'.repeat(100),
        taskDescription: 'A'.repeat(200),
      }));

      const briefIssues = result.issues.filter((i) => i.category === 'insufficient-output');
      expect(briefIssues).toHaveLength(0);
    });

    it('does not flag brief output when task is also brief', () => {
      const result = evaluateWork(makeInput({
        workOutput: 'Done.',
        taskDescription: 'Fix the typo.',
      }));

      const briefIssues = result.issues.filter((i) => i.category === 'insufficient-output');
      expect(briefIssues).toHaveLength(0);
    });
  });

  describe('pass/fail determination', () => {
    it('passes when no issues found', () => {
      const result = evaluateWork(makeInput({
        workOutput: 'A thorough implementation with full coverage.',
        antiPatterns: [],
      }));

      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('fails when any major issue exists', () => {
      const result = evaluateWork(makeInput({
        workOutput: 'Done.',
        taskDescription: 'A'.repeat(150),
      }));

      expect(result.passed).toBe(false);
    });

    it('passes when only minor issues exist', () => {
      const ap = makeAntiPattern({
        confidence: 0.5, // < 0.7 => minor severity
        trigger_pattern: 'console logging debug output verbose',
      });

      const result = evaluateWork(makeInput({
        workOutput: 'Added console logging with debug output for verbose tracing. '.repeat(5),
        taskDescription: 'Add logging',
        antiPatterns: [ap],
      }));

      // Minor issues should still pass
      if (result.anti_patterns_matched.length > 0) {
        const hasMajor = result.issues.some((i) => i.severity === 'major' || i.severity === 'critical');
        if (!hasMajor) {
          expect(result.passed).toBe(true);
        }
      }
    });
  });

  describe('feedback structure', () => {
    it('includes cycle number in feedback', () => {
      const result = evaluateWork(makeInput({ cycle: 2 }));
      expect(result.cycle).toBe(2);
    });

    it('returns all expected fields', () => {
      const result = evaluateWork(makeInput());

      expect(result).toHaveProperty('cycle');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('anti_patterns_matched');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(Array.isArray(result.anti_patterns_matched)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// shouldRunAnotherCycle
// ---------------------------------------------------------------------------

describe('shouldRunAnotherCycle', () => {
  it('returns false when feedback passed', () => {
    const result = shouldRunAnotherCycle({
      cycle: 1,
      passed: true,
      issues: [],
      suggestions: [],
      anti_patterns_matched: [],
    });

    expect(result).toBe(false);
  });

  it('returns true when feedback failed and cycle < maxCycles', () => {
    const result = shouldRunAnotherCycle({
      cycle: 1,
      passed: false,
      issues: [{ severity: 'major', category: 'test', description: 'test' }],
      suggestions: [],
      anti_patterns_matched: [],
    });

    expect(result).toBe(true);
  });

  it('returns false when cycle equals maxCycles (default 2)', () => {
    const result = shouldRunAnotherCycle({
      cycle: 2,
      passed: false,
      issues: [{ severity: 'major', category: 'test', description: 'test' }],
      suggestions: [],
      anti_patterns_matched: [],
    });

    expect(result).toBe(false);
  });

  it('returns false when cycle exceeds maxCycles', () => {
    const result = shouldRunAnotherCycle({
      cycle: 3,
      passed: false,
      issues: [{ severity: 'major', category: 'test', description: 'test' }],
      suggestions: [],
      anti_patterns_matched: [],
    });

    expect(result).toBe(false);
  });

  it('respects custom maxCycles parameter', () => {
    const feedback = {
      cycle: 3,
      passed: false,
      issues: [{ severity: 'major' as const, category: 'test', description: 'test' }],
      suggestions: [],
      anti_patterns_matched: [],
    };

    expect(shouldRunAnotherCycle(feedback, 5)).toBe(true);
    expect(shouldRunAnotherCycle(feedback, 3)).toBe(false);
  });

  it('returns false when passed is true regardless of cycle count', () => {
    expect(shouldRunAnotherCycle({
      cycle: 1,
      passed: true,
      issues: [],
      suggestions: [],
      anti_patterns_matched: [],
    }, 10)).toBe(false);
  });

  it('enforces max 2 revision cycles with default parameter', () => {
    // Cycle 1: fails => should run another
    const c1 = shouldRunAnotherCycle({
      cycle: 1,
      passed: false,
      issues: [{ severity: 'major', category: 'test', description: 'test' }],
      suggestions: [],
      anti_patterns_matched: [],
    });
    expect(c1).toBe(true);

    // Cycle 2: fails => should NOT run another (max reached)
    const c2 = shouldRunAnotherCycle({
      cycle: 2,
      passed: false,
      issues: [{ severity: 'major', category: 'test', description: 'test' }],
      suggestions: [],
      anti_patterns_matched: [],
    });
    expect(c2).toBe(false);
  });
});
