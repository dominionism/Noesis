# Noesis API Reference

All communication with the Noesis daemon uses **JSON-RPC 2.0** over a **Unix domain socket** at `~/.agents/daemon.sock`.

## Transport

```
Socket: ~/.agents/daemon.sock
Protocol: JSON-RPC 2.0
Encoding: UTF-8
Framing: Newline-delimited JSON
```

The daemon auto-starts when a client sends its first request (via `NoesisClient`) and auto-exits after 10 minutes of inactivity.

## Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "noesis.recall",
  "params": {
    "query": "how to handle auth tokens"
  }
}
```

## Response Format

### Success

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}
```

### Error

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "noesis.recall: missing or invalid required parameter \"query\""
  }
}
```

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse Error | Invalid JSON |
| -32600 | Invalid Request | Not a valid JSON-RPC 2.0 request |
| -32601 | Method Not Found | Unknown method name |
| -32602 | Invalid Params | Missing or invalid required parameter |
| -32603 | Internal Error | Server-side processing error |

---

## Memory Methods

### `noesis.recall`

Retrieve memories using hybrid search (FTS5 BM25 + vector cosine + recency + confidence + graph walk).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `project_id` | string | No | Scope results to a specific project |
| `limit` | number | No | Maximum results (default: 20, max: 20) |
| `type` | string[] | No | Filter by memory type(s) |
| `tags` | string[] | No | Filter by tag(s) |

**Memory types:** `task`, `decision`, `preference`, `skill`, `incident`, `lesson`, `checkpoint`, `session`, `verification`

**Result:**

```json
{
  "memories": [
    {
      "id": "01HXYZ...",
      "type": "skill",
      "title": "React state management",
      "content": "...",
      "score": 0.87,
      "project_id": "proj-1",
      "scope": "project",
      "confidence": 0.85,
      "created_at": "2026-03-10T14:30:00Z",
      "tags": "react,state"
    }
  ],
  "count": 5,
  "timings": { ... }
}
```

**Example:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "noesis.recall",
  "params": {
    "query": "database migration best practices",
    "project_id": "myapp",
    "limit": 5,
    "type": ["skill", "lesson"]
  }
}
```

---

### `noesis.remember`

Store a new memory through the 9-step write pipeline (secret scan, dangerous pattern check, classification, ID generation, HMAC signing, validation, INSERT, audit log, event emission).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `type` | string | Yes | Memory type (see types above) |
| `title` | string | Yes | Short descriptive title |
| `content` | string | Yes | Full memory content |
| `tags` | string[] | No | Categorization tags |
| `project_id` | string | No | Project scope |
| `scope` | string | No | `"global"`, `"project"`, or `"session"` |
| `sensitivity` | string | No | `"PUBLIC"`, `"INTERNAL"`, or `"RESTRICTED"` |
| `confidence` | number | No | Initial confidence (0.0-1.0, default: 0.5) |
| `outcome` | string | No | `"success"`, `"failed"`, `"partial_success"`, `"failed_then_fixed"` |
| `source` | string | No | Origin identifier (e.g., `"agent"`, `"user"`, `"system"`) |
| `session_id` | string | No | Link to active session |
| `confirmed` | boolean | No | Skip dangerous pattern confirmation (default: false) |

**Result:**

```json
{
  "success": true,
  "memory": {
    "id": "01HXYZ...",
    "type": "lesson",
    "title": "Always validate JWT expiry",
    "signature": "a1b2c3..."
  },
  "warnings": [],
  "redacted": false
}
```

**Security behavior:**
- Content is scanned for secrets (AWS keys, GitHub tokens, JWTs, PEM blocks, connection strings, high-entropy strings). In `redact` mode, detected secrets are replaced with `[REDACTED]`. In `warn` mode, a warning is returned.
- Content is scanned for dangerous patterns (e.g., `eval()`, `chmod 777`, `--no-verify`, `disable_ssl`). If detected and `confirmed` is not `true`, the write is rejected with a `requires_confirmation` response.
- The memory is signed with HMAC-SHA256 for integrity verification on retrieval.
- An audit log entry is written (never containing raw content).

---

### `noesis.forget`

Delete a memory by ID.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Memory ID (ULID) |

**Result:**

```json
{
  "success": true,
  "id": "01HXYZ..."
}
```

---

### `noesis.retrievalGap`

Analyze what knowledge gaps exist for a given task. Returns areas where memory coverage is thin and retrieval confidence is low.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Task description to analyze |
| `project_id` | string | No | Project scope |

**Result:**

```json
{
  "gaps": [
    {
      "area": "error handling",
      "severity": "high",
      "suggestion": "No lessons about error handling in this project"
    }
  ],
  "coverage_score": 0.45,
  "unresolved_conflicts": 2
}
```

---

### `noesis.checkAction`

Advisory check against anti-patterns and past incidents before taking an action. Returns warnings and recommendations, never directives.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | Description of the planned action |
| `project_id` | string | No | Project scope |

**Result:**

```json
{
  "advisories": [
    {
      "type": "anti_pattern",
      "title": "Direct database access in handler",
      "severity": "warning",
      "recommendation": "Use repository pattern for DB access"
    }
  ],
  "risk_level": "medium"
}
```

---

### `noesis.explain`

Full scoring breakdown for a retrieval query. Shows how each factor (BM25, vector similarity, recency, confidence, graph walk) contributed to the final score. Useful for debugging retrieval quality.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | The retrieval query to explain |
| `memory_id` | string | No | Explain scoring for a specific memory |
| `project_id` | string | No | Project scope |

**Result:**

```json
{
  "query": "auth token handling",
  "explanations": [
    {
      "memory_id": "01HXYZ...",
      "title": "JWT refresh flow",
      "final_score": 0.87,
      "components": {
        "fts_score": 0.92,
        "vector_similarity": 0.85,
        "recency_modifier": 1.0,
        "confidence_score": 0.80,
        "graph_boost": 1.15
      },
      "integrity": {
        "signature_valid": true,
        "tampered": false
      }
    }
  ]
}
```

---

## Session Methods

### `noesis.sessionStart`

Start a new agent session. Creates a session-type memory and emits a `memory_written` event.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `project_id` | string | No | Project scope |
| `agent` | string | No | Agent identifier (default: `"unknown"`) |

**Result:**

```json
{
  "session_id": "01HXYZ...",
  "started_at": "2026-03-15T10:00:00Z"
}
```

---

### `noesis.sessionEnd`

End an active session. Updates the session memory with completion status and optional summary.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `session_id` | string | Yes | Session ID from `sessionStart` |
| `summary` | string | No | Session summary |

**Result:**

```json
{
  "session_id": "01HXYZ...",
  "ended_at": "2026-03-15T11:30:00Z"
}
```

---

### `noesis.sessionList`

List recent sessions, optionally filtered by project.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `project_id` | string | No | Filter by project |
| `limit` | number | No | Maximum results (default: 20) |

**Result:**

```json
{
  "sessions": [
    {
      "id": "01HXYZ...",
      "title": "Session: claude-code",
      "project_id": "myapp",
      "created_at": "2026-03-15T10:00:00Z",
      "content": "{\"agent\":\"claude-code\",\"status\":\"completed\",...}"
    }
  ],
  "count": 5
}
```

---

## Sync Methods

### `noesis.sync`

Trigger bidirectional sync with a specific adapter. Pushes context to the adapter's config files and ingests write-back content from the adapter's inbox.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `adapter_id` | string | Yes | Adapter identifier (e.g., `"claude-code"`, `"cursor"`) |
| `project_id` | string | No | Project scope |

**Result:**

```json
{
  "status": "completed",
  "adapter_id": "claude-code",
  "files_written": 2,
  "learnings_ingested": 3,
  "tokens_used": 12500
}
```

---

### `noesis.subscribe`

Subscribe to push-based event notifications from the daemon.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `events` | string[] | Yes | Event types to subscribe to |

**Event types:**

| Event | Description |
|-------|-------------|
| `memory_written` | A new memory was stored |
| `memory_conflict_detected` | Two memories contradict each other |
| `skill_promoted` | A draft skill was promoted to approved |
| `skill_archived` | A skill was archived |
| `anti_pattern_created` | A new anti-pattern was synthesized |
| `checkpoint_available` | A checkpoint is ready for review |
| `integrity_violation` | HMAC verification failed on a memory |
| `workflow_state_changed` | Workflow phase transition |
| `learning_captured` | A lesson was automatically captured |

**Result:**

```json
{
  "status": "subscribed",
  "subscribed_events": ["memory_written", "integrity_violation"]
}
```

---

## Workflow Methods

### `noesis.planCreate`

Create a new plan using the RPI (Research-Plan-Implement) pipeline. The plan is enriched with relevant memories, skills, and anti-patterns.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | string | Yes | Task description |
| `project_id` | string | No | Project scope |

---

### `noesis.planStatus`

Get the current status of an active plan.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `plan_id` | string | Yes | Plan identifier |

---

### `noesis.scoreReadiness`

Score the readiness of a task for implementation. Returns a 5-dimension readiness assessment (clarity, codebase, prior art, risk, complexity) with a minimum threshold of 70.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | string | Yes | Task description |
| `project_id` | string | No | Project scope |

---

### `noesis.critique`

Run evidence-backed critique on a plan or implementation. Evaluates 7 research dimensions and 7 plan dimensions with blocking/warning/advisory severity levels.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `plan_id` | string | Yes | Plan to critique |
| `phase` | string | No | `"research"` or `"plan"` |

---

### `noesis.verify`

Run 3-level goal-backward verification (exists, substantive, wired) against a plan or implementation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `plan_id` | string | Yes | Plan to verify |

---

### `noesis.routeExpert`

Route a task to the most appropriate expert agent based on task characteristics and user cognitive profile.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | string | Yes | Task description |
| `project_id` | string | No | Project scope |

---

## Composite Retrieval Scoring

All retrieval results are scored using a 5-factor composite:

| Factor | Weight | Source |
|--------|--------|--------|
| FTS BM25 | 30% | SQLite FTS5 full-text search |
| Vector cosine | 25% | sqlite-vec with Snowflake Arctic Embed-S |
| Recency | 15% | Tiered decay (7d/30d/90d/365d bands) |
| Confidence | 15% | Bayesian tracking with Laplace smoothing |
| Graph walk | 15% | Knowledge graph traversal (max depth 3) |

The final score is fused using Reciprocal Rank Fusion (RRF, k=60).

## Degraded Modes

The daemon handles 5 degraded scenarios gracefully:

| Scenario | Behavior |
|----------|----------|
| Daemon crash | Stale PID file cleaned on next start |
| DB corruption | Detected via `integrity_check`, attempts VACUUM repair |
| ONNX failure | Continues without semantic search (BM25 + graph fallback) |
| Disk exhaustion | Enters read-only mode, refuses writes until space available |
| Key loss | Generates new signing key, warns about existing signature invalidation |
