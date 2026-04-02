/**
 * Noesis Constants
 *
 * All magic values, filesystem paths, numeric defaults, and permission masks
 * used across the Noesis intelligence layer.
 *
 * Path constants resolve `~` to the actual home directory at import time.
 * File permission constants use octal notation matching POSIX chmod values.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Base directory
// ---------------------------------------------------------------------------

const HOME = homedir();

/** Root directory for all Noesis state. Created with 0o700 permissions. */
export const NOESIS_HOME: string = join(HOME, '.agents');

// ---------------------------------------------------------------------------
// File / directory paths
// ---------------------------------------------------------------------------

/** SQLite database path. */
export const DB_PATH: string = join(NOESIS_HOME, 'noesis.db');

/** HMAC-SHA256 signing key used for memory integrity signatures. */
export const SIGNING_KEY_PATH: string = join(NOESIS_HOME, '.signing_key');

/** Append-only audit log. */
export const AUDIT_LOG_PATH: string = join(NOESIS_HOME, 'audit.log');

/** Unix domain socket for the background daemon. */
export const DAEMON_SOCKET_PATH: string = join(NOESIS_HOME, 'daemon.sock');

/** PID file for the background daemon. */
export const DAEMON_PID_PATH: string = join(NOESIS_HOME, 'daemon.pid');

/** Directory for cold-storage JSONL archives. */
export const COLD_STORAGE_DIR: string = join(NOESIS_HOME, 'cold');

/** Directory for database backups. */
export const BACKUPS_DIR: string = join(NOESIS_HOME, 'backups');

/** Directory for adapter write-back inbox files. */
export const INBOX_DIR: string = join(NOESIS_HOME, 'inbox');

/** Directory for archived processed inbox files. */
export const PROCESSED_INBOX_DIR: string = join(INBOX_DIR, 'processed');

/** Directory for local ONNX embedding models. */
export const MODELS_DIR: string = join(NOESIS_HOME, 'models');

/** Directory for hot-memory markdown files (per-project). */
export const MEMORY_DIR: string = join(NOESIS_HOME, 'memory');

/** Directory for promoted skill YAML definitions. */
export const SKILLS_DIR: string = join(NOESIS_HOME, 'skills');

/** Directory for anti-pattern YAML definitions. */
export const ANTI_PATTERNS_DIR: string = join(NOESIS_HOME, 'anti-patterns');

/** Master YAML configuration file. */
export const CONFIG_PATH: string = join(NOESIS_HOME, 'noesis.yaml');

// ---------------------------------------------------------------------------
// Workflow & orchestration directories
// ---------------------------------------------------------------------------

/** Base operating philosophy prompts. */
export const PROMPTS_DIR: string = join(NOESIS_HOME, 'prompts');

/** Workflow policy rules. */
export const RULES_DIR: string = join(NOESIS_HOME, 'rules');

/** Task-class operating packs. */
export const CAPSULES_DIR: string = join(NOESIS_HOME, 'capsules');

/** Expert agent definitions (markdown + frontmatter). */
export const AGENTS_DIR: string = join(NOESIS_HOME, 'agents');

/** CLI commands exposed to agents. */
export const COMMANDS_DIR: string = join(NOESIS_HOME, 'commands');

/** Shared context files. */
export const CONTEXTS_DIR: string = join(NOESIS_HOME, 'contexts');

/** Tool hooks. */
export const HOOKS_DIR: string = join(NOESIS_HOME, 'hooks');

/** Per-tool adapter configs. */
export const ADAPTERS_DIR: string = join(NOESIS_HOME, 'adapters');

/** Per-project runtime state. */
export const PROJECTS_DIR: string = join(NOESIS_HOME, 'projects');

/** Utility scripts. */
export const SCRIPTS_DIR: string = join(NOESIS_HOME, 'scripts');

/** GSD project management system. */
export const GSD_DIR: string = join(NOESIS_HOME, 'get-shit-done');

/** Shell integration (hook, completions). */
export const SHELL_DIR: string = join(NOESIS_HOME, 'shell');

/** Tool capability matrix and symlink declarations. */
export const MANIFEST_PATH: string = join(NOESIS_HOME, 'manifest.json');

/** Multi-tool sync script. */
export const SYNC_SCRIPT_PATH: string = join(NOESIS_HOME, 'sync.sh');

// ---------------------------------------------------------------------------
// Numeric limits
// ---------------------------------------------------------------------------

/** Maximum line count for hot-memory files before rotation. */
export const HOT_MEMORY_LINE_LIMIT: number = 2000;

/** Dimensionality of the default embedding model output. */
export const EMBEDDING_DIMENSIONS: number = 384;

/** Identifier for the default local embedding model. */
export const EMBEDDING_MODEL_ID: string = 'snowflake-arctic-embed-s';

/** Current database schema version (for migrations). */
export const SCHEMA_VERSION: number = 3;

/** Maximum size (MB) of the audit log before rotation. */
export const AUDIT_MAX_MB: number = 10;

/** Maximum size (MB) of cold-storage directory before pruning. */
export const COLD_STORAGE_MAX_MB: number = 50;

/** Default retention period (days) for memories before archival. */
export const DEFAULT_RETENTION_DAYS: number = 180;

/** Maximum number of memories in a single database. */
export const MAX_MEMORIES: number = 10_000;

/** Maximum token count for a single memory. */
export const MAX_MEMORY_TOKENS: number = 2000;

/** Maximum retrieval results per query. */
export const MAX_RETRIEVAL_RESULTS: number = 20;

// ---------------------------------------------------------------------------
// Retrieval algorithm parameters
// ---------------------------------------------------------------------------

/** Reciprocal Rank Fusion constant k (used only for BM25 rank normalization). */
export const RRF_K: number = 60;

/**
 * Minimum cosine similarity for a vector-only match to be included in results.
 * Memories below this threshold are excluded unless they also match on BM25
 * keywords. This prevents returning irrelevant memories in small stores.
 */
export const VECTOR_SIMILARITY_FLOOR: number = 0.15;

/**
 * Weight of BM25 keyword boost on top of cosine similarity.
 * BM25 rank 1 gets full boost, rank N gets boost/N.
 */
export const BM25_BOOST_WEIGHT: number = 0.3;

/**
 * Baseline score for memories that match on BM25 keywords only (no embedding
 * or below vector floor). Divided by BM25 rank: rank 1 = full baseline.
 */
export const BM25_ONLY_BASELINE: number = 0.25;

/**
 * Cosine similarity threshold for write-time deduplication.
 * If a new memory's embedding is above this threshold vs an existing memory,
 * and their content Jaccard similarity is also above DEDUP_JACCARD_THRESHOLD,
 * the write is flagged as a near-duplicate.
 */
export const DEDUP_COSINE_THRESHOLD: number = 0.85;

/**
 * Jaccard word-overlap threshold for write-time deduplication.
 * Used together with DEDUP_COSINE_THRESHOLD to reduce false positives.
 */
export const DEDUP_JACCARD_THRESHOLD: number = 0.60;

/** Cosine similarity threshold for flagging potential conflicts. */
export const CONFLICT_SIMILARITY_THRESHOLD: number = 0.70;

/** Cosine similarity threshold for clustering related memories. */
export const CLUSTERING_SIMILARITY_THRESHOLD: number = 0.80;

/** Minimum cluster size to trigger skill promotion. */
export const CLUSTERING_MIN_SIZE: number = 3;

/** k-nearest neighbors used in clustering. */
export const CLUSTERING_K_NEIGHBORS: number = 20;

/** Similarity threshold for cold-start pattern detection. */
export const COLD_START_SIMILARITY_THRESHOLD: number = 0.75;

/** Minimum cluster size for cold-start skill extraction. */
export const COLD_START_MIN_SIZE: number = 2;

/** Number of memories to analyze during cold-start. */
export const COLD_START_MEMORY_COUNT: number = 50;

/** Epsilon value for epsilon-greedy exploration in retrieval. */
export const EPSILON_GREEDY: number = 0.1;

/** Maximum depth for graph traversal. */
export const MAX_GRAPH_DEPTH: number = 3;

/** Maximum fan-out per node during graph traversal. */
export const MAX_GRAPH_FANOUT: number = 10;

/** Monthly confidence decay factor. */
export const CONFIDENCE_DECAY_MONTHLY: number = 0.02;

/** Shannon entropy threshold for secret detection. */
export const ENTROPY_THRESHOLD: number = 4.5;

// ---------------------------------------------------------------------------
// Composite scoring weights
// ---------------------------------------------------------------------------

/** Weight factors for 5-factor composite retrieval scoring. */
export const SCORING_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  fts: 0.30,
  vector: 0.25,
  recency: 0.15,
  confidence: 0.15,
  graph: 0.15,
});

// ---------------------------------------------------------------------------
// Cache sizes
// ---------------------------------------------------------------------------

/** LRU cache capacity for embedding vectors. */
export const EMBEDDING_CACHE_SIZE: number = 100;

/** LRU cache capacity for retrieval result sets. */
export const RESULT_CACHE_SIZE: number = 50;

// ---------------------------------------------------------------------------
// Daemon
// ---------------------------------------------------------------------------

/** Idle timeout (ms) before the daemon shuts itself down. 10 minutes. */
export const DAEMON_IDLE_TIMEOUT_MS: number = 600_000;

// ---------------------------------------------------------------------------
// Workflow parameters
// ---------------------------------------------------------------------------

/** Minimum total readiness score to pass the gate. */
export const READINESS_THRESHOLD_TOTAL: number = 70;

/** Minimum clarity dimension score. */
export const READINESS_THRESHOLD_CLARITY: number = 15;

/** Minimum codebase dimension score. */
export const READINESS_THRESHOLD_CODEBASE: number = 15;

/** Maximum critic revision cycles. */
export const MAX_CRITIC_CYCLES: number = 2;

// ---------------------------------------------------------------------------
// Context snapshot token budgets
// ---------------------------------------------------------------------------

/** Token budget per tool for context snapshot injection. */
export const CONTEXT_SNAPSHOT_TOKEN_BUDGET: number = 1000;

/** Number of top skills to include in context snapshot. */
export const CONTEXT_SNAPSHOT_TOP_SKILLS: number = 5;

/** Number of top anti-patterns to include in context snapshot. */
export const CONTEXT_SNAPSHOT_TOP_ANTIPATTERNS: number = 3;

// ---------------------------------------------------------------------------
// Token budgets per agent tool
// ---------------------------------------------------------------------------

/**
 * Default maximum context-window tokens each tool adapter may consume.
 * Keys are adapter identifiers; values are token counts.
 */
export const TOKEN_BUDGETS: Readonly<Record<string, number>> = Object.freeze({
  'claude-code': 50_000,
  'codex-cli': 20_000,
  'opencode': 20_000,
  'antigravity': 20_000,
  'openclaw': 20_000,
  'cursor': 8_000,
  'copilot': 4_000,
  'aider': 20_000,
  'generic': 10_000,
});

// ---------------------------------------------------------------------------
// POSIX file permissions
// ---------------------------------------------------------------------------

/**
 * Permission masks applied when creating Noesis directories and files.
 *
 * - Directories: 0o700 (owner rwx only)
 * - Database / audit log: 0o600 (owner rw only)
 * - Signing key: 0o400 (owner read only)
 */
export const FILE_PERMISSIONS: Readonly<Record<string, number>> = Object.freeze({
  DIR: 0o700,
  DB: 0o600,
  SIGNING_KEY: 0o400,
  AUDIT_LOG: 0o600,
  CONFIG: 0o600,
});

// ---------------------------------------------------------------------------
// Managed section markers
// ---------------------------------------------------------------------------

/** Marker prefix for managed sections injected into tool configs. */
export const MANAGED_SECTION_MARKER: string = 'NOESIS';

/** Managed section version. */
export const MANAGED_SECTION_VERSION: string = '1.0.0';

// ---------------------------------------------------------------------------
// Knowledge graph edge types
// ---------------------------------------------------------------------------

/** All valid typed edge relations for the knowledge graph. */
export const EDGE_RELATIONS = [
  'causes',
  'caused_by',
  'contradicts',
  'supersedes',
  'requires',
  'exemplifies',
  'generalizes',
  'prevents',
  'corrects',
  'related_to',
  'part_of',
  'created_during',
] as const;

export type EdgeRelation = (typeof EDGE_RELATIONS)[number];

// ---------------------------------------------------------------------------
// Cognitive Architecture — Rule Engine
// ---------------------------------------------------------------------------

/** Confidence below which a rule is archived (after min uses). */
export const RULE_CONFIDENCE_ARCHIVE_THRESHOLD: number = 0.3;

/** Minimum outcome count before auto-archive is considered. */
export const RULE_CONFIDENCE_ARCHIVE_MIN_USES: number = 5;

/** Monthly decay factor applied to unused rule confidence. */
export const RULE_DECAY_FACTOR: number = 0.95;

/** Days of inactivity before a rule's confidence begins decaying. */
export const RULE_DECAY_THRESHOLD_DAYS: number = 90;

/** Maximum number of built-in rules. */
export const RULE_MAX_BUILT_IN: number = 20;

/** Semantic similarity threshold for rule matching. */
export const RULE_SEMANTIC_MATCH_THRESHOLD: number = 0.6;

// ---------------------------------------------------------------------------
// Cognitive Architecture — Expert System
// ---------------------------------------------------------------------------

/** Minimum routing score to consider an expert match. */
export const EXPERT_ROUTING_MIN_SCORE: number = 0.3;

/** Minimum tasks before performance statistics are trusted. */
export const EXPERT_PERFORMANCE_MIN_TASKS: number = 5;

/** Success rate below which an expert is archived. */
export const EXPERT_ARCHIVE_THRESHOLD: number = 0.25;

/** Maximum number of built-in experts. */
export const EXPERT_MAX_BUILT_IN: number = 50;

// ---------------------------------------------------------------------------
// Cognitive Architecture — Deep Capsules
// ---------------------------------------------------------------------------

/** Minimum match score to consider a capsule relevant. */
export const CAPSULE_MATCH_THRESHOLD: number = 0.15;

/** Maximum memory examples enriched into an assembled capsule. */
export const CAPSULE_MAX_MEMORY_EXAMPLES: number = 5;

/** Maximum past critic findings enriched into an assembled capsule. */
export const CAPSULE_MAX_PAST_FINDINGS: number = 10;

/** All valid capsule component types, ordered by assembly priority. */
export const CAPSULE_COMPONENT_TYPES = [
  'intent',
  'assembly',
  'examples',
  'anti_patterns',
  'critic',
  'grader',
  'memory_policy',
] as const;

// ---------------------------------------------------------------------------
// Cognitive Architecture — Executable Skills
// ---------------------------------------------------------------------------

/** Minimum match score for skill semantic matching. */
export const SKILL_MATCH_THRESHOLD: number = 0.2;

/** Maximum depth of skill chaining. */
export const SKILL_MAX_CHAIN_DEPTH: number = 3;

// ---------------------------------------------------------------------------
// Cognitive Architecture — Context System
// ---------------------------------------------------------------------------

/** All valid context types. */
export const CONTEXT_TYPES = [
  'state',
  'decisions',
  'failure_patterns',
  'lessons_learned',
  'user_taste',
  'verification',
  'reference_library',
  'ui_ux',
  'artifacts',
  'tooling',
  'research_index',
  'session_index',
  'agent_catalog',
] as const;

/** Priority order for loading context into prompts. Higher = loaded first. */
export const CONTEXT_LOAD_PRIORITY = [
  'decisions',
  'state',
  'failure_patterns',
  'user_taste',
  'verification',
  'artifacts',
  'tooling',
  'lessons_learned',
  'reference_library',
  'ui_ux',
  'research_index',
  'session_index',
  'agent_catalog',
] as const;

// ---------------------------------------------------------------------------
// Cognitive Architecture — Quality Gates
// ---------------------------------------------------------------------------

/** Required fields for creative output quality gate. */
export const OUTPUT_QUALITY_CREATIVE_REQUIRED = [
  'objective',
  'audience',
  'visual_direction',
  'references',
  'banned_patterns',
  'success_criteria',
] as const;

/** Required fields for API output quality gate. */
export const OUTPUT_QUALITY_API_REQUIRED = [
  'contract_target',
  'reference_examples',
  'edge_cases',
  'verification_plan',
] as const;

// ---------------------------------------------------------------------------
// Cognitive Architecture — GSD Execution
// ---------------------------------------------------------------------------

/** Maximum tasks per GSD execution plan. */
export const GSD_MAX_TASKS_PER_PLAN: number = 5;

/** Maximum auto-fix attempts before escalating to user. */
export const GSD_MAX_AUTO_FIX_ATTEMPTS: number = 3;

/** Valid GSD checkpoint types. */
export const GSD_CHECKPOINT_TYPES = ['human_verify', 'decision', 'human_action'] as const;

/** Deviation rules. 1-3: auto-fixable. 4: requires human decision. */
export const GSD_DEVIATION_RULES = [1, 2, 3, 4] as const;

// ---------------------------------------------------------------------------
// Cognitive Architecture — Context Pressure
// ---------------------------------------------------------------------------

/** Context usage percentage that triggers a warning. */
export const CONTEXT_PRESSURE_WARNING_PERCENT: number = 0.70;

/** Context usage percentage that triggers critical handoff. */
export const CONTEXT_PRESSURE_CRITICAL_PERCENT: number = 0.85;

// ---------------------------------------------------------------------------
// Cognitive Architecture — Prompt Assembly
// ---------------------------------------------------------------------------

/**
 * Non-negotiable assembly order for prompt construction.
 * 1. Cognitive Reasoning Framework (reasoning-scaffold.ts)
 * 2. Locked Decisions
 * 3. Active Rules (with "why")
 * 4. Expert Guidance
 * 5. Task Class (Capsule)
 * 6. Failure Predictions
 * 7. Relevant Memories
 * 8. Active Context
 * 9. Available Skills
 * 10. Prompt Shape
 */
export const PROMPT_ASSEMBLY_ORDER = [
  'reasoning_scaffold',
  'decisions',
  'rules',
  'expert',
  'capsule',
  'failure_predictions',
  'memories',
  'contexts',
  'skills',
  'prompt_shape',
] as const;

// ---------------------------------------------------------------------------
// Cognitive Architecture — Adversarial Critic
// ---------------------------------------------------------------------------

/** Maximum adversarial critic cycles before accepting. */
export const CRITIC_MAX_CYCLES: number = 3;

/** Dimensions evaluated during research critique. */
export const CRITIC_RESEARCH_DIMENSIONS = [
  'assumptions',
  'evidence_level',
  'counterevidence',
  'codebase_accuracy',
  'gaps',
  'implementation_implications',
  'preflight_failures',
] as const;

/** Dimensions evaluated during plan critique. */
export const CRITIC_PLAN_DIMENSIONS = [
  'codebase_reality',
  'dependencies',
  'edge_cases',
  'approach_validity',
  'premortem',
  'scope_realism',
  'required_sections',
  'memory_compliance',
] as const;

/** Severity levels for critic findings. */
export const CRITIC_SEVERITY_LEVELS = ['blocking', 'warning', 'advisory'] as const;

// ---------------------------------------------------------------------------
// Cognitive Architecture — Expert Routing Weights
// ---------------------------------------------------------------------------

/** Weight for trigger-condition matching in expert routing. */
export const EXPERT_ROUTING_TRIGGER_WEIGHT: number = 0.4;

/** Weight for semantic embedding matching in expert routing. */
export const EXPERT_ROUTING_SEMANTIC_WEIGHT: number = 0.3;

/** Weight for historical performance in expert routing. */
export const EXPERT_ROUTING_PERFORMANCE_WEIGHT: number = 0.3;
