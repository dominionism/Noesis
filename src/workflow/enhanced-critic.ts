/**
 * Enhanced Critic — 7-Dimension Evidence-Backed Critique System
 *
 * Provides research, plan, and output critique with evidence-backed findings
 * across 7 dimensions per critique type. Integrates with anti-patterns from
 * the memory store and capsule criteria to elevate severity when overlap is
 * detected.
 *
 * Evidence requirements:
 * - BLOCKING: only with concrete evidence (file:line, URL, test output)
 * - WARNING: when evidence is ambiguous but concern is real
 * - ADVISORY: suggestions for improvement
 *
 * Max 3 critique cycles. After 3rd cycle with remaining blockers,
 * humanJudgmentRequired is set to true.
 *
 * Does NOT modify the original critic.ts — this is a separate enhanced module.
 */

import type { AntiPatternDefinition, ScoredMemory, PromptShape } from '../types.js';
import type { AssembledCapsule } from '../cognitive/types.js';

// ===========================================================================
// Types
// ===========================================================================

export interface CriticFinding {
  dimension: string;
  severity: 'blocking' | 'warning' | 'advisory';
  finding: string;
  evidence: string;
  suggestion: string;
}

export interface EnhancedCriticInput {
  work: string;
  type: 'research' | 'plan';
  antiPatterns: AntiPatternDefinition[];
  memories: ScoredMemory[];
  projectId?: string;
}

export interface OutputCriticInput {
  output: string;
  promptShape: PromptShape;
  capsule: AssembledCapsule | null;
  antiPatterns: AntiPatternDefinition[];
  memories: ScoredMemory[];
}

export interface EnhancedCriticResult {
  overallAssessment: string;
  findings: CriticFinding[];
  severity: 'blocking' | 'warning' | 'advisory';
  revisionNeeded: boolean;
  iterationCount: number;
  humanJudgmentRequired: boolean;
}

// ===========================================================================
// Constants
// ===========================================================================

export const MAX_ITERATIONS = 3;

const HEDGING_WORDS = ['probably', 'should', 'might', 'maybe', 'perhaps', 'likely', 'possibly', 'assume', 'guess'];

const REQUIRED_PLAN_SECTIONS = [
  'goal',
  'scope',
  'approach',
  'phases',
  'risks',
  'verification',
  'deliverables',
];

// ===========================================================================
// Internal helpers
// ===========================================================================

/**
 * Elevate severity when a finding overlaps with a known anti-pattern.
 * advisory -> warning, warning -> blocking.
 */
function elevateSeverity(severity: CriticFinding['severity']): CriticFinding['severity'] {
  if (severity === 'advisory') return 'warning';
  if (severity === 'warning') return 'blocking';
  return 'blocking';
}

/**
 * Check if a finding overlaps with any anti-pattern by comparing text content.
 */
function overlapsWithAntiPattern(finding: CriticFinding, antiPatterns: AntiPatternDefinition[]): boolean {
  const findingLower = (finding.finding + ' ' + finding.evidence).toLowerCase();
  for (const ap of antiPatterns) {
    if (ap.status !== 'active' && ap.status !== 'draft') continue;
    const triggerWords = ap.trigger_pattern.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (triggerWords.length === 0) continue;
    const matchCount = triggerWords.filter((w) => findingLower.includes(w)).length;
    if (matchCount / triggerWords.length > 0.3) return true;
    const failureLower = ap.failure_mode.toLowerCase();
    if (findingLower.includes(failureLower.slice(0, 20))) return true;
  }
  return false;
}

/**
 * Compute overall severity from a set of findings.
 */
function computeOverallSeverity(findings: CriticFinding[]): CriticFinding['severity'] {
  if (findings.some((f) => f.severity === 'blocking')) return 'blocking';
  if (findings.some((f) => f.severity === 'warning')) return 'warning';
  return 'advisory';
}

/**
 * Apply anti-pattern severity elevation to findings.
 */
function applyAntiPatternElevation(
  findings: CriticFinding[],
  antiPatterns: AntiPatternDefinition[],
): CriticFinding[] {
  if (antiPatterns.length === 0) return findings;
  return findings.map((f) => {
    if (overlapsWithAntiPattern(f, antiPatterns)) {
      return { ...f, severity: elevateSeverity(f.severity) };
    }
    return f;
  });
}

// ===========================================================================
// Research critique dimensions
// ===========================================================================

function checkAssumptionVerification(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const workLower = work.toLowerCase();
  const matched: string[] = [];

  for (const word of HEDGING_WORDS) {
    if (workLower.includes(word)) {
      matched.push(word);
    }
  }

  if (matched.length > 0) {
    findings.push({
      dimension: 'assumption_verification',
      severity: matched.length >= 3 ? 'warning' : 'advisory',
      finding: `Found ${matched.length} hedging term(s): ${matched.join(', ')}`,
      evidence: `Hedged claims detected in work output`,
      suggestion: 'Replace hedged claims with verified facts or explicitly mark assumptions.',
    });
  }

  return findings;
}

function checkEvidenceLevelAudit(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const lines = work.split('\n');

  // Count claims (sentences that make assertions) vs references (lines with links, file paths, citations)
  const claimPattern = /\b(is|are|was|were|will|can|does|has|implements|provides|ensures|requires)\b/i;
  const referencePattern = /(?:https?:\/\/|file:|src\/|\.ts|\.js|\.py|\.go|\.rs|line \d+|@|ref:|see:|source:)/i;

  let claimCount = 0;
  let referenceCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 10) continue;
    if (claimPattern.test(trimmed)) claimCount++;
    if (referencePattern.test(trimmed)) referenceCount++;
  }

  if (claimCount > 5 && referenceCount === 0) {
    findings.push({
      dimension: 'evidence_level_audit',
      severity: 'warning',
      finding: `${claimCount} claims found with 0 references or evidence citations`,
      evidence: 'No file paths, URLs, or source citations detected',
      suggestion: 'Add concrete references (file paths, line numbers, URLs) for claims made.',
    });
  } else if (claimCount > 0 && referenceCount > 0 && referenceCount / claimCount < 0.3) {
    findings.push({
      dimension: 'evidence_level_audit',
      severity: 'advisory',
      finding: `Low evidence ratio: ${referenceCount} references for ${claimCount} claims`,
      evidence: `Reference-to-claim ratio: ${(referenceCount / claimCount).toFixed(2)}`,
      suggestion: 'Increase evidence backing for major claims.',
    });
  }

  return findings;
}

function checkCounterevidenceSearch(work: string, antiPatterns: AntiPatternDefinition[]): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const workLower = work.toLowerCase();

  for (const ap of antiPatterns) {
    if (ap.status !== 'active' && ap.status !== 'draft') continue;
    const triggerWords = ap.trigger_pattern.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (triggerWords.length === 0) continue;
    const matchCount = triggerWords.filter((w) => workLower.includes(w)).length;
    if (matchCount / triggerWords.length > 0.4) {
      findings.push({
        dimension: 'counterevidence_search',
        severity: 'warning',
        finding: `Research aligns with known pitfall: "${ap.name}"`,
        evidence: `Matched ${matchCount}/${triggerWords.length} trigger words for anti-pattern "${ap.name}"`,
        suggestion: `Review against known failure mode: ${ap.failure_mode}. Consider: ${ap.correct_approach}`,
      });
    }
  }

  return findings;
}

function checkCodebaseAccuracy(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];

  // Look for file:line claims like "src/foo.ts:42" or "file src/foo.ts line 42"
  const fileLinePattern = /(?:(\S+\.[a-z]{1,4}):(\d+))|(?:file\s+(\S+\.[a-z]{1,4})\s+line\s+(\d+))/gi;
  let match: RegExpExecArray | null;
  const fileClaims: Array<{ file: string; line: string }> = [];

  while ((match = fileLinePattern.exec(work)) !== null) {
    const file = match[1] || match[3];
    const line = match[2] || match[4];
    if (file && line) {
      fileClaims.push({ file, line });
    }
  }

  if (fileClaims.length > 0) {
    // We cannot verify file system here (pure function), but we flag them for verification
    findings.push({
      dimension: 'codebase_accuracy',
      severity: 'advisory',
      finding: `${fileClaims.length} file:line claim(s) found that need verification`,
      evidence: fileClaims.map((c) => `${c.file}:${c.line}`).join(', '),
      suggestion: 'Verify that referenced files exist at the claimed line numbers.',
    });
  }

  return findings;
}

function checkGapScan(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const workLower = work.toLowerCase();

  const gapCategories: Array<{ name: string; keywords: string[]; }> = [
    { name: 'security', keywords: ['auth', 'permission', 'access control', 'encryption', 'injection', 'xss', 'csrf', 'vulnerability'] },
    { name: 'performance', keywords: ['performance', 'latency', 'throughput', 'cache', 'optimization', 'bottleneck', 'n+1', 'batch'] },
    { name: 'compatibility', keywords: ['compatibility', 'backward', 'migration', 'breaking change', 'version', 'deprecated'] },
    { name: 'migration', keywords: ['migration', 'rollback', 'upgrade path', 'data migration', 'schema change'] },
  ];

  for (const category of gapCategories) {
    const mentioned = category.keywords.some((kw) => workLower.includes(kw));
    if (!mentioned) {
      findings.push({
        dimension: 'gap_scan',
        severity: 'advisory',
        finding: `No mention of ${category.name} considerations`,
        evidence: `None of the ${category.name}-related terms found in research output`,
        suggestion: `Consider ${category.name} implications and document findings.`,
      });
    }
  }

  return findings;
}

function checkImplementationImplications(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];

  // Check if research is specific enough for planners — look for actionable items
  const actionablePatterns = [
    /step \d+/i,
    /\d+\.\s+\w/,
    /must\s+\w/i,
    /should\s+implement/i,
    /create\s+a?\s*\w+/i,
    /modify\s+\w+/i,
    /update\s+\w+/i,
    /add\s+\w+/i,
  ];

  const actionableCount = actionablePatterns.filter((p) => p.test(work)).length;

  if (actionableCount < 2) {
    findings.push({
      dimension: 'implementation_implications',
      severity: 'warning',
      finding: 'Research lacks specific actionable implementation guidance',
      evidence: `Only ${actionableCount} actionable pattern(s) detected`,
      suggestion: 'Include specific steps, files to modify, and concrete implementation actions.',
    });
  }

  return findings;
}

function checkPreflightFailures(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];

  const failureModes: Array<{ mode: string; indicator: string }> = [
    { mode: 'Incomplete analysis', indicator: 'Research may miss important edge cases or constraints' },
    { mode: 'Outdated assumptions', indicator: 'Claims may be based on stale information' },
    { mode: 'Missing stakeholder context', indicator: 'Research may not account for all affected components' },
  ];

  // Only flag if the work itself doesn't address failure modes
  const workLower = work.toLowerCase();
  const addressesRisks = workLower.includes('risk') || workLower.includes('failure') || workLower.includes('caveat') || workLower.includes('limitation');

  if (!addressesRisks) {
    findings.push({
      dimension: 'preflight_failures',
      severity: 'advisory',
      finding: 'Top failure modes not addressed in research',
      evidence: failureModes.map((f) => f.mode).join('; '),
      suggestion: 'Document potential failure modes and their mitigations.',
    });
  }

  return findings;
}

// ===========================================================================
// Plan critique dimensions
// ===========================================================================

function checkCodebaseReality(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];

  // Check for file references in the plan
  const filePattern = /(?:src|lib|test|app|pkg|cmd)\/[\w\-./]+\.\w+/g;
  const referencedFiles = work.match(filePattern) || [];

  if (referencedFiles.length === 0) {
    findings.push({
      dimension: 'codebase_reality',
      severity: 'warning',
      finding: 'Plan references no specific codebase files',
      evidence: 'No file paths matching source code patterns found',
      suggestion: 'Reference specific files that will be created or modified.',
    });
  }

  return findings;
}

function checkDependencyAvailability(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];

  // Look for import/require statements or dependency mentions
  const depPatterns = [
    /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g,
    /(?:npm install|yarn add|pnpm add)\s+([\w@\-./]+)/g,
    /depends on\s+([\w\-./]+)/gi,
  ];

  const mentionedDeps: string[] = [];
  for (const pattern of depPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(work)) !== null) {
      if (match[1] && !match[1].startsWith('.') && !match[1].startsWith('/')) {
        mentionedDeps.push(match[1]);
      }
    }
  }

  if (mentionedDeps.length > 0) {
    findings.push({
      dimension: 'dependency_availability',
      severity: 'advisory',
      finding: `Plan references ${mentionedDeps.length} external dependency(ies) that should be verified`,
      evidence: mentionedDeps.join(', '),
      suggestion: 'Verify all external dependencies are in the project manifest and up to date.',
    });
  }

  return findings;
}

function checkEdgeCaseMining(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const workLower = work.toLowerCase();

  const edgeCaseCategories: Array<{ name: string; keywords: string[] }> = [
    { name: 'failure mid-phase', keywords: ['rollback', 'partial failure', 'abort', 'cleanup', 'recovery'] },
    { name: 'malformed input', keywords: ['validation', 'sanitize', 'malformed', 'invalid input', 'boundary'] },
    { name: 'concurrency', keywords: ['concurrent', 'race condition', 'lock', 'mutex', 'deadlock', 'atomic'] },
    { name: 'auth/permissions', keywords: ['auth', 'permission', 'unauthorized', 'forbidden', 'access denied'] },
  ];

  const missing: string[] = [];
  for (const category of edgeCaseCategories) {
    const addressed = category.keywords.some((kw) => workLower.includes(kw));
    if (!addressed) {
      missing.push(category.name);
    }
  }

  if (missing.length > 0) {
    findings.push({
      dimension: 'edge_case_mining',
      severity: missing.length >= 3 ? 'warning' : 'advisory',
      finding: `${missing.length} edge case category(ies) not addressed: ${missing.join(', ')}`,
      evidence: 'No relevant keywords found for these categories',
      suggestion: 'Consider edge cases for: ' + missing.join(', '),
    });
  }

  return findings;
}

function checkApproachValidity(work: string, antiPatterns: AntiPatternDefinition[]): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const workLower = work.toLowerCase();

  for (const ap of antiPatterns) {
    if (ap.status !== 'active' && ap.status !== 'draft') continue;
    const triggerWords = ap.trigger_pattern.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (triggerWords.length === 0) continue;
    const matchCount = triggerWords.filter((w) => workLower.includes(w)).length;
    if (matchCount / triggerWords.length > 0.4) {
      findings.push({
        dimension: 'approach_validity',
        severity: 'warning',
        finding: `Plan approach matches known pitfall: "${ap.name}"`,
        evidence: `Matched ${matchCount}/${triggerWords.length} trigger words`,
        suggestion: `Known failure mode: ${ap.failure_mode}. Use instead: ${ap.correct_approach}`,
      });
    }
  }

  return findings;
}

function checkPreMortem(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];

  const potentialFailures = [
    'Underestimated scope leads to incomplete implementation',
    'Missing dependency causes build failure',
    'Integration points break due to API mismatch',
    'Tests pass locally but fail in CI due to environment differences',
    'Migration step corrupts existing data',
  ];

  const workLower = work.toLowerCase();
  const addressedFailures = potentialFailures.filter((f) => {
    const keywords = f.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    return keywords.some((kw) => workLower.includes(kw));
  });

  const unaddressed = potentialFailures.length - addressedFailures.length;
  if (unaddressed >= 3) {
    findings.push({
      dimension: 'pre_mortem',
      severity: 'advisory',
      finding: `${unaddressed} of 5 common implementation failures not addressed`,
      evidence: potentialFailures.filter((f) => !addressedFailures.includes(f)).join('; '),
      suggestion: 'Conduct a pre-mortem: how could this plan fail? Document mitigations.',
    });
  }

  return findings;
}

function checkScopeRealism(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];

  // Count unique file references
  const filePattern = /(?:src|lib|test|app|pkg|cmd)\/[\w\-./]+\.\w+/g;
  const matches = work.match(filePattern) || [];
  const uniqueFiles = new Set(matches);

  const fileList = [...uniqueFiles].slice(0, 5).join(', ');
  const fileSummary = uniqueFiles.size > 5
    ? `${fileList} and ${uniqueFiles.size - 5} more`
    : fileList;

  if (uniqueFiles.size > 20) {
    findings.push({
      dimension: 'scope_realism',
      severity: 'blocking',
      finding: `Plan touches ${uniqueFiles.size} files — likely too large for a single task`,
      evidence: `${uniqueFiles.size} unique file paths detected: ${fileSummary}`,
      suggestion: 'Break this plan into smaller phases, each touching fewer than 20 files.',
    });
  } else if (uniqueFiles.size > 10) {
    findings.push({
      dimension: 'scope_realism',
      severity: 'warning',
      finding: `Plan touches ${uniqueFiles.size} files — consider splitting`,
      evidence: `${uniqueFiles.size} unique file paths detected: ${fileSummary}`,
      suggestion: 'Consider breaking this into smaller, incremental changes.',
    });
  }

  return findings;
}

function checkRequiredSections(work: string): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const workLower = work.toLowerCase();

  const missing: string[] = [];
  for (const section of REQUIRED_PLAN_SECTIONS) {
    if (!workLower.includes(section)) {
      missing.push(section);
    }
  }

  if (missing.length > 0) {
    findings.push({
      dimension: 'required_sections',
      severity: missing.length >= 3 ? 'warning' : 'advisory',
      finding: `Missing ${missing.length} required plan section(s): ${missing.join(', ')}`,
      evidence: 'Section headers or keywords not found in plan',
      suggestion: 'Ensure the plan includes all required sections: ' + REQUIRED_PLAN_SECTIONS.join(', '),
    });
  }

  return findings;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Critique research output across 7 dimensions with evidence-backed findings.
 *
 * Dimensions:
 * 1. assumption_verification — hedged claims detection
 * 2. evidence_level_audit — claims vs references ratio
 * 3. counterevidence_search — anti-pattern overlap
 * 4. codebase_accuracy — file:line claim verification
 * 5. gap_scan — security, performance, compatibility, migration gaps
 * 6. implementation_implications — actionable guidance check
 * 7. preflight_failures — top failure modes
 */
export function critiqueResearch(input: EnhancedCriticInput): EnhancedCriticResult {
  let findings: CriticFinding[] = [
    ...checkAssumptionVerification(input.work),
    ...checkEvidenceLevelAudit(input.work),
    ...checkCounterevidenceSearch(input.work, input.antiPatterns),
    ...checkCodebaseAccuracy(input.work),
    ...checkGapScan(input.work),
    ...checkImplementationImplications(input.work),
    ...checkPreflightFailures(input.work),
  ];

  // Apply anti-pattern severity elevation
  findings = applyAntiPatternElevation(findings, input.antiPatterns);

  // Enforce evidence requirements for BLOCKING severity
  findings = enforceBlockingEvidence(findings);

  const severity = computeOverallSeverity(findings);
  const revisionNeeded = severity === 'blocking' || severity === 'warning';

  return {
    overallAssessment: buildAssessment('research', findings, severity),
    findings,
    severity,
    revisionNeeded,
    iterationCount: 1,
    humanJudgmentRequired: false,
  };
}

/**
 * Critique plan output across 7 dimensions with evidence-backed findings.
 *
 * Dimensions:
 * 1. codebase_reality — file references exist
 * 2. dependency_availability — external deps verifiable
 * 3. edge_case_mining — failure/input/concurrency/auth edge cases
 * 4. approach_validity — anti-pattern overlap
 * 5. pre_mortem — top implementation failures
 * 6. scope_realism — file count warnings/blocks
 * 7. required_sections — plan completeness
 */
export function critiquePlan(input: EnhancedCriticInput): EnhancedCriticResult {
  let findings: CriticFinding[] = [
    ...checkCodebaseReality(input.work),
    ...checkDependencyAvailability(input.work),
    ...checkEdgeCaseMining(input.work),
    ...checkApproachValidity(input.work, input.antiPatterns),
    ...checkPreMortem(input.work),
    ...checkScopeRealism(input.work),
    ...checkRequiredSections(input.work),
  ];

  // Apply anti-pattern severity elevation
  findings = applyAntiPatternElevation(findings, input.antiPatterns);

  // Enforce evidence requirements for BLOCKING severity
  findings = enforceBlockingEvidence(findings);

  const severity = computeOverallSeverity(findings);
  const revisionNeeded = severity === 'blocking' || severity === 'warning';

  return {
    overallAssessment: buildAssessment('plan', findings, severity),
    findings,
    severity,
    revisionNeeded,
    iterationCount: 1,
    humanJudgmentRequired: false,
  };
}

/**
 * Critique output against prompt shape, capsule criteria, anti-patterns,
 * and memory-backed patterns across 7 dimensions.
 *
 * Dimensions:
 * 1. constraint_compliance — does output address all prompt shape constraints?
 * 2. deliverable_match — does output match expected deliverable format?
 * 3. capsule_criteria — capsule grader criteria check (if capsule present)
 * 4. capsule_anti_patterns — capsule-specific anti-pattern matching
 * 5. memory_consistency — consistency with past learnings from memories
 * 6. quality_scoring — overall quality markers (structure, depth, specificity)
 * 7. anti_pattern_match — global anti-pattern matching
 */
export function evaluateOutput(input: OutputCriticInput): EnhancedCriticResult {
  let findings: CriticFinding[] = [
    ...checkConstraintCompliance(input.output, input.promptShape),
    ...checkDeliverableMatch(input.output, input.promptShape),
    ...checkCapsuleCriteria(input.output, input.capsule),
    ...checkCapsuleAntiPatterns(input.output, input.capsule),
    ...checkMemoryConsistency(input.output, input.memories),
    ...checkQualityScoring(input.output, input.promptShape),
    ...checkCounterevidenceSearch(input.output, input.antiPatterns),
  ];

  // Apply anti-pattern severity elevation
  findings = applyAntiPatternElevation(findings, input.antiPatterns);

  // Enforce evidence requirements for BLOCKING severity
  findings = enforceBlockingEvidence(findings);

  const severity = computeOverallSeverity(findings);
  const revisionNeeded = severity === 'blocking' || severity === 'warning';

  return {
    overallAssessment: buildAssessment('output', findings, severity),
    findings,
    severity,
    revisionNeeded,
    iterationCount: 1,
    humanJudgmentRequired: false,
  };
}

/**
 * Iterate a critique cycle on revised work.
 *
 * Max 3 iterations. After 3rd iteration with blocking issues,
 * humanJudgmentRequired is set to true.
 */
export function iterateCritique(
  input: EnhancedCriticInput | OutputCriticInput,
  previousResult: EnhancedCriticResult,
  maxIterations: number = MAX_ITERATIONS,
): EnhancedCriticResult {
  const nextIteration = previousResult.iterationCount + 1;

  if (nextIteration > maxIterations) {
    return {
      ...previousResult,
      iterationCount: nextIteration,
      humanJudgmentRequired: previousResult.severity === 'blocking',
    };
  }

  let result: EnhancedCriticResult;

  if ('output' in input) {
    result = evaluateOutput(input);
  } else {
    const critiqueFunction = input.type === 'research' ? critiqueResearch : critiquePlan;
    result = critiqueFunction(input);
  }

  const finalResult: EnhancedCriticResult = {
    ...result,
    iterationCount: nextIteration,
    humanJudgmentRequired: false,
  };

  // If we've reached max iterations and still have blocking issues, require human judgment
  if (nextIteration >= maxIterations && finalResult.severity === 'blocking') {
    finalResult.humanJudgmentRequired = true;
  }

  return finalResult;
}

// ===========================================================================
// Output critique dimensions
// ===========================================================================

function checkConstraintCompliance(output: string, shape: PromptShape): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const outputLower = output.toLowerCase();

  const unmet: string[] = [];
  for (const constraint of shape.constraints) {
    const constraintWords = constraint.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (constraintWords.length === 0) continue;
    const matchCount = constraintWords.filter(w => outputLower.includes(w)).length;
    if (matchCount / constraintWords.length < 0.3) {
      unmet.push(constraint);
    }
  }

  if (unmet.length > 0) {
    const severity: CriticFinding['severity'] = unmet.length >= shape.constraints.length / 2
      ? 'warning'
      : 'advisory';

    findings.push({
      dimension: 'constraint_compliance',
      severity,
      finding: `${unmet.length} of ${shape.constraints.length} constraint(s) appear unaddressed`,
      evidence: `Unmet: ${unmet.join('; ')}`,
      suggestion: 'Review and address all prompt constraints in the output.',
    });
  }

  return findings;
}

function checkDeliverableMatch(output: string, shape: PromptShape): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const outputLower = output.toLowerCase();
  const deliverableLower = shape.deliverable.toLowerCase();

  const deliverableWords = deliverableLower.split(/\s+/).filter(w => w.length > 3);
  if (deliverableWords.length === 0) return findings;

  const matchCount = deliverableWords.filter(w => outputLower.includes(w)).length;
  const matchRatio = matchCount / deliverableWords.length;

  if (matchRatio < 0.2) {
    findings.push({
      dimension: 'deliverable_match',
      severity: 'warning',
      finding: 'Output does not appear to match the expected deliverable format',
      evidence: `Expected: "${shape.deliverable}". Match ratio: ${(matchRatio * 100).toFixed(0)}%`,
      suggestion: 'Ensure the output matches the expected deliverable specification.',
    });
  }

  return findings;
}

function checkCapsuleCriteria(output: string, capsule: AssembledCapsule | null): CriticFinding[] {
  if (!capsule) return [];
  const findings: CriticFinding[] = [];
  const outputLower = output.toLowerCase();

  // Check grader criteria
  const graderContent = capsule.components.grader;
  if (graderContent) {
    const criteria = graderContent.split('\n').filter(l => l.trim().length > 10);
    const unmet: string[] = [];

    for (const criterion of criteria) {
      const words = criterion.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (words.length === 0) continue;
      const matchCount = words.filter(w => outputLower.includes(w)).length;
      if (matchCount / words.length < 0.3) {
        unmet.push(criterion.trim());
      }
    }

    if (unmet.length > 0) {
      findings.push({
        dimension: 'capsule_criteria',
        severity: unmet.length >= criteria.length / 2 ? 'warning' : 'advisory',
        finding: `${unmet.length} capsule grader criterion/criteria not met`,
        evidence: `Capsule: ${capsule.definition.display_name}. Unmet: ${unmet.slice(0, 3).join('; ')}`,
        suggestion: `Review grader criteria for "${capsule.definition.display_name}" capsule.`,
      });
    }
  }

  // Check critic component
  const criticContent = capsule.components.critic;
  if (criticContent) {
    const criticPoints = criticContent.split('\n').filter(l => l.trim().length > 10);
    for (const point of criticPoints) {
      const words = point.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (words.length === 0) continue;
      const matchCount = words.filter(w => outputLower.includes(w)).length;
      if (matchCount / words.length > 0.5) {
        findings.push({
          dimension: 'capsule_criteria',
          severity: 'advisory',
          finding: `Capsule critic point may apply: "${point.trim().slice(0, 80)}"`,
          evidence: `Matched ${matchCount}/${words.length} keywords from capsule critic component`,
          suggestion: 'Review this capsule critic finding and address if applicable.',
        });
      }
    }
  }

  return findings;
}

function checkCapsuleAntiPatterns(output: string, capsule: AssembledCapsule | null): CriticFinding[] {
  if (!capsule) return [];
  const findings: CriticFinding[] = [];
  const outputLower = output.toLowerCase();

  // Check synthesized anti-patterns from capsule enrichments
  for (const pattern of capsule.enrichments.synthesized_anti_patterns) {
    const words = pattern.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) continue;
    const matchCount = words.filter(w => outputLower.includes(w)).length;
    if (matchCount / words.length > 0.4) {
      findings.push({
        dimension: 'capsule_anti_patterns',
        severity: 'warning',
        finding: `Output matches capsule anti-pattern: "${pattern.slice(0, 80)}"`,
        evidence: `Matched ${matchCount}/${words.length} keywords`,
        suggestion: 'Review output against this known anti-pattern.',
      });
    }
  }

  // Check past critic findings from capsule enrichments
  for (const pastFinding of capsule.enrichments.past_critic_findings) {
    const words = pastFinding.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) continue;
    const matchCount = words.filter(w => outputLower.includes(w)).length;
    if (matchCount / words.length > 0.5) {
      findings.push({
        dimension: 'capsule_anti_patterns',
        severity: 'advisory',
        finding: `Repeating past critic finding: "${pastFinding.slice(0, 80)}"`,
        evidence: `Past finding re-detected with ${matchCount}/${words.length} keyword match`,
        suggestion: 'This issue was flagged in previous iterations. Ensure it is resolved.',
      });
    }
  }

  return findings;
}

function checkMemoryConsistency(output: string, memories: ScoredMemory[]): CriticFinding[] {
  if (memories.length === 0) return [];
  const findings: CriticFinding[] = [];
  const outputLower = output.toLowerCase();

  // Check for contradictions with high-confidence lesson memories
  const lessonMemories = memories.filter(m =>
    m.type === 'lesson' && m.confidence >= 0.7,
  );

  for (const mem of lessonMemories) {
    const memWords = mem.content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (memWords.length === 0) continue;
    const matchCount = memWords.filter(w => outputLower.includes(w)).length;

    // High overlap with a lesson memory — check for contradiction indicators
    if (matchCount / memWords.length > 0.3) {
      const hasNegation = /\b(don't|do not|avoid|never|stop|remove)\b/i.test(mem.content);
      if (hasNegation) {
        // Lesson says "don't X" — check if output does X
        const lessonWords = mem.content.replace(/\b(don't|do not|avoid|never|stop|remove)\b/gi, '').toLowerCase()
          .split(/\s+/).filter(w => w.length > 3);
        const violationCount = lessonWords.filter(w => outputLower.includes(w)).length;
        if (lessonWords.length > 0 && violationCount / lessonWords.length > 0.4) {
          findings.push({
            dimension: 'memory_consistency',
            severity: 'warning',
            finding: `Output may contradict learned lesson: "${mem.title}"`,
            evidence: `Lesson: "${mem.content.slice(0, 100)}". Match: ${violationCount}/${lessonWords.length} keywords`,
            suggestion: 'Review output against this past learning to avoid repeating known mistakes.',
          });
        }
      }
    }
  }

  // Check for incidents that should inform current work
  const incidentMemories = memories.filter(m =>
    m.type === 'incident' && m.confidence >= 0.6,
  );

  if (incidentMemories.length > 0) {
    const relevantIncidents = incidentMemories.filter(mem => {
      const memWords = mem.content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (memWords.length === 0) return false;
      const matchCount = memWords.filter(w => outputLower.includes(w)).length;
      return matchCount / memWords.length > 0.3;
    });

    if (relevantIncidents.length > 0) {
      findings.push({
        dimension: 'memory_consistency',
        severity: 'advisory',
        finding: `${relevantIncidents.length} past incident(s) may be relevant to this output`,
        evidence: relevantIncidents.map(m => m.title).join('; '),
        suggestion: 'Review past incidents to ensure this output accounts for known failure modes.',
      });
    }
  }

  return findings;
}

function checkQualityScoring(output: string, shape: PromptShape): CriticFinding[] {
  const findings: CriticFinding[] = [];

  // Structure check: does the output have sections/organization?
  const lines = output.split('\n');
  const hasHeadings = lines.some(l => /^#{1,3}\s/.test(l));
  const hasBullets = lines.some(l => /^\s*[-*]\s/.test(l));
  const hasNumbered = lines.some(l => /^\s*\d+[.)]\s/.test(l));
  const hasStructure = hasHeadings || hasBullets || hasNumbered;

  if (!hasStructure && output.length > 500) {
    findings.push({
      dimension: 'quality_scoring',
      severity: 'advisory',
      finding: 'Output lacks structural organization (no headings, lists, or numbered steps)',
      evidence: `${output.length} characters of unstructured text`,
      suggestion: 'Add headings, bullet points, or numbered steps for clarity.',
    });
  }

  // Depth check: is the output sufficiently detailed for the goal?
  const goalWords = shape.goal.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (goalWords.length > 5 && output.length < 200) {
    findings.push({
      dimension: 'quality_scoring',
      severity: 'warning',
      finding: 'Output appears too brief for the complexity of the stated goal',
      evidence: `Goal has ${goalWords.length} significant terms but output is only ${output.length} characters`,
      suggestion: 'Expand the output to adequately address all aspects of the goal.',
    });
  }

  // Validation check: does the output address validation criteria from prompt shape?
  if (shape.validation.length > 0) {
    const outputLower = output.toLowerCase();
    const unaddressed = shape.validation.filter(v => {
      const words = v.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (words.length === 0) return false;
      const matchCount = words.filter(w => outputLower.includes(w)).length;
      return matchCount / words.length < 0.3;
    });

    if (unaddressed.length > 0) {
      findings.push({
        dimension: 'quality_scoring',
        severity: 'advisory',
        finding: `${unaddressed.length} validation criterion/criteria appear unaddressed`,
        evidence: `Unaddressed: ${unaddressed.join('; ')}`,
        suggestion: 'Ensure the output satisfies all validation criteria from the prompt shape.',
      });
    }
  }

  return findings;
}

// ===========================================================================
// Evidence validation for BLOCKING severity
// ===========================================================================

/** Concrete evidence patterns: file paths (with or without line), URLs, test output markers. */
const CONCRETE_EVIDENCE_PATTERN = /(?:(?:src|lib|test|app|pkg|cmd)\/\S+\.\w+|https?:\/\/\S+|FAIL|ERROR|AssertionError|expected .+ to|test output|stderr)/i;

/**
 * Downgrade BLOCKING findings to WARNING if they lack concrete evidence.
 * BLOCKING severity requires evidence containing file:line references,
 * URLs, or test output markers.
 */
function enforceBlockingEvidence(findings: CriticFinding[]): CriticFinding[] {
  return findings.map(f => {
    if (f.severity !== 'blocking') return f;
    if (CONCRETE_EVIDENCE_PATTERN.test(f.evidence)) return f;
    return { ...f, severity: 'warning' as const };
  });
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function buildAssessment(type: string, findings: CriticFinding[], severity: CriticFinding['severity']): string {
  const blockingCount = findings.filter((f) => f.severity === 'blocking').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const advisoryCount = findings.filter((f) => f.severity === 'advisory').length;

  const parts: string[] = [
    `${type.charAt(0).toUpperCase() + type.slice(1)} critique: ${severity}.`,
  ];

  if (blockingCount > 0) parts.push(`${blockingCount} blocking issue(s).`);
  if (warningCount > 0) parts.push(`${warningCount} warning(s).`);
  if (advisoryCount > 0) parts.push(`${advisoryCount} advisory note(s).`);
  parts.push(`${findings.length} total finding(s).`);

  return parts.join(' ');
}
