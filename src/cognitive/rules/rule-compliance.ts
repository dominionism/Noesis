/**
 * Rule Compliance — Evaluate task state against active rules.
 *
 * Given the current task context (what phase we're in, what gates have
 * been passed), evaluates each rule's constraints and returns per-rule
 * compliance results with violations and warnings.
 *
 * Hard-enforcement rules with blocking violations stop the workflow.
 * Soft-enforcement rules surface warnings. Advisory rules log only.
 */

import type {
  RuleDefinition,
  RuleComplianceResult,
  RuleViolation,
  ComplianceContext,
} from '../types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate each rule's constraints against the current task context.
 * Returns per-rule compliance results.
 */
export function checkCompliance(
  rules: RuleDefinition[],
  context: ComplianceContext,
): RuleComplianceResult[] {
  return rules.map(rule => evaluateRule(rule, context));
}

/**
 * Filter for hard-enforcement rules with blocking violations.
 * Returns whether the workflow should be blocked and which violations caused it.
 */
export function enforceHardRules(results: RuleComplianceResult[]): {
  blocked: boolean;
  blocking_violations: RuleViolation[];
} {
  const blockingViolations: RuleViolation[] = [];

  for (const result of results) {
    if (!result.compliant) {
      const blocking = result.violations.filter(v => v.severity === 'blocking');
      blockingViolations.push(...blocking);
    }
  }

  return {
    blocked: blockingViolations.length > 0,
    blocking_violations: blockingViolations,
  };
}

/**
 * Human-readable compliance report.
 */
export function formatComplianceReport(results: RuleComplianceResult[]): string {
  const lines: string[] = ['# Compliance Report', ''];

  for (const result of results) {
    const status = result.compliant ? 'PASS' : 'FAIL';
    lines.push(`## ${result.rule_name}: ${status}`);

    if (result.violations.length > 0) {
      lines.push('### Violations');
      for (const v of result.violations) {
        lines.push(`- [${v.severity.toUpperCase()}] ${v.description}`);
        lines.push(`  Fix: ${v.suggested_fix}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push('### Warnings');
      for (const w of result.warnings) {
        lines.push(`- ${w}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal rule evaluation
// ---------------------------------------------------------------------------

function evaluateRule(rule: RuleDefinition, context: ComplianceContext): RuleComplianceResult {
  const violations: RuleViolation[] = [];
  const warnings: string[] = [];

  for (const constraint of rule.constraints) {
    const result = evaluateConstraint(rule, constraint, context);
    if (result.violated) {
      if (rule.enforcement === 'hard' && constraint.severity === 'blocking') {
        violations.push({
          constraint: constraint.requirement,
          severity: 'blocking',
          description: result.reason,
          suggested_fix: result.fix,
        });
      } else if (constraint.severity === 'warning' || rule.enforcement === 'soft') {
        violations.push({
          constraint: constraint.requirement,
          severity: 'warning',
          description: result.reason,
          suggested_fix: result.fix,
        });
      } else {
        warnings.push(`${constraint.requirement}: ${result.reason}`);
      }
    }
  }

  return {
    rule_id: rule.id,
    rule_name: rule.name,
    compliant: violations.filter(v => v.severity === 'blocking').length === 0,
    violations,
    warnings,
  };
}

interface ConstraintEvaluation {
  violated: boolean;
  reason: string;
  fix: string;
}

function evaluateConstraint(
  rule: RuleDefinition,
  constraint: { requirement: string; severity: string; check_fn?: string },
  context: ComplianceContext,
): ConstraintEvaluation {
  // If a programmatic check function is specified, use the check map
  if (constraint.check_fn) {
    const checker = CONSTRAINT_CHECKS[constraint.check_fn];
    if (checker) {
      return checker(rule, context);
    }
  }

  // Pattern-based evaluation for common constraint types
  const req = constraint.requirement.toLowerCase();

  if (req.includes('readiness') && context.isSubstantial && !context.hasReadiness) {
    return {
      violated: true,
      reason: 'Substantial task requires readiness scoring before implementation',
      fix: 'Run readiness gate before proceeding',
    };
  }

  if (req.includes('research') && context.isSubstantial && !context.hasResearch) {
    return {
      violated: true,
      reason: 'Substantial task requires research phase',
      fix: 'Complete research before planning',
    };
  }

  if (req.includes('plan') && context.isSubstantial && !context.hasPlan) {
    return {
      violated: true,
      reason: 'Substantial task requires a plan before implementation',
      fix: 'Create an implementation plan',
    };
  }

  if (req.includes('verification') && !context.hasVerification) {
    return {
      violated: true,
      reason: 'Verification step is required',
      fix: 'Run verification commands before marking complete',
    };
  }

  if (req.includes('search') && !context.searchCompleted) {
    return {
      violated: true,
      reason: 'Search-first rule: must search existing patterns before creating new ones',
      fix: 'Search the codebase for existing patterns first',
    };
  }

  if (req.includes('decision') && !context.decisionsHonored) {
    return {
      violated: true,
      reason: 'Locked decisions are not being honored',
      fix: 'Review and respect all locked decisions',
    };
  }

  return { violated: false, reason: '', fix: '' };
}

// ---------------------------------------------------------------------------
// Named constraint check functions
// ---------------------------------------------------------------------------

type ConstraintCheckFn = (rule: RuleDefinition, context: ComplianceContext) => ConstraintEvaluation;

const CONSTRAINT_CHECKS: Record<string, ConstraintCheckFn> = {
  check_readiness_gate: (_rule, context) => {
    if (context.isSubstantial && !context.hasReadiness) {
      return {
        violated: true,
        reason: 'Readiness gate not passed for substantial task',
        fix: 'Score readiness before proceeding to implementation',
      };
    }
    return { violated: false, reason: '', fix: '' };
  },

  check_search_first: (_rule, context) => {
    if (!context.searchCompleted) {
      return {
        violated: true,
        reason: 'No search completed before creating new behavior',
        fix: 'Search the codebase for existing patterns',
      };
    }
    return { violated: false, reason: '', fix: '' };
  },

  check_creative_gate: (_rule, context) => {
    if (context.isCreative && !context.hasReadiness) {
      return {
        violated: true,
        reason: 'Creative output requires quality gate briefing',
        fix: 'Complete the creative brief (objective, audience, visual direction, references, banned patterns, success criteria)',
      };
    }
    return { violated: false, reason: '', fix: '' };
  },

  check_api_gate: (_rule, context) => {
    if (context.isApiWork && !context.hasReadiness) {
      return {
        violated: true,
        reason: 'API work requires quality gate briefing',
        fix: 'Complete the API brief (contract target, reference examples, edge cases, verification plan)',
      };
    }
    return { violated: false, reason: '', fix: '' };
  },

  check_decision_fidelity: (_rule, context) => {
    if (!context.decisionsHonored) {
      return {
        violated: true,
        reason: 'Locked decisions are being violated',
        fix: 'Review and respect all locked decisions before proceeding',
      };
    }
    return { violated: false, reason: '', fix: '' };
  },
};
