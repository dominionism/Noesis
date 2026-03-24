---
name: failure-patterns
description: Reusable failure diagnoses organized by class — used to prevent recurring mistakes across sessions
type: learning
---

# Failure Patterns

Verified failure patterns that recur across projects. Each entry captures a class of failure, how to recognize it, and how to prevent it. Only promoted from incidents with evidence — not speculation.

## Promotion Rules

A failure becomes a pattern only when:
1. It has occurred at least twice, OR
2. It was verified by a test, user correction, or production incident
3. The prevention rule is specific enough to change behavior

## Failure Classes

### Context Assembly Miss

The wrong information was loaded (or the right information was missing) before starting work.

**Symptoms:** Implementation contradicts existing patterns. Decisions are re-opened unnecessarily. Duplicate code is created.

**Prevention:**
- Always run search-first before implementation
- Load decision documents before planning
- Check existing patterns in the affected area before creating new ones

### Planning Miss

The plan was incomplete or based on incorrect assumptions about the codebase.

**Symptoms:** Implementation hits unexpected blockers. Scope expands mid-implementation. Architecture conflicts discovered during coding.

**Prevention:**
- Verify assumptions about the codebase by reading code, not guessing
- Identify integration points during planning, not during implementation
- Score readiness before starting: clarity, codebase coverage, risk identification

### Verification Miss

The change was not adequately tested, or testing was done against wrong criteria.

**Symptoms:** Bugs discovered after declaring work complete. Tests pass but behavior is wrong. Regression in unrelated area.

**Prevention:**
- Detect available verification tools before testing (verification-first rule)
- Run existing tests in addition to new tests
- Test error paths, not just happy paths

### API Contract Miss

API specification was underspecified, causing implementation/consumer mismatch.

**Symptoms:** Frontend receives unexpected response shapes. Error handling does not match actual error format. Pagination behaves differently than documented.

**Prevention:**
- Specify response shapes for all status codes (200, 400, 401, 404, 500)
- Include edge cases in contract (empty results, maximum page size, rate limit response)
- Write contract tests that verify both success and failure responses

### Security Miss

Security controls were absent or incorrect.

**Symptoms:** Injection vulnerability. Missing authorization check. Sensitive data in logs. IDOR vulnerability.

**Prevention:**
- Validate all input at system boundaries
- Check authorization for every resource access, not just the endpoint
- Review OWASP top 10 for the specific technology stack

## Template for New Entries

```markdown
### [Failure Class Name]

**Description:** What goes wrong
**Symptoms:** How to recognize this failure
**Evidence:** The incident(s) that established this pattern
**Prevention:** Specific steps to avoid recurrence
**Confidence:** High | Medium
```

<!-- Add project-specific failure patterns below this line -->
