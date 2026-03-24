/**
 * Tests for RPI Workflow Orchestrator
 *
 * Covers:
 * - createWorkflow: initialization of workflow state
 * - advancePhase: sequential phase progression
 * - transitionPhase: precondition validation
 * - addDeviation / addCheckpoint / resolveCheckpoint: state management
 * - blocked phase when readiness score < 70
 * - complete phase after all phases pass
 */

import { describe, it, expect } from 'vitest';
import {
  createWorkflow,
  advancePhase,
  transitionPhase,
  getPhaseRequirements,
  addDeviation,
  addCheckpoint,
  resolveCheckpoint,
  type WorkflowState,
  type WorkflowPhase,
  type Deviation,
  type WorkflowCheckpoint,
} from '../../workflow/rpi-orchestrator.js';
import type { ReadinessScore, PromptShape } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePromptShape(overrides: Partial<PromptShape> = {}): PromptShape {
  return {
    goal: 'Build authentication module',
    context: 'Express + TypeScript',
    constraints: ['Must use bcrypt'],
    deliverable: 'Auth middleware',
    validation: ['Tests pass'],
    ...overrides,
  };
}

function makePassingReadinessScore(overrides: Partial<ReadinessScore> = {}): ReadinessScore {
  return {
    clarity: 18,
    codebase: 16,
    constraints: 15,
    risks: 12,
    verification: 14,
    total: 75,
    passed: true,
    gaps: [],
    ...overrides,
  };
}

function makeFailingReadinessScore(overrides: Partial<ReadinessScore> = {}): ReadinessScore {
  return {
    clarity: 8,
    codebase: 5,
    constraints: 5,
    risks: 4,
    verification: 3,
    total: 25,
    passed: false,
    gaps: [{ dimension: 'total', current: 25, required: 70, suggestion: 'Improve.' }],
    ...overrides,
  };
}

function makeResearchResults() {
  return {
    memories: [],
    antiPatternWarnings: [],
    gapAnalysis: {},
    codebaseState: {},
  };
}

function makeDeviation(overrides: Partial<Deviation> = {}): Deviation {
  return {
    rule: 1,
    type: 'scope-change',
    description: 'Added extra validation not in plan.',
    taskId: 'task-1',
    timestamp: new Date().toISOString(),
    autoFixed: false,
    ...overrides,
  };
}

function makeCheckpoint(overrides: Partial<WorkflowCheckpoint> = {}): WorkflowCheckpoint {
  return {
    type: 'human_verify',
    description: 'Verify the auth flow works end to end.',
    resolved: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makePlan() {
  return {
    id: 'plan-1',
    title: 'Test Plan',
    description: 'A test plan',
    phases: [],
    critiqueFeedback: null,
    approved: true,
    createdAt: new Date().toISOString(),
  };
}

function makeValidationResult(passed = true) {
  return {
    passed,
    artifacts: [],
    summary: passed ? 'All checks passed' : 'Some checks failed',
  };
}

/**
 * Build a workflow state at a specific phase with all necessary
 * preconditions satisfied up to that phase.
 */
function buildStateAtPhase(phase: WorkflowPhase): WorkflowState {
  const base = createWorkflow('Build authentication module', 'proj-1');

  switch (phase) {
    case 'intake':
      return base;

    case 'optimize':
      return { ...base, phase: 'optimize' };

    case 'research':
      return {
        ...base,
        phase: 'research',
        promptShape: makePromptShape(),
      };

    case 'score':
      return {
        ...base,
        phase: 'score',
        promptShape: makePromptShape(),
        researchResults: makeResearchResults(),
      };

    case 'plan':
      return {
        ...base,
        phase: 'plan',
        promptShape: makePromptShape(),
        researchResults: makeResearchResults(),
        readinessScore: makePassingReadinessScore(),
      };

    case 'implement':
      return {
        ...base,
        phase: 'implement',
        promptShape: makePromptShape(),
        researchResults: makeResearchResults(),
        readinessScore: makePassingReadinessScore(),
        plan: makePlan(),
      };

    case 'validate':
      return {
        ...base,
        phase: 'validate',
        promptShape: makePromptShape(),
        researchResults: makeResearchResults(),
        readinessScore: makePassingReadinessScore(),
        plan: makePlan(),
      };

    case 'complete':
      return {
        ...base,
        phase: 'complete',
        promptShape: makePromptShape(),
        researchResults: makeResearchResults(),
        readinessScore: makePassingReadinessScore(),
        plan: makePlan(),
        validationResult: makeValidationResult(),
      };

    case 'blocked':
      return {
        ...base,
        phase: 'blocked',
        readinessScore: makeFailingReadinessScore(),
        error: 'Readiness score too low.',
      };
  }
}

// ---------------------------------------------------------------------------
// createWorkflow
// ---------------------------------------------------------------------------

describe('createWorkflow', () => {
  it('initializes state at intake phase', () => {
    const state = createWorkflow('Build auth module');
    expect(state.phase).toBe('intake');
  });

  it('sets the request from the input', () => {
    const state = createWorkflow('Build auth module');
    expect(state.request).toBe('Build auth module');
  });

  it('sets the optional projectId', () => {
    const state = createWorkflow('Build auth module', 'proj-123');
    expect(state.projectId).toBe('proj-123');
  });

  it('generates a unique id', () => {
    const state1 = createWorkflow('Task 1');
    const state2 = createWorkflow('Task 2');
    expect(state1.id).toBeTruthy();
    expect(state2.id).toBeTruthy();
    expect(state1.id).not.toBe(state2.id);
  });

  it('initializes all data fields as null', () => {
    const state = createWorkflow('Build auth module');
    expect(state.promptShape).toBeNull();
    expect(state.capsuleId).toBeNull();
    expect(state.researchResults).toBeNull();
    expect(state.readinessScore).toBeNull();
    expect(state.plan).toBeNull();
    expect(state.validationResult).toBeNull();
    expect(state.error).toBeNull();
  });

  it('initializes empty arrays for deviations and checkpoints', () => {
    const state = createWorkflow('Build auth module');
    expect(state.deviations).toEqual([]);
    expect(state.checkpoints).toEqual([]);
  });

  it('sets startedAt and updatedAt timestamps', () => {
    const state = createWorkflow('Build auth module');
    expect(state.startedAt).toBeTruthy();
    expect(state.updatedAt).toBeTruthy();
    // They should be the same at creation
    expect(state.startedAt).toBe(state.updatedAt);
  });
});

// ---------------------------------------------------------------------------
// advancePhase
// ---------------------------------------------------------------------------

describe('advancePhase', () => {
  it('advances from intake to optimize', () => {
    const state = buildStateAtPhase('intake');
    const next = advancePhase(state);
    expect(next.phase).toBe('optimize');
    expect(next.error).toBeNull();
  });

  it('advances from optimize to research when prompt shape exists', () => {
    let state = buildStateAtPhase('optimize');
    state = { ...state, promptShape: makePromptShape() };
    const next = advancePhase(state);
    expect(next.phase).toBe('research');
  });

  it('advances from research to score when research results exist', () => {
    let state = buildStateAtPhase('research');
    state = { ...state, researchResults: makeResearchResults() };
    const next = advancePhase(state);
    expect(next.phase).toBe('score');
  });

  it('advances from score to plan when readiness passes', () => {
    let state = buildStateAtPhase('score');
    state = { ...state, readinessScore: makePassingReadinessScore() };
    const next = advancePhase(state);
    expect(next.phase).toBe('plan');
  });

  it('advances from plan to implement when plan is approved', () => {
    let state = buildStateAtPhase('plan');
    state = { ...state, plan: makePlan() };
    const next = advancePhase(state);
    expect(next.phase).toBe('implement');
  });

  it('advances from implement to validate when plan exists', () => {
    const state = buildStateAtPhase('implement');
    const next = advancePhase(state);
    expect(next.phase).toBe('validate');
  });

  it('advances from validate to complete when validation exists', () => {
    let state = buildStateAtPhase('validate');
    state = { ...state, validationResult: makeValidationResult() };
    const next = advancePhase(state);
    expect(next.phase).toBe('complete');
  });

  it('returns error when trying to advance from complete', () => {
    const state = buildStateAtPhase('complete');
    const next = advancePhase(state);
    expect(next.phase).toBe('complete');
    expect(next.error).toContain('terminal phase');
  });

  it('returns error when trying to advance from blocked', () => {
    const state = buildStateAtPhase('blocked');
    const next = advancePhase(state);
    expect(next.phase).toBe('blocked');
    expect(next.error).toContain('terminal phase');
  });
});

// ---------------------------------------------------------------------------
// transitionPhase — precondition validation
// ---------------------------------------------------------------------------

describe('transitionPhase', () => {
  it('validates that optimize requires a non-empty request', () => {
    const state = createWorkflow('');
    const next = transitionPhase(state, 'optimize');
    expect(next.error).toContain('no request');
    expect(next.phase).toBe('intake'); // stays at intake
  });

  it('validates that research requires prompt shape', () => {
    const state = buildStateAtPhase('optimize');
    const next = transitionPhase(state, 'research');
    expect(next.error).toContain('prompt shape');
  });

  it('validates that score requires research results', () => {
    let state = buildStateAtPhase('research');
    state = { ...state, researchResults: null };
    const next = transitionPhase(state, 'score');
    expect(next.error).toContain('research results');
  });

  it('validates that plan requires passing readiness score', () => {
    let state = buildStateAtPhase('score');
    state = { ...state, readinessScore: makeFailingReadinessScore() };
    const next = transitionPhase(state, 'plan');
    // Should transition to 'blocked' instead of staying at current phase
    expect(next.phase).toBe('blocked');
    expect(next.error).toContain('readiness score');
  });

  it('validates that implement requires an approved plan', () => {
    let state = buildStateAtPhase('plan');
    state = { ...state, plan: { ...makePlan(), approved: false } };
    const next = transitionPhase(state, 'implement');
    expect(next.error).toContain('plan not approved');
  });

  it('validates that implement requires a plan to exist', () => {
    let state = buildStateAtPhase('plan');
    state = { ...state, plan: null };
    const next = transitionPhase(state, 'implement');
    expect(next.error).toContain('no plan');
  });

  it('validates that validate requires a plan', () => {
    let state = buildStateAtPhase('implement');
    state = { ...state, plan: null };
    const next = transitionPhase(state, 'validate');
    expect(next.error).toContain('no plan');
  });

  it('validates that complete requires validation result', () => {
    let state = buildStateAtPhase('validate');
    state = { ...state, validationResult: null };
    const next = transitionPhase(state, 'complete');
    expect(next.error).toContain('validation');
  });

  it('allows transition to blocked from any phase', () => {
    const state = buildStateAtPhase('research');
    const next = transitionPhase(state, 'blocked');
    expect(next.phase).toBe('blocked');
    expect(next.error).toBeNull();
  });

  it('clears error on successful transition', () => {
    let state = buildStateAtPhase('optimize');
    state = { ...state, promptShape: makePromptShape(), error: 'previous error' };
    const next = transitionPhase(state, 'research');
    expect(next.phase).toBe('research');
    expect(next.error).toBeNull();
  });

  it('updates the updatedAt timestamp on transition', () => {
    const state = buildStateAtPhase('intake');
    const originalUpdatedAt = state.updatedAt;
    // Small delay to ensure different timestamp
    const next = transitionPhase(state, 'optimize');
    expect(next.updatedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Blocked phase when readiness < 70
// ---------------------------------------------------------------------------

describe('blocked phase on low readiness', () => {
  it('transitions to blocked when readiness score fails', () => {
    let state = buildStateAtPhase('score');
    state = { ...state, readinessScore: makeFailingReadinessScore() };
    const next = transitionPhase(state, 'plan');
    expect(next.phase).toBe('blocked');
  });

  it('includes readiness score in error message', () => {
    let state = buildStateAtPhase('score');
    state = { ...state, readinessScore: makeFailingReadinessScore({ total: 45 }) };
    const next = transitionPhase(state, 'plan');
    expect(next.error).toContain('45');
  });

  it('cannot advance from blocked phase', () => {
    const state = buildStateAtPhase('blocked');
    const next = advancePhase(state);
    expect(next.phase).toBe('blocked');
    expect(next.error).toContain('terminal');
  });
});

// ---------------------------------------------------------------------------
// Complete phase after all phases pass
// ---------------------------------------------------------------------------

describe('complete phase', () => {
  it('reaches complete phase after successful validation', () => {
    let state = buildStateAtPhase('validate');
    state = { ...state, validationResult: makeValidationResult(true) };
    const next = transitionPhase(state, 'complete');
    expect(next.phase).toBe('complete');
    expect(next.error).toBeNull();
  });

  it('can also complete with failing validation (validation just records results)', () => {
    let state = buildStateAtPhase('validate');
    state = { ...state, validationResult: makeValidationResult(false) };
    const next = transitionPhase(state, 'complete');
    expect(next.phase).toBe('complete');
  });
});

// ---------------------------------------------------------------------------
// getPhaseRequirements
// ---------------------------------------------------------------------------

describe('getPhaseRequirements', () => {
  it('returns empty array for intake', () => {
    expect(getPhaseRequirements('intake')).toEqual([]);
  });

  it('returns requirements for optimize', () => {
    const reqs = getPhaseRequirements('optimize');
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs[0]).toContain('request');
  });

  it('returns requirements for research', () => {
    const reqs = getPhaseRequirements('research');
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs[0]).toContain('prompt shape');
  });

  it('returns requirements for plan', () => {
    const reqs = getPhaseRequirements('plan');
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs[0]).toContain('readiness');
  });

  it('returns requirements for implement', () => {
    const reqs = getPhaseRequirements('implement');
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs[0]).toContain('plan');
  });

  it('returns empty array for blocked', () => {
    expect(getPhaseRequirements('blocked')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addDeviation
// ---------------------------------------------------------------------------

describe('addDeviation', () => {
  it('records a deviation in the state', () => {
    const state = buildStateAtPhase('implement');
    const deviation = makeDeviation();
    const next = addDeviation(state, deviation);
    expect(next.deviations).toHaveLength(1);
    expect(next.deviations[0]).toEqual(deviation);
  });

  it('preserves existing deviations', () => {
    let state = buildStateAtPhase('implement');
    state = addDeviation(state, makeDeviation({ description: 'First' }));
    state = addDeviation(state, makeDeviation({ description: 'Second' }));
    expect(state.deviations).toHaveLength(2);
    expect(state.deviations[0].description).toBe('First');
    expect(state.deviations[1].description).toBe('Second');
  });

  it('does not mutate the original state', () => {
    const state = buildStateAtPhase('implement');
    const next = addDeviation(state, makeDeviation());
    expect(state.deviations).toHaveLength(0);
    expect(next.deviations).toHaveLength(1);
  });

  it('updates the updatedAt timestamp', () => {
    const state = buildStateAtPhase('implement');
    const next = addDeviation(state, makeDeviation());
    expect(next.updatedAt).toBeTruthy();
  });

  it('preserves deviation fields correctly', () => {
    const state = buildStateAtPhase('implement');
    const deviation = makeDeviation({
      rule: 3,
      type: 'artifact-missing',
      description: 'Expected test file not created',
      taskId: 'task-42',
      autoFixed: true,
    });
    const next = addDeviation(state, deviation);
    expect(next.deviations[0].rule).toBe(3);
    expect(next.deviations[0].type).toBe('artifact-missing');
    expect(next.deviations[0].autoFixed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addCheckpoint / resolveCheckpoint
// ---------------------------------------------------------------------------

describe('addCheckpoint', () => {
  it('adds a checkpoint to the state', () => {
    const state = buildStateAtPhase('implement');
    const checkpoint = makeCheckpoint();
    const next = addCheckpoint(state, checkpoint);
    expect(next.checkpoints).toHaveLength(1);
    expect(next.checkpoints[0]).toEqual(checkpoint);
  });

  it('preserves existing checkpoints', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint({ description: 'Check 1' }));
    state = addCheckpoint(state, makeCheckpoint({ description: 'Check 2' }));
    expect(state.checkpoints).toHaveLength(2);
  });

  it('does not mutate the original state', () => {
    const state = buildStateAtPhase('implement');
    const next = addCheckpoint(state, makeCheckpoint());
    expect(state.checkpoints).toHaveLength(0);
    expect(next.checkpoints).toHaveLength(1);
  });
});

describe('resolveCheckpoint', () => {
  it('marks a checkpoint as resolved by index', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint({ resolved: false }));
    const next = resolveCheckpoint(state, 0);
    expect(next.checkpoints[0].resolved).toBe(true);
  });

  it('does not affect other checkpoints', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint({ description: 'First', resolved: false }));
    state = addCheckpoint(state, makeCheckpoint({ description: 'Second', resolved: false }));
    const next = resolveCheckpoint(state, 0);
    expect(next.checkpoints[0].resolved).toBe(true);
    expect(next.checkpoints[1].resolved).toBe(false);
  });

  it('returns state unchanged for out-of-bounds index', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint());
    const next = resolveCheckpoint(state, 5);
    expect(next).toBe(state); // Same reference — no change
  });

  it('returns state unchanged for negative index', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint());
    const next = resolveCheckpoint(state, -1);
    expect(next).toBe(state);
  });

  it('does not mutate the original state', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint({ resolved: false }));
    const next = resolveCheckpoint(state, 0);
    expect(state.checkpoints[0].resolved).toBe(false);
    expect(next.checkpoints[0].resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Checkpoint blocking
// ---------------------------------------------------------------------------

describe('checkpoint blocking', () => {
  it('blocks phase transition when unresolved human_action checkpoint exists', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint({
      type: 'human_action',
      resolved: false,
    }));
    const next = advancePhase(state);
    expect(next.error).toContain('unresolved human_action');
  });

  it('allows phase transition after checkpoint is resolved', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint({
      type: 'human_action',
      resolved: false,
    }));
    state = resolveCheckpoint(state, 0);
    const next = advancePhase(state);
    expect(next.phase).toBe('validate');
    expect(next.error).toBeNull();
  });

  it('does not block for human_verify checkpoints (only human_action blocks)', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint({
      type: 'human_verify',
      resolved: false,
    }));
    const next = advancePhase(state);
    expect(next.phase).toBe('validate');
  });

  it('does not block for decision checkpoints', () => {
    let state = buildStateAtPhase('implement');
    state = addCheckpoint(state, makeCheckpoint({
      type: 'decision',
      resolved: false,
    }));
    const next = advancePhase(state);
    expect(next.phase).toBe('validate');
  });
});
