/**
 * Handoff Protocol — Cross-Agent Handoff Packaging
 *
 * @deprecated Use {@link src/cognitive/continuity/handoff-manager.ts} instead.
 * The cognitive handoff manager provides DB-backed handoffs with memory
 * references, structured resumption formatting, and event bus integration.
 *
 * Manages structured handoffs between agents, packaging context,
 * learnings, references, and expectations for the receiving agent.
 *
 * Note: This uses its own Handoff interface distinct from the
 * top-level Handoff in types.ts, as it serves a different purpose
 * (packaging vs. routing metadata).
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export interface AgentHandoff {
  id: string;
  fromAgent: string;
  toAgent: string;
  sessionId: string;
  summary: string;
  learnings: string[];
  references: string[];
  expectations: string[];
  context: Record<string, string>;
  status: 'pending' | 'acknowledged' | 'completed';
  createdAt: string;
  acknowledgedAt?: string;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Create a new handoff from one agent to another.
 */
export function createHandoff(
  fromAgent: string,
  toAgent: string,
  sessionId: string,
  summary: string,
): AgentHandoff {
  return {
    id: generateId(),
    fromAgent,
    toAgent,
    sessionId,
    summary,
    learnings: [],
    references: [],
    expectations: [],
    context: {},
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Add a learning to the handoff.
 * Returns a new handoff object.
 */
export function addLearning(handoff: AgentHandoff, learning: string): AgentHandoff {
  return {
    ...handoff,
    learnings: [...handoff.learnings, learning],
  };
}

/**
 * Add a reference to the handoff.
 * Returns a new handoff object.
 */
export function addReference(handoff: AgentHandoff, reference: string): AgentHandoff {
  return {
    ...handoff,
    references: [...handoff.references, reference],
  };
}

/**
 * Add an expectation to the handoff.
 * Returns a new handoff object.
 */
export function addExpectation(handoff: AgentHandoff, expectation: string): AgentHandoff {
  return {
    ...handoff,
    expectations: [...handoff.expectations, expectation],
  };
}

/**
 * Acknowledge receipt of a handoff.
 * Throws if handoff is not in pending status.
 */
export function acknowledgeHandoff(handoff: AgentHandoff): AgentHandoff {
  if (handoff.status !== 'pending') {
    throw new Error(`Cannot acknowledge handoff in status: ${handoff.status}`);
  }

  return {
    ...handoff,
    status: 'acknowledged',
    acknowledgedAt: new Date().toISOString(),
  };
}

/**
 * Complete a handoff.
 * Throws if handoff is not in acknowledged status.
 */
export function completeHandoff(handoff: AgentHandoff): AgentHandoff {
  if (handoff.status !== 'acknowledged') {
    throw new Error(`Cannot complete handoff in status: ${handoff.status}`);
  }

  return {
    ...handoff,
    status: 'completed',
  };
}

/**
 * Serialize a handoff to a JSON string for transport.
 */
export function serializeHandoff(handoff: AgentHandoff): string {
  return JSON.stringify(handoff, null, 2);
}
