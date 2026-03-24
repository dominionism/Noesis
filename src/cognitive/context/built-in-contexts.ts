/**
 * Built-In Contexts — Default templates for all 13 context types.
 *
 * Seeded on first run to establish the expected structure for each
 * context type. Templates include section headers and guidance
 * for what should be stored in each context.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { ContextType, SignFn } from '../types.js';
import { upsertContext, getContext } from './context-store.js';

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const CONTEXT_TEMPLATES: Record<ContextType, string> = {
  decisions: `## Locked Decisions
<!-- Non-negotiable decisions that must be honored -->

## Deferred
<!-- Items explicitly deferred / out of scope -->

## Discretion
<!-- Agent may decide at its discretion -->`,

  state: `## Project Status
<!-- Current phase and progress -->

## Current Phase
<!-- Active work description -->

## Working Set
<!-- Files and modules currently being modified -->`,

  failure_patterns: `## Failure Patterns
<!-- Each pattern follows the structure:
## Pattern Name
- Trigger: conditions that lead to failure
- Miss: what was overlooked
- Root Cause: why the miss occurred
- Prevention: rule to prevent recurrence
-->`,

  lessons_learned: `## Lessons Learned
<!-- Each lesson follows the structure:
## Lesson Name
- Context: when this applies
- Application: how to apply it
- Effectiveness: observed impact
-->`,

  user_taste: `## Preferred Patterns
<!-- Styles and patterns the user prefers -->

## Disliked Patterns
<!-- Styles and patterns to avoid -->

## Confirmations Required
<!-- Actions that require explicit user approval -->`,

  verification: `## Test Commands
<!-- Commands to run tests -->

## Linting
<!-- Linting commands and configuration -->

## Coverage
<!-- Coverage commands and thresholds -->

## Custom Scripts
<!-- Project-specific verification scripts -->`,

  reference_library: `## API Patterns
<!-- Approved API design patterns -->

## Component Examples
<!-- Exemplar component implementations -->

## Security References
<!-- Security patterns and guidelines -->`,

  ui_ux: `## Target Audience
<!-- Who uses this product -->

## Visual Direction
<!-- Design aesthetic and style guide -->

## Design Constraints
<!-- Technical and brand constraints -->`,

  artifacts: `## Artifact Map
<!-- Maps artifact identifiers to file paths
Format: artifact_id -> path/to/file (description)
-->`,

  tooling: `## Build Tool
<!-- Build system configuration -->

## Deployment
<!-- Deployment process and targets -->

## CI/CD
<!-- Continuous integration pipeline -->

## Dev Environment
<!-- Local development setup -->`,

  research_index: `## Research Findings
<!-- Format: date | topic | summary | relevance
Each entry is a cross-session research artifact.
-->`,

  session_index: `## Session Log
<!-- Format: date | topic | outputs_created | artifacts_produced
Each entry maps a session to its produced artifacts.
-->`,

  agent_catalog: `## Expert Agents
<!-- Format: name | domain | availability | performance_stats
Registry of available expert agents and their specialties.
-->`,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the built-in template for a context type.
 */
export function getContextTemplate(contextType: ContextType): string {
  return CONTEXT_TEMPLATES[contextType];
}

/**
 * Get all built-in context templates.
 */
export function getBuiltInContextTemplates(): Record<ContextType, string> {
  return { ...CONTEXT_TEMPLATES };
}

/**
 * Seed global context templates into the database. Idempotent —
 * skips contexts that already exist.
 *
 * @returns The number of contexts newly created.
 */
export function seedBuiltInContexts(
  db: DatabaseConnection,
  sign: SignFn,
): number {
  let created = 0;

  for (const [type, template] of Object.entries(CONTEXT_TEMPLATES)) {
    const contextType = type as ContextType;
    const existing = getContext(db, contextType, null);
    if (existing) continue;

    upsertContext(db, {
      context_type: contextType,
      project_id: null,
      content: template,
    }, sign);
    created++;
  }

  return created;
}

/**
 * Get all context type names.
 */
export function getBuiltInContextTypes(): ContextType[] {
  return Object.keys(CONTEXT_TEMPLATES) as ContextType[];
}
