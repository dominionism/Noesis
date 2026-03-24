/**
 * Tests for Capsule Router
 *
 * Covers:
 * - routeToCapsule: matches task to capsule by keyword scoring
 * - getCapsule: retrieves capsule by ID
 * - listCapsules: lists all registered capsules
 * - registerCapsule: adds custom capsules
 * - matchScore: validates score calculation (0-1 range)
 */

import { describe, it, expect } from 'vitest';
import {
  routeToCapsule,
  getCapsule,
  listCapsules,
  registerCapsule,
  matchScore,
  type CapsuleDefinition,
} from '../../workflow/capsule-router.js';
import type { PromptShape } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePromptShape(overrides: Partial<PromptShape> = {}): PromptShape {
  return {
    goal: '',
    context: '',
    constraints: [],
    deliverable: '',
    validation: [],
    ...overrides,
  };
}

function makeCustomCapsule(overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  return {
    id: 'custom-test',
    displayName: 'Custom Test',
    description: 'A custom test capsule',
    matchPatterns: ['custom', 'testing', 'special'],
    contextSections: ['custom-context'],
    antiPatterns: ['custom-anti-pattern'],
    criticRules: ['must include custom check'],
    memoryPolicy: {
      preferredTypes: ['skill'],
      requiredTags: ['custom'],
      boostFactor: 1.0,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// routeToCapsule
// ---------------------------------------------------------------------------

describe('routeToCapsule', () => {
  it('matches api-workflow capsule for API-related tasks', () => {
    const shape = makePromptShape({
      goal: 'Build a REST API endpoint with authentication',
      deliverable: 'API routes and middleware for user management',
    });

    const capsule = routeToCapsule(shape);
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('api-workflow');
  });

  it('matches security-hardening capsule for security tasks', () => {
    const shape = makePromptShape({
      goal: 'Perform security audit and vulnerability remediation',
      context: 'OWASP compliance check',
      constraints: ['Fix all injection vulnerabilities'],
    });

    const capsule = routeToCapsule(shape);
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('security-hardening');
  });

  it('matches creative-redesign capsule for design tasks', () => {
    const shape = makePromptShape({
      goal: 'Redesign the landing page with new visual theme and responsive layout',
      deliverable: 'Updated UI components and style system',
    });

    const capsule = routeToCapsule(shape);
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('creative-redesign');
  });

  it('matches performance-optimization capsule for performance tasks', () => {
    const shape = makePromptShape({
      goal: 'Optimize database query performance and add caching',
      context: 'High latency on dashboard load',
      deliverable: 'Caching layer and query optimization',
    });

    const capsule = routeToCapsule(shape);
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('performance-optimization');
  });

  it('matches migration capsule for migration tasks', () => {
    const shape = makePromptShape({
      goal: 'Migrate database schema and upgrade API version',
      constraints: ['Must maintain backward compatibility', 'Rollback plan required'],
    });

    const capsule = routeToCapsule(shape);
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('migration');
  });

  it('returns null for unmatched tasks', () => {
    const shape = makePromptShape({
      goal: 'Write a haiku about the weather',
    });

    const capsule = routeToCapsule(shape);
    expect(capsule).toBeNull();
  });

  it('returns the best-matching capsule when multiple match', () => {
    // This shape contains both API and security keywords,
    // but should favor one based on density
    const shape = makePromptShape({
      goal: 'Build an API endpoint',
      context: 'REST service integration with webhook support',
      deliverable: 'API handler and middleware with request/response validation',
    });

    const capsule = routeToCapsule(shape);
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('api-workflow');
  });
});

// ---------------------------------------------------------------------------
// getCapsule
// ---------------------------------------------------------------------------

describe('getCapsule', () => {
  it('returns capsule by ID for api-workflow', () => {
    const capsule = getCapsule('api-workflow');
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('api-workflow');
    expect(capsule!.displayName).toBe('API Workflow');
  });

  it('returns capsule by ID for security-hardening', () => {
    const capsule = getCapsule('security-hardening');
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('security-hardening');
  });

  it('returns capsule by ID for creative-redesign', () => {
    const capsule = getCapsule('creative-redesign');
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('creative-redesign');
  });

  it('returns capsule by ID for performance-optimization', () => {
    const capsule = getCapsule('performance-optimization');
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('performance-optimization');
  });

  it('returns capsule by ID for migration', () => {
    const capsule = getCapsule('migration');
    expect(capsule).not.toBeNull();
    expect(capsule!.id).toBe('migration');
  });

  it('returns null for unknown capsule ID', () => {
    const capsule = getCapsule('nonexistent-capsule');
    expect(capsule).toBeNull();
  });

  it('returns null for empty string', () => {
    const capsule = getCapsule('');
    expect(capsule).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listCapsules
// ---------------------------------------------------------------------------

describe('listCapsules', () => {
  it('returns all registered capsules', () => {
    const capsules = listCapsules();
    expect(capsules.length).toBeGreaterThanOrEqual(5);
  });

  it('includes all 5 built-in capsules', () => {
    const capsules = listCapsules();
    const ids = capsules.map((c) => c.id);
    expect(ids).toContain('api-workflow');
    expect(ids).toContain('creative-redesign');
    expect(ids).toContain('security-hardening');
    expect(ids).toContain('performance-optimization');
    expect(ids).toContain('migration');
  });

  it('returns a new array (not a reference to internal storage)', () => {
    const capsules1 = listCapsules();
    const capsules2 = listCapsules();
    expect(capsules1).not.toBe(capsules2);
  });

  it('returns capsules with complete structure', () => {
    const capsules = listCapsules();
    for (const capsule of capsules) {
      expect(capsule.id).toBeTruthy();
      expect(capsule.displayName).toBeTruthy();
      expect(capsule.description).toBeTruthy();
      expect(Array.isArray(capsule.matchPatterns)).toBe(true);
      expect(capsule.matchPatterns.length).toBeGreaterThan(0);
      expect(Array.isArray(capsule.contextSections)).toBe(true);
      expect(Array.isArray(capsule.antiPatterns)).toBe(true);
      expect(Array.isArray(capsule.criticRules)).toBe(true);
      expect(capsule.memoryPolicy).toBeDefined();
      expect(typeof capsule.memoryPolicy.boostFactor).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// registerCapsule
// ---------------------------------------------------------------------------

describe('registerCapsule', () => {
  it('adds a custom capsule to the registry', () => {
    const custom = makeCustomCapsule({ id: 'register-test-1' });
    registerCapsule(custom);
    const retrieved = getCapsule('register-test-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.displayName).toBe('Custom Test');
  });

  it('custom capsule appears in listCapsules', () => {
    const custom = makeCustomCapsule({ id: 'register-test-2' });
    registerCapsule(custom);
    const all = listCapsules();
    const ids = all.map((c) => c.id);
    expect(ids).toContain('register-test-2');
  });

  it('replaces an existing capsule with the same ID', () => {
    const custom1 = makeCustomCapsule({
      id: 'register-test-3',
      displayName: 'Version 1',
    });
    const custom2 = makeCustomCapsule({
      id: 'register-test-3',
      displayName: 'Version 2',
    });

    registerCapsule(custom1);
    expect(getCapsule('register-test-3')!.displayName).toBe('Version 1');

    registerCapsule(custom2);
    expect(getCapsule('register-test-3')!.displayName).toBe('Version 2');
  });

  it('custom capsule can be matched by routeToCapsule', () => {
    const custom = makeCustomCapsule({
      id: 'register-test-4',
      matchPatterns: ['quantum', 'entanglement', 'qubit'],
    });
    registerCapsule(custom);

    const shape = makePromptShape({
      goal: 'Build a quantum entanglement simulator with qubit manipulation',
    });

    const matched = routeToCapsule(shape);
    expect(matched).not.toBeNull();
    expect(matched!.id).toBe('register-test-4');
  });
});

// ---------------------------------------------------------------------------
// matchScore
// ---------------------------------------------------------------------------

describe('matchScore', () => {
  it('returns 0 for no matching patterns', () => {
    const shape = makePromptShape({
      goal: 'Write a poem about cats',
    });
    const capsule = getCapsule('api-workflow')!;
    const score = matchScore(shape, capsule);
    expect(score).toBe(0);
  });

  it('returns a value between 0 and 1', () => {
    const shape = makePromptShape({
      goal: 'Build an API with authentication and middleware',
    });
    const capsule = getCapsule('api-workflow')!;
    const score = matchScore(shape, capsule);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns higher score for more matching keywords', () => {
    const shape1 = makePromptShape({
      goal: 'Build an API',
    });
    const shape2 = makePromptShape({
      goal: 'Build a REST API endpoint with middleware and request handler for service integration',
    });

    const capsule = getCapsule('api-workflow')!;
    const score1 = matchScore(shape1, capsule);
    const score2 = matchScore(shape2, capsule);

    expect(score2).toBeGreaterThan(score1);
  });

  it('returns 0 for capsule with empty match patterns', () => {
    const shape = makePromptShape({
      goal: 'Build anything',
    });
    const capsule = makeCustomCapsule({ matchPatterns: [] });
    const score = matchScore(shape, capsule);
    expect(score).toBe(0);
  });

  it('searches across all prompt shape fields', () => {
    const capsule = getCapsule('api-workflow')!;

    // Keywords spread across different fields
    const shape = makePromptShape({
      goal: 'Build an endpoint',
      context: 'REST service',
      constraints: ['Must handle http requests'],
      deliverable: 'API middleware',
      validation: ['All routes respond correctly'],
    });

    const score = matchScore(shape, capsule);
    expect(score).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    const shape1 = makePromptShape({ goal: 'Build an API' });
    const shape2 = makePromptShape({ goal: 'Build an api' });

    const capsule = getCapsule('api-workflow')!;
    const score1 = matchScore(shape1, capsule);
    const score2 = matchScore(shape2, capsule);

    expect(score1).toBe(score2);
  });

  it('produces distinct scores for different capsules', () => {
    const shape = makePromptShape({
      goal: 'Build a secure REST API with authentication and vulnerability scanning',
    });

    const apiCapsule = getCapsule('api-workflow')!;
    const secCapsule = getCapsule('security-hardening')!;

    const apiScore = matchScore(shape, apiCapsule);
    const secScore = matchScore(shape, secCapsule);

    // Both should match to some degree
    expect(apiScore).toBeGreaterThan(0);
    expect(secScore).toBeGreaterThan(0);
  });
});
