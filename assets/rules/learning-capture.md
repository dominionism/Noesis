---
name: learning-capture
description: Capture only durable, verified learnings that change future behavior — not debugging notes or unverified hunches
triggers:
  - lesson
  - learning
  - mistake
  - correction
  - failure
  - retrospective
priority: medium
---

# Learning Capture

## Rule

Capture learnings only when they are durable, verified, and specific enough to change future behavior. Not every debugging session produces a lesson. Not every correction is worth recording.

## What to Capture

A learning is worth recording when it meets ALL of these criteria:

| Criterion | Test |
|---|---|
| **Verified** | The learning was confirmed by evidence (a test, a user correction, a production incident) — not a hunch |
| **Reusable** | The same situation will arise again in future work |
| **Specific** | The learning is precise enough to change behavior when encountered again |
| **Non-obvious** | Someone encountering the same situation would not naturally avoid the mistake |

## Learning Format

```
## [Short Description]

**Trigger:** What situation activates this lesson
**Lesson:** What to do (or not do) when the trigger occurs
**Why:** Evidence that led to this lesson (the correction, failure, or incident)
**Confidence:** High (verified multiple times) | Medium (verified once) | Low (inferred)
```

## What NOT to Capture

- **Temporary debugging notes.** "The bug was on line 45 of order-service.ts" — this is session context, not a lesson.
- **Unverified hunches.** "I think this might cause problems if..." — wait until verified.
- **Obvious practices.** "Always test your code before committing" — this is general knowledge, not a specific learning.
- **One-off incidents.** A bug caused by a typo does not need a lesson. A bug caused by a systemic misunderstanding does.
- **Repetitive captures.** If the same lesson is already recorded, update confidence — do not create a duplicate.

## Capture Triggers

Record a learning when:

1. **User correction.** The user corrects an approach or output, and the correction applies beyond this specific instance.
2. **Production incident.** A bug or outage reveals a gap in understanding that affects how similar work should be done.
3. **Repeated failure.** The same mistake or pattern occurs for the second time. First time is a mistake. Second time is a lesson.
4. **Surprising behavior.** A library, framework, or system behaves differently than expected in a way that would surprise others.

## Anti-patterns

- **Lesson hoarding.** Capturing every observation as a lesson. The lesson store becomes so large that nothing is findable. Quality over quantity.
- **Vague lessons.** "Be more careful with database queries." This changes nothing. "PostgreSQL `SELECT FOR UPDATE` acquires a row-level lock that blocks other `FOR UPDATE` queries but not regular `SELECT`" changes behavior.
- **Unattributed lessons.** Recording a rule without the evidence. Six months later, nobody knows if the lesson is still valid or was based on outdated information.
