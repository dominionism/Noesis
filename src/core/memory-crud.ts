/**
 * Memory CRUD Operations
 *
 * All read/write operations against the memories, memory_edges,
 * memory_conflicts, projects, and new Noesis tables
 * (workflow_runs, learning_events, skill_versions, agent_routing_log, system_metrics).
 *
 * Design decisions:
 * - Every function receives the DatabaseConnection explicitly (no hidden global state).
 * - All user-supplied values are bound via parameterized queries (injection-safe).
 * - Write operations that touch multiple tables use transactions for atomicity.
 * - getMemory() updates access tracking as a side effect.
 * - Tags are stored as a JSON array string in SQLite.
 *
 * Security considerations:
 * - No string interpolation in SQL; all values are parameterized
 * - The signature field is required on create/update to ensure integrity
 * - CHECK constraints in the schema provide a second layer of domain validation
 * - Foreign key cascades handle cleanup when a memory is deleted
 */

import type { DatabaseConnection } from './database.js';
import type {
  Memory,
  MemoryInput,
  KnowledgeEdge,
  KnowledgeEdgeInput,
  MemoryConflict,
  ConflictInput,
  Project,
  ProjectInput,
  ListFilters,
  WorkflowRun,
  WorkflowRunInput,
  LearningEvent,
  LearningEventInput,
  SkillVersion,
  SkillVersionInput,
  AgentRoute,
  AgentRouteInput,
  SystemMetric,
  SystemMetricInput,
} from '../types.js';
import { generateId } from './ulid.js';

// ---------------------------------------------------------------------------
// Memory CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a new memory record.
 *
 * The caller is responsible for generating the cryptographic signature
 * and running secret scanning / content validation before this point.
 */
export function createMemory(
  db: DatabaseConnection,
  input: MemoryInput & { signature: string },
  preGeneratedId?: string,
): Memory {
  const id = preGeneratedId ?? generateId();
  const now = new Date().toISOString();

  const tags = input.tags ? JSON.stringify(input.tags) : '[]';
  const projectId = input.project_id ?? null;
  const scope = input.scope ?? 'global';
  const sensitivity = input.sensitivity ?? 'INTERNAL';
  const confidence = input.confidence ?? 0.5;
  const outcome = input.outcome ?? null;
  const source = input.source ?? 'agent';
  const embedding = input.embedding ?? null;
  const embeddingModel = input.embedding_model ?? null;
  const expiresAt = input.expires_at ?? null;
  const sessionId = input.session_id ?? null;

  const insertMemory = db.prepare<[
    string, string, string, string, string,
    string | null, string, string, number,
    string | null, string, Buffer | null, string | null,
    string, string, string, string,
    string | null, string | null,
  ]>(`
    INSERT INTO memories (
      id, type, title, content, tags,
      project_id, scope, sensitivity, confidence,
      outcome, source, embedding, embedding_model,
      signature, status, access_count, created_at, updated_at, last_accessed_at,
      expires_at, superseded_by, session_id
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, 'active', 0, ?, ?, ?,
      ?, NULL, ?
    )
  `);

  const insertVec = db.prepare<[string, Buffer | null]>(`
    INSERT INTO memories_vec (memory_id, embedding) VALUES (?, ?)
  `);

  const runInsert = db.transaction(() => {
    insertMemory.run(
      id, input.type, input.title, input.content, tags,
      projectId, scope, sensitivity, confidence,
      outcome, source, embedding, embeddingModel,
      input.signature, now, now, now,
      expiresAt, sessionId,
    );

    if (embedding) {
      insertVec.run(id, embedding);
    }
  });

  runInsert();

  return {
    id,
    type: input.type,
    title: input.title,
    content: input.content,
    tags,
    project_id: projectId,
    scope,
    sensitivity,
    confidence,
    outcome,
    source,
    embedding,
    embedding_model: embeddingModel,
    signature: input.signature,
    status: 'active',
    access_count: 0,
    created_at: now,
    updated_at: now,
    last_accessed_at: now,
    expires_at: expiresAt,
    superseded_by: null,
    session_id: sessionId,
  };
}

/**
 * Retrieve a memory by its ULID.
 *
 * Side effect: increments access_count and updates last_accessed_at.
 */
export function getMemory(db: DatabaseConnection, id: string): Memory | null {
  const now = new Date().toISOString();

  const select = db.prepare<[string], Memory>(
    'SELECT * FROM memories WHERE id = ?',
  );

  const update = db.prepare<[string, string]>(
    'UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?',
  );

  const row = select.get(id);
  if (!row) {
    return null;
  }

  update.run(now, id);

  return {
    ...row,
    access_count: row.access_count + 1,
    last_accessed_at: now,
  };
}

/**
 * Update an existing memory record.
 *
 * Only the fields present in `updates` are modified. The signature
 * must always be provided (recomputed by the caller after changes).
 */
export function updateMemory(
  db: DatabaseConnection,
  id: string,
  updates: Partial<MemoryInput> & { signature: string },
): Memory {
  const now = new Date().toISOString();

  const existing = db
    .prepare<[string], Memory>('SELECT * FROM memories WHERE id = ?')
    .get(id);

  if (!existing) {
    throw new Error(`Memory not found: ${id}`);
  }

  const type = updates.type ?? existing.type;
  const title = updates.title ?? existing.title;
  const content = updates.content ?? existing.content;
  const tags = updates.tags ? JSON.stringify(updates.tags) : existing.tags;
  const projectId = updates.project_id !== undefined ? updates.project_id : existing.project_id;
  const scope = updates.scope ?? existing.scope;
  const sensitivity = updates.sensitivity ?? existing.sensitivity;
  const confidence = updates.confidence ?? existing.confidence;
  const outcome = updates.outcome !== undefined ? updates.outcome : existing.outcome;
  const source = updates.source ?? existing.source;
  const embedding = updates.embedding !== undefined ? updates.embedding : existing.embedding;
  const embeddingModel =
    updates.embedding_model !== undefined ? updates.embedding_model : existing.embedding_model;
  const expiresAt = updates.expires_at !== undefined ? updates.expires_at : existing.expires_at;
  const sessionId = updates.session_id !== undefined ? updates.session_id : existing.session_id;
  const signature = updates.signature;

  const updateStmt = db.prepare<[
    string, string, string, string, string | null,
    string, string, number, string | null, string,
    Buffer | null, string | null, string, string,
    string | null, string | null, string,
  ]>(`
    UPDATE memories SET
      type = ?, title = ?, content = ?, tags = ?, project_id = ?,
      scope = ?, sensitivity = ?, confidence = ?, outcome = ?, source = ?,
      embedding = ?, embedding_model = ?, signature = ?, updated_at = ?,
      expires_at = ?, session_id = ?
    WHERE id = ?
  `);

  const upsertVec = db.prepare<[string, Buffer | null]>(`
    INSERT INTO memories_vec (memory_id, embedding) VALUES (?, ?)
    ON CONFLICT(memory_id) DO UPDATE SET embedding = excluded.embedding
  `);

  const deleteVec = db.prepare<[string]>(
    'DELETE FROM memories_vec WHERE memory_id = ?',
  );

  const runUpdate = db.transaction(() => {
    updateStmt.run(
      type, title, content, tags, projectId ?? null,
      scope, sensitivity, confidence, outcome ?? null, source,
      embedding ?? null, embeddingModel ?? null, signature, now,
      expiresAt ?? null, sessionId ?? null, id,
    );

    if (embedding) {
      upsertVec.run(id, embedding);
    } else {
      deleteVec.run(id);
    }
  });

  runUpdate();

  return {
    ...existing,
    type,
    title,
    content,
    tags,
    project_id: projectId ?? null,
    scope,
    sensitivity,
    confidence,
    outcome: outcome ?? null,
    source,
    embedding: embedding ?? null,
    embedding_model: embeddingModel ?? null,
    signature,
    updated_at: now,
    expires_at: expiresAt ?? null,
    session_id: sessionId ?? null,
  };
}

/**
 * Delete a memory by its ULID.
 * Cascading foreign keys handle cleanup of edges, vectors, and conflicts.
 */
export function deleteMemory(db: DatabaseConnection, id: string): void {
  db.prepare<[string]>('DELETE FROM memories WHERE id = ?').run(id);
}

/**
 * List memories with optional filters and pagination.
 * Filters are applied via parameterized WHERE clauses built from a whitelist.
 */
export function listMemories(db: DatabaseConnection, filters: ListFilters): Memory[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.type) {
    conditions.push('type = ?');
    params.push(filters.type);
  }

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }

  if (filters.project_id) {
    conditions.push('project_id = ?');
    params.push(filters.project_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const sql = `SELECT * FROM memories ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const stmt = db.prepare<unknown[], Memory>(sql);
  return stmt.all(...params);
}

/**
 * Count memories matching optional project filter.
 */
export function countMemories(db: DatabaseConnection, projectId?: string): number {
  if (projectId) {
    const row = db.prepare<[string], { count: number }>(
      'SELECT COUNT(*) as count FROM memories WHERE project_id = ?',
    ).get(projectId);
    return row?.count ?? 0;
  }
  const row = db.prepare<[], { count: number }>(
    'SELECT COUNT(*) as count FROM memories',
  ).get();
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Knowledge Graph Edges (enhanced with typed relations and weight)
// ---------------------------------------------------------------------------

/**
 * Create a directed edge between two memories.
 *
 * The edge is identified by the composite key (source_id, target_id, relation).
 * Includes weight for scoring and typed relation constraint.
 */
export function createEdge(db: DatabaseConnection, edge: KnowledgeEdgeInput): void {
  const now = new Date().toISOString();
  const weight = edge.weight ?? 1.0;

  db.prepare<[string, string, string, number, string | null, string]>(`
    INSERT INTO memory_edges (source_id, target_id, relation, weight, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    edge.source_id,
    edge.target_id,
    edge.relation,
    weight,
    edge.metadata ?? null,
    now,
  );
}

/**
 * Delete a specific edge by its composite primary key.
 */
export function deleteEdge(
  db: DatabaseConnection,
  sourceId: string,
  targetId: string,
  relation: string,
): void {
  db.prepare<[string, string, string]>(
    'DELETE FROM memory_edges WHERE source_id = ? AND target_id = ? AND relation = ?',
  ).run(sourceId, targetId, relation);
}

/**
 * Retrieve all edges connected to a memory in a given direction.
 *
 * @param direction - 'source' returns outgoing edges, 'target' returns incoming.
 */
export function getEdges(
  db: DatabaseConnection,
  memoryId: string,
  direction: 'source' | 'target',
): KnowledgeEdge[] {
  const column = direction === 'source' ? 'source_id' : 'target_id';
  const sql = `SELECT * FROM memory_edges WHERE ${column} = ?`;
  return db.prepare<[string], KnowledgeEdge>(sql).all(memoryId);
}

/**
 * Get edges by relation type for a given memory.
 */
export function getEdgesByRelation(
  db: DatabaseConnection,
  memoryId: string,
  relation: string,
  direction: 'source' | 'target' | 'both' = 'both',
): KnowledgeEdge[] {
  if (direction === 'both') {
    return db.prepare<[string, string, string], KnowledgeEdge>(
      `SELECT * FROM memory_edges
       WHERE (source_id = ? OR target_id = ?) AND relation = ?
       ORDER BY weight DESC`,
    ).all(memoryId, memoryId, relation) as KnowledgeEdge[];
  }

  const column = direction === 'source' ? 'source_id' : 'target_id';
  return db.prepare<[string, string], KnowledgeEdge>(
    `SELECT * FROM memory_edges WHERE ${column} = ? AND relation = ? ORDER BY weight DESC`,
  ).all(memoryId, relation);
}

// ---------------------------------------------------------------------------
// Memory Conflicts
// ---------------------------------------------------------------------------

/**
 * Record a conflict between two memories.
 */
export function createConflict(
  db: DatabaseConnection,
  conflict: ConflictInput,
): MemoryConflict {
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare<[string, string, string, string, number, string]>(`
    INSERT INTO memory_conflicts (id, memory_a_id, memory_b_id, conflict_type, similarity_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    conflict.memory_a_id,
    conflict.memory_b_id,
    conflict.conflict_type,
    conflict.similarity_score,
    now,
  );

  return {
    id,
    memory_a_id: conflict.memory_a_id,
    memory_b_id: conflict.memory_b_id,
    conflict_type: conflict.conflict_type,
    similarity_score: conflict.similarity_score,
    resolution: null,
    resolution_notes: null,
    created_at: now,
  };
}

/**
 * Resolve an existing conflict.
 */
export function resolveConflict(
  db: DatabaseConnection,
  id: string,
  resolution: string,
  notes: string,
): void {
  const result = db.prepare<[string, string, string]>(
    'UPDATE memory_conflicts SET resolution = ?, resolution_notes = ? WHERE id = ?',
  ).run(resolution, notes, id);

  if (result.changes === 0) {
    throw new Error(`Conflict not found: ${id}`);
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Register a new project.
 */
export function createProject(
  db: DatabaseConnection,
  project: ProjectInput,
): Project {
  const id = generateId();
  const now = new Date().toISOString();
  const sensitivity = project.sensitivity ?? 'INTERNAL';
  const isolationMode = project.isolation_mode ?? false;

  db.prepare<[string, string, string, string, number, string, string]>(`
    INSERT INTO projects (id, name, path, sensitivity, isolation_mode, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    project.name,
    project.path,
    sensitivity,
    isolationMode ? 1 : 0,
    now,
    now,
  );

  return {
    id,
    name: project.name,
    path: project.path,
    sensitivity,
    isolation_mode: isolationMode,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Retrieve a project by its ULID.
 */
export function getProject(db: DatabaseConnection, id: string): Project | null {
  const row = db
    .prepare<[string], {
      id: string;
      name: string;
      path: string;
      sensitivity: string;
      isolation_mode: number;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM projects WHERE id = ?')
    .get(id);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    sensitivity: row.sensitivity as Project['sensitivity'],
    isolation_mode: row.isolation_mode === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Find a project by its filesystem path.
 */
export function getProjectByPath(db: DatabaseConnection, path: string): Project | null {
  const row = db
    .prepare<[string], {
      id: string;
      name: string;
      path: string;
      sensitivity: string;
      isolation_mode: number;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM projects WHERE path = ?')
    .get(path);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    sensitivity: row.sensitivity as Project['sensitivity'],
    isolation_mode: row.isolation_mode === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * List all projects.
 */
export function listProjects(db: DatabaseConnection): Project[] {
  const rows = db.prepare<[], {
    id: string;
    name: string;
    path: string;
    sensitivity: string;
    isolation_mode: number;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM projects ORDER BY name').all();

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    path: row.path,
    sensitivity: row.sensitivity as Project['sensitivity'],
    isolation_mode: row.isolation_mode === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// Workflow Runs (new for Noesis)
// ---------------------------------------------------------------------------

/**
 * Create a workflow run tracking record.
 */
export function createWorkflowRun(
  db: DatabaseConnection,
  input: WorkflowRunInput,
): WorkflowRun {
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare<[string, string | null, string, string, number | null, string]>(`
    INSERT INTO workflow_runs (id, project_id, task_description, workflow_type, phases_total, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.project_id ?? null,
    input.task_description,
    input.workflow_type,
    input.phases_total ?? null,
    now,
  );

  return {
    id,
    project_id: input.project_id ?? null,
    task_description: input.task_description,
    workflow_type: input.workflow_type,
    status: 'active',
    readiness_score: null,
    phases_completed: 0,
    phases_total: input.phases_total ?? null,
    started_at: now,
    completed_at: null,
    metrics: null,
  };
}

/**
 * Update workflow run status and metrics.
 */
export function updateWorkflowRun(
  db: DatabaseConnection,
  id: string,
  updates: {
    status?: WorkflowRun['status'];
    readiness_score?: number;
    phases_completed?: number;
    metrics?: string;
  },
): void {
  const setClauses: string[] = [];
  const params: (string | number)[] = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
    if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'abandoned') {
      setClauses.push('completed_at = ?');
      params.push(new Date().toISOString());
    }
  }

  if (updates.readiness_score !== undefined) {
    setClauses.push('readiness_score = ?');
    params.push(updates.readiness_score);
  }

  if (updates.phases_completed !== undefined) {
    setClauses.push('phases_completed = ?');
    params.push(updates.phases_completed);
  }

  if (updates.metrics !== undefined) {
    setClauses.push('metrics = ?');
    params.push(updates.metrics);
  }

  if (setClauses.length === 0) return;

  params.push(id);
  db.prepare<unknown[]>(
    `UPDATE workflow_runs SET ${setClauses.join(', ')} WHERE id = ?`,
  ).run(...params);
}

// ---------------------------------------------------------------------------
// Learning Events (new for Noesis)
// ---------------------------------------------------------------------------

/**
 * Record a structured learning event.
 */
export function createLearningEvent(
  db: DatabaseConnection,
  input: LearningEventInput,
): LearningEvent {
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare<[
    string, string, string, string | null,
    string | null, string | null, string | null,
    number, string | null, string,
  ]>(`
    INSERT INTO learning_events (
      id, memory_id, trigger_type, failure_class,
      root_cause, prevention_rule, causal_chain,
      confidence, project_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.memory_id,
    input.trigger_type,
    input.failure_class ?? null,
    input.root_cause ?? null,
    input.prevention_rule ?? null,
    input.causal_chain ? JSON.stringify(input.causal_chain) : null,
    input.confidence ?? 0.5,
    input.project_id ?? null,
    now,
  );

  return {
    id,
    memory_id: input.memory_id,
    trigger_type: input.trigger_type,
    failure_class: input.failure_class ?? null,
    root_cause: input.root_cause ?? null,
    prevention_rule: input.prevention_rule ?? null,
    causal_chain: input.causal_chain ? JSON.stringify(input.causal_chain) : null,
    confidence: input.confidence ?? 0.5,
    project_id: input.project_id ?? null,
    created_at: now,
  };
}

/**
 * List learning events by failure class.
 */
export function getLearningEventsByClass(
  db: DatabaseConnection,
  failureClass: string,
  limit: number = 20,
): LearningEvent[] {
  return db.prepare<[string, number], LearningEvent>(
    'SELECT * FROM learning_events WHERE failure_class = ? ORDER BY created_at DESC LIMIT ?',
  ).all(failureClass, limit);
}

// ---------------------------------------------------------------------------
// Skill Versions (new for Noesis)
// ---------------------------------------------------------------------------

/**
 * Create a skill version record.
 */
export function createSkillVersion(
  db: DatabaseConnection,
  input: SkillVersionInput,
): SkillVersion {
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare<[string, string, number, string, string | null, number, string]>(`
    INSERT INTO skill_versions (id, skill_id, version, definition, source_cluster, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.skill_id,
    input.version,
    input.definition,
    input.source_cluster ? JSON.stringify(input.source_cluster) : null,
    input.confidence ?? 0.5,
    now,
  );

  return {
    id,
    skill_id: input.skill_id,
    version: input.version,
    definition: input.definition,
    source_cluster: input.source_cluster ? JSON.stringify(input.source_cluster) : null,
    confidence: input.confidence ?? 0.5,
    created_at: now,
    superseded_at: null,
  };
}

/**
 * Get the latest version of a skill.
 */
export function getLatestSkillVersion(
  db: DatabaseConnection,
  skillId: string,
): SkillVersion | null {
  return db.prepare<[string], SkillVersion>(
    'SELECT * FROM skill_versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1',
  ).get(skillId) ?? null;
}

// ---------------------------------------------------------------------------
// Agent Routing Log (new for Noesis)
// ---------------------------------------------------------------------------

/**
 * Log an agent routing decision.
 */
export function createAgentRoute(
  db: DatabaseConnection,
  input: AgentRouteInput,
): AgentRoute {
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare<[string, string, string, string | null, number | null, string | null, string]>(`
    INSERT INTO agent_routing_log (id, agent_name, task_type, outcome, duration_ms, project_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.agent_name,
    input.task_type,
    input.outcome ?? null,
    input.duration_ms ?? null,
    input.project_id ?? null,
    now,
  );

  return {
    id,
    agent_name: input.agent_name,
    task_type: input.task_type,
    outcome: input.outcome ?? null,
    duration_ms: input.duration_ms ?? null,
    project_id: input.project_id ?? null,
    created_at: now,
  };
}

/**
 * Update routing outcome after task completion.
 */
export function updateAgentRouteOutcome(
  db: DatabaseConnection,
  id: string,
  outcome: AgentRoute['outcome'],
  durationMs?: number,
): void {
  const params: (string | number)[] = [outcome ?? 'unknown'];
  let sql = 'UPDATE agent_routing_log SET outcome = ?';

  if (durationMs !== undefined) {
    sql += ', duration_ms = ?';
    params.push(durationMs);
  }

  sql += ' WHERE id = ?';
  params.push(id);

  db.prepare<unknown[]>(sql).run(...params);
}

/**
 * Get routing performance for an agent.
 */
export function getAgentPerformance(
  db: DatabaseConnection,
  agentName: string,
): { total: number; success: number; failed: number; avg_duration_ms: number | null } {
  const row = db.prepare<[string], {
    total: number;
    success: number;
    failed: number;
    avg_duration: number | null;
  }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(duration_ms) as avg_duration
    FROM agent_routing_log WHERE agent_name = ?
  `).get(agentName);

  return {
    total: row?.total ?? 0,
    success: row?.success ?? 0,
    failed: row?.failed ?? 0,
    avg_duration_ms: row?.avg_duration ?? null,
  };
}

// ---------------------------------------------------------------------------
// System Metrics (new for Noesis)
// ---------------------------------------------------------------------------

/**
 * Record a system metric.
 */
export function createSystemMetric(
  db: DatabaseConnection,
  input: SystemMetricInput,
): SystemMetric {
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare<[string, string, number, string, string | null, string]>(`
    INSERT INTO system_metrics (id, metric_type, value, period, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.metric_type,
    input.value,
    input.period,
    input.metadata ? JSON.stringify(input.metadata) : null,
    now,
  );

  return {
    id,
    metric_type: input.metric_type,
    value: input.value,
    period: input.period,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    created_at: now,
  };
}

/**
 * Get metrics for a type over a date range.
 */
export function getMetricsByType(
  db: DatabaseConnection,
  metricType: string,
  startPeriod?: string,
  endPeriod?: string,
): SystemMetric[] {
  const conditions: string[] = ['metric_type = ?'];
  const params: string[] = [metricType];

  if (startPeriod) {
    conditions.push('period >= ?');
    params.push(startPeriod);
  }
  if (endPeriod) {
    conditions.push('period <= ?');
    params.push(endPeriod);
  }

  return db.prepare<unknown[], SystemMetric>(
    `SELECT * FROM system_metrics WHERE ${conditions.join(' AND ')} ORDER BY period`,
  ).all(...params);
}
