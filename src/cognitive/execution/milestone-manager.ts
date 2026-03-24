/**
 * Milestone Manager — Milestone lifecycle and roadmap management.
 *
 * Milestones are major project goals that contain phases.
 * Stored as execution_state rows where milestone is set.
 *
 * Provides:
 * - Create/complete milestones
 * - Audit milestone against requirements
 * - Roadmap management (add/insert/remove phases)
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { ExecutionState, ExecutionStatus } from '../types.js';
import { generateId } from '../../core/ulid.js';
import {
  createExecution,
  listExecutions,
  updateExecution,
  getExecution,
  deleteExecution,
} from './gsd-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  status: ExecutionStatus;
  phases: ExecutionState[];
  created_at: string;
}

export interface MilestoneAudit {
  passed: boolean;
  gaps: string[];
  coverage: number;
  completedPhases: number;
  totalPhases: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new milestone for a project.
 *
 * A milestone is an execution_state row at phase_number=0
 * with a unique milestone name.
 */
export function createMilestone(
  db: DatabaseConnection,
  projectId: string,
  name: string,
  description: string,
): ExecutionState {
  return createExecution(db, {
    project_id: projectId,
    milestone: name,
    phase_number: 0,
    status: 'pending',
  });
}

/**
 * Complete a milestone.
 *
 * Marks the milestone's execution_state as completed.
 */
export function completeMilestone(
  db: DatabaseConnection,
  milestoneId: string,
): void {
  updateExecution(db, milestoneId, { status: 'completed' });
}

/**
 * Audit a milestone's completion against its phases.
 *
 * Returns coverage percentage and any gaps.
 */
export function auditMilestone(
  db: DatabaseConnection,
  projectId: string,
  milestoneName: string,
): MilestoneAudit {
  const executions = listExecutions(db, projectId);
  const milestonePhases = executions.filter(
    e => e.milestone === milestoneName && e.phase_number > 0,
  );

  if (milestonePhases.length === 0) {
    return {
      passed: false,
      gaps: ['No phases defined for this milestone'],
      coverage: 0,
      completedPhases: 0,
      totalPhases: 0,
    };
  }

  const completed = milestonePhases.filter(p => p.status === 'completed');
  const coverage = completed.length / milestonePhases.length;
  const gaps: string[] = [];

  for (const phase of milestonePhases) {
    if (phase.status !== 'completed') {
      gaps.push(`Phase ${phase.phase_number}: ${phase.status}`);
    }

    // Check for unresolved checkpoints
    const unresolved = phase.checkpoints.filter(c => !c.resolved);
    if (unresolved.length > 0) {
      gaps.push(`Phase ${phase.phase_number}: ${unresolved.length} unresolved checkpoint(s)`);
    }

    // Check for rule-4 deviations
    const rule4 = phase.deviations.filter(d => d.rule === 4);
    if (rule4.length > 0) {
      gaps.push(`Phase ${phase.phase_number}: ${rule4.length} architectural deviation(s) unresolved`);
    }
  }

  return {
    passed: coverage === 1 && gaps.length === milestonePhases.filter(p => p.status !== 'completed').length,
    gaps,
    coverage,
    completedPhases: completed.length,
    totalPhases: milestonePhases.length,
  };
}

/**
 * Add a phase to a project's roadmap.
 *
 * The new phase gets the next available phase number.
 */
export function addPhase(
  db: DatabaseConnection,
  projectId: string,
  description: string,
  milestoneName?: string,
): ExecutionState {
  const existing = listExecutions(db, projectId);
  const maxPhase = existing.reduce((max, e) => Math.max(max, e.phase_number), 0);

  return createExecution(db, {
    project_id: projectId,
    milestone: milestoneName ?? null,
    phase_number: maxPhase + 1,
    status: 'pending',
  });
}

/**
 * Insert a phase after a specific phase number.
 *
 * All subsequent phases are renumbered.
 */
export function insertPhase(
  db: DatabaseConnection,
  projectId: string,
  afterPhase: number,
  description: string,
  milestoneName?: string,
): ExecutionState {
  const existing = listExecutions(db, projectId);

  // Renumber phases after the insertion point (reverse order to avoid conflicts)
  const toRenumber = existing
    .filter(e => e.phase_number > afterPhase)
    .sort((a, b) => b.phase_number - a.phase_number);

  for (const exec of toRenumber) {
    updateExecution(db, exec.id, { phase_number: exec.phase_number + 1 });
  }

  return createExecution(db, {
    project_id: projectId,
    milestone: milestoneName ?? null,
    phase_number: afterPhase + 1,
    status: 'pending',
  });
}

/**
 * Remove a phase from the roadmap.
 *
 * Deletes the execution state and renumbers subsequent phases.
 */
export function removePhase(
  db: DatabaseConnection,
  projectId: string,
  phaseNumber: number,
): void {
  const existing = listExecutions(db, projectId);
  const target = existing.find(e => e.phase_number === phaseNumber);

  if (!target) {
    throw new Error(`Phase ${phaseNumber} not found for project ${projectId}`);
  }

  if (target.status !== 'pending') {
    throw new Error(`Cannot remove phase ${phaseNumber}: status is ${target.status}`);
  }

  deleteExecution(db, target.id);

  // Renumber subsequent phases
  const toRenumber = existing
    .filter(e => e.phase_number > phaseNumber)
    .sort((a, b) => a.phase_number - b.phase_number);

  for (const exec of toRenumber) {
    updateExecution(db, exec.id, { phase_number: exec.phase_number - 1 });
  }
}

/**
 * Get a milestone by name.
 */
export function getMilestone(
  db: DatabaseConnection,
  projectId: string,
  milestoneName: string,
): Milestone | null {
  const executions = listExecutions(db, projectId);
  const milestoneExec = executions.find(
    e => e.milestone === milestoneName && e.phase_number === 0,
  );

  if (!milestoneExec) return null;

  const phases = executions.filter(
    e => e.milestone === milestoneName && e.phase_number > 0,
  );

  return {
    id: milestoneExec.id,
    project_id: projectId,
    name: milestoneName,
    status: milestoneExec.status,
    phases,
    created_at: milestoneExec.created_at,
  };
}
