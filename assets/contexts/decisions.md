---
name: decisions
description: Template for recording locked architectural and design decisions that must be honored across all phases of work
type: project-state
---

# Decisions

Locked decisions that survive across planning, implementation, and validation phases. All implementation must honor these unless explicitly renegotiated.

## How to Use This File

- **Locked:** Must follow. Override requires explicit discussion and approval.
- **Deferred:** Not yet decided. Must be resolved before implementation touches this area.
- **Discretionary:** Implementation choice within the constraints of locked decisions.

When adding a decision, include: what was decided, why (trade-off reasoning), what alternatives were rejected, and what would trigger reconsideration.

## Template

```markdown
### [Decision Title]

**Status:** Locked | Deferred | Discretionary
**Date:** YYYY-MM-DD
**Context:** Why this decision was needed

**Decision:** What was chosen

**Reasoning:** Why this option over alternatives

**Alternatives Rejected:**
- [Option B] — rejected because [reason]
- [Option C] — rejected because [reason]

**Reconsider When:** [Condition that would invalidate this decision]
```

## Decisions

<!-- Add project decisions below this line -->
