import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  createMemory,
  getMemory,
  updateMemory,
  deleteMemory,
  listMemories,
  countMemories,
  createEdge,
  deleteEdge,
  getEdges,
  getEdgesByRelation,
  createConflict,
  resolveConflict,
  createProject,
  getProject,
  getProjectByPath,
  listProjects,
  createWorkflowRun,
  updateWorkflowRun,
  createLearningEvent,
  getLearningEventsByClass,
  createSkillVersion,
  getLatestSkillVersion,
  createAgentRoute,
  updateAgentRouteOutcome,
  getAgentPerformance,
  createSystemMetric,
  getMetricsByType,
} from '../../core/memory-crud.js';

let db: DatabaseConnection;
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'noesis-crud-test-'));
  db = DatabaseConnection.create(join(tempDir, 'test.db'));
});

afterEach(() => {
  db.close();
  DatabaseConnection.resetInstance();
  rmSync(tempDir, { recursive: true, force: true });
});

function makeMemoryInput(overrides: Record<string, unknown> = {}) {
  return {
    type: 'task' as const,
    title: 'Test Memory',
    content: 'Test content for the memory',
    signature: 'test-sig-123',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Memory CRUD
// ---------------------------------------------------------------------------

describe('Memory CRUD', () => {
  describe('createMemory', () => {
    it('creates a memory with defaults', () => {
      const mem = createMemory(db, makeMemoryInput());
      expect(mem.id).toHaveLength(26);
      expect(mem.type).toBe('task');
      expect(mem.title).toBe('Test Memory');
      expect(mem.status).toBe('active');
      expect(mem.access_count).toBe(0);
      expect(mem.scope).toBe('global');
      expect(mem.sensitivity).toBe('INTERNAL');
      expect(mem.confidence).toBe(0.5);
      expect(mem.source).toBe('agent');
      expect(mem.superseded_by).toBeNull();
    });

    it('creates a memory with a pre-generated ID', () => {
      const mem = createMemory(db, makeMemoryInput(), 'CUSTOM_ID_12345678901');
      expect(mem.id).toBe('CUSTOM_ID_12345678901');
    });

    it('stores tags as JSON string', () => {
      const mem = createMemory(db, makeMemoryInput({ tags: ['tag1', 'tag2'] }));
      expect(mem.tags).toBe('["tag1","tag2"]');
    });

    it('creates with all optional fields', () => {
      const mem = createMemory(db, makeMemoryInput({
        project_id: 'proj1',
        scope: 'project',
        sensitivity: 'CONFIDENTIAL',
        confidence: 0.9,
        outcome: 'success',
        source: 'user',
        expires_at: '2025-12-31T00:00:00.000Z',
        session_id: 'sess1',
      }));
      expect(mem.scope).toBe('project');
      expect(mem.sensitivity).toBe('CONFIDENTIAL');
      expect(mem.confidence).toBe(0.9);
      expect(mem.outcome).toBe('success');
      expect(mem.source).toBe('user');
      expect(mem.session_id).toBe('sess1');
    });

    it('stores embedding in memories_vec when provided', () => {
      const embedding = Buffer.from([1, 2, 3, 4]);
      const mem = createMemory(db, makeMemoryInput({ embedding, embedding_model: 'test-model' }));
      const vec = db.prepare<[string], { memory_id: string; embedding: Buffer }>(
        'SELECT * FROM memories_vec WHERE memory_id = ?',
      ).get(mem.id);
      expect(vec).toBeDefined();
      expect(vec!.embedding).toEqual(embedding);
    });
  });

  describe('getMemory', () => {
    it('returns null for nonexistent ID', () => {
      expect(getMemory(db, 'nonexistent')).toBeNull();
    });

    it('returns the memory and increments access count', () => {
      const created = createMemory(db, makeMemoryInput());
      const fetched = getMemory(db, created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe('Test Memory');
      expect(fetched!.access_count).toBe(1);
    });

    it('increments access count on each call', () => {
      const created = createMemory(db, makeMemoryInput());
      getMemory(db, created.id);
      const second = getMemory(db, created.id);
      expect(second!.access_count).toBe(2);
    });
  });

  describe('updateMemory', () => {
    it('updates specified fields only', () => {
      const mem = createMemory(db, makeMemoryInput());
      const updated = updateMemory(db, mem.id, {
        title: 'Updated Title',
        signature: 'new-sig',
      });
      expect(updated.title).toBe('Updated Title');
      expect(updated.content).toBe('Test content for the memory');
    });

    it('throws for nonexistent ID', () => {
      expect(() =>
        updateMemory(db, 'nonexistent', { signature: 'sig' }),
      ).toThrow('Memory not found');
    });

    it('updates confidence and outcome', () => {
      const mem = createMemory(db, makeMemoryInput());
      const updated = updateMemory(db, mem.id, {
        confidence: 0.95,
        outcome: 'success',
        signature: 'new-sig',
      });
      expect(updated.confidence).toBe(0.95);
      expect(updated.outcome).toBe('success');
    });

    it('handles embedding updates', () => {
      const mem = createMemory(db, makeMemoryInput());
      const embedding = Buffer.from([5, 6, 7, 8]);
      updateMemory(db, mem.id, { embedding, signature: 'new-sig' });

      const vec = db.prepare<[string], { embedding: Buffer }>(
        'SELECT embedding FROM memories_vec WHERE memory_id = ?',
      ).get(mem.id);
      expect(vec).toBeDefined();
      expect(vec!.embedding).toEqual(embedding);
    });
  });

  describe('deleteMemory', () => {
    it('removes the memory', () => {
      const mem = createMemory(db, makeMemoryInput());
      deleteMemory(db, mem.id);
      expect(getMemory(db, mem.id)).toBeNull();
    });

    it('no-op for nonexistent ID', () => {
      expect(() => deleteMemory(db, 'nonexistent')).not.toThrow();
    });
  });

  describe('listMemories', () => {
    it('returns empty array when no memories exist', () => {
      const result = listMemories(db, {});
      expect(result).toEqual([]);
    });

    it('lists all memories', () => {
      createMemory(db, makeMemoryInput({ title: 'A' }));
      createMemory(db, makeMemoryInput({ title: 'B' }));
      const result = listMemories(db, {});
      expect(result).toHaveLength(2);
    });

    it('filters by type', () => {
      createMemory(db, makeMemoryInput({ type: 'task' }));
      createMemory(db, makeMemoryInput({ type: 'decision' }));
      const result = listMemories(db, { type: 'task' });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('task');
    });

    it('filters by status', () => {
      createMemory(db, makeMemoryInput());
      const result = listMemories(db, { status: 'archived' });
      expect(result).toHaveLength(0);
    });

    it('supports pagination', () => {
      for (let i = 0; i < 5; i++) {
        createMemory(db, makeMemoryInput({ title: `Mem ${i}` }));
      }
      const page1 = listMemories(db, { limit: 2, offset: 0 });
      const page2 = listMemories(db, { limit: 2, offset: 2 });
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('countMemories', () => {
    it('returns 0 when empty', () => {
      expect(countMemories(db)).toBe(0);
    });

    it('counts all memories', () => {
      createMemory(db, makeMemoryInput());
      createMemory(db, makeMemoryInput());
      expect(countMemories(db)).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Knowledge Graph Edges
// ---------------------------------------------------------------------------

describe('Knowledge Graph Edges', () => {
  let memA: { id: string };
  let memB: { id: string };

  beforeEach(() => {
    memA = createMemory(db, makeMemoryInput({ title: 'Memory A' }));
    memB = createMemory(db, makeMemoryInput({ title: 'Memory B' }));
  });

  describe('createEdge', () => {
    it('creates an edge between two memories', () => {
      createEdge(db, {
        source_id: memA.id,
        target_id: memB.id,
        relation: 'causes',
      });
      const edges = getEdges(db, memA.id, 'source');
      expect(edges).toHaveLength(1);
      expect(edges[0].relation).toBe('causes');
      expect(edges[0].weight).toBe(1.0);
    });

    it('creates an edge with custom weight', () => {
      createEdge(db, {
        source_id: memA.id,
        target_id: memB.id,
        relation: 'related_to',
        weight: 0.75,
      });
      const edges = getEdges(db, memA.id, 'source');
      expect(edges[0].weight).toBe(0.75);
    });

    it('creates an edge with metadata', () => {
      createEdge(db, {
        source_id: memA.id,
        target_id: memB.id,
        relation: 'exemplifies',
        metadata: '{"note": "test"}',
      });
      const edges = getEdges(db, memA.id, 'source');
      expect(edges[0].metadata).toBe('{"note": "test"}');
    });
  });

  describe('getEdges', () => {
    it('gets outgoing edges (source direction)', () => {
      createEdge(db, { source_id: memA.id, target_id: memB.id, relation: 'causes' });
      const outgoing = getEdges(db, memA.id, 'source');
      expect(outgoing).toHaveLength(1);
      const incoming = getEdges(db, memA.id, 'target');
      expect(incoming).toHaveLength(0);
    });

    it('gets incoming edges (target direction)', () => {
      createEdge(db, { source_id: memA.id, target_id: memB.id, relation: 'causes' });
      const incoming = getEdges(db, memB.id, 'target');
      expect(incoming).toHaveLength(1);
    });
  });

  describe('getEdgesByRelation', () => {
    it('filters by relation type', () => {
      createEdge(db, { source_id: memA.id, target_id: memB.id, relation: 'causes' });
      createEdge(db, { source_id: memA.id, target_id: memB.id, relation: 'related_to' });
      const edges = getEdgesByRelation(db, memA.id, 'causes', 'source');
      expect(edges).toHaveLength(1);
      expect(edges[0].relation).toBe('causes');
    });

    it('supports both direction', () => {
      createEdge(db, { source_id: memA.id, target_id: memB.id, relation: 'causes' });
      const edges = getEdgesByRelation(db, memA.id, 'causes', 'both');
      expect(edges).toHaveLength(1);
    });
  });

  describe('deleteEdge', () => {
    it('removes a specific edge', () => {
      createEdge(db, { source_id: memA.id, target_id: memB.id, relation: 'causes' });
      deleteEdge(db, memA.id, memB.id, 'causes');
      const edges = getEdges(db, memA.id, 'source');
      expect(edges).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

describe('Conflicts', () => {
  it('creates and resolves a conflict', () => {
    const memA = createMemory(db, makeMemoryInput({ title: 'A' }));
    const memB = createMemory(db, makeMemoryInput({ title: 'B' }));

    const conflict = createConflict(db, {
      memory_a_id: memA.id,
      memory_b_id: memB.id,
      conflict_type: 'contradiction',
      similarity_score: 0.85,
    });

    expect(conflict.id).toHaveLength(26);
    expect(conflict.resolution).toBeNull();

    resolveConflict(db, conflict.id, 'keep_both', 'Both are valid in different contexts');

    const resolved = db.prepare<[string], { resolution: string; resolution_notes: string }>(
      'SELECT resolution, resolution_notes FROM memory_conflicts WHERE id = ?',
    ).get(conflict.id);
    expect(resolved!.resolution).toBe('keep_both');
    expect(resolved!.resolution_notes).toBe('Both are valid in different contexts');
  });

  it('throws when resolving nonexistent conflict', () => {
    expect(() => resolveConflict(db, 'nonexistent', 'keep_a', 'notes')).toThrow('Conflict not found');
  });
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

describe('Projects', () => {
  describe('createProject', () => {
    it('creates a project with defaults', () => {
      const proj = createProject(db, { name: 'Test', path: '/test/path' });
      expect(proj.id).toHaveLength(26);
      expect(proj.name).toBe('Test');
      expect(proj.path).toBe('/test/path');
      expect(proj.sensitivity).toBe('INTERNAL');
      expect(proj.isolation_mode).toBe(false);
    });

    it('creates a project with all options', () => {
      const proj = createProject(db, {
        name: 'Secure',
        path: '/secure/path',
        sensitivity: 'CONFIDENTIAL',
        isolation_mode: true,
      });
      expect(proj.sensitivity).toBe('CONFIDENTIAL');
      expect(proj.isolation_mode).toBe(true);
    });
  });

  describe('getProject', () => {
    it('returns null for nonexistent', () => {
      expect(getProject(db, 'nonexistent')).toBeNull();
    });

    it('retrieves by ID', () => {
      const created = createProject(db, { name: 'P', path: '/p' });
      const fetched = getProject(db, created.id);
      expect(fetched!.name).toBe('P');
    });
  });

  describe('getProjectByPath', () => {
    it('retrieves by path', () => {
      createProject(db, { name: 'P', path: '/unique/path' });
      const found = getProjectByPath(db, '/unique/path');
      expect(found!.name).toBe('P');
    });

    it('returns null for unknown path', () => {
      expect(getProjectByPath(db, '/unknown')).toBeNull();
    });
  });

  describe('listProjects', () => {
    it('returns all projects sorted by name', () => {
      createProject(db, { name: 'Zeta', path: '/z' });
      createProject(db, { name: 'Alpha', path: '/a' });
      const projects = listProjects(db);
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe('Alpha');
      expect(projects[1].name).toBe('Zeta');
    });
  });
});

// ---------------------------------------------------------------------------
// Workflow Runs
// ---------------------------------------------------------------------------

describe('Workflow Runs', () => {
  it('creates a workflow run', () => {
    const run = createWorkflowRun(db, {
      task_description: 'Build feature X',
      workflow_type: 'rpi',
      phases_total: 4,
    });
    expect(run.id).toHaveLength(26);
    expect(run.status).toBe('active');
    expect(run.phases_completed).toBe(0);
    expect(run.phases_total).toBe(4);
    expect(run.completed_at).toBeNull();
  });

  it('updates workflow run status and sets completed_at', () => {
    const run = createWorkflowRun(db, {
      task_description: 'Test',
      workflow_type: 'quick',
    });
    updateWorkflowRun(db, run.id, { status: 'completed', phases_completed: 3 });

    const row = db.prepare<[string], { status: string; completed_at: string | null; phases_completed: number }>(
      'SELECT status, completed_at, phases_completed FROM workflow_runs WHERE id = ?',
    ).get(run.id);
    expect(row!.status).toBe('completed');
    expect(row!.completed_at).not.toBeNull();
    expect(row!.phases_completed).toBe(3);
  });

  it('updates readiness score', () => {
    const run = createWorkflowRun(db, {
      task_description: 'Test',
      workflow_type: 'rpi',
    });
    updateWorkflowRun(db, run.id, { readiness_score: 85 });

    const row = db.prepare<[string], { readiness_score: number }>(
      'SELECT readiness_score FROM workflow_runs WHERE id = ?',
    ).get(run.id);
    expect(row!.readiness_score).toBe(85);
  });
});

// ---------------------------------------------------------------------------
// Learning Events
// ---------------------------------------------------------------------------

describe('Learning Events', () => {
  it('creates a learning event', () => {
    const mem = createMemory(db, makeMemoryInput({ type: 'lesson' }));
    const event = createLearningEvent(db, {
      memory_id: mem.id,
      trigger_type: 'user_correction',
      failure_class: 'logic_error',
      root_cause: 'Missed edge case in validation',
      prevention_rule: 'Always validate empty input',
    });
    expect(event.id).toHaveLength(26);
    expect(event.trigger_type).toBe('user_correction');
    expect(event.failure_class).toBe('logic_error');
    expect(event.confidence).toBe(0.5);
  });

  it('lists events by failure class', () => {
    const mem = createMemory(db, makeMemoryInput({ type: 'lesson' }));
    createLearningEvent(db, {
      memory_id: mem.id,
      trigger_type: 'eval_failure',
      failure_class: 'security_gap',
    });
    createLearningEvent(db, {
      memory_id: mem.id,
      trigger_type: 'manual',
      failure_class: 'logic_error',
    });

    const gaps = getLearningEventsByClass(db, 'security_gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].failure_class).toBe('security_gap');
  });

  it('stores causal chain as JSON', () => {
    const mem = createMemory(db, makeMemoryInput({ type: 'lesson' }));
    const chain = ['step1', 'step2', 'step3'];
    const event = createLearningEvent(db, {
      memory_id: mem.id,
      trigger_type: 'manual',
      causal_chain: chain,
    });
    expect(event.causal_chain).toBe(JSON.stringify(chain));
  });
});

// ---------------------------------------------------------------------------
// Skill Versions
// ---------------------------------------------------------------------------

describe('Skill Versions', () => {
  it('creates a skill version', () => {
    const sv = createSkillVersion(db, {
      skill_id: 'api-design',
      version: 1,
      definition: '{"steps": ["define endpoints"]}',
      confidence: 0.8,
    });
    expect(sv.id).toHaveLength(26);
    expect(sv.skill_id).toBe('api-design');
    expect(sv.version).toBe(1);
    expect(sv.confidence).toBe(0.8);
    expect(sv.superseded_at).toBeNull();
  });

  it('gets the latest version', () => {
    createSkillVersion(db, { skill_id: 'testing', version: 1, definition: 'v1' });
    createSkillVersion(db, { skill_id: 'testing', version: 2, definition: 'v2' });
    createSkillVersion(db, { skill_id: 'testing', version: 3, definition: 'v3' });

    const latest = getLatestSkillVersion(db, 'testing');
    expect(latest).not.toBeNull();
    expect(latest!.version).toBe(3);
    expect(latest!.definition).toBe('v3');
  });

  it('returns null for unknown skill', () => {
    expect(getLatestSkillVersion(db, 'nonexistent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Agent Routing
// ---------------------------------------------------------------------------

describe('Agent Routing', () => {
  it('creates a route log entry', () => {
    const route = createAgentRoute(db, {
      agent_name: 'eval-engineer',
      task_type: 'test-verification',
    });
    expect(route.id).toHaveLength(26);
    expect(route.agent_name).toBe('eval-engineer');
    expect(route.outcome).toBeNull();
  });

  it('updates outcome after completion', () => {
    const route = createAgentRoute(db, {
      agent_name: 'failure-analyst',
      task_type: 'diagnosis',
    });
    updateAgentRouteOutcome(db, route.id, 'success', 5000);

    const row = db.prepare<[string], { outcome: string; duration_ms: number }>(
      'SELECT outcome, duration_ms FROM agent_routing_log WHERE id = ?',
    ).get(route.id);
    expect(row!.outcome).toBe('success');
    expect(row!.duration_ms).toBe(5000);
  });

  it('computes agent performance stats', () => {
    createAgentRoute(db, { agent_name: 'test-agent', task_type: 'a', outcome: 'success', duration_ms: 1000 });
    createAgentRoute(db, { agent_name: 'test-agent', task_type: 'b', outcome: 'success', duration_ms: 2000 });
    createAgentRoute(db, { agent_name: 'test-agent', task_type: 'c', outcome: 'failed', duration_ms: 3000 });

    const perf = getAgentPerformance(db, 'test-agent');
    expect(perf.total).toBe(3);
    expect(perf.success).toBe(2);
    expect(perf.failed).toBe(1);
    expect(perf.avg_duration_ms).toBe(2000);
  });

  it('returns zeros for unknown agent', () => {
    const perf = getAgentPerformance(db, 'unknown');
    expect(perf.total).toBe(0);
    expect(perf.success).toBe(0);
    expect(perf.failed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// System Metrics
// ---------------------------------------------------------------------------

describe('System Metrics', () => {
  it('records a metric', () => {
    const metric = createSystemMetric(db, {
      metric_type: 'retrieval_precision',
      value: 0.85,
      period: '2024-01-15',
    });
    expect(metric.id).toHaveLength(26);
    expect(metric.metric_type).toBe('retrieval_precision');
    expect(metric.value).toBe(0.85);
  });

  it('retrieves metrics by type and date range', () => {
    createSystemMetric(db, { metric_type: 'accuracy', value: 0.7, period: '2024-01-01' });
    createSystemMetric(db, { metric_type: 'accuracy', value: 0.8, period: '2024-01-15' });
    createSystemMetric(db, { metric_type: 'accuracy', value: 0.9, period: '2024-02-01' });
    createSystemMetric(db, { metric_type: 'other', value: 0.5, period: '2024-01-10' });

    const all = getMetricsByType(db, 'accuracy');
    expect(all).toHaveLength(3);

    const ranged = getMetricsByType(db, 'accuracy', '2024-01-10', '2024-01-20');
    expect(ranged).toHaveLength(1);
    expect(ranged[0].value).toBe(0.8);
  });

  it('stores metadata as JSON', () => {
    const metric = createSystemMetric(db, {
      metric_type: 'custom',
      value: 42,
      period: '2024-01-01',
      metadata: { source: 'test', details: 'info' },
    });
    expect(metric.metadata).toBe('{"source":"test","details":"info"}');
  });
});
