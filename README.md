# Noesis

Persistent intelligence layer for AI coding agents — fuses memory, workflow, and auto-integration across 9 CLI tools.

## What It Does

Noesis gives every CLI-based coding agent access to:

- **Memory** — SQLite-backed memory with hybrid retrieval, knowledge graph, and HMAC integrity. Optional hot/cold file helpers exist for manual workflows, but default live writes stay in SQLite.
- **Learning** — Structured learning write-back to rules, contexts, experts, capsules, and memories
- **Workflow** — Planning, readiness gates, critique, verification, sessions, and handoffs
- **Cognitive context** — Rules, experts, capsules, skills, contexts, locked decisions, and failure patterns assembled on demand
- **Distribution** — Adapters for Claude Code, Cursor, Copilot, Aider, Codex CLI, OpenCode, Antigravity, OpenClaw, and a generic fallback

## Quick Start

```bash
# Use the pinned Node runtime from .nvmrc / .node-version first.
# The repo is validated on Node 24.7.0 and expects Node 24.x.
npm install -g noesis
noesis init
noesis quickstart
```

## How It Works

```
CLI / injected files
        │
        ▼
Noesis client → JSON-RPC daemon over ~/.agents/daemon.sock
        │
        ├─ Retrieval + write pipeline
        ├─ Cognitive layer (rules, experts, capsules, skills, contexts)
        ├─ Sessions, handoffs, readiness, critique, verification
        └─ Adapter sync + inbox ingestion

Storage:
- Live store: SQLite + FTS + vectors
- Optional file-backed helpers: hot markdown context files and cold JSONL archives
- Default runtime writes and archives stay in SQLite unless you invoke separate file workflows
- Audit log + HMAC signatures
```

## Core Commands

### Memory

```bash
# Store a memory
noesis remember lesson "Auth pattern" --content "Always validate JWT expiry"

# Search memories (hybrid: BM25 + vector + graph)
noesis recall "database migration best practices"

# Check action against anti-patterns
noesis check "dropping the users table index"

# Analyze retrieval gaps
noesis gap "implement rate limiting"

# Full scoring breakdown
noesis explain "auth token handling"
```

### Workflow

```bash
# Create a memory-enriched plan
noesis plan create "Add pagination to the API"

# Inspect current planning / execution state
noesis plan status

# Evidence-backed critique
noesis critique "Add pagination to the API" --type plan

# Goal-backward verification
noesis verify "Add pagination to the API" --plan <plan-memory-id>

# Route work to the best expert
noesis route "Refactor auth middleware"

# Strategy simulation
noesis simulate "Refactor the auth module"
```

### Operations

```bash
# System health
noesis status

# Preview sync to detected tools
noesis sync --dry-run

# Import from existing tool configs
noesis import-config --tool codex-cli

# Manage sessions
noesis session start --agent codex-cli
noesis session pause <session-id>

# Cross-agent handoff
noesis handoff create --source codex-cli --target claude-code --summary "Need verification pass"

# Record a structured learning
noesis learn --description "Missed verification step" --root-cause "No gate before final output" --prevention "Run verify before closing" --failure-class verification
```

## Supported Tools

| Tool | Token Budget | Format | Write-Back |
|------|-------------|--------|------------|
| Claude Code | 200,000 | Markdown | CLI command |
| Cursor | 32,000 | Markdown | None |
| GitHub Copilot | 8,000 | Markdown | None |
| Aider | 100,000 | Markdown | File append |
| Codex CLI | 128,000 | Markdown | CLI command |
| OpenCode | 100,000 | Markdown | File append |
| Antigravity | 1,000,000 | Markdown | CLI command |
| OpenClaw | 100,000 | Markdown | File append |
| Generic | 10,000 | Markdown | None |

## Retrieval

5-factor composite scoring:

| Factor | Weight | Source |
|--------|--------|--------|
| FTS BM25 | 30% | SQLite FTS5 full-text search |
| Vector cosine | 25% | Snowflake Arctic Embed-S (384d, local ONNX) |
| Recency | 15% | Tiered decay (7d/30d/90d/365d) |
| Confidence | 15% | Bayesian with Laplace smoothing |
| Graph walk | 15% | 12-type knowledge graph, max depth 3 |

## Security

7 non-disableable security invariants:

1. **Secret scanning** — Always on (6 pattern types + Shannon entropy detection)
2. **File permissions** — 0o700 dirs, 0o600 files, 0o400 signing key
3. **Dangerous patterns** — 15 pattern types blocked unless confirmed
4. **Audit logging** — Append-only JSONL, SHA-256 hashes, never raw content
5. **Path validation** — Null byte rejection, base directory containment
6. **Memory signing** — HMAC-SHA256 on write, verified on retrieval
7. **Advisory retrieval** — Memories are context, never directives

## Documentation

- [API Reference](docs/API.md) — All JSON-RPC methods
- [Adapter Guide](docs/ADAPTERS.md) — How to build a new adapter
- [Capsule Guide](docs/CAPSULES.md) — How to create task-class capsules
- [Configuration](docs/CONFIGURATION.md) — All settings and CLI options
- [Security Model](docs/SECURITY.md) — Threat model and invariants
- [Contributing](CONTRIBUTING.md) — Development workflow and standards

## Requirements

- Node.js 24.x (`24.7.0` is pinned in `.nvmrc` and `.node-version`)
- macOS or Linux (POSIX file permissions)
- 5 runtime dependencies: `better-sqlite3`, `commander`, `onnxruntime-node`, `ulid`, `yaml`

For local development and test runs, load the pinned Node 24.x runtime before
running `npm install`, `npm run lint`, or `npm test`. If multiple Node binaries
are installed, ensure `node -v` resolves to `v24.x`; the repo now fails fast
with an explicit error under other Node majors instead of surfacing a native
module ABI mismatch later in the run.

## License

[MIT](LICENSE)
