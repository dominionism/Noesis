/**
 * Verification Separation — Distinct proposer/verifier/judge roles.
 *
 * Enforces that important outputs go through external verification
 * before approval, rather than relying on model self-approval.
 *
 * Separates proposer, verifier, and judge responsibilities.
 *
 * Core principles:
 * - Use static analysis, tests, type checks, syntax checks, diff checks,
 *   and artifact validation as primary judges when possible.
 * - Reserve model-based judging for cases where executable validation
 *   is insufficient.
 * - Never let the same weak model both generate and approve critical
 *   outputs without external evidence.
 *
 * Research basis: "Let's Verify Step by Step" (Lightman et al., 2023),
 * "Small Language Models Need Strong Verifiers" (2024).
 */

// ===========================================================================
// Types
// ===========================================================================

export type VerificationMethod =
  | 'static_analysis'
  | 'test_execution'
  | 'type_check'
  | 'syntax_check'
  | 'diff_check'
  | 'artifact_validation'
  | 'model_judge';

export type TaskCriticality = 'low' | 'medium' | 'high' | 'critical';

export interface VerificationRequirement {
  method: VerificationMethod;
  required: boolean;
  description: string;
  command?: string;
  model_tier?: string;
}

export interface ProposalOutput {
  content: string;
  proposer_model: string;
  task_description: string;
  criticality: TaskCriticality;
  file_paths?: string[];
  language?: string;
}

export interface VerificationResult {
  method: VerificationMethod;
  passed: boolean;
  details: string;
  evidence?: string;
}

export interface JudgmentResult {
  approved: boolean;
  confidence: number;
  verifications_passed: number;
  verifications_total: number;
  verifications: VerificationResult[];
  requires_human_review: boolean;
  reasoning: string;
}

// ===========================================================================
// Constants
// ===========================================================================

/**
 * Substrings that identify a model as "weak" — meaning it needs
 * stronger external verification before its output can be trusted.
 */
const WEAK_MODEL_INDICATORS: readonly string[] = [
  'haiku',
  'mini',
  'flash',
  'small',
  'tier3',
] as const;

/**
 * Criticality ordering for numeric comparisons.
 */
const CRITICALITY_ORDER: Record<TaskCriticality, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Check if a proposer model is considered "weak" (needs stronger verification).
 *
 * Weak models: anything containing 'haiku', 'mini', 'flash', 'small',
 * or tier3 indicators. Matching is case-insensitive so that model name
 * variations (e.g., "Claude-Haiku", "gpt-4o-mini") are caught.
 */
export function isWeakProposer(modelName: string): boolean {
  const normalized = modelName.toLowerCase();
  return WEAK_MODEL_INDICATORS.some((indicator) => normalized.includes(indicator));
}

/**
 * Get the minimum verifier tier for a given proposer.
 *
 * Ensures the verifier is at least one tier above the proposer.
 * - Weak proposers (haiku/mini/flash/small/tier3) -> 'tier1'
 * - Medium-strength proposers (sonnet/tier2) -> 'tier2'
 * - Unknown or strong proposers -> 'tier1' (conservative default)
 */
export function getMinimumVerifierTier(proposerModel: string): string {
  const normalized = proposerModel.toLowerCase();

  if (isWeakProposer(normalized)) {
    return 'tier1';
  }

  // Medium-tier models: sonnet-class or explicitly tier2
  if (normalized.includes('sonnet') || normalized.includes('tier2')) {
    return 'tier2';
  }

  // Unknown models get conservative default — require strongest verifier
  return 'tier1';
}

/**
 * Determine which verification methods are required for a proposal.
 * Returns an ordered list of verification requirements.
 *
 * Tiered verification logic:
 * - All proposals (low+): syntax_check, diff_check
 * - Medium+: type_check, test_execution
 * - High+: static_analysis, artifact_validation
 * - Critical: model_judge (with a DIFFERENT model tier than the proposer)
 * - Weak proposer override: ALWAYS require model_judge at tier2+
 *   regardless of criticality
 */
export function determineVerificationRequirements(
  proposal: ProposalOutput,
): VerificationRequirement[] {
  const requirements: VerificationRequirement[] = [];
  const level = CRITICALITY_ORDER[proposal.criticality];
  const weakProposer = isWeakProposer(proposal.proposer_model);

  // -- All proposals: syntax_check and diff_check --------------------------

  requirements.push({
    method: 'syntax_check',
    required: true,
    description: 'Verify output is syntactically valid',
    command: buildSyntaxCommand(proposal.language),
  });

  requirements.push({
    method: 'diff_check',
    required: true,
    description: 'Verify changes are minimal and intentional',
  });

  // -- Medium+ (level >= 1): type_check, test_execution -------------------

  if (level >= CRITICALITY_ORDER.medium) {
    requirements.push({
      method: 'type_check',
      required: true,
      description: 'Verify type correctness of modified files',
      command: buildTypeCheckCommand(proposal.language),
    });

    requirements.push({
      method: 'test_execution',
      required: true,
      description: 'Run relevant test suites to detect regressions',
      command: buildTestCommand(proposal.language, proposal.file_paths),
    });
  }

  // -- High+ (level >= 2): static_analysis, artifact_validation -----------

  if (level >= CRITICALITY_ORDER.high) {
    requirements.push({
      method: 'static_analysis',
      required: true,
      description: 'Run static analysis to detect code quality and security issues',
      command: buildStaticAnalysisCommand(proposal.language),
    });

    requirements.push({
      method: 'artifact_validation',
      required: true,
      description: 'Validate output artifacts are well-formed and complete',
    });
  }

  // -- Critical (level >= 3): model_judge ---------------------------------

  if (level >= CRITICALITY_ORDER.critical) {
    const verifierTier = getMinimumVerifierTier(proposal.proposer_model);
    requirements.push({
      method: 'model_judge',
      required: true,
      description: 'Independent model review by a different, stronger model tier',
      model_tier: verifierTier,
    });
  }

  // -- Weak proposer override: always require model_judge -----------------
  // This fires even for low-criticality tasks when the proposer is weak,
  // because weak models should never self-approve without external evidence.

  if (weakProposer && !requirements.some((r) => r.method === 'model_judge')) {
    const verifierTier = getMinimumVerifierTier(proposal.proposer_model);
    requirements.push({
      method: 'model_judge',
      required: true,
      description: 'Weak proposer detected — mandatory stronger model review',
      model_tier: verifierTier,
    });
  }

  return requirements;
}

/**
 * Evaluate whether a set of verification results constitutes approval.
 *
 * Judgment rules:
 * - ALL required verifications must pass for approval.
 * - If any required verification failed, approved=false.
 * - If >50% of optional verifications failed, requires_human_review=true.
 * - Confidence = passed_count / total_count.
 * - For critical tasks, even all-pass still sets requires_human_review=true
 *   (defense-in-depth: critical changes always get a human checkpoint).
 */
export function judge(
  proposal: ProposalOutput,
  verifications: VerificationResult[],
  requirements: VerificationRequirement[],
): JudgmentResult {
  const requiredMethods = new Set(
    requirements
      .filter((r) => r.required)
      .map((r) => r.method),
  );

  const optionalMethods = new Set(
    requirements
      .filter((r) => !r.required)
      .map((r) => r.method),
  );

  // Tally pass/fail for required verifications
  let requiredPassed = 0;
  let requiredFailed = 0;
  for (const v of verifications) {
    if (requiredMethods.has(v.method)) {
      if (v.passed) {
        requiredPassed++;
      } else {
        requiredFailed++;
      }
    }
  }

  // Tally pass/fail for optional verifications
  let optionalPassed = 0;
  let optionalFailed = 0;
  for (const v of verifications) {
    if (optionalMethods.has(v.method)) {
      if (v.passed) {
        optionalPassed++;
      } else {
        optionalFailed++;
      }
    }
  }

  const totalPassed = requiredPassed + optionalPassed;
  const totalCount = verifications.length;
  const confidence = totalCount > 0 ? totalPassed / totalCount : 0;

  const allRequiredPassed = requiredFailed === 0 && requiredPassed === requiredMethods.size;
  const approved = allRequiredPassed;

  // Determine if human review is needed
  let requiresHumanReview = false;
  const optionalTotal = optionalPassed + optionalFailed;
  if (optionalTotal > 0 && optionalFailed / optionalTotal > 0.5) {
    requiresHumanReview = true;
  }
  if (proposal.criticality === 'critical') {
    requiresHumanReview = true;
  }

  // Build reasoning
  const reasoning = buildReasoning(
    approved,
    requiredPassed,
    requiredMethods.size,
    requiredFailed,
    optionalPassed,
    optionalTotal,
    requiresHumanReview,
    proposal.criticality,
  );

  return {
    approved,
    confidence,
    verifications_passed: totalPassed,
    verifications_total: totalCount,
    verifications,
    requires_human_review: requiresHumanReview,
    reasoning,
  };
}

// ===========================================================================
// Internal helpers
// ===========================================================================

/**
 * Build a syntax check command appropriate for the language.
 */
function buildSyntaxCommand(language?: string): string | undefined {
  if (!language) return undefined;

  const normalized = language.toLowerCase();
  switch (normalized) {
    case 'typescript':
    case 'ts':
      return 'npx tsc --noEmit';
    case 'javascript':
    case 'js':
      return 'node --check';
    case 'python':
    case 'py':
      return 'python -m py_compile';
    case 'rust':
    case 'rs':
      return 'cargo check';
    case 'go':
      return 'go vet ./...';
    default:
      return undefined;
  }
}

/**
 * Build a type check command appropriate for the language.
 */
function buildTypeCheckCommand(language?: string): string | undefined {
  if (!language) return undefined;

  const normalized = language.toLowerCase();
  switch (normalized) {
    case 'typescript':
    case 'ts':
      return 'npx tsc --noEmit --strict';
    case 'python':
    case 'py':
      return 'mypy --strict';
    case 'rust':
    case 'rs':
      return 'cargo check';
    case 'go':
      return 'go vet ./...';
    default:
      return undefined;
  }
}

/**
 * Build a test execution command appropriate for the language.
 * When file_paths are provided, attempt to scope the test run
 * to related test files for faster feedback.
 */
function buildTestCommand(language?: string, filePaths?: string[]): string | undefined {
  if (!language) return undefined;

  const normalized = language.toLowerCase();
  const hasFilePaths = filePaths && filePaths.length > 0;

  switch (normalized) {
    case 'typescript':
    case 'ts':
    case 'javascript':
    case 'js':
      if (hasFilePaths) {
        // Scope to related test files for speed
        const related = filePaths
          .filter((p) => !p.includes('node_modules'))
          .map((p) => p.replace(/\.(ts|js|tsx|jsx)$/, ''))
          .join(' ');
        return `npx vitest run --reporter=verbose ${related}`;
      }
      return 'npx vitest run';
    case 'python':
    case 'py':
      return 'python -m pytest -v';
    case 'rust':
    case 'rs':
      return 'cargo test';
    case 'go':
      return 'go test ./...';
    default:
      return undefined;
  }
}

/**
 * Build a static analysis command appropriate for the language.
 */
function buildStaticAnalysisCommand(language?: string): string | undefined {
  if (!language) return undefined;

  const normalized = language.toLowerCase();
  switch (normalized) {
    case 'typescript':
    case 'ts':
    case 'javascript':
    case 'js':
      return 'npx eslint --no-error-on-unmatched-pattern';
    case 'python':
    case 'py':
      return 'ruff check';
    case 'rust':
    case 'rs':
      return 'cargo clippy -- -D warnings';
    case 'go':
      return 'staticcheck ./...';
    default:
      return undefined;
  }
}

/**
 * Build a human-readable reasoning string for the judgment.
 */
function buildReasoning(
  approved: boolean,
  requiredPassed: number,
  requiredTotal: number,
  requiredFailed: number,
  optionalPassed: number,
  optionalTotal: number,
  requiresHumanReview: boolean,
  criticality: TaskCriticality,
): string {
  const parts: string[] = [];

  if (approved) {
    parts.push(`Approved: all ${requiredTotal} required verifications passed.`);
  } else {
    parts.push(
      `Rejected: ${requiredFailed} of ${requiredTotal} required verification(s) failed.`,
    );
  }

  if (optionalTotal > 0) {
    parts.push(
      `Optional verifications: ${optionalPassed}/${optionalTotal} passed.`,
    );
  }

  if (requiresHumanReview && criticality === 'critical') {
    parts.push('Human review required: task criticality is critical.');
  } else if (requiresHumanReview) {
    parts.push('Human review required: majority of optional verifications failed.');
  }

  return parts.join(' ');
}
