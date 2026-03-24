import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-schema-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('schema', () => {
  const cleanups: Array<{ db: DatabaseConnection; dir: string }> = [];

  afterEach(() => {
    for (const { db, dir } of cleanups) {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
    DatabaseConnection.resetInstance();
  });

  function setup() {
    const ctx = createTestDb();
    cleanups.push(ctx);
    return ctx;
  }

  describe('core tables (v1)', () => {
    it('creates memories table with CHECK constraints', () => {
      const { db } = setup();
      // Valid insert
      db.prepare(`
        INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('test1', 'task', 'Test', 'content', 'sig', '2024-01-01', '2024-01-01', '2024-01-01')
      `).run();

      // Invalid type should fail
      expect(() =>
        db.prepare(`
          INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
          VALUES ('test2', 'invalid_type', 'Test', 'content', 'sig', '2024-01-01', '2024-01-01', '2024-01-01')
        `).run(),
      ).toThrow();
    });

    it('creates memories_fts virtual table', () => {
      const { db } = setup();
      const tables = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'",
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('creates memories_vec table with foreign key', () => {
      const { db } = setup();
      const tables = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_vec'",
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('creates memory_edges with typed relation CHECK constraint', () => {
      const { db } = setup();
      // Create two memories first
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('m1', 'task', 'T1', 'C1', 'sig1', ?, ?, ?)`).run(now, now, now);
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('m2', 'task', 'T2', 'C2', 'sig2', ?, ?, ?)`).run(now, now, now);

      // Valid relation
      db.prepare(`INSERT INTO memory_edges (source_id, target_id, relation, created_at)
        VALUES ('m1', 'm2', 'causes', ?)`).run(now);

      // Invalid relation
      expect(() =>
        db.prepare(`INSERT INTO memory_edges (source_id, target_id, relation, created_at)
          VALUES ('m1', 'm2', 'invalid_relation', ?)`).run(now),
      ).toThrow();
    });

    it('enforces 12 valid edge relations', () => {
      const { db } = setup();
      const validRelations = [
        'causes', 'caused_by', 'contradicts', 'supersedes',
        'requires', 'exemplifies', 'generalizes', 'prevents',
        'corrects', 'related_to', 'part_of', 'created_during',
      ];
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('src', 'task', 'S', 'C', 'sig', ?, ?, ?)`).run(now, now, now);
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('tgt', 'task', 'T', 'C', 'sig', ?, ?, ?)`).run(now, now, now);

      for (const rel of validRelations) {
        // Delete previous edge first
        db.prepare('DELETE FROM memory_edges WHERE source_id = ? AND target_id = ? AND relation = ?')
          .run('src', 'tgt', rel);
        expect(() =>
          db.prepare(`INSERT INTO memory_edges (source_id, target_id, relation, created_at) VALUES ('src', 'tgt', ?, ?)`).run(rel, now),
        ).not.toThrow();
        db.prepare('DELETE FROM memory_edges WHERE source_id = ? AND target_id = ?').run('src', 'tgt');
      }
    });

    it('creates memory_conflicts table', () => {
      const { db } = setup();
      const tables = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_conflicts'",
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('creates projects table with unique path constraint', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO projects (id, name, path, created_at, updated_at)
        VALUES ('p1', 'Project', '/path/a', ?, ?)`).run(now, now);

      expect(() =>
        db.prepare(`INSERT INTO projects (id, name, path, created_at, updated_at)
          VALUES ('p2', 'Other', '/path/a', ?, ?)`).run(now, now),
      ).toThrow(); // UNIQUE constraint on path
    });
  });

  describe('noesis tables (v2)', () => {
    it('creates workflow_runs with CHECK constraints', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO workflow_runs (id, task_description, workflow_type, started_at)
        VALUES ('w1', 'test task', 'rpi', ?)`).run(now);

      expect(() =>
        db.prepare(`INSERT INTO workflow_runs (id, task_description, workflow_type, started_at)
          VALUES ('w2', 'test', 'invalid', ?)`).run(now),
      ).toThrow();
    });

    it('creates learning_events with CHECK constraints', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('mem1', 'lesson', 'L', 'C', 'sig', ?, ?, ?)`).run(now, now, now);

      db.prepare(`INSERT INTO learning_events (id, memory_id, trigger_type, created_at)
        VALUES ('le1', 'mem1', 'user_correction', ?)`).run(now);

      expect(() =>
        db.prepare(`INSERT INTO learning_events (id, memory_id, trigger_type, created_at)
          VALUES ('le2', 'mem1', 'invalid_trigger', ?)`).run(now),
      ).toThrow();
    });

    it('creates skill_versions with unique skill_id+version', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO skill_versions (id, skill_id, version, definition, created_at)
        VALUES ('sv1', 'skill_a', 1, '{}', ?)`).run(now);

      expect(() =>
        db.prepare(`INSERT INTO skill_versions (id, skill_id, version, definition, created_at)
          VALUES ('sv2', 'skill_a', 1, '{}', ?)`).run(now),
      ).toThrow(); // UNIQUE(skill_id, version)
    });

    it('creates agent_routing_log table', () => {
      const { db } = setup();
      const tables = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_routing_log'",
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('creates system_metrics table', () => {
      const { db } = setup();
      const tables = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='system_metrics'",
      ).all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('indexes', () => {
    it('creates all core indexes', () => {
      const { db } = setup();
      const indexes = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
      ).all();
      const names = indexes.map(i => i.name);
      expect(names).toContain('idx_memories_project');
      expect(names).toContain('idx_memories_type');
      expect(names).toContain('idx_memories_status');
      expect(names).toContain('idx_memories_created');
      expect(names).toContain('idx_memories_accessed');
      expect(names).toContain('idx_edges_source');
      expect(names).toContain('idx_edges_target');
      expect(names).toContain('idx_edges_relation');
    });

    it('creates all noesis indexes', () => {
      const { db } = setup();
      const indexes = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
      ).all();
      const names = indexes.map(i => i.name);
      expect(names).toContain('idx_workflow_runs_project');
      expect(names).toContain('idx_workflow_runs_status');
      expect(names).toContain('idx_learning_events_class');
      expect(names).toContain('idx_learning_events_trigger');
      expect(names).toContain('idx_skill_versions_skill');
      expect(names).toContain('idx_agent_routing_agent');
      expect(names).toContain('idx_agent_routing_task');
      expect(names).toContain('idx_system_metrics_type');
    });
  });

  describe('FTS triggers', () => {
    it('auto-populates FTS on memory insert', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('fts1', 'task', 'FTS Test Title', 'searchable content here', 'sig', ?, ?, ?)`).run(now, now, now);

      const results = db.prepare<[string], { title: string }>(
        "SELECT title FROM memories_fts WHERE memories_fts MATCH ?",
      ).all('searchable');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('FTS Test Title');
    });

    it('updates FTS on memory update', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('fts2', 'task', 'Original', 'original content', 'sig', ?, ?, ?)`).run(now, now, now);

      db.prepare(`UPDATE memories SET title = 'Updated', content = 'new updated content' WHERE id = 'fts2'`).run();

      const oldResults = db.prepare<[string], { title: string }>(
        "SELECT title FROM memories_fts WHERE memories_fts MATCH ?",
      ).all('original');
      expect(oldResults).toHaveLength(0);

      const newResults = db.prepare<[string], { title: string }>(
        "SELECT title FROM memories_fts WHERE memories_fts MATCH ?",
      ).all('updated');
      expect(newResults).toHaveLength(1);
    });

    it('removes FTS entry on memory delete', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('fts3', 'task', 'Delete Me', 'delete content', 'sig', ?, ?, ?)`).run(now, now, now);

      db.prepare(`DELETE FROM memories WHERE id = 'fts3'`).run();

      const results = db.prepare<[string], { title: string }>(
        "SELECT title FROM memories_fts WHERE memories_fts MATCH ?",
      ).all('delete');
      expect(results).toHaveLength(0);
    });
  });

  describe('schema versioning', () => {
    it('records schema version in metadata', () => {
      const { db } = setup();
      const row = db.prepare<[string], { value: string }>(
        'SELECT value FROM metadata WHERE key = ?',
      ).get('schema_version');
      expect(row).toBeDefined();
      expect(parseInt(row!.value, 10)).toBe(3);
    });

    it('is idempotent on re-open', () => {
      const dir = mkdtempSync(join(tmpdir(), 'noesis-schema-idempotent-'));
      const dbPath = join(dir, 'test.db');
      const db1 = DatabaseConnection.create(dbPath);
      db1.close();

      // Re-open should not throw
      const db2 = DatabaseConnection.create(dbPath);
      const row = db2.prepare<[string], { value: string }>(
        'SELECT value FROM metadata WHERE key = ?',
      ).get('schema_version');
      expect(parseInt(row!.value, 10)).toBe(3);
      db2.close();
      rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('cognitive tables (v3)', () => {
    it('creates rules table with CHECK constraints', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO rules (id, name, category, description, trigger_conditions, constraints, enforcement, content, signature, created_at, updated_at)
        VALUES ('r1', 'test-rule', 'workflow', 'desc', '[]', '[]', 'hard', 'content', 'sig', ?, ?)`).run(now, now);

      // Invalid category
      expect(() =>
        db.prepare(`INSERT INTO rules (id, name, category, description, trigger_conditions, constraints, enforcement, content, signature, created_at, updated_at)
          VALUES ('r2', 'bad-rule', 'invalid_cat', 'desc', '[]', '[]', 'hard', 'content', 'sig', ?, ?)`).run(now, now),
      ).toThrow();

      // Invalid enforcement
      expect(() =>
        db.prepare(`INSERT INTO rules (id, name, category, description, trigger_conditions, constraints, enforcement, content, signature, created_at, updated_at)
          VALUES ('r3', 'bad-enforce', 'workflow', 'desc', '[]', '[]', 'invalid', 'content', 'sig', ?, ?)`).run(now, now),
      ).toThrow();
    });

    it('enforces unique rule names', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO rules (id, name, category, description, trigger_conditions, constraints, content, signature, created_at, updated_at)
        VALUES ('r1', 'unique-rule', 'workflow', 'desc', '[]', '[]', 'c', 'sig', ?, ?)`).run(now, now);

      expect(() =>
        db.prepare(`INSERT INTO rules (id, name, category, description, trigger_conditions, constraints, content, signature, created_at, updated_at)
          VALUES ('r2', 'unique-rule', 'quality', 'other', '[]', '[]', 'c', 'sig', ?, ?)`).run(now, now),
      ).toThrow();
    });

    it('creates experts table with CHECK constraints', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO experts (id, name, role, domain, category, trigger_conditions, scope, deliverables, content, signature, created_at, updated_at)
        VALUES ('e1', 'test-expert', 'role', 'domain', 'architecture', '[]', '{}', '[]', 'content', 'sig', ?, ?)`).run(now, now);

      expect(() =>
        db.prepare(`INSERT INTO experts (id, name, role, domain, category, trigger_conditions, scope, deliverables, content, signature, created_at, updated_at)
          VALUES ('e2', 'bad', 'role', 'domain', 'invalid_cat', '[]', '{}', '[]', 'content', 'sig', ?, ?)`).run(now, now),
      ).toThrow();
    });

    it('creates deep_capsules table with unique name', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO deep_capsules (id, name, display_name, description, trigger_patterns, signature, created_at, updated_at)
        VALUES ('c1', 'api-workflow', 'API Workflow', 'desc', '[]', 'sig', ?, ?)`).run(now, now);

      expect(() =>
        db.prepare(`INSERT INTO deep_capsules (id, name, display_name, description, trigger_patterns, signature, created_at, updated_at)
          VALUES ('c2', 'api-workflow', 'Dup', 'desc', '[]', 'sig', ?, ?)`).run(now, now),
      ).toThrow();
    });

    it('creates capsule_components with unique capsule+type and cascade delete', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO deep_capsules (id, name, display_name, description, trigger_patterns, signature, created_at, updated_at)
        VALUES ('cap1', 'test-cap', 'Test', 'desc', '[]', 'sig', ?, ?)`).run(now, now);

      db.prepare(`INSERT INTO capsule_components (id, capsule_id, component_type, content, signature, created_at, updated_at)
        VALUES ('cc1', 'cap1', 'intent', 'intent content', 'sig', ?, ?)`).run(now, now);

      // Duplicate component_type for same capsule
      expect(() =>
        db.prepare(`INSERT INTO capsule_components (id, capsule_id, component_type, content, signature, created_at, updated_at)
          VALUES ('cc2', 'cap1', 'intent', 'other', 'sig', ?, ?)`).run(now, now),
      ).toThrow();

      // Invalid component_type
      expect(() =>
        db.prepare(`INSERT INTO capsule_components (id, capsule_id, component_type, content, signature, created_at, updated_at)
          VALUES ('cc3', 'cap1', 'invalid_type', 'x', 'sig', ?, ?)`).run(now, now),
      ).toThrow();

      // Cascade delete
      db.prepare(`DELETE FROM deep_capsules WHERE id = 'cap1'`).run();
      const remaining = db.prepare<[], { id: string }>('SELECT id FROM capsule_components').all();
      expect(remaining).toHaveLength(0);
    });

    it('creates executable_skills with CHECK constraints', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO executable_skills (id, name, description, category, trigger_conditions, content, signature, created_at, updated_at)
        VALUES ('s1', 'test-skill', 'desc', 'workflow', '[]', 'content', 'sig', ?, ?)`).run(now, now);

      expect(() =>
        db.prepare(`INSERT INTO executable_skills (id, name, description, category, trigger_conditions, content, signature, created_at, updated_at)
          VALUES ('s2', 'bad', 'desc', 'invalid_cat', '[]', 'content', 'sig', ?, ?)`).run(now, now),
      ).toThrow();
    });

    it('creates context_state with unique type+project constraint', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO context_state (id, context_type, project_id, content, signature, created_at, updated_at)
        VALUES ('cs1', 'decisions', 'proj1', 'content', 'sig', ?, ?)`).run(now, now);

      expect(() =>
        db.prepare(`INSERT INTO context_state (id, context_type, project_id, content, signature, created_at, updated_at)
          VALUES ('cs2', 'decisions', 'proj1', 'other', 'sig', ?, ?)`).run(now, now),
      ).toThrow();

      // Same type, different project is OK
      expect(() =>
        db.prepare(`INSERT INTO context_state (id, context_type, project_id, content, signature, created_at, updated_at)
          VALUES ('cs3', 'decisions', 'proj2', 'content', 'sig', ?, ?)`).run(now, now),
      ).not.toThrow();

      // Invalid context_type
      expect(() =>
        db.prepare(`INSERT INTO context_state (id, context_type, project_id, content, signature, created_at, updated_at)
          VALUES ('cs4', 'invalid_type', 'proj1', 'x', 'sig', ?, ?)`).run(now, now),
      ).toThrow();
    });

    it('creates execution_state with CHECK constraints', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO execution_state (id, project_id, status, created_at, updated_at)
        VALUES ('ex1', 'proj1', 'executing', ?, ?)`).run(now, now);

      expect(() =>
        db.prepare(`INSERT INTO execution_state (id, project_id, status, created_at, updated_at)
          VALUES ('ex2', 'proj1', 'invalid_status', ?, ?)`).run(now, now),
      ).toThrow();
    });

    it('creates cognitive_outcomes with CHECK constraints', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, created_at)
        VALUES ('co1', 'rule', 'r1', 'test task', 'success', ?)`).run(now);

      // Invalid entity_type
      expect(() =>
        db.prepare(`INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, created_at)
          VALUES ('co2', 'invalid', 'r1', 'task', 'success', ?)`).run(now),
      ).toThrow();

      // Invalid outcome
      expect(() =>
        db.prepare(`INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, created_at)
          VALUES ('co3', 'rule', 'r1', 'task', 'invalid', ?)`).run(now),
      ).toThrow();

      // Valid failure_class
      db.prepare(`INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, failure_class, created_at)
        VALUES ('co4', 'expert', 'e1', 'task', 'failure', 'logic_error', ?)`).run(now);

      // Invalid failure_class
      expect(() =>
        db.prepare(`INSERT INTO cognitive_outcomes (id, entity_type, entity_id, task_description, outcome, failure_class, created_at)
          VALUES ('co5', 'expert', 'e1', 'task', 'failure', 'not_a_class', ?)`).run(now),
      ).toThrow();
    });

    it('creates commands table with CHECK constraints', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO commands (id, name, description, category, content, signature, created_at, updated_at)
        VALUES ('cmd1', 'test-cmd', 'desc', 'workflow', 'content', 'sig', ?, ?)`).run(now, now);

      expect(() =>
        db.prepare(`INSERT INTO commands (id, name, description, category, content, signature, created_at, updated_at)
          VALUES ('cmd2', 'bad-cmd', 'desc', 'invalid_cat', 'content', 'sig', ?, ?)`).run(now, now),
      ).toThrow();

      // Unique name
      expect(() =>
        db.prepare(`INSERT INTO commands (id, name, description, category, content, signature, created_at, updated_at)
          VALUES ('cmd3', 'test-cmd', 'other', 'gsd', 'content', 'sig', ?, ?)`).run(now, now),
      ).toThrow();
    });
  });

  describe('cognitive indexes (v3)', () => {
    it('creates all cognitive architecture indexes', () => {
      const { db } = setup();
      const indexes = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
      ).all();
      const names = indexes.map(i => i.name);
      expect(names).toContain('idx_rules_category');
      expect(names).toContain('idx_rules_enabled');
      expect(names).toContain('idx_experts_category');
      expect(names).toContain('idx_experts_enabled');
      expect(names).toContain('idx_capsule_components_capsule');
      expect(names).toContain('idx_skills_category');
      expect(names).toContain('idx_context_type_project');
      expect(names).toContain('idx_execution_project');
      expect(names).toContain('idx_execution_status');
      expect(names).toContain('idx_cognitive_outcomes_entity');
      expect(names).toContain('idx_cognitive_outcomes_created');
      expect(names).toContain('idx_commands_category');
      expect(names).toContain('idx_commands_enabled');
    });
  });

  describe('foreign key cascades', () => {
    it('deleting a memory cascades to edges', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('ca', 'task', 'A', 'c', 'sig', ?, ?, ?)`).run(now, now, now);
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('cb', 'task', 'B', 'c', 'sig', ?, ?, ?)`).run(now, now, now);
      db.prepare(`INSERT INTO memory_edges (source_id, target_id, relation, created_at)
        VALUES ('ca', 'cb', 'causes', ?)`).run(now);

      db.prepare(`DELETE FROM memories WHERE id = 'ca'`).run();

      const edges = db.prepare<[], { source_id: string }>('SELECT * FROM memory_edges').all();
      expect(edges).toHaveLength(0);
    });

    it('deleting a memory cascades to vec', () => {
      const { db } = setup();
      const now = '2024-01-01T00:00:00.000Z';
      db.prepare(`INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES ('vec1', 'task', 'V', 'c', 'sig', ?, ?, ?)`).run(now, now, now);
      db.prepare(`INSERT INTO memories_vec (memory_id, embedding) VALUES ('vec1', X'0102')`).run();

      db.prepare(`DELETE FROM memories WHERE id = 'vec1'`).run();

      const vecs = db.prepare<[string], { memory_id: string }>('SELECT * FROM memories_vec WHERE memory_id = ?').all('vec1');
      expect(vecs).toHaveLength(0);
    });
  });
});
