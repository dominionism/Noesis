# Noesis

Persistent intelligence layer for AI coding agents.

Noesis adds durable memory, structured workflow, security controls, and multi-tool context sync to local coding-agent environments. It is designed for people who want more than a prompt file: a system that can remember lessons, critique plans, route work, and keep multiple agent tools aligned from a shared local intelligence layer.

## Overview

Noesis combines five major capabilities:

| Area | What it provides |
|------|-------------------|
| Memory | Three-tier memory with hybrid retrieval across markdown, SQLite FTS5, vectors, and graph relationships |
| Workflow | Research, planning, critique, verification, readiness checks, and session continuity |
| Intelligence | Context economy, model routing, failure prediction, self-evaluation, learning synthesis |
| Distribution | Adapters for multiple coding-agent CLIs with tool-specific context budgets and formats |
| Security | Secret scanning, audit logging, path validation, integrity signing, and strict file permissions |

## Why Noesis

- Local-first architecture. State lives under `~/.agents` by default and the daemon communicates over a Unix domain socket.
- Built for agent workflows, not just note storage. Memories feed planning, critique, verification, and context assembly.
- Cross-tool interoperability. Noesis can sync structured context into different agent environments without duplicating manual setup.
- Security is part of the core design. Secret scanning and integrity checks are not optional features bolted on later.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                      NOESIS DAEMON                          │
│  JSON-RPC 2.0 over Unix Domain Socket                      │
│                                                             │
│  Memory Engine ── Learning Engine ── Workflow Engine         │
│       │                │                   │                │
│  ┌────┴────────────────┴───────────────────┴────────────┐  │
│  │              INTELLIGENCE LAYERS                     │  │
│  │  Strategy Simulation  │  Knowledge Distillation      │  │
│  │  Model Routing        │  Cognitive Profiling         │  │
│  │  Context Economy      │  Self-Evaluation             │  │
│  │  Friction Detection   │  Temporal Relevance          │  │
│  │  Meta-Reasoning       │  Experience Synthesis        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Security Layer (7 invariants)                              │
│  Adapter Layer (9 supported targets)                        │
└─────────────────────────────────────────────────────────────┘
```

## Supported Adapters

| Tool | Token Budget | Format | Write-Back |
|------|--------------|--------|------------|
| Claude Code | 50,000 | Markdown | CLI + file |
| Cursor | 8,000 | Frontmatter | File |
| GitHub Copilot | 4,000 | Markdown | File |
| Aider | 20,000 | Markdown | CLI |
| Codex CLI | 20,000 | Markdown | CLI + file |
| OpenCode | 20,000 | Frontmatter | File |
| Antigravity | 20,000 | TOML | File |
| OpenClaw | 20,000 | JSON | File |
| Generic | 10,000 | JSON | File + stdout |

## Installation

### Prerequisites

- Node.js 20+
- npm 10+
- macOS or Linux

### Install From Source

```bash
git clone <repo-url>
cd noesis
npm install
npm run build
```

At that point you can either run the CLI directly:

```bash
node dist/cli/index.js status
```

Or link it into your shell:

```bash
npm link
noesis status
```

## First Run

Initialize the local Noesis home directory and database:

```bash
noesis init
```

If you want guided onboarding instead of the direct setup path:

```bash
noesis quickstart
```

By default, Noesis stores its runtime state under `~/.agents`. You can override that with `NOESIS_HOME`.

## Example Workflow

```bash
# Check system health
noesis status

# Store a durable lesson
noesis remember --type lesson --title "Auth pattern" --content "Always validate JWT expiry"

# Retrieve relevant knowledge
noesis recall "database migration best practices"

# Check a planned action against prior anti-patterns
noesis check "dropping the users table index"

# Create a memory-enriched plan
noesis plan create "Add pagination to the API"

# Critique and verify the resulting plan
noesis critique <plan-id>
noesis verify <plan-id>
```

## Key Commands

### Memory

- `noesis remember` stores structured memories through a guarded write pipeline.
- `noesis recall` runs hybrid retrieval across BM25, vectors, recency, confidence, and graph signals.
- `noesis explain` shows the scoring breakdown for retrieval results.
- `noesis gap` identifies knowledge gaps for a task.
- `noesis learn` records explicit postmortems and lessons.

### Workflow

- `noesis plan create` builds a plan with retrieved context.
- `noesis research` deepens context before implementation.
- `noesis critique` stress-tests a plan or approach.
- `noesis verify` performs goal-backward verification.
- `noesis simulate` explores alternate strategies.
- `noesis route` helps choose the right execution path.

### Operations

- `noesis sync` pushes assembled context into detected tool environments.
- `noesis import-config` imports learnings from existing tool configuration files.
- `noesis session` manages session continuity.
- `noesis handoff` creates cross-agent handoff artifacts.
- `noesis audit`, `gc`, `repair`, and `export` cover maintenance and operational hygiene.

## Security Model

Noesis enforces seven core invariants:

1. Secret scanning is always on.
2. Managed files and directories use strict POSIX permissions.
3. Dangerous patterns are detected before write operations complete.
4. Audit logging records security-relevant actions without storing raw secrets.
5. Path validation prevents traversal and invalid writes.
6. Stored memories are integrity-signed with HMAC-SHA256.
7. Retrieval is advisory, not directive.

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model and implementation details.

## Configuration

Noesis reads configuration from `~/.agents/noesis.yaml`.

Notable settings:

- `embedding_model`
- `llm_provider`
- `secret_scan_mode`
- per-tool adapter configuration
- per-project overrides

The default LLM-backed synthesis path uses an Anthropic model, and the API key is referenced by environment variable name rather than stored in config. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for the full schema.

## Documentation

- [docs/API.md](docs/API.md): JSON-RPC surface and request formats
- [docs/ADAPTERS.md](docs/ADAPTERS.md): adapter model and sync behavior
- [docs/CAPSULES.md](docs/CAPSULES.md): task-class operating packs
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md): configuration reference
- [docs/PUBLISHING.md](docs/PUBLISHING.md): privacy-safe GitHub publishing checklist
- [docs/SECURITY.md](docs/SECURITY.md): security invariants and threat model
- [CONTRIBUTING.md](CONTRIBUTING.md): development workflow and contribution standards

## Repository Layout

```text
src/
├── adapters/     # Tool-specific adapter implementations
├── cli/          # CLI entrypoint and command handlers
├── cognitive/    # Higher-level context assembly and orchestration
├── core/         # Database, schema, CRUD, identifiers
├── daemon/       # JSON-RPC server, socket, events, client
├── embedding/    # Local embedding provider integration
├── graph/        # Knowledge graph traversal and scoring
├── intelligence/ # Meta-reasoning, synthesis, routing, evaluation
├── memory/       # Memory tiers and write pipeline
├── retrieval/    # Hybrid retrieval and explanation
├── security/     # Security invariants and enforcement
├── sync/         # Multi-adapter sync and format bridging
└── workflow/     # Planning, critique, verification, and continuity
```

## Development

```bash
npm run build
npm run lint
npm test
```

If you have multiple Node installations on one machine, make sure `node`,
`npm`, `npx`, and any linked `noesis` binary resolve to the same runtime
before debugging native-module or test-runner issues.

## License

[MIT](LICENSE)
