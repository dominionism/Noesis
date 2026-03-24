# NOESIS — Superintelligence Workflow Architecture & Implementation Plan

**Version:** 1.0.0
**Created:** 2026-03-14
**Derived from:** UAWL ARCHITECTURE.md v1.0, UAWL IMPLEMENTATION.md v1.0, agent-workflow v1.0.0, 13-point Advanced Research Notes
**Purpose:** Make noesis the definitive superintelligence workflow system — surpassing both UAWL and agent-workflow by merging the best of each, then extending beyond either with novel capabilities.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [What Already Exists](#3-what-already-exists)
4. [Gap Analysis: UAWL Completion](#4-gap-analysis-uawl-completion)
5. [Gap Analysis: Agent-Workflow Integration](#5-gap-analysis-agent-workflow-integration)
6. [Novel Intelligence Layers](#6-novel-intelligence-layers)
7. [Cross-Agent Distribution Model](#7-cross-agent-distribution-model)
8. [Security Architecture](#8-security-architecture)
9. [Implementation Phases](#9-implementation-phases)
10. [Acceptance Criteria & Ship Checklist](#10-acceptance-criteria--ship-checklist)
11. [Design Principles](#11-design-principles)

---

## 1. Executive Summary

Noesis is a persistent, cross-agent intelligence system that gives every CLI-based coding agent access to:

- **Memory** — three-tier storage (hot markdown, warm SQLite+FTS5+vector, cold JSONL) with hybrid retrieval, graph-aware re-ranking, and HMAC integrity
- **Learning** — automatic pattern detection, skill/anti-pattern synthesis, Bayesian confidence tracking, and evidence-backed lesson capture
- **Workflow** — structured execution (Research → Plan → Implement → Validate), readiness gates, evidence-backed critique, goal-backward verification, and deviation tracking
- **Intelligence** — strategy simulation, environment modeling, cognitive profiling, context economy, meta-reasoning, and continuous self-evaluation
- **Distribution** — tool-agnostic adapters for Claude Code, Cursor, Copilot, Aider, Codex, OpenCode, Antigravity, OpenClaw, and any future CLI agent

### Why noesis surpasses its predecessors

| Capability | UAWL | Agent-Workflow | Noesis |
|---|---|---|---|
| Persistent memory with hybrid retrieval | Full | None (markdown-only) | Full + enhanced graph |
| Knowledge graph with typed edges | Full | None | Full + causal chains |
| Security (HMAC, secret scanning, audit) | Full | None | Full |
| Structured workflow execution (RPI) | None | Full | Full + memory-integrated |
| Evidence-backed critique | None | Full (7 dimensions) | Full + anti-pattern aware |
| Goal-backward verification | None | Full (3 levels) | Full + historical regression |
| Expert agent routing | None | Full (9 specialists) | Full + skill-aware routing |
| Session continuity + handoffs | Basic (checkpoint memories) | Full (sessions + handoffs) | Full + cross-agent lineage |
| Learning loops (pattern → skill) | Full (4 loops) | Partial (lesson capture only) | Full + synthetic experience |
| Capsule-based context assembly | None | Full | Full + memory-enriched |
| Deviation tracking | None | Full (4 rules) | Full + anti-pattern guard |
| Strategy simulation | None | None | **Novel** |
| Environment/world model | None | None | **Novel** |
| Cognitive profiling | None | Partial (user-taste) | **Novel** |
| Context economy | None | None | **Novel** |
| Meta-reasoning | None | None | **Novel** |
| Temporal relevance modeling | None | None | **Novel** |
| Continuous self-evaluation | None | None | **Novel** |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NOESIS DAEMON                                │
│  JSON-RPC 2.0 over Unix Domain Socket (~/.agents/noesis.sock)       │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    INTELLIGENCE CORE                          │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │  │
│  │  │   Memory     │  │  Learning   │  │   Workflow Engine     │  │  │
│  │  │   Engine     │  │  Engine     │  │                      │  │  │
│  │  │             │  │             │  │  Prompt Optimizer     │  │  │
│  │  │  Hot/Warm/  │  │  Clustering │  │  Readiness Gate      │  │  │
│  │  │  Cold Tiers │  │  Synthesis  │  │  RPI Orchestrator    │  │  │
│  │  │  Hybrid     │  │  Feedback   │  │  Critic System       │  │  │
│  │  │  Retrieval  │  │  Lessons    │  │  Verification Engine │  │  │
│  │  │  Graph Walk │  │             │  │  Deviation Tracker   │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────┬───────────┘  │  │
│  │         │                │                     │              │  │
│  │  ┌──────┴────────────────┴─────────────────────┴───────────┐  │  │
│  │  │               NOVEL INTELLIGENCE LAYERS                 │  │  │
│  │  │                                                         │  │  │
│  │  │  Strategy Simulator  │  Environment Model               │  │  │
│  │  │  Task Planner        │  Knowledge Distiller             │  │  │
│  │  │  Model Router        │  Cognitive Profiler              │  │  │
│  │  │  Context Economist   │  Self-Evaluator                  │  │  │
│  │  │  Friction Detector   │  Temporal Modeler                │  │  │
│  │  │  Meta-Reasoner       │  Experience Synthesizer          │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    SECURITY LAYER                             │  │
│  │  HMAC-SHA256 │ Secret Scanner │ Dangerous Patterns │ Audit   │  │
│  │  Path Validation │ Permission Enforcement │ Invariants (7)   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    DATA LAYER                                 │  │
│  │  SQLite+WAL │ FTS5 │ sqlite-vec │ Knowledge Graph │ JSONL   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    ADAPTER LAYER                              │  │
│  │  Claude Code │ Cursor │ Copilot │ Aider │ Codex │ OpenCode  │  │
│  │  Antigravity │ OpenClaw │ Generic                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
~/.agents/
├── noesis.sock             # Daemon socket
├── db.sqlite               # Warm memory (SQLite + FTS5 + sqlite-vec)
├── .signing_key            # HMAC-SHA256 key (0400)
├── config.yaml             # System configuration
├── audit.log               # Append-only security audit log
├── persona.md              # Hot memory: user identity
├── memory/                 # Hot memory tier (markdown)
│   ├── index.md
│   ├── patterns.md
│   ├── preferences.md
│   ├── solutions.md
│   └── projects/
├── skills/                 # Synthesized skills (draft/approved lifecycle)
├── conventions/            # Code conventions
├── context/                # Stack/architecture context
├── cold/                   # Cold storage (JSONL with rotation)
├── backups/                # Daily DB backup
├── models/                 # ONNX embedding model
├── inbox/                  # Write-back inbox from adapters
│   └── learning.jsonl
├── capsules/               # Task-class operating packs (NEW)
├── workflow/               # Workflow state and artifacts (NEW)
│   ├── plans/              # Active and archived plans
│   ├── research/           # Research artifacts
│   ├── sessions/           # Session checkpoints
│   ├── handoffs/           # Cross-agent handoffs
│   ├── debug/              # Persistent debug state files
│   └── deviations/         # Deviation tracking logs
├── profiles/               # Cognitive profiles (NEW)
├── simulations/            # Strategy simulation logs (NEW)
├── adapters/               # Provider-specific adapter configs
├── agents/                 # Agent definitions (shared across providers)
├── commands/               # Command definitions (shared across providers)
├── rules/                  # Reusable workflow policy
├── scripts/                # Helper scripts
└── hooks/                  # Background monitoring hooks
```

---

## 3. What Already Exists

Noesis currently has 44 source files implementing the core UAWL architecture. These represent a solid foundation that does NOT need to be rewritten — they need to be completed and extended.

### Fully Implemented (from UAWL)

| Module | Files | Status |
|--------|-------|--------|
| **Types** | `types.ts` (949 lines) | Complete — single source of truth for all type definitions |
| **Constants** | `constants.ts` (315 lines) | Complete — all paths, limits, thresholds, permissions |
| **Config** | `config.ts` | Complete — YAML config with safe deep merge |
| **Database** | `core/database.ts`, `core/schema.ts`, `core/ulid.ts`, `core/memory-crud.ts` | Complete — SQLite+WAL, schema v1+v2, full CRUD |
| **Embedding** | `embedding/arctic.ts`, `embedding/cache.ts`, `embedding/provider.ts` | Complete — Arctic Embed-S ONNX with LRU cache |
| **Retrieval** | `retrieval/hybrid.ts`, `retrieval/scoring.ts`, `retrieval/filters.ts`, `retrieval/graph-rerank.ts`, `retrieval/gap-analysis.ts`, `retrieval/action-advisory.ts`, `retrieval/explain.ts` | Complete — 8-step hybrid retrieval with full observability |
| **Memory** | `memory/hot.ts`, `memory/cold.ts`, `memory/write-pipeline.ts`, `memory/conflict.ts`, `memory/partitioning.ts`, `memory/templates.ts`, `memory/triggers.ts` | Complete — full write pipeline, conflict detection, triggers |
| **Graph** | `graph/causal.ts`, `graph/confidence-propagation.ts`, `graph/edges.ts`, `graph/integrity.ts`, `graph/traversal.ts` | Complete — causal chains, confidence propagation, typed edges |
| **Intelligence** | `intelligence/learning-loop.ts`, `intelligence/clustering.ts`, `intelligence/skill-synthesis.ts`, `intelligence/antipattern-synthesis.ts`, `intelligence/feedback.ts`, `intelligence/metrics.ts` | Complete — 4-loop learning system |
| **Security** | `security/hmac.ts`, `security/secret-scanner.ts`, `security/audit.ts`, `security/dangerous-patterns.ts`, `security/path-validation.ts`, `security/permissions.ts` | Complete — all 7 invariants |
| **Workflow (partial)** | `workflow/critic.ts`, `workflow/readiness.ts`, `workflow/prompt-optimizer.ts` | Partial — critic, readiness gate, prompt optimizer exist |

### Not Yet Implemented

| Module | Status | Priority |
|--------|--------|----------|
| **Daemon** (`daemon/server.ts`, `rpc.ts`, `events.ts`, `socket.ts`, `client.ts`) | Missing | P0 — required for production use |
| **Adapters** (`adapters/interface.ts`, `managed-sections.ts`, `context-budget.ts`, individual adapters) | Missing | P0 — required for tool integration |
| **CLI** (`cli/index.ts`, 22+ commands) | Missing | P0 — user-facing interface |
| **Workflow Engine** (RPI orchestrator, verification, deviation tracker) | Missing | P0 — core differentiator |
| **Novel Intelligence Layers** (13 layers from research) | Missing | P1 — surpass both predecessors |
| **Tests** | Missing | P0 — required for correctness |

---

## 4. Gap Analysis: UAWL Completion

These are UAWL features defined in ARCHITECTURE.md and IMPLEMENTATION.md that noesis needs to complete. The existing code is the foundation — these fill the remaining gaps.

### 4.1 Daemon Architecture (UAWL Phase 7)

**What:** Persistent Node.js daemon process that keeps ONNX sessions warm and SQLite connections open.

**Implementation:**

```
src/daemon/
├── server.ts        # Daemon lifecycle, auto-exit after 10min idle
├── rpc.ts           # JSON-RPC 2.0 handler with full method registry
├── events.ts        # Push-based event notification (7 event types)
├── socket.ts        # Unix domain socket at ~/.agents/noesis.sock
└── client.ts        # Client for CLI/adapters, auto-starts daemon
```

**Key specs:**
- Cold start: <870ms (ONNX load 400-700ms, schema check ~70ms, hot memory ~5ms)
- Memory footprint: 80-125MB
- Auto-exit: 10 minutes idle
- Degraded modes: 5 scenarios (daemon crash, DB corruption, ONNX failure, disk exhaustion, key loss)
- Event types: `memory_written`, `memory_conflict_detected`, `skill_promoted`, `skill_archived`, `anti_pattern_created`, `checkpoint_available`, `integrity_violation`

**RPC Methods:**
- Memory: `noesis.recall`, `noesis.remember`, `noesis.forget`, `noesis.retrievalGap`, `noesis.checkAction`, `noesis.explain`
- Session: `noesis.sessionStart`, `noesis.sessionEnd`, `noesis.sessionList`
- Sync: `noesis.sync`, `noesis.subscribe`
- Workflow (NEW): `noesis.planCreate`, `noesis.planStatus`, `noesis.scoreReadiness`, `noesis.critique`, `noesis.verify`, `noesis.routeExpert`

### 4.2 Adapter Framework (UAWL Phase 8-9)

**What:** Pure transform functions that produce declarative output. Core validates and executes all I/O.

**Implementation:**

```
src/adapters/
├── interface.ts          # Adapter interface and types
├── managed-sections.ts   # Managed section markers with hash verification
├── context-budget.ts     # Token budget management per tool
├── sandbox.ts            # Sandboxed filesystem query (read-only)
├── claude-code.ts        # 50,000 token budget, full context
├── cursor.ts             # 8,000 token budget, compressed
├── copilot.ts            # 4,000 token budget, minimal
├── aider.ts              # 20,000 token budget, moderate
├── codex.ts              # NEW — Codex CLI adapter
├── opencode.ts           # NEW — OpenCode adapter
├── antigravity.ts        # NEW — Antigravity/Gemini adapter
├── openclaw.ts           # NEW — OpenClaw adapter
└── generic.ts            # Configurable, stdout/file output
```

**Enhancement over UAWL:** 9 adapters instead of 5. Token budgets and format bridges derived from agent-workflow's manifest.json adapter capability matrix.

### 4.3 CLI Layer (UAWL Phase 10)

**What:** 30+ CLI commands covering memory, workflow, learning, and operations.

**Implementation:**

```
src/cli/
├── index.ts              # CLI entry point (commander-based)
└── commands/
    ├── init.ts           # First-time setup
    ├── quickstart.ts     # Interactive onboarding
    ├── import-config.ts  # Import from existing tool configs
    ├── sync.ts           # Bidirectional adapter sync
    ├── remember.ts       # Store memory through write pipeline
    ├── correct.ts        # Store correction as lesson memory
    ├── recall.ts         # Search with hybrid retrieval
    ├── check.ts          # Action advisory (anti-patterns, incidents)
    ├── gap.ts            # Retrieval gap analysis
    ├── explain.ts        # Full retrieval scoring breakdown
    ├── forget.ts         # Remove memory
    ├── learn.ts          # Run pattern detection + synthesis
    ├── skills.ts         # Manage skills and anti-patterns
    ├── status.ts         # System health and metrics
    ├── audit.ts          # Query audit log
    ├── gc.ts             # Garbage collect (never automatic)
    ├── project.ts        # Project management and isolation
    ├── handoff.ts        # Cross-agent handoff protocol
    ├── migrate-embeddings.ts  # Re-embed with new model
    ├── repair.ts         # Repair signing key or database
    ├── export.ts         # Full backup
    ├── import.ts         # Restore from backup
    # --- NEW commands from workflow integration ---
    ├── plan.ts           # Create/status/iterate plans (RPI)
    ├── research.ts       # Research current state
    ├── critique.ts       # Run evidence-backed critique
    ├── verify.ts         # Goal-backward verification
    ├── session.ts        # Session start/status/pause/resume
    ├── route.ts          # Expert agent routing
    ├── optimize.ts       # Prompt optimization
    └── simulate.ts       # Strategy simulation (novel)
```

---

## 5. Gap Analysis: Agent-Workflow Integration

These are the capabilities from agent-workflow that noesis must absorb. The key insight: agent-workflow's strengths are in **workflow orchestration, critique, verification, and execution discipline**. These complement UAWL's strengths in **memory, learning, and security**.

### 5.1 RPI Workflow Engine

**Source:** agent-workflow's `workflow-router.md`, `gsd-planner.md`, `gsd-executor.md`, `gsd-verifier.md`

**What:** Hard-gated workflow enforcement: Optimize → Research → Score Readiness → Plan → Implement → Validate.

**Why this matters:** UAWL has a readiness gate but no structured workflow around it. Agent-workflow has a full RPI pipeline but no persistent memory to inform it. Merging them creates a workflow that gets smarter over time.

**Implementation:**

```
src/workflow/
├── prompt-optimizer.ts     # EXISTS — enhance with capsule routing
├── readiness.ts            # EXISTS — enhance with workflow scoring
├── critic.ts               # EXISTS — enhance with 7 evidence-backed dimensions
├── rpi-orchestrator.ts     # NEW — full RPI pipeline orchestration
├── plan-engine.ts          # NEW — goal-backward planning with memory enrichment
├── verification-engine.ts  # NEW — 3-level goal-backward verification
├── deviation-tracker.ts    # NEW — 4-rule deviation tracking during execution
├── checkpoint-protocol.ts  # NEW — 3-type checkpoints (human-verify, decision, human-action)
└── capsule-router.ts       # NEW — task-class capsule selection and loading
```

**Key design decisions:**

**5.1.1 RPI Orchestrator**
The orchestrator manages the full lifecycle:

```
1. INTAKE: Receive raw user request
2. OPTIMIZE: Extract structured prompt shape (existing prompt-optimizer.ts)
   - Enhancement: Route to capsule when task-class matches
   - Enhancement: Enrich with memory context (existing enrichWithMemories)
3. RESEARCH: Gather current state from codebase + memory
   - Query noesis.recall for relevant memories
   - Query noesis.checkAction for anti-pattern warnings
   - Query noesis.retrievalGap for coverage analysis
4. SCORE: Run readiness gate (existing readiness.ts)
   - Enhancement: If score < 70, return gaps with specific questions
   - Enhancement: Memory boosts from past successes/failures (already implemented)
5. PLAN: Create decision-complete plan
   - Enhancement: Plan engine uses memory-retrieved skills and anti-patterns
   - Enhancement: Critique plan against 7 dimensions
6. IMPLEMENT: Execute plan phase-by-phase
   - Enhancement: Deviation tracker applies 4 rules during execution
   - Enhancement: Per-task commit protocol with metadata tracking
7. VALIDATE: Goal-backward verification
   - Enhancement: 3-level artifact checking (exists, substantive, wired)
   - Enhancement: Compare against anti-patterns from memory
```

**5.1.2 Evidence-Backed Critique System**

Enhances the existing `critic.ts` from simple anti-pattern matching to the full 7-dimension system from agent-workflow:

**Research Critique Dimensions:**
1. Assumption verification (grep/search for hedged claims)
2. Evidence level audit (declared vs actual evidence)
3. Counterevidence search (search for known pitfalls)
4. Codebase accuracy spot-check (verify file:line claims)
5. Gap scan (security, performance, compatibility, migration)
6. Implementation implications (specific enough for planners?)
7. Pre-flight failures (top 3 failure modes)

**Plan Critique Dimensions:**
1. Codebase reality check (files exist, patterns present)
2. Dependency availability (required libs in manifest)
3. Edge case mining (failure mid-phase, malformed input, concurrency, auth)
4. Approach validity (search for known pitfalls)
5. Pre-mortem (top 5 implementation failures)
6. Scope realism (>10 files = warning, >20 = blocking)
7. Required sections audit

**Enhancement over agent-workflow:** The critic ALSO checks retrieved anti-patterns and past incidents from noesis memory. A critic dimension that overlaps with a known anti-pattern gets elevated severity.

**Blocking criteria:**
- BLOCKING: Concrete evidence (wrong path, missing section, contradicted assumption)
- WARNING: Ambiguous evidence, incomplete treatment
- ADVISORY: Observations not requiring changes

**Iteration bounds:** Max 2 revision cycles. After 2 revisions with blocking issues: `HUMAN JUDGMENT REQUIRED`.

**5.1.3 Goal-Backward Verification Engine**

From agent-workflow's `gsd-verifier.md`:

Three-level verification per artifact:
1. **Exists** — File/resource is present
2. **Substantive** — Not a stub (line count, pattern checks for `return null`, `=> {}`, `console.log only`)
3. **Wired** — Actually imported/used elsewhere (not orphaned)

Key-link verification:
- Component → API (calls + response handling)
- API → DB (query + result return)
- Form → Handler (handler + API invocation)
- State → Render (state declaration + render usage)

**Enhancement over agent-workflow:** Verification results feed into noesis memory as `verification` type memories. Failed verifications trigger lesson capture. Patterns of verification failure across projects become anti-patterns.

**5.1.4 Deviation Tracking**

From agent-workflow's `gsd-executor.md`:

| Rule | Trigger | Action | Scope |
|------|---------|--------|-------|
| 1: Auto-Fix Bugs | Code doesn't work as intended | Fix immediately | Current task only |
| 2: Auto-Add Critical | Missing essential features (auth, validation, error handling) | Add immediately | Current task only |
| 3: Auto-Fix Blocking | Something prevents completing current task | Fix immediately | Current task only |
| 4: Ask Architecture | Fix requires significant structural change | STOP and ask | Always |

Limits: After 3 auto-fix attempts on same task → STOP, document, continue.
Tracking: All deviations logged as `[Rule N - Type] description` in deviation log.

**Enhancement over agent-workflow:** Deviations are stored as noesis memories. Patterns of deviation across projects become anti-patterns or skills. A project that repeatedly triggers Rule 2 (missing auth) gets a readiness gate boost for the "constraints" dimension when auth-related tasks are attempted.

### 5.2 Expert Agent Routing

**Source:** agent-workflow's `agent-catalog.md`, `expert-agent-router.md`, `expert-agent-routing-tools.mjs`

**What:** Route substantial workflow-system tasks to narrow-scope specialist experts.

**Implementation:**

```
src/workflow/expert-routing.ts    # NEW — pattern-matching route classifier
```

**The 9+ Workflow Experts:**
1. **continuity-manager** — Sessions, handoffs, runtime state
2. **workflow-router-auditor** — RPI gate compliance, readiness evidence
3. **critique-responder** — Critique-to-fix mapping
4. **artifact-gatekeeper** — Artifact promotion decisions
5. **adapter-parity-auditor** — Cross-CLI capability matrix
6. **eval-engineer** — Scenario-based regression tests
7. **trace-grader** — Trajectory quality, delegation drift
8. **failure-analyst** — Diagnosis, lesson extraction
9. **tooling-integrator** — MCP, approvals, helper script integration

**Enhancement over agent-workflow:** Expert routing consults noesis memory to select the right expert. If the memory store has many `lesson` memories about verification failures in the current project, the router elevates `eval-engineer` priority. Routing decisions are logged as `agent_routing_log` entries (already in noesis schema v2).

### 5.3 Session Continuity + Handoff Infrastructure

**Source:** agent-workflow's `session-tools.mjs`, `session-start.md`, `create-handoff.md`

**What:** Lightweight sessions for pause/resume; rich handoffs for deliberate transfer.

**Implementation:**

```
src/workflow/session-manager.ts     # NEW — session lifecycle management
src/workflow/handoff-protocol.ts    # NEW — cross-agent handoff packaging
```

**Session types:**
- **Lightweight session:** Project-local, records position/artifacts/blockers/next-action
- **Rich handoff:** Cross-agent, includes learnings/references/structured expectations

**Enhancement over agent-workflow:** Sessions and handoffs are backed by noesis `session` and `checkpoint` type memories (already defined in schema). Cross-agent lineage uses `memory_edges` with `part_of` and `created_during` relations (already defined). The difference: agent-workflow stores sessions as markdown files; noesis stores them as structured memories with embeddings, enabling retrieval of relevant past sessions when starting new work in the same area.

### 5.4 Capsule-Based Context Assembly

**Source:** agent-workflow's `capsules/` directory

**What:** Pre-packaged context assembly for quality-sensitive task classes.

**Implementation:**

```
src/workflow/capsule-router.ts     # NEW — capsule selection and loading
```

**Capsule structure:**
```
capsules/<task-class>/
├── intent.md           # When to use this capsule
├── assembly.md         # What context to load
├── examples/           # Reference examples
├── anti-patterns.md    # Domain-specific anti-patterns
├── critic.md           # Custom critique rules
├── grader.md           # Evaluation criteria
└── memory-policy.md    # Advisory memory recall preferences
```

**Initial capsules:**
- `api-workflow` — API design, integration, contract-heavy backend
- `creative-redesign` — Redesigns, visual refresh, anti-generic creative work
- `security-hardening` — NEW: Security audit, vulnerability remediation
- `performance-optimization` — NEW: Performance profiling, bottleneck resolution
- `migration` — NEW: Database migrations, API version upgrades, framework migrations

**Enhancement over agent-workflow:** Capsule anti-patterns are MERGED with noesis anti-pattern memories. When the `api-workflow` capsule loads, it also queries noesis memory for project-specific API anti-patterns. Capsule critic rules are combined with the general critic system. Capsule memory policies influence retrieval filters during the task.

### 5.5 Persistent Debug State Protocol

**Source:** agent-workflow's `gsd-debugger.md`

**What:** Debug sessions that survive context resets through persistent file state.

**Implementation:**

```
src/workflow/debug-protocol.ts     # NEW — debug file lifecycle management
```

**Debug file structure:**
```markdown
---
status: gathering | investigating | fixing | verifying | resolved
trigger: [verbatim user input]
created: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Focus
hypothesis: [current theory]
test: [how testing it]
expecting: [what result means]
next_action: [immediate next step]

## Symptoms (IMMUTABLE after gathering)
## Eliminated (APPEND ONLY)
## Evidence (APPEND ONLY)
## Resolution
```

**Update protocol:**
- Update BEFORE action (not after) — context reset mid-action shows intended next step
- `status`: OVERWRITE on transitions
- `Current Focus`: OVERWRITE before every action
- `Symptoms`: IMMUTABLE after gathering phase
- `Eliminated`: APPEND ONLY (prevents re-investigating dead ends)
- `Evidence`: APPEND ONLY
- `Resolution`: OVERWRITE as understanding evolves

**Enhancement over agent-workflow:** Completed debug sessions are stored as noesis `lesson` type memories with the root cause, evidence chain, and eliminated hypotheses. Future debug sessions in the same area auto-retrieve relevant past debug resolutions. Eliminated hypotheses from past sessions prevent the same dead ends.

### 5.6 Learning Loop Enhancement

**Source:** agent-workflow's `lesson-tools.mjs`, `learning-loop.md`, `failure-analyst.md`

**What:** Systematic lesson capture with evidence, failure classification, and confidence levels.

**Integration with existing noesis learning loops:**

Noesis already has 4 learning loops:
1. Memory Accumulation (triggers → structured memories)
2. Pattern Detection (Union-Find clustering)
3. Skill/Anti-Pattern Synthesis (LLM-assisted)
4. Bayesian Feedback Refinement

**Enhancement:** Add a 5th loop — **Evidence-Backed Lesson Capture**:

```
Loop 5: Evidence-Backed Lesson Capture
  Trigger: User correction, critic rejection, eval failure, repeated misses
  Process:
    1. Classify failure type (context_assembly, planning, tool_use, verification, creative, api_contract)
    2. Diagnose root cause with evidence
    3. Extract reusable rule
    4. Store as lesson memory with confidence level
    5. Create causal edges to originating task memories
    6. Update relevant skill/anti-pattern confidence
    7. If systemic, surface workflow improvement suggestion
```

**Failure classification taxonomy:**
| Class | Description |
|-------|-------------|
| context_assembly | Wrong or missing context loaded before work |
| planning | Plan was incomplete, wrong approach, missing edge cases |
| tool_use | Wrong tool, wrong parameters, misunderstanding of API |
| verification | Tests missed, wrong assertions, incomplete coverage |
| creative | Output was generic, off-brand, lacked specificity |
| api_contract | API schema mismatch, wrong endpoint, missing auth |

---

## 6. Novel Intelligence Layers

These are the 13 advanced capabilities from the research notes that neither UAWL nor agent-workflow possess. They represent the path to genuine superintelligence.

### 6.1 Strategy Simulation Layer

**What:** Before committing to an approach, simulate multiple strategies using compressed memory state and evaluate outcomes probabilistically.

**Why:** Current systems pick one approach and execute. Superintelligence should evaluate multiple paths before committing, using historical evidence to predict outcomes.

**Implementation:**

```
src/intelligence/strategy-simulator.ts
```

**Algorithm:**
```
1. GENERATE: Given a task, generate N candidate strategies (N=3-5)
   - Each strategy: sequence of high-level steps + expected outcomes
   - Informed by retrieved skills and anti-patterns

2. SIMULATE: For each strategy, estimate:
   - P(success) based on similar past tasks (from memory)
   - Expected time cost (from past task durations)
   - Risk factors (from anti-patterns that match strategy steps)
   - Prerequisite satisfaction (from readiness dimensions)

3. EVALUATE: Score each strategy:
   strategy_score = P(success) * (1 / expected_time) * (1 - risk_factor) * prerequisite_satisfaction

4. RECOMMEND: Present top strategies with scores and reasoning
   - If top strategy score < 0.5: recommend more research before proceeding
   - If strategies diverge significantly: flag as decision point requiring human input

5. LEARN: After execution, compare predicted vs actual outcomes
   - Update P(success) estimates for similar strategies
   - Store as strategy_outcome memory for future simulations
```

**Memory integration:** Strategy outcomes are stored as `task` type memories with extended metadata:
```json
{
  "strategy_predicted_success": 0.75,
  "strategy_actual_success": true,
  "strategy_predicted_time_ms": 300000,
  "strategy_actual_time_ms": 450000,
  "strategy_key_differences": ["underestimated API complexity"]
}
```

### 6.2 Environment / World Model

**What:** Maintain a compressed model of the current codebase, dependencies, and runtime environment. Use it for rapid what-if analysis without re-scanning the filesystem.

**Why:** Every task currently requires re-exploring the codebase. A world model enables instant context about the project state.

**Implementation:**

```
src/intelligence/world-model.ts
```

**Model components:**
```
1. DEPENDENCY GRAPH: Package manifest → directed graph of dependencies
   - Stored as memory edges (requires, part_of)
   - Updated on sync when package.json/lock changes detected

2. FILE TOPOLOGY: Key files → purpose mapping
   - Entry points, config files, test suites, API routes
   - Updated incrementally via git diff on sync

3. RUNTIME PROFILE: Environment detection
   - Node version, package manager, framework, test runner
   - Detected once, cached, updated on environment change signals

4. API SURFACE: Exported functions, types, endpoints
   - Extracted from TypeScript declarations and route definitions
   - Used for key-link verification

5. CHANGE VELOCITY: Which files change most frequently
   - Derived from git log analysis
   - Used for risk assessment (high-velocity files = higher risk)
```

**Storage:** World model components are stored as `decision` type memories with `scope: project` and tagged `world_model`. They are automatically superseded when the model is updated.

**Update triggers:**
- `noesis sync` detects changes via mtime/git status
- Rate-limited: model update at most once per 5 minutes

### 6.3 Task Planning Engine

**What:** Decompose complex tasks into dependency-ordered subtask DAGs with estimated effort, using historical data.

**Why:** Current planning is either manual (agent-workflow) or absent (UAWL). Intelligent planning uses past execution data to create realistic plans.

**Implementation:**

```
src/intelligence/task-planner.ts
```

**Planning algorithm:**
```
1. DECOMPOSE: Break task into subtasks using:
   - Pattern matching against past task decompositions (from memory)
   - LLM decomposition for novel tasks
   - Capsule-specific decomposition rules when capsule is active

2. ORDER: Build dependency DAG
   - Identify which subtasks depend on which
   - Identify which can be parallelized
   - Flag circular dependencies as planning errors

3. ESTIMATE: For each subtask:
   - Find similar past subtasks from memory
   - Estimate duration: median(past_durations) * complexity_modifier
   - Estimate risk: P(failure) from past outcomes
   - If no history: use LLM estimate with uncertainty flag

4. OPTIMIZE: Minimize total time given:
   - Dependencies (hard constraints)
   - Risk (prefer low-risk early, high-risk when context is warm)
   - Context coherence (group related subtasks to reduce context switching)

5. VALIDATE: Run plan through critic system
   - Check for missing edge cases
   - Check for unrealistic estimates
   - Check against anti-patterns
```

### 6.4 Knowledge Distillation Engine

**What:** Automatically compress and consolidate related memories into higher-order knowledge structures.

**Why:** Over time, memory stores accumulate redundant low-level memories. Distillation creates compact, high-signal knowledge that improves retrieval quality and reduces token costs.

**Implementation:**

```
src/intelligence/knowledge-distiller.ts
```

**Distillation process:**
```
1. IDENTIFY: Find memory clusters with high internal similarity (>0.85)
   - Reuse existing Union-Find clustering infrastructure
   - Target: clusters of 5+ memories about the same concept

2. DISTILL: Create a single high-order memory that captures the essence
   - LLM-assisted: "Summarize these N memories into one principle"
   - Temperature=0, structured output
   - Preserve key details, discard implementation specifics

3. LINK: Create knowledge graph edges
   - distilled_memory -[generalizes]-> original_memories
   - Original memories keep their edges intact

4. SCORE: Distilled memories get confidence = avg(source_confidences) * 1.1
   - Bonus for being validated across multiple sources

5. LIFECYCLE: Distilled memories participate in normal retrieval
   - They score higher due to generality and confidence
   - Original memories naturally decay if the distilled version covers their content
```

### 6.5 Model Routing Intelligence

**What:** Select the optimal LLM for each sub-operation based on task characteristics, cost, and historical performance.

**Why:** Not every operation needs the most expensive model. Simple classifications can use fast/cheap models; complex synthesis needs the best.

**Implementation:**

```
src/intelligence/model-router.ts
```

**Routing matrix:**
| Operation | Complexity Signal | Recommended Tier |
|-----------|-------------------|-----------------|
| Skill synthesis | High (requires reasoning over cluster) | Tier 1 (Opus/GPT-4) |
| Anti-pattern synthesis | High | Tier 1 |
| Knowledge distillation | Medium | Tier 2 (Sonnet/GPT-4-mini) |
| Prompt optimization | Low-Medium | Tier 2 |
| Content classification | Low | Tier 3 (Haiku/fast) |
| Strategy simulation | High | Tier 1 |
| Plan decomposition | Medium | Tier 2 |
| Critique dimensions | Medium-High | Tier 1 for blocking decisions, Tier 2 for advisory |

**Learning:** Track cost and quality per operation per model. Over time, learn which model delivers the best quality-per-dollar for each operation type. Store as `decision` type memories tagged `model_routing`.

**Configuration:**
```yaml
llm_providers:
  tier1:
    provider: anthropic
    model: claude-opus-4-6
    max_tokens_per_call: 4096
  tier2:
    provider: anthropic
    model: claude-sonnet-4-6
    max_tokens_per_call: 2048
  tier3:
    provider: anthropic
    model: claude-haiku-4-5-20251001
    max_tokens_per_call: 1024
```

### 6.6 Personal Cognitive Profile

**What:** Build a model of the user's expertise, learning style, blind spots, and preference patterns. Use it to tailor all interactions.

**Why:** A superintelligence system should adapt to its user, not force the user to adapt to it.

**Implementation:**

```
src/intelligence/cognitive-profile.ts
```

**Profile dimensions:**
```
1. EXPERTISE MAP: What the user knows well vs learning
   - Derived from: corrections (low expertise), accepted suggestions (alignment), task types attempted
   - Updated: on every correction, task completion, and skill usage

2. LEARNING STYLE:
   - Prefers code examples vs explanations
   - Prefers deep-dive vs summary
   - Prefers options vs recommendations
   - Derived from: which response styles lead to user acceptance vs correction

3. BLIND SPOTS:
   - Recurring mistake patterns
   - Areas where corrections cluster
   - Derived from: lesson memories grouped by domain

4. PREFERENCE PATTERNS:
   - Technology preferences (framework, language, tool choices)
   - Style preferences (terse vs verbose, safety vs speed)
   - Derived from: preference-type memories and decision-type memories

5. WORK PATTERNS:
   - Active hours (when do sessions occur)
   - Session duration distribution
   - Task complexity preference
   - Derived from: session memories
```

**Storage:** Profile stored as `preference` type memories with tag `cognitive_profile`. Updated incrementally, never requiring a full recompute.

**Usage:**
- Prompt optimization adjusts formality and detail level
- Expert routing considers user expertise (don't delegate to simple expert if user is already expert)
- Strategy simulation weighs user's past success rates in similar domains
- Explanation depth auto-adjusts based on learning style

### 6.7 Synthetic Experience Generation

**What:** Generate hypothetical task scenarios from existing memories and simulate outcomes to pre-train the learning system.

**Why:** Real learning requires real failures. Synthetic experience accelerates learning by generating plausible failure scenarios from partial evidence and filling knowledge gaps before they cause real failures.

**Implementation:**

```
src/intelligence/experience-synthesizer.ts
```

**Generation process:**
```
1. IDENTIFY GAPS: Find areas with few memories but high task frequency
   - Compare world model's file change velocity against memory density per area
   - Identify technology combinations with no failure memories

2. GENERATE SCENARIOS: For each gap, generate plausible scenarios
   - Use known anti-patterns from other projects as templates
   - Adapt to current project's technology stack
   - Generate both success and failure variants

3. TAG: Synthetic memories are tagged as `source: synthetic`
   - They participate in retrieval with a 0.7x confidence multiplier
   - They are replaced by real memories when real experience is gained

4. VALIDATE: Periodically compare synthetic predictions against real outcomes
   - If synthetic memory predicted a failure mode that actually occurred: boost confidence
   - If synthetic memory predicted a failure mode that never occurred: reduce confidence
```

**Constraints:**
- Synthetic memories never achieve `approved` status
- They are always clearly tagged
- They are excluded from skill synthesis clusters (no synthetic skills)
- They ARE included in anti-pattern advisory checks (useful for warnings)

### 6.8 Planning + Memory Integration

**What:** Deep integration between the planning engine and memory retrieval, so plans are automatically informed by everything the system has learned.

**Why:** This is the core differentiator — plans that get smarter over time.

**Implementation:** Integrated across `plan-engine.ts` and `hybrid.ts`.

**Integration points:**
```
1. PRE-PLANNING RECALL:
   - Before planning, recall all relevant skills for the task type
   - Recall all anti-patterns for the technology stack
   - Recall all lessons from similar past tasks
   - Recall all incidents from the same project

2. PLAN ENRICHMENT:
   - Each plan step checks: "Is there a skill that covers this?"
   - If yes: reference the skill, use its steps as a starting point
   - Each plan step checks: "Is there an anti-pattern that warns against this?"
   - If yes: add explicit guard in the plan

3. ESTIMATE ENRICHMENT:
   - Duration estimates use past task durations from memory
   - Risk estimates use past failure rates from memory
   - Confidence intervals widen when no relevant memory exists

4. POST-PLAN VALIDATION:
   - Critic dimensions automatically include memory-backed checks
   - "Does this plan contradict any known anti-pattern?"
   - "Does this plan align with approved skills?"
   - "Are there unresolved conflicts in memories relevant to this plan?"
```

### 6.9 Context Economy System

**What:** Intelligent allocation of context budget across competing demands, maximizing information density per token.

**Why:** Every adapter has a token budget. Wasting tokens on low-value context reduces agent effectiveness. A context economy optimizes the information-per-token ratio.

**Implementation:**

```
src/intelligence/context-economist.ts
```

**Economy model:**
```
1. VALUE SCORING: Each context item gets an information value score:
   value(item) = relevance * recency * uniqueness * importance_class

   Where:
   - relevance: semantic similarity to current task (from retrieval)
   - recency: how recently the information was relevant
   - uniqueness: how much information is NOT already implied by other items
   - importance_class: skill > anti_pattern > lesson > task > preference

2. BUDGET ALLOCATION:
   - Fixed allocations: system prompt (10%), conventions (15%), active plan (20%)
   - Dynamic allocation: remaining budget distributed by value score
   - Compression: low-value items get summarized (lossy compression)
   - Truncation: items below value threshold are dropped

3. COMPRESSION STRATEGIES:
   - Skill compression: full steps → step names only → description only
   - Lesson compression: full context → root_cause + corrected_approach only
   - Task compression: full content → key_insight only
   - Each compression level reduces tokens ~50%

4. TRACKING:
   - Per-sync: tokens_injected, tokens_budget, tokens_available, truncated_memories
   - Historical: track which truncated memories would have been useful
   - Learn: adjust value scoring weights based on actual usefulness
```

### 6.10 Continuous System Self-Evaluation

**What:** The system continuously evaluates its own performance and identifies areas for improvement.

**Why:** Without self-evaluation, the system cannot know if it is actually improving or degrading over time.

**Implementation:**

```
src/intelligence/self-evaluator.ts
```

**Evaluation dimensions:**
```
1. RETRIEVAL QUALITY:
   - Track: Were retrieved memories used? Were they helpful?
   - Metric: retrieval_precision = helpful_retrievals / total_retrievals (30-day rolling)
   - Target: > 0.7
   - Action if below: Review retrieval weights, check for stale memories

2. LEARNING EFFECTIVENESS:
   - Track: Do lessons prevent repeat failures?
   - Metric: repeat_failure_rate = same_error_class_failures / total_failures
   - Target: < 0.2 (within a project)
   - Action if above: Check if lessons are being retrieved, check confidence levels

3. SKILL ADOPTION:
   - Track: Are synthesized skills actually used?
   - Metric: skill_adoption = skills_applied / skills_retrieved
   - Target: > 0.5
   - Action if below: Skills may be too generic or not relevant

4. PREDICTION ACCURACY:
   - Track: Do strategy simulations predict correct outcomes?
   - Metric: prediction_accuracy = correct_predictions / total_predictions
   - Target: > 0.6
   - Action if below: Adjust simulation model weights

5. USER SATISFACTION PROXY:
   - Track: Correction rate (lower is better)
   - Metric: correction_rate = corrections / total_tasks
   - Target: < 0.3
   - Action if above: Review cognitive profile, check for blind spots
```

**Self-evaluation schedule:**
- Per-session: Quick metrics check on session end
- Daily: Full evaluation on first daemon start of the day
- Weekly: Trend analysis and improvement recommendations

**Output:** Self-evaluation results stored as `system_metrics` (already in schema v2). Improvement recommendations surfaced via `noesis status --health`.

### 6.11 Cognitive Friction Detection

**What:** Identify moments where the user is struggling — repeated corrections, long pauses, abandoned tasks — and proactively offer help.

**Why:** A superintelligent system should detect when its user is stuck and offer targeted assistance.

**Implementation:**

```
src/intelligence/friction-detector.ts
```

**Friction signals:**
```
1. RAPID CORRECTIONS: 3+ corrections in a single session
   → User is fighting the system, not collaborating with it
   → Action: Suggest reviewing preferences, offer to adjust approach

2. TASK ABANDONMENT: Task started but no completion event within session
   → User gave up or got blocked
   → Action: Create checkpoint, offer to resume with different approach

3. REPEATED QUERY: Same or similar retrieval query 3+ times
   → User is not finding what they need
   → Action: Surface retrieval gap analysis, suggest creating the missing knowledge

4. LONG SILENCE: Extended gap between interactions (>10 minutes within session)
   → User may be stuck thinking
   → Action: Offer relevant context, suggest next steps

5. ERROR CASCADES: 3+ tool errors in sequence
   → Something is fundamentally wrong
   → Action: Suggest stepping back, reviewing the approach
```

**Storage:** Friction events stored as `learning_events` (already in schema v2).

### 6.12 Temporal Relevance Modeling

**What:** Move beyond simple recency decay to model the temporal context of when knowledge is most valuable.

**Why:** Some knowledge is seasonal (release cycles), some is triggered by events (post-incident), some decays rapidly (dependency versions). A single decay curve is insufficient.

**Implementation:**

```
src/intelligence/temporal-modeler.ts
```

**Temporal models:**
```
1. LINEAR DECAY (default):
   relevance(t) = 1.0 - (age_days / max_age_days)
   Used for: general task memories

2. STEP DECAY (current implementation):
   relevance(t) = step_function(7d=1.0, 30d=0.9, 90d=0.8, 365d=0.7, else=0.5)
   Used for: most memories (backward-compatible)

3. EVENT-TRIGGERED REFRESH:
   relevance(t) = 1.0 if event_occurred_recently else step_decay(t)
   Used for: incident memories (refresh when similar errors occur)

4. CYCLICAL RELEVANCE:
   relevance(t) = base + amplitude * cos(2π * day_of_cycle / cycle_length)
   Used for: release-cycle knowledge, seasonal patterns

5. CONTEXT-DEPENDENT:
   relevance(t) = 1.0 if context_matches else decay(t)
   Used for: project-specific knowledge when working on that project
```

**Model selection:** Each memory is assigned a temporal model based on its type:
| Memory Type | Default Model | Override |
|---|---|---|
| task | step_decay | — |
| lesson | event_triggered | Refreshes when similar task type is attempted |
| skill | step_decay | — |
| incident | event_triggered | Refreshes when similar error class occurs |
| decision | context_dependent | Full relevance in originating project |
| preference | flat (no decay) | User preferences don't expire |
| checkpoint | step_decay (fast) | 7d=1.0, 14d=0.5, 30d=0.1 |
| session | step_decay (fast) | Same as checkpoint |
| verification | context_dependent | Full relevance in originating project |

### 6.13 Meta-Reasoning Layer

**What:** A layer that reasons about HOW the system is reasoning, detecting when the current approach is suboptimal and suggesting course corrections.

**Why:** This is what separates intelligence from superintelligence. The ability to observe one's own reasoning process and improve it in real-time.

**Implementation:**

```
src/intelligence/meta-reasoner.ts
```

**Meta-reasoning capabilities:**
```
1. APPROACH MONITORING:
   - Track: Is the current approach making progress?
   - Signal: Steps completed vs steps remaining, time elapsed vs estimated
   - Action: If progress < 30% at 50% estimated time, flag as potentially stuck

2. STRATEGY SWITCHING:
   - When: Current strategy is failing (2+ failed steps)
   - Process: Re-run strategy simulation with updated evidence
   - Action: Recommend strategy switch if alternative scores significantly higher (>20%)

3. CONFIDENCE CALIBRATION:
   - Track: System's confidence vs actual outcomes over time
   - Signal: Overconfident (high confidence, many failures) or underconfident (low confidence, many successes)
   - Action: Apply calibration factor to future confidence estimates

4. RESOURCE OPTIMIZATION:
   - Track: Context budget utilization vs information gain
   - Signal: Large context injections with low retrieval hit rates
   - Action: Adjust context economy weights

5. LEARNING RATE MONITORING:
   - Track: Is the system actually learning from experience?
   - Signal: Repeat failure rate, skill adoption rate, prediction accuracy
   - Action: If learning rate plateaus, recommend system maintenance (gc, re-clustering, profile review)
```

---

## 7. Cross-Agent Distribution Model

### 7.1 Adapter Architecture

Every CLI agent gets noesis capabilities through its adapter. Adapters are **pure transform functions** — they produce declarative output, and the core validates and executes all I/O.

**Adapter interface:**
```typescript
interface Adapter {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly capabilities: AdapterCapabilityDeclaration;
  readonly targetCapabilities: TargetToolCapabilities;

  detect(query: FilesystemQuery): Promise<DetectionResult>;
  transform(context: UniversalContext, budget: TokenBudget): Promise<SyncResult>;
  extractLearnings(content: string): Promise<ExtractedLearnings>;
  verify(content: string, expectedHash: string): VerifyResult;
}
```

### 7.2 Adapter Registry

| Adapter | Target File | Token Budget | Write-Back | Session Support |
|---------|-------------|-------------|------------|-----------------|
| claude-code | CLAUDE.md | 50,000 | CLI command | Full |
| cursor | .cursorrules | 8,000 | Inbox file | Partial |
| copilot | copilot-instructions.md | 4,000 | Manual | None |
| aider | .aider.conf.yml | 20,000 | CLI command | Partial |
| codex | AGENTS.md | 30,000 | Inbox file | Partial |
| opencode | AGENTS.md | 30,000 | Inbox file | Partial |
| antigravity | GEMINI.md | 40,000 | Inbox file | Partial |
| openclaw | CLAUDE.md | 50,000 | CLI command | Full |
| generic | stdout/file | Configurable | CLI command | None |

### 7.3 Context Injection

On every sync, the adapter assembles context in priority order:

```
1. System identity (persona, conventions) — ALWAYS included
2. Active plan (if RPI is in progress) — ALWAYS included
3. Active checkpoint (if mid-handoff) — ALWAYS included, 2.0x boost if unacknowledged
4. Critical anti-patterns for current project — HIGH priority
5. Relevant skills — MEDIUM priority (compressed if budget tight)
6. Recent lessons — MEDIUM priority
7. World model summary — LOW priority (only if budget allows)
8. Cognitive profile hints — LOW priority
```

### 7.4 Managed Sections

```
<!-- NOESIS:BEGIN adapter={id} version={ver} hash={hash} timestamp={iso} -->
{managed content — never edit manually}
<!-- NOESIS:END adapter={id} -->
```

Hash verification detects external modifications. On conflict: backup created, user prompted.

---

## 8. Security Architecture

Noesis inherits UAWL's security architecture with all 7 invariants. These are **non-negotiable and non-disableable**.

### 8.1 Seven Security Invariants

| # | Invariant | Implementation |
|---|-----------|---------------|
| 1 | Secret scanning is always on | `security/secret-scanner.ts` — warn or redact mode, no off mode |
| 2 | File permission enforcement | `security/permissions.ts` — 0700 dirs, 0600 files, 0400 signing key |
| 3 | Instruction-type memory confirmation | `security/dangerous-patterns.ts` — user must confirm |
| 4 | Audit logging of security events | `security/audit.ts` — append-only JSONL, never raw content |
| 5 | Path traversal prevention | `security/path-validation.ts` — absolute path resolution, base-dir check |
| 6 | Memory integrity signing | `security/hmac.ts` — HMAC-SHA256, tampered memories excluded |
| 7 | Advisory retrieval only | All retrieved memories are contextual, never directive |

### 8.2 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Secrets in memory | Secret scanning pipeline + Shannon entropy detection |
| Memory poisoning | Dangerous pattern blocklist + provenance tracking + user confirmation |
| Data exfiltration | Sensitivity classification + project-scoped retrieval |
| Cross-project contamination | Project isolation + cross-project disabled by default |
| Adapter compromise | Core performs all writes; adapters produce declarative output only |
| Supply chain | Minimal dependencies, SafeTensors-only, model hash verification |
| Multi-user | File permissions (0700/0600), path traversal prevention |

### 8.3 Novel Security Considerations

The novel intelligence layers introduce new security surfaces:

| Layer | Risk | Mitigation |
|-------|------|-----------|
| Strategy Simulation | Simulated outcomes could be manipulated | Simulations are advisory-only; user chooses strategy |
| Cognitive Profile | Privacy-sensitive user data | Profile stored locally (never synced), 0600 permissions |
| Synthetic Experience | Synthetic memories could mislead | Always tagged `source: synthetic`, excluded from skill synthesis, 0.7x confidence cap |
| World Model | Could expose project structure | Scoped to project, never cross-project, follows project isolation |
| Meta-Reasoning | Could override user decisions | Meta-reasoning is advisory; user always has final say |

---

## 9. Implementation Phases

### Phase Dependency Graph

```
Phase A: UAWL Completion (Phases 0-3)
    │
Phase B: Workflow Engine (Phases 4-6)
    │
Phase C: Agent-Workflow Integration (Phases 7-9)
    │
Phase D: Novel Intelligence (Phases 10-12)
    │
Phase E: Distribution & Hardening (Phases 13-15)
```

### Phase 0: Test Infrastructure (Week 1)

**Goal:** Establish test coverage for all existing code before extending it.

**Work:**
1. Configure vitest (already in project, needs test files)
2. Write unit tests for all 44 existing source files
3. Focus on: types validation, database CRUD, retrieval pipeline, security modules, learning loops
4. Establish test patterns: in-memory SQLite for database tests, mock embedding provider for retrieval tests

**Acceptance:** All existing code has test coverage. `npm test` passes.

### Phase 1: Daemon Architecture (Week 2)

**Goal:** Persistent daemon with JSON-RPC 2.0, event system, and degraded mode support.

**Work:**
1. `src/daemon/server.ts` — Daemon lifecycle, 10-minute idle auto-exit
2. `src/daemon/socket.ts` — Unix domain socket at `~/.agents/noesis.sock`
3. `src/daemon/rpc.ts` — JSON-RPC 2.0 handler, register all memory/session/sync methods
4. `src/daemon/events.ts` — Push-based notification, 7 event types, subscriber management
5. `src/daemon/client.ts` — Client that auto-starts daemon if not running
6. Implement 7 cache types (ONNX session, SQLite connection, page cache, embedding LRU, result LRU, hot memory mtime, assembled context hash)
7. Implement 5 degraded mode scenarios

**Acceptance:** Daemon starts, serves RPC, auto-exits. All 5 degraded modes work correctly.

### Phase 2: CLI Layer (Week 3)

**Goal:** All 22 UAWL commands + 8 new workflow commands.

**Work:**
1. `src/cli/index.ts` — Commander-based CLI entry point
2. All 22 UAWL commands from IMPLEMENTATION.md Phase 10
3. 8 new workflow commands: plan, research, critique, verify, session, route, optimize, simulate
4. Global options: `--verbose`, `--json`, `--project <id>`

**Acceptance:** All 30 commands invocable. `noesis init` performs complete first-time setup.

### Phase 3: Adapter Framework (Week 4)

**Goal:** 9 adapters with managed sections, context budgets, and write-back.

**Work:**
1. `src/adapters/interface.ts` — Adapter interface with all types
2. `src/adapters/managed-sections.ts` — Managed section markers with hash verification
3. `src/adapters/context-budget.ts` — Token budget management
4. `src/adapters/sandbox.ts` — Sandboxed filesystem query
5. All 9 adapter implementations
6. Tool detection via filesystem probing
7. Write-back: CLI command + inbox file + sync pull

**Acceptance:** All 9 adapters detect, transform, and sync correctly within budget.

### Phase 4: RPI Workflow Engine (Week 5-6)

**Goal:** Full Research → Plan → Implement → Validate pipeline with memory integration.

**Work:**
1. `src/workflow/rpi-orchestrator.ts` — Full lifecycle management
2. `src/workflow/plan-engine.ts` — Goal-backward planning with memory enrichment
3. Enhance `src/workflow/prompt-optimizer.ts` — Add capsule routing
4. Enhance `src/workflow/readiness.ts` — Add workflow scoring integration
5. `src/workflow/capsule-router.ts` — Capsule selection and loading
6. Create initial capsules: `api-workflow`, `creative-redesign`, `security-hardening`

**Acceptance:** Full RPI pipeline executes. Plans are enriched with memory-retrieved skills and anti-patterns. Readiness gate blocks premature implementation.

### Phase 5: Evidence-Backed Critique (Week 7)

**Goal:** 7-dimension critique system with evidence requirements.

**Work:**
1. Enhance `src/workflow/critic.ts` — 7 research dimensions + 7 plan dimensions
2. Add blocking/warning/advisory severity levels
3. Add evidence requirements (every blocking finding needs concrete proof)
4. Add anti-pattern checking (merge noesis anti-patterns with critic dimensions)
5. Implement iteration protocol (max 2 revisions, then HUMAN JUDGMENT REQUIRED)
6. `src/workflow/verification-engine.ts` — 3-level goal-backward verification

**Acceptance:** Critique produces evidence-backed findings. Blocking findings require concrete evidence. Verification checks exists + substantive + wired.

### Phase 6: Execution Discipline (Week 8)

**Goal:** Deviation tracking, checkpoints, debug protocol, session management.

**Work:**
1. `src/workflow/deviation-tracker.ts` — 4-rule deviation system
2. `src/workflow/checkpoint-protocol.ts` — 3 checkpoint types
3. `src/workflow/debug-protocol.ts` — Persistent debug state files
4. `src/workflow/session-manager.ts` — Session lifecycle
5. `src/workflow/handoff-protocol.ts` — Cross-agent handoff packaging
6. `src/workflow/expert-routing.ts` — Expert agent routing with memory consultation

**Acceptance:** Deviations tracked and stored. Debug sessions survive context resets. Handoffs package full context.

### Phase 7: Learning Enhancement (Week 9)

**Goal:** Evidence-backed lesson capture, failure classification, and Loop 5 integration.

**Work:**
1. Add Loop 5 to `src/intelligence/learning-loop.ts` — Evidence-backed lesson capture
2. Implement failure classification taxonomy (6 classes)
3. Integrate lesson capture with deviation tracker and verification engine
4. Implement systemic improvement detection
5. Implement lesson mirroring to hot memory

**Acceptance:** Lessons automatically captured on correction/rejection/failure. Failure classes tracked. Systemic improvements suggested.

### Phase 8: Strategy Simulation (Week 10)

**Goal:** Multi-strategy evaluation before committing to an approach.

**Work:**
1. `src/intelligence/strategy-simulator.ts` — Generate, simulate, evaluate, recommend
2. Integrate with plan engine (simulation before planning)
3. Integrate with memory (past strategy outcomes inform predictions)
4. Implement strategy outcome tracking

**Acceptance:** 3-5 strategies generated per task. Predictions correlate with outcomes (>0.6 accuracy after 50+ tasks).

### Phase 9: Environment & Knowledge Models (Week 11)

**Goal:** World model and knowledge distillation.

**Work:**
1. `src/intelligence/world-model.ts` — Dependency graph, file topology, runtime profile, API surface, change velocity
2. `src/intelligence/knowledge-distiller.ts` — Cluster identification, LLM distillation, graph linking
3. Integrate world model with plan engine and verification engine
4. Integrate distillation with regular learning loop schedule

**Acceptance:** World model updated on sync. Distilled memories score higher in retrieval.

### Phase 10: Cognitive Intelligence (Week 12)

**Goal:** Cognitive profiling, friction detection, model routing.

**Work:**
1. `src/intelligence/cognitive-profile.ts` — 5 profile dimensions, incremental updates
2. `src/intelligence/friction-detector.ts` — 5 friction signals
3. `src/intelligence/model-router.ts` — Tier-based routing with learning
4. Integrate cognitive profile with prompt optimization and context economy

**Acceptance:** Profile built from interaction history. Friction detected and surfaced. Model routing reduces cost without quality loss.

### Phase 11: Temporal & Meta Intelligence (Week 13)

**Goal:** Temporal relevance modeling, meta-reasoning, context economy, self-evaluation, synthetic experience.

**Work:**
1. `src/intelligence/temporal-modeler.ts` — 5 temporal models, per-type assignment
2. `src/intelligence/meta-reasoner.ts` — 5 meta-reasoning capabilities
3. `src/intelligence/context-economist.ts` — Value scoring, budget allocation, compression
4. `src/intelligence/self-evaluator.ts` — 5 evaluation dimensions, scheduled evaluation
5. `src/intelligence/experience-synthesizer.ts` — Gap identification, scenario generation, validation

**Acceptance:** Temporal models improve retrieval relevance. Meta-reasoning detects stuck states. Context economy reduces wasted tokens. Self-evaluation identifies improvement areas.

### Phase 12: Agent Definitions & Scripts (Week 14)

**Goal:** Port agent-workflow's agents, commands, rules, and scripts into noesis-compatible format.

**Work:**
1. Port 9+ expert agent definitions to `~/.agents/agents/`
2. Port workflow commands to `~/.agents/commands/`
3. Port reusable rules to `~/.agents/rules/common/`
4. Port helper scripts to `~/.agents/scripts/`
5. Port hooks to `~/.agents/hooks/`
6. Create sync infrastructure to distribute across all adapters

**Acceptance:** All agents, commands, rules, scripts available to all adapters via noesis sync.

### Phase 13: Multi-Provider Sync (Week 15)

**Goal:** Bidirectional sync across all 9 adapters with format bridges.

**Work:**
1. Implement `noesis sync` — bidirectional sync with all detected adapters
2. Implement format bridges (markdown → TOML for Antigravity, markdown → frontmatter for OpenCode)
3. Implement capability negotiation per adapter
4. Implement `noesis import-config` for all adapter types
5. Implement inbox ingestion from all adapters

**Acceptance:** `noesis sync` distributes context to all detected tools. Write-back from all tools ingested correctly.

### Phase 14: Integration Testing & Security Audit (Week 16)

**Goal:** End-to-end validation, security audit, performance benchmarks.

**Work:**
1. End-to-end test suite (8 scenarios from UAWL Phase 15)
2. Security audit: verify all 7 invariants are non-bypassable
3. Performance validation: retrieval <200ms, cold start <870ms, write <50ms
4. Novel layer testing: simulation accuracy, distillation quality, profile accuracy
5. Cross-adapter testing: handoff between different adapters

**Acceptance:** All tests pass. All invariants hold. Performance targets met.

### Phase 15: Documentation & Open-Source Prep (Week 17)

**Goal:** Prepare for open-source release.

**Work:**
1. API documentation for all RPC methods
2. Adapter development guide (how to build a new adapter)
3. Capsule development guide (how to create task-class capsules)
4. Configuration reference
5. Security model documentation
6. Contributing guidelines
7. License (choose appropriate open-source license)

**Acceptance:** Documentation complete. Clean public repo with no secrets, no local runtime state.

---

## 10. Acceptance Criteria & Ship Checklist

### v1.0 Must Have

**Memory Engine:**
- [ ] SQLite + sqlite-vec + FTS5 hybrid retrieval
- [ ] Hot memory (markdown) + warm memory (SQLite) + cold storage (JSONL)
- [ ] Snowflake Arctic Embed-S ONNX embedding
- [ ] HMAC-SHA256 memory integrity signing
- [ ] Secret scanning pipeline with redaction
- [ ] Dangerous pattern blocklist
- [ ] Write pipeline (9 steps)
- [ ] Memory conflict detection (read-time and write-time)
- [ ] Project isolation and global promotion
- [ ] 9 memory types: task, decision, preference, skill, incident, lesson, checkpoint, session, verification
- [ ] 8 trigger conditions for memory accumulation
- [ ] Knowledge graph with 12 typed edge relations

**Learning Engine:**
- [ ] Union-Find pattern detection (positive and negative clusters)
- [ ] LLM-assisted skill synthesis with validation criteria
- [ ] LLM-assisted anti-pattern synthesis from failure clusters
- [ ] Bayesian confidence tracking with Laplace smoothing
- [ ] Evidence-backed lesson capture (Loop 5)
- [ ] Failure classification taxonomy (6 classes)
- [ ] Knowledge distillation engine

**Workflow Engine:**
- [ ] RPI orchestrator (Research → Plan → Implement → Validate)
- [ ] Prompt optimizer with capsule routing and memory enrichment
- [ ] 5-dimension readiness gate with memory boosts
- [ ] Evidence-backed critique (7 research + 7 plan dimensions)
- [ ] Goal-backward verification (3 levels: exists, substantive, wired)
- [ ] Deviation tracker (4 rules)
- [ ] Checkpoint protocol (3 types)
- [ ] Persistent debug state protocol
- [ ] Expert agent routing with memory consultation
- [ ] Session management (lightweight sessions + rich handoffs)
- [ ] 3+ capsules (api-workflow, creative-redesign, security-hardening)

**Intelligence Layers:**
- [ ] Strategy simulation (3-5 candidates per task)
- [ ] Environment/world model (5 components)
- [ ] Task planning engine with historical estimates
- [ ] Model routing intelligence (3 tiers)
- [ ] Personal cognitive profile (5 dimensions)
- [ ] Context economy system (value scoring + compression)
- [ ] Continuous self-evaluation (5 dimensions)
- [ ] Cognitive friction detection (5 signals)
- [ ] Temporal relevance modeling (5 models)
- [ ] Meta-reasoning layer (5 capabilities)

**Distribution:**
- [ ] Daemon architecture with JSON-RPC 2.0
- [ ] 9 adapters (Claude Code, Cursor, Copilot, Aider, Codex, OpenCode, Antigravity, OpenClaw, Generic)
- [ ] Managed section markers with hash verification
- [ ] Token budget management per tool
- [ ] Write-back mechanisms (CLI + inbox)
- [ ] Cross-agent handoff protocol
- [ ] 30+ CLI commands
- [ ] Agent definitions, commands, rules, scripts for all adapters

**Security:**
- [ ] 7 non-disableable security invariants
- [ ] 7 threat mitigations
- [ ] Audit logging (append-only JSONL with rotation)
- [ ] File permission enforcement
- [ ] Advisory retrieval invariant (memories are contextual, never directive)

**Operations:**
- [ ] Garbage collection with dry-run preview
- [ ] Database backup and repair
- [ ] Export/import
- [ ] Embedding migration
- [ ] 5 degraded mode scenarios
- [ ] Retrieval explainability (full scoring breakdown)
- [ ] Intelligence metrics dashboard

### v1.1 (Post-Launch)

- [ ] Synthetic experience generation
- [ ] SQLCipher encryption
- [ ] Memory quarantine with auto-approve
- [ ] Memory versioning and rollback
- [ ] Team memory sharing with trust model
- [ ] Agent capability negotiation
- [ ] Watch mode for inbox
- [ ] Community packs
- [ ] Cost tracking per session

### v2.0 (Future)

- [ ] Community adapter ecosystem with signing
- [ ] HDBSCAN clustering (WASM)
- [ ] ML-based semantic safety analysis
- [ ] NLM contradiction detection
- [ ] Multi-user access control
- [ ] Cross-agent cost intelligence
- [ ] Signed releases and SBOM

---

## 11. Design Principles

### Core Philosophy

> Noesis is a persistent cross-agent intelligence system under user control. Its security bar must be higher than any individual tool it integrates with, because its compromise implies the compromise of all connected tools.

### 11.1 Security First

Every feature, every layer, every integration must be evaluated against the OWASP Top 10 and the 7 security invariants. No shortcut, no bypass, no exception.

### 11.2 Advisory, Never Directive

All retrieved memories, all intelligence layer outputs, all recommendations are ADVISORY. The user and the agent always have final say. Noesis suggests; it never commands.

### 11.3 Evidence-Backed Everything

No opinion without evidence. No blocking critique without proof. No skill without validation criteria. No lesson without root cause analysis. No anti-pattern without source incidents.

### 11.4 Explain Everything

Every retrieval score is decomposable. Every planning decision is traceable. Every skill has provenance. Every recommendation has reasoning. If it cannot be explained, it does not belong.

### 11.5 Degrade Gracefully

No failure mode silently produces incorrect results. When a component fails, the system explicitly reports what is degraded and what guarantees still hold.

### 11.6 Learn Continuously

Every task completion, every correction, every failure is a learning opportunity. The system gets smarter with every interaction. But learning is gated: synthetic data is tagged, draft skills require approval, and confidence tracks actual usage.

### 11.7 Respect the User

The cognitive profile adapts to the user, not the other way around. Friction detection helps, it doesn't nag. Context economy optimizes for the user's benefit, not the system's convenience.

### 11.8 Ship Incrementally

Each phase is independently useful. Phase 0-3 gives a working UAWL replacement. Phase 4-6 adds workflow intelligence. Phase 7-9 adds learning enhancement. Phase 10-11 adds novel intelligence. Each phase makes the system meaningfully better.

---

*This document is the canonical plan for noesis development. It will be updated as implementation proceeds and new insights emerge.*
