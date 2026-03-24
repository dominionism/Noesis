/**
 * Tests for Learning Loop — Structured Failure Diagnosis
 *
 * Covers:
 * - captureLesson: lesson memory creation, learning event recording, causal edges
 * - getLearningEventsByClass: querying by failure class
 * - getRecentLearningEvents: querying with/without project filter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  captureLesson,
  getLearningEventsByClass,
  getRecentLearningEvents,
  type FailureReport,
} from '../../intelligence/learning-loop.js';
import { createMemory } from '../../core/memory-crud.js';

let db: DatabaseConnection;
let tmpDir: string;

function stubSign(_input: {
  id: string;
  type: string;
  title: string;
  content: string;
  project_id: string | null;
}): string {
  return 'test-signature-' + _input.id;
}

function makeMemory(db: DatabaseConnection, overrides: Record<string, unknown> = {}) {
  return createMemory(db, {
    type: 'task',
    title: 'Test memory',
    content: 'Test content',
    tags: ['test'],
    source: 'test',
    signature: 'test-sig',
    ...overrides,
  } as any);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'noesis-ll-test-'));
  db = DatabaseConnection.create(join(tmpDir, 'test.db'));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('captureLesson', () => {
  it('creates a lesson memory with structured content', () => {
    const report: FailureReport = {
      description: 'Forgot to validate input before database insert',
      rootCause: 'No input validation layer existed',
      preventionRule: 'Always validate input at the boundary before passing to the data layer',
      triggerType: 'user_correction',
      failureClass: 'logic_error',
      tags: ['validation', 'input'],
    };

    const result = captureLesson(db, report, stubSign);

    expect(result.lessonMemory).toBeDefined();
    expect(result.lessonMemory.type).toBe('lesson');
    expect(result.lessonMemory.title).toContain('Lesson:');
    expect(result.lessonMemory.title).toContain('Forgot to validate');
    expect(result.lessonMemory.content).toContain('## Failure');
    expect(result.lessonMemory.content).toContain('## Root Cause');
    expect(result.lessonMemory.content).toContain('## Prevention');
    expect(result.lessonMemory.content).toContain(report.description);
    expect(result.lessonMemory.content).toContain(report.rootCause);
    expect(result.lessonMemory.content).toContain(report.preventionRule);
    expect(result.lessonMemory.source).toBe('learning_loop');
    expect(result.lessonMemory.scope).toBe('project');
    expect(result.lessonMemory.sensitivity).toBe('INTERNAL');
    expect(result.lessonMemory.confidence).toBe(0.5);
  });

  it('records a learning event with correct fields', () => {
    const report: FailureReport = {
      description: 'SQL injection in search endpoint',
      rootCause: 'String concatenation in SQL query',
      preventionRule: 'Use parameterized queries exclusively',
      triggerType: 'eval_failure',
      failureClass: 'security_gap',
    };

    const result = captureLesson(db, report, stubSign);

    expect(result.learningEvent).toBeDefined();
    expect(result.learningEvent.trigger_type).toBe('eval_failure');
    expect(result.learningEvent.failure_class).toBe('security_gap');
    expect(result.learningEvent.root_cause).toBe(report.rootCause);
    expect(result.learningEvent.prevention_rule).toBe(report.preventionRule);
    expect(result.learningEvent.confidence).toBe(0.5);
    expect(result.learningEvent.memory_id).toBe(result.lessonMemory.id);
  });

  it('creates causal edges when causalChainIds has 2+ entries', () => {
    // Create endpoint memories that the causal chain references
    const mem1 = makeMemory(db);
    const mem2 = makeMemory(db);
    const mem3 = makeMemory(db);

    const report: FailureReport = {
      description: 'Cascading failure from config to deploy',
      rootCause: 'Config change propagated incorrectly',
      preventionRule: 'Validate config changes in staging first',
      triggerType: 'critic_rejection',
      causalChainIds: [mem1.id, mem2.id, mem3.id],
    };

    const result = captureLesson(db, report, stubSign);

    // 2 causal edges (mem1->mem2, mem2->mem3) + 3 corrects edges (lesson->mem1, lesson->mem2, lesson->mem3)
    expect(result.causalEdgesCreated).toBe(5);
  });

  it('creates corrects edges from lesson to each memory in causal chain', () => {
    const mem1 = makeMemory(db);

    const report: FailureReport = {
      description: 'Single memory failure',
      rootCause: 'Bad assumption',
      preventionRule: 'Verify assumptions',
      triggerType: 'manual',
      causalChainIds: [mem1.id],
    };

    const result = captureLesson(db, report, stubSign);

    // No causal edges (need 2+ for causes chain), but 1 corrects edge
    expect(result.causalEdgesCreated).toBe(1);
  });

  it('handles empty causalChainIds gracefully', () => {
    const report: FailureReport = {
      description: 'Standalone failure',
      rootCause: 'Unknown',
      preventionRule: 'Investigate further',
      triggerType: 'manual',
      causalChainIds: [],
    };

    const result = captureLesson(db, report, stubSign);
    expect(result.causalEdgesCreated).toBe(0);
  });

  it('handles undefined causalChainIds gracefully', () => {
    const report: FailureReport = {
      description: 'No chain provided',
      rootCause: 'Root cause',
      preventionRule: 'Prevention rule',
      triggerType: 'repeated_failure',
    };

    const result = captureLesson(db, report, stubSign);
    expect(result.causalEdgesCreated).toBe(0);
    expect(result.learningEvent.causal_chain).toBeNull();
  });

  it('stores causal chain as JSON in learning event', () => {
    const mem1 = makeMemory(db);
    const mem2 = makeMemory(db);

    const report: FailureReport = {
      description: 'Chain test',
      rootCause: 'Chain root cause',
      preventionRule: 'Chain prevention',
      triggerType: 'user_correction',
      causalChainIds: [mem1.id, mem2.id],
    };

    const result = captureLesson(db, report, stubSign);
    const parsed = JSON.parse(result.learningEvent.causal_chain!);
    expect(parsed).toEqual([mem1.id, mem2.id]);
  });

  it('uses default tags when none provided', () => {
    const report: FailureReport = {
      description: 'No tags test',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
    };

    const result = captureLesson(db, report, stubSign);
    const tags = JSON.parse(result.lessonMemory.tags);
    expect(tags).toEqual(['lesson', 'failure-analysis']);
  });

  it('uses custom tags when provided', () => {
    const report: FailureReport = {
      description: 'Custom tags test',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
      tags: ['security', 'auth'],
    };

    const result = captureLesson(db, report, stubSign);
    const tags = JSON.parse(result.lessonMemory.tags);
    expect(tags).toEqual(['security', 'auth']);
  });

  it('associates lesson with project when projectId is provided', () => {
    const report: FailureReport = {
      description: 'Project scoped failure',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
      projectId: 'proj-123',
    };

    const result = captureLesson(db, report, stubSign);
    expect(result.lessonMemory.project_id).toBe('proj-123');
    expect(result.learningEvent.project_id).toBe('proj-123');
  });

  it('truncates long descriptions in title to 80 chars', () => {
    const longDesc = 'A'.repeat(200);
    const report: FailureReport = {
      description: longDesc,
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
    };

    const result = captureLesson(db, report, stubSign);
    // Title format: "Lesson: " + first 80 chars of description
    expect(result.lessonMemory.title).toBe(`Lesson: ${'A'.repeat(80)}`);
  });

  it('skips edge creation gracefully when endpoint memories do not exist', () => {
    const report: FailureReport = {
      description: 'Missing endpoints',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
      causalChainIds: ['nonexistent-1', 'nonexistent-2'],
    };

    // Should not throw — edge creation failures are caught silently
    const result = captureLesson(db, report, stubSign);
    // Edges may fail since endpoints don't exist, so count could be 0
    expect(result.causalEdgesCreated).toBe(0);
  });
});

describe('getLearningEventsByClass', () => {
  it('returns events filtered by failure class', () => {
    captureLesson(db, {
      description: 'Logic error 1',
      rootCause: 'Bad logic',
      preventionRule: 'Fix logic',
      triggerType: 'manual',
      failureClass: 'logic_error',
    }, stubSign);

    captureLesson(db, {
      description: 'Logic error 2',
      rootCause: 'More bad logic',
      preventionRule: 'Fix more logic',
      triggerType: 'manual',
      failureClass: 'logic_error',
    }, stubSign);

    captureLesson(db, {
      description: 'Security gap',
      rootCause: 'Missing auth',
      preventionRule: 'Add auth',
      triggerType: 'manual',
      failureClass: 'security_gap',
    }, stubSign);

    const logicErrors = getLearningEventsByClass(db, 'logic_error');
    expect(logicErrors).toHaveLength(2);
    logicErrors.forEach((e) => expect(e.failure_class).toBe('logic_error'));

    const securityGaps = getLearningEventsByClass(db, 'security_gap');
    expect(securityGaps).toHaveLength(1);
  });

  it('returns empty array when no events match', () => {
    const result = getLearningEventsByClass(db, 'nonexistent_class');
    expect(result).toEqual([]);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      captureLesson(db, {
        description: `Error ${i}`,
        rootCause: 'Root',
        preventionRule: 'Prevention',
        triggerType: 'manual',
        failureClass: 'logic_error',
      }, stubSign);
    }

    const limited = getLearningEventsByClass(db, 'logic_error', 3);
    expect(limited).toHaveLength(3);
  });

  it('orders by created_at DESC', () => {
    captureLesson(db, {
      description: 'First',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
      failureClass: 'logic_error',
    }, stubSign);

    captureLesson(db, {
      description: 'Second',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
      failureClass: 'logic_error',
    }, stubSign);

    const events = getLearningEventsByClass(db, 'logic_error');
    // Most recent first
    expect(events[0].created_at >= events[1].created_at).toBe(true);
  });
});

describe('getRecentLearningEvents', () => {
  it('returns all recent events when no projectId', () => {
    captureLesson(db, {
      description: 'Event 1',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
    }, stubSign);

    captureLesson(db, {
      description: 'Event 2',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
    }, stubSign);

    const events = getRecentLearningEvents(db);
    expect(events).toHaveLength(2);
  });

  it('filters by project when projectId is provided', () => {
    captureLesson(db, {
      description: 'Project A event',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
      projectId: 'proj-a',
    }, stubSign);

    captureLesson(db, {
      description: 'Project B event',
      rootCause: 'Root',
      preventionRule: 'Prevention',
      triggerType: 'manual',
      projectId: 'proj-b',
    }, stubSign);

    const eventsA = getRecentLearningEvents(db, 'proj-a');
    expect(eventsA).toHaveLength(1);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      captureLesson(db, {
        description: `Event ${i}`,
        rootCause: 'Root',
        preventionRule: 'Prevention',
        triggerType: 'manual',
      }, stubSign);
    }

    const limited = getRecentLearningEvents(db, undefined, 2);
    expect(limited).toHaveLength(2);
  });

  it('returns empty array when no events exist', () => {
    const events = getRecentLearningEvents(db);
    expect(events).toEqual([]);
  });
});
