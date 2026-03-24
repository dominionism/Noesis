/**
 * Deviation Tracker — 4-Rule Deviation Tracking System
 *
 * Tracks deviations from the planned implementation path using 4 rules:
 *
 * Rule 1: Auto-Fix Bugs — code doesn't work, fix immediately, current task only
 * Rule 2: Auto-Add Critical — missing essential features, add immediately, current task only
 * Rule 3: Auto-Fix Blocking — something prevents completion, fix immediately, current task only
 * Rule 4: Ask Architecture — significant structural change, STOP and ask
 *
 * After 3 auto-fix attempts (rules 1-3) on the same task, shouldStop returns true.
 * Rule 4 always returns shouldStop = true.
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export type DeviationRule = 1 | 2 | 3 | 4;

export interface DeviationEntry {
  id: string;
  rule: DeviationRule;
  type: string;
  description: string;
  taskId: string;
  timestamp: string;
  autoFixed: boolean;
  attemptCount: number;
}

export interface DeviationTracker {
  record(rule: DeviationRule, type: string, description: string, taskId: string): DeviationEntry;
  getByTask(taskId: string): DeviationEntry[];
  getByRule(rule: DeviationRule): DeviationEntry[];
  getAll(): DeviationEntry[];
  shouldStop(taskId: string): { stop: boolean; reason: string };
  clear(): void;
}

// ===========================================================================
// Constants
// ===========================================================================

/** Maximum auto-fix attempts per task before requiring human intervention. */
const MAX_AUTO_FIX_ATTEMPTS = 3;

// ===========================================================================
// Implementation
// ===========================================================================

/**
 * Create a new deviation tracker instance.
 *
 * The tracker maintains an in-memory list of deviation entries.
 * Rule 4 deviations always stop execution. Rules 1-3 allow auto-fix
 * up to MAX_AUTO_FIX_ATTEMPTS per task.
 */
export function createDeviationTracker(): DeviationTracker {
  const entries: DeviationEntry[] = [];

  return {
    record(rule: DeviationRule, type: string, description: string, taskId: string): DeviationEntry {
      // Count existing auto-fix attempts for this task (rules 1-3)
      const taskAutoFixes = entries.filter(
        (e) => e.taskId === taskId && e.rule !== 4,
      ).length;

      const entry: DeviationEntry = {
        id: generateId(),
        rule,
        type,
        description,
        taskId,
        timestamp: new Date().toISOString(),
        autoFixed: rule !== 4,
        attemptCount: taskAutoFixes + 1,
      };

      entries.push(entry);
      return entry;
    },

    getByTask(taskId: string): DeviationEntry[] {
      return entries.filter((e) => e.taskId === taskId);
    },

    getByRule(rule: DeviationRule): DeviationEntry[] {
      return entries.filter((e) => e.rule === rule);
    },

    getAll(): DeviationEntry[] {
      return [...entries];
    },

    shouldStop(taskId: string): { stop: boolean; reason: string } {
      const taskEntries = entries.filter((e) => e.taskId === taskId);

      // Rule 4 always stops
      const hasRule4 = taskEntries.some((e) => e.rule === 4);
      if (hasRule4) {
        return {
          stop: true,
          reason: 'Rule 4 deviation: significant structural change requires human decision.',
        };
      }

      // After MAX_AUTO_FIX_ATTEMPTS auto-fix attempts, stop
      const autoFixCount = taskEntries.filter((e) => e.rule !== 4).length;
      if (autoFixCount >= MAX_AUTO_FIX_ATTEMPTS) {
        return {
          stop: true,
          reason: `Auto-fix limit reached: ${autoFixCount} attempts on task ${taskId}. Human intervention required.`,
        };
      }

      return { stop: false, reason: '' };
    },

    clear(): void {
      entries.length = 0;
    },
  };
}
