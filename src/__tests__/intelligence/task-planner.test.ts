/**
 * Tests for Task Planning Engine
 *
 * Covers:
 * - estimateSubtask: historical data usage, heuristic fallbacks, confidence scaling
 * - decompose: single task, multi-part task, subtask chaining
 * - findCriticalPath: linear chains, branching, empty input
 * - findParallelGroups: independent tasks, all sequential
 * - updateEstimate: updates target subtask, recalculates totals
 */

import { describe, it, expect } from 'vitest';
import {
  estimateSubtask,
  decompose,
  findCriticalPath,
  findParallelGroups,
  updateEstimate,
  type SubTask,
  type TaskPlan,
} from '../../intelligence/task-planner.js';
import type { ScoredMemory } from '../../types.js';

// ===========================================================================
// Helpers
// ===========================================================================

function makeScoredMemory(title: string): ScoredMemory {
  return {
    id: 'mem1',
    type: 'task',
    title,
    content: '{}',
    tags: '[]',
    project_id: null,
    scope: 'global',
    sensitivity: 'PUBLIC',
    confidence: 0.8,
    outcome: 'success',
    source: 'test',
    embedding: null,
    embedding_model: null,
    signature: 'sig',
    status: 'active',
    access_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
    expires_at: null,
    superseded_by: null,
    session_id: null,
    semantic_score: 0,
    bm25_rank: 0,
    vector_rank: 0,
    recency_modifier: 0,
    access_boost: 0,
    success_weight: 0,
    scope_boost: 0,
    final_score: 0,
  };
}

// ===========================================================================
// estimateSubtask
// ===========================================================================

describe('estimateSubtask', () => {
  it('returns historical estimate when similar past tasks exist', () => {
    const pastTasks = [
      makeScoredMemory('Implement user authentication system'),
      makeScoredMemory('Implement authentication middleware'),
    ];

    const estimate = estimateSubtask('Implement authentication for users', pastTasks);
    expect(estimate.basedOnHistorical).toBe(true);
    expect(estimate.similarTaskCount).toBe(2);
    expect(estimate.confidence).toBeGreaterThan(0.5);
  });

  it('returns heuristic estimate when no similar tasks found', () => {
    const pastTasks = [makeScoredMemory('Deploy infrastructure')];

    const estimate = estimateSubtask('Implement caching layer', pastTasks);
    expect(estimate.basedOnHistorical).toBe(false);
    expect(estimate.similarTaskCount).toBe(0);
  });

  it('returns heuristic estimate when no past tasks provided', () => {
    const estimate = estimateSubtask('Build something');
    expect(estimate.basedOnHistorical).toBe(false);
    expect(estimate.similarTaskCount).toBe(0);
  });

  it('short descriptions get low duration and low confidence', () => {
    const estimate = estimateSubtask('Fix bug');
    expect(estimate.durationMs).toBe(60_000);
    expect(estimate.confidence).toBe(0.4);
    expect(estimate.riskLevel).toBe('low');
  });

  it('medium descriptions get medium estimates', () => {
    const estimate = estimateSubtask('Implement the user authentication module with proper error handling');
    expect(estimate.durationMs).toBe(300_000);
    expect(estimate.confidence).toBe(0.3);
    expect(estimate.riskLevel).toBe('medium');
  });

  it('long descriptions get high duration and high risk', () => {
    const longDesc = 'A'.repeat(201);
    const estimate = estimateSubtask(longDesc);
    expect(estimate.durationMs).toBe(600_000);
    expect(estimate.confidence).toBe(0.2);
    expect(estimate.riskLevel).toBe('high');
  });

  it('increases confidence with more similar tasks, capped at 0.9', () => {
    const pastTasks = Array.from({ length: 10 }, (_, i) =>
      makeScoredMemory(`Implement caching layer variant ${i}`),
    );

    const estimate = estimateSubtask('Implement caching layer for data', pastTasks);
    expect(estimate.confidence).toBeLessThanOrEqual(0.9);
  });

  it('assigns low risk when 3+ similar tasks exist', () => {
    const pastTasks = Array.from({ length: 3 }, () =>
      makeScoredMemory('Build search index system'),
    );

    const estimate = estimateSubtask('Build search index for queries', pastTasks);
    expect(estimate.riskLevel).toBe('low');
  });
});

// ===========================================================================
// decompose
// ===========================================================================

describe('decompose', () => {
  it('creates research/implement/verify subtasks for a single-sentence task', () => {
    const plan = decompose('Build a caching layer');

    expect(plan.subtasks).toHaveLength(3);
    expect(plan.subtasks[0].description).toContain('Research');
    expect(plan.subtasks[1].description).toContain('Implement');
    expect(plan.subtasks[2].description).toContain('Verify');
  });

  it('splits multi-sentence tasks into individual subtasks', () => {
    const plan = decompose('Parse the input. Transform the data. Write the output');
    expect(plan.subtasks).toHaveLength(3);
    expect(plan.subtasks[0].description).toBe('Parse the input');
    expect(plan.subtasks[1].description).toBe('Transform the data');
    expect(plan.subtasks[2].description).toBe('Write the output');
  });

  it('chains subtasks with sequential dependencies', () => {
    const plan = decompose('Step one. Step two. Step three');
    expect(plan.subtasks[0].dependencies).toHaveLength(0);
    expect(plan.subtasks[1].dependencies).toContain(plan.subtasks[0].id);
    expect(plan.subtasks[2].dependencies).toContain(plan.subtasks[1].id);
  });

  it('generates unique IDs for plan and subtasks', () => {
    const plan = decompose('Do something');
    expect(plan.id).toBeTruthy();

    const ids = new Set(plan.subtasks.map((st) => st.id));
    expect(ids.size).toBe(plan.subtasks.length);
  });

  it('initializes all subtasks as pending', () => {
    const plan = decompose('Task one. Task two');
    for (const st of plan.subtasks) {
      expect(st.status).toBe('pending');
    }
  });

  it('computes total estimate from subtask estimates', () => {
    const plan = decompose('Short. Medium description here. Another one');
    const sum = plan.subtasks.reduce((s, st) => s + st.estimate.durationMs, 0);
    expect(plan.totalEstimate.durationMs).toBe(sum);
  });

  it('sets risk level to high if any subtask is high risk', () => {
    // Long description produces high risk
    const plan = decompose('A'.repeat(201));
    expect(plan.totalEstimate.riskLevel).toBe('high');
  });

  it('computes critical path', () => {
    const plan = decompose('A. B. C');
    expect(plan.criticalPath.length).toBeGreaterThan(0);
  });

  it('uses historical data when past tasks are provided', () => {
    const pastTasks = [makeScoredMemory('Research authentication patterns')];
    const plan = decompose('Implement authentication', pastTasks);
    // At least some subtasks should check against historical data
    expect(plan.totalEstimate).toBeDefined();
  });
});

// ===========================================================================
// findCriticalPath
// ===========================================================================

describe('findCriticalPath', () => {
  it('returns empty for empty input', () => {
    expect(findCriticalPath([])).toEqual([]);
  });

  it('returns all IDs for a linear chain', () => {
    const subtasks: SubTask[] = [
      { id: 'a', description: 'A', dependencies: [], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'b', description: 'B', dependencies: ['a'], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'c', description: 'C', dependencies: ['b'], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
    ];

    const path = findCriticalPath(subtasks);
    expect(path).toEqual(['a', 'b', 'c']);
  });

  it('finds longest path in a branching DAG', () => {
    const subtasks: SubTask[] = [
      { id: 'root', description: 'Root', dependencies: [], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'short', description: 'Short', dependencies: ['root'], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'long1', description: 'Long1', dependencies: ['root'], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'long2', description: 'Long2', dependencies: ['long1'], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
    ];

    const path = findCriticalPath(subtasks);
    // Longest path: root -> long1 -> long2 (3 nodes)
    expect(path.length).toBe(3);
    expect(path).toContain('root');
    expect(path).toContain('long1');
    expect(path).toContain('long2');
  });

  it('handles single task', () => {
    const subtasks: SubTask[] = [
      { id: 'only', description: 'Only', dependencies: [], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
    ];

    const path = findCriticalPath(subtasks);
    expect(path).toEqual(['only']);
  });
});

// ===========================================================================
// findParallelGroups
// ===========================================================================

describe('findParallelGroups', () => {
  it('returns empty for empty input', () => {
    expect(findParallelGroups([])).toEqual([]);
  });

  it('returns empty when all tasks are sequential', () => {
    const subtasks: SubTask[] = [
      { id: 'a', description: 'A', dependencies: [], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'b', description: 'B', dependencies: ['a'], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'c', description: 'C', dependencies: ['b'], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
    ];

    const groups = findParallelGroups(subtasks);
    // Each task is at a different depth, so no group has 2+ members
    expect(groups).toEqual([]);
  });

  it('identifies tasks at the same depth as parallelizable', () => {
    const subtasks: SubTask[] = [
      { id: 'root', description: 'Root', dependencies: [], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'a', description: 'A', dependencies: ['root'], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'b', description: 'B', dependencies: ['root'], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
    ];

    const groups = findParallelGroups(subtasks);
    expect(groups.length).toBe(1);
    expect(groups[0].sort()).toEqual(['a', 'b']);
  });

  it('finds multiple independent root tasks as parallel', () => {
    const subtasks: SubTask[] = [
      { id: 'a', description: 'A', dependencies: [], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'b', description: 'B', dependencies: [], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
      { id: 'c', description: 'C', dependencies: [], estimate: { durationMs: 100, confidence: 0.5, basedOnHistorical: false, similarTaskCount: 0, riskLevel: 'low' }, status: 'pending' },
    ];

    const groups = findParallelGroups(subtasks);
    expect(groups.length).toBe(1);
    expect(groups[0].sort()).toEqual(['a', 'b', 'c']);
  });
});

// ===========================================================================
// updateEstimate
// ===========================================================================

describe('updateEstimate', () => {
  it('updates the target subtask with actual duration', () => {
    const plan = decompose('Research. Implement. Verify');
    const targetId = plan.subtasks[0].id;

    const updated = updateEstimate(plan, targetId, 120_000);

    const updatedSubtask = updated.subtasks.find((st) => st.id === targetId)!;
    expect(updatedSubtask.estimate.durationMs).toBe(120_000);
    expect(updatedSubtask.estimate.basedOnHistorical).toBe(true);
    expect(updatedSubtask.estimate.confidence).toBe(0.9);
    expect(updatedSubtask.status).toBe('completed');
  });

  it('does not modify other subtasks', () => {
    const plan = decompose('A. B. C');
    const targetId = plan.subtasks[1].id;
    const otherIds = plan.subtasks.filter((st) => st.id !== targetId).map((st) => st.id);

    const updated = updateEstimate(plan, targetId, 50_000);

    for (const id of otherIds) {
      const original = plan.subtasks.find((st) => st.id === id)!;
      const updatedSt = updated.subtasks.find((st) => st.id === id)!;
      expect(updatedSt.estimate.durationMs).toBe(original.estimate.durationMs);
      expect(updatedSt.status).toBe('pending');
    }
  });

  it('recalculates total estimate', () => {
    const plan = decompose('A. B. C');
    const targetId = plan.subtasks[0].id;

    const updated = updateEstimate(plan, targetId, 1000);

    const expectedTotal = updated.subtasks.reduce((s, st) => s + st.estimate.durationMs, 0);
    expect(updated.totalEstimate.durationMs).toBe(expectedTotal);
  });

  it('returns a new plan object (immutability)', () => {
    const plan = decompose('X. Y');
    const updated = updateEstimate(plan, plan.subtasks[0].id, 999);

    expect(updated).not.toBe(plan);
    expect(updated.subtasks).not.toBe(plan.subtasks);
  });
});
