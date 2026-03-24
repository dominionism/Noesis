# INTELLIGENCE — Cognitive Architecture Reference

**Version:** 1.0.0
**Created:** 2026-03-15
**Completed:** 2026-03-17
**Status:** FULLY IMPLEMENTED AND TESTED (114 test files, 3,292 tests passing)
**Derived from:** agent-workflow v1.0.0 (37 agents, 14 rules, 36 skills, 2 capsules, 51 commands, 13 contexts, GSD system)
**Purpose:** This document describes how Noesis integrated agent-workflow's reasoning architecture into its memory/security infrastructure — and then exceeded both. All features described below are implemented, tested, and operational.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gap Analysis](#2-gap-analysis)
3. [Architecture Overview](#3-architecture-overview)
4. [How Noesis Exceeds Agent-Workflow](#4-how-noesis-exceeds-agent-workflow)
5. [Implementation Reference](#5-implementation-reference)
6. [Database Schema](#6-database-schema)
7. [New RPC Methods](#7-new-rpc-methods)
8. [New CLI Commands](#8-new-cli-commands)
9. [File Manifest](#9-file-manifest)
10. [Testing Strategy](#10-testing-strategy)
11. [Success Criteria](#11-success-criteria)

---

## 1. Executive Summary

Noesis combines world-class memory (3-tier hybrid retrieval, knowledge graph, HMAC integrity) and world-class security (7 non-disableable invariants) with the cognitive architecture that makes agents actually *think well*: behavioral constraints that shape reasoning, domain experts that bring specialized knowledge, deep capsules that restructure context for task classes, executable skills that encode proven workflows, and an active learning loop that rewrites the system itself when it fails.

**Every** intelligence-producing component from agent-workflow has been integrated into Noesis's infrastructure. The result is a system where agents think with agent-workflow's discipline, remember with Noesis's precision, and improve with evidence-backed learning that neither system can do alone.

### What Was Built

| Component | Agent-Workflow (Static) | Noesis After This Plan (Dynamic) |
|---|---|---|
| Rule Cards | 14 markdown files loaded into context | 14+ rules stored in DB with embeddings, effectiveness tracking, Bayesian confidence, auto-evolution |
| Expert Agents | 37 markdown definitions | 37+ experts stored in DB with performance histories, memory-informed routing, outcome correlation |
| Capsules | 2 capsules, 7 files each (static) | 7+ capsules, 7 components each, dynamically assembled with relevant memories and user preferences |
| Skills | 36 markdown skill packs | 36+ skills stored in DB with invocation tracking, chaining, semantic matching |
| Context Files | 13 markdown files | 13+ context types backed by structured DB storage, memory-informed selection |
| Prompt Orchestration | system.md (259 lines, static) | Dynamic prompt engine assembling rules + experts + capsules + skills + memories per task |
| Readiness Gate | 5-dimension self-assessment | 5-dimension scoring backed by memory evidence from similar past tasks |
| Learning Loop | Writes lessons to markdown files | Multi-target writeback to rules, experts, capsules, skills, and contexts with evidence |
| GSD Execution | Phase-based with markdown state | Phase-based with persistent DB state, memory-aware transitions, cross-session continuity |
| Quality Gates | Output quality gate (static criteria) | Self-improving gates with effectiveness metrics and adaptive criteria |

---

## 2. Architecture Origin — What Was Integrated from agent-workflow

### Components integrated from agent-workflow into Noesis

| # | Component | Impact on Agent Intelligence | Agent-Workflow Implementation |
|---|---|---|---|
| G1 | **Rule Engine** | Rules force disciplined reasoning — they constrain *how* agents think, not just what they know | 14 rule cards in `rules/common/`, loaded into context, each with triggers, constraints, thresholds |
| G2 | **Expert Agent System** | Domain specialists bring focused expertise — a security expert thinks about security differently than a generalist | 37 agent definitions in `agents/`, each with role, domain, triggers, scope, deliverables, anti-patterns |
| G3 | **Deep Capsule Structure** | 7-component capsules restructure the entire context for a task class — intent, assembly, examples, anti-patterns, critic, grader, memory-policy | 2 capsules (api-workflow, creative-redesign), 7 files each |
| G4 | **Executable Skill System** | Skills encode proven workflows as invocable packages with anti-patterns and enforcement rules | 36 skill directories, YAML frontmatter + markdown, workflow enforcement, chaining |
| G5 | **Dynamic Context System** | 13 context types maintain durable state (decisions, failure patterns, user taste, etc.) that shapes every response | 13 context files in `contexts/`, loaded by priority, per-project overrides |
| G6 | **GSD Execution Engine** | Phase-based project execution with checkpoints, wave-based parallelism, persistent debug state | `get-shit-done/` system with 34 commands, 6 specialized agents, milestone management |
| G7 | **Output Quality Gate** | Prevents generic creative/API work by requiring differentiation evidence before planning | `output-quality-gate.md` rule with creative gate + API gate requirements |
| G8 | **Discovery Levels** | 4-level research depth calibration prevents over/under-research | `discovery-levels.md` rule: Level 0-3 (pattern extension → architectural) |
| G9 | **Decision Fidelity** | Locked decisions are never silently replaced — deferred ideas stay deferred | `decision-fidelity.md` rule with locked/deferred/discretion categories |
| G10 | **Search First** | Always find existing patterns before creating new ones | `search-first.md` rule: required search pass before any new behavior |
| G11 | **Session Continuity** | Lightweight sessions for workflow continuity, rich handoffs for deliberate transfer | `session-continuity.md` rule + session/handoff distinction + working set persistence |
| G12 | **Verification Automation** | Verification derived from actual repo capabilities, not guessed | `verification-automation.md` rule with detection + preferred order |
| G13 | **Active Writeback** | Corrections rewrite rules, capsules, and contexts — the system improves its own behavioral framework | Learning loop writes to `failure-patterns.md`, `lessons-learned.md`, `user-taste.md` |
| G14 | **Artifact Retrieval** | Smallest set of artifacts loaded for resumption, explicit over broad | `artifact-retrieval.md` rule with retrieval hierarchy and working set |
| G15 | **Context Pressure Management** | Warning → checkpoint, Critical → handoff, never start complex work under pressure | `workflow-router.md` continuity section with automation modes |
| G16 | **Command System** | 51 structured commands providing comprehensive operational vocabulary | `commands/` directory with YAML frontmatter, allowed tools, argument hints |

### Components that were enhanced beyond agent-workflow's original implementation

| # | Component | Current State | Required Enhancement |
|---|---|---|---|
| W1 | **Prompt Optimization** | `prompt-optimizer.ts`: keyword-based extraction of goal/context/constraints | Full optimization pass: GOAL/CONTEXT/CONSTRAINTS/DELIVERABLE/VALIDATION/CAPSULE with memory enrichment and rule/expert/capsule integration |
| W2 | **Readiness Gate** | `readiness.ts`: 5-dimension scoring with memory boost | Evidence-backed scoring from similar past tasks, discovery level calibration, auto-research triggers |
| W3 | **Capsule Router** | `capsule-router.ts`: 5 capsules as data objects (keywords + arrays) | 7-component deep capsules with dynamic memory-informed assembly |
| W4 | **Critic System** | `critic.ts`: anti-pattern matching + basic quality checks | 7-dimension adversarial critique (per artifact type), max 3 cycles, structured BLOCKING/WARNING/ADVISORY |
| W5 | **Learning Loop** | `learning-loop.ts`: captures lessons with causal chains | Multi-target writeback to rules, experts, capsules, skills, contexts — not just passive memory |
| W6 | **RPI Orchestrator** | `rpi-orchestrator.ts`: state machine with phase transitions | Full execution engine with prompt optimization gate, expert routing, capsule selection, GSD integration |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        NOESIS DAEMON (Enhanced)                              │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    COGNITIVE ARCHITECTURE (NEW)                        │  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │  │
│  │  │ Rule Engine   │  │ Expert Agent │  │ Skill System │                │  │
│  │  │              │  │ System       │  │              │                │  │
│  │  │ 14+ rules    │  │ 37+ experts  │  │ 36+ skills   │                │  │
│  │  │ Compliance   │  │ Routing      │  │ Matching     │                │  │
│  │  │ Writeback    │  │ Performance  │  │ Chaining     │                │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                │  │
│  │         │                 │                  │                         │  │
│  │  ┌──────┴─────────────────┴──────────────────┴───────────────────┐    │  │
│  │  │              PROMPT ORCHESTRATION ENGINE                       │    │  │
│  │  │                                                                │    │  │
│  │  │  Reasoning Framework ─── Prompt Optimizer ─── Context Assembly │    │  │
│  │  │  (understand → optimize → route → readiness → plan →          │    │  │
│  │  │   implement → review → learn)                                  │    │  │
│  │  └────────────────────────┬───────────────────────────────────────┘    │  │
│  │                           │                                            │  │
│  │  ┌────────────────────────┴───────────────────────────────────────┐    │  │
│  │  │              QUALITY GATES                                     │    │  │
│  │  │                                                                │    │  │
│  │  │  Readiness Gate ─── Output Quality Gate ─── Verification Gate  │    │  │
│  │  │  (evidence-backed)  (creative/API)          (repo-derived)     │    │  │
│  │  └────────────────────────┬───────────────────────────────────────┘    │  │
│  │                           │                                            │  │
│  │  ┌────────────────────────┴───────────────────────────────────────┐    │  │
│  │  │              DEEP CAPSULE ENGINE                               │    │  │
│  │  │                                                                │    │  │
│  │  │  7 Components: intent │ assembly │ examples │ anti-patterns    │    │  │
│  │  │                critic │ grader │ memory-policy                  │    │  │
│  │  │  7+ Built-in Capsules (dynamically assembled with memory)      │    │  │
│  │  └────────────────────────┬───────────────────────────────────────┘    │  │
│  │                           │                                            │  │
│  │  ┌────────────────────────┴───────────────────────────────────────┐    │  │
│  │  │              EXECUTION ENGINE                                  │    │  │
│  │  │                                                                │    │  │
│  │  │  GSD Engine ─── Checkpoint Manager ─── Deviation Tracker       │    │  │
│  │  │  Phase Executor ─── Debug State ─── Wave Parallelism           │    │  │
│  │  └────────────────────────┬───────────────────────────────────────┘    │  │
│  │                           │                                            │  │
│  │  ┌────────────────────────┴───────────────────────────────────────┐    │  │
│  │  │              ACTIVE LEARNING LOOP                              │    │  │
│  │  │                                                                │    │  │
│  │  │  Correction Detector ─── Failure Classifier ─── Writeback      │    │  │
│  │  │  (multi-target: rules, experts, capsules, skills, contexts)    │    │  │
│  │  │  Effectiveness Tracker ─── Predictive Failure Detection        │    │  │
│  │  └────────────────────────┬───────────────────────────────────────┘    │  │
│  │                           │                                            │  │
│  │  ┌────────────────────────┴───────────────────────────────────────┐    │  │
│  │  │              CONTEXT ENGINE                                    │    │  │
│  │  │                                                                │    │  │
│  │  │  13+ Context Types ─── Priority Assembly ─── Per-Project State │    │  │
│  │  │  Decision Fidelity ─── Session Continuity ─── Artifact Mgmt    │    │  │
│  │  └───────────────────────────────────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  EXISTING: Memory Engine │ Intelligence Layers │ Security │ Adapters  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Module Structure

```
src/
├── cognitive/                    # NEW: Cognitive Architecture Layer
│   ├── rules/
│   │   ├── rule-engine.ts        # Rule loading, matching, evaluation
│   │   ├── rule-store.ts         # CRUD operations for rules
│   │   ├── rule-compliance.ts    # Compliance checking against active rules
│   │   ├── rule-writer.ts        # Learning-loop writeback to rules
│   │   └── built-in-rules.ts     # 14 migrated rules from agent-workflow
│   ├── experts/
│   │   ├── expert-registry.ts    # Expert definitions and lifecycle
│   │   ├── expert-router.ts      # Task-to-expert matching with memory
│   │   ├── expert-store.ts       # CRUD operations for experts
│   │   ├── expert-tracker.ts     # Performance tracking and outcome correlation
│   │   └── built-in-experts.ts   # 37 migrated experts from agent-workflow
│   ├── capsules/
│   │   ├── capsule-engine.ts     # 7-component lifecycle and assembly
│   │   ├── capsule-store.ts      # CRUD operations for capsule components
│   │   ├── capsule-assembly.ts   # Memory-informed dynamic assembly
│   │   └── built-in-capsules.ts  # 7 enhanced capsules (5 existing + 2 from agent-workflow)
│   ├── skills/
│   │   ├── skill-registry.ts     # Skill definitions and invocation
│   │   ├── skill-store.ts        # CRUD operations for skills
│   │   ├── skill-matcher.ts      # Semantic skill matching and chaining
│   │   └── built-in-skills.ts    # Key skills migrated from agent-workflow
│   ├── context/
│   │   ├── context-engine.ts     # Dynamic context assembly and prioritization
│   │   ├── context-store.ts      # CRUD for context state
│   │   ├── context-pressure.ts   # Context pressure detection and automation
│   │   └── built-in-contexts.ts  # 13 context type definitions
│   ├── prompt/
│   │   ├── prompt-engine.ts      # Full reasoning framework orchestration
│   │   ├── prompt-assembler.ts   # Token-budget-aware assembly from all cognitive entities
│   │   ├── reasoning-scaffold.ts # Dynamic cognitive reasoning framework (surpasses system.md)
│   │   └── discovery-levels.ts   # 4-level research depth calibration
│   ├── gates/
│   │   ├── readiness-gate.ts     # Enhanced evidence-backed readiness (replaces workflow/readiness.ts)
│   │   ├── output-quality-gate.ts # Creative/API differentiation gate
│   │   └── verification-gate.ts  # Repo-capability-derived verification
│   ├── execution/
│   │   ├── gsd-engine.ts         # Full GSD project lifecycle (34 commands parity)
│   │   ├── phase-executor.ts     # Task execution with deviation tracking
│   │   ├── checkpoint-manager.ts # Checkpoint protocol with persistence
│   │   ├── wave-scheduler.ts     # Wave-based parallel execution
│   │   ├── debug-state.ts        # Persistent debug state across sessions
│   │   ├── milestone-manager.ts  # Milestone lifecycle, roadmap management
│   │   ├── todo-manager.ts       # TODO capture and tracking
│   │   ├── codebase-mapper.ts    # Memory-aware codebase analysis
│   │   ├── plan-checker.ts       # 8-dimension plan verification
│   │   ├── integration-checker.ts # Cross-phase wiring verification
│   │   └── settings-manager.ts   # GSD settings and model profiles
│   ├── learning/
│   │   ├── active-learning.ts    # Enhanced multi-target writeback
│   │   ├── correction-detector.ts # Explicit + implicit correction detection
│   │   ├── failure-classifier.ts # 6 failure classes with evidence
│   │   ├── writeback-engine.ts   # Writes corrections to rules/experts/capsules/skills/contexts
│   │   ├── effectiveness-tracker.ts # Tracks gate/rule/expert effectiveness over time
│   │   └── predictive-failure.ts # Predicts likely failures from task similarity
│   ├── continuity/
│   │   ├── session-manager.ts    # Session lifecycle with memory persistence
│   │   ├── handoff-manager.ts    # Rich handoff protocol
│   │   ├── artifact-manager.ts   # Working set management and retrieval hierarchy
│   │   └── decision-fidelity.ts  # Locked decision enforcement
│   └── commands/
│       ├── command-registry.ts   # Command definitions and routing
│       ├── command-store.ts      # CRUD for commands
│       └── built-in-commands.ts  # Core workflow commands
```

---

## 4. How Noesis Exceeds Agent-Workflow

These are capabilities that the integration produces which agent-workflow cannot match.

### 4.1 Memory-Backed Rules

Agent-workflow's rules are static markdown. Noesis stores rules in the database with:
- **Vector embeddings** for semantic matching (find relevant rules even with imprecise task descriptions)
- **Effectiveness tracking** (success/failure counts, Bayesian confidence)
- **Temporal relevance** (rules not triggered in 90+ days decay in priority)
- **Evidence trail** (each rule links to the memories that justify it)
- **Version history** (rules evolve; old versions are preserved for audit)

When a rule consistently prevents failures, its confidence rises and it surfaces higher in context assembly. When a rule doesn't help, it gets archived.

### 4.2 Evidence-Backed Readiness

Agent-workflow's readiness gate is self-assessed. Noesis queries memory:
- "Have I done similar tasks before?" → Retrieve by embedding similarity
- "How did those tasks go?" → Check outcome fields
- "What failed?" → Surface anti-patterns from similar contexts
- "What readiness score did I have then?" → Correlate readiness-to-outcome

If similar past tasks with readiness score 65 succeeded, the gate can be more lenient. If tasks with score 80 still failed, the gate tightens. The gate learns.

### 4.3 Expert Performance History

Agent-workflow routes to experts based on keyword matching. Noesis tracks:
- Which expert handled which tasks
- What the outcomes were
- Which task types each expert performs best on
- Which expert/task combinations produce failures

Over time, routing improves because it's informed by actual outcomes, not just keyword overlap.

### 4.4 Dynamic Capsule Assembly

Agent-workflow loads 7 static files per capsule. Noesis assembles capsules dynamically:
- The **examples** component is enriched with relevant memories (past successes in this task class)
- The **anti-patterns** component merges capsule anti-patterns with synthesized anti-patterns from failures
- The **critic** component is informed by past critic findings in this task class
- The **memory-policy** component uses retrieval scoring to find the most relevant memories for this specific task
- The **grader** component incorporates past grading outcomes to calibrate scoring

### 4.5 Predictive Failure Detection

Agent-workflow's learning loop is reactive (correct after failure). Noesis is proactive:
- Before execution, embed the task description
- Find similar past tasks in memory
- Surface their failure modes and anti-patterns
- Pre-load relevant rules and expert guidance
- Warn the agent about likely failure modes *before* they happen

### 4.6 Cross-Session Semantic Continuity

Agent-workflow's sessions are markdown files that require explicit loading. Noesis sessions are structured memories:
- Every decision, deviation, and checkpoint is a searchable memory with embeddings
- Session resumption uses hybrid retrieval to find the most relevant context
- Cross-session patterns are detected by the clustering pipeline
- The knowledge graph connects related sessions, decisions, and outcomes

### 4.7 Self-Improving Quality Gates

Agent-workflow's quality gates have static criteria. Noesis tracks gate effectiveness:
- If the readiness gate passes tasks that later fail, the threshold adjusts upward
- If the output quality gate blocks good work, the criteria relax
- Gate parameters are stored in the database and updated by the effectiveness tracker

### 4.8 Unified Cognitive Retrieval

All cognitive entities (rules, experts, capsules, skills, commands, contexts) have vector embeddings. The same hybrid retrieval pipeline that finds relevant memories can find:
- The right rule for a situation (even with imprecise description)
- The right expert for a task (even with novel task types)
- The right skill for a workflow step (even with unfamiliar terminology)

### 4.9 Knowledge Graph-Backed Routing

Expert and capsule routing uses the knowledge graph (existing):
- If a task `requires` knowledge that expert A specializes in, route to A
- If a task is `related_to` past tasks that used capsule B, suggest B
- If a rule `prevents` the type of failure this task is likely to encounter, surface it

### 4.10 Rule Evolution

The learning loop can propose new rules or modifications:
- When a systemic pattern is detected (3+ similar failures without a covering rule), propose a new rule
- When an existing rule misses a failure it should have caught, propose a rule modification
- Proposals include evidence (the failures that motivated the change) and go to `draft` status
- Draft rules are surfaced to the user for approval before becoming active

### 4.11 Cognitive Reasoning Scaffold (Day-1 Supremacy)

This is the single most critical day-1 differentiator. Agent-workflow has `system.md` (259 lines of static prompt). Noesis has a **dynamic cognitive reasoning scaffold** that is constructed per-task from a fixed core framework plus adaptive components. The fixed core alone surpasses system.md because it includes capabilities system.md does not have: memory-first thinking, predictive reasoning, self-evaluation, meta-reasoning, and anti-regression checking.

**Implementation: `src/cognitive/prompt/reasoning-scaffold.ts`**

The scaffold is a structured reasoning framework injected at the top of every prompt assembly. It defines not just what steps to follow, but *how to think*.

**Core Reasoning Protocol (RPUCRAE-VL) — 10 phases, always present:**

```
1. RECALL    — What do I already know? Query memory for similar tasks, past decisions,
               failure patterns, relevant lessons. If memories exist, state them.
               If no memories, state "no prior context" and proceed with caution.

2. PREDICT   — What is likely to go wrong? Check failure predictions for this task type.
               Surface anti-patterns from similar past failures.
               If predictions exist, pre-load prevention rules into constraints.

3. UNDERSTAND — What is the actual problem? Separate the request from background noise.
                Current state vs target state. Identify what is NOT being asked.
                If ambiguous: stop, ask, do not assume.

4. CONSTRAIN — What rules apply? Load active behavioral rules for this task.
               Check decision fidelity (locked decisions cannot be overridden).
               Check deferred ideas (do not pull in out-of-scope work).
               Surface any hard-enforcement rules that will block if violated.

5. ROUTE     — Who is the best expert? Match task to domain specialist.
               If expert matched: load expert's scope, anti-patterns, grading criteria.
               If no match: proceed as generalist with heightened self-evaluation.

6. ASSESS    — Am I ready? Run readiness gate with evidence from similar past tasks.
               If gate fails: identify specific gaps and research them.
               Do not proceed past this point with failing readiness.

7. PLAN      — What is the approach? Present 2-3 viable approaches with trade-offs.
               For each: what we gain, what we lose, what can break.
               The user chooses. If the user does not choose, recommend with rationale.
               Every plan decision must be explainable to a senior engineer.

8. EXECUTE   — Implement incrementally. Small, reviewable units.
               Track deviations (rules 1-3 auto-fix, rule 4 ask).
               Run verification after each logical unit.
               Stop on first failure; fix before proceeding.

9. VERIFY    — Does it work? Goal-backward verification.
               Check: artifacts exist, are substantive, are wired (not orphaned).
               Run automated verification derived from actual repo capabilities.
               If verification fails: diagnose, do not retry blindly.

10. LEARN    — What did I learn? If anything failed or was corrected:
               Classify the failure (6 classes).
               Write back to rules, experts, capsules, contexts as appropriate.
               If systemic pattern: propose new rule with evidence.
```

**Cognitive Discipline Layer (always present, surpasses system.md):**

```
MEMORY-FIRST THINKING
  Before acting on any task, query memory. State what was found.
  "I have [N] relevant memories for this task" or "No prior context found."
  Never ignore available memory. Never assume you have no history.

EVIDENCE-BASED DECISIONS
  Every decision must cite its source: memory, code, documentation, or explicit reasoning.
  "Based on [source]" not "I think" or "generally" or "usually."
  If no evidence exists, state the assumption explicitly as an assumption.

PREDICTIVE REASONING
  Before executing, run failure prediction.
  If similar past tasks failed: state the failure modes and how this attempt differs.
  If no similar failures exist: state "no predicted failure modes" and proceed.

SELF-EVALUATION
  Before presenting any substantial output, score it against:
  - The task's success criteria (from prompt shape)
  - The capsule's grading criteria (if capsule matched)
  - The expert's grading criteria (if expert matched)
  - Known anti-patterns for this task type
  If score is below threshold: revise before presenting.

META-REASONING
  Before choosing an approach, evaluate whether your reasoning process is appropriate:
  - Am I using the right discovery level? (Don't over-research or under-research)
  - Am I routing to the right expert? (Don't use a generalist for specialist work)
  - Am I applying the right capsule? (Don't force a capsule that doesn't fit)
  - Is my readiness assessment honest? (Don't inflate scores to proceed faster)

ANTI-REGRESSION
  Before finalizing any output:
  - Check against known failure patterns for this project
  - Check against anti-patterns from similar past tasks
  - Check against locked decisions (never silently override)
  - If any check fails: revise or flag to user

TEMPORAL AWARENESS
  Weight recent experience more heavily than old experience.
  A lesson from yesterday is more relevant than a lesson from 6 months ago.
  But: a well-validated old pattern (high confidence) outweighs a single recent observation.

GRAPH-AWARE THINKING
  Consider relationships between concepts, not just individual memories.
  If task A requires understanding B, and B contradicts C, surface the contradiction.
  Use causal chains to trace root causes, not just symptoms.
```

**Adaptive Communication Layer (adjusts based on cognitive profile):**

```
FOR EXPERT USERS (detected via cognitive profiler):
  - Peer collaboration mode
  - Concise, direct, skip explanations for known concepts
  - Focus on trade-offs and edge cases
  - Challenge their assumptions when evidence warrants it

FOR INTERMEDIATE USERS:
  - Mentoring mode
  - Explain decisions with "what, why, trade-offs"
  - A/B/C options with clear recommendations
  - Interview angle: how would you explain this to a senior engineer?

FOR BEGINNERS:
  - Teaching mode
  - Explain from fundamentals
  - Show the reasoning process, not just the result
  - Build mental models through analogies to what they know

UNIVERSAL (always):
  - Direct and concise, no filler
  - No emojis, no generic encouragement
  - If wrong, say so and explain why
  - Present options as A/B/C with trade-offs
  - If you cannot explain a decision, the decision is not ready
```

**Quality Standards Layer (surpasses system.md's backend/frontend standards):**

```
BACKEND (everything from agent-workflow system.md PLUS):
  - Memory-informed security checks (recall past security incidents for this project)
  - Parameterized queries only (enforced by rules, not just suggested)
  - Separation of concerns: transport, business logic, data access
  - Dependency injection over hidden instantiation
  - Fail fast, return early, never nest deeper than 3 levels
  - Typed errors, actionable client messages, no internal leaks
  - OWASP top 10 evaluation on every endpoint (from CLAUDE.md security framework)

FRONTEND (everything from agent-workflow system.md PLUS):
  - Memory-informed accessibility patterns (recall past accessibility issues)
  - Required states: loading, error, empty, long-content, responsive, accessible
  - No hardcoded design values
  - Mobile-first by default
  - Keyboard access, visible focus, labels, readable contrast
  - Before any UI: "Is this specific to the problem? Would I show it? Looks intentional?"

TESTING (TDD as default):
  - RED: write failing test covering happy path + edge cases + errors
  - GREEN: minimal code to pass
  - REFACTOR: simplify without changing behavior
  - Memory-informed test case generation (recall what broke in similar past tasks)
  - Cover behavior, not implementation
  - Mock external dependencies, never internal logic
```

**Why this surpasses agent-workflow's system.md on day 1:**

| Capability | system.md (static) | Reasoning Scaffold (dynamic) |
|---|---|---|
| Reasoning flow | understand → plan → implement → review (4 steps) | RPUCRAE-VL: 10 phases with memory, prediction, routing, assessment |
| Memory integration | None — no memory system | Memory-first: every task starts with recall |
| Failure prediction | None — reactive only | Predictive: failure modes surfaced before execution |
| Self-evaluation | None — relies on user to judge quality | Built-in: scores output against criteria before presenting |
| Meta-reasoning | None — fixed reasoning approach | Evaluates own reasoning process for appropriateness |
| Anti-regression | None — no history of past failures | Checks against known failure patterns and anti-patterns |
| User adaptation | Fixed — same communication for everyone | Adaptive: adjusts depth based on cognitive profile |
| Security | Manual checklist | Memory-informed + OWASP enforcement per output |
| Context management | Load relevant files (manual) | Priority-ordered, token-budget-aware, dynamic selection |

The scaffold is not a static document. It is dynamically constructed by `reasoning-scaffold.ts` and injected by `prompt-assembler.ts` at the top of every prompt assembly, before rules, experts, capsules, skills, and memories.

### 4.12 Day-1 Semantic Intelligence

Even with an empty memory store, Noesis has capabilities agent-workflow cannot match:

**Unified semantic search across all entity types.** Agent-workflow loads files by path. Noesis finds the right rule, expert, capsule, or skill by *meaning*. A task described as "make the API faster" finds the performance-optimization capsule, the performance skill, and the "avoid premature optimization" rule — even though none of those entities contain the exact phrase "make the API faster." Agent-workflow requires the user to know which file to load.

**Multi-entity coherent assembly.** Agent-workflow loads rules, experts, and skills independently. Noesis assembles them into a coherent prompt where rules constrain the expert's behavior, the capsule structures the context, skills provide the workflow, and memories fill in the gaps. The assembly is priority-ordered and token-budget-aware. Agent-workflow either loads everything (context overflow) or loads nothing (information gap).

**Cross-entity relationship detection.** If a rule says "always validate input" and an expert's anti-patterns include "missing input validation," Noesis surfaces both because they share semantic similarity. Agent-workflow has no mechanism to connect related concepts across different file types.

**Automatic task classification.** On first use, Noesis's `isSubstantialTask()` function classifies incoming requests as substantial or operational. Substantial tasks trigger the full 10-phase reasoning protocol. Operational tasks get fast-path execution. Agent-workflow relies on the agent's judgment for this classification, which is inconsistent.

### 4.13 Comprehensive "Why" in All Rules

Every built-in rule includes not just what to do and when, but *why it exists* and *how to apply it in edge cases*. This is the content that enables agents to make correct judgment calls when the trigger conditions are ambiguous.

Format for every rule's content field:

```
## Rule: {name}

### What
{constraint description}

### Why
{the failure or incident that motivated this rule — specific enough to understand the stakes}

### When To Apply
{trigger conditions with examples}

### When To Relax
{edge cases where this rule can be safely relaxed, with conditions}

### Interactions
{how this rule relates to other rules — which take priority in conflicts}

### How To Apply
{specific, actionable steps — not just "do X" but "check Y, then Z, and if W then X"}
```

This means on day 1, even without memory, rules carry their own context and rationale. An agent applying the "search-first" rule knows not just that it should search, but *why* (because duplicate systems fragment codebases and the accumulated cost exceeds the initial search time), *when to relax it* (when the search has already been done this session, or when the task is clearly novel), and *how* (search for: current implementation, neighboring tests, related docs, then state findings before proceeding).

### 4.14 Full GSD Parity and Extension

The GSD execution engine is not a simplified version of agent-workflow's GSD. It is a full-parity implementation extended with memory-aware capabilities. See Phase 9 for the expanded implementation that covers all 34 commands, all execution modes, milestone management, TODO tracking, discussion phases, codebase mapping, and audit trails.

### 4.15 Anti-Regression Intelligence

Before any output is finalized, Noesis runs an anti-regression check that agent-workflow cannot perform:

1. **Project failure pattern check:** Query the `failure_patterns` context for this project. If the current task type has known failure modes, surface them as constraints.
2. **Similar task outcome check:** Embed the task description, find similar past tasks, filter for failures. If similar tasks failed, load their prevention rules.
3. **Locked decision check:** Verify the proposed output doesn't violate any locked decision.
4. **Anti-pattern check:** Run the output against all synthesized anti-patterns for this task type.
5. **Capsule grading check:** If a capsule was used, score the output against the capsule's grading criteria.

This runs on every task, from day 1. With an empty memory store, steps 1 and 2 return empty results (no penalty). Steps 3-5 work immediately because they use built-in data (locked decisions, synthesized anti-patterns from built-in capsules, grading criteria).

---

## Implementation Directive: God Access

**All agents implementing this plan operate with full optimization authority.** Every module, function, algorithm, and data structure is subject to optimization. There are no artificial constraints on finding the best solution. The implementing agent has the authority to:

- Restructure module boundaries if a better organization emerges during implementation
- Optimize algorithms beyond what is specified if the optimization is provably better
- Add capabilities not explicitly listed if they serve the plan's goals (intelligence supremacy)
- Refactor existing Noesis code where it creates friction with the cognitive architecture
- Extend type definitions where the specified types are insufficient
- Add performance optimizations (caching, indexing, batching) wherever they improve response time
- Consolidate redundant code paths across existing and new modules

**Constraints that remain absolute (not subject to optimization):**
- The 7 security invariants are non-negotiable
- TypeScript strict mode
- ESM only
- All cognitive entities must be HMAC-signed
- All cognitive CRUD must be audit-logged
- Existing test suite must not regress

**The standard is: every line of code must be the best version of itself. If a better approach exists, use it. If a specified approach is suboptimal, improve it and document why.**

---

## 5. Implementation Reference

### Phase 0: Cognitive Foundation

**Goal:** Extend Noesis's type system, database schema, and constants to support all cognitive entities.

**Files to create:**
- `src/cognitive/types.ts` — All cognitive entity type definitions

**Files to modify:**
- `src/types.ts` — Export cognitive types
- `src/constants.ts` — Add cognitive constants
- `src/core/schema.ts` — Add cognitive tables to schema migration

**Type Definitions:**

```typescript
// --- Rule Engine Types ---

type RuleCategory =
  | 'workflow'      // workflow-router, prompt-optimization-routing
  | 'quality'       // output-quality-gate, verification-automation
  | 'discovery'     // discovery-levels, search-first
  | 'routing'       // expert-agent-routing, ui-ux-routing
  | 'learning'      // learning-loop, learning-capture
  | 'continuity'    // session-continuity, artifact-retrieval
  | 'fidelity'      // decision-fidelity
  | 'operational';  // package-manager-detection

type RuleEnforcement = 'hard' | 'soft' | 'advisory';
// hard: blocks workflow if violated (readiness gate, decision fidelity)
// soft: warns but allows continuation (search first, discovery levels)
// advisory: informational only (artifact retrieval suggestions)

interface RuleDefinition {
  id: string;
  name: string;
  category: RuleCategory;
  description: string;
  trigger_conditions: RuleTrigger[];
  constraints: RuleConstraint[];
  enforcement: RuleEnforcement;
  thresholds: Record<string, number>;       // Named numeric thresholds
  interactions: string[];                    // IDs of related rules
  version: number;
  enabled: boolean;
  confidence: number;                        // Bayesian effectiveness score
  outcome_count: number;
  success_count: number;
  content: string;                           // Full rule text for context injection
  created_at: string;
  updated_at: string;
}

interface RuleTrigger {
  condition: string;                         // Human-readable condition
  detection: 'automatic' | 'manual';         // How the trigger is detected
  keywords?: string[];                       // Keywords that activate this rule
}

interface RuleConstraint {
  requirement: string;                       // What must be true
  severity: 'blocking' | 'warning' | 'info'; // What happens if violated
  check_fn?: string;                         // Optional: function name for programmatic checking
}

interface RuleComplianceResult {
  rule_id: string;
  rule_name: string;
  compliant: boolean;
  violations: RuleViolation[];
  warnings: string[];
}

interface RuleViolation {
  constraint: string;
  severity: 'blocking' | 'warning';
  description: string;
  suggested_fix: string;
}

// --- Expert Agent Types ---

type ExpertCategory =
  | 'business'         // PM, PO, Analyst
  | 'architecture'     // Architect
  | 'code_quality'     // Developer, QA
  | 'design'           // UX Expert
  | 'gsd'              // GSD pipeline agents
  | 'analysis'         // Codebase Analyzer, Locator, Pattern Finder
  | 'workflow'         // Expert Router, Artifact Gatekeeper, Continuity Manager, etc.
  | 'research'         // Web Search, Thoughts Analyzer, Thoughts Locator
  | 'infrastructure'   // Adapter Parity, Tooling Integrator
  | 'grading';         // Trace Grader

interface ExpertDefinition {
  id: string;
  name: string;
  display_name: string;                      // Human name (e.g., "Winston" for Architect)
  role: string;                              // One-line role description
  domain: string;                            // Domain specialty
  category: ExpertCategory;
  trigger_conditions: string[];              // When to activate this expert
  scope: {
    can: string[];                           // What this expert can do
    cannot: string[];                        // Boundaries
  };
  deliverables: string[];                    // What this expert produces
  anti_patterns: string[];                   // What this expert should avoid
  grading_criteria: GradingCriterion[];      // How to evaluate expert output
  tools: string[];                           // Allowed tools
  model_preference?: string;                 // Preferred model (opus/sonnet/haiku)
  version: number;
  enabled: boolean;
  task_count: number;                        // How many tasks routed to this expert
  success_rate: number;                      // Bayesian success rate
  content: string;                           // Full expert definition for context injection
  created_at: string;
  updated_at: string;
}

interface GradingCriterion {
  dimension: string;
  weight: number;
  description: string;
}

interface ExpertMatch {
  expert: ExpertDefinition;
  score: number;                             // 0-1 match score
  matched_triggers: string[];
  memory_evidence: string[];                 // Memory IDs supporting this match
}

// --- Deep Capsule Types ---

type CapsuleComponentType =
  | 'intent'           // When and why to use this capsule
  | 'assembly'         // What to load before planning
  | 'examples'         // Reference examples and prior art
  | 'anti_patterns'    // What to reject
  | 'critic'           // How to evaluate output
  | 'grader'           // How to score output
  | 'memory_policy';   // What to remember and where to write back

interface DeepCapsuleDefinition {
  id: string;
  name: string;
  display_name: string;
  description: string;
  trigger_patterns: string[];
  version: number;
  enabled: boolean;
  match_count: number;
  success_rate: number;
  created_at: string;
  updated_at: string;
}

interface CapsuleComponent {
  id: string;
  capsule_id: string;
  component_type: CapsuleComponentType;
  content: string;
  created_at: string;
  updated_at: string;
}

interface AssembledCapsule {
  definition: DeepCapsuleDefinition;
  components: Record<CapsuleComponentType, string>;
  enrichments: {
    memory_examples: Memory[];               // Relevant memories as examples
    synthesized_anti_patterns: string[];     // From anti-pattern synthesis
    past_critic_findings: string[];          // From similar past critiques
    user_preferences: string[];              // From cognitive profile/user taste
  };
}

// --- Skill Types (extends existing SkillDefinition) ---

interface ExecutableSkill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  trigger_conditions: string[];
  anti_patterns: string[];
  rules: string[];                           // Skill-specific behavioral rules
  chain_with: string[];                      // Skills this can chain with
  version: string;
  enabled: boolean;
  invocation_count: number;
  success_rate: number;
  content: string;                           // Full skill content
  created_at: string;
  updated_at: string;
}

type SkillCategory =
  | 'workflow'     // create-plan, implement-plan, validate-plan, tdd-cycle
  | 'quality'      // code-review, rpi-critique
  | 'research'     // research-codebase, find-skills
  | 'testing'      // javascript-testing-patterns, python-testing-patterns
  | 'design'       // ui-ux-pro-max, frontend-design
  | 'backend'      // api-design-principles, supabase-postgres
  | 'framework'    // next-best-practices, vercel-react
  | 'domain'       // google-calendar-api, browser-use
  | 'utility';     // file-operations, remembering-conversations

// --- Context System Types ---

type ContextType =
  | 'state'              // Live workflow progress (per-project)
  | 'decisions'          // Locked strategic decisions
  | 'failure_patterns'   // Reusable failure diagnoses
  | 'lessons_learned'    // Promoted reusable lessons
  | 'user_taste'         // User output preferences
  | 'verification'       // Available automated checks
  | 'reference_library'  // Approved exemplars
  | 'ui_ux'              // UI/UX brief for design work
  | 'artifacts'          // Artifact retrieval context
  | 'tooling'            // Environment automation choices
  | 'research_index'     // Research artifact index
  | 'session_index'      // Session artifact index
  | 'agent_catalog';     // Expert agent catalog

interface ContextEntry {
  id: string;
  context_type: ContextType;
  project_id: string | null;                 // null = global
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

// --- Execution State Types ---

type ExecutionStatus =
  | 'pending'
  | 'researching'
  | 'planning'
  | 'checking'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'blocked'
  | 'paused';

interface ExecutionState {
  id: string;
  project_id: string;
  milestone: string | null;
  phase_number: number;
  plan_id: string | null;
  status: ExecutionStatus;
  current_task: number | null;
  total_tasks: number | null;
  wave: number;
  checkpoints: ExecutionCheckpoint[];
  deviations: ExecutionDeviation[];
  debug_state: DebugState | null;
  created_at: string;
  updated_at: string;
}

interface ExecutionCheckpoint {
  type: 'human_verify' | 'decision' | 'human_action';
  description: string;
  resolved: boolean;
  resolved_at: string | null;
}

interface ExecutionDeviation {
  rule: 1 | 2 | 3 | 4;
  type: string;
  description: string;
  task_id: string;
  auto_fixed: boolean;
  timestamp: string;
}

interface DebugState {
  slug: string;
  status: 'gathering' | 'investigating' | 'fixing' | 'verifying' | 'resolved';
  symptoms: string[];
  hypotheses: DebugHypothesis[];
  root_cause: string | null;
  fix_description: string | null;
}

interface DebugHypothesis {
  description: string;
  confidence: 'high' | 'medium' | 'low';
  evidence_for: string[];
  evidence_against: string[];
  tested: boolean;
  result: 'confirmed' | 'rejected' | 'inconclusive' | null;
}

// --- Command Types ---

interface CommandDefinition {
  id: string;
  name: string;
  description: string;
  category: 'workflow' | 'gsd' | 'memory' | 'session' | 'utility';
  argument_hint: string;
  allowed_tools: string[];
  content: string;                           // Full command implementation
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// --- Cognitive Outcome Tracking ---

interface CognitiveOutcome {
  id: string;
  entity_type: 'rule' | 'expert' | 'capsule' | 'skill' | 'gate';
  entity_id: string;
  task_description: string;
  outcome: 'success' | 'failure' | 'partial';
  failure_class: FailureClass | null;
  evidence: string;                          // JSON description of what happened
  correction: string | null;                 // What was corrected
  created_at: string;
}

// --- Prompt Orchestration Types ---

type ReasoningPhase =
  | 'understand'
  | 'optimize'
  | 'route'
  | 'readiness'
  | 'plan'
  | 'implement'
  | 'review'
  | 'learn';

interface PromptAssembly {
  reasoning_phase: ReasoningPhase;
  rules: RuleDefinition[];                   // Active rules for this task
  expert: ExpertDefinition | null;           // Matched expert (if any)
  capsule: AssembledCapsule | null;          // Matched capsule (if any)
  skills: ExecutableSkill[];                 // Relevant skills
  memories: Memory[];                        // Retrieved memories
  contexts: ContextEntry[];                  // Active context files
  prompt_shape: PromptShape;                 // Optimized prompt
  token_budget: number;                      // Available tokens
  priority_order: string[];                  // Assembly priority
}

// --- Discovery Level Types ---

type DiscoveryLevel = 0 | 1 | 2 | 3;
// 0: Existing Pattern Extension (task follows known pattern)
// 1: Quick Verification (approach known, details to confirm)
// 2: Standard Research (selecting between options, multiple subsystems)
// 3: Architectural Research (long-term architecture decisions)

interface DiscoveryAssessment {
  level: DiscoveryLevel;
  rationale: string;
  expected_artifacts: string[];
  estimated_scope: 'narrow' | 'moderate' | 'broad';
}
```

**Constants to add:**

```typescript
// Rule Engine
RULE_CONFIDENCE_ARCHIVE_THRESHOLD = 0.3;
RULE_CONFIDENCE_ARCHIVE_MIN_USES = 5;
RULE_DECAY_FACTOR = 0.95;
RULE_DECAY_THRESHOLD_DAYS = 90;
RULE_MAX_BUILT_IN = 20;

// Expert System
EXPERT_ROUTING_MIN_SCORE = 0.3;
EXPERT_PERFORMANCE_MIN_TASKS = 5;
EXPERT_ARCHIVE_THRESHOLD = 0.25;
EXPERT_MAX_BUILT_IN = 50;

// Deep Capsules
CAPSULE_MATCH_THRESHOLD = 0.15;
CAPSULE_MAX_MEMORY_EXAMPLES = 5;
CAPSULE_MAX_PAST_FINDINGS = 10;
CAPSULE_COMPONENTS = ['intent', 'assembly', 'examples', 'anti_patterns', 'critic', 'grader', 'memory_policy'];

// Skills
SKILL_MATCH_THRESHOLD = 0.2;
SKILL_MAX_CHAIN_DEPTH = 3;

// Context
CONTEXT_TYPES = ['state', 'decisions', 'failure_patterns', 'lessons_learned', 'user_taste', 'verification', 'reference_library', 'ui_ux', 'artifacts', 'tooling', 'research_index', 'session_index', 'agent_catalog'];
CONTEXT_LOAD_PRIORITY = ['decisions', 'state', 'failure_patterns', 'user_taste', 'verification', 'artifacts', 'tooling', 'lessons_learned', 'reference_library', 'ui_ux', 'research_index', 'session_index', 'agent_catalog'];

// Quality Gates
OUTPUT_QUALITY_CREATIVE_REQUIRED = ['objective', 'audience', 'visual_direction', 'references', 'banned_patterns', 'success_criteria'];
OUTPUT_QUALITY_API_REQUIRED = ['contract_target', 'reference_examples', 'edge_cases', 'verification_plan'];

// GSD Execution
GSD_MAX_TASKS_PER_PLAN = 5;
GSD_MAX_AUTO_FIX_ATTEMPTS = 3;
GSD_CHECKPOINT_TYPES = ['human_verify', 'decision', 'human_action'];
GSD_DEVIATION_RULES = [1, 2, 3, 4]; // 1-3: auto-fix, 4: ask

// Context Pressure
CONTEXT_PRESSURE_WARNING_PERCENT = 0.70;
CONTEXT_PRESSURE_CRITICAL_PERCENT = 0.85;

// Prompt Assembly Priority
PROMPT_ASSEMBLY_PRIORITY = [
  'decisions',          // 1. Locked decisions (never override)
  'rules',              // 2. Active behavioral rules
  'expert',             // 3. Matched expert definition
  'capsule',            // 4. Capsule components
  'failure_patterns',   // 5. Relevant failure patterns
  'memories',           // 6. Retrieved memories
  'skills',             // 7. Matched skills
  'contexts',           // 8. Context files
  'anti_patterns',      // 9. Synthesized anti-patterns
];

// Adversarial Critic
CRITIC_MAX_CYCLES = 3;
CRITIC_RESEARCH_DIMENSIONS = ['assumptions', 'evidence_level', 'counterevidence', 'codebase_accuracy', 'gaps', 'implementation_implications', 'preflight_failures'];
CRITIC_PLAN_DIMENSIONS = ['codebase_reality', 'dependencies', 'edge_cases', 'approach_validity', 'premortem', 'scope_realism', 'required_sections'];
CRITIC_SEVERITY_LEVELS = ['blocking', 'warning', 'advisory'];
```

**Database tables:** See [Section 6](#6-database-schema).

**Acceptance criteria:**
- All cognitive types compile with strict TypeScript
- Schema migration creates all new tables
- All constants are used by at least one module
- HMAC signing extended to cover all cognitive entities
- Audit logging covers all cognitive CRUD operations

**Estimated new files:** 3 (types, schema additions, constants additions — integrated into existing files)
**Estimated new tests:** 40 (schema creation, type validation, constant consistency)

---

### Phase 1: Rule Engine

**Goal:** First-class behavioral constraints that shape agent reasoning, stored with embeddings and effectiveness tracking.

**Depends on:** Phase 0

**Files to create:**
- `src/cognitive/rules/rule-engine.ts`
- `src/cognitive/rules/rule-store.ts`
- `src/cognitive/rules/rule-compliance.ts`
- `src/cognitive/rules/rule-writer.ts`
- `src/cognitive/rules/built-in-rules.ts`

**Module: rule-store.ts**

```typescript
// CRUD operations for rules in SQLite
export function insertRule(db: DB, rule: RuleDefinition, sign: SignFn): string;
export function getRule(db: DB, id: string): RuleDefinition | null;
export function getRuleByName(db: DB, name: string): RuleDefinition | null;
export function updateRule(db: DB, id: string, updates: Partial<RuleDefinition>, sign: SignFn): void;
export function deleteRule(db: DB, id: string): void;
export function listRules(db: DB, filters?: { category?: RuleCategory; enabled?: boolean }): RuleDefinition[];
export function recordRuleOutcome(db: DB, ruleId: string, outcome: 'success' | 'failure'): void;
```

**Module: rule-engine.ts**

```typescript
// Core rule matching and loading
export function matchRulesForTask(
  db: DB,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null
): RuleDefinition[];
// Returns rules whose trigger conditions match the task.
// Three-pass matching:
// 1. Keyword match: task keywords against rule trigger keywords
// 2. Semantic match: embedding similarity against rule embeddings (threshold 0.6)
// 3. Category match: task type → rule category mapping

export function getActiveRules(db: DB, projectId?: string): RuleDefinition[];
// Returns all enabled rules sorted by confidence DESC

export function formatRulesForContext(rules: RuleDefinition[], tokenBudget: number): string;
// Renders rules as structured markdown for injection into agent context
// Respects token budget — higher confidence rules get priority
// Format per rule:
// ## Rule: {name}
// **Enforcement:** {hard|soft|advisory}
// **When:** {trigger conditions}
// **Requirements:** {constraints}
// **Thresholds:** {thresholds}

export function applyRuleDecay(db: DB, decayFactor?: number, thresholdDays?: number): number;
// Monthly maintenance: decay confidence of unused rules
// Returns count of rules decayed
```

**Module: rule-compliance.ts**

```typescript
// Check task/output against active rules
export function checkCompliance(
  rules: RuleDefinition[],
  taskContext: {
    phase: ReasoningPhase;
    hasReadiness: boolean;
    hasResearch: boolean;
    hasPlan: boolean;
    hasVerification: boolean;
    isSubstantial: boolean;
    isCreative: boolean;
    isApiWork: boolean;
    searchCompleted: boolean;
    decisionsHonored: boolean;
  }
): RuleComplianceResult[];
// Evaluates each rule's constraints against the task context
// Returns per-rule compliance results with violations

export function enforceHardRules(results: RuleComplianceResult[]): {
  blocked: boolean;
  blocking_violations: RuleViolation[];
};
// Filters for hard-enforcement rules with violations
// Returns whether the workflow should be blocked

export function formatComplianceReport(results: RuleComplianceResult[]): string;
// Human-readable compliance report
```

**Module: rule-writer.ts**

```typescript
// Learning-loop writeback to rules
export function proposeRuleModification(
  db: DB,
  ruleId: string,
  modification: {
    add_constraint?: RuleConstraint;
    modify_threshold?: { name: string; value: number };
    add_trigger?: RuleTrigger;
  },
  evidence: string[],                       // Memory IDs that motivated this change
  sign: SignFn
): RuleDefinition;
// Creates a new version of the rule with the proposed modification
// Old version preserved (version increment)
// New version starts at draft status until confirmed

export function proposeNewRule(
  db: DB,
  rule: Omit<RuleDefinition, 'id' | 'version' | 'confidence' | 'outcome_count' | 'success_count' | 'created_at' | 'updated_at'>,
  evidence: string[],
  sign: SignFn
): RuleDefinition;
// Creates a new rule in draft status
// Requires 3+ evidence memories to justify creation

export function confirmRule(db: DB, ruleId: string, sign: SignFn): void;
// Moves rule from draft to active (enabled = true)

export function archiveRule(db: DB, ruleId: string): void;
// Disables rule (enabled = false) without deleting
```

**Module: built-in-rules.ts**

All 14 rules from agent-workflow, migrated and enhanced:

```typescript
export function getBuiltInRules(): Omit<RuleDefinition, 'id' | 'created_at' | 'updated_at'>[];

// The 14 rules:
// 1. workflow-router — Enforce canonical workflow gate for substantial requests
//    Category: workflow, Enforcement: hard
//    Triggers: vague request, 3+ files, multiple subsystems, >30min, shared behavior change
//    Constraints: Must follow optimize→capsule→research→score→plan→implement→validate→learn
//    Thresholds: readiness_total=70, clarity_min=15, codebase_min=15
//
// 2. prompt-optimization-routing — Internal prompt optimization before acting
//    Category: workflow, Enforcement: soft
//    Triggers: vague request, multi-step, planning/workflow/handoff, substantial (3+ files)
//    Constraints: Extract GOAL/CONTEXT/CONSTRAINTS/DELIVERABLE/VALIDATION/CAPSULE
//    Skip when: narrow operational, factual question, single-file edit, casual
//
// 3. expert-agent-routing — Route workflow tasks to specialists
//    Category: routing, Enforcement: soft
//    Triggers: continuity/critique/artifact/parity/routing/eval/grading/integration task
//    Constraints: Choose narrowest expert, one expert when possible, stay local when delegation adds latency
//    Default mappings: 9 category→expert mappings
//
// 4. discovery-levels — Choose lightest research depth
//    Category: discovery, Enforcement: advisory
//    Triggers: Before research or implementation planning
//    Constraints: Level 0 (pattern extension) → Level 3 (architectural research)
//
// 5. search-first — Search for existing patterns before creating new
//    Category: discovery, Enforcement: soft
//    Triggers: Before any new feature or behavior
//    Constraints: Find current paths, find related tests/docs, prefer reuse
//
// 6. decision-fidelity — Honor explicit user choices
//    Category: fidelity, Enforcement: hard
//    Triggers: Implementation choices, reviewing decisions
//    Constraints: Locked decisions are non-negotiable, deferred ideas stay out, discretion is documented
//
// 7. learning-loop — Systematic response to corrections and failures
//    Category: learning, Enforcement: hard
//    Triggers: User correction, eval failure, critic rejection, repeated failure
//    Constraints: Detect→diagnose→fix→writeback→surface, agents must NOT silently rewrite rules
//
// 8. learning-capture — Capture only durable, reusable learnings
//    Category: learning, Enforcement: soft
//    Triggers: After validation, architectural decision, workflow improvement, correction
//    Constraints: Capture decision+why+rejected+source+failure_class+prevention_rule
//    Skip: temporary debugging, command transcripts, unverified hunches
//
// 9. output-quality-gate — Prevent generic creative/API work
//    Category: quality, Enforcement: hard
//    Triggers: Redesign/UX/creative, API design/integration, user requests non-generic result
//    Constraints: Creative gate (objective+audience+visual+references+banned+criteria)
//                 API gate (contract+examples+edge_cases+verification)
//
// 10. session-continuity — Lightweight sessions for continuity
//     Category: continuity, Enforcement: soft
//     Triggers: Pausing work, resuming work, transferring work
//     Constraints: Record stage+artifacts+blockers+deferred+next_action
//
// 11. artifact-retrieval — Prefer explicit artifact selection
//     Category: continuity, Enforcement: advisory
//     Triggers: Resuming work, deciding which artifacts to load
//     Constraints: Find smallest set, prefer referenced artifacts, fall back to recent
//
// 12. verification-automation — Derive verification from repo capabilities
//     Category: quality, Enforcement: soft
//     Triggers: Before running verification commands
//     Constraints: Detect package manager, detect available commands, prefer aggregate
//
// 13. ui-ux-routing — Route design-heavy work to specialist skill
//     Category: routing, Enforcement: soft
//     Triggers: Marketing pages, product UI, design system refinement
//     Constraints: Select skill, create brief, handle required states (loading/error/empty/etc.)
//
// 14. package-manager-detection — Don't assume npm
//     Category: operational, Enforcement: soft
//     Triggers: Before any package install or script command
//     Constraints: Detection order: packageManager field→bun.lock→pnpm-lock→yarn.lock→package-lock→npm
```

**Acceptance criteria:**
- All 14 built-in rules inserted on first run
- Rule matching returns relevant rules for arbitrary task descriptions
- Compliance checking catches violations of hard rules and blocks workflow
- Rule effectiveness tracking updates after each task outcome
- Rule decay reduces confidence of unused rules monthly
- Rule writeback creates new versions with evidence trail
- All rules have vector embeddings for semantic matching

**Estimated new tests:** 80

---

### Phase 2: Expert Agent System

**Goal:** Domain-specialized expert agents with routing, performance tracking, and memory-informed matching.

**Depends on:** Phase 0

**Files to create:**
- `src/cognitive/experts/expert-registry.ts`
- `src/cognitive/experts/expert-router.ts`
- `src/cognitive/experts/expert-store.ts`
- `src/cognitive/experts/expert-tracker.ts`
- `src/cognitive/experts/built-in-experts.ts`

**Module: expert-store.ts**

```typescript
export function insertExpert(db: DB, expert: ExpertDefinition, sign: SignFn): string;
export function getExpert(db: DB, id: string): ExpertDefinition | null;
export function getExpertByName(db: DB, name: string): ExpertDefinition | null;
export function updateExpert(db: DB, id: string, updates: Partial<ExpertDefinition>, sign: SignFn): void;
export function listExperts(db: DB, filters?: { category?: ExpertCategory; enabled?: boolean }): ExpertDefinition[];
export function deleteExpert(db: DB, id: string): void;
```

**Module: expert-router.ts**

```typescript
export function routeToExpert(
  db: DB,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null,
  options?: {
    preferCategory?: ExpertCategory;
    excludeExperts?: string[];
    maxResults?: number;
  }
): ExpertMatch[];
// Three-factor routing:
// 1. Trigger matching: task keywords against expert trigger conditions (weight 0.4)
// 2. Semantic matching: embedding similarity against expert embeddings (weight 0.3)
// 3. Performance matching: past success rate for similar tasks (weight 0.3)
// Returns sorted by composite score, filtered by EXPERT_ROUTING_MIN_SCORE

export function shouldRouteToExpert(taskDescription: string): boolean;
// Quick check: is this task substantial enough to warrant expert routing?
// Based on: length, complexity keywords, file count estimates, subsystem indicators

export function formatExpertForContext(expert: ExpertDefinition, tokenBudget: number): string;
// Renders expert definition as structured markdown for context injection
```

**Module: expert-tracker.ts**

```typescript
export function recordExpertOutcome(
  db: DB,
  expertId: string,
  taskDescription: string,
  outcome: 'success' | 'failure' | 'partial',
  failureClass?: FailureClass,
  evidence?: string
): void;
// Records outcome in cognitive_outcomes table
// Updates expert's task_count and success_rate (Bayesian)

export function getExpertPerformance(
  db: DB,
  expertId: string,
  options?: { since?: string; failureClass?: FailureClass }
): { task_count: number; success_rate: number; common_failures: string[] };

export function getBestExpertForTaskType(
  db: DB,
  taskKeywords: string[],
  minTasks?: number
): ExpertDefinition | null;
// Finds expert with highest success rate for tasks containing these keywords
// Requires minTasks outcomes (default: EXPERT_PERFORMANCE_MIN_TASKS)
```

**Module: built-in-experts.ts**

All 37 experts from agent-workflow, grouped by category:

```typescript
export function getBuiltInExperts(): Omit<ExpertDefinition, 'id' | 'created_at' | 'updated_at'>[];

// Business & Product (3):
//   product-manager, product-owner, analyst
//
// Technical Architecture (1):
//   architect
//
// Code Quality & Testing (2):
//   developer, qa-engineer
//
// UX & Design (1):
//   ux-expert
//
// GSD Pipeline (11):
//   gsd-project-researcher, gsd-research-synthesizer, gsd-phase-researcher,
//   gsd-roadmapper, gsd-planner, gsd-plan-checker, gsd-codebase-mapper,
//   gsd-executor, gsd-verifier, gsd-integration-checker, gsd-debugger
//
// Codebase Analysis (4):
//   codebase-analyzer, codebase-locator, codebase-pattern-finder,
//   code-deduplication-architect
//
// Workflow & Process (9):
//   expert-agent-router, artifact-gatekeeper, continuity-manager,
//   critique-responder, failure-analyst, eval-engineer, rpi-critic,
//   workflow-router-auditor, scrum-master
//
// Research & Analysis (3):
//   web-search-researcher, thoughts-analyzer, thoughts-locator
//
// Infrastructure (2):
//   adapter-parity-auditor, tooling-integrator
//
// Grading (1):
//   trace-grader
```

Each expert includes full content from agent-workflow's markdown definition, adapted to Noesis's structured format with:
- Trigger conditions as typed arrays
- Scope as can/cannot object
- Deliverables as typed arrays
- Anti-patterns as typed arrays
- Grading criteria with dimensions and weights

**Acceptance criteria:**
- All 37 built-in experts inserted on first run
- Expert routing returns relevant experts for arbitrary tasks
- Performance tracking updates after task outcomes
- Best-expert lookup returns the expert with highest success rate for a task type
- Expert definitions rendered as context-injectable markdown within token budgets
- Experts have vector embeddings for semantic matching

**Estimated new tests:** 70

---

### Phase 3: Deep Capsule System

**Goal:** Replace the current shallow capsule-router with a 7-component capsule system with dynamic memory-informed assembly.

**Depends on:** Phase 0

**Files to create:**
- `src/cognitive/capsules/capsule-engine.ts`
- `src/cognitive/capsules/capsule-store.ts`
- `src/cognitive/capsules/capsule-assembly.ts`
- `src/cognitive/capsules/built-in-capsules.ts`

**Files to modify:**
- `src/workflow/capsule-router.ts` — Deprecate in favor of `capsule-engine.ts`, keep as thin compatibility wrapper

**Module: capsule-store.ts**

```typescript
export function insertCapsule(db: DB, capsule: DeepCapsuleDefinition, sign: SignFn): string;
export function insertComponent(db: DB, component: CapsuleComponent, sign: SignFn): string;
export function getCapsule(db: DB, id: string): DeepCapsuleDefinition | null;
export function getCapsuleByName(db: DB, name: string): DeepCapsuleDefinition | null;
export function getComponents(db: DB, capsuleId: string): CapsuleComponent[];
export function getComponent(db: DB, capsuleId: string, type: CapsuleComponentType): CapsuleComponent | null;
export function listCapsules(db: DB, filters?: { enabled?: boolean }): DeepCapsuleDefinition[];
export function updateComponent(db: DB, id: string, content: string, sign: SignFn): void;
export function recordCapsuleOutcome(db: DB, capsuleId: string, outcome: 'success' | 'failure'): void;
```

**Module: capsule-engine.ts**

```typescript
export function matchCapsule(
  db: DB,
  promptShape: PromptShape,
  embedding: Buffer | null
): { capsule: DeepCapsuleDefinition; score: number } | null;
// Enhanced matching:
// 1. Keyword match against trigger_patterns (weight 0.5)
// 2. Semantic match against capsule embeddings (weight 0.3)
// 3. Historical success rate for similar tasks (weight 0.2)
// Returns best match above CAPSULE_MATCH_THRESHOLD

export function getCapsuleWithComponents(
  db: DB,
  capsuleId: string
): { definition: DeepCapsuleDefinition; components: Record<CapsuleComponentType, string> } | null;
// Returns capsule definition with all 7 components
```

**Module: capsule-assembly.ts**

```typescript
export function assembleCapsule(
  db: DB,
  capsuleId: string,
  taskContext: {
    promptShape: PromptShape;
    memories: Memory[];
    antiPatterns: AntiPatternDefinition[];
    userPreferences: string[];
    pastFindings: string[];
  }
): AssembledCapsule;
// Dynamic assembly:
// 1. Load all 7 components
// 2. Enrich examples with relevant memories (up to CAPSULE_MAX_MEMORY_EXAMPLES)
// 3. Merge capsule anti-patterns with synthesized anti-patterns
// 4. Enrich critic with past findings (up to CAPSULE_MAX_PAST_FINDINGS)
// 5. Apply user preferences from cognitive profile
// Returns fully assembled capsule ready for context injection

export function formatCapsuleForContext(assembled: AssembledCapsule, tokenBudget: number): string;
// Renders assembled capsule as structured markdown
// Priority: intent > anti_patterns > critic > assembly > examples > grader > memory_policy
// Respects token budget
```

**Module: built-in-capsules.ts**

7 built-in capsules with full 7-component definitions:

```typescript
export function getBuiltInCapsules(): {
  definition: Omit<DeepCapsuleDefinition, 'id' | 'created_at' | 'updated_at'>;
  components: Record<CapsuleComponentType, string>;
}[];

// 1. api-workflow (from agent-workflow, enhanced)
//    - intent: API design, integration, contract-heavy backend
//    - assembly: interface definitions, failure-patterns, prior API examples, verification
//    - examples: existing repo APIs with conventions, request/response, test cases
//    - anti_patterns: vague contracts, skipping verification, ignoring prior failures
//    - critic: fail when contract underspecified, edge cases unhandled, tests mismatch, lessons ignored
//    - grader: contract clarity, correctness, edge coverage, test adequacy, lesson reuse
//    - memory_policy: write back on eval miss, user correction, repeated failure
//
// 2. creative-redesign (from agent-workflow, enhanced)
//    - intent: redesigns, landing pages, visual direction
//    - assembly: ui-ux context, user-taste, reference-library, examples
//    - examples: strong references, existing products, prior successful outputs
//    - anti_patterns: template-looking, cosmetic-only, generic typography, ignoring dislikes
//    - critic: fail when generic, only cosmetic, no reference use, ignores taste
//    - grader: specificity, originality, hierarchy, reference adherence, taste alignment
//    - memory_policy: write back on rejection, generic flag, repeated visual anti-pattern
//
// 3. security-hardening (existing, enhanced with 7 components)
//    - intent: OWASP compliance, encryption, authentication, authorization
//    - assembly: threat model, existing security patterns, known vulnerabilities
//    - examples: secure implementations from codebase, reference patterns
//    - anti_patterns: disable-ssl, verify-false, chmod-777, eval, hardcoded secrets
//    - critic: fail when OWASP category unaddressed, secrets exposed, auth bypass possible
//    - grader: OWASP coverage, defense depth, principle of least privilege, audit logging
//    - memory_policy: write back on security incident, vulnerability discovery, pattern failure
//
// 4. performance-optimization (existing, enhanced)
//    - intent: profiling, caching, bottleneck resolution, scalability
//    - assembly: current benchmarks, profiling data, architecture constraints
//    - examples: past optimizations, benchmark comparisons
//    - anti_patterns: premature optimization, cache-without-invalidation, N+1 queries
//    - critic: fail when no baseline measurement, optimization without profiling, regression risk
//    - grader: measurable improvement, regression safety, maintainability impact
//    - memory_policy: write back benchmark results, optimization outcomes, regression discoveries
//
// 5. migration (existing, enhanced)
//    - intent: database schema, version upgrades, rollback strategies
//    - assembly: current schema, migration history, data dependencies
//    - examples: past migrations, rollback procedures
//    - anti_patterns: destructive-without-backup, no-rollback-plan, big-bang-migration
//    - critic: fail when no rollback, data loss possible, downtime unaddressed
//    - grader: reversibility, data integrity, zero-downtime feasibility, testing coverage
//    - memory_policy: write back migration outcomes, rollback executions, data issues
//
// 6. testing-strategy (NEW)
//    - intent: test architecture, coverage strategy, TDD enforcement
//    - assembly: current test infrastructure, coverage reports, testing patterns
//    - examples: existing test patterns from codebase
//    - anti_patterns: snapshot-over-behavior, mocking-everything, testing-implementation
//    - critic: fail when coverage gaps in critical paths, no edge cases, no failure cases
//    - grader: behavior focus, edge coverage, failure path testing, test readability
//    - memory_policy: write back testing lessons, coverage improvements, pattern discoveries
//
// 7. refactoring (NEW)
//    - intent: code restructuring, deduplication, architecture improvement
//    - assembly: current structure, dependency graph, code quality metrics
//    - examples: successful refactorings, pattern consolidations
//    - anti_patterns: refactor-without-tests, big-bang-refactor, premature-abstraction
//    - critic: fail when no test coverage before refactor, behavioral changes, scope creep
//    - grader: complexity reduction, test preservation, readability improvement
//    - memory_policy: write back refactoring outcomes, pattern discoveries, complexity metrics
```

**Acceptance criteria:**
- All 7 built-in capsules inserted with 7 components each (49 component records)
- Capsule matching works with keyword and semantic similarity
- Dynamic assembly enriches components with relevant memories
- Context formatting respects token budgets and priority ordering
- Capsule outcomes tracked and used to inform future routing

**Estimated new tests:** 60

---

### Phase 4: Skill System

**Goal:** Executable knowledge packages with semantic matching, invocation tracking, and skill chaining.

**Depends on:** Phase 0

**Files to create:**
- `src/cognitive/skills/skill-registry.ts`
- `src/cognitive/skills/skill-store.ts`
- `src/cognitive/skills/skill-matcher.ts`
- `src/cognitive/skills/built-in-skills.ts`

**Module: skill-store.ts**

```typescript
export function insertSkill(db: DB, skill: ExecutableSkill, sign: SignFn): string;
export function getSkill(db: DB, id: string): ExecutableSkill | null;
export function getSkillByName(db: DB, name: string): ExecutableSkill | null;
export function updateSkill(db: DB, id: string, updates: Partial<ExecutableSkill>, sign: SignFn): void;
export function listSkills(db: DB, filters?: { category?: SkillCategory; enabled?: boolean }): ExecutableSkill[];
export function deleteSkill(db: DB, id: string): void;
export function recordSkillInvocation(db: DB, skillId: string, outcome: 'success' | 'failure' | 'partial'): void;
```

**Module: skill-matcher.ts**

```typescript
export function matchSkills(
  db: DB,
  taskDescription: string,
  embedding: Buffer | null,
  options?: { category?: SkillCategory; maxResults?: number }
): { skill: ExecutableSkill; score: number }[];
// Semantic matching + keyword matching + success rate weighting

export function resolveSkillChain(
  db: DB,
  primarySkillId: string
): ExecutableSkill[];
// Resolves chain_with references up to SKILL_MAX_CHAIN_DEPTH
// Returns ordered skill chain

export function formatSkillForContext(skill: ExecutableSkill, tokenBudget: number): string;
// Renders skill as context-injectable markdown
```

**Module: built-in-skills.ts**

Key skills from agent-workflow (not all 36 — only those with unique behavioral value):

```typescript
export function getBuiltInSkills(): Omit<ExecutableSkill, 'id' | 'created_at' | 'updated_at'>[];

// Workflow Skills (5):
//   create-plan, implement-plan, iterate-plan, validate-plan, tdd-cycle
//
// Quality Skills (3):
//   code-review, rpi-critique, code-analysis
//
// Research Skills (2):
//   research-codebase, prompt-handoff-optimizer
//
// Testing Skills (3):
//   javascript-testing-patterns, python-testing-patterns, e2e-testing-patterns
//
// Design Skills (2):
//   frontend-design, superdesign
//
// Backend Skills (2):
//   api-design-principles, supabase-postgres-best-practices
//
// Total: ~17 core skills that provide unique behavioral value
// (Framework-specific and domain-specific skills can be added by users)
```

**Acceptance criteria:**
- Built-in skills inserted on first run
- Skill matching returns relevant skills for arbitrary tasks
- Skill chaining resolves up to depth 3
- Invocation tracking updates after each use
- Skills have vector embeddings for semantic matching

**Estimated new tests:** 50

---

### Phase 5: Context Engine

**Goal:** Dynamic context state management with 13 context types, priority-ordered assembly, and per-project overrides.

**Depends on:** Phase 0

**Files to create:**
- `src/cognitive/context/context-engine.ts`
- `src/cognitive/context/context-store.ts`
- `src/cognitive/context/context-pressure.ts`
- `src/cognitive/context/built-in-contexts.ts`

**Module: context-store.ts**

```typescript
export function upsertContext(db: DB, entry: Omit<ContextEntry, 'id' | 'created_at' | 'updated_at'>, sign: SignFn): string;
export function getContext(db: DB, contextType: ContextType, projectId?: string): ContextEntry | null;
// Returns project-specific if exists, falls back to global
export function listContexts(db: DB, projectId?: string): ContextEntry[];
export function updateContext(db: DB, id: string, content: string, sign: SignFn): void;
export function appendToContext(db: DB, contextType: ContextType, projectId: string | null, addition: string, sign: SignFn): void;
// Appends content to existing context (for failure-patterns, lessons-learned, etc.)
```

**Module: context-engine.ts**

```typescript
export function assembleContexts(
  db: DB,
  projectId: string | null,
  taskDescription: string,
  tokenBudget: number
): { contexts: ContextEntry[]; totalTokens: number };
// Loads contexts in priority order (CONTEXT_LOAD_PRIORITY)
// Respects token budget — stops loading when budget exhausted
// Returns loaded contexts and token count

export function getDecisions(db: DB, projectId?: string): {
  locked: string[];      // Non-negotiable decisions
  deferred: string[];    // Out of scope
  discretion: string[];  // Agent's choice
};
// Parses decisions context into categories

export function getFailurePatterns(db: DB, projectId?: string): {
  patterns: { trigger: string; miss: string; rootCause: string; prevention: string }[];
};
// Parses failure-patterns context into structured patterns

export function getUserTaste(db: DB): {
  preferred: string[];
  disliked: string[];
  confirmations: string[];
};
// Parses user-taste context into preference categories
```

**Module: context-pressure.ts**

```typescript
export function assessContextPressure(
  currentTokens: number,
  maxTokens: number
): { level: 'normal' | 'warning' | 'critical'; percentage: number; action: string };
// warning: >= 70% → create checkpoint
// critical: >= 85% → create handoff, stop new complex work

export function shouldCreateCheckpoint(pressure: { level: string }): boolean;
export function shouldCreateHandoff(pressure: { level: string }): boolean;
```

**Module: built-in-contexts.ts**

```typescript
export function getBuiltInContextTemplates(): Record<ContextType, string>;
// Returns initial templates for all 13 context types
// These are populated with default structure on first run
```

**Acceptance criteria:**
- All 13 context types supported with CRUD
- Context assembly respects priority order and token budgets
- Per-project overrides take precedence over global contexts
- Decision fidelity parsing extracts locked/deferred/discretion categories
- Context pressure management triggers checkpoints and handoffs
- Append operations work for accumulative contexts (failure-patterns, lessons-learned)

**Estimated new tests:** 50

---

### Phase 6: Prompt Orchestration Engine

**Goal:** Full reasoning framework that assembles rules, experts, capsules, skills, memories, and contexts into coherent agent guidance.

**Depends on:** Phases 1-5

**Files to create:**
- `src/cognitive/prompt/prompt-engine.ts`
- `src/cognitive/prompt/prompt-assembler.ts`
- `src/cognitive/prompt/discovery-levels.ts`
- `src/cognitive/prompt/reasoning-scaffold.ts`

**Files to modify:**
- `src/workflow/prompt-optimizer.ts` — Enhanced with full GOAL/CONTEXT/CONSTRAINTS/DELIVERABLE/VALIDATION/CAPSULE extraction

**Module: reasoning-scaffold.ts**

```typescript
export function buildReasoningScaffold(
  context: {
    cognitiveProfile?: CognitiveProfile;
    taskType: 'substantial' | 'operational';
    hasMemories: boolean;
    hasPredictions: boolean;
    hasExpert: boolean;
    hasCapsule: boolean;
    projectId?: string;
  }
): string;
// Constructs the dynamic reasoning scaffold described in Section 4.11.
// Core RPUCRAE-VL protocol (always present, ~400 tokens)
// + Cognitive Discipline Layer (always present, ~300 tokens)
// + Adaptive Communication Layer (selected by cognitive profile, ~150 tokens)
// + Quality Standards Layer (always present, ~250 tokens)
// + Task-specific sections (conditional on matched entities)
//
// Total: ~1100 tokens base, expandable to ~1500 with full entity context.
// This is the fixed cost of intelligence. It pays for itself by preventing
// the 3-5 rework cycles that undisciplined reasoning causes.

export function getReasoningPhaseGuidance(phase: ReasoningPhase): string;
// Returns specific guidance for the current reasoning phase.
// Used by the RPI orchestrator to inject phase-appropriate instructions.

export function getCommunicationMode(
  profile: CognitiveProfile | null
): 'expert' | 'intermediate' | 'beginner';
// Determines communication adaptation level from cognitive profile.
// Default: 'intermediate' (safest when profile unknown).

export function getQualityStandards(
  domain: 'backend' | 'frontend' | 'testing' | 'security' | 'general'
): string;
// Returns domain-specific quality standards for context injection.
```

**Module: prompt-engine.ts**

```typescript
export function orchestrateReasoning(
  db: DB,
  request: string,
  projectId: string | null,
  options: {
    embed: EmbedFn;
    sign: SignFn;
    recall: RecallFn;
    tokenBudget: number;
  }
): PromptAssembly;
// Full reasoning orchestration:
// 1. Extract prompt shape (enhanced prompt-optimizer)
// 2. Match rules for this task
// 3. Check rule compliance (block if hard violations)
// 4. Route to expert (if substantial)
// 5. Route to capsule (if task class matches)
// 6. Determine discovery level
// 7. Recall relevant memories
// 8. Load contexts in priority order
// 9. Match relevant skills
// 10. Assemble everything within token budget

export function isSubstantialTask(request: string): boolean;
// Determines if a task warrants full workflow:
// - Length > 100 characters
// - Contains multi-step indicators ("and then", "after that", "first...then")
// - Contains complexity indicators ("refactor", "redesign", "migrate", "integrate")
// - Likely touches 3+ files
// - Likely spans multiple subsystems
```

**Module: prompt-assembler.ts**

```typescript
export function assemblePrompt(
  assembly: PromptAssembly
): string;
// Renders the full cognitive context as structured markdown.
// Assembly order (non-negotiable — this is what makes Noesis think better than agent-workflow):
//
// ## Cognitive Reasoning Framework          ← FIRST: shapes HOW the agent thinks (from reasoning-scaffold.ts)
//   {RPUCRAE-VL protocol}
//   {Cognitive Discipline}
//   {Adaptive Communication}
//   {Quality Standards}
//
// ## Locked Decisions                       ← SECOND: non-negotiable constraints
// {decisions from context}
//
// ## Active Rules                           ← THIRD: behavioral constraints with "why"
// {formatted rules by priority/confidence}
//
// ## Expert Guidance                        ← FOURTH: domain specialist framing
// {expert definition, scope, anti-patterns, grading}
//
// ## Task Class (Capsule)                   ← FIFTH: task-class operating pack
// {assembled capsule: intent, assembly, anti-patterns, critic, grader}
//
// ## Failure Predictions                    ← SIXTH: preemptive warnings
// {predicted failure modes from similar past tasks}
//
// ## Relevant Memories                      ← SEVENTH: retrieved context
// {memories from hybrid retrieval}
//
// ## Active Context                         ← EIGHTH: project state
// {context files by priority}
//
// ## Available Skills                       ← NINTH: workflow patterns
// {matched skill definitions}
//
// ## Prompt Shape                           ← LAST: the actual task
// GOAL: {goal}
// CONTEXT: {context}
// CONSTRAINTS: {constraints}
// DELIVERABLE: {deliverable}
// VALIDATION: {validation}

export function assembleWithBudget(
  assembly: PromptAssembly,
  tokenBudget: number
): { prompt: string; truncated: string[]; tokenCount: number };
// Assembles with strict token budget enforcement
// Uses PROMPT_ASSEMBLY_PRIORITY to determine what to cut
// Returns list of what was truncated
```

**Module: discovery-levels.ts**

```typescript
export function assessDiscoveryLevel(
  promptShape: PromptShape,
  memories: Memory[],
  codebaseExplored: boolean
): DiscoveryAssessment;
// Level 0: Similar past tasks found with high-confidence outcomes → pattern extension
// Level 1: Approach known but specific details needed → quick verification
// Level 2: Multiple options, new integration, multiple subsystems → standard research
// Level 3: Long-term architecture, shared abstractions, cross-provider → architectural

export function formatDiscoveryGuidance(assessment: DiscoveryAssessment): string;
// Human-readable guidance for the selected discovery level
```

**Acceptance criteria:**
- Full orchestration produces coherent assembly from all cognitive entities
- Token budget strictly enforced with priority-based truncation
- Substantial task detection correctly identifies tasks needing full workflow
- Discovery level assessment informed by memory (similar past tasks → lower level)
- Assembly format is structured markdown injectable into any adapter's context

**Estimated new tests:** 60

---

### Phase 7: Quality Gates (Enhanced)

**Goal:** Evidence-backed readiness, output quality gates for creative/API work, and repo-capability-derived verification.

**Depends on:** Phases 0-5

**Files to create:**
- `src/cognitive/gates/readiness-gate.ts`
- `src/cognitive/gates/output-quality-gate.ts`
- `src/cognitive/gates/verification-gate.ts`

**Module: readiness-gate.ts** (replaces `src/workflow/readiness.ts`)

```typescript
export function computeEvidenceBackedReadiness(
  input: ReadinessInput,
  memoryContext: {
    similarPastTasks: Memory[];
    pastReadinessScores: { score: number; outcome: MemoryOutcome }[];
    relevantFailures: Memory[];
    relevantAntiPatterns: AntiPatternDefinition[];
  }
): ReadinessScore;
// Enhanced scoring:
// - Base scoring (same 5 dimensions as current)
// - Memory boost: past successes with similar tasks boost confidence
// - Failure penalty: past failures with similar tasks increase required threshold
// - Anti-pattern awareness: relevant anti-patterns boost risk dimension
// - Historical correlation: if tasks with score X tend to succeed/fail, adjust threshold

export function getHistoricalReadinessCorrelation(
  db: DB,
  projectId?: string
): { averagePassedScore: number; averageFailedScore: number; correlation: number };
// Returns historical correlation between readiness scores and outcomes
```

**Module: output-quality-gate.ts**

```typescript
export function checkCreativeGate(
  input: {
    objective?: string;
    audience?: string;
    visual_direction?: string;
    references?: string[];
    banned_patterns?: string[];
    success_criteria?: string[];
  }
): { passed: boolean; missing: string[] };
// Checks all 6 creative gate requirements are present

export function checkApiGate(
  input: {
    contract_target?: string;
    reference_examples?: string[];
    edge_cases?: string[];
    verification_plan?: string;
  }
): { passed: boolean; missing: string[] };
// Checks all 4 API gate requirements are present

export function shouldApplyQualityGate(
  taskDescription: string,
  capsuleId: string | null
): 'creative' | 'api' | null;
// Determines if quality gate applies based on task type and capsule
```

**Module: verification-gate.ts**

```typescript
export function detectVerificationCapabilities(
  projectRoot: string
): {
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun';
  availableScripts: Record<string, string>;
  preferredOrder: string[];
  aggregateCommand: string | null;
};
// Detects from package.json scripts and Makefile targets

export function createVerificationPlan(
  capabilities: ReturnType<typeof detectVerificationCapabilities>
): { steps: { command: string; description: string; blocking: boolean }[] };
// Creates ordered verification plan from detected capabilities
```

**Acceptance criteria:**
- Readiness gate uses memory evidence to adjust scoring
- Historical readiness-to-outcome correlation tracked
- Creative gate enforces 6 required inputs before creative work
- API gate enforces 4 required inputs before API work
- Verification detection finds actual repo capabilities
- All gates have effectiveness tracking

**Estimated new tests:** 50

---

### Phase 8: Active Learning Loop

**Goal:** Multi-target writeback that updates rules, experts, capsules, skills, and contexts — not just passive memory.

**Depends on:** Phases 1-5

**Files to create:**
- `src/cognitive/learning/active-learning.ts`
- `src/cognitive/learning/correction-detector.ts`
- `src/cognitive/learning/failure-classifier.ts`
- `src/cognitive/learning/writeback-engine.ts`
- `src/cognitive/learning/effectiveness-tracker.ts`
- `src/cognitive/learning/predictive-failure.ts`

**Module: correction-detector.ts**

```typescript
export function detectCorrection(
  userMessage: string,
  previousOutput: string | null
): { detected: boolean; type: 'explicit' | 'implicit' | null; signal: string };
// Explicit: "no", "wrong", "don't", "instead", "not that", "actually"
// Implicit: user repeats request with different phrasing, user undoes changes

export function detectRepeatedFailure(
  db: DB,
  taskDescription: string,
  failureClass: FailureClass,
  windowHours?: number
): { repeated: boolean; count: number; relatedIds: string[] };
// Checks if same failure class occurred 3+ times in time window
```

**Module: failure-classifier.ts**

```typescript
export function classifyFailure(
  description: string,
  context: {
    phase: ReasoningPhase;
    hadReadiness: boolean;
    hadExpert: boolean;
    hadCapsule: boolean;
    hadRules: boolean;
  }
): { failureClass: FailureClass; confidence: number; rationale: string };
// Maps failure context to one of 6 classes:
// - context_assembly: relevant context was available but not loaded
// - planning: plan was incomplete or wrong
// - tool_use: wrong tool or tool misuse
// - verification: verification was inadequate
// - creative_taste: output didn't match user preferences
// - api_contract: API contract was wrong or incomplete
```

**Module: writeback-engine.ts**

```typescript
export function writebackToRules(
  db: DB,
  failureClass: FailureClass,
  evidence: { description: string; memoryIds: string[] },
  sign: SignFn
): { action: 'new_rule' | 'modified_rule' | 'none'; ruleId?: string };
// If systemic pattern (3+ similar failures without covering rule): propose new rule
// If existing rule should have caught this: propose rule modification
// All proposals go to draft status

export function writebackToContexts(
  db: DB,
  failureClass: FailureClass,
  lesson: { trigger: string; miss: string; rootCause: string; prevention: string },
  projectId: string | null,
  sign: SignFn
): void;
// Appends to failure_patterns and lessons_learned contexts

export function writebackToExpert(
  db: DB,
  expertId: string,
  outcome: 'success' | 'failure' | 'partial',
  failureClass?: FailureClass
): void;
// Updates expert performance tracking

export function writebackToCapsule(
  db: DB,
  capsuleId: string,
  componentType: CapsuleComponentType,
  addition: string,
  sign: SignFn
): void;
// Adds to capsule component (e.g., new anti-pattern to anti_patterns component)
```

**Module: active-learning.ts**

```typescript
export function processLearningEvent(
  db: DB,
  event: {
    trigger: LearningTriggerType;
    description: string;
    rootCause: string;
    preventionRule: string;
    failureClass: FailureClass;
    phase: ReasoningPhase;
    expertId?: string;
    capsuleId?: string;
    ruleIds?: string[];
    memoryIds?: string[];
  },
  sign: SignFn
): {
  lessonCreated: string;
  ruleAction: 'new_rule' | 'modified_rule' | 'none';
  contextsUpdated: ContextType[];
  expertUpdated: boolean;
  capsuleUpdated: boolean;
};
// Full multi-target learning pipeline:
// 1. Capture lesson (existing learning-loop.ts)
// 2. Classify failure
// 3. Writeback to rules (if systemic)
// 4. Writeback to contexts (always)
// 5. Writeback to expert (if expert was involved)
// 6. Writeback to capsule (if capsule was involved)
// 7. Record effectiveness of involved rules/experts/capsules
```

**Module: predictive-failure.ts**

```typescript
export function predictFailureModes(
  db: DB,
  taskDescription: string,
  embedding: Buffer | null
): { predictions: { failureClass: FailureClass; likelihood: number; evidence: string; prevention: string }[] };
// Before execution:
// 1. Embed task description
// 2. Find similar past tasks in memory
// 3. Filter for tasks that failed
// 4. Group by failure class
// 5. Return likely failure modes with prevention rules

export function getPreventiveGuidance(
  predictions: ReturnType<typeof predictFailureModes>['predictions']
): string;
// Formats predictions as actionable warnings for the agent
```

**Module: effectiveness-tracker.ts**

```typescript
export function trackGateEffectiveness(
  db: DB,
  gateType: 'readiness' | 'output_quality' | 'verification',
  passed: boolean,
  taskOutcome: 'success' | 'failure' | 'partial'
): void;
// Records gate pass/fail against eventual task outcome

export function getGateEffectiveness(
  db: DB,
  gateType: string
): { passRate: number; falsePassRate: number; falseBlockRate: number };
// false_pass: gate passed but task failed
// false_block: gate blocked but task would have succeeded (estimated)

export function suggestGateAdjustment(
  effectiveness: ReturnType<typeof getGateEffectiveness>
): { action: 'tighten' | 'relax' | 'none'; rationale: string };
// If false_pass > 20%: tighten
// If false_block > 30%: relax
```

**Acceptance criteria:**
- Corrections detected from user messages (explicit and implicit)
- Failures classified into 6 classes with evidence
- Writeback engine updates rules, contexts, experts, and capsules
- Predictive failure detection surfaces likely failure modes before execution
- Gate effectiveness tracked and adjustment suggestions generated
- Repeated failure detection triggers systemic writeback

**Estimated new tests:** 80

---

### Phase 9: GSD Execution Engine (Full Parity + Memory Extension)

**Goal:** Full parity with agent-workflow's GSD system (34 commands, 6 agents, all execution modes) extended with memory-aware transitions, cross-session persistence, and predictive planning.

**Depends on:** Phases 0-8

**Files to create:**
- `src/cognitive/execution/gsd-engine.ts`
- `src/cognitive/execution/phase-executor.ts`
- `src/cognitive/execution/checkpoint-manager.ts`
- `src/cognitive/execution/wave-scheduler.ts`
- `src/cognitive/execution/debug-state.ts`
- `src/cognitive/execution/milestone-manager.ts`
- `src/cognitive/execution/todo-manager.ts`
- `src/cognitive/execution/codebase-mapper.ts`
- `src/cognitive/execution/plan-checker.ts`
- `src/cognitive/execution/integration-checker.ts`
- `src/cognitive/execution/settings-manager.ts`

**Module: gsd-engine.ts**

```typescript
// --- Project Lifecycle ---

export function createProject(
  db: DB,
  projectId: string,
  description: string,
  options: {
    mode?: 'interactive' | 'auto';        // interactive: deep questioning, auto: extract from doc
    sign: SignFn;
    recall: RecallFn;                      // Memory-aware: recall similar past projects
  }
): ExecutionState;
// Full project initialization:
// 1. Questioning phase (or auto-extract from description)
// 2. Research phase (optional — recall similar past projects from memory)
// 3. Requirements generation with REQ-IDs
// 4. Roadmap generation with goal-backward phase mapping
// 5. State initialization
// Memory extension: recalls similar past projects and surfaces their roadmap patterns,
// failure points, and successful architecture decisions.

export function discussPhase(
  db: DB,
  projectId: string,
  phaseNumber: number,
  discussion: string
): void;
// Pre-planning discussion that creates CONTEXT.md for the phase.
// User constraints captured here are FIRST content in phase research.

// --- Phase Planning ---

export function planPhase(
  db: DB,
  projectId: string,
  phaseNumber: number,
  options?: {
    skipResearch?: boolean;
    skipVerify?: boolean;
    gaps?: boolean;                        // Gap closure mode
    revision?: boolean;                    // Revision mode from checker feedback
    recall?: RecallFn;                     // Memory-aware planning
  }
): ExecutionState;
// Full planning flow:
// 1. Research (discovery level calibrated by memory of similar phases)
// 2. Plan — creates PLAN with tasks, must-haves (truths, artifacts, key_links), dependencies
// 3. Check — plan checker verifies goal coverage (8 dimensions)
// Memory extension: recalls how similar phases were planned in past projects,
// surfaces common pitfalls, and pre-loads relevant anti-patterns.
// Max 3 revision loops (0 initial + 2 revisions) before requiring human input.

// --- Phase Execution ---

export function executePhase(
  db: DB,
  projectId: string,
  phaseNumber: number,
  options?: {
    gapsOnly?: boolean;                    // Only run gap-closure plans
    mode?: 'standard' | 'auto';           // standard: stop at checkpoints, auto: auto-approve
    recall?: RecallFn;
  }
): ExecutionState;
// Full execution flow:
// 1. Group plans by wave (frontmatter wave assignment)
// 2. Execute waves sequentially
// 3. Within wave: tasks can be parallel
// 4. Per-task: TDD support (tdd="true" → RED → GREEN → REFACTOR with commits)
// 5. Track deviations (rules 1-3 auto-fix, rule 4 ask)
// 6. Handle checkpoints (human_verify, decision, human_action)
// 7. Commit per task: {type}({phase}-{plan}): {description}
// 8. Verify phase goal after completion (3-level: exists, substantive, wired)
// Memory extension: during execution, surfaces relevant memories when encountering
// similar code patterns or error messages.

// --- Quick Mode ---

export function quickTask(
  db: DB,
  projectId: string,
  description: string,
  sign: SignFn
): ExecutionState;
// Small ad-hoc tasks with GSD guarantees, skipping optional agents.
// Spawns planner + executor only. Tracks in quick/ subdirectory.
// Uses ~30% context. Updates STATE, not ROADMAP.

// --- State Management ---

export function getProjectState(db: DB, projectId: string): ExecutionState | null;
export function updateProjectState(db: DB, id: string, updates: Partial<ExecutionState>): void;
export function resumeWork(db: DB, projectId: string, recall: RecallFn): {
  state: ExecutionState;
  memories: Memory[];
  nextAction: string;
};
// Resume from STATE with context restoration via memory recall.

export function pauseWork(db: DB, projectId: string, sign: SignFn): void;
// Create .continue-here file with current state for session continuity.

export function getProgress(db: DB, projectId: string): {
  phases: { number: number; name: string; status: ExecutionStatus }[];
  currentPhase: number;
  completedRequirements: string[];
  remainingRequirements: string[];
  nextAction: string;
};
// Visual progress summary with requirement coverage.
```

**Module: milestone-manager.ts**

```typescript
export function createMilestone(
  db: DB,
  projectId: string,
  name: string,
  description: string,
  sign: SignFn
): string;
// Start new milestone (brownfield: mirrors new-project flow).

export function completeMilestone(
  db: DB,
  projectId: string,
  milestoneId: string,
  version: string,
  sign: SignFn
): void;
// Archive completed milestone, prepare for next.

export function auditMilestone(
  db: DB,
  projectId: string,
  milestoneId: string
): { passed: boolean; gaps: string[]; coverage: number };
// Audit completion against original intent and requirements.

export function planMilestoneGaps(
  db: DB,
  projectId: string,
  milestoneId: string,
  sign: SignFn
): ExecutionState;
// Create phases to close audit gaps.

// --- Roadmap Management ---

export function addPhase(db: DB, projectId: string, description: string, sign: SignFn): void;
export function insertPhase(db: DB, projectId: string, afterPhase: number, description: string, sign: SignFn): void;
export function removePhase(db: DB, projectId: string, phaseNumber: number): void;
```

**Module: todo-manager.ts**

```typescript
export function addTodo(db: DB, projectId: string, description: string, sign: SignFn): string;
export function listTodos(db: DB, projectId: string, area?: string): { id: string; description: string; status: string }[];
export function completeTodo(db: DB, todoId: string): void;
```

**Module: codebase-mapper.ts**

```typescript
export function mapCodebase(
  db: DB,
  projectId: string,
  focus: 'tech' | 'arch' | 'quality' | 'concerns',
  sign: SignFn
): string;
// Creates analysis documents: STACK.md, ARCHITECTURE.md, STRUCTURE.md,
// CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md.
// Memory extension: cross-references findings with memories from past
// codebase analyses to surface recurring patterns and known issues.
```

**Module: plan-checker.ts**

```typescript
export function checkPlan(
  db: DB,
  projectId: string,
  phaseNumber: number,
  planId: string
): { passed: boolean; issues: PlanIssue[] };
// 8 verification dimensions:
// 1. Requirement Coverage (every requirement has task(s))
// 2. Task Completeness (Files, Action, Verify, Done present)
// 3. Dependency Correctness (no cycles, valid references)
// 4. Key Links Planned (artifacts wired, not isolated)
// 5. Scope Sanity (2-3 tasks/plan good, 5+ blocker)
// 6. Verification Derivation (truths are user-observable)
// 7. Context Compliance (honors user decisions from CONTEXT.md)
// 8. Memory Compliance (doesn't repeat known failure patterns)  ← NEW: memory-backed
```

**Module: integration-checker.ts**

```typescript
export function checkIntegration(
  db: DB,
  projectId: string,
  phaseNumber: number
): { passed: boolean; orphans: string[]; missingConnections: string[]; brokenFlows: string[] };
// Cross-phase integration verification:
// 1. Build export/import map from phase summaries
// 2. Verify all exports are imported and used
// 3. Check all API routes have consumers
// 4. Verify auth protection on sensitive routes
// 5. Trace E2E flows (auth, data display, form submission)
// 6. Requirements Integration Map (per-requirement wiring status)
```

**Module: settings-manager.ts**

```typescript
export function getSettings(db: DB, projectId: string): GsdSettings;
export function updateSettings(db: DB, projectId: string, settings: Partial<GsdSettings>): void;
export function setProfile(db: DB, projectId: string, profile: 'quality' | 'balanced' | 'budget'): void;
// Profiles:
// quality: Opus everywhere except verification
// balanced: Opus for planning, Sonnet for execution/verification
// budget: Sonnet for writing, Haiku for research/verification

interface GsdSettings {
  researcher: boolean;      // Enable phase researcher
  plan_check: boolean;      // Enable plan checker
  verifier: boolean;        // Enable post-execution verifier
  profile: 'quality' | 'balanced' | 'budget';
  mode: 'interactive' | 'auto';
}
```

**Module: checkpoint-manager.ts**

```typescript
export function createCheckpoint(
  db: DB,
  executionId: string,
  checkpoint: ExecutionCheckpoint
): void;

export function resolveCheckpoint(
  db: DB,
  executionId: string,
  checkpointIndex: number,
  resolution?: string
): void;

export function getUnresolvedCheckpoints(
  db: DB,
  executionId: string
): ExecutionCheckpoint[];

export function shouldBlockExecution(
  checkpoints: ExecutionCheckpoint[]
): { blocked: boolean; reason: string };
// human_action and decision checkpoints block until resolved
// human_verify blocks in standard mode, auto-resolves in auto mode
```

**Module: debug-state.ts**

```typescript
export function createDebugSession(
  db: DB,
  projectId: string,
  slug: string,
  symptoms: string[]
): DebugState;

export function addHypothesis(
  db: DB,
  projectId: string,
  slug: string,
  hypothesis: DebugHypothesis
): void;

export function updateHypothesisResult(
  db: DB,
  projectId: string,
  slug: string,
  hypothesisIndex: number,
  result: 'confirmed' | 'rejected' | 'inconclusive',
  evidence: string[]
): void;

export function resolveDebug(
  db: DB,
  projectId: string,
  slug: string,
  rootCause: string,
  fixDescription: string
): void;

export function getActiveDebugSession(
  db: DB,
  projectId: string
): DebugState | null;
// Returns active (non-resolved) debug session if any
// Persists across context resets — survives /clear
```

**Acceptance criteria:**
- Project lifecycle management (create, plan, execute, verify)
- Phase execution with wave-based scheduling
- Checkpoint protocol with blocking semantics
- Deviation tracking with 4-rule system (auto-fix + ask)
- Debug state persists across sessions
- Memory-aware transitions (recall relevant experiences during execution)
- Execution state stored in database (not markdown)

**Estimated new tests:** 70

---

### Phase 10: Session & Continuity

**Goal:** Cross-session semantic continuity with sessions, handoffs, artifact management, and decision fidelity.

**Depends on:** Phases 0, 5

**Files to create:**
- `src/cognitive/continuity/session-manager.ts`
- `src/cognitive/continuity/handoff-manager.ts`
- `src/cognitive/continuity/artifact-manager.ts`
- `src/cognitive/continuity/decision-fidelity.ts`

**Module: session-manager.ts**

```typescript
export function startSession(
  db: DB,
  projectId: string,
  topic: string,
  sign: SignFn
): { sessionId: string; state: SessionState };
// Creates session memory + context state entry

export function endSession(
  db: DB,
  sessionId: string,
  summary: string,
  sign: SignFn
): void;
// Archives session, creates session memory, updates session_index context

export function resumeSession(
  db: DB,
  sessionId: string,
  recall: RecallFn
): { state: SessionState; relevantMemories: Memory[]; workingSet: string[] };
// Retrieves session state + recalls relevant memories + loads working set

export function createSessionCheckpoint(
  db: DB,
  sessionId: string,
  state: Partial<SessionState>,
  sign: SignFn
): void;
// Mid-session checkpoint for context pressure management
```

**Module: handoff-manager.ts**

```typescript
export function createHandoff(
  db: DB,
  handoff: {
    sourceAgent: string;
    targetAgent: string;
    reason: 'context_limit' | 'session_end' | 'tool_switch' | 'explicit_transfer';
    stateSummary: string;
    memoryRefs: string[];
    activeWorkingSet: string[];
    blockers: string[];
    nextAction: string;
  },
  sign: SignFn
): string;
// Creates rich handoff artifact with full context

export function resumeFromHandoff(
  db: DB,
  handoffId: string,
  recall: RecallFn
): { handoff: Handoff; memories: Memory[]; contexts: ContextEntry[] };
// Loads handoff + referenced memories + relevant contexts
```

**Module: artifact-manager.ts**

```typescript
export function getWorkingSet(
  db: DB,
  projectId: string
): { intake: string[]; plan: string[]; research: string[]; session: string[]; handoff: string[] };
// Returns current working set from project state context

export function persistWorkingSet(
  db: DB,
  projectId: string,
  workingSet: Record<string, string[]>,
  sign: SignFn
): void;
// Persists working set to state context

export function suggestArtifacts(
  db: DB,
  projectId: string,
  taskDescription: string,
  recall: RecallFn
): string[];
// Returns smallest set of artifacts needed for the task
// Priority: explicit references > state working set > recent matching artifacts
```

**Module: decision-fidelity.ts**

```typescript
export function checkDecisionFidelity(
  db: DB,
  proposedAction: string,
  projectId?: string
): { compliant: boolean; violations: { decision: string; conflict: string }[] };
// Checks proposed action against locked decisions
// Returns violations if any locked decision would be overridden

export function isDeferred(
  db: DB,
  idea: string,
  projectId?: string
): boolean;
// Checks if an idea is in the deferred list

export function documentDiscretion(
  db: DB,
  decision: string,
  rationale: string,
  projectId: string | null,
  sign: SignFn
): void;
// Records a discretionary decision with rationale
```

**Acceptance criteria:**
- Session lifecycle (start, checkpoint, end, resume) with memory persistence
- Handoff protocol with full context transfer
- Working set management with smallest-set artifact suggestion
- Decision fidelity checking prevents overriding locked decisions
- Deferred idea checking prevents pulling in out-of-scope work
- All continuity operations create audit log entries

**Estimated new tests:** 60

---

### Phase 11: Adversarial Critic (Enhanced)

**Goal:** 7-dimension adversarial critique with structured severity levels, evidence requirements, and iteration limits.

**Depends on:** Phases 0, 3

**Files to modify:**
- `src/workflow/critic.ts` — Major enhancement

**Enhanced critic capabilities:**

```typescript
export function evaluateResearch(
  researchArtifact: string,
  codebaseContext: string,
  memories: Memory[]
): CriticFeedback;
// 7 research dimensions:
// 1. Assumption scan — are assumptions stated and testable?
// 2. Evidence level audit — is evidence concrete (file:line, URL) or vague?
// 3. Counterevidence search — what contradicts the findings?
// 4. Codebase accuracy — do file references match actual codebase?
// 5. Gaps — what's missing that should be covered?
// 6. Implementation implications — what are the consequences?
// 7. Pre-flight failures — what would fail immediately?

export function evaluatePlan(
  planArtifact: string,
  codebaseContext: string,
  memories: Memory[],
  capsule: AssembledCapsule | null
): CriticFeedback;
// 7 plan dimensions:
// 1. Codebase reality check — does the plan match actual code structure?
// 2. Dependency availability — are all dependencies available?
// 3. Edge case mining — what edge cases are unhandled?
// 4. Approach validity — is the approach sound?
// 5. Pre-mortem — what could go wrong?
// 6. Scope realism — is the scope achievable?
// 7. Required sections — are all required sections present?

export function evaluateOutput(
  output: string,
  taskContext: { promptShape: PromptShape; capsule: AssembledCapsule | null },
  memories: Memory[]
): CriticFeedback;
// Capsule-specific evaluation if capsule present
// Anti-pattern matching with memory-backed patterns
// Quality scoring against grader criteria

// Enhanced severity with evidence requirements:
// BLOCKING: only with concrete evidence (file:line, URL, test output)
// WARNING: when evidence is ambiguous but concern is real
// ADVISORY: suggestions for improvement

// Iteration limit:
// Max 3 critique cycles
// After 3rd cycle with remaining blockers → HUMAN JUDGMENT REQUIRED
```

**Acceptance criteria:**
- Research critique evaluates 7 dimensions
- Plan critique evaluates 7 dimensions
- BLOCKING findings require concrete evidence
- Max 3 iteration cycles enforced
- Capsule-specific critique when capsule is present
- Memory-informed critique (past findings for similar tasks)

**Estimated new tests:** 50

---

### Phase 12: Integration & Wiring

**Goal:** Connect all cognitive modules to existing Noesis infrastructure (RPC, CLI, adapters, events).

**Depends on:** Phases 0-11

**Files to modify:**
- `src/daemon/rpc.ts` — Add cognitive RPC methods
- `src/cli/index.ts` — Add cognitive CLI commands
- `src/adapters/base-adapter.ts` — Enhanced context assembly with cognitive entities
- `src/daemon/events.ts` — Add cognitive event types
- `src/daemon/server.ts` — Initialize cognitive modules on daemon start

**RPC methods:** See [Section 7](#7-new-rpc-methods).
**CLI commands:** See [Section 8](#8-new-cli-commands).

**Adapter enhancement:**

```typescript
// Enhanced context assembly in base-adapter.ts
// Current: persona → conventions → projectContext → memories → skills → antiPatterns
// New:     decisions → rules → expert → capsule → failure_patterns → memories → skills → contexts → anti_patterns
// (Following PROMPT_ASSEMBLY_PRIORITY)
```

**Event types to add:**

```typescript
// Cognitive events
'rule_matched'          // Rule triggered for a task
'rule_violated'         // Rule compliance violation
'rule_evolved'          // Rule modified by learning loop
'expert_routed'         // Task routed to expert
'expert_outcome'        // Expert task completed
'capsule_matched'       // Task matched to capsule
'capsule_assembled'     // Capsule dynamically assembled
'skill_invoked'         // Skill invoked
'context_updated'       // Context file updated
'quality_gate_checked'  // Quality gate evaluated
'learning_writeback'    // Learning loop wrote back to cognitive entity
'prediction_generated'  // Predictive failure detection ran
'checkpoint_created'    // Execution checkpoint created
'deviation_recorded'    // Execution deviation recorded
'session_started'       // Session lifecycle event
'session_ended'
'handoff_created'
```

**Acceptance criteria:**
- All new RPC methods registered and functional
- All new CLI commands registered and functional
- Adapter context assembly uses cognitive entities
- Event bus emits cognitive events
- Daemon initializes cognitive modules (inserts built-ins if first run)

**Estimated new tests:** 80

---

### Phase 13: Testing & Validation

**Goal:** Comprehensive testing of the entire cognitive architecture.

**Depends on:** Phase 12

**Test files to create:**

```
src/__tests__/cognitive/
├── rules/
│   ├── rule-engine.test.ts
│   ├── rule-store.test.ts
│   ├── rule-compliance.test.ts
│   ├── rule-writer.test.ts
│   └── built-in-rules.test.ts
├── experts/
│   ├── expert-registry.test.ts
│   ├── expert-router.test.ts
│   ├── expert-store.test.ts
│   ├── expert-tracker.test.ts
│   └── built-in-experts.test.ts
├── capsules/
│   ├── capsule-engine.test.ts
│   ├── capsule-store.test.ts
│   ├── capsule-assembly.test.ts
│   └── built-in-capsules.test.ts
├── skills/
│   ├── skill-registry.test.ts
│   ├── skill-store.test.ts
│   ├── skill-matcher.test.ts
│   └── built-in-skills.test.ts
├── context/
│   ├── context-engine.test.ts
│   ├── context-store.test.ts
│   ├── context-pressure.test.ts
│   └── built-in-contexts.test.ts
├── prompt/
│   ├── prompt-engine.test.ts
│   ├── prompt-assembler.test.ts
│   └── discovery-levels.test.ts
├── gates/
│   ├── readiness-gate.test.ts
│   ├── output-quality-gate.test.ts
│   └── verification-gate.test.ts
├── learning/
│   ├── active-learning.test.ts
│   ├── correction-detector.test.ts
│   ├── failure-classifier.test.ts
│   ├── writeback-engine.test.ts
│   ├── effectiveness-tracker.test.ts
│   └── predictive-failure.test.ts
├── execution/
│   ├── gsd-engine.test.ts
│   ├── phase-executor.test.ts
│   ├── checkpoint-manager.test.ts
│   ├── wave-scheduler.test.ts
│   └── debug-state.test.ts
├── continuity/
│   ├── session-manager.test.ts
│   ├── handoff-manager.test.ts
│   ├── artifact-manager.test.ts
│   └── decision-fidelity.test.ts
└── integration/
    ├── cognitive-pipeline.test.ts       # Full pipeline: request → assembly → execution
    ├── learning-writeback.test.ts       # Failure → writeback → improved behavior
    ├── cross-session-continuity.test.ts # Session → handoff → resume
    └── evidence-backed-readiness.test.ts # Memory-backed readiness scoring
```

**Integration test scenarios:**

1. **Full cognitive pipeline:** Raw request → prompt optimization → rule matching → expert routing → capsule selection → readiness gate → plan → execution → verification → learning
2. **Learning writeback cycle:** Task fails → correction detected → failure classified → writeback to rule + context → next similar task benefits from correction
3. **Cross-session continuity:** Start session → work → create checkpoint → end session → start new session → resume from checkpoint → all context restored
4. **Evidence-backed readiness:** Store 10 past task outcomes → new similar task → readiness gate adjusts based on historical correlation
5. **Predictive failure:** Store 5 similar past failures → new similar task → failure predictions surfaced before execution
6. **Rule evolution:** 3 similar failures without covering rule → new rule proposed → rule confirmed → next similar task caught by rule

**Performance benchmarks:**

| Operation | Target |
|---|---|
| Rule matching (14 rules) | < 10ms |
| Expert routing (37 experts) | < 15ms |
| Capsule matching (7 capsules) | < 5ms |
| Skill matching (17 skills) | < 10ms |
| Context assembly (13 types) | < 20ms |
| Full prompt orchestration | < 100ms |
| Readiness gate with memory | < 50ms |
| Predictive failure detection | < 50ms |
| Learning writeback (multi-target) | < 100ms |

**Estimated new tests:** 200+ (integration scenarios are multi-step)

---

## 6. Database Schema

New tables added to `src/core/schema.ts`:

```sql
-- Rule cards
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_conditions TEXT NOT NULL,      -- JSON
  constraints TEXT NOT NULL,             -- JSON
  enforcement TEXT NOT NULL DEFAULT 'soft',
  thresholds TEXT,                       -- JSON
  interactions TEXT,                     -- JSON
  version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 0.5,
  outcome_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  embedding BLOB,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Expert agent definitions
CREATE TABLE IF NOT EXISTS experts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL,
  domain TEXT NOT NULL,
  category TEXT NOT NULL,
  trigger_conditions TEXT NOT NULL,       -- JSON
  scope TEXT NOT NULL,                    -- JSON {can: [], cannot: []}
  deliverables TEXT NOT NULL,             -- JSON
  anti_patterns TEXT,                     -- JSON
  grading_criteria TEXT,                  -- JSON
  tools TEXT,                            -- JSON
  model_preference TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  task_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.5,
  content TEXT NOT NULL,
  embedding BLOB,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Deep capsule definitions
CREATE TABLE IF NOT EXISTS deep_capsules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_patterns TEXT NOT NULL,         -- JSON
  version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  match_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.5,
  embedding BLOB,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Capsule components (7 per capsule)
CREATE TABLE IF NOT EXISTS capsule_components (
  id TEXT PRIMARY KEY,
  capsule_id TEXT NOT NULL,
  component_type TEXT NOT NULL,
  content TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (capsule_id) REFERENCES deep_capsules(id) ON DELETE CASCADE,
  UNIQUE(capsule_id, component_type)
);

-- Executable skills
CREATE TABLE IF NOT EXISTS executable_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  trigger_conditions TEXT NOT NULL,       -- JSON
  anti_patterns TEXT,                    -- JSON
  rules TEXT,                            -- JSON
  chain_with TEXT,                       -- JSON
  version TEXT NOT NULL DEFAULT '1.0.0',
  enabled INTEGER NOT NULL DEFAULT 1,
  invocation_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.5,
  content TEXT NOT NULL,
  embedding BLOB,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Dynamic context state
CREATE TABLE IF NOT EXISTS context_state (
  id TEXT PRIMARY KEY,
  context_type TEXT NOT NULL,
  project_id TEXT,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(context_type, project_id)
);

-- GSD execution state
CREATE TABLE IF NOT EXISTS execution_state (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  milestone TEXT,
  phase_number INTEGER NOT NULL,
  plan_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_task INTEGER,
  total_tasks INTEGER,
  wave INTEGER DEFAULT 1,
  checkpoints TEXT,                      -- JSON
  deviations TEXT,                       -- JSON
  debug_state TEXT,                      -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Cognitive outcome tracking (rules, experts, capsules, skills, gates)
CREATE TABLE IF NOT EXISTS cognitive_outcomes (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  task_description TEXT NOT NULL,
  outcome TEXT NOT NULL,
  failure_class TEXT,
  evidence TEXT,
  correction TEXT,
  created_at TEXT NOT NULL
);

-- Command definitions
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  argument_hint TEXT,
  allowed_tools TEXT,                    -- JSON
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rules_category ON rules(category);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
CREATE INDEX IF NOT EXISTS idx_experts_category ON experts(category);
CREATE INDEX IF NOT EXISTS idx_experts_enabled ON experts(enabled);
CREATE INDEX IF NOT EXISTS idx_capsule_components_capsule ON capsule_components(capsule_id);
CREATE INDEX IF NOT EXISTS idx_skills_category ON executable_skills(category);
CREATE INDEX IF NOT EXISTS idx_context_type_project ON context_state(context_type, project_id);
CREATE INDEX IF NOT EXISTS idx_execution_project ON execution_state(project_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_outcomes_entity ON cognitive_outcomes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_outcomes_created ON cognitive_outcomes(created_at);
```

---

## 7. New RPC Methods

Added to `src/daemon/rpc.ts`:

| Method | Params | Returns | Description |
|---|---|---|---|
| `orchestrate` | `{ request, project_id?, token_budget? }` | `PromptAssembly` | Full cognitive orchestration for a task |
| `checkCompliance` | `{ task_context }` | `RuleComplianceResult[]` | Check task against active rules |
| `routeExpertCognitive` | `{ task, keywords?, prefer_category? }` | `ExpertMatch[]` | Route to domain expert with memory |
| `matchCapsuleDeep` | `{ prompt_shape }` | `AssembledCapsule \| null` | Match and assemble deep capsule |
| `matchSkills` | `{ task, category?, max? }` | `{ skill, score }[]` | Find relevant skills |
| `getContexts` | `{ project_id?, types? }` | `ContextEntry[]` | Get context files |
| `updateContext` | `{ type, project_id?, content }` | `void` | Update context file |
| `checkReadinessEvidence` | `{ input, project_id? }` | `ReadinessScore` | Evidence-backed readiness |
| `checkQualityGate` | `{ type, input }` | `{ passed, missing }` | Creative/API quality gate |
| `predictFailures` | `{ task, project_id? }` | `{ predictions }` | Predictive failure detection |
| `processLearning` | `{ event }` | `{ lesson, actions }` | Multi-target learning writeback |
| `createGsdProject` | `{ project_id, description }` | `ExecutionState` | Create GSD project |
| `executeGsdPhase` | `{ project_id, phase }` | `ExecutionState` | Execute GSD phase |
| `getGsdState` | `{ project_id }` | `ExecutionState` | Get execution state |
| `startSessionCognitive` | `{ project_id, topic }` | `{ session_id, state }` | Start session with context |
| `createHandoff` | `{ handoff }` | `string` | Create rich handoff |
| `resumeHandoff` | `{ handoff_id }` | `{ handoff, memories, contexts }` | Resume from handoff |
| `checkDecisionFidelity` | `{ action, project_id? }` | `{ compliant, violations }` | Decision fidelity check |
| `listRules` | `{ category?, enabled? }` | `RuleDefinition[]` | List rules |
| `listExperts` | `{ category?, enabled? }` | `ExpertDefinition[]` | List experts |
| `listCapsules` | `{ enabled? }` | `DeepCapsuleDefinition[]` | List deep capsules |
| `detectVerification` | `{ project_root }` | `{ capabilities }` | Detect verification capabilities |
| `critiqueResearch` | `{ artifact, codebase_context }` | `CriticFeedback` | 7-dimension research critique |
| `critiquePlan` | `{ artifact, codebase_context }` | `CriticFeedback` | 7-dimension plan critique |

---

## 8. New CLI Commands

Added to `src/cli/index.ts`:

### Cognitive Commands

```bash
# Rule management
noesis rules list [--category <cat>]       # List active rules
noesis rules show <name>                   # Show rule details
noesis rules compliance <task>             # Check task against rules
noesis rules confirm <id>                  # Confirm draft rule
noesis rules archive <id>                  # Archive rule

# Expert management
noesis experts list [--category <cat>]     # List experts
noesis experts show <name>                 # Show expert details
noesis experts route <task>                # Route task to expert
noesis experts performance <name>          # Show expert performance

# Deep capsule management
noesis capsules list                       # List capsules
noesis capsules show <name>               # Show capsule with components
noesis capsules match <task>              # Match task to capsule
noesis capsules assemble <name> <task>    # Assemble capsule for task

# Skill management
noesis skills list [--category <cat>]     # List skills
noesis skills show <name>                 # Show skill details
noesis skills match <task>                # Match task to skills

# Context management
noesis context list [--project <id>]      # List context files
noesis context show <type> [--project <id>] # Show context content
noesis context update <type> <content>    # Update context content

# Orchestration
noesis orchestrate <request>              # Full cognitive orchestration
noesis predict <task>                     # Predictive failure detection

# GSD execution
noesis gsd new <project> <description>   # Create GSD project
noesis gsd plan <project> <phase>        # Plan phase
noesis gsd execute <project> <phase>     # Execute phase
noesis gsd verify <project> <phase>      # Verify phase
noesis gsd progress <project>            # Show progress
noesis gsd debug <project> [issue]       # Debug with persistent state
noesis gsd resume <project>              # Resume from state

# Session & continuity
noesis handoff create <args>             # Create rich handoff
noesis handoff resume <id>               # Resume from handoff
noesis decision check <action>           # Check decision fidelity
noesis decision list [--project <id>]    # List locked decisions

# Quality gates
noesis readiness <task> [--project <id>] # Evidence-backed readiness
noesis quality-gate <type> <input>       # Creative/API quality gate

# Learning
noesis learn <event>                     # Process learning event
noesis effectiveness [--gate <type>]     # Show gate effectiveness
```

---

## 9. File Manifest

### New Files (57 source files)

```
src/cognitive/types.ts                          # Cognitive type definitions

src/cognitive/rules/rule-engine.ts              # Rule matching and loading
src/cognitive/rules/rule-store.ts               # Rule CRUD
src/cognitive/rules/rule-compliance.ts           # Compliance checking
src/cognitive/rules/rule-writer.ts              # Learning writeback to rules
src/cognitive/rules/built-in-rules.ts           # 14 built-in rules

src/cognitive/experts/expert-registry.ts         # Expert lifecycle
src/cognitive/experts/expert-router.ts           # Task-to-expert routing
src/cognitive/experts/expert-store.ts            # Expert CRUD
src/cognitive/experts/expert-tracker.ts          # Performance tracking
src/cognitive/experts/built-in-experts.ts        # 37 built-in experts

src/cognitive/capsules/capsule-engine.ts         # Capsule matching and lifecycle
src/cognitive/capsules/capsule-store.ts          # Capsule CRUD
src/cognitive/capsules/capsule-assembly.ts       # Dynamic assembly
src/cognitive/capsules/built-in-capsules.ts      # 7 built-in capsules

src/cognitive/skills/skill-registry.ts           # Skill lifecycle
src/cognitive/skills/skill-store.ts              # Skill CRUD
src/cognitive/skills/skill-matcher.ts            # Semantic matching
src/cognitive/skills/built-in-skills.ts          # 17 built-in skills

src/cognitive/context/context-engine.ts          # Context assembly
src/cognitive/context/context-store.ts           # Context CRUD
src/cognitive/context/context-pressure.ts        # Pressure management
src/cognitive/context/built-in-contexts.ts       # 13 context templates

src/cognitive/prompt/prompt-engine.ts            # Reasoning orchestration
src/cognitive/prompt/prompt-assembler.ts         # Token-budget assembly
src/cognitive/prompt/reasoning-scaffold.ts       # Dynamic cognitive reasoning framework
src/cognitive/prompt/discovery-levels.ts         # Research depth calibration

src/cognitive/gates/readiness-gate.ts            # Evidence-backed readiness
src/cognitive/gates/output-quality-gate.ts       # Creative/API quality gate
src/cognitive/gates/verification-gate.ts         # Repo-derived verification

src/cognitive/learning/active-learning.ts        # Multi-target learning
src/cognitive/learning/correction-detector.ts    # Correction detection
src/cognitive/learning/failure-classifier.ts     # Failure classification
src/cognitive/learning/writeback-engine.ts       # Multi-target writeback
src/cognitive/learning/effectiveness-tracker.ts  # Gate effectiveness
src/cognitive/learning/predictive-failure.ts     # Predictive failure detection

src/cognitive/execution/gsd-engine.ts            # Full GSD lifecycle (34 command parity)
src/cognitive/execution/phase-executor.ts        # Phase execution
src/cognitive/execution/checkpoint-manager.ts    # Checkpoint protocol
src/cognitive/execution/wave-scheduler.ts        # Wave-based parallelism
src/cognitive/execution/debug-state.ts           # Persistent debug state
src/cognitive/execution/milestone-manager.ts     # Milestone lifecycle + roadmap mgmt
src/cognitive/execution/todo-manager.ts          # TODO capture and tracking
src/cognitive/execution/codebase-mapper.ts       # Memory-aware codebase analysis
src/cognitive/execution/plan-checker.ts          # 8-dimension plan verification
src/cognitive/execution/integration-checker.ts   # Cross-phase wiring verification
src/cognitive/execution/settings-manager.ts      # GSD settings and model profiles

src/cognitive/continuity/session-manager.ts      # Session lifecycle
src/cognitive/continuity/handoff-manager.ts      # Rich handoffs
src/cognitive/continuity/artifact-manager.ts     # Working set management
src/cognitive/continuity/decision-fidelity.ts    # Decision enforcement

src/cognitive/commands/command-registry.ts        # Command definitions
src/cognitive/commands/command-store.ts           # Command CRUD
src/cognitive/commands/built-in-commands.ts       # Core commands
```

### Modified Files (6)

```
src/types.ts                    # Export cognitive types
src/constants.ts                # Add cognitive constants
src/core/schema.ts              # Add cognitive tables
src/daemon/rpc.ts               # Add cognitive RPC methods
src/daemon/events.ts            # Add cognitive event types
src/adapters/base-adapter.ts    # Enhanced context assembly
```

### New Test Files (~45)

See Phase 13 test file listing.

### Totals

| Category | Count |
|---|---|
| New source files | 54 |
| New test files | ~50 |
| Modified source files | 7 |
| New database tables | 8 |
| New RPC methods | 23 |
| New CLI commands | ~35 |
| Built-in rules | 14 (with full "why" rationale) |
| Built-in experts | 37 (with performance tracking) |
| Built-in capsules (deep) | 7 (with 7 components each) |
| Built-in skills | 17 (with chaining) |
| Built-in context types | 13 |
| Reasoning scaffold | 1 (dynamic, ~1100-1500 tokens, surpasses system.md) |
| GSD commands (full parity) | 34 |
| Estimated new tests | ~900 |

---

## 10. Testing Strategy

### Unit Tests
- Every module function has unit tests
- In-memory SQLite for database tests
- Mock embedding provider for vector tests
- Mock LLM provider for synthesis tests
- Test both happy path and error cases

### Integration Tests
- Full cognitive pipeline (request → assembly → execution → learning)
- Learning writeback cycle (failure → correction → improved behavior)
- Cross-session continuity (session → handoff → resume)
- Evidence-backed readiness (memory-informed scoring)
- Predictive failure detection (similar past failures → warnings)
- Rule evolution (repeated failures → new rule proposed)

### Performance Tests
- All operations meet benchmarks from Phase 13
- No regression on existing benchmarks
- Database query plans validated for new tables

### Security Tests
- All cognitive entities signed with HMAC
- Secret scanning on cognitive entity content
- Audit logging for all cognitive CRUD operations
- Path validation on all file operations
- No cognitive entity can bypass security invariants

---

## 11. Success Criteria

### Functional
- [ ] All 14 agent-workflow rules enforced in Noesis
- [ ] All 37 agent-workflow experts routable in Noesis
- [ ] All 7 capsules have full 7-component structure
- [ ] Core skills invocable with semantic matching
- [ ] 13 context types functional with per-project overrides
- [ ] Full reasoning orchestration produces coherent assembly
- [ ] Evidence-backed readiness uses memory for scoring
- [ ] Output quality gate enforces creative/API differentiation
- [ ] Active learning loop writes back to rules, experts, capsules, contexts
- [ ] Predictive failure detection surfaces warnings before execution
- [ ] GSD execution engine manages phase-based projects
- [ ] Session/handoff continuity preserves full context
- [ ] Decision fidelity prevents overriding locked decisions
- [ ] All gates have effectiveness tracking

### Performance
- [ ] Full orchestration < 100ms
- [ ] All individual operations meet benchmarks
- [ ] No regression on existing test suite

### Quality
- [ ] All new code has unit tests
- [ ] Integration tests cover 6 key scenarios
- [ ] All cognitive entities covered by HMAC signing
- [ ] All cognitive CRUD covered by audit logging
- [ ] TypeScript strict mode with no `any` types

### Intelligence Superiority Over Agent-Workflow
- [ ] Rules are memory-backed with effectiveness tracking (agent-workflow: static markdown)
- [ ] Expert routing is performance-informed (agent-workflow: keyword only)
- [ ] Capsules are dynamically assembled with memories (agent-workflow: static files)
- [ ] Learning loop writes back to multiple targets (agent-workflow: writes to context files only)
- [ ] Readiness gate uses historical evidence (agent-workflow: self-assessment only)
- [ ] Predictive failure detection exists (agent-workflow: no equivalent)
- [ ] Quality gates self-improve (agent-workflow: static criteria)
- [ ] All entities have semantic retrieval (agent-workflow: file-path loading only)
- [ ] Cross-session continuity uses hybrid retrieval (agent-workflow: markdown files)
- [ ] Rule evolution proposes new rules from patterns (agent-workflow: manual rule creation only)

---

## Dependency Graph

```
Phase 0: Cognitive Foundation
    │
    ├── Phase 1: Rule Engine
    ├── Phase 2: Expert Agent System
    ├── Phase 3: Deep Capsule System
    ├── Phase 4: Skill System
    └── Phase 5: Context Engine
            │
            ├── Phase 6: Prompt Orchestration Engine (depends on 1-5)
            ├── Phase 7: Quality Gates (depends on 0, 5)
            ├── Phase 8: Active Learning Loop (depends on 1-5)
            └── Phase 10: Session & Continuity (depends on 0, 5)
                    │
                    ├── Phase 9: GSD Execution Engine (depends on 0-8)
                    ├── Phase 11: Adversarial Critic (depends on 0, 3)
                    └── Phase 12: Integration & Wiring (depends on 0-11)
                            │
                            └── Phase 13: Testing & Validation (depends on 12)
```

Phases 1-5 can be implemented in parallel.
Phases 7, 8, 10, 11 can be partially parallelized.
Phases 9, 12, 13 are sequential.

---

## Implementation Priority

| Priority | Phases | Rationale |
|---|---|---|
| **P0** | 0, 1, 6 | Foundation + rules + orchestration = minimum viable cognitive architecture |
| **P1** | 2, 3, 5 | Experts + capsules + contexts = full task intelligence |
| **P2** | 4, 7, 8 | Skills + gates + learning = self-improving system |
| **P3** | 9, 10, 11 | GSD + continuity + critic = execution discipline |
| **P4** | 12, 13 | Integration + testing = production readiness |
