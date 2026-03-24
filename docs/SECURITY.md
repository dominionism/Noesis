# Security Model

Noesis enforces 7 non-negotiable security invariants. These cannot be disabled, bypassed, or weakened by configuration, adapters, or user input.

## Seven Security Invariants

### Invariant 1: Secret Scanning Is Always On

**Implementation:** `src/security/secret-scanner.ts`

All content entering the memory system is scanned for secrets before storage. There is no "off" mode — only `redact` (replace with `[REDACTED]`) and `warn` (flag without replacing).

**Detection patterns (6 types):**

| Pattern | Example |
|---------|---------|
| AWS Access Keys | `AKIA1234567890123456` |
| GitHub Tokens | `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| JWT Tokens | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| PEM Private Keys | `-----BEGIN RSA PRIVATE KEY-----` |
| Connection Strings | `postgresql://user:pass@host/db` |
| Generic API Keys | `api_key=`, `apikey:`, `secret:` patterns |

**High-entropy detection:** Strings with Shannon entropy > 4.5 and length >= 20 characters are flagged as potential secrets. This catches Base64-encoded tokens, hex-encoded keys, and other high-randomness strings that don't match a specific pattern.

**Write pipeline integration:** Secret scanning is step 1 of the 9-step write pipeline. Content is scanned before any other processing occurs.

**Retrieval integration:** Retrieved memories are re-scanned before being returned to the caller, guarding against secrets that were stored before a pattern was added.

---

### Invariant 2: File Permission Enforcement

**Implementation:** `src/security/permissions.ts`

All Noesis-managed directories and files are created with strict POSIX permissions:

| Target | Permission | Rationale |
|--------|-----------|-----------|
| Directories (`~/.agents/`) | `0o700` | Owner rwx only — prevents other users from reading memory content |
| Database (`noesis.db`) | `0o600` | Owner rw only — prevents unauthorized reads of structured memory data |
| Config file (`noesis.yaml`) | `0o600` | Owner rw only — config may reference API key env vars |
| Audit log (`audit.log`) | `0o600` | Owner rw only — audit entries contain operation metadata |
| Signing key (`.signing_key`) | `0o400` | Owner read only — the key is written once and never modified |

Permission enforcement runs on every file/directory creation operation. Existing files are not re-permissioned (to avoid conflicts with user modifications), but new files always get correct permissions.

---

### Invariant 3: Dangerous Pattern Detection

**Implementation:** `src/security/dangerous-patterns.ts`

Content is scanned for patterns that could indicate dangerous instructions being stored as memories. When detected, the write is blocked unless the user explicitly confirms with `confirmed: true`.

**Detected patterns (15 types):**

| Category | Examples |
|----------|---------|
| Security bypass | `disable_ssl`, `--no-verify`, `verify=False` |
| Privilege escalation | `chmod 777`, `chmod 666`, `sudo` |
| Code injection | `eval()`, `exec()`, `Function()`, `__import__` |
| Data destruction | `DROP TABLE`, `rm -rf /`, `format c:` |
| Credential exposure | `hardcode`, `password =`, `secret =` |

**Interaction with write pipeline:** Dangerous pattern checking is step 2 of the write pipeline, immediately after secret scanning. If patterns are detected and the user has not confirmed, the write returns a `requires_confirmation` result with the list of detected patterns.

---

### Invariant 4: Audit Logging

**Implementation:** `src/security/audit.ts`

All security-relevant events are logged to an append-only JSONL file (`~/.agents/audit.log`).

**What is logged:**
- Memory writes (type, ID, project — never raw content)
- Memory deletions
- Signature verification failures
- Secret detections
- Dangerous pattern detections
- Configuration changes
- Session start/end events

**What is never logged:**
- Raw memory content
- Secret values (even redacted)
- User credentials
- API keys

**Log format:**

```json
{
  "timestamp": "2026-03-15T10:00:00.000Z",
  "event": "memory_written",
  "memory_id": "01HXYZ...",
  "memory_type": "lesson",
  "project_id": "myapp",
  "content_hash": "sha256:abc123..."
}
```

**Content hashing:** Instead of logging raw content, a SHA-256 hash of the content is logged. This enables forensic verification ("was this content the content that was stored?") without exposing the content itself.

**Log rotation:** When the audit log exceeds `audit_max_mb` (default: 10 MB), it is rotated. The current log is renamed with a timestamp suffix and a new empty log is created.

---

### Invariant 5: Path Traversal Prevention

**Implementation:** `src/security/path-validation.ts`

All filesystem paths are validated before use to prevent directory traversal attacks.

**Validation rules:**
- **Null byte rejection:** Paths containing `\0` are rejected (prevents null-byte injection attacks on C-based filesystem APIs)
- **Base directory containment:** All resolved paths must be within the Noesis home directory (`~/.agents/`). Paths that resolve outside this directory (via `..` traversal or absolute paths) are rejected
- **Empty path rejection:** Empty strings are not valid paths
- **Filename sanitization:** Filenames are validated to prevent injection via special characters

**Validation function:**

```typescript
validatePath(requestedPath: string, baseDir: string): {
  valid: boolean;
  resolvedPath: string;
  error?: string;
}
```

---

### Invariant 6: Memory Integrity Signing

**Implementation:** `src/security/hmac.ts`

Every memory is signed with HMAC-SHA256 on write and verified on retrieval. Tampered memories are excluded from retrieval results.

**Signing process:**

1. The signing key is stored at `~/.agents/.signing_key` with `0o400` permissions
2. A canonical JSON representation of the memory fields (`id`, `type`, `title`, `content`, `project_id`) is constructed
3. HMAC-SHA256 is computed over the canonical JSON using the signing key
4. The resulting hex-encoded signature is stored in the memory's `signature` column

**Verification process:**

1. On retrieval, each memory's signature is recomputed from its current field values
2. The recomputed signature is compared against the stored signature
3. Memories with mismatched signatures are flagged as `tampered` and excluded from results
4. An `integrity_violation` event is emitted for tampered memories

**Key management:**

- **Key generation:** A 32-byte cryptographically random key is generated using `crypto.randomBytes(32)` on first run
- **Key storage:** The key file uses `0o400` permissions (owner read-only)
- **Key loss recovery:** If the key file is missing on daemon start, a new key is generated and a warning is emitted. Existing signatures will fail verification, but memories are not deleted — they can be re-signed using `noesis repair`
- **Key rotation:** Not automatic. Use `noesis repair --rotate-key` to generate a new key and re-sign all memories

---

### Invariant 7: Advisory-Only Retrieval

All retrieved memories are **contextual and advisory** — they are never treated as directives or instructions.

**Enforcement:**
- Retrieval results include numerical scores, not action commands
- Context assembly renders memories as descriptive markdown, not executable instructions
- Anti-pattern checks return warnings and recommendations, not blocking rules (except in the critic system, which is a separate workflow)
- Skills are presented with confidence scores, allowing the user/agent to judge applicability

**Why this matters:** If retrieved memories could be treated as instructions, a poisoned memory (via a compromised adapter write-back) could hijack agent behavior. By keeping retrieval advisory-only, the agent always retains final decision authority.

---

## Threat Model

| Threat | Attack Vector | Mitigation |
|--------|--------------|-----------|
| Secrets in memory | User stores content containing API keys, passwords | Invariant 1: Secret scanning with Shannon entropy detection |
| Memory poisoning | Malicious content injected via adapter write-back | Invariant 3: Dangerous pattern blocking + Invariant 7: Advisory-only retrieval |
| Data exfiltration | Sensitive memories leaked to unauthorized adapters | Sensitivity classification + project-scoped retrieval + per-adapter sandboxing |
| Cross-project contamination | Memory from project A affects project B | Project isolation: queries default to current project. Cross-project search disabled by default |
| Adapter compromise | A compromised adapter sends malicious sync data | Adapters produce declarative output only; core validates all writes |
| Supply chain attack | Compromised npm dependency or ONNX model | Minimal dependencies (5 runtime), SafeTensors-only model loading, model hash verification |
| Multi-user access | Another user on the same machine reads memory data | Invariant 2: `0o700` directories, `0o600` files prevent other-user access |
| Tampered memories | Direct database modification outside Noesis | Invariant 6: HMAC signatures detect modification; tampered memories excluded from retrieval |
| Audit log tampering | Attacker modifies audit log to hide activity | Append-only log format; SHA-256 content hashes enable integrity verification |
| Path traversal | Crafted filename escapes `~/.agents/` directory | Invariant 5: Absolute path resolution with base-directory containment check |

## Novel Intelligence Layer Security

The novel intelligence layers introduce additional security surfaces:

| Layer | Risk | Mitigation |
|-------|------|-----------|
| Strategy Simulation | Simulated outcomes could be manipulated to favor a specific approach | Simulations are advisory-only; the user always chooses the strategy |
| Cognitive Profile | Privacy-sensitive data about user expertise and blind spots | Profile stored locally with `0o600` permissions; never synced to adapters; never included in shared context |
| Synthetic Experience | Synthetic memories could mislead if treated as real | Always tagged `source: synthetic`; excluded from skill synthesis; capped at 0.7x confidence; replaced by real memories when available |
| World Model | Could expose project structure and file topology | Scoped to current project; never cross-project; follows project isolation boundaries |
| Meta-Reasoning | Could override user decisions if given authority | Meta-reasoning is strictly advisory; signals and recommendations only, never autonomous action |

## Write Pipeline Security Steps

The 9-step write pipeline enforces security at every stage:

```
1. SECRET SCAN ──────> Scan content for secrets (Invariant 1)
2. DANGEROUS CHECK ──> Check for dangerous patterns (Invariant 3)
3. CLASSIFY ─────────> Determine memory type and sensitivity
4. GENERATE ID ──────> Create ULID for the memory
5. SIGN ─────────────> HMAC-SHA256 signature (Invariant 6)
6. VALIDATE ─────────> Schema validation
7. INSERT ───────────> Store in SQLite
8. AUDIT ────────────> Write audit log entry (Invariant 4)
9. EVENT ────────────> Emit memory_written event
```

## Retrieval Security Steps

The 8-step retrieval pipeline includes security checks:

```
1. PRE-FILTER ───────> Apply project/type/tag filters
2. FTS5 SEARCH ──────> BM25 full-text search
3. VECTOR SEARCH ────> Cosine similarity via sqlite-vec
4. RRF FUSION ───────> Reciprocal Rank Fusion
5. GRAPH WALK ───────> Knowledge graph re-ranking
6. RE-RANK ──────────> Apply composite scoring
7. HMAC VERIFY ──────> Verify memory signatures (Invariant 6)
8. SECRET SCAN ──────> Re-scan output for secrets (Invariant 1)
```

## Security Audit

Run `noesis audit` to query the security audit log:

```bash
# View recent audit entries
noesis audit --limit 50

# Filter by event type
noesis audit --type integrity_violation

# Filter by project
noesis audit --project myapp

# Output as JSON
noesis audit --json
```
