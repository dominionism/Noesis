# Configuration Reference

Noesis is configured via `~/.agents/noesis.yaml`. If the file does not exist, sensible defaults are used. The config file is read on daemon startup and can be updated via `noesis init` or manual editing.

## Configuration File

**Location:** `~/.agents/noesis.yaml`
**Permissions:** `0o600` (owner read/write only)
**Format:** YAML

## Complete Configuration

```yaml
# Informational retention target for archived memories
retention_days: 180

# Embedding model identifier
embedding_model: snowflake-arctic-embed-s

# LLM provider for synthesis operations (skill synthesis, knowledge distillation, etc.)
llm_provider:
  provider: anthropic
  model: claude-sonnet-4-20250514
  api_key_env: ANTHROPIC_API_KEY

# Maximum size for optional cold-storage JSONL archives
cold_storage_max_mb: 50

# Maximum audit log size (MB) before rotation
audit_max_mb: 10

# Secret scanning mode: 'redact' replaces secrets, 'warn' flags without replacing
secret_scan_mode: redact

# Per-tool adapter configurations
tools: {}

# Per-project configurations
projects: {}
```

## Configuration Options

### `retention_days`

| | |
|---|---|
| **Type** | number |
| **Default** | 180 |
| **Valid range** | > 0 |

Configured retention target for archived memories. The current runtime keeps archived memories in SQLite, and `noesis gc` uses its own `--older-than` flag rather than reading this setting directly.

### `embedding_model`

| | |
|---|---|
| **Type** | string |
| **Default** | `snowflake-arctic-embed-s` |

Identifier for the local ONNX embedding model used for vector similarity search. The model files are stored in `~/.agents/models/`. Produces 384-dimensional embeddings.

### `llm_provider`

| | |
|---|---|
| **Type** | object |
| **Default** | See below |

Configuration for the LLM used in synthesis operations (skill synthesis, anti-pattern synthesis, knowledge distillation, prompt optimization).

```yaml
llm_provider:
  provider: anthropic           # Provider name
  model: claude-sonnet-4-20250514  # Model identifier
  api_key_env: ANTHROPIC_API_KEY   # Environment variable containing the API key
```

The API key is never stored in the config file. It is always read from the environment variable specified by `api_key_env`.

### `cold_storage_max_mb`

| | |
|---|---|
| **Type** | number |
| **Default** | 50 |
| **Valid range** | > 0 |

Maximum total size (in MB) of the optional cold-storage directory (`~/.agents/cold/`). The default daemon/archive path does not populate this directory automatically; it is only relevant to separate cold-storage utilities and manual workflows.

### `audit_max_mb`

| | |
|---|---|
| **Type** | number |
| **Default** | 10 |
| **Valid range** | > 0 |

Maximum size (in MB) of the audit log (`~/.agents/audit.log`). When exceeded, the log is rotated (the current log is renamed with a timestamp suffix and a new empty log is created).

### `secret_scan_mode`

| | |
|---|---|
| **Type** | string |
| **Default** | `redact` |
| **Valid values** | `redact`, `warn` |

Controls how detected secrets are handled in the write pipeline:

- **`redact`** — Detected secrets are replaced with `[REDACTED]` before storage. The memory is stored with the redacted content.
- **`warn`** — Detected secrets are flagged in the response but the original content is preserved. Use this when you need to store content that legitimately contains high-entropy strings.

Note: Secret scanning cannot be disabled entirely. This is a security invariant.

### `tools`

| | |
|---|---|
| **Type** | object |
| **Default** | `{}` |

Per-tool adapter configurations. Keys are adapter IDs (e.g., `claude-code`, `cursor`). Values are tool-specific settings.

```yaml
tools:
  claude-code:
    config_path: ~/.claude/CLAUDE.md
    token_budget: 50000
  cursor:
    config_path: ~/.cursor/rules
    token_budget: 8000
```

### `projects`

| | |
|---|---|
| **Type** | object |
| **Default** | `{}` |

Per-project configurations. Keys are project IDs. Values override global settings for that project.

```yaml
projects:
  my-api:
    retention_days: 365
    secret_scan_mode: redact
  prototype:
    retention_days: 30
```

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `ANTHROPIC_API_KEY` | API key for Anthropic LLM calls | Only for synthesis operations |
| `NOESIS_HOME` | Override base directory (default: `~/.agents`) | No |
| `NOESIS_LOG_LEVEL` | Daemon log verbosity | No |

## Directory Structure

All Noesis state lives under `~/.agents/` (configurable via `NOESIS_HOME`):

```
~/.agents/
├── noesis.yaml          # Configuration (0o600)
├── noesis.db            # SQLite database (0o600)
├── .signing_key         # HMAC-SHA256 key (0o400)
├── audit.log            # Security audit log (0o600)
├── daemon.sock          # Unix domain socket
├── daemon.pid           # Daemon PID file
├── memory/              # Hot memory tier (markdown)
├── skills/              # Synthesized skill definitions
├── anti-patterns/       # Anti-pattern definitions
├── cold/                # Cold storage (JSONL archives)
├── backups/             # Database backups
├── models/              # ONNX embedding model files
├── inbox/               # Write-back inbox from adapters
├── prompts/             # Prompt assets
├── capsules/            # Task-class operating packs
├── adapters/            # Per-tool adapter configs
├── agents/              # Expert agent definitions
├── commands/            # Command definitions
├── contexts/            # Project/user context entries
├── rules/               # Workflow policy rules
├── scripts/             # Helper scripts
├── projects/            # Project metadata
├── get-shit-done/       # GSD execution state
├── shell/               # Shell integration
├── manifest.json        # Adapter manifest
├── sync.sh              # Sync helper script
└── hooks/               # Background monitoring hooks
```

## File Permissions

All directories and files are created with strict POSIX permissions:

| Target | Permission | Octal |
|--------|-----------|-------|
| Directories | Owner rwx only | `0o700` |
| Database | Owner rw only | `0o600` |
| Config file | Owner rw only | `0o600` |
| Audit log | Owner rw only | `0o600` |
| Signing key | Owner read only | `0o400` |

## Numeric Constants

These values are defined in `src/constants.ts` and are not user-configurable:

| Constant | Value | Description |
|----------|-------|-------------|
| `EMBEDDING_DIMENSIONS` | 384 | Embedding vector dimensionality |
| `SCHEMA_VERSION` | 3 | Database schema version |
| `HOT_MEMORY_LINE_LIMIT` | 2,000 | Max lines per hot memory file |
| `MAX_MEMORIES` | 10,000 | Max memories per database |
| `MAX_MEMORY_TOKENS` | 2,000 | Max tokens per memory |
| `MAX_RETRIEVAL_RESULTS` | 20 | Max results per query |
| `RRF_K` | 60 | Reciprocal Rank Fusion constant |
| `CONFLICT_SIMILARITY_THRESHOLD` | 0.70 | Cosine similarity for conflict detection |
| `CLUSTERING_SIMILARITY_THRESHOLD` | 0.80 | Cosine similarity for clustering |
| `CLUSTERING_MIN_SIZE` | 3 | Min cluster size for skill promotion |
| `ENTROPY_THRESHOLD` | 4.5 | Shannon entropy for secret detection |
| `MAX_GRAPH_DEPTH` | 3 | Max knowledge graph traversal depth |
| `MAX_GRAPH_FANOUT` | 10 | Max edges per node during traversal |
| `CONFIDENCE_DECAY_MONTHLY` | 0.02 | Monthly confidence decay factor |
| `DAEMON_IDLE_TIMEOUT_MS` | 600,000 | 10-minute idle auto-exit |
| `READINESS_THRESHOLD_TOTAL` | 70 | Minimum readiness score |
| `MAX_CRITIC_CYCLES` | 2 | Maximum critique revision cycles |

## Retrieval Scoring Weights

| Factor | Weight | Description |
|--------|--------|-------------|
| FTS BM25 | 30% | Full-text search relevance |
| Vector cosine | 25% | Semantic similarity |
| Recency | 15% | Time-based decay (tiered) |
| Confidence | 15% | Bayesian confidence score |
| Graph walk | 15% | Knowledge graph relationship boost |

## CLI Global Options

All CLI commands accept these global options:

| Option | Description |
|--------|-------------|
| `--verbose` | Enable verbose output |
| `--json` | Output in JSON format |
| `--project <id>` | Scope to a specific project |

## CLI Commands

### Memory Commands

| Command | Description |
|---------|-------------|
| `noesis remember` | Store a new memory |
| `noesis recall` | Search memories |
| `noesis forget` | Delete a memory |
| `noesis correct` | Store a structured correction as a lesson |
| `noesis check` | Advisory check against anti-patterns |
| `noesis gap` | Retrieval gap analysis |
| `noesis explain` | Full scoring breakdown |

### Workflow Commands

| Command | Description |
|---------|-------------|
| `noesis plan` | Create/status/iterate plans |
| `noesis research` | Research current state |
| `noesis critique` | Evidence-backed critique |
| `noesis verify` | Goal-backward verification |
| `noesis route` | Expert agent routing |
| `noesis optimize` | Prompt optimization |
| `noesis simulate` | Strategy simulation |

### Session Commands

| Command | Description |
|---------|-------------|
| `noesis session` | Session lifecycle management |
| `noesis handoff` | Cross-agent handoff |

### Operations Commands

| Command | Description |
|---------|-------------|
| `noesis init` | First-time setup |
| `noesis quickstart` | Interactive onboarding |
| `noesis status` | System health and metrics |
| `noesis sync` | Bidirectional adapter sync |
| `noesis import-config` | Import from existing tool configs |
| `noesis learn` | Process a structured learning event and write back corrections |
| `noesis skills` | Manage skills and anti-patterns |
| `noesis audit` | Query audit log |
| `noesis gc` | Garbage collection (manual only) |
| `noesis project` | Project management |
| `noesis repair` | Repair signing key or database |
| `noesis export` | Full backup |
| `noesis import` | Restore from backup |
| `noesis migrate-embeddings` | Re-embed with new model |
