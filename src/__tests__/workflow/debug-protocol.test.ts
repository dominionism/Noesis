/**
 * Tests for Debug Protocol — Persistent Debug State Management
 *
 * Covers:
 * - createDebugSession: initial state
 * - updateDebugFocus: focus mutation
 * - addSymptom: IMMUTABLE after gathering phase
 * - addEliminated / addEvidence: APPEND ONLY
 * - transitionDebugStatus: valid and invalid transitions
 * - setResolution: resolution assignment
 * - serializeDebugState / parseDebugState: round-trip serialization
 * - Immutability constraints
 */

import { describe, it, expect } from 'vitest';
import {
  createDebugSession,
  updateDebugFocus,
  addSymptom,
  addEliminated,
  addEvidence,
  transitionDebugStatus,
  setResolution,
  serializeDebugState,
  parseDebugState,
  type DebugState,
  type DebugStatus,
} from '../../workflow/debug-protocol.js';

// ---------------------------------------------------------------------------
// createDebugSession
// ---------------------------------------------------------------------------

describe('createDebugSession', () => {
  it('creates a session in gathering status', () => {
    const state = createDebugSession('Test failure in auth module');

    expect(state.id).toBeDefined();
    expect(state.status).toBe('gathering');
    expect(state.trigger).toBe('Test failure in auth module');
    expect(state.symptoms).toEqual([]);
    expect(state.eliminated).toEqual([]);
    expect(state.evidence).toEqual([]);
    expect(state.resolution).toBeNull();
    expect(state.createdAt).toBeDefined();
    expect(state.updatedAt).toBeDefined();
  });

  it('initializes empty focus', () => {
    const state = createDebugSession('test');

    expect(state.currentFocus.hypothesis).toBe('');
    expect(state.currentFocus.test).toBe('');
    expect(state.currentFocus.expecting).toBe('');
    expect(state.currentFocus.nextAction).toBe('');
  });
});

// ---------------------------------------------------------------------------
// updateDebugFocus
// ---------------------------------------------------------------------------

describe('updateDebugFocus', () => {
  it('updates the focus fields', () => {
    const state = createDebugSession('test');
    const updated = updateDebugFocus(state, {
      hypothesis: 'Auth token expired',
      test: 'Check token expiry time',
      expecting: 'Token shows past expiry',
      nextAction: 'Extend token TTL',
    });

    expect(updated.currentFocus.hypothesis).toBe('Auth token expired');
    expect(updated.currentFocus.test).toBe('Check token expiry time');
    expect(updated.currentFocus.expecting).toBe('Token shows past expiry');
    expect(updated.currentFocus.nextAction).toBe('Extend token TTL');
  });

  it('returns a new state object (immutable)', () => {
    const state = createDebugSession('test');
    const updated = updateDebugFocus(state, {
      hypothesis: 'new',
      test: 'new',
      expecting: 'new',
      nextAction: 'new',
    });

    expect(updated).not.toBe(state);
    expect(state.currentFocus.hypothesis).toBe('');
  });

  it('updates the updatedAt timestamp', () => {
    const state = createDebugSession('test');
    const updated = updateDebugFocus(state, {
      hypothesis: 'h',
      test: 't',
      expecting: 'e',
      nextAction: 'n',
    });

    expect(updated.updatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// addSymptom — IMMUTABLE after gathering
// ---------------------------------------------------------------------------

describe('addSymptom', () => {
  it('adds a symptom during gathering phase', () => {
    const state = createDebugSession('test');
    const updated = addSymptom(state, 'Auth returns 401');

    expect(updated.symptoms).toEqual(['Auth returns 401']);
  });

  it('appends multiple symptoms', () => {
    let state = createDebugSession('test');
    state = addSymptom(state, 'Symptom 1');
    state = addSymptom(state, 'Symptom 2');

    expect(state.symptoms).toEqual(['Symptom 1', 'Symptom 2']);
  });

  it('throws when status is investigating', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');

    expect(() => addSymptom(state, 'late symptom')).toThrow(
      'Cannot add symptoms after gathering phase',
    );
  });

  it('throws when status is fixing', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'fixing');

    expect(() => addSymptom(state, 'late symptom')).toThrow(
      'Cannot add symptoms after gathering phase',
    );
  });

  it('throws when status is verifying', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'fixing');
    state = transitionDebugStatus(state, 'verifying');

    expect(() => addSymptom(state, 'late symptom')).toThrow(
      'Cannot add symptoms after gathering phase',
    );
  });

  it('throws when status is resolved', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'fixing');
    state = transitionDebugStatus(state, 'verifying');
    state = transitionDebugStatus(state, 'resolved');

    expect(() => addSymptom(state, 'late symptom')).toThrow(
      'Cannot add symptoms after gathering phase',
    );
  });

  it('returns a new state object (immutable)', () => {
    const state = createDebugSession('test');
    const updated = addSymptom(state, 'symptom');

    expect(updated).not.toBe(state);
    expect(state.symptoms).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addEliminated — APPEND ONLY
// ---------------------------------------------------------------------------

describe('addEliminated', () => {
  it('adds an eliminated hypothesis', () => {
    const state = createDebugSession('test');
    const updated = addEliminated(state, 'Not a network issue');

    expect(updated.eliminated).toEqual(['Not a network issue']);
  });

  it('appends without removing existing entries', () => {
    let state = createDebugSession('test');
    state = addEliminated(state, 'A');
    state = addEliminated(state, 'B');
    state = addEliminated(state, 'C');

    expect(state.eliminated).toEqual(['A', 'B', 'C']);
  });

  it('returns a new state object (immutable)', () => {
    const state = createDebugSession('test');
    const updated = addEliminated(state, 'eliminated');

    expect(updated).not.toBe(state);
    expect(state.eliminated).toEqual([]);
  });

  it('works in any status', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = addEliminated(state, 'hypothesis 1');

    expect(state.eliminated).toEqual(['hypothesis 1']);
  });
});

// ---------------------------------------------------------------------------
// addEvidence — APPEND ONLY
// ---------------------------------------------------------------------------

describe('addEvidence', () => {
  it('adds evidence', () => {
    const state = createDebugSession('test');
    const updated = addEvidence(state, 'Log shows timeout at line 42');

    expect(updated.evidence).toEqual(['Log shows timeout at line 42']);
  });

  it('appends without removing existing entries', () => {
    let state = createDebugSession('test');
    state = addEvidence(state, 'Evidence 1');
    state = addEvidence(state, 'Evidence 2');

    expect(state.evidence).toEqual(['Evidence 1', 'Evidence 2']);
  });

  it('returns a new state object (immutable)', () => {
    const state = createDebugSession('test');
    const updated = addEvidence(state, 'evidence');

    expect(updated).not.toBe(state);
    expect(state.evidence).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// transitionDebugStatus
// ---------------------------------------------------------------------------

describe('transitionDebugStatus', () => {
  it('allows gathering -> investigating', () => {
    const state = createDebugSession('test');
    const updated = transitionDebugStatus(state, 'investigating');
    expect(updated.status).toBe('investigating');
  });

  it('allows investigating -> fixing', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'fixing');
    expect(state.status).toBe('fixing');
  });

  it('allows investigating -> gathering (back to gather more info)', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'gathering');
    expect(state.status).toBe('gathering');
  });

  it('allows fixing -> verifying', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'fixing');
    state = transitionDebugStatus(state, 'verifying');
    expect(state.status).toBe('verifying');
  });

  it('allows verifying -> resolved', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'fixing');
    state = transitionDebugStatus(state, 'verifying');
    state = transitionDebugStatus(state, 'resolved');
    expect(state.status).toBe('resolved');
  });

  it('allows verifying -> investigating (fix did not work)', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'fixing');
    state = transitionDebugStatus(state, 'verifying');
    state = transitionDebugStatus(state, 'investigating');
    expect(state.status).toBe('investigating');
  });

  it('throws for invalid transition: gathering -> fixing', () => {
    const state = createDebugSession('test');
    expect(() => transitionDebugStatus(state, 'fixing')).toThrow(
      'Invalid debug status transition',
    );
  });

  it('throws for invalid transition: gathering -> resolved', () => {
    const state = createDebugSession('test');
    expect(() => transitionDebugStatus(state, 'resolved')).toThrow(
      'Invalid debug status transition',
    );
  });

  it('throws for invalid transition: resolved -> anything', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'fixing');
    state = transitionDebugStatus(state, 'verifying');
    state = transitionDebugStatus(state, 'resolved');

    const statuses: DebugStatus[] = ['gathering', 'investigating', 'fixing', 'verifying'];
    for (const s of statuses) {
      expect(() => transitionDebugStatus(state, s)).toThrow('Invalid debug status transition');
    }
  });

  it('throws for invalid transition: fixing -> gathering', () => {
    let state = createDebugSession('test');
    state = transitionDebugStatus(state, 'investigating');
    state = transitionDebugStatus(state, 'fixing');

    expect(() => transitionDebugStatus(state, 'gathering')).toThrow(
      'Invalid debug status transition',
    );
  });

  it('returns a new state object', () => {
    const state = createDebugSession('test');
    const updated = transitionDebugStatus(state, 'investigating');

    expect(updated).not.toBe(state);
    expect(state.status).toBe('gathering');
  });
});

// ---------------------------------------------------------------------------
// setResolution
// ---------------------------------------------------------------------------

describe('setResolution', () => {
  it('sets the resolution string', () => {
    const state = createDebugSession('test');
    const updated = setResolution(state, 'Fixed by increasing timeout');

    expect(updated.resolution).toBe('Fixed by increasing timeout');
  });

  it('returns a new state object', () => {
    const state = createDebugSession('test');
    const updated = setResolution(state, 'fixed');

    expect(updated).not.toBe(state);
    expect(state.resolution).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// serializeDebugState / parseDebugState
// ---------------------------------------------------------------------------

describe('serialization round-trip', () => {
  it('serializes and parses back to equivalent state', () => {
    let state = createDebugSession('Test failure');
    state = addSymptom(state, 'Returns 500');
    state = addSymptom(state, 'Only on POST');
    state = transitionDebugStatus(state, 'investigating');
    state = addEvidence(state, 'Stack trace shows null ref');
    state = addEliminated(state, 'Not a network issue');
    state = updateDebugFocus(state, {
      hypothesis: 'Null input on POST handler',
      test: 'Send POST with empty body',
      expecting: '500 error with null ref',
      nextAction: 'Add null check',
    });

    const serialized = serializeDebugState(state);
    const parsed = parseDebugState(serialized);

    expect(parsed.id).toBe(state.id);
    expect(parsed.status).toBe('investigating');
    expect(parsed.trigger).toBe('Test failure');
    expect(parsed.symptoms).toEqual(['Returns 500', 'Only on POST']);
    expect(parsed.evidence).toEqual(['Stack trace shows null ref']);
    expect(parsed.eliminated).toEqual(['Not a network issue']);
    expect(parsed.currentFocus.hypothesis).toBe('Null input on POST handler');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseDebugState('not json')).toThrow();
  });

  it('throws on missing required field', () => {
    const partial = JSON.stringify({ id: '1', status: 'gathering' });
    expect(() => parseDebugState(partial)).toThrow('Missing required field');
  });

  it('throws on invalid status value', () => {
    const state = createDebugSession('test');
    const serialized = serializeDebugState(state);
    const modified = serialized.replace('"gathering"', '"invalid_status"');

    expect(() => parseDebugState(modified)).toThrow('Invalid debug status');
  });

  it('throws on missing currentFocus field', () => {
    const state = createDebugSession('test');
    const obj = JSON.parse(serializeDebugState(state));
    delete obj.currentFocus.hypothesis;

    expect(() => parseDebugState(JSON.stringify(obj))).toThrow(
      'Missing required field in currentFocus',
    );
  });

  it('throws when symptoms is not an array', () => {
    const state = createDebugSession('test');
    const obj = JSON.parse(serializeDebugState(state));
    obj.symptoms = 'not an array';

    expect(() => parseDebugState(JSON.stringify(obj))).toThrow('symptoms must be an array');
  });

  it('throws when eliminated is not an array', () => {
    const state = createDebugSession('test');
    const obj = JSON.parse(serializeDebugState(state));
    obj.eliminated = 'not an array';

    expect(() => parseDebugState(JSON.stringify(obj))).toThrow('eliminated must be an array');
  });

  it('throws when evidence is not an array', () => {
    const state = createDebugSession('test');
    const obj = JSON.parse(serializeDebugState(state));
    obj.evidence = 42;

    expect(() => parseDebugState(JSON.stringify(obj))).toThrow('evidence must be an array');
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle test
// ---------------------------------------------------------------------------

describe('full debug lifecycle', () => {
  it('walks through gathering -> investigating -> fixing -> verifying -> resolved', () => {
    // Gathering
    let state = createDebugSession('API returns 500 on login');
    state = addSymptom(state, 'HTTP 500 on POST /login');
    state = addSymptom(state, 'Works fine on GET endpoints');
    expect(state.status).toBe('gathering');

    // Investigating
    state = transitionDebugStatus(state, 'investigating');
    state = updateDebugFocus(state, {
      hypothesis: 'POST body parsing fails',
      test: 'Send minimal POST body',
      expecting: 'Same 500 error',
      nextAction: 'Check request body parser middleware',
    });
    state = addEvidence(state, 'body-parser not configured for JSON');
    state = addEliminated(state, 'Not a database issue');

    // Cannot add symptoms now
    expect(() => addSymptom(state, 'new symptom')).toThrow();

    // Fixing
    state = transitionDebugStatus(state, 'fixing');
    state = addEvidence(state, 'Added express.json() middleware');

    // Verifying
    state = transitionDebugStatus(state, 'verifying');
    state = addEvidence(state, 'POST /login now returns 200');

    // Resolved
    state = transitionDebugStatus(state, 'resolved');
    state = setResolution(state, 'Added JSON body parser middleware');

    expect(state.status).toBe('resolved');
    expect(state.symptoms).toHaveLength(2);
    expect(state.eliminated).toHaveLength(1);
    expect(state.evidence).toHaveLength(3);
    expect(state.resolution).toBe('Added JSON body parser middleware');
  });
});
