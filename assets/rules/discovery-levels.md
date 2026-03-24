---
name: discovery-levels
description: Calibrate research depth to task scope — from quick pattern extension to full architectural investigation
triggers:
  - research
  - investigation
  - discovery
  - analysis
  - unknown
priority: medium
---

# Discovery Levels

## Rule

Match research depth to the scope of the change. Not every task requires deep investigation. Not every task can be solved with a quick search. Calibrate.

## Levels

### Level 0: Existing Pattern Extension

**When:** Adding another instance of a pattern that already exists in the codebase.

- Search for the existing pattern
- Follow it exactly
- No external research needed
- **Time budget:** < 5 minutes of research

**Example:** Adding a new API endpoint when 10 similar endpoints already exist.

### Level 1: Quick Verification

**When:** You know the approach but need to confirm a specific detail (syntax, version, API signature).

- Verify the specific detail
- Check compatibility with current stack
- No broad exploration
- **Time budget:** 5-15 minutes

**Example:** Confirming the correct parameter order for a library function.

### Level 2: Standard Research

**When:** Implementing something that does not have an exact precedent in the codebase, but the problem domain is well-understood.

- Research approaches and best practices
- Evaluate fit with existing architecture
- Document findings for reuse
- Record in project research notes
- **Time budget:** 15-60 minutes

**Example:** Adding caching to a service that does not currently cache. Caching patterns are well-known, but the right strategy depends on the data characteristics.

### Level 3: Architectural Research

**When:** Making a decision that will be expensive to reverse, affects multiple components, or ventures into unfamiliar territory.

- Capture assumptions explicitly
- Document rejected options with reasons
- Record decision rationale
- Identify what would trigger reconsideration
- **Time budget:** 1-4 hours (may span sessions)

**Example:** Choosing a message queue system, designing a new authentication flow, migrating from one database to another.

## Selecting the Right Level

```
Is there an existing pattern in the codebase to follow?
  YES → Level 0
  NO  ↓

Do you know the approach and just need to verify a detail?
  YES → Level 1
  NO  ↓

Is the problem domain well-understood with established solutions?
  YES → Level 2
  NO  → Level 3
```

## Anti-patterns

- **Over-researching simple changes.** Spending an hour researching how to add a field to an existing form. Level 0: find an existing field, follow the pattern.
- **Under-researching architectural changes.** Picking a database based on a blog post. Level 3: evaluate options, document trade-offs, identify reversal cost.
- **Research without output.** Spending time investigating but not recording findings. Level 2+ research should produce a reusable artifact.
