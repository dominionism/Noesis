---
name: lessons-learned
description: Verified, durable lessons from past corrections, incidents, and failures — indexed by trigger condition
type: learning
---

# Lessons Learned

Durable lessons extracted from verified failures and corrections. Each entry is specific enough to change behavior when the trigger condition is encountered again.

## Quality Bar

A lesson belongs here only when it is:
- **Verified** by evidence (test, user correction, incident) — not speculation
- **Reusable** across future work — not a one-off debugging note
- **Specific** enough to change behavior — not generic advice
- **Non-obvious** — someone encountering the situation would not naturally avoid the mistake

## Writeback Policy

- **Auto-write:** Local lessons from verified corrections within a session
- **Propose only:** Changes to shared rules, experts, or skills (require explicit approval)
- **Never:** Silently rewriting core prompts or behavioral rules

## Template

```markdown
### [Short Description]

**Trigger:** When this lesson applies (the situation that activates it)
**Lesson:** What to do (or not do)
**Why:** The evidence — what happened that taught this
**Confidence:** High (verified multiple times) | Medium (verified once)
**Date:** YYYY-MM-DD
**Source:** [Correction | Incident | Test failure | Repeated pattern]
```

## Lessons

<!-- Add verified lessons below this line -->
