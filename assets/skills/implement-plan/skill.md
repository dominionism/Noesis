---
name: implement-plan
description: Execute an implementation plan phase by phase with verification checkpoints
---

# Implement Plan

Execute an implementation plan sequentially, phase by phase. Each phase is verified before proceeding. Manual checkpoints require explicit user confirmation.

## Initial Setup

1. **If a plan path was provided as a parameter**, read the plan file fully before doing anything else.
2. **Resolve the current project context with `node ~/.agents/scripts/project-context.mjs current` and read the current project's `state.md` before starting work.**
3. **Read `~/.agents/contexts/decisions.md` before starting work.**

4. **If no parameter was provided**, ask:
   ```
   Please provide the path to the plan file.
   Example: /absolute/path/to/.agents/thoughts/plans/2026-02-17-my-feature.md
   ```
   Wait for the user to provide the path, then read the file fully.

5. **Confirm readiness**:
   ```
   I've read the plan. It has [N] phases:
   1. [Phase 1 name] — [one-line goal]
   2. [Phase 2 name] — [one-line goal]
   ...

   Ready to begin. Shall I start with Phase 1?
   ```
   Wait for user confirmation before starting any phase, unless the user invoked this command with explicit pre-approval (e.g., "implement the plan, start immediately").

---

## Execution Loop

Repeat the following for each phase in the plan:

### Step 1: Announce the Phase

State clearly:
- Which phase you are starting (number and name)
- What the goal of this phase is
- What files will be touched

Before editing:
- Update the current project's `state.md` with the active workflow, phase name, next step, and related plan path

Ask the user to confirm before proceeding, unless they've already pre-approved all phases.

### Step 2: Execute Phase Tasks

Work through every task listed in the phase:
- Make changes incrementally — one logical unit at a time
- After each file change, briefly state what was changed and why (one sentence is enough)
- If a task is ambiguous, stop and ask — do not guess
- Keep changes atomic: each logical unit should be independently reviewable

### Step 3: Run Automated Verification

After all tasks in a phase are complete:
- Execute every command listed under "Automated Verification" in the phase
- Document the result of each check (pass / fail)
- **If any check fails: STOP**
  - Diagnose the root cause
  - Fix it
  - Re-run the failing check
  - Do not proceed to Step 4 until all automated checks pass

If the plan has no automated verification commands for a phase, note this and move to Step 4.

### Step 4: Manual Verification Checkpoint

Present the manual verification checklist from the plan:
```
Phase [N] automated checks passed. Before I move on, please verify:

- [ ] [Manual check 1]
- [ ] [Manual check 2]
...

Reply "done" or "confirmed" when you've verified these, or describe any issues you found.
```

**Do NOT auto-advance.** Wait for explicit confirmation from the user.

### Step 5: Mark Phase Complete

After the user confirms:
- Update the plan file: check off completed items (`- [ ]` → `- [x]`)
- Update the current project's `state.md` with the completed phase, next phase or completion state, blockers if any, and the latest verification timestamp
- State: "Phase [N] complete." and announce the next phase, or "All phases complete." if done

---

## Context Recovery

If this is a long session and you suspect context drift:
- Re-read the plan file before starting each new phase
- Re-read the current project's `state.md` before starting each new phase
- This costs a few seconds and prevents costly mistakes

---

## Important Rules

- **Never skip a phase** or reorder them without explicit user instruction
- **Never proceed past a failed automated check** — fix it first
- **Never proceed past a manual checkpoint** without explicit user confirmation
- **Never guess on ambiguous tasks** — ask
- **Keep changes atomic** — one logical unit per logical commit
- **If you discover scope not in the plan**, flag it before acting on it:
  ```
  I noticed [X] which isn't in the plan. Should I:
  A) Address it now (extends scope)
  B) Skip it and continue
  C) Add it as a note for later
  ```

---

## Completion

When all phases are complete:

1. Summarize what was built:
   ```
   All phases complete. Here's what was implemented:
   - Phase 1: [summary]
   - Phase 2: [summary]
   ...
   ```

2. Point to next steps:
   - Run `/validate_plan` with this plan file for final verification
   - Run `/cm` to create commits if you haven't done so inline

---

## Relationship to Other Commands

Recommended RPI workflow:
1. `/research_codebase` — document the current state
2. `/create-plan` — design the implementation plan
3. `/implement_plan` — execute it (this command)
4. `/validate_plan` — verify correctness
5. `/cm` — commit the work
