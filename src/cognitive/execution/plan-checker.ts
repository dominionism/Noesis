/**
 * Plan Checker — 8-dimension plan verification.
 *
 * Validates plans against:
 * 1. Requirement Coverage — every requirement has task(s)
 * 2. Task Completeness — files, action, verify, done present
 * 3. Dependency Correctness — no cycles, valid references
 * 4. Key Links Planned — artifacts wired, not isolated
 * 5. Scope Sanity — 2-3 tasks/plan good, 5+ blocker
 * 6. Verification Derivation — truths are user-observable
 * 7. Context Compliance — honors user decisions
 * 8. Memory Compliance — doesn't repeat known failure patterns
 */

import type { DatabaseConnection } from '../../core/database.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanIssueSeverity = 'blocker' | 'warning' | 'info';

export interface PlanIssue {
  dimension: string;
  severity: PlanIssueSeverity;
  description: string;
  suggestion: string;
}

export interface PlanCheckResult {
  passed: boolean;
  issues: PlanIssue[];
  score: number; // 0-100
}

export interface PlanForCheck {
  tasks: PlanTaskForCheck[];
  requirements?: string[];
  decisions?: string[];
  failurePatterns?: string[];
}

export interface PlanTaskForCheck {
  id: string;
  description: string;
  files?: string[];
  action?: string;
  verify?: string;
  done?: string;
  dependencies?: string[];
  artifacts?: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a plan against all 8 dimensions.
 *
 * Returns issues sorted by severity (blockers first).
 * Plan passes if there are zero blockers.
 */
export function checkPlan(plan: PlanForCheck): PlanCheckResult {
  const issues: PlanIssue[] = [
    ...checkRequirementCoverage(plan),
    ...checkTaskCompleteness(plan),
    ...checkDependencyCorrectness(plan),
    ...checkKeyLinks(plan),
    ...checkScopeSanity(plan),
    ...checkVerificationDerivation(plan),
    ...checkContextCompliance(plan),
    ...checkMemoryCompliance(plan),
  ];

  // Sort: blockers first, then warnings, then info
  const severityOrder: Record<PlanIssueSeverity, number> = { blocker: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const blockers = issues.filter(i => i.severity === 'blocker').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;

  // Score: start at 100, -15 per blocker, -5 per warning
  const score = Math.max(0, 100 - blockers * 15 - warnings * 5);

  return {
    passed: blockers === 0,
    issues,
    score,
  };
}

/**
 * Format plan check result as markdown.
 */
export function formatPlanCheckResult(result: PlanCheckResult): string {
  const lines: string[] = [
    `### Plan Check: ${result.passed ? 'PASSED' : 'BLOCKED'} (score: ${result.score}/100)`,
  ];

  if (result.issues.length === 0) {
    lines.push('No issues found.');
    return lines.join('\n');
  }

  for (const issue of result.issues) {
    const icon = issue.severity === 'blocker' ? '[BLOCKER]'
      : issue.severity === 'warning' ? '[WARNING]'
      : '[INFO]';
    lines.push(`- ${icon} **${issue.dimension}**: ${issue.description}`);
    if (issue.suggestion) {
      lines.push(`  - Fix: ${issue.suggestion}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Dimension checks
// ---------------------------------------------------------------------------

/** Dim 1: Every requirement has at least one task. */
function checkRequirementCoverage(plan: PlanForCheck): PlanIssue[] {
  if (!plan.requirements || plan.requirements.length === 0) return [];

  const issues: PlanIssue[] = [];
  const taskDescriptions = plan.tasks.map(t => t.description.toLowerCase());

  for (const req of plan.requirements) {
    const reqWords = req.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const covered = taskDescriptions.some(desc =>
      reqWords.filter(w => desc.includes(w)).length >= Math.min(2, reqWords.length),
    );

    if (!covered) {
      issues.push({
        dimension: 'requirement_coverage',
        severity: 'blocker',
        description: `Requirement not covered: "${req.slice(0, 80)}"`,
        suggestion: 'Add a task that addresses this requirement.',
      });
    }
  }

  return issues;
}

/** Dim 2: Tasks have files, action, verify, done fields. */
function checkTaskCompleteness(plan: PlanForCheck): PlanIssue[] {
  const issues: PlanIssue[] = [];

  for (const task of plan.tasks) {
    const missing: string[] = [];
    if (!task.files || task.files.length === 0) missing.push('files');
    if (!task.action) missing.push('action');
    if (!task.verify) missing.push('verify');
    if (!task.done) missing.push('done');

    if (missing.length > 0) {
      issues.push({
        dimension: 'task_completeness',
        severity: missing.includes('verify') ? 'warning' : 'info',
        description: `Task "${task.description.slice(0, 50)}" missing: ${missing.join(', ')}`,
        suggestion: 'Add missing fields to ensure task is actionable and verifiable.',
      });
    }
  }

  return issues;
}

/** Dim 3: No dependency cycles, all references valid. */
function checkDependencyCorrectness(plan: PlanForCheck): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const taskIds = new Set(plan.tasks.map(t => t.id));

  for (const task of plan.tasks) {
    if (!task.dependencies) continue;

    for (const dep of task.dependencies) {
      if (!taskIds.has(dep)) {
        issues.push({
          dimension: 'dependency_correctness',
          severity: 'blocker',
          description: `Task "${task.description.slice(0, 50)}" depends on non-existent task: ${dep}`,
          suggestion: 'Fix the dependency reference or add the missing task.',
        });
      }
    }
  }

  // Cycle detection via DFS
  const hasCycle = detectCycle(plan.tasks);
  if (hasCycle) {
    issues.push({
      dimension: 'dependency_correctness',
      severity: 'blocker',
      description: 'Dependency cycle detected in task graph.',
      suggestion: 'Break the circular dependency between tasks.',
    });
  }

  return issues;
}

/** Dim 4: Artifacts are wired (produced and consumed). */
function checkKeyLinks(plan: PlanForCheck): PlanIssue[] {
  const issues: PlanIssue[] = [];

  const produced = new Set<string>();
  const consumed = new Set<string>();

  for (const task of plan.tasks) {
    for (const artifact of task.artifacts ?? []) {
      produced.add(artifact);
    }
    for (const dep of task.dependencies ?? []) {
      consumed.add(dep);
    }
  }

  // Isolated artifacts (produced but never consumed)
  if (produced.size > 3) {
    const isolated = [...produced].filter(a => !consumed.has(a));
    if (isolated.length > produced.size * 0.5) {
      issues.push({
        dimension: 'key_links',
        severity: 'warning',
        description: `${isolated.length} of ${produced.size} artifacts are not consumed by any task.`,
        suggestion: 'Verify all artifacts are wired into the dependency graph.',
      });
    }
  }

  return issues;
}

/** Dim 5: Scope sanity — too many tasks is a smell. */
function checkScopeSanity(plan: PlanForCheck): PlanIssue[] {
  const issues: PlanIssue[] = [];

  if (plan.tasks.length === 0) {
    issues.push({
      dimension: 'scope_sanity',
      severity: 'blocker',
      description: 'Plan has no tasks.',
      suggestion: 'Add at least one task.',
    });
  } else if (plan.tasks.length > 5) {
    issues.push({
      dimension: 'scope_sanity',
      severity: 'warning',
      description: `Plan has ${plan.tasks.length} tasks. Plans with 5+ tasks are harder to manage.`,
      suggestion: 'Consider splitting into multiple plans or phases.',
    });
  }

  return issues;
}

/** Dim 6: Verification criteria are user-observable. */
function checkVerificationDerivation(plan: PlanForCheck): PlanIssue[] {
  const issues: PlanIssue[] = [];

  const tasksWithVerify = plan.tasks.filter(t => t.verify);
  if (plan.tasks.length > 0 && tasksWithVerify.length === 0) {
    issues.push({
      dimension: 'verification_derivation',
      severity: 'warning',
      description: 'No tasks have verification criteria.',
      suggestion: 'Add verify conditions to at least critical tasks.',
    });
  }

  return issues;
}

/** Dim 7: Plan honors user decisions. */
function checkContextCompliance(plan: PlanForCheck): PlanIssue[] {
  if (!plan.decisions || plan.decisions.length === 0) return [];

  const issues: PlanIssue[] = [];
  const allText = plan.tasks.map(t => t.description.toLowerCase()).join(' ');

  for (const decision of plan.decisions) {
    const keywords = decision.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const mentioned = keywords.some(k => allText.includes(k));

    if (!mentioned) {
      issues.push({
        dimension: 'context_compliance',
        severity: 'info',
        description: `Decision may not be reflected in plan: "${decision.slice(0, 60)}"`,
        suggestion: 'Verify this decision is honored by the task descriptions.',
      });
    }
  }

  return issues;
}

/** Dim 8: Plan doesn't repeat known failure patterns. */
function checkMemoryCompliance(plan: PlanForCheck): PlanIssue[] {
  if (!plan.failurePatterns || plan.failurePatterns.length === 0) return [];

  const issues: PlanIssue[] = [];
  const allText = plan.tasks.map(t => t.description.toLowerCase()).join(' ');

  for (const pattern of plan.failurePatterns) {
    const keywords = pattern.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matchCount = keywords.filter(k => allText.includes(k)).length;

    if (keywords.length > 0 && matchCount / keywords.length > 0.5) {
      issues.push({
        dimension: 'memory_compliance',
        severity: 'warning',
        description: `Plan may repeat known failure pattern: "${pattern.slice(0, 60)}"`,
        suggestion: 'Review this task against the failure pattern and add safeguards.',
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function detectCycle(tasks: PlanTaskForCheck[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const task of tasks) {
    adjacency.set(task.id, task.dependencies ?? []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (dfs(neighbor)) return true;
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const task of tasks) {
    if (dfs(task.id)) return true;
  }

  return false;
}
