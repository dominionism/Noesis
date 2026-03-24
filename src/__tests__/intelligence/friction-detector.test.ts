/**
 * Tests for Friction Detector
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeSession,
  detectSilence,
  detectErrorCascade,
  detectRapidCorrections,
  querySimilarity,
  type SessionActivity,
} from '../../intelligence/friction-detector.js';

function makeActivity(overrides?: Partial<SessionActivity>): SessionActivity {
  const now = new Date();
  return {
    corrections: 0,
    queries: [],
    errors: [],
    taskStarted: false,
    taskCompleted: false,
    lastInteractionAt: now.toISOString(),
    startedAt: new Date(now.getTime() - 60000).toISOString(),
    ...overrides,
  };
}

describe('analyzeSession', () => {
  it('returns no signals for clean session', () => {
    const result = analyzeSession(makeActivity());
    expect(result.signals).toHaveLength(0);
    expect(result.overallFriction).toBe('none');
    expect(result.needsIntervention).toBe(false);
  });

  it('detects rapid corrections', () => {
    const result = analyzeSession(makeActivity({ corrections: 4 }));
    const signal = result.signals.find((s) => s.type === 'rapid_corrections');
    expect(signal).toBeDefined();
    expect(signal!.severity).toBe('medium');
  });

  it('detects high severity for 5+ corrections', () => {
    const result = analyzeSession(makeActivity({ corrections: 6 }));
    const signal = result.signals.find((s) => s.type === 'rapid_corrections');
    expect(signal!.severity).toBe('high');
  });

  it('detects error cascades', () => {
    const result = analyzeSession(makeActivity({
      errors: ['err1', 'err2', 'err3', 'err4'],
    }));
    const signal = result.signals.find((s) => s.type === 'error_cascade');
    expect(signal).toBeDefined();
    expect(signal!.metadata.errorCount).toBe(4);
  });

  it('detects task abandonment', () => {
    const now = new Date();
    const result = analyzeSession(makeActivity({
      taskStarted: true,
      taskCompleted: false,
      startedAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
      lastInteractionAt: now.toISOString(),
    }));

    const signal = result.signals.find((s) => s.type === 'task_abandonment');
    expect(signal).toBeDefined();
  });

  it('detects repeated queries', () => {
    const result = analyzeSession(makeActivity({
      queries: [
        'how handle authentication errors',
        'handle authentication errors properly',
        'handle authentication errors again',
        'handle authentication errors now',
      ],
    }));

    const signal = result.signals.find((s) => s.type === 'repeated_query');
    expect(signal).toBeDefined();
  });

  it('sets overall friction to high when 3+ signals', () => {
    const now = new Date();
    const result = analyzeSession(makeActivity({
      corrections: 5,
      errors: ['e1', 'e2', 'e3'],
      taskStarted: true,
      taskCompleted: false,
      startedAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
      lastInteractionAt: now.toISOString(),
    }));

    expect(result.overallFriction).toBe('high');
    expect(result.needsIntervention).toBe(true);
  });

  it('sets needsIntervention when 2+ signals', () => {
    const result = analyzeSession(makeActivity({
      corrections: 3,
      errors: ['e1', 'e2', 'e3'],
    }));

    expect(result.needsIntervention).toBe(true);
  });
});

describe('detectSilence', () => {
  it('returns null for short gaps', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 60000); // 1 minute ago
    expect(detectSilence(recent.toISOString(), now.toISOString())).toBeNull();
  });

  it('returns signal for 10+ minute gap', () => {
    const now = new Date();
    const old = new Date(now.getTime() - 15 * 60 * 1000); // 15 minutes ago
    const signal = detectSilence(old.toISOString(), now.toISOString());
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('long_silence');
    expect(signal!.severity).toBe('medium');
  });

  it('returns high severity for 30+ minute gap', () => {
    const now = new Date();
    const old = new Date(now.getTime() - 35 * 60 * 1000);
    const signal = detectSilence(old.toISOString(), now.toISOString());
    expect(signal!.severity).toBe('high');
  });
});

describe('detectErrorCascade', () => {
  it('returns null for fewer than 3 errors', () => {
    expect(detectErrorCascade(['e1', 'e2'])).toBeNull();
  });

  it('returns signal for 3+ errors', () => {
    const signal = detectErrorCascade(['e1', 'e2', 'e3']);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('error_cascade');
  });

  it('returns high severity for 5+ errors', () => {
    const signal = detectErrorCascade(['e1', 'e2', 'e3', 'e4', 'e5']);
    expect(signal!.severity).toBe('high');
  });
});

describe('detectRapidCorrections', () => {
  it('returns null below threshold', () => {
    expect(detectRapidCorrections(2)).toBeNull();
  });

  it('returns signal at threshold', () => {
    const signal = detectRapidCorrections(3);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('rapid_corrections');
  });
});

describe('querySimilarity', () => {
  it('returns 1.0 for identical queries', () => {
    expect(querySimilarity('how to auth', 'how to auth')).toBe(1.0);
  });

  it('returns 0 for completely different queries', () => {
    expect(querySimilarity('deploy kubernetes', 'paint watercolor')).toBe(0);
  });

  it('returns partial similarity for overlapping words', () => {
    const sim = querySimilarity(
      'how to handle authentication',
      'handling authentication in node',
    );
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('returns 0 for empty strings', () => {
    expect(querySimilarity('', '')).toBe(0);
  });
});
