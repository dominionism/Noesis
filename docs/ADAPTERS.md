# Adapter Development Guide

This guide explains how to build a new adapter for Noesis. Adapters enable Noesis to distribute context, sync memories, and extract learnings from any CLI-based coding agent.

## Architecture

Adapters are **pure transform functions** that produce declarative output. The core validates and executes all I/O. An adapter never directly writes to the filesystem or database — it returns `FileWriteRequest` objects that the sync orchestrator executes.

```
┌──────────────┐     ┌────────────┐     ┌──────────┐
│ Noesis Core  │ ──> │  Adapter   │ ──> │ Declarative │
│ (context,    │     │ (transform)│     │ Output      │
│  memories)   │     │            │     │ (file writes│
└──────────────┘     └────────────┘     │  API calls) │
                                        └─────────────┘
```

## Adapter Interface

Every adapter must implement the `Adapter` interface defined in `src/types.ts`:

```typescript
interface Adapter {
  /** Unique identifier (e.g., 'claude-code', 'cursor'). */
  id: string;

  /** Human-readable name. */
  displayName: string;

  /** Detect whether this tool is installed and active. */
  detect(query: FilesystemQuery): Promise<DetectionResult>;

  /** Transform universal context into tool-specific format. */
  transform(context: UniversalContext, budget: TokenBudget): SyncResult;

  /** Extract learnings from tool-specific artifacts. */
  extractLearnings(content: string): ExtractedLearnings;

  /** Verify integrity of managed sections. */
  verify(content: string, expectedHash: string): VerifyResult;
}
```

## Step-by-Step: Creating a New Adapter

### 1. Create the Adapter File

Create `src/adapters/<your-tool>.ts`:

```typescript
import type {
  Adapter,
  DetectionResult,
  UniversalContext,
  TokenBudget,
  SyncResult,
  ExtractedLearnings,
  VerifyResult,
  FilesystemQuery,
} from '../types.js';

import {
  assembleContext,
  buildFileWrite,
  buildSyncResult,
  extractLearningsFromText,
  verifyContentHash,
} from './base-adapter.js';

export function createYourToolAdapter(): Adapter {
  return {
    id: 'your-tool',
    displayName: 'Your Tool',

    async detect(query: FilesystemQuery): Promise<DetectionResult> {
      // Check for tool-specific config files
      const configExists = await query.exists('~/.your-tool/config.json');
      return {
        detected: configExists,
        version: configExists ? '1.0' : undefined,
        configPaths: configExists ? ['~/.your-tool/config.json'] : [],
      };
    },

    transform(context: UniversalContext, budget: TokenBudget): SyncResult {
      const { content, tokensUsed } = assembleContext(context, budget.total);

      const fileWrites = [
        buildFileWrite(
          '~/.your-tool/noesis-context.md',
          content,
          'your-tool',
          '1.0.0',
          true, // Use managed sections
        ),
      ];

      return buildSyncResult(fileWrites, tokensUsed);
    },

    extractLearnings(content: string): ExtractedLearnings {
      return extractLearningsFromText(content, 'your-tool');
    },

    verify(content: string, expectedHash: string): VerifyResult {
      return verifyContentHash(content, expectedHash);
    },
  };
}
```

### 2. Register in the Adapter Index

Add your adapter to `src/adapters/index.ts`:

```typescript
import { createYourToolAdapter } from './your-tool.js';

// In the registry setup:
registry.register(createYourToolAdapter());
```

### 3. Declare Capabilities in the Adapter

```typescript
const capabilities = {
  canWriteBack: true,
  writeBackMechanism: 'cli_command', // or 'file_append' | 'none'
  canSubscribeEvents: false,
  canReportSessions: true,
  supportsStructuredCorrection: false,
};

const targetCapabilities = {
  maxContextTokens: 15000,
  supportsSystemPrompt: true,
  supportsFileWrites: true,
  supportsManagedSections: true,
};
```

`createDefaultAdapterRegistry()` registers the shipped adapters, and the capability negotiator now derives capability data from the adapter implementations rather than a separate static matrix.

### 4. Add Format Bridge (if needed)

If your tool uses a non-standard format, add it to `src/sync/format-bridges.ts`:

```typescript
// In getAdapterFormat():
case 'your-tool':
  return 'toml'; // or whatever format your tool uses
```

### 5. Write Tests

Create `src/__tests__/adapters/your-tool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createYourToolAdapter } from '../../adapters/your-tool.js';

describe('your-tool adapter', () => {
  const adapter = createYourToolAdapter();

  it('has correct id and displayName', () => {
    expect(adapter.id).toBe('your-tool');
    expect(adapter.displayName).toBe('Your Tool');
  });

  it('detects tool installation', async () => {
    const result = await adapter.detect({
      exists: async (path) => path.includes('.your-tool'),
      read: async () => '',
      glob: async () => [],
    });
    expect(result.detected).toBe(true);
  });

  it('transforms context within budget', () => {
    const context = { /* ... */ };
    const budget = { total: 15000, remaining: 15000, allocations: {} };
    const result = adapter.transform(context, budget);
    expect(result.tokensUsed).toBeLessThanOrEqual(15000);
  });
});
```

## Key Concepts

### Token Budgets

Each adapter has a token budget that limits how much context is injected. Budgets are defined in `src/constants.ts`:

| Adapter | Budget |
|---------|--------|
| claude-code | 200,000 |
| codex-cli | 128,000 |
| opencode | 100,000 |
| antigravity | 1,000,000 |
| openclaw | 100,000 |
| aider | 100,000 |
| generic | 10,000 |
| cursor | 32,000 |
| copilot | 8,000 |

### Context Assembly Priority

Context is assembled in strict priority order. Higher-priority sections get full space first:

| Priority | Section | Budget Fraction |
|----------|---------|-----------------|
| 1 | System identity (persona) | 10% |
| 2 | Conventions | 8% |
| 3 | Project context | 7% |
| 4 | Active plan | 15% |
| 5 | Active checkpoints | 10% |
| 6 | Anti-patterns | 10% |
| 7 | Skills | 15% |
| 8 | Hot memories | 10% |
| 9 | Recent lessons | 15% |

### Managed Sections

Managed sections are delimited blocks injected into tool config files. They include a hash for tamper detection:

```markdown
<!-- NOESIS:BEGIN adapter=claude-code version=1.0.0 hash=abc123 timestamp=2026-03-24T00:00:00.000Z -->
## Available Skills
- **React hooks** (confidence: 0.92): Custom hook patterns...
## Anti-Patterns (Avoid)
- **Direct DOM manipulation**: Use React refs instead...
<!-- NOESIS:END adapter=claude-code -->
```

The hash allows Noesis to detect if the user has manually edited the managed section. If modified, the section is preserved and a warning is emitted rather than overwriting.

### Detection

The `detect` method receives a `FilesystemQuery` — a sandboxed, read-only interface:

```typescript
interface FilesystemQuery {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  glob(pattern: string): Promise<string[]>;
}
```

Detection should check for tool-specific config files, directories, or process indicators. It must never write to the filesystem.

### Learning Extraction

The `extractLearnings` method parses tool-specific output for learning signals. The base adapter provides a generic extractor that looks for prefixed lines:

- `LESSON: <text>` — Captured as lesson memory (confidence: 0.7)
- `LEARNING: <text>` — Captured as lesson memory (confidence: 0.7)
- `CORRECTION: <text>` — Captured as lesson memory (confidence: 0.8)
- `PREFERENCE: <text>` — Captured as preference memory (confidence: 0.8)
- `DECISION: <text>` — Captured as decision memory (confidence: 0.8)

Override this for tool-specific parsing (e.g., Cursor's `.cursorrules` format or Copilot's feedback files).

### Format Bridges

The bridge library supports 5 output formats, but the default shipped adapter registry currently maps every built-in adapter to markdown because their live transforms emit markdown instruction files:

| Format | Adapters | Description |
|--------|----------|-------------|
| `markdown` | claude-code, cursor, copilot, aider, codex-cli, opencode, antigravity, openclaw, generic | Standard markdown with headers |
| `frontmatter` | library support only | YAML frontmatter + markdown body |
| `toml` | library support only | TOML sections |
| `json` | library support only | Structured JSON |
| `plain` | fallback | Plain text |

Format conversion is handled by `src/sync/format-bridges.ts`. The `transformToFormat` function takes context sections and renders them in the target format.

## Existing Adapters

| Adapter | File | Token Budget | Format | Write-Back |
|---------|------|-------------|--------|------------|
| Claude Code | `claude-code.ts` | 200,000 | markdown | cli_command |
| Cursor | `cursor.ts` | 32,000 | markdown | none |
| GitHub Copilot | `copilot.ts` | 8,000 | markdown | none |
| Aider | `aider.ts` | 100,000 | markdown | file_append |
| Codex CLI | `codex.ts` | 128,000 | markdown | cli_command |
| OpenCode | `opencode.ts` | 100,000 | markdown | file_append |
| Antigravity | `antigravity.ts` | 1,000,000 | markdown | cli_command |
| OpenClaw | `openclaw.ts` | 100,000 | markdown | file_append |
| Generic | `generic.ts` | 10,000 | markdown | none |

## Security Constraints

- Adapters receive a **sandboxed** filesystem query — they cannot write files directly.
- All file writes go through the core's validation pipeline.
- Content is secret-scanned before being written to any adapter config file.
- Managed sections use hash verification to detect tampering.
- Adapters produce **declarative output** only. The core performs all mutations.
