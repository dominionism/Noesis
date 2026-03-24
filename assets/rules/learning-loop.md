---
name: learning-loop
description: Self-improvement cycle triggered by corrections, failures, and repeated patterns — diagnose, fix locally, write durable lesson
triggers:
  - correction
  - failure
  - error
  - mistake
  - improvement
  - feedback
priority: high
---

# Learning Loop

## Rule

When a correction, failure, or repeated pattern is detected, execute a structured improvement cycle. Do not simply fix the immediate problem — determine whether the failure reveals a systemic gap that will recur.

## Trigger Conditions

| Trigger | Signal | Response |
|---|---|---|
| **User correction** | User says "no, do X instead" or "that's wrong because..." | Diagnose why the wrong approach was chosen |
| **Test failure after implementation** | Tests fail in a way that reveals a misunderstanding | Identify the incorrect assumption |
| **Repeated failure pattern** | Same type of mistake occurs for the second time | Escalate: this is now a systemic gap |
| **Unexpected behavior** | A tool, library, or system behaves differently than expected | Record the correct behavior for future reference |

## Loop Steps

### 1. Diagnose

Do not jump to fixing. First understand:

- **What went wrong?** Specific, factual description of the failure.
- **Why did it happen?** Root cause — not "I made a mistake" but "I assumed X when the actual behavior is Y because Z."
- **Is this a one-off or a pattern?** Has this type of failure happened before? Could it happen again?

### 2. Apply Local Fix

Fix the immediate problem in the current work:

- Correct the code, output, or approach
- Verify the fix resolves the issue
- Ensure no regressions

### 3. Evaluate for Durable Lesson

Not every fix needs a lesson. Apply the capture criteria:

```
Is this verified (not a hunch)?
  NO → Stop here. Fix was sufficient.
  YES ↓

Will this situation recur in future work?
  NO → Stop here. One-off fix.
  YES ↓

Is the lesson specific enough to change behavior?
  NO → Refine until it is, or stop.
  YES → Record the lesson.
```

### 4. Record Lesson (if applicable)

Write a learning entry with: trigger, lesson, evidence, and confidence level.

### 5. Consider Workflow Improvement

For high-confidence, high-impact lessons:

- Should this become a rule that is checked automatically?
- Should an existing expert or skill be updated to account for this?
- Should this be added to a verification checklist?

**Constraint:** Never silently modify core rules, experts, or skills. Propose the change and explain the evidence. Changes to shared assets require explicit approval.

## Example

```
Trigger: User corrected my approach to adding a database index.

Diagnosis: I suggested adding a standard B-tree index for a JSONB field query.
The correct approach is a GIN index, because B-tree indexes cannot efficiently
query inside JSON documents. My assumption was that B-tree is the default
choice for all index types.

Local Fix: Changed the migration to use CREATE INDEX ... USING GIN.

Durable Lesson: Yes — this will recur whenever indexing JSONB columns.
Recorded: "PostgreSQL JSONB queries require GIN indexes, not B-tree.
B-tree indexes on JSONB columns only support equality comparison on the
entire document, not containment or key-path queries."

Workflow Improvement: Consider adding this to the database-engineer expert's
index selection table.
```

## Anti-patterns

- **Fix and forget.** Fixing the immediate problem without diagnosing why it happened. The same mistake will recur.
- **Over-correcting.** A single failure causing a sweeping rule change. One mistake with a GIN index does not mean all index decisions need a review process. Proportional response.
- **Lesson without evidence.** "Always use GIN indexes for JSON" is wrong. "Use GIN indexes for JSONB containment and key-path queries" is correct. Precision matters.
- **Silent rule changes.** Modifying shared rules or skills based on a single incident without discussion. Changes to shared assets need visibility.
