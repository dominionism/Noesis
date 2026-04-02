# Capsule Development Guide

Capsules are pre-packaged context assemblies for quality-sensitive task classes. They provide domain-specific anti-patterns, critic rules, memory policies, and context sections that activate when a task matches the capsule's domain.

## What is a Capsule?

A capsule is a task-class operating pack. When a user's task matches a capsule's domain (e.g., "Build an API endpoint" matches the `api-workflow` capsule), Noesis automatically:

1. Loads domain-specific anti-patterns into the critic system
2. Applies custom critic rules during plan review
3. Adjusts memory retrieval to prioritize domain-relevant memories
4. Injects domain-specific context sections

Capsules are advisory — they enrich the context, they never override user decisions.

## Built-in Capsules

| ID | Domain | Match Keywords |
|----|--------|---------------|
| `api-workflow` | API design, integration, backend | api, endpoint, rest, graphql, webhook, handler, middleware |
| `creative-redesign` | UI/UX design, visual refresh | redesign, ui, ux, visual, theme, component, frontend |
| `security-hardening` | Security audit, vulnerability remediation | security, vulnerability, owasp, injection, xss, csrf, encryption |
| `performance-optimization` | Performance profiling, bottleneck resolution | performance, optimize, latency, cache, benchmark, bottleneck |
| `migration` | Database/API/framework migrations | migration, upgrade, schema, rollback, compatibility, legacy |

## Capsule Definition Structure

```typescript
interface CapsuleDefinition {
  /** Unique identifier for the capsule. */
  id: string;

  /** Human-readable display name. */
  displayName: string;

  /** Description of when this capsule applies. */
  description: string;

  /** Keywords/patterns that trigger this capsule. */
  matchPatterns: string[];

  /** Context sections to load when this capsule is active. */
  contextSections: string[];

  /** Domain-specific anti-patterns to inject into the critic. */
  antiPatterns: string[];

  /** Custom critique rules added to the critic system. */
  criticRules: string[];

  /** Memory retrieval policy adjustments. */
  memoryPolicy: {
    /** Memory types to prioritize in retrieval. */
    preferredTypes: string[];

    /** Tags to require in retrieval filters. */
    requiredTags: string[];

    /** Boost factor for matching memories (1.0 = no boost). */
    boostFactor: number;
  };
}
```

## Creating a Custom Capsule

### Option 1: Programmatic Registration

Register a capsule in TypeScript:

```typescript
import { registerCapsule } from '../workflow/capsule-router.js';

registerCapsule({
  id: 'data-pipeline',
  displayName: 'Data Pipeline',
  description: 'ETL pipelines, data transformations, and batch processing.',

  matchPatterns: [
    'pipeline', 'etl', 'transform', 'batch', 'data',
    'ingest', 'extract', 'load', 'stream', 'kafka',
    'spark', 'airflow', 'dagster', 'prefect',
  ],

  contextSections: [
    'data-architecture',
    'schema-registry',
    'monitoring-alerts',
    'retry-policy',
  ],

  antiPatterns: [
    'unbounded-backpressure',
    'silent-data-loss',
    'missing-idempotency',
    'schema-drift-ignored',
  ],

  criticRules: [
    'must include idempotency guarantee',
    'required: dead letter queue for failures',
    'must include schema validation',
    'required: monitoring and alerting',
  ],

  memoryPolicy: {
    preferredTypes: ['incident', 'lesson', 'skill'],
    requiredTags: ['data', 'pipeline'],
    boostFactor: 1.5,
  },
});
```

### Option 2: File-Based Capsule (Current Markdown Format)

Place a single `CAPSULE.md` file in `~/.agents/capsules/<capsule-id>/`:

```
~/.agents/capsules/data-pipeline/
└── CAPSULE.md          # Frontmatter + markdown sections
```

`registerMarkdownAssets()` parses sections such as `## Intent`, `## Assembly`, `## Anti-patterns`, and `## Quality Criteria` from `CAPSULE.md` and upserts them into the live capsule store.

## How Capsule Matching Works

When a task enters the RPI pipeline, the prompt optimizer extracts a `PromptShape`:

```typescript
interface PromptShape {
  goal: string;
  context: string;
  constraints: string[];
  deliverable: string;
  validation: string[];
}
```

The capsule router scores each registered capsule against this shape:

1. Build a text corpus from `goal + context + deliverable + constraints + validation`
2. Convert to lowercase
3. Count how many of the capsule's `matchPatterns` appear in the corpus
4. Score = `matchCount / totalPatterns`
5. Select the capsule with the highest score, provided it exceeds the threshold (0.15)

```typescript
import { routeToCapsule } from '../workflow/capsule-router.js';

const capsule = routeToCapsule(promptShape);
if (capsule) {
  // Capsule activated — enrich context with capsule-specific content
}
```

## Capsule Integration Points

### 1. Critic System

When a capsule is active, its `criticRules` are merged with the standard critic dimensions. The critic evaluates the plan against both general and domain-specific rules:

```
Standard critic dimensions (7) + Capsule-specific rules
```

### 2. Anti-Pattern Guard

Capsule `antiPatterns` are merged with Noesis anti-pattern memories. During action advisory checks, both general and capsule-specific anti-patterns are evaluated.

### 3. Memory Retrieval

The `memoryPolicy` adjusts retrieval behavior:

- **preferredTypes**: These memory types receive a boost in composite scoring
- **requiredTags**: Retrieval results are filtered to include memories with these tags
- **boostFactor**: Matching memories have their score multiplied by this factor (e.g., 1.5 = 50% boost)

### 4. Context Sections

The `contextSections` array specifies which domain-specific context to load. These map to files in the project's context directory (e.g., `~/.agents/contexts/api-conventions.md`).

## API

### `matchScore(promptShape, capsule): number`

Calculate the match score (0.0 to 1.0) between a prompt shape and a capsule.

### `routeToCapsule(promptShape): CapsuleDefinition | null`

Find the best-matching capsule. Returns `null` if no capsule exceeds the 0.15 threshold.

### `getCapsule(id): CapsuleDefinition | null`

Look up a capsule by ID.

### `listCapsules(): CapsuleDefinition[]`

List all registered capsules.

### `registerCapsule(capsule): void`

Register or replace a capsule definition.

## Design Guidelines

When creating a custom capsule:

1. **Be specific with match patterns.** Include both general terms and domain-specific jargon. Too few patterns cause false negatives; too many cause false positives.

2. **Anti-patterns should be actionable.** Each anti-pattern should describe a concrete mistake, not a vague concern. Include the correct approach.

3. **Critic rules should be verifiable.** Rules like "must include error handling" can be checked against the plan. Rules like "should be good" cannot.

4. **Memory policy boosts should be moderate.** A boost of 1.3-1.6 is typical. Boosts above 2.0 risk drowning out genuinely relevant memories from other domains.

5. **Context sections should exist.** Every section in `contextSections` should have a corresponding file. Missing sections are silently skipped but reduce capsule effectiveness.

## Security

- Capsule anti-patterns are merged with system anti-patterns at runtime. They cannot disable or weaken system-level anti-patterns.
- Capsule critic rules are additive. They cannot remove standard critic dimensions.
- Memory policy adjustments are advisory. The core retrieval system still applies all security filters (HMAC verification, secret scanning).
- Custom capsules registered via `registerCapsule` are scoped to the current process. They do not persist across daemon restarts unless loaded from disk.
