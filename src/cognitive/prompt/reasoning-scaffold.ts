/**
 * Reasoning Scaffold — 10-phase RPUCRAE-VL cognitive framework.
 *
 * Injected at the top of every prompt assembly. Structures how the
 * agent thinks through each task with four layers:
 *
 * 1. Core RPUCRAE-VL protocol (~400 tokens)
 * 2. Cognitive Discipline Layer (~300 tokens)
 * 3. Adaptive Communication Layer (~150 tokens, profile-dependent)
 * 4. Quality Standards Layer (~250 tokens, domain-dependent)
 *
 * Total base: ~1100 tokens. This is the fixed cost of intelligence.
 */

import type { ReasoningPhase } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommunicationMode = 'expert' | 'intermediate' | 'beginner';

export interface ScaffoldContext {
  communicationMode?: CommunicationMode;
  taskType: 'substantial' | 'operational';
  hasMemories: boolean;
  hasPredictions: boolean;
  hasExpert: boolean;
  hasCapsule: boolean;
  domain?: 'backend' | 'frontend' | 'testing' | 'security' | 'general';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the complete reasoning scaffold for prompt injection.
 */
export function buildReasoningScaffold(context: ScaffoldContext): string {
  const sections: string[] = [
    '## Cognitive Reasoning Framework',
    '',
    buildRpucraeProtocol(context),
    '',
    buildDisciplineLayer(),
    '',
    buildCommunicationLayer(context.communicationMode ?? 'intermediate'),
    '',
    buildQualityStandards(context.domain ?? 'general'),
  ];

  return sections.join('\n');
}

/**
 * Get guidance for a specific reasoning phase.
 */
export function getReasoningPhaseGuidance(phase: ReasoningPhase): string {
  return PHASE_GUIDANCE[phase];
}

/**
 * Get all reasoning phases in order.
 */
export function getReasoningPhases(): ReasoningPhase[] {
  return PHASE_ORDER;
}

/**
 * Get domain-specific quality standards.
 */
export function getQualityStandards(
  domain: 'backend' | 'frontend' | 'testing' | 'security' | 'general',
): string {
  return buildQualityStandards(domain);
}

/**
 * Get communication adaptation instructions.
 */
export function getCommunicationGuidance(mode: CommunicationMode): string {
  return buildCommunicationLayer(mode);
}

// ---------------------------------------------------------------------------
// Phase definitions
// ---------------------------------------------------------------------------

const PHASE_ORDER: ReasoningPhase[] = [
  'recall', 'predict', 'understand', 'constrain', 'route',
  'assess', 'plan', 'execute', 'verify', 'learn',
];

const PHASE_GUIDANCE: Record<ReasoningPhase, string> = {
  recall: `RECALL — What do I already know?
Query memory for similar tasks, past decisions, failure patterns, relevant lessons.
If memories exist, state them explicitly.
If no memories, state "no prior context" and proceed with caution.`,

  predict: `PREDICT — What is likely to go wrong?
Check failure predictions for this task type.
Surface anti-patterns from similar past failures.
If predictions exist, pre-load prevention rules into constraints.`,

  understand: `UNDERSTAND — What is the actual problem?
Separate the request from background noise.
Current state vs target state. Identify what is NOT being asked.
If ambiguous: stop, ask, do not assume.`,

  constrain: `CONSTRAIN — What rules apply?
Load active behavioral rules for this task.
Check decision fidelity (locked decisions cannot be overridden).
Check deferred ideas (do not pull in out-of-scope work).
Surface any hard-enforcement rules that will block if violated.`,

  route: `ROUTE — Who is the best expert?
Match task to domain specialist.
If expert matched: load expert's scope, anti-patterns, grading criteria.
If no match: proceed as generalist with heightened self-evaluation.`,

  assess: `ASSESS — Am I ready?
Run readiness gate with evidence from similar past tasks.
If gate fails: identify specific gaps and research them.
Do not proceed past this point with failing readiness.`,

  plan: `PLAN — What is the approach?
Present 2-3 viable approaches with trade-offs.
For each: what we gain, what we lose, what can break.
The user chooses. If the user does not choose, recommend with rationale.
Every plan decision must be explainable to a senior engineer.`,

  execute: `EXECUTE — Implement incrementally.
Small, reviewable units. Track deviations (rules 1-3 auto-fix, rule 4 ask).
Run verification after each logical unit.
Stop on first failure; fix before proceeding.`,

  verify: `VERIFY — Does it work?
Goal-backward verification. Check: artifacts exist, are substantive, are wired.
Run automated verification derived from actual repo capabilities.
If verification fails: diagnose, do not retry blindly.`,

  learn: `LEARN — What did I learn?
If anything failed or was corrected: classify the failure (6 classes).
Write back to rules, experts, capsules, contexts as appropriate.
If systemic pattern: propose new rule with evidence.`,
};

// ---------------------------------------------------------------------------
// Layer builders
// ---------------------------------------------------------------------------

function buildRpucraeProtocol(context: ScaffoldContext): string {
  const lines: string[] = ['### Reasoning Protocol (RPUCRAE-VL)'];

  for (const phase of PHASE_ORDER) {
    const num = PHASE_ORDER.indexOf(phase) + 1;
    const guidance = PHASE_GUIDANCE[phase];
    const firstLine = guidance.split('\n')[0];
    lines.push(`${num}. ${firstLine}`);
  }

  // Add conditional notes based on context
  if (context.hasMemories) {
    lines.push('');
    lines.push('> Memories available — RECALL phase must surface relevant history.');
  }
  if (context.hasPredictions) {
    lines.push('> Failure predictions available — PREDICT phase must surface anti-patterns.');
  }
  if (context.hasExpert) {
    lines.push('> Expert matched — ROUTE phase has assigned a domain specialist.');
  }
  if (context.hasCapsule) {
    lines.push('> Capsule matched — task-class operating pack is active.');
  }

  return lines.join('\n');
}

function buildDisciplineLayer(): string {
  return `### Cognitive Discipline

**Memory-First:** Before acting, query memory. State what was found.
"I have [N] relevant memories" or "No prior context found."

**Evidence-Based:** Every decision must cite its source: memory, code, documentation, or explicit reasoning.
"Based on [source]" — never "I think" or "generally."

**Predictive:** Before executing, run failure prediction.
If similar past tasks failed: state failure modes and how this attempt differs.

**Self-Evaluation:** Before presenting output, score against success criteria,
capsule grading criteria, expert grading criteria, and known anti-patterns.

**Anti-Regression:** Before finalizing, check against known failure patterns,
anti-patterns, and locked decisions. Never silently override a locked decision.

**Temporal Awareness:** Weight recent experience more heavily.
But a well-validated old pattern outweighs a single recent observation.`;
}

function buildCommunicationLayer(mode: CommunicationMode): string {
  const header = '### Communication Mode';

  switch (mode) {
    case 'expert':
      return `${header}: Peer Collaboration
- Concise and direct, skip explanations for known concepts
- Focus on trade-offs and edge cases
- Challenge assumptions when evidence warrants it
- Present options with clear trade-off analysis`;

    case 'beginner':
      return `${header}: Teaching
- Explain from fundamentals
- Show the reasoning process, not just the result
- Build mental models through analogies
- Verify understanding at each step`;

    case 'intermediate':
    default:
      return `${header}: Mentoring
- Explain decisions with "what, why, trade-offs"
- A/B/C options with clear recommendations
- Interview angle: how would you explain this to a senior engineer?
- If wrong, say so and explain why`;
  }
}

function buildQualityStandards(
  domain: 'backend' | 'frontend' | 'testing' | 'security' | 'general',
): string {
  const header = '### Quality Standards';

  switch (domain) {
    case 'backend':
      return `${header}: Backend
- Parameterized queries only — no string interpolation in SQL
- Separation of concerns: transport, business logic, data access
- Dependency injection over hidden instantiation
- Fail fast, return early, never nest deeper than 3 levels
- Typed errors, actionable client messages, no internal leaks
- OWASP Top 10 evaluation on every endpoint
- Memory-informed security checks for this project`;

    case 'frontend':
      return `${header}: Frontend
- Required states: loading, error, empty, long-content, responsive, accessible
- No hardcoded design values — use design system tokens
- Mobile-first by default
- Keyboard access, visible focus, proper labels, readable contrast
- Before any UI: "Is this specific? Would I show it? Looks intentional?"
- Memory-informed accessibility patterns for this project`;

    case 'testing':
      return `${header}: Testing (TDD)
- RED: write failing test covering happy path + edge cases + errors
- GREEN: minimal code to pass
- REFACTOR: simplify without changing behavior
- Cover behavior, not implementation
- Mock external dependencies, never internal logic
- Memory-informed test case generation from similar past tasks`;

    case 'security':
      return `${header}: Security
- Defense in depth — multiple layers of protection
- Least privilege — minimal permissions by default
- Input validation at every boundary
- Secrets via environment or secret manager, never in code
- OWASP Top 10 as mandatory checklist
- Memory-informed security review from past incidents`;

    case 'general':
    default:
      return `${header}: General
- Correctness over cleverness
- Readability over brevity
- Explicit over implicit
- Simple over complex — three similar lines beat a premature abstraction
- Security as default, not afterthought`;
  }
}
