/**
 * Session Manager — Session Lifecycle Management
 *
 * @deprecated Use {@link src/cognitive/continuity/session-manager.ts} instead.
 * The cognitive session manager provides DB-backed persistent sessions,
 * checkpoint creation, cross-session continuity, and context assembly
 * integration with the cognitive architecture.
 *
 * Manages the lifecycle of agent work sessions:
 * - Create a new session
 * - Pause with position and next action
 * - Resume a paused session
 * - Complete with summary
 * - Track artifacts and blockers
 *
 * Sessions provide continuity context across agent interactions.
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export interface Session {
  id: string;
  projectId?: string;
  agent: string;
  status: 'active' | 'paused' | 'completed';
  position: string;
  artifacts: string[];
  blockers: string[];
  nextAction: string;
  startedAt: string;
  updatedAt: string;
  summary?: string;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Create a new active session.
 */
export function createSession(projectId?: string, agent?: string): Session {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    projectId,
    agent: agent ?? 'unknown',
    status: 'active',
    position: '',
    artifacts: [],
    blockers: [],
    nextAction: '',
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Pause an active session, recording current position and next action.
 * Throws if session is not active.
 */
export function pauseSession(
  session: Session,
  position: string,
  nextAction: string,
): Session {
  if (session.status !== 'active') {
    throw new Error(`Cannot pause session in status: ${session.status}`);
  }

  return {
    ...session,
    status: 'paused',
    position,
    nextAction,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Resume a paused session back to active status.
 * Throws if session is not paused.
 */
export function resumeSession(session: Session): Session {
  if (session.status !== 'paused') {
    throw new Error(`Cannot resume session in status: ${session.status}`);
  }

  return {
    ...session,
    status: 'active',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Complete a session with a summary.
 * Throws if session is already completed.
 */
export function completeSession(session: Session, summary: string): Session {
  if (session.status === 'completed') {
    throw new Error('Cannot complete an already completed session');
  }

  return {
    ...session,
    status: 'completed',
    summary,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add an artifact path to the session.
 * Returns a new session object.
 */
export function addArtifact(session: Session, artifact: string): Session {
  return {
    ...session,
    artifacts: [...session.artifacts, artifact],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add a blocker description to the session.
 * Returns a new session object.
 */
export function addBlocker(session: Session, blocker: string): Session {
  return {
    ...session,
    blockers: [...session.blockers, blocker],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove a blocker from the session by its description.
 * Returns a new session object. If blocker is not found, returns unchanged.
 */
export function removeBlocker(session: Session, blocker: string): Session {
  const idx = session.blockers.indexOf(blocker);
  if (idx === -1) return session;

  return {
    ...session,
    blockers: session.blockers.filter((_, i) => i !== idx),
    updatedAt: new Date().toISOString(),
  };
}
