/**
 * Tests for Deviation Tracker — 4-Rule Deviation Tracking System
 *
 * Covers:
 * - record: entry creation for all 4 rules
 * - getByTask / getByRule / getAll: filtering
 * - shouldStop: Rule 4 always stops, Rules 1-3 after 3 attempts
 * - clear: state reset
 * - Edge cases and error conditions
 */

import { describe, it, expect } from 'vitest';
import {
  createDeviationTracker,
  type DeviationRule,
  type DeviationEntry,
} from '../../workflow/deviation-tracker.js';

// ---------------------------------------------------------------------------
// createDeviationTracker
// ---------------------------------------------------------------------------

describe('createDeviationTracker', () => {
  it('creates a tracker with empty state', () => {
    const tracker = createDeviationTracker();
    expect(tracker.getAll()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// record
// ---------------------------------------------------------------------------

describe('record', () => {
  it('creates a deviation entry with correct fields', () => {
    const tracker = createDeviationTracker();
    const entry = tracker.record(1, 'bug', 'null reference in auth handler', 'task-1');

    expect(entry.id).toBeDefined();
    expect(entry.rule).toBe(1);
    expect(entry.type).toBe('bug');
    expect(entry.description).toBe('null reference in auth handler');
    expect(entry.taskId).toBe('task-1');
    expect(entry.timestamp).toBeDefined();
    expect(entry.autoFixed).toBe(true);
    expect(entry.attemptCount).toBe(1);
  });

  it('increments attempt count per task', () => {
    const tracker = createDeviationTracker();

    const e1 = tracker.record(1, 'bug', 'error 1', 'task-1');
    const e2 = tracker.record(2, 'critical', 'missing feature', 'task-1');
    const e3 = tracker.record(3, 'blocking', 'build failure', 'task-1');

    expect(e1.attemptCount).toBe(1);
    expect(e2.attemptCount).toBe(2);
    expect(e3.attemptCount).toBe(3);
  });

  it('tracks attempts independently per task', () => {
    const tracker = createDeviationTracker();

    tracker.record(1, 'bug', 'error in task 1', 'task-1');
    const e2 = tracker.record(1, 'bug', 'error in task 2', 'task-2');

    expect(e2.attemptCount).toBe(1); // different task
  });

  it('marks Rule 4 entries as not auto-fixed', () => {
    const tracker = createDeviationTracker();
    const entry = tracker.record(4, 'architecture', 'need to restructure', 'task-1');

    expect(entry.autoFixed).toBe(false);
  });

  it('marks Rules 1-3 entries as auto-fixed', () => {
    const tracker = createDeviationTracker();

    for (const rule of [1, 2, 3] as DeviationRule[]) {
      const entry = tracker.record(rule, 'test', 'test', `task-${rule}`);
      expect(entry.autoFixed).toBe(true);
    }
  });

  it('generates unique IDs', () => {
    const tracker = createDeviationTracker();
    const e1 = tracker.record(1, 'bug', 'error 1', 'task-1');
    const e2 = tracker.record(1, 'bug', 'error 2', 'task-1');

    expect(e1.id).not.toBe(e2.id);
  });
});

// ---------------------------------------------------------------------------
// getByTask
// ---------------------------------------------------------------------------

describe('getByTask', () => {
  it('returns entries for specific task', () => {
    const tracker = createDeviationTracker();
    tracker.record(1, 'bug', 'error 1', 'task-1');
    tracker.record(2, 'critical', 'missing', 'task-2');
    tracker.record(1, 'bug', 'error 2', 'task-1');

    const result = tracker.getByTask('task-1');
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.taskId === 'task-1')).toBe(true);
  });

  it('returns empty array for unknown task', () => {
    const tracker = createDeviationTracker();
    expect(tracker.getByTask('unknown')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getByRule
// ---------------------------------------------------------------------------

describe('getByRule', () => {
  it('returns entries for specific rule', () => {
    const tracker = createDeviationTracker();
    tracker.record(1, 'bug', 'error 1', 'task-1');
    tracker.record(2, 'critical', 'missing', 'task-1');
    tracker.record(1, 'bug', 'error 2', 'task-2');

    const result = tracker.getByRule(1);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.rule === 1)).toBe(true);
  });

  it('returns empty array for rule with no entries', () => {
    const tracker = createDeviationTracker();
    tracker.record(1, 'bug', 'error', 'task-1');

    expect(tracker.getByRule(4)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getAll
// ---------------------------------------------------------------------------

describe('getAll', () => {
  it('returns all entries', () => {
    const tracker = createDeviationTracker();
    tracker.record(1, 'bug', 'error 1', 'task-1');
    tracker.record(2, 'critical', 'missing', 'task-2');

    expect(tracker.getAll()).toHaveLength(2);
  });

  it('returns a copy (not the internal array)', () => {
    const tracker = createDeviationTracker();
    tracker.record(1, 'bug', 'error', 'task-1');

    const all = tracker.getAll();
    all.push({} as DeviationEntry);

    expect(tracker.getAll()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// shouldStop
// ---------------------------------------------------------------------------

describe('shouldStop', () => {
  it('returns stop=false initially', () => {
    const tracker = createDeviationTracker();
    const result = tracker.shouldStop('task-1');

    expect(result.stop).toBe(false);
    expect(result.reason).toBe('');
  });

  it('returns stop=true for Rule 4 deviation', () => {
    const tracker = createDeviationTracker();
    tracker.record(4, 'architecture', 'restructure needed', 'task-1');

    const result = tracker.shouldStop('task-1');
    expect(result.stop).toBe(true);
    expect(result.reason).toContain('Rule 4');
  });

  it('returns stop=false for 1-2 auto-fix attempts', () => {
    const tracker = createDeviationTracker();
    tracker.record(1, 'bug', 'error 1', 'task-1');
    tracker.record(2, 'critical', 'missing', 'task-1');

    const result = tracker.shouldStop('task-1');
    expect(result.stop).toBe(false);
  });

  it('returns stop=true after 3 auto-fix attempts', () => {
    const tracker = createDeviationTracker();
    tracker.record(1, 'bug', 'error 1', 'task-1');
    tracker.record(2, 'critical', 'missing', 'task-1');
    tracker.record(3, 'blocking', 'build failure', 'task-1');

    const result = tracker.shouldStop('task-1');
    expect(result.stop).toBe(true);
    expect(result.reason).toContain('Auto-fix limit');
  });

  it('tracks attempts per task independently', () => {
    const tracker = createDeviationTracker();
    tracker.record(1, 'bug', 'error', 'task-1');
    tracker.record(1, 'bug', 'error', 'task-1');
    tracker.record(1, 'bug', 'error', 'task-1');

    // task-1 should stop
    expect(tracker.shouldStop('task-1').stop).toBe(true);
    // task-2 should not
    expect(tracker.shouldStop('task-2').stop).toBe(false);
  });

  it('prioritizes Rule 4 over auto-fix count', () => {
    const tracker = createDeviationTracker();
    tracker.record(4, 'architecture', 'restructure', 'task-1');

    const result = tracker.shouldStop('task-1');
    expect(result.stop).toBe(true);
    expect(result.reason).toContain('Rule 4');
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe('clear', () => {
  it('removes all entries', () => {
    const tracker = createDeviationTracker();
    tracker.record(1, 'bug', 'error', 'task-1');
    tracker.record(2, 'critical', 'missing', 'task-2');

    tracker.clear();
    expect(tracker.getAll()).toHaveLength(0);
  });

  it('resets shouldStop state', () => {
    const tracker = createDeviationTracker();
    tracker.record(4, 'architecture', 'restructure', 'task-1');
    expect(tracker.shouldStop('task-1').stop).toBe(true);

    tracker.clear();
    expect(tracker.shouldStop('task-1').stop).toBe(false);
  });
});
