/**
 * RPI Workflow Orchestrator
 *
 * @deprecated Use {@link src/cognitive/prompt/prompt-engine.ts} instead.
 * The cognitive prompt engine (`orchestratePrompt`) provides the same
 * orchestration lifecycle with full cognitive architecture integration:
 * rule matching, expert routing, capsule assembly, skill matching,
 * reasoning scaffold generation, and context assembly. The RPC method
 * `noesis.orchestrate` exposes this to the daemon and CLI.
 *
 * Manages the full lifecycle of a structured workflow:
 * 1. INTAKE: Receive raw user request
 * 2. OPTIMIZE: Extract structured prompt shape + capsule routing + memory enrichment
 * 3. RESEARCH: Gather current state from codebase + memory
 * 4. SCORE: Run readiness gate
 * 5. PLAN: Create decision-complete plan with memory-retrieved skills/anti-patterns
 * 6. IMPLEMENT: Execute plan phase-by-phase with deviation tracking
 * 7. VALIDATE: Goal-backward verification
 */

import type {
  PromptShape,
  ReadinessScore,
} from '../types.js';
import { generateId } from '../core/ulid.js';
import { READINESS_THRESHOLD_TOTAL } from '../constants.js';

import type { WorkflowPlan, PlanPhase, PlanTask, ResearchResults } from './plan-engine.js';

// ---------------------------------------------------------------------------
// Phase type
// ---------------------------------------------------------------------------

export type WorkflowPhase =
  | 'intake'
  | 'optimize'
  | 'research'
  | 'score'
  | 'plan'
  | 'implement'
  | 'validate'
  | 'complete'
  | 'blocked';

// ---------------------------------------------------------------------------
// State & supporting types
// ---------------------------------------------------------------------------

export interface WorkflowState {
  id: string;
  phase: WorkflowPhase;
  request: string;
  projectId?: string;
  promptShape: PromptShape | null;
  capsuleId: string | null;
  researchResults: ResearchResults | null;
  readinessScore: ReadinessScore | null;
  plan: WorkflowPlan | null;
  validationResult: ValidationResult | null;
  deviations: Deviation[];
  checkpoints: WorkflowCheckpoint[];
  startedAt: string;
  updatedAt: string;
  error: string | null;
}

export interface Deviation {
  rule: 1 | 2 | 3 | 4;
  type: string;
  description: string;
  taskId: string;
  timestamp: string;
  autoFixed: boolean;
}

export interface WorkflowCheckpoint {
  type: 'human_verify' | 'decision' | 'human_action';
  description: string;
  resolved: boolean;
  timestamp: string;
}

export interface ValidationResult {
  passed: boolean;
  artifacts: ArtifactCheck[];
  summary: string;
}

export interface ArtifactCheck {
  artifact: string;
  exists: boolean;
  substantive: boolean;
  wired: boolean;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Phase ordering
// ---------------------------------------------------------------------------

/** Ordered phases for the happy path. 'blocked' and 'complete' are terminal. */
const PHASE_ORDER: readonly WorkflowPhase[] = [
  'intake',
  'optimize',
  'research',
  'score',
  'plan',
  'implement',
  'validate',
  'complete',
] as const;

// ---------------------------------------------------------------------------
// Precondition definitions
// ---------------------------------------------------------------------------

/**
 * Each phase has preconditions that must be met before it can execute.
 * Returns an array of error messages; empty means preconditions are met.
 */
function checkPreconditions(state: WorkflowState, targetPhase: WorkflowPhase): string[] {
  const errors: string[] = [];

  switch (targetPhase) {
    case 'intake':
      // No preconditions for intake
      break;

    case 'optimize':
      if (!state.request || state.request.trim().length === 0) {
        errors.push('Cannot optimize: no request provided.');
      }
      break;

    case 'research':
      if (!state.promptShape) {
        errors.push('Cannot research: prompt shape not extracted (run optimize first).');
      }
      break;

    case 'score':
      if (!state.researchResults) {
        errors.push('Cannot score: research results not available (run research first).');
      }
      break;

    case 'plan':
      if (!state.readinessScore) {
        errors.push('Cannot plan: readiness score not computed (run score first).');
      }
      if (state.readinessScore && !state.readinessScore.passed) {
        errors.push(
          `Cannot plan: readiness score ${state.readinessScore.total} is below threshold ${READINESS_THRESHOLD_TOTAL}.`,
        );
      }
      break;

    case 'implement':
      if (!state.plan) {
        errors.push('Cannot implement: no plan created (run plan first).');
      }
      if (state.plan && !state.plan.approved) {
        errors.push('Cannot implement: plan not approved.');
      }
      break;

    case 'validate':
      if (!state.plan) {
        errors.push('Cannot validate: no plan exists.');
      }
      break;

    case 'complete':
      if (!state.validationResult) {
        errors.push('Cannot complete: validation not run.');
      }
      break;

    case 'blocked':
      // Always allowed — workflow can be blocked at any time
      break;
  }

  // Check for unresolved blocking checkpoints
  const unresolvedBlocking = state.checkpoints.filter(
    (cp) => !cp.resolved && cp.type === 'human_action',
  );
  if (unresolvedBlocking.length > 0 && targetPhase !== 'blocked') {
    errors.push(
      `Cannot advance: ${unresolvedBlocking.length} unresolved human_action checkpoint(s).`,
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize a new workflow at the 'intake' phase.
 *
 * Creates the initial state with the user's raw request and optional
 * project context. All workflow data fields start as null.
 */
export function createWorkflow(request: string, projectId?: string): WorkflowState {
  const now = new Date().toISOString();

  return {
    id: generateId(),
    phase: 'intake',
    request,
    projectId,
    promptShape: null,
    capsuleId: null,
    researchResults: null,
    readinessScore: null,
    plan: null,
    validationResult: null,
    deviations: [],
    checkpoints: [],
    startedAt: now,
    updatedAt: now,
    error: null,
  };
}

/**
 * Return what's needed before a phase can run.
 *
 * Returns a list of requirement descriptions for human-readable display.
 * An empty list means the phase has no preconditions.
 */
export function getPhaseRequirements(phase: WorkflowPhase): string[] {
  switch (phase) {
    case 'intake':
      return [];
    case 'optimize':
      return ['A non-empty user request in the workflow state.'];
    case 'research':
      return ['An extracted prompt shape (optimize phase must complete first).'];
    case 'score':
      return ['Research results (research phase must complete first).'];
    case 'plan':
      return [
        'A passing readiness score (score phase must complete with total >= 70).',
      ];
    case 'implement':
      return ['An approved plan (plan phase must complete and plan must be approved).'];
    case 'validate':
      return ['A plan to validate against.'];
    case 'complete':
      return ['Validation results (validate phase must complete first).'];
    case 'blocked':
      return [];
  }
}

/**
 * Transition to a specific phase with precondition validation.
 *
 * Returns a new state with the updated phase, or the same state with an
 * error message if preconditions are not met. If the readiness score fails
 * during a score->plan transition, the workflow moves to 'blocked'.
 *
 * This function does not mutate the input state.
 */
export function transitionPhase(
  state: WorkflowState,
  nextPhase: WorkflowPhase,
): WorkflowState {
  const errors = checkPreconditions(state, nextPhase);

  if (errors.length > 0) {
    // If trying to go to 'plan' but readiness failed, go to 'blocked'
    if (
      nextPhase === 'plan' &&
      state.readinessScore &&
      !state.readinessScore.passed
    ) {
      return {
        ...state,
        phase: 'blocked',
        error: errors.join(' '),
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      ...state,
      error: errors.join(' '),
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...state,
    phase: nextPhase,
    error: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Advance to the next phase in the standard pipeline order.
 *
 * Determines the next phase from the current phase and delegates
 * to transitionPhase for precondition validation. Terminal phases
 * ('complete', 'blocked') cannot be advanced.
 */
export function advancePhase(state: WorkflowState): WorkflowState {
  if (state.phase === 'complete' || state.phase === 'blocked') {
    return {
      ...state,
      error: `Cannot advance: workflow is in terminal phase '${state.phase}'.`,
      updatedAt: new Date().toISOString(),
    };
  }

  const currentIndex = PHASE_ORDER.indexOf(state.phase);
  if (currentIndex === -1 || currentIndex >= PHASE_ORDER.length - 1) {
    return {
      ...state,
      error: `Cannot advance from phase '${state.phase}'.`,
      updatedAt: new Date().toISOString(),
    };
  }

  const nextPhase = PHASE_ORDER[currentIndex + 1];
  return transitionPhase(state, nextPhase);
}

/**
 * Record a deviation during implementation.
 *
 * Deviations track instances where the implementation diverged from
 * the plan. Each deviation is tagged with a rule number (1-4) indicating
 * the type of deviation detected.
 *
 * Does not mutate the input state.
 */
export function addDeviation(
  state: WorkflowState,
  deviation: Deviation,
): WorkflowState {
  return {
    ...state,
    deviations: [...state.deviations, deviation],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add a checkpoint that may block progress.
 *
 * Checkpoints represent points where human verification, decisions,
 * or actions are required. Unresolved 'human_action' checkpoints
 * block phase transitions.
 *
 * Does not mutate the input state.
 */
export function addCheckpoint(
  state: WorkflowState,
  checkpoint: WorkflowCheckpoint,
): WorkflowState {
  return {
    ...state,
    checkpoints: [...state.checkpoints, checkpoint],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Mark a checkpoint as resolved by its index.
 *
 * Returns the state unchanged if the index is out of bounds.
 *
 * Does not mutate the input state.
 */
export function resolveCheckpoint(
  state: WorkflowState,
  index: number,
): WorkflowState {
  if (index < 0 || index >= state.checkpoints.length) {
    return state;
  }

  const updatedCheckpoints = state.checkpoints.map((cp, i) =>
    i === index ? { ...cp, resolved: true } : cp,
  );

  return {
    ...state,
    checkpoints: updatedCheckpoints,
    updatedAt: new Date().toISOString(),
  };
}

// Re-export plan types for convenience
export type {
  WorkflowPlan,
  PlanPhase,
  PlanTask,
  ResearchResults,
};
