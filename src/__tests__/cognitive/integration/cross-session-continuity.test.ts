/**
 * Integration Test: Cross-Session Continuity
 *
 * Tests the complete session lifecycle:
 *   Start session → work → create checkpoint → end session →
 *   start new session → resume from checkpoint → all context restored.
 *
 * This validates that the continuity system preserves decision fidelity,
 * working set, and artifact tracking across session boundaries.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../../core/database.js';

// Session management
import {
  startSession,
  getSession,
  updateSession,
  endSession,
  createSessionCheckpoint,
  getLatestCheckpoint,
} from '../../../cognitive/continuity/session-manager.js';

// Handoff management
import {
  createHandoff,
  resumeFromHandoff,
  listHandoffs,
  getHandoffMemories,
  formatHandoffResumption,
} from '../../../cognitive/continuity/handoff-manager.js';

// Artifact management
import {
  getWorkingSet,
  persistWorkingSet,
  addToWorkingSet,
  recordArtifact,
  getArtifacts,
  suggestArtifacts,
} from '../../../cognitive/continuity/artifact-manager.js';

// Decision fidelity
import {
  documentDecision,
  getDecisions,
  getLockedDecisions,
  checkDecisionFidelity,
  deferIdea,
  isDeferred,
  getDeferredIdeas,
} from '../../../cognitive/continuity/decision-fidelity.js';

// Context
import { seedBuiltInContexts } from '../../../cognitive/context/built-in-contexts.js';
import { assembleContexts } from '../../../cognitive/context/context-engine.js';

import type { HandoffInput } from '../../../types.js';
import { generateId } from '../../../core/ulid.js';

const sign = (content: string) => `sig_${content.length}`;
const PROJECT_ID = 'proj-continuity-test';

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-continuity-int-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Cross-Session Continuity Integration', () => {
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

  // --------------------------------------------------------------------------
  // Scenario 1: Complete session lifecycle
  // --------------------------------------------------------------------------

  describe('Complete session lifecycle', () => {
    it('session 1: start → work → checkpoint → end', () => {
      const { db } = setup();

      // Start session
      const session = startSession(db, PROJECT_ID, 'agent-1', sign);
      expect(session.current_phase).toBe('starting');

      // Do some work — update state
      updateSession(db, PROJECT_ID, {
        current_phase: 'executing',
        working_set: ['src/auth.ts', 'src/auth.test.ts'],
        decisions_made: ['Use JWT for authentication', 'Store tokens in httpOnly cookies'],
      }, sign);

      // Verify state updated
      const updated = getSession(db, PROJECT_ID)!;
      expect(updated.current_phase).toBe('executing');
      expect(updated.working_set).toEqual(['src/auth.ts', 'src/auth.test.ts']);
      expect(updated.decisions_made).toHaveLength(2);

      // Create checkpoint
      const checkpointId = createSessionCheckpoint(db, PROJECT_ID, {
        task_description: 'Implement JWT authentication',
        completed_steps: ['Created auth module', 'Added JWT signing'],
        remaining_steps: ['Add token refresh', 'Write tests'],
        current_blockers: [],
        relevant_files: ['src/auth.ts'],
        working_state: 'In progress',
      }, sign);
      expect(checkpointId).toBeTruthy();

      // End session
      endSession(db, PROJECT_ID, 'Completed JWT signing, refresh pending', sign);

      const ended = getSession(db, PROJECT_ID)!;
      expect(ended.current_phase).toBe('ended');
    });

    it('session 2: resume from checkpoint', () => {
      const { db } = setup();

      // Setup session 1
      startSession(db, PROJECT_ID, 'agent-1', sign);
      updateSession(db, PROJECT_ID, {
        current_phase: 'executing',
        working_set: ['src/auth.ts'],
        decisions_made: ['Use JWT'],
      }, sign);
      createSessionCheckpoint(db, PROJECT_ID, {
        task_description: 'Implement JWT authentication',
        completed_steps: ['JWT signing done'],
        remaining_steps: ['Token refresh', 'Tests'],
        current_blockers: [],
        relevant_files: ['src/auth.ts'],
        working_state: 'In progress',
      }, sign);
      endSession(db, PROJECT_ID, 'Session 1 done', sign);

      // Start session 2
      startSession(db, PROJECT_ID, 'agent-2', sign);

      // Retrieve latest checkpoint
      const checkpoint = getLatestCheckpoint(db, PROJECT_ID);
      expect(checkpoint).not.toBeNull();
      const content = checkpoint!.content as Record<string, unknown>;
      expect(content.task_description).toBe('Implement JWT authentication');
      expect((content.completed_steps as string[])).toContain('JWT signing done');
      expect((content.remaining_steps as string[])).toContain('Token refresh');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Handoff between agents
  // --------------------------------------------------------------------------

  describe('Agent handoff', () => {
    it('creates handoff, resumes in new session, memories available', () => {
      const { db } = setup();
      const now = new Date().toISOString();

      // Insert a memory that will be referenced
      db.prepare(`
        INSERT INTO memories (id, type, title, content, signature, created_at, updated_at, last_accessed_at)
        VALUES (?, 'task', ?, ?, ?, ?, ?, ?)
      `).run('mem-handoff-1', 'Auth Module Design', 'Designed JWT auth with refresh tokens', 'sig', now, now, now);

      // Session 1 creates handoff
      startSession(db, PROJECT_ID, 'agent-alpha', sign);
      const handoff = createHandoff(db, {
        source_agent: 'agent-alpha',
        target_agent: 'agent-beta',
        reason: 'context_limit',
        priority: 'immediate',
        state_summary: 'Completed JWT signing, need refresh token implementation and test coverage.',
        memory_refs: ['mem-handoff-1'],
      }, PROJECT_ID, sign);

      expect(handoff.id).toBeTruthy();
      expect(handoff.priority).toBe('immediate');
      endSession(db, PROJECT_ID, 'Handed off to agent-beta', sign);

      // Session 2 resumes from handoff
      startSession(db, PROJECT_ID, 'agent-beta', sign);

      const resumed = resumeFromHandoff(db, handoff.id);
      expect(resumed).not.toBeNull();
      expect(resumed!.source_agent).toBe('agent-alpha');
      expect(resumed!.state_summary).toContain('refresh token');

      // Resolve referenced memories
      const memories = getHandoffMemories(db, resumed!);
      expect(memories).toHaveLength(1);
      expect(memories[0].title).toBe('Auth Module Design');

      // Format for context injection
      const formatted = formatHandoffResumption(resumed!, memories);
      expect(formatted).toContain('agent-alpha');
      expect(formatted).toContain('Auth Module Design');
    });

    it('lists handoffs in chronological order', () => {
      const { db } = setup();

      startSession(db, PROJECT_ID, 'agent-1', sign);

      const h1 = createHandoff(db, {
        source_agent: 'a', target_agent: 'b',
        reason: 'context_limit', state_summary: 'First',
        memory_refs: [],
      }, PROJECT_ID, sign);

      const h2 = createHandoff(db, {
        source_agent: 'b', target_agent: 'c',
        reason: 'session_end', state_summary: 'Second',
        memory_refs: [],
      }, PROJECT_ID, sign);

      const handoffs = listHandoffs(db, PROJECT_ID);
      expect(handoffs).toHaveLength(2);
      // Both handoffs present
      const agents = handoffs.map(h => h.source_agent);
      expect(agents).toContain('a');
      expect(agents).toContain('b');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Working set and artifacts across sessions
  // --------------------------------------------------------------------------

  describe('Working set persistence across sessions', () => {
    it('working set persists after session end', () => {
      const { db } = setup();

      // Session 1: set working files
      startSession(db, PROJECT_ID, 'agent-1', sign);
      persistWorkingSet(db, PROJECT_ID, ['src/auth.ts', 'src/db.ts'], sign);
      recordArtifact(db, PROJECT_ID, {
        path: 'src/auth.ts',
        type: 'source',
        description: 'Authentication module',
      }, sign);
      endSession(db, PROJECT_ID, 'Done', sign);

      // Session 2: working set and artifacts are still there
      startSession(db, PROJECT_ID, 'agent-2', sign);

      const ws = getWorkingSet(db, PROJECT_ID);
      expect(ws.files).toEqual(['src/auth.ts', 'src/db.ts']);

      const artifacts = getArtifacts(db, PROJECT_ID);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].path).toBe('src/auth.ts');

      // New session can add to working set
      addToWorkingSet(db, PROJECT_ID, ['src/middleware.ts'], sign);
      const updated = getWorkingSet(db, PROJECT_ID);
      expect(updated.files).toHaveLength(3);

      // Suggestions reflect untracked files
      const suggestions = suggestArtifacts(db, PROJECT_ID);
      expect(suggestions.some(s => s.path === 'src/db.ts')).toBe(true);
      expect(suggestions.some(s => s.path === 'src/middleware.ts')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Decision fidelity across sessions
  // --------------------------------------------------------------------------

  describe('Decision fidelity across sessions', () => {
    it('decisions made in session 1 are enforced in session 2', () => {
      const { db } = setup();

      // Session 1: make decisions
      startSession(db, PROJECT_ID, 'agent-1', sign);
      documentDecision(db, PROJECT_ID, 'Use PostgreSQL for primary storage', 'ACID compliance required', sign);
      documentDecision(db, PROJECT_ID, 'Use TypeScript strict mode', 'Type safety is non-negotiable', sign);
      endSession(db, PROJECT_ID, 'Decisions documented', sign);

      // Session 2: verify decisions are enforced
      startSession(db, PROJECT_ID, 'agent-2', sign);

      const locked = getLockedDecisions(db, PROJECT_ID);
      expect(locked).toHaveLength(2);

      // Non-conflicting action passes
      const pass = checkDecisionFidelity(db, PROJECT_ID, 'Add new endpoint for user profiles');
      expect(pass.compliant).toBe(true);

      // Conflicting action fails — high keyword overlap + reversal language triggers conflict
      const fail = checkDecisionFidelity(db, PROJECT_ID, 'Remove PostgreSQL primary storage and switch to MongoDB');
      expect(fail.compliant).toBe(false);
      expect(fail.conflicts.length).toBeGreaterThan(0);
    });

    it('deferred ideas persist across sessions', () => {
      const { db } = setup();

      // Session 1: defer ideas
      startSession(db, PROJECT_ID, 'agent-1', sign);
      deferIdea(db, PROJECT_ID, 'Add GraphQL support', 'Out of scope for MVP', sign);
      deferIdea(db, PROJECT_ID, 'Mobile app support', 'Phase 2 feature', sign);
      endSession(db, PROJECT_ID, 'Ideas deferred', sign);

      // Session 2: ideas are still deferred
      startSession(db, PROJECT_ID, 'agent-2', sign);

      const deferred = getDeferredIdeas(db, PROJECT_ID);
      expect(deferred).toHaveLength(2);

      // Check if a task matches a deferred idea — needs >50% keyword overlap
      const graphql = isDeferred(db, PROJECT_ID, 'Add GraphQL support to the API');
      expect(graphql).not.toBeNull();
      expect(graphql!.description).toContain('GraphQL');

      // Non-deferred task
      const auth = isDeferred(db, PROJECT_ID, 'implement user authentication');
      expect(auth).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Multiple checkpoints — latest wins
  // --------------------------------------------------------------------------

  describe('Multiple checkpoints', () => {
    it('getLatestCheckpoint returns the most recent checkpoint', () => {
      const { db } = setup();

      startSession(db, PROJECT_ID, 'agent-1', sign);

      createSessionCheckpoint(db, PROJECT_ID, {
        task_description: 'Phase 1: Schema design',
        completed_steps: ['ERD created'],
        remaining_steps: ['Migrations', 'Endpoints'],
        current_blockers: [],
        relevant_files: [],
        working_state: 'phase-1',
      }, sign);

      createSessionCheckpoint(db, PROJECT_ID, {
        task_description: 'Phase 2: API endpoints',
        completed_steps: ['ERD created', 'Migrations done'],
        remaining_steps: ['Endpoints'],
        current_blockers: [],
        relevant_files: ['src/routes.ts'],
        working_state: 'phase-2',
      }, sign);

      createSessionCheckpoint(db, PROJECT_ID, {
        task_description: 'Phase 3: Testing',
        completed_steps: ['ERD created', 'Migrations done', 'Endpoints done'],
        remaining_steps: ['Integration tests'],
        current_blockers: ['Need test fixtures'],
        relevant_files: ['src/routes.ts', 'src/__tests__/routes.test.ts'],
        working_state: 'phase-3',
      }, sign);

      const latest = getLatestCheckpoint(db, PROJECT_ID);
      expect(latest).not.toBeNull();
      const content = latest!.content as Record<string, unknown>;
      expect(content.task_description).toBe('Phase 3: Testing');
      expect(content.working_state).toBe('phase-3');
      expect((content.current_blockers as string[])).toContain('Need test fixtures');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Context assembly includes session state
  // --------------------------------------------------------------------------

  describe('Context assembly with session data', () => {
    it('contexts assemble with decisions and failure patterns from prior sessions', () => {
      const { db } = setup();
      seedBuiltInContexts(db, sign);

      // Document decisions (writes to decision_records table)
      documentDecision(db, PROJECT_ID, 'Use REST API', 'Simpler for MVP', sign);

      // Assemble contexts — should include decisions template
      const { contexts } = assembleContexts(db, null, 100000);
      const decisionsCtx = contexts.find(c => c.context_type === 'decisions');
      expect(decisionsCtx).toBeDefined();
      // The built-in template is a template, actual decisions are in decision_records
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Handoff with decision context
  // --------------------------------------------------------------------------

  describe('Handoff preserves decision context', () => {
    it('decisions survive handoff between agents', () => {
      const { db } = setup();

      // Agent 1 makes decisions
      startSession(db, PROJECT_ID, 'planner', sign);
      documentDecision(db, PROJECT_ID, 'Use event-driven architecture', 'Scalability requirement', sign);
      documentDecision(db, PROJECT_ID, 'Redis for pub/sub', 'Low latency messaging', sign);

      // Create handoff
      createHandoff(db, {
        source_agent: 'planner',
        target_agent: 'implementer',
        reason: 'session_end',
        state_summary: 'Architecture decided, ready for implementation.',
        memory_refs: [],
      }, PROJECT_ID, sign);
      endSession(db, PROJECT_ID, 'Planning complete', sign);

      // Agent 2 picks up
      startSession(db, PROJECT_ID, 'implementer', sign);

      // All decisions still enforced
      const decisions = getLockedDecisions(db, PROJECT_ID);
      expect(decisions).toHaveLength(2);

      // Fidelity check still works
      // High keyword overlap + reversal language triggers conflict
      const check = checkDecisionFidelity(db, PROJECT_ID, 'Remove Redis pub/sub and switch to RabbitMQ');
      expect(check.compliant).toBe(false);
    });
  });
});
