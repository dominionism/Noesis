---
name: search-first
description: Before creating anything new, search for existing patterns, utilities, and prior decisions in the codebase
triggers:
  - implementation
  - new file
  - new function
  - new component
  - adding
  - creating
priority: high
---

# Search First

## Rule

Before writing new code, search the codebase for existing patterns, utilities, and prior decisions that solve the same or similar problem. Reuse existing structures. Do not reinvent.

## Why This Matters

Every codebase accumulates utilities, patterns, and conventions over time. Creating something new when an existing solution exists causes:

- **Inconsistency.** Two approaches to the same problem. Future developers do not know which to follow.
- **Duplication.** Maintenance burden doubles. Bug fixes must be applied in two places.
- **Convention drift.** The new approach may subtly differ from the existing one, creating confusion.

## Search Protocol

Before creating anything new, search for:

### 1. Existing Implementation

Is there already a function, component, or module that does this?

- Search by name (what would this be called?)
- Search by behavior (what operation does it perform?)
- Check utility/helper directories
- Check shared/common modules

### 2. Existing Pattern

Is there a similar feature that follows a pattern you should replicate?

- Find analogous features (if adding a new API endpoint, how are existing endpoints structured?)
- Note the file structure, naming, error handling, and testing approach
- Follow the pattern unless there is a specific reason not to

### 3. Prior Decisions

Has this decision been made before?

- Check architecture decision records (ADRs)
- Check decision documents
- Check commit messages and PR descriptions for rationale
- If a prior decision exists, follow it (see: decision-fidelity rule)

## After Searching

Document what you found before proceeding:

```
Searched for: [what you were looking for]
Found: [what exists]
Decision:
  - Reusing: [what you will reuse and where it is]
  - New: [what must be created and why existing solutions are insufficient]
```

If nothing exists, proceed with creating something new — but follow the closest existing pattern for consistency.

## Anti-patterns

- **Creating before searching.** Writing a `formatDate()` utility when one already exists in `src/utils/date.ts`. Five minutes of searching saves hours of maintaining duplicate code.
- **Searching but not reusing.** Finding an existing pattern but deciding "my way is better" without a concrete reason. Consistency is more valuable than marginal improvement.
- **Shallow search.** Checking one directory and declaring "nothing exists." Search by multiple terms, check utilities, check other features with similar needs.
