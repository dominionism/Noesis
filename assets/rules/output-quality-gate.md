---
name: output-quality-gate
description: Prevent substantial work from shipping without differentiation check, edge case review, and verification plan
triggers:
  - implementation
  - feature
  - redesign
  - API design
  - creative
  - substantial
priority: high
---

# Output Quality Gate

## Rule

Substantial work must pass a quality gate before being declared complete. Quick fixes and trivial changes skip this gate. The gate ensures that non-trivial output is differentiated, edge-case-aware, and verifiable.

## What Triggers the Gate

| Trigger | Example |
|---|---|
| New feature implementation | Adding a payment flow, building a dashboard |
| API design or integration | Designing a REST API, integrating with a third-party service |
| Architectural change | Introducing caching, changing database schema, adding a service |
| Creative or design work | UI redesign, landing page, component library |
| Complex refactoring | Extracting a service, restructuring a module |

## What Skips the Gate

- Bug fixes with clear root cause and targeted fix
- Configuration changes
- Documentation updates
- Dependency updates (unless major version)
- Formatting or linting changes

## Gate Checklist

Before substantial work is complete, verify:

### 1. Requirements Alignment

- [ ] The output addresses the stated problem, not a different problem
- [ ] All acceptance criteria are met (or deviations are documented)
- [ ] Scope matches what was agreed — no gold plating, no missing pieces

### 2. Edge Cases

- [ ] Error conditions are handled (not just the happy path)
- [ ] Boundary values are considered (empty input, maximum input, null, zero)
- [ ] Concurrent access is safe (if applicable)
- [ ] Failure of external dependencies is handled (if applicable)

### 3. Verification

- [ ] Tests exist for critical paths (happy path + error paths)
- [ ] The change can be verified by running a specific command or sequence
- [ ] Integration points are tested, not just units

### 4. Security (for code that handles user input, authentication, or data)

- [ ] Input is validated at the boundary
- [ ] Authentication and authorization are enforced
- [ ] Sensitive data is not logged or exposed in error messages
- [ ] Queries are parameterized (no string concatenation)

### 5. Consistency

- [ ] Follows existing patterns in the codebase
- [ ] Naming conventions are consistent with surrounding code
- [ ] Error handling style matches the project's approach

## Applying the Gate

The gate is not a formal ceremony. It is a mental checklist applied before declaring "done." For pair programming, both people check. For solo work, pause, re-read the checklist, and verify honestly.

If any check fails: fix it before declaring complete. If a check is genuinely not applicable, note why and move on.

## Anti-patterns

- **Rushing past the gate.** "It works, ship it." Works for the happy path is not the same as works. Spend 10 minutes on the checklist to save hours of debugging later.
- **Gate as bureaucracy.** Turning the checklist into a 30-minute formal review for every small change. The gate is proportional to the work. Substantial work gets a careful check. Small changes get a quick glance.
- **Selective checking.** Only checking the parts you are confident about. The unchecked parts are where the bugs are.
