---
name: create-pr
description: Generate a professional GitHub PR description by inspecting the actual diff, sizing the change, and structuring the explanation proportionally
triggers:
  - PR
  - pull request
  - create PR
---

# Create Pull Request

## Purpose

Generate a professional, well-structured PR description based on the actual changes in the branch. Description quality scales with change complexity.

## Workflow

### 1. Inspect the Diff

Before writing anything:

- Run `git diff main...HEAD` (or appropriate base branch) to see all changes
- Run `git log main...HEAD --oneline` to see commit history
- Count files changed and lines added/removed

### 2. Size the PR

| Size | Lines Changed | Description Approach |
|---|---|---|
| **Small** (< 50 lines) | Quick bug fix, config change | 2-3 sentences. What and why. |
| **Medium** (50-400 lines) | Feature, refactor | Structured description with sections |
| **Large** (> 400 lines) | Major feature, migration | Detailed description. Consider splitting. |

### 3. Structure the Description

```markdown
## Summary

[1-3 bullet points describing WHAT changed and WHY]

## Changes

[For medium/large PRs: list the significant changes by area]

- **[Area 1]:** What changed and why
- **[Area 2]:** What changed and why

## Test Plan

[How to verify this works]

- [ ] [Specific verification step 1]
- [ ] [Specific verification step 2]

## Notes for Reviewers

[Optional: What to focus on, what is intentionally left for later, known limitations]
```

### 4. Quality Rules

- **Title:** Under 70 characters. Imperative mood. Describes the change, not the ticket.
- **Summary:** Answers "why" not just "what." The diff shows what changed — the description explains the motivation.
- **Test plan:** Specific enough that a reviewer can verify the change works.
- **No filler:** Do not pad with boilerplate sections that add no information.
- **Proportional detail:** A one-line bug fix does not need a 500-word description. A complex refactor does.
- **Screenshots:** Include for visual changes. Before/after if applicable.
