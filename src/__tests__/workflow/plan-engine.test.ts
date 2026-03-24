/**
 * Tests for Plan Engine
 *
 * Covers:
 * - createPlan: produces valid plan from prompt shape + research
 * - decomposeTasks: breaks deliverables into tasks
 * - orderByDependency: groups tasks into phases
 * - enrichPlanWithMemory: adds memory-informed warnings
 * - validatePlanCompleteness: detects missing sections
 */

import { describe, it, expect } from 'vitest';
import {
  createPlan,
  decomposeTasks,
  orderByDependency,
  enrichPlanWithMemory,
  validatePlanCompleteness,
  type PlanInput,
  type PlanTask,
  type WorkflowPlan,
} from '../../workflow/plan-engine.js';
import type { PromptShape, SkillDefinition, AntiPatternDefinition } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePromptShape(overrides: Partial<PromptShape> = {}): PromptShape {
  return {
    goal: 'Build a user authentication system',
    context: 'Express + TypeScript + PostgreSQL',
    constraints: ['Must use bcrypt for hashing', 'Session timeout 15 min'],
    deliverable: 'Auth middleware and routes',
    validation: ['All tests pass', 'Login flow works end-to-end'],
    ...overrides,
  };
}

function makePlanInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    promptShape: makePromptShape(),
    researchResults: {
      memories: [],
      antiPatternWarnings: [],
      gapAnalysis: {},
      codebaseState: {},
    },
    skills: [],
    antiPatterns: [],
    ...overrides,
  };
}

function makeAntiPattern(overrides: Partial<AntiPatternDefinition> = {}): AntiPatternDefinition {
  return {
    name: 'Hardcoded Secrets',
    kind: 'anti_pattern',
    description: 'Credentials embedded in source code',
    trigger_pattern: 'hardcoded secrets password apikey database connection',
    failure_mode: 'Secrets leaked through version control',
    correct_approach: 'Use environment variables or secret manager',
    source_lessons: [],
    status: 'active',
    confidence: 0.9,
    successes: 5,
    failures: 0,
    last_used_at: null,
    ...overrides,
  };
}

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: 'JWT Auth Pattern',
    kind: 'skill',
    description: 'Implements JWT-based authentication with refresh tokens',
    trigger_pattern: 'authentication auth login token session middleware',
    steps: [{ description: 'Set up JWT signing' }],
    prerequisites: ['jsonwebtoken package'],
    anti_patterns: ['hardcoded-secrets'],
    validation_criteria: [{ check: 'Token expiry configured', method: 'manual' }],
    source_lessons: [],
    status: 'active',
    confidence: 0.85,
    successes: 10,
    failures: 1,
    last_used_at: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'task-1',
    description: 'Implement: Build the auth module',
    expectedArtifacts: ['auth-module'],
    status: 'pending',
    deviations: [],
    ...overrides,
  };
}

function makePlan(overrides: Partial<WorkflowPlan> = {}): WorkflowPlan {
  return {
    id: 'plan-1',
    title: 'Test Plan',
    description: 'A test plan',
    phases: [
      {
        id: 'phase-1',
        title: 'Implementation',
        description: 'Build things',
        tasks: [makeTask()],
        status: 'pending',
      },
      {
        id: 'phase-2',
        title: 'Verification',
        description: 'Test things',
        tasks: [makeTask({ description: 'Test: Verify auth works' })],
        status: 'pending',
      },
    ],
    critiqueFeedback: null,
    approved: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createPlan
// ---------------------------------------------------------------------------

describe('createPlan', () => {
  it('produces a plan with a unique id', () => {
    const result = createPlan(makePlanInput());
    expect(result.plan.id).toBeTruthy();
    expect(result.plan.id.length).toBeGreaterThan(0);
  });

  it('produces a plan with title derived from goal', () => {
    const result = createPlan(makePlanInput());
    expect(result.plan.title).toContain('Build a user authentication system');
  });

  it('produces a plan with description containing goal', () => {
    const result = createPlan(makePlanInput());
    expect(result.plan.description).toContain('Build a user authentication system');
  });

  it('includes constraints in plan description', () => {
    const result = createPlan(makePlanInput());
    expect(result.plan.description).toContain('bcrypt');
  });

  it('produces phases from deliverables', () => {
    const result = createPlan(makePlanInput());
    expect(result.plan.phases.length).toBeGreaterThan(0);
  });

  it('produces at least research, implementation, and verification phases', () => {
    const result = createPlan(makePlanInput());
    const phaseNames = result.plan.phases.map((p) => p.title);
    expect(phaseNames).toContain('Research');
    expect(phaseNames).toContain('Implementation');
    expect(phaseNames).toContain('Verification');
  });

  it('sets approved to false initially', () => {
    const result = createPlan(makePlanInput());
    expect(result.plan.approved).toBe(false);
  });

  it('sets critiqueFeedback to null initially', () => {
    const result = createPlan(makePlanInput());
    expect(result.plan.critiqueFeedback).toBeNull();
  });

  it('collects anti-pattern warnings from research results', () => {
    const result = createPlan(makePlanInput({
      researchResults: {
        memories: [],
        antiPatternWarnings: ['Watch out for N+1 queries'],
        gapAnalysis: {},
        codebaseState: {},
      },
    }));
    expect(result.warnings.some((w) => w.includes('N+1 queries'))).toBe(true);
  });

  it('reports blockers when no deliverables defined', () => {
    const result = createPlan(makePlanInput({
      promptShape: makePromptShape({ deliverable: '', validation: [] }),
    }));
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers[0]).toContain('No deliverables');
  });

  it('includes validation items as verification tasks', () => {
    const result = createPlan(makePlanInput());
    const verificationPhase = result.plan.phases.find((p) => p.title === 'Verification');
    expect(verificationPhase).toBeDefined();
    expect(verificationPhase!.tasks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// decomposeTasks
// ---------------------------------------------------------------------------

describe('decomposeTasks', () => {
  it('creates research, implement, and test tasks for each deliverable', () => {
    const tasks = decomposeTasks(['Auth middleware']);
    expect(tasks.length).toBe(3);
    expect(tasks[0].description).toContain('Research:');
    expect(tasks[1].description).toContain('Implement:');
    expect(tasks[2].description).toContain('Test:');
  });

  it('creates verify tasks for validation deliverables', () => {
    const tasks = decomposeTasks(['Validation: All tests pass']);
    expect(tasks.length).toBe(1);
    expect(tasks[0].description).toContain('Verify:');
  });

  it('returns empty array for empty deliverables', () => {
    const tasks = decomposeTasks([]);
    expect(tasks).toEqual([]);
  });

  it('generates unique IDs for each task', () => {
    const tasks = decomposeTasks(['Deliverable A', 'Deliverable B']);
    const ids = tasks.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('initializes all tasks as pending with no deviations', () => {
    const tasks = decomposeTasks(['Auth module']);
    for (const task of tasks) {
      expect(task.status).toBe('pending');
      expect(task.deviations).toEqual([]);
    }
  });

  it('sets expected artifacts on each task', () => {
    const tasks = decomposeTasks(['Auth module']);
    for (const task of tasks) {
      expect(task.expectedArtifacts.length).toBeGreaterThan(0);
    }
  });

  it('handles multiple deliverables', () => {
    const tasks = decomposeTasks(['Module A', 'Module B']);
    // 3 tasks per non-validation deliverable
    expect(tasks.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// orderByDependency
// ---------------------------------------------------------------------------

describe('orderByDependency', () => {
  it('groups research tasks into a Research phase', () => {
    const tasks = [
      makeTask({ description: 'Research: Understand the auth system' }),
      makeTask({ description: 'Implement: Build auth module' }),
    ];
    const phases = orderByDependency(tasks);
    const research = phases.find((p) => p.title === 'Research');
    expect(research).toBeDefined();
    expect(research!.tasks).toHaveLength(1);
  });

  it('groups implementation tasks into an Implementation phase', () => {
    const tasks = [
      makeTask({ description: 'Implement: Build auth module' }),
    ];
    const phases = orderByDependency(tasks);
    const impl = phases.find((p) => p.title === 'Implementation');
    expect(impl).toBeDefined();
    expect(impl!.tasks).toHaveLength(1);
  });

  it('groups verify and test tasks into a Verification phase', () => {
    const tasks = [
      makeTask({ description: 'Verify: Auth flow works' }),
      makeTask({ description: 'Test: Unit tests pass' }),
    ];
    const phases = orderByDependency(tasks);
    const verify = phases.find((p) => p.title === 'Verification');
    expect(verify).toBeDefined();
    expect(verify!.tasks).toHaveLength(2);
  });

  it('orders phases as Research -> Implementation -> Verification', () => {
    const tasks = [
      makeTask({ description: 'Test: Check results' }),
      makeTask({ description: 'Research: Analyze requirements' }),
      makeTask({ description: 'Implement: Build feature' }),
    ];
    const phases = orderByDependency(tasks);
    expect(phases[0].title).toBe('Research');
    expect(phases[1].title).toBe('Implementation');
    expect(phases[2].title).toBe('Verification');
  });

  it('omits empty phases', () => {
    const tasks = [
      makeTask({ description: 'Implement: Build feature' }),
    ];
    const phases = orderByDependency(tasks);
    expect(phases).toHaveLength(1);
    expect(phases[0].title).toBe('Implementation');
  });

  it('returns empty array for no tasks', () => {
    const phases = orderByDependency([]);
    expect(phases).toEqual([]);
  });

  it('sets all phases to pending status', () => {
    const tasks = [
      makeTask({ description: 'Research: Analyze' }),
      makeTask({ description: 'Implement: Build' }),
      makeTask({ description: 'Test: Verify' }),
    ];
    const phases = orderByDependency(tasks);
    for (const phase of phases) {
      expect(phase.status).toBe('pending');
    }
  });

  it('places unrecognized prefix tasks into Implementation phase', () => {
    const tasks = [
      makeTask({ description: 'Build the module without a prefix' }),
    ];
    const phases = orderByDependency(tasks);
    expect(phases[0].title).toBe('Implementation');
    expect(phases[0].tasks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// enrichPlanWithMemory
// ---------------------------------------------------------------------------

describe('enrichPlanWithMemory', () => {
  it('adds anti-pattern warnings as deviations on matching tasks', () => {
    const plan = makePlan({
      phases: [
        {
          id: 'p1',
          title: 'Implementation',
          description: 'Build',
          tasks: [
            makeTask({
              description: 'Implement: Set up database connection with hardcoded secrets and password',
            }),
          ],
          status: 'pending',
        },
      ],
    });

    const antiPatterns = [makeAntiPattern()];
    const enriched = enrichPlanWithMemory(plan, [], antiPatterns);

    const task = enriched.phases[0].tasks[0];
    expect(task.deviations.some((d) => d.includes('Anti-pattern risk'))).toBe(true);
    expect(task.deviations.some((d) => d.includes('Hardcoded Secrets'))).toBe(true);
  });

  it('adds skill guidance as deviations on matching tasks', () => {
    const plan = makePlan({
      phases: [
        {
          id: 'p1',
          title: 'Implementation',
          description: 'Build',
          tasks: [
            makeTask({
              description: 'Implement: Build authentication login with token session middleware',
            }),
          ],
          status: 'pending',
        },
      ],
    });

    const skills = [makeSkill()];
    const enriched = enrichPlanWithMemory(plan, skills, []);

    const task = enriched.phases[0].tasks[0];
    expect(task.deviations.some((d) => d.includes('Skill available'))).toBe(true);
    expect(task.deviations.some((d) => d.includes('JWT Auth Pattern'))).toBe(true);
  });

  it('does not add warnings for archived anti-patterns', () => {
    const plan = makePlan({
      phases: [
        {
          id: 'p1',
          title: 'Implementation',
          description: 'Build',
          tasks: [
            makeTask({
              description: 'Implement: Database connection with hardcoded secrets password',
            }),
          ],
          status: 'pending',
        },
      ],
    });

    const antiPatterns = [makeAntiPattern({ status: 'archived' })];
    const enriched = enrichPlanWithMemory(plan, [], antiPatterns);

    const task = enriched.phases[0].tasks[0];
    expect(task.deviations.filter((d) => d.includes('Anti-pattern risk'))).toHaveLength(0);
  });

  it('does not add guidance for non-active skills', () => {
    const plan = makePlan({
      phases: [
        {
          id: 'p1',
          title: 'Implementation',
          description: 'Build',
          tasks: [
            makeTask({
              description: 'Implement: Build authentication login with token session',
            }),
          ],
          status: 'pending',
        },
      ],
    });

    const skills = [makeSkill({ status: 'draft' })];
    const enriched = enrichPlanWithMemory(plan, skills, []);

    const task = enriched.phases[0].tasks[0];
    expect(task.deviations.filter((d) => d.includes('Skill available'))).toHaveLength(0);
  });

  it('does not mutate the original plan', () => {
    const plan = makePlan();
    const originalTaskDeviations = plan.phases[0].tasks[0].deviations.length;

    enrichPlanWithMemory(plan, [makeSkill()], [makeAntiPattern()]);

    expect(plan.phases[0].tasks[0].deviations.length).toBe(originalTaskDeviations);
  });

  it('returns plan unchanged when no skills or anti-patterns match', () => {
    const plan = makePlan({
      phases: [
        {
          id: 'p1',
          title: 'Implementation',
          description: 'Build',
          tasks: [makeTask({ description: 'Implement: Simple logging utility' })],
          status: 'pending',
        },
      ],
    });

    const enriched = enrichPlanWithMemory(plan, [], []);
    expect(enriched.phases[0].tasks[0].deviations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validatePlanCompleteness
// ---------------------------------------------------------------------------

describe('validatePlanCompleteness', () => {
  it('reports complete for a well-formed plan', () => {
    const plan = makePlan();
    const result = validatePlanCompleteness(plan);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('detects missing title', () => {
    const plan = makePlan({ title: '' });
    const result = validatePlanCompleteness(plan);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain('plan title');
  });

  it('detects missing description', () => {
    const plan = makePlan({ description: '' });
    const result = validatePlanCompleteness(plan);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain('plan description');
  });

  it('detects missing phases', () => {
    const plan = makePlan({ phases: [] });
    const result = validatePlanCompleteness(plan);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain('at least one phase');
  });

  it('detects missing tasks', () => {
    const plan = makePlan({
      phases: [
        {
          id: 'p1',
          title: 'Empty Phase',
          description: 'No tasks',
          tasks: [],
          status: 'pending',
        },
      ],
    });
    const result = validatePlanCompleteness(plan);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain('at least one task');
  });

  it('detects missing verification task', () => {
    const plan = makePlan({
      phases: [
        {
          id: 'p1',
          title: 'Implementation',
          description: 'Build',
          tasks: [makeTask({ description: 'Implement: Build feature' })],
          status: 'pending',
        },
      ],
    });
    const result = validatePlanCompleteness(plan);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain('verification/test task');
  });

  it('recognizes verify: prefix as verification task', () => {
    const plan = makePlan({
      phases: [
        {
          id: 'p1',
          title: 'Phase',
          description: 'Phase with verify task',
          tasks: [makeTask({ description: 'Verify: Check output quality' })],
          status: 'pending',
        },
      ],
    });
    const result = validatePlanCompleteness(plan);
    expect(result.missing).not.toContain('verification/test task');
  });

  it('recognizes test: prefix as verification task', () => {
    const plan = makePlan({
      phases: [
        {
          id: 'p1',
          title: 'Phase',
          description: 'Phase with test task',
          tasks: [makeTask({ description: 'Test: Run unit tests' })],
          status: 'pending',
        },
      ],
    });
    const result = validatePlanCompleteness(plan);
    expect(result.missing).not.toContain('verification/test task');
  });

  it('can report multiple missing sections at once', () => {
    const plan = makePlan({
      title: '',
      description: '',
      phases: [],
    });
    const result = validatePlanCompleteness(plan);
    expect(result.complete).toBe(false);
    expect(result.missing.length).toBeGreaterThanOrEqual(3);
  });
});
