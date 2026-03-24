---
name: research-codebase
description: Document the current codebase state with parallel exploration — architecture, patterns, conventions, and integration points
triggers:
  - research codebase
  - document codebase
  - understand codebase
  - codebase analysis
---

# Research Codebase

## Purpose

Produce a structured documentation of the codebase as it currently exists. Not a critique or improvement plan — a factual map that enables effective future work.

## Workflow

### 1. Load Context

Before starting exploration:

- Read project configuration files (package.json, tsconfig, etc.)
- Check for existing documentation (README, architecture docs, ADRs)
- Load locked decisions if they exist
- Identify the technology stack and framework

### 2. Decompose the Research Question

Break the research scope into parallel, independent queries:

| Query Type | Example | Agent |
|---|---|---|
| **File location** | Where does authentication code live? | codebase-navigator |
| **Implementation detail** | How does the order service calculate totals? | codebase-navigator |
| **Pattern identification** | What patterns are used for database access? | codebase-navigator |
| **Convention discovery** | How are errors handled across the codebase? | codebase-navigator |

### 3. Explore in Parallel

For each query, gather:

- **File locations** with paths and line numbers
- **Implementation details** with code references
- **Patterns** with concrete examples
- **Conventions** made explicit

### 4. Synthesize Findings

Combine parallel results into a structured document:

```markdown
# Codebase Documentation: [Project Name]

## Overview
- Technology stack
- Project structure pattern (by layer, by feature, hybrid)
- Entry points

## Architecture
- Component responsibilities
- Communication patterns
- Data flow between components

## Conventions
- Naming conventions
- Error handling approach
- Testing patterns
- File organization rules

## Key Modules
For each significant module:
- Purpose
- Key files with line references
- Public API / interface
- Dependencies

## Integration Points
- External services and how they are called
- Database access patterns
- Authentication flow

## Configuration
- Environment variables
- Feature flags
- Build configuration
```

### 5. Output Rules

- **DO NOT** suggest improvements or changes unless explicitly asked
- **DO NOT** critique the implementation or identify problems
- **DO NOT** recommend refactoring or better approaches
- **DO** include file:line references for every claim
- **DO** document what exists, not what should exist
- **DO** note conventions and patterns as they are, not as they should be
