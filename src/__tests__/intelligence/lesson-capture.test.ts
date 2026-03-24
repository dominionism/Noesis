/**
 * Tests for Evidence-Backed Lesson Capture (Loop 5)
 *
 * Covers:
 * - classifyFailure: keyword matching, confidence scaling, default fallback
 * - captureLesson: lesson structure, edge creation, systemic detection
 * - detectSystemicPattern: threshold detection, no-pattern case
 * - mirrorToHotMemory: path and content generation
 */

import { describe, it, expect } from 'vitest';
import {
  classifyFailure,
  captureLesson,
  detectSystemicPattern,
  mirrorToHotMemory,
  type LessonTrigger,
  type LessonOutput,
} from '../../intelligence/lesson-capture.js';

// ===========================================================================
// classifyFailure
// ===========================================================================

describe('classifyFailure', () => {
  it('classifies context_assembly failures from keyword matches', () => {
    const trigger: LessonTrigger = {
      type: 'correction',
      description: 'The wrong file was loaded',
      evidence: ['wrong context was assembled'],
      context: 'Working on refactor task',
    };

    const result = classifyFailure(trigger);
    expect(result.failureClass).toBe('context_assembly');
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.rootCause).toContain('context assembly');
  });

  it('classifies planning failures', () => {
    const trigger: LessonTrigger = {
      type: 'eval_failure',
      description: 'Incomplete plan that missed step and overlooked edge case',
      evidence: ['missing edge case for empty input'],
      context: 'Building API endpoint',
    };

    const result = classifyFailure(trigger);
    expect(result.failureClass).toBe('planning');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('classifies tool_use failures', () => {
    const trigger: LessonTrigger = {
      type: 'correction',
      description: 'Used wrong tool for the job',
      evidence: ['wrong parameter passed to API'],
      context: 'Integrating external service',
    };

    const result = classifyFailure(trigger);
    expect(result.failureClass).toBe('tool_use');
  });

  it('classifies verification failures', () => {
    const trigger: LessonTrigger = {
      type: 'eval_failure',
      description: 'Test missed a case',
      evidence: ['incomplete coverage of edge cases', 'missing test'],
      context: 'Running test suite',
    };

    const result = classifyFailure(trigger);
    expect(result.failureClass).toBe('verification');
  });

  it('classifies creative failures', () => {
    const trigger: LessonTrigger = {
      type: 'critic_rejection',
      description: 'Output was too vague and generic',
      evidence: ['not specific enough for the project'],
      context: 'Writing documentation',
    };

    const result = classifyFailure(trigger);
    expect(result.failureClass).toBe('creative');
  });

  it('classifies api_contract failures', () => {
    const trigger: LessonTrigger = {
      type: 'eval_failure',
      description: 'Schema mismatch in API response',
      evidence: ['wrong endpoint was called', 'api error returned 500'],
      context: 'Calling backend service',
    };

    const result = classifyFailure(trigger);
    expect(result.failureClass).toBe('api_contract');
  });

  it('defaults to planning with low confidence when no keywords match', () => {
    const trigger: LessonTrigger = {
      type: 'correction',
      description: 'Something went sideways',
      evidence: ['unclear what happened'],
      context: 'Doing stuff',
    };

    const result = classifyFailure(trigger);
    expect(result.failureClass).toBe('planning');
    expect(result.confidence).toBe(0.3);
    expect(result.rootCause).toContain('Unclassified');
  });

  it('increases confidence with more keyword matches', () => {
    const lowMatch: LessonTrigger = {
      type: 'correction',
      description: 'wrong file',
      evidence: [],
      context: '',
    };

    const highMatch: LessonTrigger = {
      type: 'correction',
      description: 'wrong context missing context wrong file not loaded context missing',
      evidence: ['failed to load'],
      context: '',
    };

    const lowResult = classifyFailure(lowMatch);
    const highResult = classifyFailure(highMatch);

    expect(highResult.confidence).toBeGreaterThan(lowResult.confidence);
  });

  it('caps confidence at 0.95', () => {
    const trigger: LessonTrigger = {
      type: 'correction',
      description: 'wrong context missing context wrong file not loaded context missing failed to load',
      evidence: ['wrong context wrong file not loaded missing context failed to load context missing'],
      context: 'wrong context wrong file not loaded missing context failed to load context missing',
    };

    const result = classifyFailure(trigger);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it('generates a reusable rule', () => {
    const trigger: LessonTrigger = {
      type: 'correction',
      description: 'wrong tool used',
      evidence: [],
      context: '',
    };

    const result = classifyFailure(trigger);
    expect(result.reusableRule).toBeTruthy();
    expect(result.reusableRule).toContain('Triggered by: correction');
  });
});

// ===========================================================================
// captureLesson
// ===========================================================================

describe('captureLesson', () => {
  it('creates a lesson with valid structure', () => {
    const trigger: LessonTrigger = {
      type: 'correction',
      description: 'Used wrong tool for the job',
      evidence: ['wrong parameter in API call'],
      context: 'Integrating service',
    };

    const output = captureLesson(trigger);

    expect(output.lesson.id).toBeTruthy();
    expect(output.lesson.title).toContain('Lesson:');
    expect(output.lesson.content).toContain('Root Cause');
    expect(output.lesson.content).toContain('Evidence');
    expect(output.lesson.content).toContain('Reusable Rule');
    expect(output.lesson.content).toContain('Context');
    expect(output.lesson.failureClass).toBeTruthy();
    expect(output.lesson.confidence).toBeGreaterThan(0);
    expect(output.lesson.rootCause).toBeTruthy();
    expect(output.lesson.reusableRule).toBeTruthy();
  });

  it('creates edges to originating task when provided', () => {
    const trigger: LessonTrigger = {
      type: 'eval_failure',
      description: 'Test missed edge case',
      evidence: ['missing test for null input'],
      context: 'Testing',
      originatingTaskId: 'TASK_123',
    };

    const output = captureLesson(trigger);
    expect(output.edges).toHaveLength(1);
    expect(output.edges[0].from).toBe(output.lesson.id);
    expect(output.edges[0].to).toBe('TASK_123');
    expect(output.edges[0].relation).toBe('corrects');
  });

  it('creates no edges when originatingTaskId is absent', () => {
    const trigger: LessonTrigger = {
      type: 'correction',
      description: 'Generic mistake',
      evidence: [],
      context: 'Working',
    };

    const output = captureLesson(trigger);
    expect(output.edges).toHaveLength(0);
  });

  it('marks repeated_miss triggers as systemic', () => {
    const trigger: LessonTrigger = {
      type: 'repeated_miss',
      description: 'Keeps forgetting to validate input',
      evidence: ['third time this happened'],
      context: 'Input handling',
    };

    const output = captureLesson(trigger);
    expect(output.isSystemic).toBe(true);
    expect(output.improvementSuggestion).toBeTruthy();
  });

  it('does not mark non-repeated triggers as systemic', () => {
    const trigger: LessonTrigger = {
      type: 'correction',
      description: 'One-off mistake',
      evidence: [],
      context: '',
    };

    const output = captureLesson(trigger);
    expect(output.isSystemic).toBe(false);
    expect(output.improvementSuggestion).toBeUndefined();
  });

  it('truncates long root causes in the title', () => {
    const trigger: LessonTrigger = {
      type: 'correction',
      description: 'A'.repeat(200),
      evidence: [],
      context: '',
    };

    const output = captureLesson(trigger);
    // Title should be "Lesson: " + at most 80 chars of root cause
    expect(output.lesson.title.length).toBeLessThanOrEqual(100);
  });
});

// ===========================================================================
// detectSystemicPattern
// ===========================================================================

describe('detectSystemicPattern', () => {
  function makeLessonWithClass(failureClass: string, count: number): LessonOutput[] {
    const lessons: LessonOutput[] = [];
    for (let i = 0; i < count; i++) {
      lessons.push({
        lesson: {
          id: `L${i}`,
          title: `Lesson ${i}`,
          content: 'content',
          failureClass: failureClass as LessonOutput['lesson']['failureClass'],
          rootCause: 'some cause',
          reusableRule: 'some rule',
          confidence: 0.5,
        },
        edges: [],
        isSystemic: false,
      });
    }
    return lessons;
  }

  it('detects systemic pattern when 3+ lessons share the same failure class', () => {
    const lessons = makeLessonWithClass('tool_use', 3);
    const result = detectSystemicPattern(lessons);

    expect(result.isSystemic).toBe(true);
    expect(result.pattern).toContain('tool use');
    expect(result.pattern).toContain('3');
    expect(result.suggestion).toBeTruthy();
  });

  it('does not detect systemic pattern below threshold', () => {
    const lessons = makeLessonWithClass('planning', 2);
    const result = detectSystemicPattern(lessons);

    expect(result.isSystemic).toBe(false);
    expect(result.pattern).toBe('No systemic pattern detected');
    expect(result.suggestion).toBe('');
  });

  it('identifies the dominant failure class across mixed lessons', () => {
    const lessons = [
      ...makeLessonWithClass('verification', 4),
      ...makeLessonWithClass('planning', 2),
      ...makeLessonWithClass('tool_use', 1),
    ];

    const result = detectSystemicPattern(lessons);
    expect(result.isSystemic).toBe(true);
    expect(result.pattern).toContain('verification');
    expect(result.pattern).toContain('4');
  });

  it('handles empty lesson list', () => {
    const result = detectSystemicPattern([]);
    expect(result.isSystemic).toBe(false);
  });
});

// ===========================================================================
// mirrorToHotMemory
// ===========================================================================

describe('mirrorToHotMemory', () => {
  it('generates correct path based on failure class', () => {
    const lesson: LessonOutput = {
      lesson: {
        id: 'L1',
        title: 'Lesson: tool use failure',
        content: 'content',
        failureClass: 'tool_use',
        rootCause: 'Used wrong API',
        reusableRule: 'Check API docs first',
        confidence: 0.7,
      },
      edges: [],
      isSystemic: false,
    };

    const result = mirrorToHotMemory(lesson);
    expect(result.path).toBe('lessons/tool_use.md');
  });

  it('includes title, class, confidence, root cause, and rule in content', () => {
    const lesson: LessonOutput = {
      lesson: {
        id: 'L1',
        title: 'Lesson: planning failure',
        content: 'detailed content',
        failureClass: 'planning',
        rootCause: 'Missed edge case',
        reusableRule: 'Always enumerate edge cases',
        confidence: 0.85,
      },
      edges: [],
      isSystemic: false,
    };

    const result = mirrorToHotMemory(lesson);
    expect(result.content).toContain('Lesson: planning failure');
    expect(result.content).toContain('planning');
    expect(result.content).toContain('0.85');
    expect(result.content).toContain('Missed edge case');
    expect(result.content).toContain('Always enumerate edge cases');
  });
});
