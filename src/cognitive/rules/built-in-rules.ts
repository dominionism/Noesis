/**
 * Built-In Rules — 14 behavioral rules migrated from agent-workflow.
 *
 * Each rule includes:
 * - What: description of the rule
 * - Why: rationale (the "why" that agent-workflow lacked)
 * - When To Apply / When To Relax
 * - Interactions with other rules
 * - How To Apply: concrete enforcement mechanisms
 *
 * These are seeded into the database on first run via seedBuiltInRules().
 * Rules already present (by name) are skipped to preserve user modifications.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { RuleDefinitionInput, SignFn } from '../types.js';
import { getRuleByName, insertRule } from './rule-store.js';

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

const BUILT_IN_RULES: RuleDefinitionInput[] = [
  // -------------------------------------------------------------------------
  // 1. Workflow Router
  // -------------------------------------------------------------------------
  {
    name: 'workflow-router',
    category: 'workflow',
    description: 'Route substantial tasks through the full reasoning pipeline',
    enforcement: 'hard',
    trigger_conditions: [
      { condition: 'Task touches 3+ files', detection: 'automatic', keywords: ['refactor', 'feature', 'migration'] },
      { condition: 'Task spans multiple subsystems', detection: 'automatic', keywords: ['cross-cutting', 'integration'] },
      { condition: 'Vague or multi-step request', detection: 'automatic', keywords: ['implement', 'build', 'create', 'redesign'] },
      { condition: 'Shared behavior change', detection: 'manual', keywords: ['api', 'schema', 'contract'] },
    ],
    constraints: [
      { requirement: 'Must follow optimize → capsule → research → score → plan → implement → validate → learn', severity: 'blocking', check_fn: 'check_readiness_gate' },
      { requirement: 'Readiness score >= 70 before implementation', severity: 'blocking', check_fn: 'check_readiness_gate' },
      { requirement: 'Clarity dimension >= 15', severity: 'blocking' },
      { requirement: 'Codebase dimension >= 15', severity: 'blocking' },
    ],
    thresholds: { readiness_total: 70, clarity_min: 15, codebase_min: 15 },
    interactions: ['discovery-levels', 'prompt-optimization-routing', 'output-quality-gate'],
    content: `**What:** Forces substantial tasks through the complete reasoning pipeline rather than jumping to implementation.

**Why:** Without structured phases, agents skip research, ignore existing patterns, and produce solutions that conflict with the codebase. Every failed task that skipped planning is evidence that the pipeline prevents rework.

**When To Apply:** Any task that touches 3+ files, spans multiple subsystems, involves shared behavior, or is vague/multi-step.

**When To Relax:** Single-file edits, factual questions, narrow operational tasks, typo fixes.

**How To Apply:** Check task scope → if substantial, enforce phase sequence → block implementation until readiness passes.`,
  },

  // -------------------------------------------------------------------------
  // 2. Prompt Optimization Routing
  // -------------------------------------------------------------------------
  {
    name: 'prompt-optimization-routing',
    category: 'workflow',
    description: 'Extract structured GOAL/CONTEXT/CONSTRAINTS/DELIVERABLE/VALIDATION from vague requests',
    enforcement: 'soft',
    trigger_conditions: [
      { condition: 'Vague or ambiguous request', detection: 'automatic', keywords: ['implement', 'add', 'fix', 'update'] },
      { condition: 'Multi-step task', detection: 'automatic', keywords: ['and then', 'also', 'plus'] },
      { condition: 'Planning/workflow/handoff task', detection: 'automatic', keywords: ['plan', 'workflow', 'handoff'] },
    ],
    constraints: [
      { requirement: 'Extract GOAL, CONTEXT, CONSTRAINTS, DELIVERABLE, VALIDATION, CAPSULE', severity: 'warning' },
    ],
    thresholds: {},
    interactions: ['workflow-router'],
    content: `**What:** Transforms vague human requests into structured prompt shapes before the reasoning pipeline runs.

**Why:** Agents given unstructured prompts hallucinate requirements, miss constraints, and deliver work that doesn't match intent. Structured extraction forces alignment before effort is spent.

**When To Apply:** Any non-trivial request where the goal, constraints, or deliverable is not explicit.

**When To Relax:** Narrow operational tasks (rename variable, format file), factual questions, single-file edits where intent is obvious.

**How To Apply:** Parse request → extract 6 fields → present back for confirmation → proceed with structured prompt.`,
  },

  // -------------------------------------------------------------------------
  // 3. Expert Agent Routing
  // -------------------------------------------------------------------------
  {
    name: 'expert-agent-routing',
    category: 'routing',
    description: 'Route tasks to the narrowest qualified expert',
    enforcement: 'soft',
    trigger_conditions: [
      { condition: 'Task matches a specific domain', detection: 'automatic', keywords: ['security', 'design', 'architecture', 'testing', 'critique'] },
      { condition: 'Continuity/artifact/parity/routing/eval/grading task', detection: 'automatic', keywords: ['resume', 'handoff', 'evaluate', 'grade'] },
    ],
    constraints: [
      { requirement: 'Choose narrowest expert that covers the task', severity: 'warning' },
      { requirement: 'Prefer one expert; only add second if genuinely distinct domains', severity: 'info' },
      { requirement: 'Stay local when delegation adds latency without value', severity: 'info' },
    ],
    thresholds: {},
    interactions: ['workflow-router'],
    content: `**What:** Matches tasks to specialized expert agents based on domain, trigger conditions, and past performance.

**Why:** A generalist handling security review misses attack vectors a security expert would catch. Routing to the narrowest expert maximizes output quality for the specific task type.

**When To Apply:** Any task that falls clearly within a specific domain (security, UX, architecture, testing, etc.).

**When To Relax:** Simple tasks where expert overhead exceeds benefit. Single-line fixes. Conversational questions.

**How To Apply:** Embed task → match against expert triggers → rank by score → route to top match → track outcome.`,
  },

  // -------------------------------------------------------------------------
  // 4. Discovery Levels
  // -------------------------------------------------------------------------
  {
    name: 'discovery-levels',
    category: 'discovery',
    description: 'Calibrate research depth to prevent over/under-research',
    enforcement: 'advisory',
    trigger_conditions: [
      { condition: 'Before research or implementation planning', detection: 'automatic', keywords: ['research', 'investigate', 'explore'] },
    ],
    constraints: [
      { requirement: 'Level 0: Pattern extension — task follows known pattern, minimal research', severity: 'info' },
      { requirement: 'Level 1: Quick verification — approach known, details to confirm', severity: 'info' },
      { requirement: 'Level 2: Standard research — selecting between options, multiple subsystems', severity: 'info' },
      { requirement: 'Level 3: Architectural research — long-term decisions, full evaluation', severity: 'info' },
    ],
    thresholds: { level_0_max_files: 5, level_1_max_queries: 3, level_2_max_queries: 10, level_3_max_queries: 20 },
    interactions: ['workflow-router', 'search-first'],
    content: `**What:** Four-level scale that prevents both over-research (wasting tokens on known patterns) and under-research (missing critical context on novel tasks).

**Why:** Without calibration, agents either spend 80% of tokens researching trivial tasks or skip research entirely on complex ones. Discovery levels match effort to actual uncertainty.

**When To Apply:** Before any research or planning phase.

**When To Relax:** Never — this rule is always applicable, it just selects the appropriate depth.

**How To Apply:** Classify task uncertainty → select level → constrain research depth and artifact count accordingly.`,
  },

  // -------------------------------------------------------------------------
  // 5. Search First
  // -------------------------------------------------------------------------
  {
    name: 'search-first',
    category: 'discovery',
    description: 'Always search for existing patterns before creating new ones',
    enforcement: 'soft',
    trigger_conditions: [
      { condition: 'Before creating any new feature or behavior', detection: 'automatic', keywords: ['create', 'add', 'new', 'implement'] },
    ],
    constraints: [
      { requirement: 'Find current code paths before writing new ones', severity: 'warning', check_fn: 'check_search_first' },
      { requirement: 'Find related tests and documentation', severity: 'info' },
      { requirement: 'Prefer reuse over reimplementation', severity: 'warning' },
    ],
    thresholds: {},
    interactions: ['discovery-levels'],
    content: `**What:** Requires a search pass through the codebase before creating any new code, to find existing patterns, tests, and documentation.

**Why:** 40% of duplicate code in large projects comes from agents not looking before creating. Search-first prevents pattern divergence and reduces maintenance burden.

**When To Apply:** Before any feature implementation, component creation, or behavior addition.

**When To Relax:** Greenfield projects with no existing code. Tasks explicitly creating net-new functionality with no precedent.

**How To Apply:** Search codebase for related patterns → check for existing tests → check for docs → only then create new code.`,
  },

  // -------------------------------------------------------------------------
  // 6. Decision Fidelity
  // -------------------------------------------------------------------------
  {
    name: 'decision-fidelity',
    category: 'fidelity',
    description: 'Locked decisions are non-negotiable; deferred ideas stay deferred',
    enforcement: 'hard',
    trigger_conditions: [
      { condition: 'Implementation choices being made', detection: 'automatic', keywords: ['decide', 'choose', 'switch', 'replace', 'change'] },
      { condition: 'Reviewing past decisions', detection: 'manual' },
    ],
    constraints: [
      { requirement: 'Locked decisions cannot be overridden without explicit user approval', severity: 'blocking', check_fn: 'check_decision_fidelity' },
      { requirement: 'Deferred ideas must stay out of current scope', severity: 'warning' },
      { requirement: 'Discretion decisions must be documented with rationale', severity: 'info' },
    ],
    thresholds: {},
    interactions: ['workflow-router'],
    content: `**What:** Three-tier decision classification that prevents scope creep and silent overrides.

**Why:** Agents silently replacing locked decisions (e.g., switching ORMs mid-project) causes cascading failures. Deferred ideas leaking into scope causes scope creep. This rule prevents both.

**When To Apply:** Any time an implementation choice is being made or a past decision is being revisited.

**When To Relax:** Never for locked decisions. Deferred decisions can be revisited if the user explicitly requests it.

**How To Apply:** Check locked decisions context → block if conflict → check deferred list → warn if scope creep → document discretion choices.`,
  },

  // -------------------------------------------------------------------------
  // 7. Learning Loop
  // -------------------------------------------------------------------------
  {
    name: 'learning-loop',
    category: 'learning',
    description: 'Detect → diagnose → fix → writeback → surface on corrections',
    enforcement: 'hard',
    trigger_conditions: [
      { condition: 'User correction', detection: 'automatic', keywords: ['no', 'wrong', 'actually', 'instead', 'not that'] },
      { condition: 'Evaluation failure', detection: 'automatic', keywords: ['fail', 'error', 'broken'] },
      { condition: 'Critic rejection', detection: 'automatic', keywords: ['reject', 'redo'] },
      { condition: 'Repeated failure (same pattern 2+ times)', detection: 'automatic' },
    ],
    constraints: [
      { requirement: 'Must follow detect → diagnose → fix → writeback → surface pipeline', severity: 'blocking' },
      { requirement: 'Agents must NOT silently rewrite rules without evidence trail', severity: 'blocking' },
      { requirement: 'Writeback targets: rules, experts, capsules, skills, contexts', severity: 'warning' },
    ],
    thresholds: { min_evidence_for_rule_change: 3, min_confidence_for_writeback: 0.6 },
    interactions: ['learning-capture'],
    content: `**What:** Structured pipeline for turning corrections and failures into permanent system improvements.

**Why:** Without writeback, the system makes the same mistakes across sessions. The learning loop ensures that every correction improves future behavior, not just the current task.

**When To Apply:** Any time a correction, failure, or rejection occurs.

**When To Relax:** Never — learning is always on. The severity of the writeback scales with evidence strength.

**How To Apply:** Detect trigger → classify failure → identify root cause → propose writeback target → require evidence → apply with version tracking.`,
  },

  // -------------------------------------------------------------------------
  // 8. Learning Capture
  // -------------------------------------------------------------------------
  {
    name: 'learning-capture',
    category: 'learning',
    description: 'Capture decisions, lessons, and failure patterns as structured memories',
    enforcement: 'soft',
    trigger_conditions: [
      { condition: 'After validation completes', detection: 'automatic', keywords: ['validated', 'verified', 'complete'] },
      { condition: 'Architectural decision made', detection: 'automatic', keywords: ['decided', 'chose', 'architecture'] },
      { condition: 'Workflow improvement identified', detection: 'manual' },
      { condition: 'User correction processed', detection: 'automatic' },
    ],
    constraints: [
      { requirement: 'Capture: decision + why + rejected alternatives + source + failure_class + prevention_rule', severity: 'warning' },
      { requirement: 'Skip: temporary debugging, command transcripts, unverified hunches', severity: 'info' },
    ],
    thresholds: {},
    interactions: ['learning-loop'],
    content: `**What:** Structured capture of decisions, lessons, and failure patterns into the memory system.

**Why:** Unstructured notes decay into noise. Structured capture with decision + why + rejected alternatives + failure classification enables the retrieval system to surface the right lesson at the right time.

**When To Apply:** After validations, decisions, corrections, and workflow improvements.

**When To Relax:** Temporary debugging steps, raw command transcripts, speculative hunches without evidence.

**How To Apply:** Classify the learning → extract structured fields → store with proper type and tags → create knowledge graph edges.`,
  },

  // -------------------------------------------------------------------------
  // 9. Output Quality Gate
  // -------------------------------------------------------------------------
  {
    name: 'output-quality-gate',
    category: 'quality',
    description: 'Prevent generic creative/API work by requiring differentiation evidence',
    enforcement: 'hard',
    trigger_conditions: [
      { condition: 'Redesign, UX, or creative task', detection: 'automatic', keywords: ['redesign', 'design', 'creative', 'ui', 'ux', 'landing'] },
      { condition: 'API design or integration', detection: 'automatic', keywords: ['api', 'endpoint', 'integration', 'contract'] },
    ],
    constraints: [
      { requirement: 'Creative gate: objective + audience + visual_direction + references + banned_patterns + success_criteria', severity: 'blocking', check_fn: 'check_creative_gate' },
      { requirement: 'API gate: contract_target + reference_examples + edge_cases + verification_plan', severity: 'blocking', check_fn: 'check_api_gate' },
    ],
    thresholds: {},
    interactions: ['workflow-router'],
    content: `**What:** Two-gate system that blocks generic creative and API output by requiring specific differentiation inputs.

**Why:** Generic "modern landing page" output is indistinguishable from templates. Generic API designs miss edge cases. These gates force specificity before work begins, preventing rework.

**When To Apply:** Any creative/design task or API design/integration task.

**When To Relax:** Internal tooling with no design requirements. Simple CRUD endpoints following existing patterns.

**How To Apply:** Detect task type → select gate → check required fields → block until all fields provided → proceed with enriched context.`,
  },

  // -------------------------------------------------------------------------
  // 10. Session Continuity
  // -------------------------------------------------------------------------
  {
    name: 'session-continuity',
    category: 'continuity',
    description: 'Record stage, artifacts, blockers, and deferred items on pause/resume/transfer',
    enforcement: 'soft',
    trigger_conditions: [
      { condition: 'Pausing work', detection: 'automatic', keywords: ['pause', 'stop', 'break', 'later'] },
      { condition: 'Resuming work', detection: 'automatic', keywords: ['resume', 'continue', 'pick up'] },
      { condition: 'Transferring to another agent', detection: 'automatic', keywords: ['handoff', 'transfer', 'switch'] },
    ],
    constraints: [
      { requirement: 'Record current stage, artifacts, blockers, deferred items, next action', severity: 'warning' },
      { requirement: 'On resume: load checkpoint, verify artifacts still valid', severity: 'warning' },
    ],
    thresholds: {},
    interactions: ['artifact-retrieval'],
    content: `**What:** Structured checkpoint protocol for session boundaries (pause, resume, transfer).

**Why:** Without checkpoints, resuming work requires re-deriving the entire context. Transfer without structured handoff loses critical blockers and deferred items. This rule prevents context loss.

**When To Apply:** Any session boundary event.

**When To Relax:** Very short tasks (< 5 minutes) that complete in a single session.

**How To Apply:** On pause → capture checkpoint (stage + artifacts + blockers + deferred + next_action). On resume → load checkpoint → verify artifacts → continue from last state.`,
  },

  // -------------------------------------------------------------------------
  // 11. Artifact Retrieval
  // -------------------------------------------------------------------------
  {
    name: 'artifact-retrieval',
    category: 'continuity',
    description: 'Load the smallest set of artifacts needed for resumption',
    enforcement: 'advisory',
    trigger_conditions: [
      { condition: 'Resuming work or loading context', detection: 'automatic', keywords: ['resume', 'load', 'context'] },
    ],
    constraints: [
      { requirement: 'Find smallest set of artifacts that enables continuation', severity: 'info' },
      { requirement: 'Prefer explicitly referenced artifacts over broad loading', severity: 'info' },
      { requirement: 'Fall back to most recent if no explicit references', severity: 'info' },
    ],
    thresholds: {},
    interactions: ['session-continuity'],
    content: `**What:** Minimizes artifact loading to prevent context bloat on resume.

**Why:** Loading every artifact wastes context tokens and dilutes focus. The retrieval hierarchy (explicit references > working set > recent) ensures maximum signal-to-noise.

**When To Apply:** Any time artifacts are being loaded for resumption.

**When To Relax:** Never — this is always beneficial. It just selects the retrieval strategy.

**How To Apply:** Check checkpoint for explicit references → load those → if missing, load working set → if missing, load most recent relevant artifacts.`,
  },

  // -------------------------------------------------------------------------
  // 12. Verification Automation
  // -------------------------------------------------------------------------
  {
    name: 'verification-automation',
    category: 'quality',
    description: 'Derive verification commands from actual repo capabilities',
    enforcement: 'soft',
    trigger_conditions: [
      { condition: 'Before running verification commands', detection: 'automatic', keywords: ['test', 'verify', 'check', 'lint', 'build'] },
    ],
    constraints: [
      { requirement: 'Detect available verification commands from repo', severity: 'warning' },
      { requirement: 'Prefer aggregate commands over individual ones', severity: 'info' },
      { requirement: 'Order: type check → lint → unit test → integration test → build', severity: 'info' },
    ],
    thresholds: {},
    interactions: ['workflow-router'],
    content: `**What:** Auto-detects the project's available verification toolchain and selects the right commands.

**Why:** Guessing verification commands (e.g., running \`npm test\` when the project uses \`bun test\`) causes false failures. Detection ensures verification actually runs against the right toolchain.

**When To Apply:** Before any verification step in the pipeline.

**When To Relax:** When the user explicitly specifies which commands to run.

**How To Apply:** Detect package manager → detect available scripts → order by type (check > lint > test > build) → prefer aggregate → run in order.`,
  },

  // -------------------------------------------------------------------------
  // 13. UI/UX Routing
  // -------------------------------------------------------------------------
  {
    name: 'ui-ux-routing',
    category: 'routing',
    description: 'Route design tasks through skill selection and brief creation',
    enforcement: 'soft',
    trigger_conditions: [
      { condition: 'Marketing page or product UI task', detection: 'automatic', keywords: ['landing', 'dashboard', 'ui', 'ux', 'component', 'design'] },
      { condition: 'Design system refinement', detection: 'automatic', keywords: ['design system', 'theme', 'tokens'] },
    ],
    constraints: [
      { requirement: 'Select appropriate design skill', severity: 'warning' },
      { requirement: 'Create design brief with required states', severity: 'warning' },
      { requirement: 'Handle required UI states: loading, error, empty, edge cases', severity: 'warning' },
    ],
    thresholds: {},
    interactions: ['output-quality-gate', 'expert-agent-routing'],
    content: `**What:** Routes UI/UX tasks through proper skill and brief creation before implementation.

**Why:** UI work without a brief produces generic output. Missing loading/error/empty states causes production bugs. This rule ensures design work is intentional and complete.

**When To Apply:** Marketing pages, dashboards, product UI, component libraries, design system work.

**When To Relax:** Internal admin panels with no design requirements. Simple form fields.

**How To Apply:** Detect UI task → select design skill → create brief (objective + audience + required states) → ensure loading/error/empty states covered → implement.`,
  },

  // -------------------------------------------------------------------------
  // 14. Package Manager Detection
  // -------------------------------------------------------------------------
  {
    name: 'package-manager-detection',
    category: 'operational',
    description: 'Detect the correct package manager before any install or script command',
    enforcement: 'soft',
    trigger_conditions: [
      { condition: 'Before any package install or script command', detection: 'automatic', keywords: ['install', 'npm', 'yarn', 'pnpm', 'bun', 'add'] },
    ],
    constraints: [
      { requirement: 'Detection order: packageManager field → bun.lock → pnpm-lock → yarn.lock → package-lock → npm', severity: 'warning' },
      { requirement: 'Never mix package managers', severity: 'warning' },
    ],
    thresholds: {},
    interactions: [],
    content: `**What:** Deterministic package manager detection before running any install or script command.

**Why:** Running \`npm install\` in a pnpm project creates a duplicate node_modules, breaks lockfile integrity, and causes hard-to-debug dependency issues. Detection prevents cross-contamination.

**When To Apply:** Before any package install, dependency add, or script execution.

**When To Relax:** When the user explicitly specifies which package manager to use.

**How To Apply:** Check packageManager field in package.json → check for bun.lock → check for pnpm-lock.yaml → check for yarn.lock → check for package-lock.json → fall back to npm.`,
  },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Seed built-in rules into the database.
 * Skips rules that already exist (by name) to preserve user modifications.
 * Returns the number of rules seeded.
 */
export function seedBuiltInRules(db: DatabaseConnection, sign: SignFn): number {
  let seeded = 0;

  for (const rule of BUILT_IN_RULES) {
    const existing = getRuleByName(db, rule.name);
    if (existing) {
      continue; // Preserve user modifications
    }

    insertRule(db, rule, sign);
    seeded++;
  }

  return seeded;
}

/**
 * Get the list of built-in rule names (for testing and validation).
 */
export function getBuiltInRuleNames(): string[] {
  return BUILT_IN_RULES.map(r => r.name);
}
