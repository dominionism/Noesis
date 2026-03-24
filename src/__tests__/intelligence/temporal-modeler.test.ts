/**
 * Tests for Temporal Modeler
 */

import { describe, it, expect } from 'vitest';
import {
  getTemporalConfig,
  getAssignedModel,
  computeRelevance,
  computeRelevanceForType,
  linearDecay,
  stepDecay,
  cyclicalRelevance,
} from '../../intelligence/temporal-modeler.js';

describe('getAssignedModel', () => {
  it('assigns step_decay to task memories', () => {
    expect(getAssignedModel('task')).toBe('step_decay');
  });

  it('assigns event_triggered to lesson memories', () => {
    expect(getAssignedModel('lesson')).toBe('event_triggered');
  });

  it('assigns event_triggered to incident memories', () => {
    expect(getAssignedModel('incident')).toBe('event_triggered');
  });

  it('assigns context_dependent to decision memories', () => {
    expect(getAssignedModel('decision')).toBe('context_dependent');
  });

  it('assigns flat (no decay) to preference memories', () => {
    expect(getAssignedModel('preference')).toBe('flat');
  });

  it('assigns step_decay with fast decay to checkpoint', () => {
    const config = getTemporalConfig('checkpoint');
    expect(config.model).toBe('step_decay');
    expect(config.steps![2].days).toBe(30);
    expect(config.steps![2].relevance).toBe(0.1);
  });
});

describe('linearDecay', () => {
  it('returns 1.0 at age 0', () => {
    expect(linearDecay(0, 365)).toBe(1.0);
  });

  it('returns 0.0 at max age', () => {
    expect(linearDecay(365, 365)).toBe(0.0);
  });

  it('returns 0.5 at half max age', () => {
    expect(linearDecay(182.5, 365)).toBeCloseTo(0.5, 1);
  });

  it('returns 0.0 beyond max age', () => {
    expect(linearDecay(500, 365)).toBe(0.0);
  });

  it('returns 1.0 for negative age', () => {
    expect(linearDecay(-1, 365)).toBe(1.0);
  });
});

describe('stepDecay', () => {
  const steps = [
    { days: 7, relevance: 1.0 },
    { days: 30, relevance: 0.9 },
    { days: 90, relevance: 0.8 },
    { days: 365, relevance: 0.7 },
  ];

  it('returns highest relevance within first step', () => {
    expect(stepDecay(3, steps, 0.5)).toBe(1.0);
  });

  it('returns second step relevance after first boundary', () => {
    expect(stepDecay(15, steps, 0.5)).toBe(0.9);
  });

  it('returns fallback beyond all steps', () => {
    expect(stepDecay(400, steps, 0.5)).toBe(0.5);
  });

  it('returns fallback for empty steps', () => {
    expect(stepDecay(10, [], 0.3)).toBe(0.3);
  });
});

describe('cyclicalRelevance', () => {
  it('returns peak at day 0 of cycle', () => {
    const config = { model: 'cyclical' as const, cycleLengthDays: 14, baseRelevance: 0.5, amplitude: 0.3 };
    const relevance = cyclicalRelevance(config, { currentDayOfYear: 0 });
    // cos(0) = 1, so 0.5 + 0.3 * 1 = 0.8
    expect(relevance).toBeCloseTo(0.8, 2);
  });

  it('returns trough at half cycle', () => {
    const config = { model: 'cyclical' as const, cycleLengthDays: 14, baseRelevance: 0.5, amplitude: 0.3 };
    const relevance = cyclicalRelevance(config, { currentDayOfYear: 7 });
    // cos(pi) = -1, so 0.5 + 0.3 * -1 = 0.2
    expect(relevance).toBeCloseTo(0.2, 2);
  });

  it('clamps to 0-1 range', () => {
    const config = { model: 'cyclical' as const, cycleLengthDays: 14, baseRelevance: 0.9, amplitude: 0.5 };
    const relevance = cyclicalRelevance(config, { currentDayOfYear: 0 });
    expect(relevance).toBeLessThanOrEqual(1.0);
  });
});

describe('computeRelevance', () => {
  it('handles flat model (no decay)', () => {
    const config = { model: 'flat' as const, baseRelevance: 1.0 };
    expect(computeRelevance(100, config)).toBe(1.0);
  });

  it('handles event_triggered with recent events', () => {
    const config = getTemporalConfig('lesson');
    const relevance = computeRelevance(60, config, {
      recentEventTypes: ['similar_task_attempted'],
    });
    expect(relevance).toBe(1.0);
  });

  it('handles event_triggered without recent events (falls back to step)', () => {
    const config = getTemporalConfig('lesson');
    const relevance = computeRelevance(60, config);
    // 60 days: between 30 and 90 step boundary -> 0.8
    expect(relevance).toBe(0.8);
  });

  it('handles context_dependent with matching project', () => {
    const config = getTemporalConfig('decision');
    const relevance = computeRelevance(100, config, {
      currentProjectId: 'proj-1',
      memoryProjectId: 'proj-1',
    });
    expect(relevance).toBe(1.0);
  });

  it('handles context_dependent with different project', () => {
    const config = getTemporalConfig('decision');
    const relevance = computeRelevance(100, config, {
      currentProjectId: 'proj-1',
      memoryProjectId: 'proj-2',
    });
    // Falls back to step decay
    expect(relevance).toBeLessThan(1.0);
  });
});

describe('computeRelevanceForType', () => {
  it('preferences never decay', () => {
    expect(computeRelevanceForType('preference', 500)).toBe(1.0);
  });

  it('checkpoints decay fast', () => {
    const relevance = computeRelevanceForType('checkpoint', 20);
    // 20 days: between 14 and 30 -> 0.1
    expect(relevance).toBe(0.1);
  });

  it('tasks use standard step decay', () => {
    const relevance = computeRelevanceForType('task', 5);
    expect(relevance).toBe(1.0);
  });
});
