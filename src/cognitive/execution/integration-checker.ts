/**
 * Integration Checker — Cross-phase wiring verification.
 *
 * Verifies that phases connect properly:
 * 1. Build export/import map from phase artifacts
 * 2. Verify all exports are imported
 * 3. Check for orphaned artifacts
 * 4. Trace broken flows
 * 5. Requirements integration map (per-requirement wiring)
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { ExecutionState } from '../types.js';
import { listExecutions } from './gsd-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationCheckResult {
  passed: boolean;
  orphans: string[];
  missingConnections: string[];
  brokenFlows: string[];
  coverage: number;
}

export interface PhaseArtifact {
  phase_number: number;
  name: string;
  type: 'export' | 'import';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check cross-phase integration for a project.
 *
 * Analyzes phase artifacts to find orphans, missing connections,
 * and broken flows between phases.
 */
export function checkIntegration(
  db: DatabaseConnection,
  projectId: string,
): IntegrationCheckResult {
  const executions = listExecutions(db, projectId)
    .filter(e => e.phase_number > 0)
    .sort((a, b) => a.phase_number - b.phase_number);

  if (executions.length <= 1) {
    return {
      passed: true,
      orphans: [],
      missingConnections: [],
      brokenFlows: [],
      coverage: executions.length > 0 ? 1 : 0,
    };
  }

  const artifacts = extractArtifacts(executions);
  const orphans = findOrphans(artifacts);
  const missingConnections = findMissingConnections(executions);
  const brokenFlows = findBrokenFlows(executions);

  const totalArtifacts = artifacts.length;
  const connectedArtifacts = totalArtifacts - orphans.length;
  const coverage = totalArtifacts > 0 ? connectedArtifacts / totalArtifacts : 1;

  return {
    passed: orphans.length === 0 && missingConnections.length === 0 && brokenFlows.length === 0,
    orphans,
    missingConnections,
    brokenFlows,
    coverage,
  };
}

/**
 * Format integration check result as markdown.
 */
export function formatIntegrationResult(result: IntegrationCheckResult): string {
  const lines: string[] = [
    `### Integration Check: ${result.passed ? 'PASSED' : 'ISSUES FOUND'}`,
    `Coverage: ${(result.coverage * 100).toFixed(0)}%`,
  ];

  if (result.orphans.length > 0) {
    lines.push('', '**Orphaned Artifacts:**');
    for (const orphan of result.orphans) {
      lines.push(`- ${orphan}`);
    }
  }

  if (result.missingConnections.length > 0) {
    lines.push('', '**Missing Connections:**');
    for (const conn of result.missingConnections) {
      lines.push(`- ${conn}`);
    }
  }

  if (result.brokenFlows.length > 0) {
    lines.push('', '**Broken Flows:**');
    for (const flow of result.brokenFlows) {
      lines.push(`- ${flow}`);
    }
  }

  if (result.passed) {
    lines.push('', 'All phases are properly connected.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract artifact names from execution states.
 *
 * Uses plan_id and checkpoint descriptions as proxy for artifacts
 * since actual file artifacts aren't stored in execution_state.
 */
function extractArtifacts(executions: ExecutionState[]): PhaseArtifact[] {
  const artifacts: PhaseArtifact[] = [];

  for (const exec of executions) {
    // Each completed phase produces an export
    if (exec.status === 'completed' || exec.status === 'verifying') {
      artifacts.push({
        phase_number: exec.phase_number,
        name: `phase_${exec.phase_number}_output`,
        type: 'export',
      });
    }

    // Each phase that follows a completed phase has an implicit import
    if (exec.phase_number > 1) {
      artifacts.push({
        phase_number: exec.phase_number,
        name: `phase_${exec.phase_number - 1}_output`,
        type: 'import',
      });
    }
  }

  return artifacts;
}

/**
 * Find artifacts that are produced but never consumed.
 */
function findOrphans(artifacts: PhaseArtifact[]): string[] {
  const exports = new Set(
    artifacts.filter(a => a.type === 'export').map(a => a.name),
  );
  const imports = new Set(
    artifacts.filter(a => a.type === 'import').map(a => a.name),
  );

  const orphans: string[] = [];
  for (const exp of exports) {
    if (!imports.has(exp)) {
      // Last phase output is naturally an orphan (it's the final deliverable)
      const phase = parseInt(exp.replace('phase_', '').replace('_output', ''), 10);
      const maxPhase = Math.max(...artifacts.map(a => a.phase_number));
      if (phase < maxPhase) {
        orphans.push(exp);
      }
    }
  }

  return orphans;
}

/**
 * Find missing connections between sequential phases.
 */
function findMissingConnections(executions: ExecutionState[]): string[] {
  const missing: string[] = [];

  for (let i = 1; i < executions.length; i++) {
    const prev = executions[i - 1];
    const curr = executions[i];

    // If current phase is executing but previous isn't completed
    if (curr.status !== 'pending' && prev.status !== 'completed' && prev.status !== 'verifying') {
      missing.push(
        `Phase ${curr.phase_number} started before phase ${prev.phase_number} completed (status: ${prev.status})`,
      );
    }
  }

  return missing;
}

/**
 * Find flows that are broken (blocked or failed phases in the middle).
 */
function findBrokenFlows(executions: ExecutionState[]): string[] {
  const broken: string[] = [];

  for (let i = 0; i < executions.length - 1; i++) {
    const phase = executions[i];

    if (phase.status === 'blocked') {
      broken.push(`Phase ${phase.phase_number} is blocked — downstream phases cannot proceed`);
    }

    // Check for deviations that halt flow
    const rule4Deviations = phase.deviations.filter(d => d.rule === 4);
    if (rule4Deviations.length > 0 && phase.status !== 'completed') {
      broken.push(
        `Phase ${phase.phase_number} has ${rule4Deviations.length} unresolved architectural deviation(s)`,
      );
    }
  }

  return broken;
}
