/**
 * Plan Engine
 *
 * Creates structured, decision-complete plans using goal-backward planning.
 * Plans are enriched with memory-retrieved skills and anti-patterns.
 *
 * Goal-backward planning:
 * 1. Define the target state (what "done" looks like)
 * 2. Work backward: what artifacts are needed?
 * 3. For each artifact: what tasks produce it?
 * 4. Order tasks by dependency
 * 5. Group into phases
 */

import type { PromptShape, SkillDefinition, AntiPatternDefinition, CriticFeedback } from '../types.js';
import { generateId } from '../core/ulid.js';

// ---------------------------------------------------------------------------
// Types — reused by the orchestrator
// ---------------------------------------------------------------------------

export interface WorkflowPlan {
  id: string;
  title: string;
  description: string;
  phases: PlanPhase[];
  critiqueFeedback: CriticFeedback | null;
  approved: boolean;
  createdAt: string;
}

export interface PlanPhase {
  id: string;
  title: string;
  description: string;
  tasks: PlanTask[];
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

export interface PlanTask {
  id: string;
  description: string;
  expectedArtifacts: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  deviations: string[];
}

export interface ResearchResults {
  memories: import('../types.js').ScoredMemory[];
  antiPatternWarnings: string[];
  gapAnalysis: Record<string, unknown>;
  codebaseState: Record<string, string>;
}

export interface PlanInput {
  promptShape: PromptShape;
  researchResults: ResearchResults;
  skills: SkillDefinition[];
  antiPatterns: AntiPatternDefinition[];
  projectId?: string;
}

export interface PlanOutput {
  plan: WorkflowPlan;
  warnings: string[];
  blockers: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a structured, decision-complete plan from a prompt shape and research.
 *
 * Uses goal-backward planning: starts with deliverables, decomposes into
 * tasks, orders by dependency, groups into phases, then enriches with
 * memory-informed recommendations.
 */
export function createPlan(input: PlanInput): PlanOutput {
  const { promptShape, researchResults, skills, antiPatterns } = input;

  const warnings: string[] = [];
  const blockers: string[] = [];

  // Step 1: Decompose deliverables into tasks
  const deliverables = promptShape.deliverable
    ? [promptShape.deliverable]
    : [];

  // Also treat validation criteria as deliverable-adjacent artifacts
  const allDeliverables = [
    ...deliverables,
    ...promptShape.validation.map((v) => `Validation: ${v}`),
  ];

  if (allDeliverables.length === 0) {
    blockers.push('No deliverables defined. Cannot create a plan without target artifacts.');
  }

  const tasks = decomposeTasks(allDeliverables);

  // Step 2: Order tasks into phases by dependency
  const phases = orderByDependency(tasks);

  // Step 3: Build the plan
  let plan: WorkflowPlan = {
    id: generateId(),
    title: `Plan: ${promptShape.goal.slice(0, 80)}`,
    description: buildPlanDescription(promptShape),
    phases,
    critiqueFeedback: null,
    approved: false,
    createdAt: new Date().toISOString(),
  };

  // Step 4: Enrich with memory-informed recommendations
  plan = enrichPlanWithMemory(plan, skills, antiPatterns);

  // Step 5: Collect warnings from research
  if (researchResults.antiPatternWarnings.length > 0) {
    warnings.push(
      ...researchResults.antiPatternWarnings.map((w) => `Anti-pattern warning: ${w}`),
    );
  }

  // Step 6: Check completeness
  const completeness = validatePlanCompleteness(plan);
  if (!completeness.complete) {
    warnings.push(
      ...completeness.missing.map((m) => `Missing plan section: ${m}`),
    );
  }

  return { plan, warnings, blockers };
}

/**
 * Break deliverables into individual tasks.
 *
 * Each deliverable produces at least one task. Validation deliverables
 * produce verification-specific tasks.
 */
export function decomposeTasks(deliverables: string[]): PlanTask[] {
  const tasks: PlanTask[] = [];

  for (const deliverable of deliverables) {
    const isValidation = deliverable.startsWith('Validation:');
    const description = isValidation
      ? deliverable.replace('Validation: ', '')
      : deliverable;

    if (isValidation) {
      // Verification tasks
      tasks.push({
        id: generateId(),
        description: `Verify: ${description}`,
        expectedArtifacts: [`verification-result-${tasks.length}`],
        status: 'pending',
        deviations: [],
      });
    } else {
      // Implementation tasks — create a research + implement + verify chain
      tasks.push({
        id: generateId(),
        description: `Research: Understand requirements for ${description}`,
        expectedArtifacts: [`research-notes-${tasks.length}`],
        status: 'pending',
        deviations: [],
      });

      tasks.push({
        id: generateId(),
        description: `Implement: ${description}`,
        expectedArtifacts: [description],
        status: 'pending',
        deviations: [],
      });

      tasks.push({
        id: generateId(),
        description: `Test: Verify ${description} meets requirements`,
        expectedArtifacts: [`test-results-${tasks.length}`],
        status: 'pending',
        deviations: [],
      });
    }
  }

  return tasks;
}

/**
 * Group tasks into phases ordered by dependency.
 *
 * Tasks are grouped by their implicit type:
 * - Phase 1: Research tasks
 * - Phase 2: Implementation tasks
 * - Phase 3: Verification / testing tasks
 *
 * Tasks that do not match any prefix are placed in the implementation phase.
 */
export function orderByDependency(tasks: PlanTask[]): PlanPhase[] {
  const researchTasks: PlanTask[] = [];
  const implementTasks: PlanTask[] = [];
  const verifyTasks: PlanTask[] = [];

  for (const task of tasks) {
    const desc = task.description.toLowerCase();
    if (desc.startsWith('research:')) {
      researchTasks.push(task);
    } else if (desc.startsWith('verify:') || desc.startsWith('test:')) {
      verifyTasks.push(task);
    } else {
      implementTasks.push(task);
    }
  }

  const phases: PlanPhase[] = [];

  if (researchTasks.length > 0) {
    phases.push({
      id: generateId(),
      title: 'Research',
      description: 'Gather requirements and understand the problem space.',
      tasks: researchTasks,
      status: 'pending',
    });
  }

  if (implementTasks.length > 0) {
    phases.push({
      id: generateId(),
      title: 'Implementation',
      description: 'Build the required artifacts.',
      tasks: implementTasks,
      status: 'pending',
    });
  }

  if (verifyTasks.length > 0) {
    phases.push({
      id: generateId(),
      title: 'Verification',
      description: 'Validate all deliverables meet requirements.',
      tasks: verifyTasks,
      status: 'pending',
    });
  }

  return phases;
}

/**
 * Enrich a plan with memory-informed recommendations.
 *
 * Adds anti-pattern warnings as deviations on relevant tasks and
 * injects skill-derived context into task descriptions.
 */
export function enrichPlanWithMemory(
  plan: WorkflowPlan,
  skills: SkillDefinition[],
  antiPatterns: AntiPatternDefinition[],
): WorkflowPlan {
  const enrichedPhases = plan.phases.map((phase) => {
    const enrichedTasks = phase.tasks.map((task) => {
      const taskLower = task.description.toLowerCase();
      const warnings: string[] = [];

      // Check anti-patterns against task descriptions
      for (const ap of antiPatterns) {
        if (ap.status !== 'active' && ap.status !== 'draft') continue;

        const triggerWords = ap.trigger_pattern
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);

        const matchingWords = triggerWords.filter((w) => taskLower.includes(w));
        if (triggerWords.length > 0 && matchingWords.length / triggerWords.length > 0.3) {
          warnings.push(`Anti-pattern risk: "${ap.name}" — ${ap.correct_approach}`);
        }
      }

      // Check skills for applicable guidance
      for (const skill of skills) {
        if (skill.status !== 'active') continue;

        const triggerWords = skill.trigger_pattern
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);

        const matchingWords = triggerWords.filter((w) => taskLower.includes(w));
        if (triggerWords.length > 0 && matchingWords.length / triggerWords.length > 0.3) {
          warnings.push(`Skill available: "${skill.name}" — ${skill.description}`);
        }
      }

      return {
        ...task,
        deviations: [...task.deviations, ...warnings],
      };
    });

    return { ...phase, tasks: enrichedTasks };
  });

  return { ...plan, phases: enrichedPhases };
}

/**
 * Validate that a plan has all required sections.
 *
 * Checks for:
 * - At least one phase
 * - At least one task
 * - A title and description
 * - At least one verification/test task
 */
export function validatePlanCompleteness(
  plan: WorkflowPlan,
): { complete: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!plan.title || plan.title.trim().length === 0) {
    missing.push('plan title');
  }

  if (!plan.description || plan.description.trim().length === 0) {
    missing.push('plan description');
  }

  if (plan.phases.length === 0) {
    missing.push('at least one phase');
  }

  const totalTasks = plan.phases.reduce((sum, p) => sum + p.tasks.length, 0);
  if (totalTasks === 0) {
    missing.push('at least one task');
  }

  // Check for verification tasks
  const hasVerification = plan.phases.some((phase) =>
    phase.tasks.some((task) => {
      const desc = task.description.toLowerCase();
      return desc.startsWith('verify:') || desc.startsWith('test:');
    }),
  );

  if (!hasVerification && totalTasks > 0) {
    missing.push('verification/test task');
  }

  return {
    complete: missing.length === 0,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildPlanDescription(shape: PromptShape): string {
  const parts: string[] = [];

  parts.push(`Goal: ${shape.goal}`);

  if (shape.context) {
    parts.push(`Context: ${shape.context}`);
  }

  if (shape.constraints.length > 0) {
    parts.push(`Constraints: ${shape.constraints.join('; ')}`);
  }

  return parts.join('\n');
}
