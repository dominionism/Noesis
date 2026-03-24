---
name: git-workflow
description: Commit structure, atomic commits, branch naming, PR discipline, rebase vs merge, conflict resolution, and bisect debugging
category: engineering
triggers:
  - git
  - commit
  - branch
  - pull request
  - merge
  - rebase
  - conflict
  - git history
  - bisect
chain_with:
  - code-review-excellence
  - pr-workflow
---

# Git Workflow

## Purpose

Concrete conventions for maintaining a clean, reviewable, debuggable git history. Not about git commands — about the discipline that makes collaboration efficient and debugging possible.

## When to Use

- When making commits during feature development
- When creating branches for new work
- When preparing a pull request
- When resolving merge conflicts
- When investigating when a bug was introduced
- When reviewing someone else's git history

## Commit Structure

### Format

```
type(scope): description

Optional body explaining WHY, not WHAT.
The diff shows WHAT changed. The message explains WHY.

Optional footer with references.
Refs: #123
```

### Type Catalog

| Type | When to use | Example |
|---|---|---|
| `feat` | New functionality visible to users | `feat(auth): add password reset flow` |
| `fix` | Bug fix | `fix(orders): correct tax calculation for zero-tax states` |
| `refactor` | Code restructuring with no behavior change | `refactor(api): extract validation into middleware` |
| `test` | Adding or fixing tests only | `test(auth): add integration tests for token refresh` |
| `docs` | Documentation only | `docs(api): document rate limit headers` |
| `chore` | Build, CI, dependencies, tooling | `chore(deps): update express to 4.19.2` |
| `perf` | Performance improvement | `perf(search): add database index for user lookup` |
| `style` | Formatting, whitespace, semicolons | `style: apply prettier formatting` |

### Scope

The module, component, or area affected. Keep it short and consistent within the project.

```
feat(auth):     — authentication module
fix(api/users): — users endpoint in the API
test(checkout):  — checkout flow tests
chore(ci):      — CI/CD configuration
```

### Rules for Good Messages

1. **Subject line under 72 characters.** Git truncates longer lines in log views.
2. **Imperative mood.** "Add feature" not "Added feature" or "Adds feature." The message completes the sentence "This commit will ..."
3. **No period at the end of the subject line.**
4. **Body explains WHY, not WHAT.** The diff shows what changed. The message explains the reasoning, constraints, or trade-offs that motivated the change.
5. **Reference issues.** If the commit relates to a ticket, include `Refs: #123` or `Fixes: #456` in the footer.

### Examples

```
# BAD: What, not why
fix: update getUserOrders query

# GOOD: Why
fix(orders): use LEFT JOIN to include users with zero orders

The previous INNER JOIN excluded users who had not placed any orders,
causing the user count on the admin dashboard to be lower than expected.

Fixes: #892
```

```
# BAD: Too vague
feat: add stuff

# GOOD: Specific
feat(notifications): add email digest for weekly order summaries
```

## Atomic Commits

### Principle

Each commit contains exactly one logical change. It can be understood, reviewed, and reverted independently.

### What Goes in One Commit

- Adding a function AND its tests — one commit (the tests document the function's intent)
- Renaming a variable across multiple files — one commit
- Adding a feature with migration, model, handler, and tests — one commit per layer if they are independently meaningful, OR one commit if they only make sense together

### What Does NOT Go in One Commit

- A bug fix AND an unrelated formatting change — two commits
- A new feature AND a refactor of old code — two commits
- Multiple independent bug fixes — one commit per fix

### Test

Ask: "If I revert this commit, does the codebase remain in a valid, working state?" If yes, the commit is atomic. If reverting would leave broken code, the commit is either too small (split a logical unit) or too large (combines unrelated changes).

## Branch Naming

### Format

```
type/ticket-id/brief-description
```

### Examples

```
feature/AUTH-123/password-reset
fix/BUG-456/tax-calculation-zero-states
refactor/TECH-789/extract-validation-middleware
chore/CI-012/add-lint-step
```

### Rules

1. **Lowercase with hyphens.** No spaces, no underscores, no camelCase.
2. **Include ticket ID.** Links the branch to the work item. Makes cleanup easy.
3. **Brief description.** Enough to identify the work. Not a full sentence.
4. **Delete after merge.** Branches are temporary. Do not accumulate stale branches.

## Pull Request Discipline

### Size

- **Target: < 400 lines of diff.** A reviewer can meaningfully review 400 lines in 15-30 minutes. Beyond that, review quality drops sharply.
- **If larger:** Split into multiple PRs. Feature flags or incremental delivery (backend first, then frontend).
- **Exception:** Generated code, migrations, or dependency lock files can inflate line count — these are scannable, not reviewable line-by-line.

### Single Concern

A PR should do ONE thing:
- Add a feature
- Fix a bug
- Refactor a module
- Update dependencies

Not: "Add feature + fix two bugs + refactor the helpers + update README."

### Description

Every PR needs:
1. **What** — One sentence describing the change
2. **Why** — The motivation (bug report, feature request, tech debt, performance)
3. **How to test** — Steps to verify the change works
4. **Screenshots** — If there are visual changes

## Rebase vs. Merge

### Decision Framework

| Situation | Strategy | Reasoning |
|---|---|---|
| Feature branch behind main | `git rebase main` | Clean linear history. Feature commits appear on top of main. |
| Long-lived branch (release, develop) | `git merge` | Preserve branch structure. Merge commits show integration points. |
| Branch shared with others | Never rebase | Rebase rewrites history. Others who pulled the branch have a divergent history. |
| Before PR submission | Rebase + squash related commits | Clean up WIP commits into logical units before review. |
| After PR approval | Merge (or squash merge) | Preserve the reviewed state. |

### Rules

1. **Never rebase public/shared branches.** If anyone else has pulled the branch, do not rebase.
2. **Never force push to main/master.** Ever. For any reason.
3. **Rebase your own feature branches freely.** Until you share them, they are your local concern.
4. **Interactive rebase to clean up before PR.** Squash "WIP" commits, reorder for logical flow, fix commit messages.

## Conflict Resolution

### Method

1. **Understand both sides.** Before choosing "ours" or "theirs," read both changes and understand why each was made. Check the commit messages and PR descriptions.
2. **Pull the latest target branch.** `git fetch origin main && git rebase origin/main`
3. **Resolve file by file.** For each conflict:
   - Read the `<<<<<<<` (yours) and `>>>>>>>` (theirs) blocks
   - Determine if both changes should exist, one should win, or a merge of both is needed
   - Edit the file to the correct final state
   - Remove all conflict markers
4. **Test after resolution.** Run the full test suite. Conflict resolution is a common source of subtle bugs.
5. **Never blindly accept one side.** `git checkout --ours .` or `git checkout --theirs .` discards work without understanding it.

### When Conflicts Are Complex

If a conflict involves logic changes on both sides (not just adjacent line edits), do not resolve by guessing. Read both PRs, understand the intended behavior of each, and write the merged logic manually. Test it.

## Bisect for Bug Investigation

### When to Use

A feature worked in a previous version and is now broken. You need to find exactly which commit broke it.

### Method

```bash
# Start bisect
git bisect start

# Mark the current commit as broken
git bisect bad

# Mark a known-good commit (e.g., last release tag)
git bisect good v2.3.0

# Git checks out a midpoint commit. Test it.
# If broken:
git bisect bad
# If working:
git bisect good

# Repeat until git identifies the exact breaking commit.
# Typically takes log2(N) steps for N commits.

# When done:
git bisect reset
```

### Automated Bisect

If you have a test that demonstrates the bug:

```bash
git bisect start HEAD v2.3.0
git bisect run npm test -- --grep "order total calculation"
```

Git runs the test at each midpoint and automatically finds the breaking commit.

## Anti-patterns

- **"WIP" commits on main.** Every commit on main should be complete and working.
- **Merge commits that hide changes.** Large merge commits where the resolution itself introduces bugs. Rebase before merge to keep resolution visible.
- **Squashing meaningful history.** Squash WIP commits, but preserve logically distinct changes as separate commits.
- **Force-pushing shared branches.** Destroys others' work. Only force-push branches that are exclusively yours.
- **Giant PRs.** > 1000 lines. The reviewer cannot meaningfully evaluate this. Split it.
- **Commit message: "fix."** Useless for debugging. Six months from now, `git log --oneline` shows 50 commits saying "fix" and you cannot find anything.
- **Mixing refactors with features.** One commit does both, making it impossible to revert the feature without losing the refactor (or vice versa).

## Verification

Git workflow is correct when:
1. Every commit message follows the type(scope): description format
2. Every commit is atomic (one logical change, independently revertable)
3. No "WIP" or meaningless commit messages on the main branch
4. Branches follow the naming convention with ticket IDs
5. PRs are < 400 lines and single-concern
6. Rebase is used for personal branches, merge for shared branches
7. Conflicts are resolved by understanding both sides, not blind acceptance
