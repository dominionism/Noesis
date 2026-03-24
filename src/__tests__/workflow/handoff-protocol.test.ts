/**
 * Tests for Handoff Protocol — Cross-Agent Handoff Packaging
 *
 * Covers:
 * - createHandoff: initial state
 * - addLearning / addReference / addExpectation: collection building
 * - acknowledgeHandoff / completeHandoff: status transitions
 * - serializeHandoff: JSON serialization
 * - Error conditions: invalid state transitions
 */

import { describe, it, expect } from 'vitest';
import {
  createHandoff,
  addLearning,
  addReference,
  addExpectation,
  acknowledgeHandoff,
  completeHandoff,
  serializeHandoff,
  type AgentHandoff,
} from '../../workflow/handoff-protocol.js';

// ---------------------------------------------------------------------------
// createHandoff
// ---------------------------------------------------------------------------

describe('createHandoff', () => {
  it('creates a handoff with correct fields', () => {
    const handoff = createHandoff(
      'researcher',
      'planner',
      'session-1',
      'Research on auth patterns complete',
    );

    expect(handoff.id).toBeDefined();
    expect(handoff.fromAgent).toBe('researcher');
    expect(handoff.toAgent).toBe('planner');
    expect(handoff.sessionId).toBe('session-1');
    expect(handoff.summary).toBe('Research on auth patterns complete');
    expect(handoff.learnings).toEqual([]);
    expect(handoff.references).toEqual([]);
    expect(handoff.expectations).toEqual([]);
    expect(handoff.context).toEqual({});
    expect(handoff.status).toBe('pending');
    expect(handoff.createdAt).toBeDefined();
    expect(handoff.acknowledgedAt).toBeUndefined();
  });

  it('generates unique IDs', () => {
    const h1 = createHandoff('a', 'b', 's1', 'summary 1');
    const h2 = createHandoff('a', 'b', 's1', 'summary 2');

    expect(h1.id).not.toBe(h2.id);
  });
});

// ---------------------------------------------------------------------------
// addLearning
// ---------------------------------------------------------------------------

describe('addLearning', () => {
  it('adds a learning to the handoff', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const updated = addLearning(handoff, 'JWT tokens need refresh rotation');

    expect(updated.learnings).toEqual(['JWT tokens need refresh rotation']);
  });

  it('appends multiple learnings', () => {
    let handoff = createHandoff('a', 'b', 's1', 'summary');
    handoff = addLearning(handoff, 'Learning 1');
    handoff = addLearning(handoff, 'Learning 2');

    expect(handoff.learnings).toEqual(['Learning 1', 'Learning 2']);
  });

  it('returns a new handoff object', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const updated = addLearning(handoff, 'learning');

    expect(updated).not.toBe(handoff);
    expect(handoff.learnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addReference
// ---------------------------------------------------------------------------

describe('addReference', () => {
  it('adds a reference to the handoff', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const updated = addReference(handoff, 'src/auth/token.ts');

    expect(updated.references).toEqual(['src/auth/token.ts']);
  });

  it('appends multiple references', () => {
    let handoff = createHandoff('a', 'b', 's1', 'summary');
    handoff = addReference(handoff, 'ref-1');
    handoff = addReference(handoff, 'ref-2');

    expect(handoff.references).toEqual(['ref-1', 'ref-2']);
  });

  it('returns a new handoff object', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const updated = addReference(handoff, 'ref');

    expect(updated).not.toBe(handoff);
  });
});

// ---------------------------------------------------------------------------
// addExpectation
// ---------------------------------------------------------------------------

describe('addExpectation', () => {
  it('adds an expectation to the handoff', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const updated = addExpectation(handoff, 'Implement the auth middleware');

    expect(updated.expectations).toEqual(['Implement the auth middleware']);
  });

  it('appends multiple expectations', () => {
    let handoff = createHandoff('a', 'b', 's1', 'summary');
    handoff = addExpectation(handoff, 'Expect 1');
    handoff = addExpectation(handoff, 'Expect 2');

    expect(handoff.expectations).toEqual(['Expect 1', 'Expect 2']);
  });

  it('returns a new handoff object', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const updated = addExpectation(handoff, 'expectation');

    expect(updated).not.toBe(handoff);
  });
});

// ---------------------------------------------------------------------------
// acknowledgeHandoff
// ---------------------------------------------------------------------------

describe('acknowledgeHandoff', () => {
  it('transitions pending handoff to acknowledged', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const acked = acknowledgeHandoff(handoff);

    expect(acked.status).toBe('acknowledged');
    expect(acked.acknowledgedAt).toBeDefined();
  });

  it('throws when handoff is not pending', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const acked = acknowledgeHandoff(handoff);

    expect(() => acknowledgeHandoff(acked)).toThrow(
      'Cannot acknowledge handoff in status: acknowledged',
    );
  });

  it('throws when handoff is completed', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const acked = acknowledgeHandoff(handoff);
    const completed = completeHandoff(acked);

    expect(() => acknowledgeHandoff(completed)).toThrow(
      'Cannot acknowledge handoff in status: completed',
    );
  });

  it('returns a new handoff object', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const acked = acknowledgeHandoff(handoff);

    expect(acked).not.toBe(handoff);
    expect(handoff.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// completeHandoff
// ---------------------------------------------------------------------------

describe('completeHandoff', () => {
  it('transitions acknowledged handoff to completed', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const acked = acknowledgeHandoff(handoff);
    const completed = completeHandoff(acked);

    expect(completed.status).toBe('completed');
  });

  it('throws when handoff is not acknowledged', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');

    expect(() => completeHandoff(handoff)).toThrow(
      'Cannot complete handoff in status: pending',
    );
  });

  it('throws when handoff is already completed', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const acked = acknowledgeHandoff(handoff);
    const completed = completeHandoff(acked);

    expect(() => completeHandoff(completed)).toThrow(
      'Cannot complete handoff in status: completed',
    );
  });

  it('returns a new handoff object', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const acked = acknowledgeHandoff(handoff);
    const completed = completeHandoff(acked);

    expect(completed).not.toBe(acked);
    expect(acked.status).toBe('acknowledged');
  });
});

// ---------------------------------------------------------------------------
// serializeHandoff
// ---------------------------------------------------------------------------

describe('serializeHandoff', () => {
  it('serializes handoff to valid JSON', () => {
    let handoff = createHandoff('researcher', 'planner', 's1', 'Auth research complete');
    handoff = addLearning(handoff, 'JWT needs rotation');
    handoff = addReference(handoff, 'src/auth.ts');
    handoff = addExpectation(handoff, 'Implement middleware');

    const json = serializeHandoff(handoff);
    const parsed = JSON.parse(json);

    expect(parsed.fromAgent).toBe('researcher');
    expect(parsed.toAgent).toBe('planner');
    expect(parsed.learnings).toEqual(['JWT needs rotation']);
    expect(parsed.references).toEqual(['src/auth.ts']);
    expect(parsed.expectations).toEqual(['Implement middleware']);
  });

  it('produces pretty-printed JSON', () => {
    const handoff = createHandoff('a', 'b', 's1', 'summary');
    const json = serializeHandoff(handoff);

    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle test
// ---------------------------------------------------------------------------

describe('full handoff lifecycle', () => {
  it('create -> build -> acknowledge -> complete', () => {
    let handoff = createHandoff('researcher', 'implementer', 's1', 'Research complete');
    expect(handoff.status).toBe('pending');

    handoff = addLearning(handoff, 'Use bcrypt for passwords');
    handoff = addReference(handoff, 'src/auth/password.ts');
    handoff = addExpectation(handoff, 'Implement password hashing service');

    handoff = acknowledgeHandoff(handoff);
    expect(handoff.status).toBe('acknowledged');

    handoff = completeHandoff(handoff);
    expect(handoff.status).toBe('completed');

    expect(handoff.learnings).toHaveLength(1);
    expect(handoff.references).toHaveLength(1);
    expect(handoff.expectations).toHaveLength(1);
  });
});
