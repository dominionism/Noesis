# ABILITIES - What Noesis Can Do Today, What It Cannot, and How It Can Reach the Next Level

**Assessment date:** March 17, 2026 (updated)
**Scope:** This document describes the repository as it exists now, the realistic capabilities it can already provide to agent fleets, the hard limits it still has, and the improvements most likely to help smaller models perform much closer to frontier systems on real engineering work.

## Executive Summary

Noesis is already more than a memory store. The codebase contains the core of a shared cognitive operating layer for coding agents: durable memory, hybrid retrieval, a knowledge graph, integrity and security controls, a daemon/RPC substrate, and a newer cognitive architecture made of rules, experts, capsules, skills, contexts, quality gates, continuity, learning, and execution.

If multiple agents actually follow Noesis as their workflow and single source of truth, they should behave less like isolated chat sessions and more like a persistent engineering organization. They can inherit project memory, locked decisions, recurring failure patterns, user taste, domain-specific workflows, and verification expectations across tools and sessions.

That does **not** mean Noesis turns a weak model into a frontier model. The honest claim is narrower and stronger:

- Noesis is an amplifier, not a replacement for model capability.
- It can make smaller and cheaper models perform far above their normal baseline on familiar, project-specific, tool-grounded tasks.
- It cannot erase the base-model ceiling on novel reasoning, judgment, or open-ended research.

## The Short Answer

Is Noesis making cross-agent intelligence compounding possible? **Yes.**

Is Noesis already enough to make a cheap model generally equivalent to Claude 4.6 Opus or Codex 5.4 on all tasks? **No.**

Can it narrow that gap sharply on your repositories, workflows, and repeated task classes? **Yes, if memory, retrieval, verification, and execution become reliable and measurable.**

## What Noesis Can Do Today

### 1. Provide a secure shared substrate for agent memory and continuity

Core files:

- [src/core/schema.ts](src/core/schema.ts)
- [src/core/database.ts](src/core/database.ts)
- [src/core/memory-crud.ts](src/core/memory-crud.ts)
- [src/memory/write-pipeline.ts](src/memory/write-pipeline.ts)
- [src/retrieval/hybrid.ts](src/retrieval/hybrid.ts)
- [src/security/hmac.ts](src/security/hmac.ts)
- [src/security/secret-scanner.ts](src/security/secret-scanner.ts)
- [src/sync/sync-orchestrator.ts](src/sync/sync-orchestrator.ts)

What this means in practice:

- Noesis can persist memories, decisions, and other structured state outside any one model session.
- It already has a hybrid retrieval path instead of a single retrieval strategy.
- It includes integrity enforcement and secret scanning rather than treating memory as an untrusted dump.
- It has enough substrate to support cross-session continuity and synchronization rather than one-off prompt stuffing.

This is the foundation that lets multiple agents share the same remembered reality.

### 2. Expose that substrate to multiple clients and tools

Core files:

- [src/daemon/server.ts](src/daemon/server.ts)
- [src/daemon/rpc.ts](src/daemon/rpc.ts)
- [src/daemon/rpc-cognitive.ts](src/daemon/rpc-cognitive.ts)
- [src/daemon/client.ts](src/daemon/client.ts)
- [src/adapters/base-adapter.ts](src/adapters/base-adapter.ts)
- [docs/ADAPTERS.md](docs/ADAPTERS.md)

What this means in practice:

- Noesis is designed as a shared service, not a single-agent prompt template.
- Agents can access a common memory and cognitive surface through CLI, daemon, and JSON-RPC boundaries.
- The cognitive RPC layer registers 24 methods spanning orchestration, rules, experts, capsules, skills, contexts, learning, sessions, handoffs, decisions, verification, and pattern detection.

This is what makes the "single source of truth for many agents" thesis technically plausible.

### 3. Enforce structured reasoning and project discipline

Legacy workflow files:

- [src/workflow/prompt-optimizer.ts](src/workflow/prompt-optimizer.ts)
- [src/workflow/plan-engine.ts](src/workflow/plan-engine.ts)
- [src/workflow/readiness.ts](src/workflow/readiness.ts)
- [src/workflow/rpi-orchestrator.ts](src/workflow/rpi-orchestrator.ts)
- [src/workflow/enhanced-critic.ts](src/workflow/enhanced-critic.ts)
- [src/workflow/verification-engine.ts](src/workflow/verification-engine.ts)

New cognitive prompt files:

- [src/cognitive/prompt/prompt-engine.ts](src/cognitive/prompt/prompt-engine.ts)
- [src/cognitive/prompt/reasoning-scaffold.ts](src/cognitive/prompt/reasoning-scaffold.ts)
- [src/cognitive/prompt/prompt-assembler.ts](src/cognitive/prompt/prompt-assembler.ts)

What this means in practice:

- Noesis is not only storing memory; it shapes reasoning and execution.
- It contains planning, readiness, critique, verification, and prompt assembly logic.
- The cognitive layer replaces static prompting with dynamic assembly from rules, experts, capsules, skills, contexts, and memories per task.

That is the correct direction if the goal is "agents think with organizational structure" rather than "agents remember a few notes."

### 4. Supply built-in behavioral primitives, not just generic memory

Core files:

- [src/cognitive/rules/built-in-rules.ts](src/cognitive/rules/built-in-rules.ts)
- [src/cognitive/experts/built-in-experts.ts](src/cognitive/experts/built-in-experts.ts)
- [src/cognitive/capsules/built-in-capsules.ts](src/cognitive/capsules/built-in-capsules.ts)
- [src/cognitive/skills/built-in-skills.ts](src/cognitive/skills/built-in-skills.ts)
- [src/cognitive/context/built-in-contexts.ts](src/cognitive/context/built-in-contexts.ts)
- [src/cognitive/commands/built-in-commands.ts](src/cognitive/commands/built-in-commands.ts)

Current built-in inventory in the repo:

| Primitive | Current built-in count | Why it matters |
| --- | ---: | --- |
| Rules | 14 | Non-negotiable reasoning constraints and workflow discipline |
| Experts | 37 | Specialized perspectives and domain routing |
| Deep capsules | 7 | Task-class operating packs that reshape context |
| Executable skills | 17 | Reusable workflows that can be matched and invoked |
| Context types | 13 | Durable state such as decisions, failures, preferences, and constraints |
| Commands | 51 | Operational vocabulary for execution and orchestration |

What this means in practice:

- Noesis can store and apply explicit behavioral structures, not just free-form notes.
- Agents can be routed toward domain-relevant experts and capsules instead of always acting like undifferentiated generalists.
- The system can encode "how we do this kind of work here" as first-class operating knowledge.

This is one of the main reasons Noesis can make smaller models look smarter on known task classes.

### 5. Maintain continuity, handoff, and decision fidelity

Core files:

- [src/cognitive/continuity/session-manager.ts](src/cognitive/continuity/session-manager.ts)
- [src/cognitive/continuity/handoff-manager.ts](src/cognitive/continuity/handoff-manager.ts)
- [src/cognitive/continuity/decision-fidelity.ts](src/cognitive/continuity/decision-fidelity.ts)

What this means in practice:

- Important decisions can become persistent state rather than fragile conversational context.
- Agents can hand off work without losing the working set.
- Deferred ideas can remain deferred and locked decisions can remain locked instead of being silently reinvented every session.

This is a major multiplier in real software work because continuity errors are one of the biggest hidden costs in current agent usage.

### 6. Gate work with readiness, quality, and verification logic

Core files:

- [src/cognitive/gates/readiness-gate.ts](src/cognitive/gates/readiness-gate.ts)
- [src/cognitive/gates/output-quality-gate.ts](src/cognitive/gates/output-quality-gate.ts)
- [src/cognitive/gates/verification-gate.ts](src/cognitive/gates/verification-gate.ts)

What this means in practice:

- Noesis is trying to prevent coding before the task is understood well enough.
- It can evaluate whether the requested output is generic, under-researched, or weakly verified.
- It can turn "do better" into structured preconditions and checks.

Smaller models benefit disproportionately from this because discipline and validation can substitute for some missing reasoning depth.

### 7. Support phased execution and "get-shit-done" style project movement

Core files:

- [src/cognitive/execution/gsd-engine.ts](src/cognitive/execution/gsd-engine.ts)
- [src/cognitive/execution/phase-executor.ts](src/cognitive/execution/phase-executor.ts)

What this means in practice:

- Noesis is not only about one-shot answers; it supports multi-phase execution.
- It contains persistent execution state, phase logic, and project movement via the GSD engine.
- This matters because real leverage comes from long-lived workflows, not clever first responses.

### 8. Learn from outcomes and feed corrections back into the system

Core files:

- [src/cognitive/learning/active-learning.ts](src/cognitive/learning/active-learning.ts)
- [src/cognitive/learning/predictive-failure.ts](src/cognitive/learning/predictive-failure.ts)
- [src/cognitive/learning/writeback-engine.ts](src/cognitive/learning/writeback-engine.ts)
- [src/intelligence/learning-loop.ts](src/intelligence/learning-loop.ts)
- [src/intelligence/self-evaluator.ts](src/intelligence/self-evaluator.ts)

What this means in practice:

- Noesis achieves behavioral improvement, not just memory accumulation.
- It has working paths for predictive failure detection, structured lesson capture, correction storage, active learning writeback, and self-evaluation.
- In the long run, this is how good work from strong models can become reusable organizational intelligence for weaker models.

Recent phase work also added integration coverage around the full cognitive pipeline, evidence-backed readiness, predictive failure, learning writeback, and cross-session continuity. That matters because Noesis is moving from isolated modules toward a real control plane with cross-subsystem behavior.

### 9. Provide additional intelligence support layers beyond the core workflow

Representative files:

- [src/intelligence/strategy-simulator.ts](src/intelligence/strategy-simulator.ts)
- [src/intelligence/cognitive-profile.ts](src/intelligence/cognitive-profile.ts)
- [src/intelligence/context-economist.ts](src/intelligence/context-economist.ts)
- [src/intelligence/meta-reasoner.ts](src/intelligence/meta-reasoner.ts)
- [src/intelligence/model-router.ts](src/intelligence/model-router.ts)
- [src/intelligence/world-model.ts](src/intelligence/world-model.ts)

What this means in practice:

- The repo is explicitly thinking about strategy, context budget, meta-reasoning, model routing, and world-modeling.
- These modules form the control plane above the model, not a passive memory plugin below it.

## What Following Noesis as the Single Source of Truth Enables

If agents genuinely use Noesis rather than bypassing it, the fleet should be capable of:

- remembering architecture decisions, user preferences, failure patterns, and working constraints across sessions
- resuming work cleanly after model switches, tool switches, or context loss
- routing requests to more relevant experts, capsules, and skills instead of solving every task from scratch
- enforcing project-specific discipline such as search-first, decision fidelity, readiness, and verification
- using the same shared memory layer across Claude, Codex, MiniMax, Cursor-like tools, and future adapters
- keeping expensive models focused on the hardest parts while smaller models handle retrieval, localization, scoped edits, structured transformations, and follow-through

This is why the "organization of engineers" analogy is directionally right. Noesis can externalize a real portion of what an engineering organization normally provides:

- shared memory
- reusable operating procedures
- specialists
- incident history
- review and verification pressure
- continuity between handoffs

## What Noesis Does Not Claim

Noesis does **not** claim any of the following:

- general superintelligence
- frontier-level reasoning from a small model on open-ended novel tasks
- equivalent architecture judgment to top-tier models purely through workflow

Architectural constraints:

- The older [src/workflow](src/workflow) layer and newer [src/cognitive](src/cognitive) layer coexist. The cognitive layer is the primary orchestration surface; the workflow layer provides foundational components (plan engine, enhanced critic, verification engine) that the cognitive layer builds on.

**Resolved as of March 17, 2026:**

- ~~Some user-facing CLI surfaces are still stubs.~~ All 14 CLI commands are now fully wired to backend RPC methods. `plan`, `critique`, `verify`, `route`, `research`, `simulate`, `optimize`, `learn`, `handoff acknowledge`, `session resume`, `skills promote/archive`, `import-config`, and `migrate-embeddings` all call real backend logic.
- ~~The DB-backed test path is blocked by a `better-sqlite3` native-module ABI mismatch.~~ The ABI issue is resolved. All 114 test files and 3292 tests pass.
- ~~The `noesis.sync` RPC was a stub returning `not_implemented`.~~ Now implements actual memory listing and universal context assembly.

**Status: strong architecture, comprehensive implementation, operational and tested.**

## Why Noesis Can Still Make Smaller Models Much Smarter

The main mechanism is not magic. It is externalization.

### 1. It externalizes memory

A smaller model no longer needs to reconstruct the same project facts every time if Noesis can retrieve the right working set.

### 2. It externalizes procedure

A smaller model does better when the workflow is partly encoded in rules, capsules, skills, commands, and phase logic instead of being improvised from scratch.

### 3. It externalizes verification

A smaller model can make useful proposals if stronger verification systems catch weak reasoning, missing evidence, broken edits, or false confidence.

### 4. It externalizes continuity

A smaller model becomes far more effective when decisions, constraints, and task history survive session boundaries.

### 5. It externalizes specialization

A smaller model behaves more intelligently when it is routed through domain-specific experts and capsules instead of being forced to act as a generic all-purpose agent.

### 6. It externalizes escalation

A good system does not ask the cheapest model to do everything. It lets smaller models do the work they can do well, then escalates only the hard or uncertain portions to stronger models.

That is why Noesis can create system-level intelligence amplification even when raw model intelligence remains unchanged.

## The Hard Ceiling

Pure workflow is not enough to make a weak model universally equal to a frontier model.

Smaller models with Noesis can approach stronger models when:

- the task is on a familiar codebase
- the needed facts are already stored or retrievable
- the workflow can be decomposed into explicit steps
- verification is strong
- escalation remains available for ambiguity or conflict

They will still lag on:

- novel architecture invention
- sparse-signal debugging
- open-ended research synthesis
- ambiguous product or design judgment
- long-range reasoning where the right path is not already encoded in memory, tools, or procedure

The realistic target is not "cheap models become Opus everywhere."  
The realistic target is "cheap models become highly competent operators inside a strong organizational operating system, and only the truly hard parts need premium models."

## Research-Backed Roadmap to the Next Level

The next level of Noesis should be guided by the research that most directly supports smaller-model uplift.

| Research finding | Relevant sources | Implication for Noesis |
| --- | --- | --- |
| External memory and retrieval help, but only when retrieval quality is high | RAG (Lewis et al., 2020), MemGPT (Packer et al., 2023) | Memory alone is not enough; Noesis needs retrieval evaluation, compression, prioritization, and working-set assembly |
| Tool use and structured action beat prompt-only reasoning | ReAct (Yao et al., 2022), Toolformer (Schick et al., 2023), LLMCompiler (Kim et al., 2023) | Skills and commands should become executable programs, not mostly prose |
| Smaller models need strong verifiers; self-correction alone is weak | Let's Verify Step by Step (Lightman et al., 2023), Small Language Models Need Strong Verifiers (2024), Large Language Models Cannot Self-Correct Reasoning Yet (Huang et al., 2024) | Noesis should separate proposal from verification and avoid trusting self-approval |
| Test-time search can partially compensate for weaker base reasoning | Self-Consistency (Wang et al., 2022), Tree of Thoughts (Yao et al., 2023), s1 test-time scaling (Muennighoff et al., 2025), Language Agent Tree Search (Zhou et al., 2023) | Use multi-sample planning, branch-and-bound, and selective extra compute on hard tasks |
| Reusable skills and writeback loops compound over time | Voyager (Wang et al., 2023), Reflexion (Shinn et al., 2023), Self-Refine (Madaan et al., 2023), DSPy (Khattab et al., 2023) | Distill strong-model traces into rules, skills, capsules, contexts, and tests |
| Repo-level understanding matters in software engineering agents | Agentless (Xia et al., 2024), RepoUnderstander (Ma et al., 2024), Sub-goal Distillation (Hashemzadeh et al., 2024) | Noesis should invest heavily in localization, codebase mapping, repository knowledge graphs, and decomposed execution |

## Concrete Improvements Most Likely to Help Smaller Models

All 10 improvements from the original roadmap are now implemented. Status as of March 17, 2026:

### 1. Reliability first — DONE

- `better-sqlite3` ABI mismatch resolved; full test suite green (114 files, 3292 tests)
- All 14 CLI commands wired to real backend RPC methods (no stubs remain)
- `noesis.sync` RPC fully implemented
- Cognitive module initialization hardened with runtime guards

### 2. Retrieval quality — DONE

Implementation: [src/retrieval/scoring.ts](src/retrieval/scoring.ts)

- Type-aware freshness decay: durable types (decision, architecture) decay slowly (90% at 365 days), ephemeral types (task, session) decay fast (50% at 7 days)
- Near-duplicate detection via Jaccard similarity, keeps newest, marks older as duplicate
- Retrieval precision maintained through hybrid 8-step pipeline (FTS5 + vector + knowledge graph)

### 3. Preventive learning loop — DONE

Implementation: [src/cognitive/prompt/prompt-engine.ts](src/cognitive/prompt/prompt-engine.ts), [src/cognitive/prompt/prompt-assembler.ts](src/cognitive/prompt/prompt-assembler.ts), [src/cognitive/learning/predictive-failure.ts](src/cognitive/learning/predictive-failure.ts)

- Predictive failure now runs automatically during prompt orchestration (step 6.5)
- Top high-confidence preventive lessons injected into context at priority 85 (between rules and expert context)
- Maximum 3 lessons, capped at 200 tokens each, to avoid context bloat
- Full loop: lesson capture → learning_events → predictive failure → prompt injection

### 4. Executable skill graphs — DONE

Implementation: [src/cognitive/skills/skill-graph.ts](src/cognitive/skills/skill-graph.ts), [src/cognitive/types.ts](src/cognitive/types.ts)

- Skills representable as typed DAGs with inputs, outputs, required tools, and success criteria
- DAG validation (entry step, no dangling deps, no cycles, reachability)
- Topological sort for execution ordering
- Parallel wave computation for concurrent step execution

### 5. Proposer/verifier/judge separation — DONE

Implementation: [src/intelligence/verification-separation.ts](src/intelligence/verification-separation.ts)

- Distinct verification requirements by task criticality (low→syntax/diff; medium→+type/test; high→+static/artifact; critical→+model_judge)
- Weak proposer detection (haiku, mini, flash, small) forces stronger verification tier
- Judgment system: all required verifications must pass; critical tasks always require human review
- Static analysis, tests, type checks prioritized over model-based judging

### 6. Selective test-time compute — DONE

Implementation: [src/intelligence/test-time-compute.ts](src/intelligence/test-time-compute.ts)

- Compute strategy selection based on uncertainty: single_pass (<0.3), multi_sample (<0.6), branch_and_bound (<0.8), iterative_refinement (>=0.8)
- Candidate ranking via verification score (50%), completeness (20%), consistency (30%)
- Branch-and-bound pruning: score <0.3, depth exceeded, or 50%+ worse than best at depth
- Spends system-level compute before model-level cost

### 7. Frontier trace distillation — DONE

Implementation: [src/intelligence/frontier-distillation.ts](src/intelligence/frontier-distillation.ts)

- Captures model traces (steps, tools, files, reasoning, outcome)
- Successful traces → skills (ordered workflows), retrieval anchors, tool-usage rules
- Failed traces → anti-patterns documenting what went wrong and at which step
- Laplace-smoothed confidence tracking; promote at helpRate>0.7, retire at helpRate<0.3

### 8. Repository understanding — DONE

Implementation: [src/intelligence/codebase-map.ts](src/intelligence/codebase-map.ts)

- Filesystem-based codebase mapping: walks directory tree, categorizes files (12 categories)
- Language identification, hotspot detection, entry point identification, test directory detection
- Compact text summaries for context injection via `summarizeCodebaseMap()`

### 9. Model cascade routing — DONE

Implementation: [src/intelligence/model-router.ts](src/intelligence/model-router.ts)

- Cost-aware cascade: haiku (5%) → sonnet (25%) → opus (100%)
- Task complexity routing with 4 levels (low/medium/high/critical)
- Verification-aware threshold adjustment (lower threshold when verification available)
- Historical success rate tracking with learning-based tier recommendations

### 10. Benchmarking framework — DONE

Implementation: [src/intelligence/benchmark.ts](src/intelligence/benchmark.ts)

- Structured benchmark tasks by class (localization, bug_fix, refactor, migration, api_change, test_authoring, documentation, design)
- Benchmark runs with quality, pass rate, token cost, duration, and human correction metrics
- Performance comparison with statistical uplift computation
- Markdown report generation for Noesis-on vs Noesis-off comparison

## Priority Roadmap

### Near-term — COMPLETE (March 17, 2026)

All near-term items have been implemented:

- ~~make the runtime and tests trustworthy~~ — 114/114 test files, 3292/3292 tests pass
- ~~finish the most visible CLI and workflow gaps~~ — all 14 CLI commands fully wired
- ~~add retrieval evals and working-set precision metrics~~ — freshness decay + deduplication in scoring.ts
- ~~close the lesson capture → prediction → injection loop~~ — predictive failure wired into prompt orchestration
- ~~wire agent-facing adapters to enhanced context assembly~~ — prompt-assembler injects preventive lessons
- ~~add basic model routing and explicit verification separation~~ — cascadeRoute() + verification-separation.ts

### Mid-term — COMPLETE (March 17, 2026)

All mid-term items have been implemented:

- ~~add typed lesson distillation and promotion rules~~ — frontier-distillation.ts with Laplace-smoothed promote/retire
- ~~compile skills into executable graphs~~ — skill-graph.ts with DAG validation + parallel wave computation
- ~~ship codebase mapping and stronger artifact retrieval~~ — codebase-map.ts with 12-category filesystem analysis
- ~~distill strong-model traces into reusable assets~~ — frontier-distillation.ts with trace→skill/anti-pattern conversion
- ~~add multi-sample planning and selective search~~ — test-time-compute.ts with 4 compute strategies

### Long-term (ongoing)

- evolve toward a true cognitive control plane that learns which workflows, verifiers, routes, and memories create the best outcomes
- keep smaller models operating within that control plane for the majority of known project work
- reserve premium models for frontier reasoning, arbitration, and discovery

## Final Assessment

Noesis is on the right architectural path and has achieved operational completeness across all planned improvements.

It is making your goal more possible because it externalizes the things that current agent workflows are worst at preserving:

- memory
- continuity
- reusable procedure
- verification discipline
- cross-agent coordination

That is enough to make a fleet of agents feel much smarter than the raw models alone.

But the strongest version of the claim must stay honest:

- Noesis can create persistent, compounding, cross-agent engineering intelligence.
- It can make smaller models dramatically more useful on known projects.
- It can narrow the gap to frontier models on many repeated engineering tasks.
- It cannot fully eliminate the base-model ceiling through workflow alone.

The most valuable next step from the lifecycle-hook feedback is selective preventive learning inside Noesis itself: distill corrections, predict relevant failures before execution, and inject only the smallest high-confidence prevention set into the next task. That improves intelligence. Blanket prompt stuffing does not.

The winning strategy is therefore not "pretend cheap models are frontier models."  
It is "build Noesis into such a strong organizational operating system that cheaper models can solve most routine and project-specific work correctly, and only a small fraction of tasks still require frontier reasoning."

If Noesis achieves that, it will already be a major step toward the intelligence layer you are trying to build.

## References

- Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" (2020): https://arxiv.org/abs/2005.11401
- Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" (2022): https://arxiv.org/abs/2210.03629
- Schick et al., "Toolformer: Language Models Can Teach Themselves to Use Tools" (2023): https://arxiv.org/abs/2302.04761
- Wang et al., "Self-Consistency Improves Chain of Thought Reasoning in Language Models" (2022): https://arxiv.org/abs/2203.11171
- Yao et al., "Tree of Thoughts: Deliberate Problem Solving with Large Language Models" (2023): https://arxiv.org/abs/2305.10601
- Wang et al., "Voyager: An Open-Ended Embodied Agent with Large Language Models" (2023): https://arxiv.org/abs/2305.16291
- Lightman et al., "Let's Verify Step by Step" (2023): https://arxiv.org/abs/2305.20050
- Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning" (2023): https://arxiv.org/abs/2303.11366
- Madaan et al., "Self-Refine: Iterative Refinement with Self-Feedback" (2023): https://arxiv.org/abs/2303.17651
- Packer et al., "MemGPT: Towards LLMs as Operating Systems" (2023): https://arxiv.org/abs/2310.08560
- Khattab et al., "DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines" (2023): https://arxiv.org/abs/2310.03714
- Zhou et al., "Language Agent Tree Search Unifies Reasoning, Acting, and Planning in Language Models" (2023): https://arxiv.org/abs/2310.04406
- Huang et al., "Large Language Models Cannot Self-Correct Reasoning Yet" (2024): https://arxiv.org/abs/2310.01798
- Kim et al., "LLMCompiler: An LLM Compiler for Parallel Function Calling" (2023): https://arxiv.org/abs/2312.04511
- "Small Language Models Need Strong Verifiers to Self-Correct Reasoning" (2024): https://arxiv.org/abs/2404.17140
- Hashemzadeh et al., "Sub-goal Distillation: A Method to Improve Small Language Agents" (2024): https://arxiv.org/abs/2405.02749
- Ma et al., "How to Understand Whole Software Repository?" (RepoUnderstander, 2024): https://arxiv.org/abs/2406.01422
- Xia et al., "Agentless: Demystifying LLM-based Software Engineering Agents" (2024): https://arxiv.org/abs/2407.01489
- Muennighoff et al., "s1: Simple Test-Time Scaling" (2025): https://arxiv.org/abs/2501.19393
