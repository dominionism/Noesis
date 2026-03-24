/**
 * Schema Creation and Migration
 *
 * Defines the complete SQLite schema for Noesis and applies it
 * idempotently via versioned migrations.
 *
 * Schema versioning:
 * - The current version is stored in the `metadata` table under key 'schema_version'.
 * - On each applySchema() call, the current version is read. If it is behind
 *   SCHEMA_VERSION, migrations are applied in order within a transaction.
 * - Version 0 (or absent) triggers the initial schema creation.
 *
 * Schema v1: Core tables (memories, edges, conflicts, projects) from UAWL
 * Schema v2: Enhanced edges with typed relations + 5 new tables for Noesis
 * Schema v3: Cognitive Architecture (9 tables: rules, experts, capsules,
 *            components, skills, context_state, execution_state,
 *            cognitive_outcomes, commands)
 *
 * Security considerations:
 * - All DDL uses IF NOT EXISTS to be crash-safe and idempotent
 * - CHECK constraints enforce domain invariants at the database level
 * - Foreign keys with ON DELETE CASCADE ensure referential integrity
 * - FTS5 triggers maintain full-text search consistency automatically
 * - No user input flows into schema DDL (no injection vector)
 */

import { SCHEMA_VERSION } from '../constants.js';
import type { DatabaseConnection } from './database.js';

// ---------------------------------------------------------------------------
// Core table definitions (from UAWL, carried forward)
// ---------------------------------------------------------------------------

const CREATE_METADATA = `
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);`;

const CREATE_MEMORIES = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('task','decision','preference','skill','incident','lesson','checkpoint','session','verification')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  project_id TEXT,
  scope TEXT NOT NULL DEFAULT 'global' CHECK(scope IN ('global','project','session')),
  sensitivity TEXT NOT NULL DEFAULT 'INTERNAL' CHECK(sensitivity IN ('PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL')),
  confidence REAL NOT NULL DEFAULT 0.5,
  outcome TEXT CHECK(outcome IN ('success','partial_success','failed_then_fixed','failed') OR outcome IS NULL),
  source TEXT NOT NULL DEFAULT 'agent',
  embedding BLOB,
  embedding_model TEXT,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','archived','conflicted')),
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL,
  expires_at TEXT,
  superseded_by TEXT,
  session_id TEXT
);`;

const CREATE_MEMORIES_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  title, content, tags, content=memories, content_rowid=rowid
);`;

const CREATE_MEMORIES_VEC = `
CREATE TABLE IF NOT EXISTS memories_vec (
  memory_id TEXT PRIMARY KEY,
  embedding BLOB,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);`;

// ---------------------------------------------------------------------------
// Enhanced memory_edges with typed relations and weight (Noesis)
// ---------------------------------------------------------------------------

const CREATE_MEMORY_EDGES = `
CREATE TABLE IF NOT EXISTS memory_edges (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK(relation IN (
    'causes','caused_by','contradicts','supersedes',
    'requires','exemplifies','generalizes','prevents',
    'corrects','related_to','part_of','created_during'
  )),
  weight REAL NOT NULL DEFAULT 1.0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id, relation),
  FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
);`;

const CREATE_MEMORY_CONFLICTS = `
CREATE TABLE IF NOT EXISTS memory_conflicts (
  id TEXT PRIMARY KEY,
  memory_a_id TEXT NOT NULL,
  memory_b_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  resolution TEXT,
  resolution_notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (memory_a_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (memory_b_id) REFERENCES memories(id) ON DELETE CASCADE
);`;

const CREATE_PROJECTS = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  sensitivity TEXT NOT NULL DEFAULT 'INTERNAL',
  isolation_mode INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

// ---------------------------------------------------------------------------
// New tables for Noesis (Phase 1 additions)
// ---------------------------------------------------------------------------

/** Workflow execution tracking. */
const CREATE_WORKFLOW_RUNS = `
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  task_description TEXT NOT NULL,
  workflow_type TEXT NOT NULL CHECK(workflow_type IN ('rpi','quick','learning','critic')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','failed','abandoned')),
  readiness_score INTEGER,
  phases_completed INTEGER NOT NULL DEFAULT 0,
  phases_total INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  metrics TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);`;

/** Learning events with structured lesson capture and causal links. */
const CREATE_LEARNING_EVENTS = `
CREATE TABLE IF NOT EXISTS learning_events (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN (
    'user_correction','eval_failure','critic_rejection','repeated_failure','manual'
  )),
  failure_class TEXT CHECK(failure_class IN (
    'logic_error','missing_context','wrong_assumption',
    'integration_failure','security_gap','performance_issue'
  ) OR failure_class IS NULL),
  root_cause TEXT,
  prevention_rule TEXT,
  causal_chain TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  project_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);`;

/** Skill version tracking for versioned skill definitions. */
const CREATE_SKILL_VERSIONS = `
CREATE TABLE IF NOT EXISTS skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  definition TEXT NOT NULL,
  source_cluster TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  superseded_at TEXT,
  UNIQUE(skill_id, version)
);`;

/** Agent routing performance log. */
const CREATE_AGENT_ROUTING_LOG = `
CREATE TABLE IF NOT EXISTS agent_routing_log (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  outcome TEXT CHECK(outcome IN ('success','partial_success','failed','unknown') OR outcome IS NULL),
  duration_ms INTEGER,
  project_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);`;

/** System metrics for meta-intelligence tracking. */
const CREATE_SYSTEM_METRICS = `
CREATE TABLE IF NOT EXISTS system_metrics (
  id TEXT PRIMARY KEY,
  metric_type TEXT NOT NULL,
  value REAL NOT NULL,
  period TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);`;

// ---------------------------------------------------------------------------
// Cognitive Architecture tables (Phase 3 — INTELLIGENCE integration)
// ---------------------------------------------------------------------------

/** Behavioral rules with Bayesian effectiveness tracking. */
const CREATE_RULES = `
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK(category IN (
    'workflow','quality','discovery','routing',
    'learning','continuity','fidelity','operational'
  )),
  description TEXT NOT NULL,
  trigger_conditions TEXT NOT NULL,
  constraints TEXT NOT NULL,
  enforcement TEXT NOT NULL DEFAULT 'soft' CHECK(enforcement IN ('hard','soft','advisory')),
  thresholds TEXT,
  interactions TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 0.5,
  outcome_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  embedding BLOB,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

/** Expert agent definitions with performance histories. */
const CREATE_EXPERTS = `
CREATE TABLE IF NOT EXISTS experts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL,
  domain TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'business','architecture','code_quality','design','gsd',
    'analysis','workflow','research','infrastructure','grading'
  )),
  trigger_conditions TEXT NOT NULL,
  scope TEXT NOT NULL,
  deliverables TEXT NOT NULL,
  anti_patterns TEXT,
  grading_criteria TEXT,
  tools TEXT,
  model_preference TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  task_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.5,
  content TEXT NOT NULL,
  embedding BLOB,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

/** Deep capsule definitions (7-component task-class operating packs). */
const CREATE_DEEP_CAPSULES = `
CREATE TABLE IF NOT EXISTS deep_capsules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_patterns TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  match_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.5,
  embedding BLOB,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

/** Individual components of deep capsules. */
const CREATE_CAPSULE_COMPONENTS = `
CREATE TABLE IF NOT EXISTS capsule_components (
  id TEXT PRIMARY KEY,
  capsule_id TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK(component_type IN (
    'intent','assembly','examples','anti_patterns',
    'critic','grader','memory_policy'
  )),
  content TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (capsule_id) REFERENCES deep_capsules(id) ON DELETE CASCADE,
  UNIQUE(capsule_id, component_type)
);`;

/** Executable skill definitions with invocation tracking. */
const CREATE_EXECUTABLE_SKILLS = `
CREATE TABLE IF NOT EXISTS executable_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'workflow','quality','research','testing',
    'design','backend','framework','domain','utility'
  )),
  trigger_conditions TEXT NOT NULL,
  anti_patterns TEXT,
  rules TEXT,
  chain_with TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  enabled INTEGER NOT NULL DEFAULT 1,
  invocation_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.5,
  content TEXT NOT NULL,
  embedding BLOB,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

/** Dynamic context state per project. */
const CREATE_CONTEXT_STATE = `
CREATE TABLE IF NOT EXISTS context_state (
  id TEXT PRIMARY KEY,
  context_type TEXT NOT NULL CHECK(context_type IN (
    'state','decisions','failure_patterns','lessons_learned',
    'user_taste','verification','reference_library','ui_ux',
    'artifacts','tooling','research_index','session_index','agent_catalog'
  )),
  project_id TEXT,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(context_type, project_id)
);`;

/** GSD execution state per project phase. */
const CREATE_EXECUTION_STATE = `
CREATE TABLE IF NOT EXISTS execution_state (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  milestone TEXT,
  phase_number INTEGER NOT NULL DEFAULT 0,
  plan_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
    'pending','researching','planning','checking',
    'executing','verifying','completed','blocked','paused'
  )),
  current_task INTEGER,
  total_tasks INTEGER,
  wave INTEGER DEFAULT 1,
  checkpoints TEXT,
  deviations TEXT,
  debug_state TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

/** Cognitive outcome tracking for all entity types. */
const CREATE_COGNITIVE_OUTCOMES = `
CREATE TABLE IF NOT EXISTS cognitive_outcomes (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'rule','expert','capsule','skill','gate'
  )),
  entity_id TEXT NOT NULL,
  task_description TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','partial')),
  failure_class TEXT CHECK(failure_class IN (
    'logic_error','missing_context','wrong_assumption',
    'integration_failure','security_gap','performance_issue'
  ) OR failure_class IS NULL),
  evidence TEXT,
  correction TEXT,
  created_at TEXT NOT NULL
);`;

/** Structured command definitions. */
const CREATE_COMMANDS = `
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'workflow','gsd','memory','session','utility'
  )),
  argument_hint TEXT,
  allowed_tools TEXT,
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

const CREATE_CORE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_edges_source ON memory_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON memory_edges(target_id);
`;

const CREATE_NOESIS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_edges_relation ON memory_edges(relation);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_project ON workflow_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_learning_events_class ON learning_events(failure_class);
CREATE INDEX IF NOT EXISTS idx_learning_events_trigger ON learning_events(trigger_type);
CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_id);
CREATE INDEX IF NOT EXISTS idx_agent_routing_agent ON agent_routing_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_routing_task ON agent_routing_log(task_type);
CREATE INDEX IF NOT EXISTS idx_system_metrics_type ON system_metrics(metric_type, period);
`;

const CREATE_COGNITIVE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_rules_category ON rules(category);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
CREATE INDEX IF NOT EXISTS idx_experts_category ON experts(category);
CREATE INDEX IF NOT EXISTS idx_experts_enabled ON experts(enabled);
CREATE INDEX IF NOT EXISTS idx_capsule_components_capsule ON capsule_components(capsule_id);
CREATE INDEX IF NOT EXISTS idx_skills_category ON executable_skills(category);
CREATE INDEX IF NOT EXISTS idx_context_type_project ON context_state(context_type, project_id);
CREATE INDEX IF NOT EXISTS idx_execution_project ON execution_state(project_id);
CREATE INDEX IF NOT EXISTS idx_execution_status ON execution_state(status);
CREATE INDEX IF NOT EXISTS idx_cognitive_outcomes_entity ON cognitive_outcomes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_outcomes_created ON cognitive_outcomes(created_at);
CREATE INDEX IF NOT EXISTS idx_commands_category ON commands(category);
CREATE INDEX IF NOT EXISTS idx_commands_enabled ON commands(enabled);
`;

// ---------------------------------------------------------------------------
// FTS5 synchronization triggers
// ---------------------------------------------------------------------------

const CREATE_FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, content, tags) VALUES (new.rowid, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content, tags) VALUES('delete', old.rowid, old.title, old.content, old.tags);
  INSERT INTO memories_fts(rowid, title, content, tags) VALUES (new.rowid, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content, tags) VALUES('delete', old.rowid, old.title, old.content, old.tags);
END;
`;

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

/**
 * Each migration is a function that receives the database connection
 * and applies the DDL/DML for that version step.
 *
 * Index 0 = migration from version 0 -> 1 (core tables).
 * Index 1 = migration from version 1 -> 2 (Noesis enhancements).
 */
const MIGRATIONS: ReadonlyArray<(db: DatabaseConnection) => void> = [
  // Migration 0 -> 1: Core tables (UAWL-compatible base)
  (db: DatabaseConnection): void => {
    db.exec(CREATE_MEMORIES);
    db.exec(CREATE_MEMORIES_FTS);
    db.exec(CREATE_MEMORIES_VEC);
    db.exec(CREATE_MEMORY_EDGES);
    db.exec(CREATE_MEMORY_CONFLICTS);
    db.exec(CREATE_PROJECTS);
    db.exec(CREATE_CORE_INDEXES);
    db.exec(CREATE_FTS_TRIGGERS);
  },

  // Migration 1 -> 2: Noesis enhancements
  (db: DatabaseConnection): void => {
    // New tables
    db.exec(CREATE_WORKFLOW_RUNS);
    db.exec(CREATE_LEARNING_EVENTS);
    db.exec(CREATE_SKILL_VERSIONS);
    db.exec(CREATE_AGENT_ROUTING_LOG);
    db.exec(CREATE_SYSTEM_METRICS);

    // New indexes
    db.exec(CREATE_NOESIS_INDEXES);
  },

  // Migration 2 -> 3: Cognitive Architecture (INTELLIGENCE integration)
  (db: DatabaseConnection): void => {
    // 9 new tables for cognitive architecture
    db.exec(CREATE_RULES);
    db.exec(CREATE_EXPERTS);
    db.exec(CREATE_DEEP_CAPSULES);
    db.exec(CREATE_CAPSULE_COMPONENTS);
    db.exec(CREATE_EXECUTABLE_SKILLS);
    db.exec(CREATE_CONTEXT_STATE);
    db.exec(CREATE_EXECUTION_STATE);
    db.exec(CREATE_COGNITIVE_OUTCOMES);
    db.exec(CREATE_COMMANDS);

    // Cognitive architecture indexes
    db.exec(CREATE_COGNITIVE_INDEXES);
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply the database schema, running any pending migrations.
 *
 * This function is idempotent: calling it multiple times on a database
 * that is already at the latest schema version is a no-op.
 *
 * The metadata table is always created first (outside migrations)
 * since the version tracking itself depends on it.
 *
 * All migrations within a single applySchema call run inside
 * one transaction for atomicity: either all pending migrations
 * succeed or none are applied.
 *
 * @param db - An open DatabaseConnection instance.
 */
export function applySchema(db: DatabaseConnection): void {
  // The metadata table must exist before we can read schema_version.
  db.exec(CREATE_METADATA);

  const currentVersion = getSchemaVersion(db);

  if (currentVersion >= SCHEMA_VERSION) {
    return; // Already up to date
  }

  // Run all pending migrations in a single transaction
  const migrate = db.transaction(() => {
    for (let v = currentVersion; v < SCHEMA_VERSION; v++) {
      const migration = MIGRATIONS[v];
      if (!migration) {
        throw new Error(
          `Missing migration for version ${v} -> ${v + 1}. ` +
            `Current version: ${currentVersion}, target: ${SCHEMA_VERSION}.`,
        );
      }
      migration(db);
    }
    setSchemaVersion(db, SCHEMA_VERSION);
  });

  migrate();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read the current schema version from the metadata table.
 * Returns 0 if no version has been recorded yet (fresh database).
 */
function getSchemaVersion(db: DatabaseConnection): number {
  const row = db
    .prepare<[string], { value: string }>('SELECT value FROM metadata WHERE key = ?')
    .get('schema_version');

  if (!row) {
    return 0;
  }

  const version = parseInt(row.value, 10);
  if (Number.isNaN(version) || version < 0) {
    throw new Error(`Corrupt schema_version in metadata table: "${row.value}"`);
  }
  return version;
}

/**
 * Write the schema version into the metadata table.
 * Uses INSERT OR REPLACE for idempotency.
 */
function setSchemaVersion(db: DatabaseConnection, version: number): void {
  db.prepare<[string, string]>(
    'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
  ).run('schema_version', String(version));
}
