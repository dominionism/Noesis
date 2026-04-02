# Contributing to Noesis

Thank you for your interest in contributing to Noesis. This document covers the development workflow, code standards, and submission process.

## Getting Started

### Prerequisites

- Node.js 24.x (`24.7.0` is pinned in `.nvmrc` and `.node-version`)
- npm >= 10
- macOS or Linux (POSIX file permissions required)

### Setup

```bash
git clone https://github.com/<org>/noesis.git
cd noesis
# Load the pinned Node 24.x runtime before running npm commands.
npm install
npm run build
npm test
```

### Project Structure

```
src/
├── adapters/         # Tool-specific adapter implementations (9 adapters)
├── cli/              # Commander-based CLI (30 commands)
├── core/             # Database, schema, CRUD, ULID
├── daemon/           # JSON-RPC 2.0 daemon (server, socket, RPC, events, client)
├── embedding/        # ONNX embedding provider (Arctic Embed-S)
├── graph/            # Knowledge graph (edges, traversal, causal chains)
├── intelligence/     # Novel intelligence layers (14 modules)
├── memory/           # Memory tiers (hot, warm/cold, write pipeline)
├── retrieval/        # Hybrid retrieval (FTS5 + vector + graph + scoring)
├── security/         # 7 security invariants (HMAC, scanner, audit, etc.)
├── sync/             # Multi-adapter sync (format bridges, capability negotiation)
├── workflow/         # RPI workflow engine (plan, critic, verification, etc.)
├── config.ts         # YAML configuration loader
├── constants.ts      # All numeric constants and paths
└── types.ts          # Single source of truth for all type definitions
```

## Development Workflow

### 1. Pick an Issue

Check the issue tracker for open issues. Issues labeled `good first issue` are suitable for new contributors.

### 2. Create a Branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 3. Make Changes

- Write code following the standards below
- Write tests for new functionality
- Run the test suite before committing

### 4. Test

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npx vitest run src/__tests__/security/hmac.test.ts

# Type check
npm run lint
```

### 5. Submit a Pull Request

- Write a clear PR title (under 70 characters)
- Include a summary of changes and motivation
- Reference any related issues
- Ensure all tests pass

## Code Standards

### TypeScript

- **Strict mode** enabled (`strict: true` in `tsconfig.json`)
- **Target:** ES2022
- **Module system:** ESM (`"type": "module"` in `package.json`)
- All imports use `.js` extension (ESM requirement)
- No `any` types unless explicitly justified
- No `require()` — ESM only

### Architecture Principles

- **Separation of concerns:** Each module has a single responsibility
- **Dependency injection:** External dependencies injected via function parameters
- **Pure functions preferred:** Adapters produce declarative output; core executes
- **Fail fast:** Validate inputs at boundaries, not deep in call stacks
- **Explicit over implicit:** No magic values; use named constants from `constants.ts`

### Security (Non-Negotiable)

Every contribution must respect the 7 security invariants:

1. Secret scanning cannot be disabled
2. File permissions must be enforced
3. Dangerous patterns must be detected
4. Audit logging must be active
5. Path traversal must be prevented
6. Memory integrity signing must be maintained
7. Retrieval must be advisory-only

Contributions that weaken, bypass, or disable any invariant will be rejected.

### Testing

- **Framework:** vitest with `pool: forks`, `fileParallelism: false`
- **Pattern:** Write tests before or alongside implementation
- **Coverage focus:** Behavior-focused tests covering happy path, edge cases, and failure cases
- **Database tests:** Use in-memory SQLite (`:memory:`)
- **Embedding tests:** Use mock embedding providers
- **No snapshot tests** for security-critical code

Test file location mirrors source:
- `src/security/hmac.ts` → `src/__tests__/security/hmac.test.ts`
- `src/adapters/claude-code.ts` → `src/__tests__/adapters/claude-code.test.ts`

### Performance Targets

Contributions must not regress these benchmarks:

| Operation | Target |
|-----------|--------|
| Single memory write | < 50ms |
| Batch write (10) | < 200ms |
| Secret scan (10KB) | < 20ms |
| Path validation (1000 paths) | < 20ms |
| Context assembly | < 10ms |
| ULID generation (1000) | < 100ms |
| Content hashing (1000) | < 50ms |

### Commit Messages

- Use imperative mood: "Add feature" not "Added feature"
- Keep the first line under 72 characters
- Reference issues: "Fix #123: Handle null embeddings in clustering"

## What to Contribute

### High-Impact Areas

- **New adapters:** Support for additional CLI coding tools
- **New capsules:** Domain-specific task-class operating packs
- **Intelligence improvements:** Better retrieval scoring, smarter distillation
- **Performance:** Faster retrieval, lower memory usage
- **Testing:** Increase coverage, add edge cases

### What Not to Submit

- Changes that disable or weaken security invariants
- Dependencies with known CVEs
- Deprecated or unmaintained dependencies
- Breaking changes to the JSON-RPC API without a migration path
- Debug/development-only code in production paths

## Dependencies

Noesis uses minimal runtime dependencies by design:

| Package | Purpose |
|---------|---------|
| `better-sqlite3` | SQLite database with FTS5 and WAL |
| `commander` | CLI argument parsing |
| `onnxruntime-node` | Local ONNX embedding model inference |
| `ulid` | Universally Unique Lexicographically Sortable Identifiers |
| `yaml` | YAML config parsing |

New dependencies require justification. Prefer stdlib solutions where possible. All dependencies must:
- Be actively maintained
- Have no known CVEs
- Be compatible with the MIT license

## Code of Conduct

Be respectful, constructive, and collaborative. Focus on the technical merits of contributions. Assume good intent.

## Questions?

Open an issue with the `question` label or start a discussion in the repository's Discussions tab.
