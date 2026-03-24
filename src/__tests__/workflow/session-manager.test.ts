/**
 * Tests for Session Manager — Session Lifecycle Management
 *
 * Covers:
 * - createSession: initial state
 * - pauseSession / resumeSession: state transitions
 * - completeSession: completion with summary
 * - addArtifact / addBlocker / removeBlocker: collection management
 * - Error conditions: invalid state transitions
 */

import { describe, it, expect } from 'vitest';
import {
  createSession,
  pauseSession,
  resumeSession,
  completeSession,
  addArtifact,
  addBlocker,
  removeBlocker,
  type Session,
} from '../../workflow/session-manager.js';

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('createSession', () => {
  it('creates a session with active status', () => {
    const session = createSession('project-1', 'claude');

    expect(session.id).toBeDefined();
    expect(session.projectId).toBe('project-1');
    expect(session.agent).toBe('claude');
    expect(session.status).toBe('active');
    expect(session.position).toBe('');
    expect(session.artifacts).toEqual([]);
    expect(session.blockers).toEqual([]);
    expect(session.nextAction).toBe('');
    expect(session.startedAt).toBeDefined();
    expect(session.updatedAt).toBeDefined();
    expect(session.summary).toBeUndefined();
  });

  it('uses defaults when no arguments provided', () => {
    const session = createSession();

    expect(session.projectId).toBeUndefined();
    expect(session.agent).toBe('unknown');
  });

  it('generates unique IDs', () => {
    const s1 = createSession();
    const s2 = createSession();

    expect(s1.id).not.toBe(s2.id);
  });
});

// ---------------------------------------------------------------------------
// pauseSession
// ---------------------------------------------------------------------------

describe('pauseSession', () => {
  it('transitions active session to paused', () => {
    const session = createSession('project-1', 'claude');
    const paused = pauseSession(session, 'Working on auth module', 'Continue with middleware');

    expect(paused.status).toBe('paused');
    expect(paused.position).toBe('Working on auth module');
    expect(paused.nextAction).toBe('Continue with middleware');
  });

  it('throws when session is not active', () => {
    const session = createSession();
    const paused = pauseSession(session, 'pos', 'next');

    expect(() => pauseSession(paused, 'pos', 'next')).toThrow(
      'Cannot pause session in status: paused',
    );
  });

  it('throws when session is completed', () => {
    const session = createSession();
    const completed = completeSession(session, 'done');

    expect(() => pauseSession(completed, 'pos', 'next')).toThrow(
      'Cannot pause session in status: completed',
    );
  });

  it('returns a new session object', () => {
    const session = createSession();
    const paused = pauseSession(session, 'pos', 'next');

    expect(paused).not.toBe(session);
    expect(session.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// resumeSession
// ---------------------------------------------------------------------------

describe('resumeSession', () => {
  it('transitions paused session to active', () => {
    const session = createSession();
    const paused = pauseSession(session, 'pos', 'next');
    const resumed = resumeSession(paused);

    expect(resumed.status).toBe('active');
  });

  it('throws when session is not paused', () => {
    const session = createSession();

    expect(() => resumeSession(session)).toThrow(
      'Cannot resume session in status: active',
    );
  });

  it('throws when session is completed', () => {
    const session = createSession();
    const completed = completeSession(session, 'done');

    expect(() => resumeSession(completed)).toThrow(
      'Cannot resume session in status: completed',
    );
  });

  it('preserves position and nextAction from pause', () => {
    const session = createSession();
    const paused = pauseSession(session, 'auth module', 'add middleware');
    const resumed = resumeSession(paused);

    expect(resumed.position).toBe('auth module');
    expect(resumed.nextAction).toBe('add middleware');
  });
});

// ---------------------------------------------------------------------------
// completeSession
// ---------------------------------------------------------------------------

describe('completeSession', () => {
  it('transitions active session to completed with summary', () => {
    const session = createSession();
    const completed = completeSession(session, 'Implemented auth module with JWT');

    expect(completed.status).toBe('completed');
    expect(completed.summary).toBe('Implemented auth module with JWT');
  });

  it('can complete a paused session', () => {
    const session = createSession();
    const paused = pauseSession(session, 'pos', 'next');
    const completed = completeSession(paused, 'Finished later');

    expect(completed.status).toBe('completed');
  });

  it('throws when session is already completed', () => {
    const session = createSession();
    const completed = completeSession(session, 'done');

    expect(() => completeSession(completed, 'again')).toThrow(
      'Cannot complete an already completed session',
    );
  });

  it('returns a new session object', () => {
    const session = createSession();
    const completed = completeSession(session, 'done');

    expect(completed).not.toBe(session);
    expect(session.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// addArtifact
// ---------------------------------------------------------------------------

describe('addArtifact', () => {
  it('adds an artifact to the session', () => {
    const session = createSession();
    const updated = addArtifact(session, 'src/auth/token.ts');

    expect(updated.artifacts).toEqual(['src/auth/token.ts']);
  });

  it('appends multiple artifacts', () => {
    let session = createSession();
    session = addArtifact(session, 'src/auth/token.ts');
    session = addArtifact(session, 'src/auth/middleware.ts');

    expect(session.artifacts).toEqual(['src/auth/token.ts', 'src/auth/middleware.ts']);
  });

  it('returns a new session object', () => {
    const session = createSession();
    const updated = addArtifact(session, 'file.ts');

    expect(updated).not.toBe(session);
    expect(session.artifacts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addBlocker
// ---------------------------------------------------------------------------

describe('addBlocker', () => {
  it('adds a blocker to the session', () => {
    const session = createSession();
    const updated = addBlocker(session, 'Waiting for API key');

    expect(updated.blockers).toEqual(['Waiting for API key']);
  });

  it('appends multiple blockers', () => {
    let session = createSession();
    session = addBlocker(session, 'Blocker 1');
    session = addBlocker(session, 'Blocker 2');

    expect(session.blockers).toEqual(['Blocker 1', 'Blocker 2']);
  });

  it('returns a new session object', () => {
    const session = createSession();
    const updated = addBlocker(session, 'blocker');

    expect(updated).not.toBe(session);
    expect(session.blockers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// removeBlocker
// ---------------------------------------------------------------------------

describe('removeBlocker', () => {
  it('removes a blocker by description', () => {
    let session = createSession();
    session = addBlocker(session, 'Blocker A');
    session = addBlocker(session, 'Blocker B');
    session = removeBlocker(session, 'Blocker A');

    expect(session.blockers).toEqual(['Blocker B']);
  });

  it('returns unchanged session when blocker not found', () => {
    const session = createSession();
    const result = removeBlocker(session, 'nonexistent');

    expect(result).toBe(session);
  });

  it('removes only the first occurrence of duplicate blockers', () => {
    let session = createSession();
    session = addBlocker(session, 'Same blocker');
    session = addBlocker(session, 'Same blocker');
    session = removeBlocker(session, 'Same blocker');

    expect(session.blockers).toEqual(['Same blocker']);
  });

  it('returns a new session object when blocker removed', () => {
    let session = createSession();
    session = addBlocker(session, 'test');
    const updated = removeBlocker(session, 'test');

    expect(updated).not.toBe(session);
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle test
// ---------------------------------------------------------------------------

describe('full session lifecycle', () => {
  it('create -> add artifacts -> pause -> resume -> complete', () => {
    let session = createSession('project-1', 'claude');
    expect(session.status).toBe('active');

    session = addArtifact(session, 'src/auth.ts');
    session = addBlocker(session, 'Need API docs');
    session = removeBlocker(session, 'Need API docs');
    session = addArtifact(session, 'src/middleware.ts');

    session = pauseSession(session, 'Implemented auth', 'Add tests');
    expect(session.status).toBe('paused');

    session = resumeSession(session);
    expect(session.status).toBe('active');

    session = completeSession(session, 'Auth module complete with tests');
    expect(session.status).toBe('completed');
    expect(session.artifacts).toHaveLength(2);
    expect(session.blockers).toHaveLength(0);
    expect(session.summary).toBe('Auth module complete with tests');
  });
});
