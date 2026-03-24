---
name: iterate-plan
description: Surgically adjust an existing plan when scope or approach needs to change
---

# Iterate Plan

Surgically adjust an existing plan when requirements change, new information emerges, or a phase reveals unexpected complexity. This command edits the minimum necessary — it does not rewrite from scratch.

## When to Use This

- A phase revealed unexpected complexity that changes the approach
- Requirements changed after the plan was written
- An automated check failed and the fix alters the planned approach
- You want to add, remove, or reorder phases without restarting
- The "What We're NOT Doing" section needs updating

## When NOT to Use This

- The plan is fundamentally wrong and needs to be replaced — use `/create-plan` instead
- You just want to mark items complete — do that directly in `/implement_plan`

---

## Initial Setup

1. **If a plan path was provided as a parameter**, read the plan file fully before doing anything else.

2. **If no parameter was provided**, ask:
   ```
   Please provide the path to the plan file.
   Example: /absolute/path/to/.agents/thoughts/plans/2026-02-17-my-feature.md
   ```
   Wait for the user to provide the path, then read the file fully.

3. **Also read recent git diff for context** (if inside a git repo):
   ```bash
   git diff HEAD --stat
   git log --oneline -5
   ```

4. **Ask what needs to change**:
   ```
   I've read the plan. What needs to change, and why?
   ```
   Wait for the user's answer before touching the file.

---

## Process

### Step 1: Understand the Delta

Before proposing any edit, establish:
- What is the specific problem with the current plan?
- Which phases are affected? (List them by number and name)
- What kind of change is this?
  - **Scope change** — adding or removing what we're building
  - **Technical change** — same goal, different implementation approach
  - **Approach change** — restructuring phases or dependencies
  - **Discovery** — something found during implementation changes the plan

Ask clarifying questions if the nature of the change is unclear. Do not touch the plan until you understand the delta precisely.

### Step 2: Propose the Minimal Surgical Edit

State exactly what you plan to change before making any edits:
```
Here's what I propose to change:

1. [Phase X] — [what changes and why]
2. [New phase to insert] — [why it's needed]
3. [Section Y in Overview] — [what updates]

Everything else stays the same.

Should I proceed?
```

Wait for confirmation.

### Step 3: Make the Edit

Change only what was agreed on:
- **Adding a phase**: Insert it with full success criteria (automated + manual), consistent with the plan's existing structure
- **Removing a phase**: Replace it with a struck-through note explaining why it was removed. Do not silently delete:
  ```
  ~~## Phase N: [Name]~~ — Removed: [reason]
  ```
- **Changing approach**: Update the "Implementation Approach" section and all affected phases. Leave unaffected phases untouched.
- **Updating scope**: Update "What We're NOT Doing" and "Desired End State" to match

### Step 4: Verify Consistency

After editing, before showing the user:
- Do phase dependencies still make sense in the new order?
- Do success criteria still cover the full scope?
- Is "What We're NOT Doing" still accurate?
- Are there any references to removed phases or approaches still in the document?

Fix any inconsistencies silently as part of the edit.

### Step 5: Present the Diff

Show the user exactly what changed:
```
Here's what I changed in the plan:

**Added:**
- [New phase or section]

**Modified:**
- [What was changed in existing section]

**Removed:**
- [What was removed, with note preserved]

The plan now has [N] phases. Resume from Phase [X].
```

Ask for confirmation before the changes are considered final.

### Step 6: Hand Off

State clearly where to resume:
```
Plan updated. Resume with Phase [N]: [Phase Name].
Use /implement_plan /absolute/path/to/.agents/thoughts/plans/[filename].md to continue.
```

---

## Important Rules

- **Minimal edits only** — resist the urge to clean up or improve unrelated sections
- **Never silently delete** — always leave a note when removing a phase or section
- **Preserve completed work** — do not alter phases already marked `[x]` without explicit instruction
- **Ask before acting** — always confirm the proposed edit before writing to the file
- **One change at a time** — if multiple unrelated changes are needed, handle them sequentially

---

## Relationship to Other Commands

```
/research_codebase → /create-plan → /implement_plan → [issue found] → /iterate_plan → /implement_plan → /validate_plan
```

`/iterate_plan` sits between phases in the execution loop when something forces a mid-course correction.
