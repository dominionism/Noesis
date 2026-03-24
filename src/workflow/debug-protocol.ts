/**
 * Debug Protocol — Persistent Debug State Management
 *
 * Manages structured debugging sessions with immutability constraints:
 *
 * - symptoms: IMMUTABLE after gathering phase (addSymptom throws if status !== 'gathering')
 * - eliminated: APPEND ONLY (never removed)
 * - evidence: APPEND ONLY (never removed)
 *
 * Status transitions: gathering -> investigating -> fixing -> verifying -> resolved
 *
 * The debug state can be serialized to JSON for persistence across sessions
 * and parsed back from stored content.
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export type DebugStatus = 'gathering' | 'investigating' | 'fixing' | 'verifying' | 'resolved';

export interface DebugState {
  id: string;
  status: DebugStatus;
  trigger: string;
  currentFocus: {
    hypothesis: string;
    test: string;
    expecting: string;
    nextAction: string;
  };
  symptoms: string[];
  eliminated: string[];
  evidence: string[];
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===========================================================================
// Valid status transitions
// ===========================================================================

const VALID_TRANSITIONS: Record<DebugStatus, DebugStatus[]> = {
  gathering: ['investigating'],
  investigating: ['fixing', 'gathering'],
  fixing: ['verifying'],
  verifying: ['resolved', 'investigating'],
  resolved: [],
};

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Create a new debug session with the given trigger description.
 * Starts in 'gathering' status.
 */
export function createDebugSession(trigger: string): DebugState {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    status: 'gathering',
    trigger,
    currentFocus: {
      hypothesis: '',
      test: '',
      expecting: '',
      nextAction: '',
    },
    symptoms: [],
    eliminated: [],
    evidence: [],
    resolution: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update the current focus of a debug session.
 * Returns a new state object (immutable update).
 */
export function updateDebugFocus(
  state: DebugState,
  focus: DebugState['currentFocus'],
): DebugState {
  return {
    ...state,
    currentFocus: { ...focus },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add a symptom to the debug session.
 *
 * CONSTRAINT: Throws if status is not 'gathering'.
 * Symptoms are immutable once the gathering phase ends.
 */
export function addSymptom(state: DebugState, symptom: string): DebugState {
  if (state.status !== 'gathering') {
    throw new Error(
      `Cannot add symptoms after gathering phase. Current status: ${state.status}`,
    );
  }

  return {
    ...state,
    symptoms: [...state.symptoms, symptom],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add an eliminated hypothesis to the debug session.
 * APPEND ONLY — eliminated entries are never removed.
 */
export function addEliminated(state: DebugState, eliminated: string): DebugState {
  return {
    ...state,
    eliminated: [...state.eliminated, eliminated],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add evidence to the debug session.
 * APPEND ONLY — evidence entries are never removed.
 */
export function addEvidence(state: DebugState, evidence: string): DebugState {
  return {
    ...state,
    evidence: [...state.evidence, evidence],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Transition the debug session to a new status.
 *
 * Valid transitions:
 * - gathering -> investigating
 * - investigating -> fixing | gathering
 * - fixing -> verifying
 * - verifying -> resolved | investigating
 *
 * Throws on invalid transitions.
 */
export function transitionDebugStatus(
  state: DebugState,
  newStatus: DebugStatus,
): DebugState {
  const validTargets = VALID_TRANSITIONS[state.status];
  if (!validTargets.includes(newStatus)) {
    throw new Error(
      `Invalid debug status transition: ${state.status} -> ${newStatus}. Valid targets: ${validTargets.join(', ') || 'none'}`,
    );
  }

  return {
    ...state,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Set the resolution for a debug session.
 * Should be called when transitioning to 'resolved' status.
 */
export function setResolution(state: DebugState, resolution: string): DebugState {
  return {
    ...state,
    resolution,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Serialize a debug state to a JSON string for persistence.
 */
export function serializeDebugState(state: DebugState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Parse a debug state from a JSON string.
 * Throws if the content is not valid JSON or missing required fields.
 */
export function parseDebugState(content: string): DebugState {
  const parsed = JSON.parse(content);

  // Validate required fields
  const requiredFields: Array<keyof DebugState> = [
    'id',
    'status',
    'trigger',
    'currentFocus',
    'symptoms',
    'eliminated',
    'evidence',
    'resolution',
    'createdAt',
    'updatedAt',
  ];

  for (const field of requiredFields) {
    if (!(field in parsed)) {
      throw new Error(`Missing required field in debug state: ${field}`);
    }
  }

  // Validate status value
  const validStatuses: DebugStatus[] = [
    'gathering',
    'investigating',
    'fixing',
    'verifying',
    'resolved',
  ];
  if (!validStatuses.includes(parsed.status)) {
    throw new Error(`Invalid debug status: ${parsed.status}`);
  }

  // Validate currentFocus structure
  const focusFields = ['hypothesis', 'test', 'expecting', 'nextAction'];
  for (const field of focusFields) {
    if (!(field in parsed.currentFocus)) {
      throw new Error(`Missing required field in currentFocus: ${field}`);
    }
  }

  // Validate array fields
  if (!Array.isArray(parsed.symptoms)) {
    throw new Error('symptoms must be an array');
  }
  if (!Array.isArray(parsed.eliminated)) {
    throw new Error('eliminated must be an array');
  }
  if (!Array.isArray(parsed.evidence)) {
    throw new Error('evidence must be an array');
  }

  return parsed as DebugState;
}
