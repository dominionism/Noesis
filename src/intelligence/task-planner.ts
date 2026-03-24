/**
 * Task Planning Engine
 *
 * Decomposes complex tasks into dependency-ordered subtask DAGs with
 * estimated effort, using historical data from memory.
 */

import { generateId } from '../core/ulid.js';
import type { ScoredMemory } from '../types.js';

// ===========================================================================
// Types
// ===========================================================================

export interface TaskEstimate {
  durationMs: number;
  confidence: number;
  basedOnHistorical: boolean;
  similarTaskCount: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SubTask {
  id: string;
  description: string;
  dependencies: string[];
  estimate: TaskEstimate;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface TaskPlan {
  id: string;
  description: string;
  subtasks: SubTask[];
  totalEstimate: TaskEstimate;
  criticalPath: string[];
  parallelizable: string[][];
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Estimate effort for a single subtask description.
 *
 * Uses past tasks for historical estimates when available.
 * Falls back to heuristic based on description length.
 */
export function estimateSubtask(
  description: string,
  pastTasks?: ScoredMemory[],
): TaskEstimate {
  // Check for historical data
  if (pastTasks && pastTasks.length > 0) {
    const similar = pastTasks.filter((t) => {
      const titleWords = t.title.toLowerCase().split(/\s+/);
      const descWords = description.toLowerCase().split(/\s+/);
      const overlap = titleWords.filter((w) => descWords.includes(w) && w.length > 3).length;
      return overlap >= 2;
    });

    if (similar.length > 0) {
      // Use historical data — estimate as median of past durations
      const baseDuration = 300_000; // 5 minutes default
      return {
        durationMs: baseDuration,
        confidence: Math.min(0.5 + similar.length * 0.1, 0.9),
        basedOnHistorical: true,
        similarTaskCount: similar.length,
        riskLevel: similar.length >= 3 ? 'low' : 'medium',
      };
    }
  }

  // Heuristic based on description length
  const len = description.length;
  if (len < 20) {
    return {
      durationMs: 60_000,
      confidence: 0.4,
      basedOnHistorical: false,
      similarTaskCount: 0,
      riskLevel: 'low',
    };
  }
  if (len > 200) {
    return {
      durationMs: 600_000,
      confidence: 0.2,
      basedOnHistorical: false,
      similarTaskCount: 0,
      riskLevel: 'high',
    };
  }

  return {
    durationMs: 300_000,
    confidence: 0.3,
    basedOnHistorical: false,
    similarTaskCount: 0,
    riskLevel: 'medium',
  };
}

/**
 * Decompose a task description into a structured plan with subtasks.
 */
export function decompose(
  task: string,
  pastTasks?: ScoredMemory[],
): TaskPlan {
  const planId = generateId();

  // Split task into subtasks by sentences or semicolons
  const parts = task
    .split(/[.;]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If only one part, create research + implement + verify subtasks
  const descriptions = parts.length <= 1
    ? [
        `Research: ${task}`,
        `Implement: ${task}`,
        `Verify: ${task}`,
      ]
    : parts;

  const subtasks: SubTask[] = [];
  let previousId: string | null = null;

  for (const desc of descriptions) {
    const id = generateId();
    const estimate = estimateSubtask(desc, pastTasks);

    subtasks.push({
      id,
      description: desc,
      dependencies: previousId ? [previousId] : [],
      estimate,
      status: 'pending',
    });

    previousId = id;
  }

  const criticalPath = findCriticalPath(subtasks);
  const parallelizable = findParallelGroups(subtasks);

  const totalDuration = subtasks.reduce((sum, st) => sum + st.estimate.durationMs, 0);
  const avgConfidence = subtasks.reduce((sum, st) => sum + st.estimate.confidence, 0) / subtasks.length;
  const hasHigh = subtasks.some((st) => st.estimate.riskLevel === 'high');
  const hasMedium = subtasks.some((st) => st.estimate.riskLevel === 'medium');

  return {
    id: planId,
    description: task,
    subtasks,
    totalEstimate: {
      durationMs: totalDuration,
      confidence: avgConfidence,
      basedOnHistorical: subtasks.some((st) => st.estimate.basedOnHistorical),
      similarTaskCount: subtasks.reduce((sum, st) => sum + st.estimate.similarTaskCount, 0),
      riskLevel: hasHigh ? 'high' : hasMedium ? 'medium' : 'low',
    },
    criticalPath,
    parallelizable,
  };
}

/**
 * Find the critical path through subtask dependencies.
 *
 * Returns the IDs of subtasks on the longest dependency chain.
 */
export function findCriticalPath(subtasks: SubTask[]): string[] {
  if (subtasks.length === 0) return [];

  const byId = new Map(subtasks.map((st) => [st.id, st]));

  // Find tasks with no dependents (end nodes)
  const hasDependents = new Set<string>();
  for (const st of subtasks) {
    for (const dep of st.dependencies) {
      hasDependents.add(dep);
    }
  }

  // Build longest path from each node using DFS + memoization
  const memo = new Map<string, string[]>();

  function longestPath(id: string): string[] {
    if (memo.has(id)) return memo.get(id)!;

    const task = byId.get(id);
    if (!task) return [id];

    // Find all tasks that depend on this one
    const dependents = subtasks.filter((st) => st.dependencies.includes(id));
    if (dependents.length === 0) {
      const path = [id];
      memo.set(id, path);
      return path;
    }

    let longest: string[] = [];
    for (const dep of dependents) {
      const path = longestPath(dep.id);
      if (path.length > longest.length) {
        longest = path;
      }
    }

    const result = [id, ...longest];
    memo.set(id, result);
    return result;
  }

  // Find roots (no dependencies)
  const roots = subtasks.filter((st) => st.dependencies.length === 0);
  let criticalPath: string[] = [];

  for (const root of roots) {
    const path = longestPath(root.id);
    if (path.length > criticalPath.length) {
      criticalPath = path;
    }
  }

  // If no roots found (shouldn't happen), return all IDs
  if (criticalPath.length === 0) {
    return subtasks.map((st) => st.id);
  }

  return criticalPath;
}

/**
 * Find groups of subtasks that can run in parallel.
 *
 * Subtasks that share no dependencies between them can be parallelized.
 */
export function findParallelGroups(subtasks: SubTask[]): string[][] {
  if (subtasks.length === 0) return [];

  // Group by dependency depth level
  const depthMap = new Map<string, number>();

  function getDepth(id: string, visited: Set<string>): number {
    if (depthMap.has(id)) return depthMap.get(id)!;
    if (visited.has(id)) return 0; // circular dependency guard
    visited.add(id);

    const task = subtasks.find((st) => st.id === id);
    if (!task || task.dependencies.length === 0) {
      depthMap.set(id, 0);
      return 0;
    }

    let maxDepth = 0;
    for (const dep of task.dependencies) {
      const d = getDepth(dep, visited);
      if (d + 1 > maxDepth) maxDepth = d + 1;
    }

    depthMap.set(id, maxDepth);
    return maxDepth;
  }

  for (const st of subtasks) {
    getDepth(st.id, new Set());
  }

  // Group by depth level
  const groups = new Map<number, string[]>();
  for (const st of subtasks) {
    const depth = depthMap.get(st.id) ?? 0;
    if (!groups.has(depth)) groups.set(depth, []);
    groups.get(depth)!.push(st.id);
  }

  // Only return groups with 2+ tasks (actual parallelism)
  return Array.from(groups.values()).filter((g) => g.length >= 2);
}

/**
 * Update a subtask estimate with actual duration data.
 *
 * Returns a new plan with updated estimates.
 */
export function updateEstimate(
  plan: TaskPlan,
  subtaskId: string,
  actualDurationMs: number,
): TaskPlan {
  const updatedSubtasks = plan.subtasks.map((st) => {
    if (st.id !== subtaskId) return st;
    return {
      ...st,
      estimate: {
        ...st.estimate,
        durationMs: actualDurationMs,
        basedOnHistorical: true,
        confidence: 0.9,
      },
      status: 'completed' as const,
    };
  });

  const totalDuration = updatedSubtasks.reduce((sum, st) => sum + st.estimate.durationMs, 0);
  const avgConfidence = updatedSubtasks.reduce((sum, st) => sum + st.estimate.confidence, 0) / updatedSubtasks.length;

  return {
    ...plan,
    subtasks: updatedSubtasks,
    totalEstimate: {
      ...plan.totalEstimate,
      durationMs: totalDuration,
      confidence: avgConfidence,
    },
  };
}
