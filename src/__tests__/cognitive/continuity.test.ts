import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';

// Session Manager
import {
  startSession,
  getSession,
  updateSession,
  endSession,
  createSessionCheckpoint,
  getLatestCheckpoint,
} from '../../cognitive/continuity/session-manager.js';

// Handoff Manager
import {
  createHandoff,
  resumeFromHandoff,
  listHandoffs,
  getHandoffMemories,
  formatHandoffResumption,
} from '../../cognitive/continuity/handoff-manager.js';

// Artifact Manager
import {
  getWorkingSet,
  persistWorkingSet,
  addToWorkingSet,
  removeFromWorkingSet,
  recordArtifact,
  getArtifacts,
  suggestArtifacts,
} from '../../cognitive/continuity/artifact-manager.js';

// Decision Fidelity
import {
  documentDecision,
  getDecisions,
  getLockedDecisions,
  unlockDecision,
  checkDecisionFidelity,
  deferIdea,
  isDeferred,
  getDeferredIdeas,
  removeDeferredIdea,
} from '../../cognitive/continuity/decision-fidelity.js';

import type { HandoffInput } from '../../types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-continuity-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Continuity System', () => {
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

  const PROJECT_ID = 'proj-test-001';

  // ==========================================================================
  // Session Manager
  // ==========================================================================

  describe('Session Manager', () => {
    it('should start a new session', () => {
      const { db } = setup();
      const session = startSession(db, PROJECT_ID, 'agent-alpha', sign);

      expect(session.project_id).toBe(PROJECT_ID);
      expect(session.current_phase).toBe('starting');
      expect(session.blockers).toEqual([]);
      expect(session.working_set).toEqual([]);
      expect(session.decisions_made).toEqual([]);
      expect(session.started_at).toBeTruthy();
    });

    it('should retrieve a started session', () => {
      const { db } = setup();
      startSession(db, PROJECT_ID, 'agent-alpha', sign);

      const session = getSession(db, PROJECT_ID);
      expect(session).not.toBeNull();
      expect(session!.agent).toBe('agent-alpha');
      expect(session!.project_id).toBe(PROJECT_ID);
    });

    it('should return null for no session', () => {
      const { db } = setup();
      expect(getSession(db, 'nonexistent')).toBeNull();
    });

    it('should update session state', () => {
      const { db } = setup();
      startSession(db, PROJECT_ID, 'agent-alpha', sign);

      const updated = updateSession(db, PROJECT_ID, {
        current_phase: 'executing',
        working_set: ['src/main.ts', 'src/utils.ts'],
      }, sign);

      expect(updated.current_phase).toBe('executing');
      expect(updated.working_set).toEqual(['src/main.ts', 'src/utils.ts']);
    });

    it('should throw when updating nonexistent session', () => {
      const { db } = setup();
      expect(() => updateSession(db, 'nonexistent', { current_phase: 'x' }, sign)).toThrow();
    });

    it('should add blockers and decisions', () => {
      const { db } = setup();
      startSession(db, PROJECT_ID, 'agent-alpha', sign);

      updateSession(db, PROJECT_ID, {
        blockers: ['Waiting for API key'],
        decisions_made: ['Use REST over GraphQL'],
      }, sign);

      const session = getSession(db, PROJECT_ID);
      expect(session!.blockers).toEqual(['Waiting for API key']);
      expect(session!.decisions_made).toEqual(['Use REST over GraphQL']);
    });

    it('should end a session with summary', () => {
      const { db } = setup();
      startSession(db, PROJECT_ID, 'agent-alpha', sign);

      endSession(db, PROJECT_ID, 'Completed auth module implementation', sign);

      const session = getSession(db, PROJECT_ID);
      expect(session!.current_phase).toBe('ended');
      expect((session as Record<string, unknown>).summary).toBe('Completed auth module implementation');
    });

    it('should throw when ending nonexistent session', () => {
      const { db } = setup();
      expect(() => endSession(db, 'nonexistent', 'summary', sign)).toThrow();
    });

    it('should replace session on re-start', () => {
      const { db } = setup();
      startSession(db, PROJECT_ID, 'agent-alpha', sign);
      startSession(db, PROJECT_ID, 'agent-beta', sign);

      const session = getSession(db, PROJECT_ID);
      expect(session!.agent).toBe('agent-beta');
    });

    it('should create a session checkpoint', () => {
      const { db } = setup();
      startSession(db, PROJECT_ID, 'agent-alpha', sign);

      const checkpointId = createSessionCheckpoint(db, PROJECT_ID, {
        task_description: 'Implement auth module',
        completed_steps: ['Created schema', 'Added migrations'],
        remaining_steps: ['Add endpoints', 'Write tests'],
        current_blockers: [],
        relevant_files: ['src/auth.ts'],
        working_state: 'In progress',
      }, sign);

      expect(checkpointId).toBeTruthy();
    });

    it('should retrieve latest checkpoint', () => {
      const { db } = setup();
      startSession(db, PROJECT_ID, 'agent-alpha', sign);

      createSessionCheckpoint(db, PROJECT_ID, {
        task_description: 'First checkpoint',
        completed_steps: ['Step A'],
        remaining_steps: ['Step B'],
        current_blockers: [],
        relevant_files: [],
        working_state: 'starting',
      }, sign);

      createSessionCheckpoint(db, PROJECT_ID, {
        task_description: 'Second checkpoint',
        completed_steps: ['Step A', 'Step B'],
        remaining_steps: ['Step C'],
        current_blockers: [],
        relevant_files: [],
        working_state: 'midway',
      }, sign);

      const latest = getLatestCheckpoint(db, PROJECT_ID);
      expect(latest).not.toBeNull();
      expect((latest!.content as Record<string, unknown>).task_description).toBe('Second checkpoint');
    });

    it('should return null checkpoint for no checkpoints', () => {
      const { db } = setup();
      expect(getLatestCheckpoint(db, 'nonexistent')).toBeNull();
    });
  });

  // ==========================================================================
  // Handoff Manager
  // ==========================================================================

  describe('Handoff Manager', () => {
    const sampleHandoff: HandoffInput = {
      source_agent: 'agent-alpha',
      target_agent: 'agent-beta',
      reason: 'context_limit',
      priority: 'immediate',
      state_summary: 'Completed schema design, need to implement endpoints.',
      memory_refs: [],
    };

    it('should create a handoff', () => {
      const { db } = setup();
      const handoff = createHandoff(db, sampleHandoff, PROJECT_ID, sign);

      expect(handoff.id).toBeTruthy();
      expect(handoff.source_agent).toBe('agent-alpha');
      expect(handoff.target_agent).toBe('agent-beta');
      expect(handoff.reason).toBe('context_limit');
      expect(handoff.priority).toBe('immediate');
    });

    it('should use default priority', () => {
      const { db } = setup();
      const handoff = createHandoff(db, {
        ...sampleHandoff,
        priority: undefined,
      }, PROJECT_ID, sign);

      expect(handoff.priority).toBe('normal');
    });

    it('should resume from handoff', () => {
      const { db } = setup();
      const created = createHandoff(db, sampleHandoff, PROJECT_ID, sign);

      const resumed = resumeFromHandoff(db, created.id);
      expect(resumed).not.toBeNull();
      expect(resumed!.source_agent).toBe('agent-alpha');
      expect(resumed!.state_summary).toContain('schema design');
    });

    it('should return null for nonexistent handoff', () => {
      const { db } = setup();
      expect(resumeFromHandoff(db, 'nonexistent')).toBeNull();
    });

    it('should list handoffs for a project', () => {
      const { db } = setup();
      createHandoff(db, sampleHandoff, PROJECT_ID, sign);
      createHandoff(db, {
        ...sampleHandoff,
        source_agent: 'agent-beta',
        target_agent: 'agent-gamma',
        reason: 'session_end',
      }, PROJECT_ID, sign);

      const handoffs = listHandoffs(db, PROJECT_ID);
      expect(handoffs).toHaveLength(2);
    });

    it('should limit listed handoffs', () => {
      const { db } = setup();
      createHandoff(db, sampleHandoff, PROJECT_ID, sign);
      createHandoff(db, { ...sampleHandoff, reason: 'session_end' }, PROJECT_ID, sign);
      createHandoff(db, { ...sampleHandoff, reason: 'tool_switch' }, PROJECT_ID, sign);

      const handoffs = listHandoffs(db, PROJECT_ID, 2);
      expect(handoffs).toHaveLength(2);
    });

    it('should not list handoffs from other projects', () => {
      const { db } = setup();
      createHandoff(db, sampleHandoff, PROJECT_ID, sign);
      createHandoff(db, sampleHandoff, 'other-project', sign);

      const handoffs = listHandoffs(db, PROJECT_ID);
      expect(handoffs).toHaveLength(1);
    });

    it('should resolve memory refs', () => {
      const { db } = setup();
      const now = new Date().toISOString();

      // Insert a referenced memory
      db.prepare<[string, string, string, string, string, string, string]>(`
        INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES (?, 'task', ?, ?, ?, ?, ?, ?)
      `).run('mem-ref-1', 'Schema Design', 'Designed the database schema', 'sig_test', now, now, now);

      const handoff = createHandoff(db, {
        ...sampleHandoff,
        memory_refs: ['mem-ref-1'],
      }, PROJECT_ID, sign);

      const memories = getHandoffMemories(db, handoff);
      expect(memories).toHaveLength(1);
      expect(memories[0].title).toBe('Schema Design');
    });

    it('should skip missing memory refs', () => {
      const { db } = setup();
      const handoff = createHandoff(db, {
        ...sampleHandoff,
        memory_refs: ['nonexistent-mem'],
      }, PROJECT_ID, sign);

      const memories = getHandoffMemories(db, handoff);
      expect(memories).toHaveLength(0);
    });

    it('should format handoff resumption', () => {
      const { db } = setup();
      const handoff = createHandoff(db, sampleHandoff, PROJECT_ID, sign);

      const formatted = formatHandoffResumption(handoff, []);
      expect(formatted).toContain('agent-alpha');
      expect(formatted).toContain('context_limit');
      expect(formatted).toContain('schema design');
    });

    it('should format resumption with referenced memories', () => {
      const { db } = setup();
      const handoff = createHandoff(db, sampleHandoff, PROJECT_ID, sign);

      const formatted = formatHandoffResumption(handoff, [
        { id: 'mem-1', title: 'Schema Design', content: 'Designed tables for auth module' },
      ]);
      expect(formatted).toContain('Referenced Context');
      expect(formatted).toContain('Schema Design');
    });
  });

  // ==========================================================================
  // Artifact Manager
  // ==========================================================================

  describe('Artifact Manager', () => {
    it('should return empty working set by default', () => {
      const { db } = setup();
      const ws = getWorkingSet(db, PROJECT_ID);
      expect(ws.files).toEqual([]);
    });

    it('should persist working set', () => {
      const { db } = setup();
      persistWorkingSet(db, PROJECT_ID, ['src/main.ts', 'src/utils.ts'], sign);

      const ws = getWorkingSet(db, PROJECT_ID);
      expect(ws.files).toEqual(['src/main.ts', 'src/utils.ts']);
    });

    it('should deduplicate working set files', () => {
      const { db } = setup();
      persistWorkingSet(db, PROJECT_ID, ['src/main.ts', 'src/main.ts'], sign);

      const ws = getWorkingSet(db, PROJECT_ID);
      expect(ws.files).toEqual(['src/main.ts']);
    });

    it('should add to working set', () => {
      const { db } = setup();
      persistWorkingSet(db, PROJECT_ID, ['src/main.ts'], sign);
      addToWorkingSet(db, PROJECT_ID, ['src/utils.ts', 'src/types.ts'], sign);

      const ws = getWorkingSet(db, PROJECT_ID);
      expect(ws.files).toHaveLength(3);
      expect(ws.files).toContain('src/utils.ts');
    });

    it('should not duplicate when adding existing files', () => {
      const { db } = setup();
      persistWorkingSet(db, PROJECT_ID, ['src/main.ts'], sign);
      addToWorkingSet(db, PROJECT_ID, ['src/main.ts', 'src/utils.ts'], sign);

      const ws = getWorkingSet(db, PROJECT_ID);
      expect(ws.files).toHaveLength(2);
    });

    it('should remove from working set', () => {
      const { db } = setup();
      persistWorkingSet(db, PROJECT_ID, ['a.ts', 'b.ts', 'c.ts'], sign);
      removeFromWorkingSet(db, PROJECT_ID, ['b.ts'], sign);

      const ws = getWorkingSet(db, PROJECT_ID);
      expect(ws.files).toEqual(['a.ts', 'c.ts']);
    });

    it('should record an artifact', () => {
      const { db } = setup();
      recordArtifact(db, PROJECT_ID, {
        path: 'src/auth.ts',
        type: 'source',
        description: 'Authentication module',
      }, sign);

      const artifacts = getArtifacts(db, PROJECT_ID);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].path).toBe('src/auth.ts');
      expect(artifacts[0].type).toBe('source');
    });

    it('should update existing artifact by path', () => {
      const { db } = setup();
      recordArtifact(db, PROJECT_ID, {
        path: 'src/auth.ts',
        type: 'source',
        description: 'Auth v1',
      }, sign);
      recordArtifact(db, PROJECT_ID, {
        path: 'src/auth.ts',
        type: 'source',
        description: 'Auth v2',
      }, sign);

      const artifacts = getArtifacts(db, PROJECT_ID);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].description).toBe('Auth v2');
    });

    it('should filter artifacts by type', () => {
      const { db } = setup();
      recordArtifact(db, PROJECT_ID, { path: 'src/auth.ts', type: 'source', description: 'Source' }, sign);
      recordArtifact(db, PROJECT_ID, { path: 'src/auth.test.ts', type: 'test', description: 'Test' }, sign);
      recordArtifact(db, PROJECT_ID, { path: 'tsconfig.json', type: 'config', description: 'Config' }, sign);

      const tests = getArtifacts(db, PROJECT_ID, 'test');
      expect(tests).toHaveLength(1);
      expect(tests[0].path).toBe('src/auth.test.ts');
    });

    it('should suggest artifacts from working set', () => {
      const { db } = setup();
      persistWorkingSet(db, PROJECT_ID, ['src/auth.ts', 'src/auth.test.ts', 'config.json'], sign);
      recordArtifact(db, PROJECT_ID, { path: 'src/auth.ts', type: 'source', description: 'Already tracked' }, sign);

      const suggestions = suggestArtifacts(db, PROJECT_ID);
      expect(suggestions).toHaveLength(2);
      expect(suggestions.map(s => s.path)).toContain('src/auth.test.ts');
      expect(suggestions.map(s => s.path)).toContain('config.json');
    });

    it('should infer artifact types correctly', () => {
      const { db } = setup();
      persistWorkingSet(db, PROJECT_ID, [
        'src/main.ts',
        'src/main.test.ts',
        'package.json',
        'README.md',
        'dist/bundle.js',
      ], sign);

      const suggestions = suggestArtifacts(db, PROJECT_ID);
      const byPath = Object.fromEntries(suggestions.map(s => [s.path, s.type]));

      expect(byPath['src/main.ts']).toBe('source');
      expect(byPath['src/main.test.ts']).toBe('test');
      expect(byPath['package.json']).toBe('config');
      expect(byPath['README.md']).toBe('doc');
      expect(byPath['dist/bundle.js']).toBe('generated');
    });

    it('should return empty suggestions when all tracked', () => {
      const { db } = setup();
      persistWorkingSet(db, PROJECT_ID, ['src/main.ts'], sign);
      recordArtifact(db, PROJECT_ID, { path: 'src/main.ts', type: 'source', description: 'Tracked' }, sign);

      const suggestions = suggestArtifacts(db, PROJECT_ID);
      expect(suggestions).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Decision Fidelity
  // ==========================================================================

  describe('Decision Fidelity', () => {
    describe('Decision Recording', () => {
      it('should record a decision', () => {
        const { db } = setup();
        const decision = documentDecision(
          db, PROJECT_ID,
          'Use PostgreSQL for primary data store',
          'Better JSON support and ACID compliance',
          sign,
        );

        expect(decision.id).toBeTruthy();
        expect(decision.description).toBe('Use PostgreSQL for primary data store');
        expect(decision.locked).toBe(true);
      });

      it('should record unlocked decision', () => {
        const { db } = setup();
        const decision = documentDecision(
          db, PROJECT_ID,
          'Consider Redis for caching',
          'May switch to Memcached later',
          sign,
          { locked: false },
        );

        expect(decision.locked).toBe(false);
      });

      it('should record decision with tags', () => {
        const { db } = setup();
        const decision = documentDecision(
          db, PROJECT_ID,
          'Use REST API',
          'Simpler for MVP',
          sign,
          { tags: ['architecture', 'api'] },
        );

        expect(decision.tags).toEqual(['architecture', 'api']);
      });

      it('should get all decisions', () => {
        const { db } = setup();
        documentDecision(db, PROJECT_ID, 'Decision A', 'Reason A', sign);
        documentDecision(db, PROJECT_ID, 'Decision B', 'Reason B', sign);

        const decisions = getDecisions(db, PROJECT_ID);
        expect(decisions).toHaveLength(2);
      });

      it('should get only locked decisions', () => {
        const { db } = setup();
        documentDecision(db, PROJECT_ID, 'Locked', 'Reason', sign);
        documentDecision(db, PROJECT_ID, 'Unlocked', 'Reason', sign, { locked: false });

        const locked = getLockedDecisions(db, PROJECT_ID);
        expect(locked).toHaveLength(1);
        expect(locked[0].description).toBe('Locked');
      });

      it('should unlock a decision', () => {
        const { db } = setup();
        const decision = documentDecision(db, PROJECT_ID, 'Test', 'Reason', sign);

        unlockDecision(db, PROJECT_ID, decision.id, sign);

        const locked = getLockedDecisions(db, PROJECT_ID);
        expect(locked).toHaveLength(0);
      });

      it('should throw when unlocking nonexistent decision', () => {
        const { db } = setup();
        expect(() => unlockDecision(db, PROJECT_ID, 'nonexistent', sign)).toThrow();
      });
    });

    describe('Fidelity Checking', () => {
      it('should pass for non-conflicting action', () => {
        const { db } = setup();
        documentDecision(db, PROJECT_ID, 'Use PostgreSQL for data storage', 'Best fit', sign);

        const check = checkDecisionFidelity(db, PROJECT_ID, 'Add a new endpoint for user profiles');
        expect(check.compliant).toBe(true);
        expect(check.conflicts).toHaveLength(0);
      });

      it('should detect contradiction via negation', () => {
        const { db } = setup();
        documentDecision(db, PROJECT_ID, 'Use TypeScript strict mode', 'Type safety', sign);

        const check = checkDecisionFidelity(db, PROJECT_ID, 'Avoid using TypeScript strict mode');
        expect(check.compliant).toBe(false);
        expect(check.conflicts.length).toBeGreaterThan(0);
      });

      it('should detect reversal actions', () => {
        const { db } = setup();
        documentDecision(db, PROJECT_ID, 'Use PostgreSQL for data storage', 'Best fit', sign);

        const check = checkDecisionFidelity(db, PROJECT_ID, 'Remove PostgreSQL data storage and switch to MySQL');
        expect(check.compliant).toBe(false);
      });

      it('should not flag unlocked decisions', () => {
        const { db } = setup();
        documentDecision(db, PROJECT_ID, 'Use PostgreSQL', 'Initial choice', sign, { locked: false });

        const check = checkDecisionFidelity(db, PROJECT_ID, 'Remove PostgreSQL and use SQLite');
        expect(check.compliant).toBe(true);
      });

      it('should pass when no decisions exist', () => {
        const { db } = setup();
        const check = checkDecisionFidelity(db, PROJECT_ID, 'Do anything');
        expect(check.compliant).toBe(true);
      });
    });

    describe('Deferred Ideas', () => {
      it('should defer an idea', () => {
        const { db } = setup();
        const idea = deferIdea(
          db, PROJECT_ID,
          'Add GraphQL support',
          'Out of scope for MVP',
          sign,
        );

        expect(idea.id).toBeTruthy();
        expect(idea.description).toBe('Add GraphQL support');
        expect(idea.reason_deferred).toBe('Out of scope for MVP');
      });

      it('should defer with related decision', () => {
        const { db } = setup();
        const decision = documentDecision(db, PROJECT_ID, 'REST only for MVP', 'Scope', sign);

        const idea = deferIdea(
          db, PROJECT_ID,
          'GraphQL support',
          'Post-MVP',
          sign,
          decision.id,
        );

        expect(idea.related_decision_id).toBe(decision.id);
      });

      it('should check if idea is deferred', () => {
        const { db } = setup();
        deferIdea(db, PROJECT_ID, 'Add GraphQL support for API', 'Out of scope', sign);

        const result = isDeferred(db, PROJECT_ID, 'implement GraphQL support');
        expect(result).not.toBeNull();
        expect(result!.description).toContain('GraphQL');
      });

      it('should return null for non-deferred idea', () => {
        const { db } = setup();
        deferIdea(db, PROJECT_ID, 'Add GraphQL support', 'Out of scope', sign);

        const result = isDeferred(db, PROJECT_ID, 'implement user authentication');
        expect(result).toBeNull();
      });

      it('should list all deferred ideas', () => {
        const { db } = setup();
        deferIdea(db, PROJECT_ID, 'Idea A', 'Reason A', sign);
        deferIdea(db, PROJECT_ID, 'Idea B', 'Reason B', sign);

        const ideas = getDeferredIdeas(db, PROJECT_ID);
        expect(ideas).toHaveLength(2);
      });

      it('should remove a deferred idea', () => {
        const { db } = setup();
        const idea = deferIdea(db, PROJECT_ID, 'Idea A', 'Reason', sign);

        removeDeferredIdea(db, PROJECT_ID, idea.id, sign);

        const ideas = getDeferredIdeas(db, PROJECT_ID);
        expect(ideas).toHaveLength(0);
      });

      it('should throw when removing nonexistent idea', () => {
        const { db } = setup();
        expect(() => removeDeferredIdea(db, PROJECT_ID, 'nonexistent', sign)).toThrow();
      });
    });
  });
});
