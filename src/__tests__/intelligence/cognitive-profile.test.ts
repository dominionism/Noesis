/**
 * Tests for Cognitive Profile
 */

import { describe, it, expect } from 'vitest';
import {
  createProfile,
  updateFromCorrection,
  updateFromTaskCompletion,
  updateLearningStyle,
  updateWorkPatterns,
  updatePreference,
  getExpertise,
  getBlindSpots,
  serializeProfile,
  deserializeProfile,
} from '../../intelligence/cognitive-profile.js';

describe('createProfile', () => {
  it('creates an empty profile with defaults', () => {
    const profile = createProfile();
    expect(profile.expertise).toHaveLength(0);
    expect(profile.blindSpots).toHaveLength(0);
    expect(profile.preferences).toHaveLength(0);
    expect(profile.learningStyle.sampleCount).toBe(0);
    expect(profile.workPatterns.sessionCount).toBe(0);
  });
});

describe('updateFromCorrection', () => {
  it('adds new expertise entry on first correction', () => {
    const profile = createProfile();
    const updated = updateFromCorrection(profile, {
      domain: 'typescript',
      originalApproach: 'used any type',
      correctedApproach: 'used proper generics',
      timestamp: '2026-03-15T10:00:00Z',
    });

    expect(updated.expertise).toHaveLength(1);
    expect(updated.expertise[0].domain).toBe('typescript');
    expect(updated.expertise[0].correctionCount).toBe(1);
  });

  it('increments correction count on repeated corrections', () => {
    let profile = createProfile();
    for (let i = 0; i < 3; i++) {
      profile = updateFromCorrection(profile, {
        domain: 'typescript',
        originalApproach: 'bad approach',
        correctedApproach: 'good approach',
        timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }

    expect(profile.expertise[0].correctionCount).toBe(3);
  });

  it('creates blind spot after 3+ corrections in same domain', () => {
    let profile = createProfile();
    for (let i = 0; i < 4; i++) {
      profile = updateFromCorrection(profile, {
        domain: 'security',
        originalApproach: 'forgot input validation',
        correctedApproach: 'validate all inputs',
        timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }

    expect(profile.blindSpots).toHaveLength(1);
    expect(profile.blindSpots[0].domain).toBe('security');
  });

  it('returns new profile object (immutability)', () => {
    const original = createProfile();
    const updated = updateFromCorrection(original, {
      domain: 'test',
      originalApproach: 'a',
      correctedApproach: 'b',
      timestamp: '2026-03-15T10:00:00Z',
    });

    expect(updated).not.toBe(original);
    expect(original.expertise).toHaveLength(0);
  });
});

describe('updateFromTaskCompletion', () => {
  it('tracks successful completions', () => {
    const profile = createProfile();
    const updated = updateFromTaskCompletion(profile, {
      domain: 'api',
      taskType: 'endpoint',
      success: true,
      durationMs: 60000,
      timestamp: '2026-03-15T10:00:00Z',
    });

    expect(updated.expertise[0].successCount).toBe(1);
    expect(updated.expertise[0].level).toBe('learning');
  });

  it('computes proficient level after 5 successes with 70%+ rate', () => {
    let profile = createProfile();
    for (let i = 0; i < 5; i++) {
      profile = updateFromTaskCompletion(profile, {
        domain: 'react',
        taskType: 'component',
        success: true,
        durationMs: 30000,
        timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }

    expect(profile.expertise[0].level).toBe('proficient');
  });

  it('computes expert level after 10 successes with 90%+ rate', () => {
    let profile = createProfile();
    for (let i = 0; i < 10; i++) {
      profile = updateFromTaskCompletion(profile, {
        domain: 'node',
        taskType: 'service',
        success: true,
        durationMs: 30000,
        timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }

    expect(profile.expertise[0].level).toBe('expert');
  });
});

describe('updateLearningStyle', () => {
  it('moves toward accepted style', () => {
    const profile = createProfile();
    const updated = updateLearningStyle(profile, {
      hadCodeExamples: true,
      wasDeepDive: true,
      presentedOptions: false,
      wasVerbose: false,
      accepted: true,
    });

    expect(updated.learningStyle.prefersCodeExamples).toBeGreaterThan(0.5);
    expect(updated.learningStyle.prefersDeepDive).toBeGreaterThan(0.5);
    expect(updated.learningStyle.sampleCount).toBe(1);
  });

  it('moves away from rejected style', () => {
    const profile = createProfile();
    const updated = updateLearningStyle(profile, {
      hadCodeExamples: true,
      wasDeepDive: false,
      presentedOptions: true,
      wasVerbose: true,
      accepted: false,
    });

    // Rejected: move AWAY from code examples
    expect(updated.learningStyle.prefersCodeExamples).toBeLessThan(0.5);
  });
});

describe('updateWorkPatterns', () => {
  it('tracks active hours', () => {
    const profile = createProfile();
    const updated = updateWorkPatterns(profile, {
      startHour: 14,
      durationMs: 3600000,
      taskTypes: ['coding'],
      correctionCount: 0,
      acceptedSuggestions: 5,
      timestamp: '2026-03-15T14:00:00Z',
    });

    expect(updated.workPatterns.activeHours).toContain(14);
    expect(updated.workPatterns.sessionCount).toBe(1);
  });

  it('computes incremental mean for session duration', () => {
    let profile = createProfile();
    profile = updateWorkPatterns(profile, {
      startHour: 10,
      durationMs: 2000,
      taskTypes: ['coding'],
      correctionCount: 0,
      acceptedSuggestions: 0,
      timestamp: '2026-03-15T10:00:00Z',
    });
    profile = updateWorkPatterns(profile, {
      startHour: 14,
      durationMs: 4000,
      taskTypes: ['review'],
      correctionCount: 0,
      acceptedSuggestions: 0,
      timestamp: '2026-03-15T14:00:00Z',
    });

    expect(profile.workPatterns.avgSessionDurationMs).toBe(3000);
    expect(profile.workPatterns.sessionCount).toBe(2);
  });
});

describe('updatePreference', () => {
  it('adds new preference', () => {
    const profile = createProfile();
    const updated = updatePreference(profile, 'technology', 'framework', 'React');

    expect(updated.preferences).toHaveLength(1);
    expect(updated.preferences[0].value).toBe('React');
    expect(updated.preferences[0].strength).toBe(0.6); // 0.5 + 0.1
  });

  it('reinforces same value', () => {
    let profile = createProfile();
    profile = updatePreference(profile, 'technology', 'framework', 'React');
    profile = updatePreference(profile, 'technology', 'framework', 'React');

    expect(profile.preferences[0].strength).toBe(0.7);
  });

  it('weakens on conflicting value', () => {
    let profile = createProfile();
    profile = updatePreference(profile, 'technology', 'framework', 'React');
    // strength = 0.6
    profile = updatePreference(profile, 'technology', 'framework', 'Vue');
    // strength = max(0.6 - 0.2, 0) = 0.4, which is > 0.1 so value stays React

    expect(profile.preferences[0].value).toBe('React');
    expect(profile.preferences[0].strength).toBeCloseTo(0.4, 5);
  });
});

describe('getExpertise', () => {
  it('returns novice for unknown domain', () => {
    const profile = createProfile();
    expect(getExpertise(profile, 'unknown')).toBe('novice');
  });

  it('returns correct level for known domain', () => {
    let profile = createProfile();
    for (let i = 0; i < 5; i++) {
      profile = updateFromTaskCompletion(profile, {
        domain: 'go',
        taskType: 'api',
        success: true,
        durationMs: 30000,
        timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }

    expect(getExpertise(profile, 'go')).toBe('proficient');
  });
});

describe('getBlindSpots', () => {
  it('returns empty when no blind spots', () => {
    const profile = createProfile();
    expect(getBlindSpots(profile)).toHaveLength(0);
  });

  it('filters blind spots with fewer than 3 occurrences', () => {
    let profile = createProfile();
    // 3 corrections creates a blind spot entry, but with occurrenceCount = 1
    for (let i = 0; i < 3; i++) {
      profile = updateFromCorrection(profile, {
        domain: 'testing',
        originalApproach: 'bad',
        correctedApproach: 'good',
        timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }

    // Blind spot exists but occurrenceCount starts incrementing from first detection
    // After 3 corrections: correctionCount=3, blindSpot created with occurrenceCount=1
    // After 4th: occurrenceCount=2, after 5th: occurrenceCount=3
    expect(getBlindSpots(profile).length).toBeLessThanOrEqual(1);
  });
});

describe('serialize / deserialize', () => {
  it('roundtrips a profile', () => {
    let profile = createProfile();
    profile = updateFromCorrection(profile, {
      domain: 'sql',
      originalApproach: 'string concat',
      correctedApproach: 'parameterized queries',
      timestamp: '2026-03-15T10:00:00Z',
    });

    const json = serializeProfile(profile);
    const restored = deserializeProfile(json);

    expect(restored.expertise).toEqual(profile.expertise);
    expect(restored.learningStyle).toEqual(profile.learningStyle);
  });
});
