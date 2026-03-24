/**
 * Critic Cycle Evaluation
 *
 * @deprecated Use {@link src/workflow/enhanced-critic.ts} instead.
 * The enhanced critic provides 7-dimension adversarial critique with
 * BLOCKING/WARNING/ADVISORY severity levels, max 3 cycles, and
 * memory-enriched anti-pattern detection.
 *
 * Evaluates work output against known anti-patterns from the memory store
 * and task-class capsule criteria. Supports up to 2 revision cycles.
 *
 * The critic does NOT modify code — it provides structured feedback that
 * the implementing agent uses to revise its work.
 */

import type { CriticFeedback, CriticIssue, AntiPatternDefinition } from '../types.js';

/** Maximum number of critic revision cycles before forced acceptance. */
export const MAX_CRITIC_CYCLES = 2;

export interface CriticInput {
  /** The work output to evaluate */
  workOutput: string;
  /** The original task description */
  taskDescription: string;
  /** Known anti-patterns to check against */
  antiPatterns: AntiPatternDefinition[];
  /** Task-specific evaluation criteria from capsule */
  capsuleCriteria?: string[];
  /** Current cycle number (1-based) */
  cycle: number;
}

/**
 * Evaluate work output against anti-patterns and criteria.
 *
 * Returns structured feedback with issues, suggestions, and
 * anti-patterns matched. The implementing agent uses this to
 * decide whether and how to revise.
 */
export function evaluateWork(input: CriticInput): CriticFeedback {
  const issues: CriticIssue[] = [];
  const suggestions: string[] = [];
  const antiPatternsMatched: string[] = [];

  const workLower = input.workOutput.toLowerCase();

  // Check each anti-pattern against the work output
  for (const ap of input.antiPatterns) {
    if (ap.status !== 'active' && ap.status !== 'draft') continue;

    // Check trigger pattern match
    const triggerLower = ap.trigger_pattern.toLowerCase();
    const triggerWords = triggerLower.split(/\s+/).filter((w) => w.length > 3);
    const matchingWords = triggerWords.filter((w) => workLower.includes(w));

    // If more than 40% of significant trigger words match, flag it
    if (triggerWords.length > 0 && matchingWords.length / triggerWords.length > 0.4) {
      antiPatternsMatched.push(ap.name);
      issues.push({
        severity: ap.confidence >= 0.7 ? 'major' : 'minor',
        category: 'anti-pattern',
        description: `Matches anti-pattern "${ap.name}": ${ap.failure_mode}`,
      });
      suggestions.push(`Consider: ${ap.correct_approach}`);
    }
  }

  // Check capsule-specific criteria
  if (input.capsuleCriteria) {
    for (const criterion of input.capsuleCriteria) {
      const criterionLower = criterion.toLowerCase();
      // Simple presence check — if criterion mentions something that should be present
      if (criterionLower.includes('must include') || criterionLower.includes('required:')) {
        const required = criterion.replace(/^(must include|required:)\s*/i, '').trim();
        if (required && !workLower.includes(required.toLowerCase())) {
          issues.push({
            severity: 'major',
            category: 'missing-requirement',
            description: `Missing required element: ${required}`,
          });
        }
      }
    }
  }

  // Basic quality checks
  if (input.workOutput.length < 50 && input.taskDescription.length > 100) {
    issues.push({
      severity: 'major',
      category: 'insufficient-output',
      description: 'Work output appears too brief relative to task complexity.',
    });
    suggestions.push('Expand the implementation to address all aspects of the task.');
  }

  const hasCritical = issues.some((i) => i.severity === 'critical');
  const hasMajor = issues.some((i) => i.severity === 'major');
  const passed = !hasCritical && !hasMajor;

  return {
    cycle: input.cycle,
    passed,
    issues,
    suggestions,
    anti_patterns_matched: antiPatternsMatched,
  };
}

/**
 * Determine whether another critic cycle should be run.
 *
 * Returns true if the previous cycle found issues and we haven't
 * exceeded the maximum cycle count.
 */
export function shouldRunAnotherCycle(
  feedback: CriticFeedback,
  maxCycles: number = MAX_CRITIC_CYCLES,
): boolean {
  if (feedback.passed) return false;
  if (feedback.cycle >= maxCycles) return false;
  return true;
}
