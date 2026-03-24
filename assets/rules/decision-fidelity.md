---
name: decision-fidelity
description: Honor locked architectural and design decisions across all phases of work — planning, implementation, and validation
triggers:
  - implementation
  - planning
  - architecture
  - design decision
  - override
priority: high
---

# Decision Fidelity

## Rule

Locked decisions must be honored in every phase of work. If a decision has been explicitly made and documented, implementation must follow it — or the decision must be explicitly renegotiated with the decision maker before proceeding.

## Why This Matters

Decisions represent resolved trade-offs. Re-opening them silently during implementation wastes the analysis time, introduces inconsistency, and breaks trust between planning and execution. The most common form of technical debt is not bad code — it is code that contradicts documented decisions without explanation.

## Decision Categories

| Category | Binding Level | Override Requires |
|---|---|---|
| **Locked** | Must follow exactly | Explicit renegotiation with decision maker |
| **Deferred** | Not yet decided — may need resolution | Decision before implementation begins |
| **Discretionary** | Implementation choice within constraints | Developer judgment, consistent with existing patterns |

## Enforcement

### Before Implementation

1. Check for existing decisions relevant to the current work (architecture docs, ADRs, `decisions.md`, prior planning artifacts)
2. List which decisions apply to this change
3. If any planned approach contradicts a locked decision, stop and surface the conflict

### During Implementation

1. Every implementation choice is either:
   - Following a locked decision (cite it)
   - Exercising discretion within a locked decision's constraints
   - Making a new decision where none exists (document it)
2. If you discover a locked decision is wrong or outdated, do not silently override. Flag it, explain why it should change, and get explicit approval.

### Self-Check

Before marking work complete:
- Does every implementation choice align with documented decisions?
- Are new discretionary choices documented for future reference?
- Were any locked decisions overridden? If so, is the override documented with rationale?

## Anti-patterns

- **Silent override.** Implementing differently from the decision without mentioning it. The decision document says one thing, the code does another, and nobody notices until a bug surfaces.
- **Decision erosion.** Gradually drifting from decisions through a series of small exceptions. Each exception is "small," but the cumulative effect is a system that contradicts its own design.
- **Premature locking.** Locking decisions before sufficient information is available. Decisions locked too early become obstacles. Lock decisions when the trade-offs are understood, not before.
