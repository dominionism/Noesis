import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';

// GSD Engine
import {
  createExecution,
  getExecution,
  getCurrentExecution,
  listExecutions,
  updateExecution,
  deleteExecution,
  transitionStatus,
  isValidTransition,
  getProjectProgress,
} from '../../cognitive/execution/gsd-engine.js';

// Checkpoint Manager
import {
  createCheckpoint,
  resolveCheckpoint,
  getUnresolvedCheckpoints,
  shouldBlockExecution,
  autoResolveVerifyCheckpoints,
} from '../../cognitive/execution/checkpoint-manager.js';

// Debug State
import {
  createDebugSession,
  addHypothesis,
  updateHypothesisResult,
  resolveDebug,
  getActiveDebugSession,
} from '../../cognitive/execution/debug-state.js';

// Wave Scheduler
import {
  createWaveSchedule,
  isWaveComplete,
  canStartWave,
  getExecutableTasks,
  autoAssignWaves,
} from '../../cognitive/execution/wave-scheduler.js';
import type { WaveTask } from '../../cognitive/execution/wave-scheduler.js';

// Settings Manager
import {
  getSettings,
  updateSettings,
  setProfile,
  getProfileConfig,
  getDefaultSettings,
} from '../../cognitive/execution/settings-manager.js';

// TODO Manager
import {
  addTodo,
  listTodos,
  completeTodo,
  getTodo,
  deleteTodo,
  countTodos,
} from '../../cognitive/execution/todo-manager.js';

// Milestone Manager
import {
  createMilestone,
  completeMilestone,
  auditMilestone,
  addPhase,
  insertPhase,
  removePhase,
  getMilestone,
} from '../../cognitive/execution/milestone-manager.js';

// Plan Checker
import {
  checkPlan,
  formatPlanCheckResult,
} from '../../cognitive/execution/plan-checker.js';
import type { PlanForCheck } from '../../cognitive/execution/plan-checker.js';

// Integration Checker
import {
  checkIntegration,
  formatIntegrationResult,
} from '../../cognitive/execution/integration-checker.js';

// Codebase Mapper
import {
  getDocumentsForFocus,
  getAllDocuments,
  getDocumentTemplate,
  getAvailableFocusAreas,
  generateAnalysisPrompt,
} from '../../cognitive/execution/codebase-mapper.js';

// Phase Executor
import {
  startPhaseExecution,
  recordTaskResult,
  recordDeviation,
  checkExecutionStatus,
  completePhaseExecution,
  getExecutionSummary,
} from '../../cognitive/execution/phase-executor.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-execution-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('GSD Execution Engine', () => {
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

  // ==========================================================================
  // GSD Engine — CRUD + State Machine
  // ==========================================================================

  describe('GSD Engine', () => {
    it('should create execution state', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });

      expect(exec.id).toBeTruthy();
      expect(exec.project_id).toBe('proj-1');
      expect(exec.status).toBe('pending');
      expect(exec.phase_number).toBe(0);
      expect(exec.checkpoints).toEqual([]);
      expect(exec.deviations).toEqual([]);
      expect(exec.debug_state).toBeNull();
    });

    it('should retrieve execution by ID', () => {
      const { db } = setup();
      const created = createExecution(db, { project_id: 'proj-1' });
      const retrieved = getExecution(db, created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should get current execution for project', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 1 });
      const exec2 = createExecution(db, { project_id: 'proj-1', phase_number: 2 });

      const current = getCurrentExecution(db, 'proj-1');
      expect(current).not.toBeNull();
      expect(current!.id).toBe(exec2.id);
    });

    it('should list executions ordered by phase', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 3 });
      createExecution(db, { project_id: 'proj-1', phase_number: 1 });
      createExecution(db, { project_id: 'proj-1', phase_number: 2 });

      const list = listExecutions(db, 'proj-1');
      expect(list).toHaveLength(3);
      expect(list[0].phase_number).toBe(1);
      expect(list[1].phase_number).toBe(2);
      expect(list[2].phase_number).toBe(3);
    });

    it('should update execution state', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });

      updateExecution(db, exec.id, {
        status: 'executing',
        current_task: 2,
        total_tasks: 5,
      });

      const updated = getExecution(db, exec.id)!;
      expect(updated.status).toBe('executing');
      expect(updated.current_task).toBe(2);
      expect(updated.total_tasks).toBe(5);
    });

    it('should delete execution state', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      deleteExecution(db, exec.id);

      expect(getExecution(db, exec.id)).toBeNull();
    });

    it('should validate state transitions', () => {
      expect(isValidTransition('pending', 'researching')).toBe(true);
      expect(isValidTransition('pending', 'completed')).toBe(false);
      expect(isValidTransition('executing', 'verifying')).toBe(true);
      expect(isValidTransition('completed', 'pending')).toBe(false);
      expect(isValidTransition('blocked', 'executing')).toBe(true);
    });

    it('should transition status with validation', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });

      const result = transitionStatus(db, exec.id, 'researching');
      expect(result.status).toBe('researching');
    });

    it('should reject invalid transitions', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });

      expect(() => transitionStatus(db, exec.id, 'completed')).toThrow('Invalid transition');
    });

    it('should track project progress', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 1, status: 'completed' });
      createExecution(db, { project_id: 'proj-1', phase_number: 2, status: 'executing' });
      createExecution(db, { project_id: 'proj-1', phase_number: 3, status: 'pending' });

      const progress = getProjectProgress(db, 'proj-1');
      expect(progress.phases).toHaveLength(3);
      expect(progress.current_phase).toBe(2);
      expect(progress.overall_status).toBe('executing');
    });

    it('should persist JSON columns correctly', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });

      updateExecution(db, exec.id, {
        checkpoints: [{ type: 'decision', description: 'test', resolved: false, resolved_at: null }],
        deviations: [{ rule: 1, type: 'bug', description: 'fix', task_id: 't1', auto_fixed: true, timestamp: 'now' }],
      });

      const retrieved = getExecution(db, exec.id)!;
      expect(retrieved.checkpoints).toHaveLength(1);
      expect(retrieved.checkpoints[0].type).toBe('decision');
      expect(retrieved.deviations).toHaveLength(1);
      expect(retrieved.deviations[0].rule).toBe(1);
    });
  });

  // ==========================================================================
  // Checkpoint Manager
  // ==========================================================================

  describe('Checkpoint Manager', () => {
    it('should create a checkpoint', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });

      const cp = createCheckpoint(db, exec.id, {
        type: 'decision',
        description: 'Approve architecture',
      });

      expect(cp.type).toBe('decision');
      expect(cp.resolved).toBe(false);
    });

    it('should resolve a checkpoint', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      createCheckpoint(db, exec.id, { type: 'decision', description: 'test' });

      resolveCheckpoint(db, exec.id, 0);

      const unresolved = getUnresolvedCheckpoints(db, exec.id);
      expect(unresolved).toHaveLength(0);
    });

    it('should get unresolved checkpoints', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      createCheckpoint(db, exec.id, { type: 'decision', description: 'first' });
      createCheckpoint(db, exec.id, { type: 'human_verify', description: 'second' });

      resolveCheckpoint(db, exec.id, 0);

      const unresolved = getUnresolvedCheckpoints(db, exec.id);
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].description).toBe('second');
    });

    it('should block on unresolved decision in interactive mode', () => {
      const result = shouldBlockExecution(
        [{ type: 'decision', description: 'test', resolved: false, resolved_at: null }],
        'interactive',
      );
      expect(result.blocked).toBe(true);
    });

    it('should block on human_verify in interactive but not auto', () => {
      const checkpoints = [
        { type: 'human_verify' as const, description: 'test', resolved: false, resolved_at: null },
      ];

      expect(shouldBlockExecution(checkpoints, 'interactive').blocked).toBe(true);
      expect(shouldBlockExecution(checkpoints, 'auto').blocked).toBe(false);
    });

    it('should not block when all checkpoints resolved', () => {
      const result = shouldBlockExecution(
        [{ type: 'decision', description: 'test', resolved: true, resolved_at: 'now' }],
        'interactive',
      );
      expect(result.blocked).toBe(false);
    });

    it('should auto-resolve verify checkpoints', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      createCheckpoint(db, exec.id, { type: 'human_verify', description: 'v1' });
      createCheckpoint(db, exec.id, { type: 'decision', description: 'd1' });
      createCheckpoint(db, exec.id, { type: 'human_verify', description: 'v2' });

      const resolved = autoResolveVerifyCheckpoints(db, exec.id);
      expect(resolved).toBe(2);

      const unresolved = getUnresolvedCheckpoints(db, exec.id);
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].type).toBe('decision');
    });
  });

  // ==========================================================================
  // Debug State
  // ==========================================================================

  describe('Debug State', () => {
    it('should create a debug session', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });

      const debug = createDebugSession(db, exec.id, 'auth-bug', ['Login fails', '500 error']);
      expect(debug.slug).toBe('auth-bug');
      expect(debug.status).toBe('gathering');
      expect(debug.symptoms).toHaveLength(2);
    });

    it('should reject creating session when one is active', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      createDebugSession(db, exec.id, 'bug-1', ['symptom']);

      expect(() => createDebugSession(db, exec.id, 'bug-2', ['other'])).toThrow('Active debug session');
    });

    it('should add hypothesis and transition to investigating', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      createDebugSession(db, exec.id, 'bug', ['symptom']);

      addHypothesis(db, exec.id, {
        description: 'Database connection pool exhausted',
        confidence: 'high',
        evidence_for: ['High connection count'],
        evidence_against: [],
      });

      const state = getExecution(db, exec.id)!;
      expect(state.debug_state!.status).toBe('investigating');
      expect(state.debug_state!.hypotheses).toHaveLength(1);
    });

    it('should update hypothesis result', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      createDebugSession(db, exec.id, 'bug', ['symptom']);
      addHypothesis(db, exec.id, {
        description: 'Pool exhaustion',
        confidence: 'high',
        evidence_for: [],
        evidence_against: [],
      });

      updateHypothesisResult(db, exec.id, 0, 'confirmed', ['Logs show max connections']);

      const state = getExecution(db, exec.id)!;
      expect(state.debug_state!.hypotheses[0].tested).toBe(true);
      expect(state.debug_state!.hypotheses[0].result).toBe('confirmed');
      expect(state.debug_state!.status).toBe('fixing');
    });

    it('should resolve debug session', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      createDebugSession(db, exec.id, 'bug', ['symptom']);

      resolveDebug(db, exec.id, 'Connection pool too small', 'Increased pool size to 20');

      const state = getExecution(db, exec.id)!;
      expect(state.debug_state!.status).toBe('resolved');
      expect(state.debug_state!.root_cause).toBe('Connection pool too small');
    });

    it('should find active debug session for project', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      createDebugSession(db, exec.id, 'active-bug', ['error']);

      const active = getActiveDebugSession(db, 'proj-1');
      expect(active).not.toBeNull();
      expect(active!.debugState.slug).toBe('active-bug');
    });

    it('should return null for resolved debug sessions', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      createDebugSession(db, exec.id, 'done-bug', ['error']);
      resolveDebug(db, exec.id, 'Found it', 'Fixed it');

      const active = getActiveDebugSession(db, 'proj-1');
      expect(active).toBeNull();
    });
  });

  // ==========================================================================
  // Wave Scheduler
  // ==========================================================================

  describe('Wave Scheduler', () => {
    it('should group tasks by wave', () => {
      const tasks: WaveTask[] = [
        { id: '1', description: 'A', wave: 1, status: 'pending' },
        { id: '2', description: 'B', wave: 2, status: 'pending' },
        { id: '3', description: 'C', wave: 1, status: 'pending' },
      ];

      const schedule = createWaveSchedule(tasks);
      expect(schedule.totalWaves).toBe(2);
      expect(schedule.waves[0].tasks).toHaveLength(2);
      expect(schedule.waves[1].tasks).toHaveLength(1);
    });

    it('should detect wave completion', () => {
      const complete = { wave: 1, tasks: [
        { id: '1', description: 'A', wave: 1, status: 'completed' as const },
      ] };
      const incomplete = { wave: 1, tasks: [
        { id: '1', description: 'A', wave: 1, status: 'pending' as const },
      ] };

      expect(isWaveComplete(complete)).toBe(true);
      expect(isWaveComplete(incomplete)).toBe(false);
    });

    it('should check if wave can start', () => {
      const tasks: WaveTask[] = [
        { id: '1', description: 'A', wave: 1, status: 'completed' },
        { id: '2', description: 'B', wave: 2, status: 'pending' },
      ];
      const schedule = createWaveSchedule(tasks);

      expect(canStartWave(schedule, 2)).toBe(true);
    });

    it('should block wave if previous incomplete', () => {
      const tasks: WaveTask[] = [
        { id: '1', description: 'A', wave: 1, status: 'pending' },
        { id: '2', description: 'B', wave: 2, status: 'pending' },
      ];
      const schedule = createWaveSchedule(tasks);

      expect(canStartWave(schedule, 2)).toBe(false);
    });

    it('should get executable tasks', () => {
      const tasks: WaveTask[] = [
        { id: '1', description: 'A', wave: 1, status: 'pending' },
        { id: '2', description: 'B', wave: 1, status: 'completed' },
        { id: '3', description: 'C', wave: 2, status: 'pending' },
      ];
      const schedule = createWaveSchedule(tasks);

      const executable = getExecutableTasks(schedule);
      expect(executable).toHaveLength(1);
      expect(executable[0].id).toBe('1');
    });

    it('should auto-assign waves based on dependencies', () => {
      const tasks: WaveTask[] = [
        { id: 'a', description: 'A', wave: 0, status: 'pending' },
        { id: 'b', description: 'B', wave: 0, status: 'pending', dependencies: ['a'] },
        { id: 'c', description: 'C', wave: 0, status: 'pending', dependencies: ['b'] },
      ];

      const assigned = autoAssignWaves(tasks);
      expect(assigned[0].wave).toBe(1);
      expect(assigned[1].wave).toBe(2);
      expect(assigned[2].wave).toBe(3);
    });
  });

  // ==========================================================================
  // Settings Manager
  // ==========================================================================

  describe('Settings Manager', () => {
    it('should return default settings for new project', () => {
      const { db } = setup();
      const settings = getSettings(db, 'proj-new');

      expect(settings.profile).toBe('balanced');
      expect(settings.mode).toBe('interactive');
      expect(settings.researcher).toBe(true);
    });

    it('should update settings', () => {
      const { db } = setup();
      updateSettings(db, 'proj-1', { mode: 'auto', researcher: false }, sign);

      const settings = getSettings(db, 'proj-1');
      expect(settings.mode).toBe('auto');
      expect(settings.researcher).toBe(false);
      expect(settings.plan_check).toBe(true); // unchanged
    });

    it('should set profile', () => {
      const { db } = setup();
      setProfile(db, 'proj-1', 'quality', sign);

      const settings = getSettings(db, 'proj-1');
      expect(settings.profile).toBe('quality');
    });

    it('should get profile config', () => {
      const { db } = setup();
      setProfile(db, 'proj-1', 'budget', sign);

      const config = getProfileConfig(db, 'proj-1');
      expect(config.research).toBe('haiku');
      expect(config.planning).toBe('sonnet');
    });

    it('should provide default settings', () => {
      const defaults = getDefaultSettings();
      expect(defaults.profile).toBe('balanced');
    });
  });

  // ==========================================================================
  // TODO Manager
  // ==========================================================================

  describe('TODO Manager', () => {
    it('should add a todo', () => {
      const { db } = setup();
      const id = addTodo(db, 'proj-1', 'Fix login bug');

      expect(id).toBeTruthy();
      const todo = getTodo(db, id);
      expect(todo!.description).toBe('Fix login bug');
      expect(todo!.status).toBe('pending');
    });

    it('should add todo with area', () => {
      const { db } = setup();
      const id = addTodo(db, 'proj-1', 'Add tests', 'testing');

      const todo = getTodo(db, id);
      expect(todo!.area).toBe('testing');
    });

    it('should list todos for project', () => {
      const { db } = setup();
      addTodo(db, 'proj-1', 'Task A');
      addTodo(db, 'proj-1', 'Task B');
      addTodo(db, 'proj-2', 'Other task');

      const todos = listTodos(db, 'proj-1');
      expect(todos).toHaveLength(2);
    });

    it('should filter by area', () => {
      const { db } = setup();
      addTodo(db, 'proj-1', 'Test A', 'testing');
      addTodo(db, 'proj-1', 'Bug B', 'bugs');

      const testing = listTodos(db, 'proj-1', 'testing');
      expect(testing).toHaveLength(1);
      expect(testing[0].description).toBe('Test A');
    });

    it('should complete a todo', () => {
      const { db } = setup();
      const id = addTodo(db, 'proj-1', 'Fix bug');
      completeTodo(db, id);

      const todo = getTodo(db, id);
      expect(todo!.status).toBe('completed');
    });

    it('should throw on completing non-existent todo', () => {
      const { db } = setup();
      expect(() => completeTodo(db, 'nonexistent')).toThrow('TODO not found');
    });

    it('should count todos by status', () => {
      const { db } = setup();
      const id1 = addTodo(db, 'proj-1', 'A');
      addTodo(db, 'proj-1', 'B');
      completeTodo(db, id1);

      const counts = countTodos(db, 'proj-1');
      expect(counts.pending).toBe(1);
      expect(counts.completed).toBe(1);
      expect(counts.total).toBe(2);
    });

    it('should delete a todo', () => {
      const { db } = setup();
      const id = addTodo(db, 'proj-1', 'temp');
      deleteTodo(db, id);

      expect(getTodo(db, id)).toBeNull();
    });
  });

  // ==========================================================================
  // Milestone Manager
  // ==========================================================================

  describe('Milestone Manager', () => {
    it('should create a milestone', () => {
      const { db } = setup();
      const ms = createMilestone(db, 'proj-1', 'v1.0', 'First release');

      expect(ms.milestone).toBe('v1.0');
      expect(ms.status).toBe('pending');
    });

    it('should complete a milestone', () => {
      const { db } = setup();
      const ms = createMilestone(db, 'proj-1', 'v1.0', 'First release');
      completeMilestone(db, ms.id);

      const updated = getExecution(db, ms.id)!;
      expect(updated.status).toBe('completed');
    });

    it('should audit milestone', () => {
      const { db } = setup();
      createMilestone(db, 'proj-1', 'v1.0', 'Release');
      createExecution(db, { project_id: 'proj-1', milestone: 'v1.0', phase_number: 1, status: 'completed' });
      createExecution(db, { project_id: 'proj-1', milestone: 'v1.0', phase_number: 2, status: 'executing' });

      const audit = auditMilestone(db, 'proj-1', 'v1.0');
      expect(audit.completedPhases).toBe(1);
      expect(audit.totalPhases).toBe(2);
      expect(audit.coverage).toBe(0.5);
    });

    it('should add a phase to roadmap', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 1 });
      addPhase(db, 'proj-1', 'New phase');

      const list = listExecutions(db, 'proj-1');
      expect(list).toHaveLength(2);
      expect(list[1].phase_number).toBe(2);
    });

    it('should insert a phase with renumbering', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 1 });
      createExecution(db, { project_id: 'proj-1', phase_number: 2 });

      insertPhase(db, 'proj-1', 1, 'Inserted phase');

      const list = listExecutions(db, 'proj-1');
      expect(list).toHaveLength(3);
      expect(list.map(e => e.phase_number)).toEqual([1, 2, 3]);
    });

    it('should remove a phase with renumbering', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 1 });
      createExecution(db, { project_id: 'proj-1', phase_number: 2 });
      createExecution(db, { project_id: 'proj-1', phase_number: 3 });

      removePhase(db, 'proj-1', 2);

      const list = listExecutions(db, 'proj-1');
      expect(list).toHaveLength(2);
      expect(list.map(e => e.phase_number)).toEqual([1, 2]);
    });

    it('should reject removing non-pending phase', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 1, status: 'executing' });

      expect(() => removePhase(db, 'proj-1', 1)).toThrow('Cannot remove');
    });

    it('should get milestone by name', () => {
      const { db } = setup();
      createMilestone(db, 'proj-1', 'v2.0', 'Second release');
      createExecution(db, { project_id: 'proj-1', milestone: 'v2.0', phase_number: 1 });

      const ms = getMilestone(db, 'proj-1', 'v2.0');
      expect(ms).not.toBeNull();
      expect(ms!.name).toBe('v2.0');
      expect(ms!.phases).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Plan Checker
  // ==========================================================================

  describe('Plan Checker', () => {
    it('should pass a complete plan', () => {
      const plan: PlanForCheck = {
        tasks: [
          { id: '1', description: 'Build auth', files: ['auth.ts'], action: 'implement', verify: 'tests pass', done: 'auth works' },
          { id: '2', description: 'Test auth', files: ['auth.test.ts'], action: 'test', verify: 'coverage > 80%', done: 'all pass', dependencies: ['1'] },
        ],
      };

      const result = checkPlan(plan);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThan(80);
    });

    it('should flag empty plan', () => {
      const result = checkPlan({ tasks: [] });
      expect(result.passed).toBe(false);
      expect(result.issues.some(i => i.dimension === 'scope_sanity')).toBe(true);
    });

    it('should flag missing requirement coverage', () => {
      const plan: PlanForCheck = {
        tasks: [{ id: '1', description: 'Build UI' }],
        requirements: ['User authentication must be implemented'],
      };

      const result = checkPlan(plan);
      expect(result.issues.some(i => i.dimension === 'requirement_coverage')).toBe(true);
    });

    it('should detect dependency cycles', () => {
      const plan: PlanForCheck = {
        tasks: [
          { id: '1', description: 'A', dependencies: ['2'] },
          { id: '2', description: 'B', dependencies: ['1'] },
        ],
      };

      const result = checkPlan(plan);
      expect(result.issues.some(i => i.dimension === 'dependency_correctness')).toBe(true);
    });

    it('should flag invalid dependency references', () => {
      const plan: PlanForCheck = {
        tasks: [
          { id: '1', description: 'A', dependencies: ['nonexistent'] },
        ],
      };

      const result = checkPlan(plan);
      expect(result.issues.some(i => i.dimension === 'dependency_correctness')).toBe(true);
    });

    it('should warn about scope > 5 tasks', () => {
      const plan: PlanForCheck = {
        tasks: Array.from({ length: 6 }, (_, i) => ({
          id: String(i), description: `Task ${i}`,
        })),
      };

      const result = checkPlan(plan);
      expect(result.issues.some(i => i.dimension === 'scope_sanity')).toBe(true);
    });

    it('should format results as markdown', () => {
      const result = checkPlan({ tasks: [] });
      const md = formatPlanCheckResult(result);
      expect(md).toContain('BLOCKED');
    });

    it('should check memory compliance', () => {
      const plan: PlanForCheck = {
        tasks: [{ id: '1', description: 'Deploy authentication without testing validation' }],
        failurePatterns: ['deploy authentication without testing caused outage'],
      };

      const result = checkPlan(plan);
      expect(result.issues.some(i => i.dimension === 'memory_compliance')).toBe(true);
    });
  });

  // ==========================================================================
  // Integration Checker
  // ==========================================================================

  describe('Integration Checker', () => {
    it('should pass with single phase', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 1, status: 'completed' });

      const result = checkIntegration(db, 'proj-1');
      expect(result.passed).toBe(true);
    });

    it('should detect missing connections', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 1, status: 'pending' });
      createExecution(db, { project_id: 'proj-1', phase_number: 2, status: 'executing' });

      const result = checkIntegration(db, 'proj-1');
      expect(result.missingConnections.length).toBeGreaterThan(0);
    });

    it('should detect broken flows from blocked phases', () => {
      const { db } = setup();
      const exec1 = createExecution(db, { project_id: 'proj-1', phase_number: 1, status: 'blocked' });
      createExecution(db, { project_id: 'proj-1', phase_number: 2, status: 'pending' });

      const result = checkIntegration(db, 'proj-1');
      expect(result.brokenFlows.length).toBeGreaterThan(0);
    });

    it('should format results', () => {
      const { db } = setup();
      createExecution(db, { project_id: 'proj-1', phase_number: 1, status: 'completed' });

      const result = checkIntegration(db, 'proj-1');
      const md = formatIntegrationResult(result);
      expect(md).toContain('PASSED');
    });
  });

  // ==========================================================================
  // Codebase Mapper
  // ==========================================================================

  describe('Codebase Mapper', () => {
    it('should get documents for tech focus', () => {
      const docs = getDocumentsForFocus('tech');
      expect(docs.length).toBeGreaterThan(0);
      expect(docs.some(d => d.name === 'STACK.md')).toBe(true);
    });

    it('should get all documents', () => {
      const docs = getAllDocuments();
      expect(docs.length).toBe(7);
    });

    it('should get specific template', () => {
      const doc = getDocumentTemplate('ARCHITECTURE.md');
      expect(doc).not.toBeNull();
      expect(doc!.focus).toBe('arch');
    });

    it('should return null for unknown template', () => {
      expect(getDocumentTemplate('NONEXISTENT.md')).toBeNull();
    });

    it('should list all focus areas', () => {
      const areas = getAvailableFocusAreas();
      expect(areas).toContain('tech');
      expect(areas).toContain('arch');
      expect(areas).toContain('quality');
      expect(areas).toContain('concerns');
    });

    it('should generate analysis prompt', () => {
      const prompt = generateAnalysisPrompt('arch');
      expect(prompt).toContain('ARCHITECTURE.md');
      expect(prompt).toContain('STRUCTURE.md');
    });
  });

  // ==========================================================================
  // Phase Executor
  // ==========================================================================

  describe('Phase Executor', () => {
    it('should start phase execution', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      const started = startPhaseExecution(db, exec.id, 5);

      expect(started.status).toBe('executing');
      expect(started.total_tasks).toBe(5);
      expect(started.current_task).toBe(0);
    });

    it('should record task result and advance', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      startPhaseExecution(db, exec.id, 3);

      recordTaskResult(db, exec.id, {
        taskId: 't1',
        status: 'completed',
        deviations: [],
      });

      const updated = getExecution(db, exec.id)!;
      expect(updated.current_task).toBe(1);
    });

    it('should record deviation (rules 1-3 auto-fix)', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      startPhaseExecution(db, exec.id, 3);

      const result = recordDeviation(db, exec.id, 1, 'bug', 'Null pointer', 't1');
      expect(result.shouldStop).toBe(false);

      const state = getExecution(db, exec.id)!;
      expect(state.deviations).toHaveLength(1);
    });

    it('should stop on rule 4 deviation', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      startPhaseExecution(db, exec.id, 3);

      const result = recordDeviation(db, exec.id, 4, 'architecture', 'Need new service layer', 't1');
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toContain('Rule 4');
    });

    it('should stop after max auto-fix attempts', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      startPhaseExecution(db, exec.id, 3);

      recordDeviation(db, exec.id, 1, 'bug', 'Fix 1', 't1');
      recordDeviation(db, exec.id, 2, 'missing', 'Fix 2', 't1');
      const result = recordDeviation(db, exec.id, 3, 'blocking', 'Fix 3', 't1');

      expect(result.shouldStop).toBe(true);
      expect(result.reason).toContain('Auto-fix limit');
    });

    it('should check execution status', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      startPhaseExecution(db, exec.id, 3);

      const status = checkExecutionStatus(db, exec.id);
      expect(status.canProceed).toBe(true);
    });

    it('should block on unresolved checkpoints', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      startPhaseExecution(db, exec.id, 3);
      createCheckpoint(db, exec.id, { type: 'decision', description: 'Approve' });

      const status = checkExecutionStatus(db, exec.id, 'interactive');
      expect(status.canProceed).toBe(false);
    });

    it('should complete phase execution', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      startPhaseExecution(db, exec.id, 1);

      const completed = completePhaseExecution(db, exec.id, true);
      expect(completed.status).toBe('completed');
    });

    it('should get execution summary', () => {
      const { db } = setup();
      const exec = createExecution(db, { project_id: 'proj-1' });
      startPhaseExecution(db, exec.id, 5);
      recordDeviation(db, exec.id, 1, 'bug', 'Fix', 't1');
      createCheckpoint(db, exec.id, { type: 'human_verify', description: 'Check' });

      const summary = getExecutionSummary(db, exec.id);
      expect(summary.total_tasks).toBe(5);
      expect(summary.deviation_count).toBe(1);
      expect(summary.checkpoint_count).toBe(1);
      expect(summary.unresolved_checkpoints).toBe(1);
    });
  });
});
