---
name: systematic-debugging
description: Hypothesis-driven debugging methodology with isolation techniques and cognitive bias awareness
category: engineering
triggers:
  - debug
  - bug
  - broken
  - not working
  - unexpected behavior
  - regression
  - investigate
  - root cause
chain_with:
  - error-handling-resilience
  - observability-patterns
---

# Systematic Debugging

## Purpose

A disciplined debugging methodology that prevents the most common mistake: changing things randomly until the bug disappears (or appears to disappear). This skill enforces hypothesis-driven investigation with explicit isolation steps.

## When to Use

- When a bug report comes in and the cause is not immediately obvious
- When a fix attempt did not resolve the issue
- When multiple things seem broken and you are unsure which is the root cause
- When you have been staring at the same bug for more than 15 minutes without progress

## The Method

### Step 1: Reproduce Before Investigating

Do not read code until you can reliably trigger the bug.

- **Define the exact reproduction steps.** Input, action, expected result, actual result.
- **Verify the reproduction is consistent.** If it is intermittent, note the frequency and conditions.
- **Create a minimal reproduction.** Strip away everything unrelated. The smallest possible case that demonstrates the bug.

**If you cannot reproduce it:** Gather more information (logs, user session data, environment differences). Do not guess at causes based on code reading alone.

### Step 2: Form a Hypothesis

Based on the reproduction, state a specific, falsifiable hypothesis:

```
VAGUE (useless): "Something is wrong with the database."
SPECIFIC (testable): "The query in getUserOrders() returns stale data because
  the cache is not invalidated after order creation."
```

**A good hypothesis:**
- Identifies a specific location (file, function, line)
- Identifies a specific mechanism (what is happening wrong)
- Can be proven false with a single test or observation
- Does not require reading the entire codebase to verify

### Step 3: Test the Hypothesis (One Variable at a Time)

Design an experiment that proves or disproves the hypothesis. Change exactly ONE thing.

```
Hypothesis: "Cache is not invalidated after order creation."
Test: Add a log line after order creation that reads the cache key.
      If the cache still has the old value → hypothesis confirmed.
      If the cache is empty or updated → hypothesis disproved.
```

**Critical rule:** Do not change multiple things simultaneously. If you modify the cache AND the query AND the component, and the bug disappears, you do not know which change fixed it. You might have masked the bug instead of fixing it.

### Step 4: Isolate the Root Cause

If the hypothesis is confirmed, trace backward to find the root cause:

**Five Whys:**
1. Why is the cache stale? → Because invalidation is not called after order creation.
2. Why is invalidation not called? → Because the create function does not know about the cache.
3. Why does it not know? → Because caching was added after the create function was written, and no one updated it.
4. Why was it not caught? → Because there are no integration tests that create an order and then read it.
5. Why are there no integration tests? → Because the test suite only has unit tests with mocked data.

**Root cause:** Missing integration test coverage for cache consistency. The fix is both invalidating the cache AND adding the integration test.

### Step 5: Fix and Verify

1. Write a test that reproduces the bug (it should fail before the fix).
2. Apply the minimal fix.
3. Verify the test passes.
4. Verify the original reproduction steps no longer exhibit the bug.
5. Check for related occurrences of the same pattern elsewhere in the codebase.

## Isolation Techniques

Choose the technique based on what you know:

### Binary Search (Bisect)

**When:** You know it worked at some point and now it does not. There is a range of changes between "worked" and "broken."

**Method:** Find the midpoint between the last known good state and the current broken state. Test at the midpoint. If broken, the bug is in the first half. If working, the bug is in the second half. Repeat.

**Implementation:** `git bisect start`, mark good and bad commits, git finds the breaking change.

**Best for:** Regressions with clear before/after states. Especially effective with automated tests.

### Differential Debugging

**When:** The same code works in one environment but not another. Or it works for one user but not another.

**Method:** Identify every difference between the working and non-working cases. Eliminate differences one by one until you find the one that matters.

| Dimension | Working | Broken |
|---|---|---|
| Environment | staging | production |
| Data | test user | real user |
| Config | default | custom rate limits |
| Version | v2.3.0 | v2.3.1 |

Align one dimension at a time. When aligning a dimension makes the broken case work, that dimension contains the cause.

**Best for:** Environment-specific bugs, user-specific bugs, "works on my machine."

### Trace Logging

**When:** The control flow is complex and you need to see what actually executes.

**Method:** Add temporary log statements at key decision points. Log the actual values, not just "reached here."

```
// BAD: tells you it reached this line, not what happened
console.log("DEBUG: here");

// GOOD: tells you the actual state
console.log("DEBUG getUserOrders", { userId, cacheHit: !!cached, orderCount: orders.length });
```

**After debugging:** Remove all trace logs. Every one. Use structured logging for permanent observability.

**Best for:** Complex conditional logic, async flows where execution order is unclear.

### Rubber Duck Explanation

**When:** You have been staring at the code for more than 30 minutes and are stuck.

**Method:** Explain the bug, your hypotheses, and your evidence to an inanimate object (or a colleague who does not need to understand the codebase). The act of articulating forces you to identify gaps in your reasoning.

**What to explain:**
1. What the code is supposed to do
2. What it actually does
3. The specific input that triggers the difference
4. What you have already tried and what you observed
5. What you think the cause is and why

**Best for:** When you are too deep in the code to see the obvious. When assumptions need to be surfaced.

### Minimal Reproduction

**When:** The bug occurs in a complex system and you need to isolate which part is responsible.

**Method:** Start with the full system reproducing the bug. Remove components one at a time. When removing a component makes the bug disappear, that component is involved. Reduce further until you have the smallest possible system that exhibits the bug.

**Best for:** Bugs involving multiple interacting systems, race conditions, integration issues.

## Cognitive Biases in Debugging

### Confirmation Bias

**Pattern:** You believe the bug is in module X, so you only look at module X. Evidence pointing elsewhere is ignored.

**Prevention:** Before investigating, write down your top 3 hypotheses. Actively try to disprove your favorite one first. If you cannot disprove it after 10 minutes of trying, then it is probably correct.

### Anchoring

**Pattern:** The first thing you notice becomes your fixation. Someone says "it might be the cache" and you spend two hours on the cache even though the evidence points elsewhere.

**Prevention:** Write down all hypotheses before investigating. Rank by likelihood based on evidence, not by order of suggestion.

### Recency Bias

**Pattern:** "I just changed the auth module, so the bug must be in the auth module." Recent changes are suspicious but not always guilty.

**Prevention:** Check `git log` and `git diff` to verify whether recent changes are actually in the code path that exhibits the bug. If they are not in the path, they are not the cause.

### Availability Bias

**Pattern:** "Last time we had this symptom, it was a DNS issue." Past experience makes you jump to a familiar cause even when the current evidence does not support it.

**Prevention:** The hypothesis must explain the specific evidence. "DNS issue" must explain why this specific endpoint, for this specific user, with this specific input fails. If it does not, it is not DNS.

## Time-Boxing

If you have spent more than the following time without progress, change approach:

| Duration | Action |
|---|---|
| **15 minutes** | Stop and re-read the reproduction steps. Are you reproducing the right bug? |
| **30 minutes** | Switch isolation technique. If you were reading code, add trace logging. If you were logging, try binary search. |
| **60 minutes** | Explain the problem to someone (rubber duck or human). Write down everything you know and everything you have tried. |
| **2 hours** | Step away. Work on something else. Return with fresh eyes. If still stuck, pair with another developer. |

## Verification

Debugging is complete when:
1. The root cause is identified (not just the symptom)
2. A test exists that fails before the fix and passes after
3. The original reproduction steps no longer exhibit the bug
4. Related patterns in the codebase have been checked
5. The fix is minimal (does not include unrelated changes)
