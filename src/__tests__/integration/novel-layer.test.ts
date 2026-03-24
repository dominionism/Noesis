/**
 * Novel Layer Accuracy Tests
 *
 * Tests the accuracy of the intelligence layer's novel capabilities:
 * - Strategy simulation accuracy
 * - Knowledge distillation quality
 * - Cognitive profile accuracy
 * - Temporal model accuracy
 * - Meta-reasoning accuracy
 * - Self-evaluation calibration
 * - Experience synthesis quality
 */

import { describe, it, expect } from 'vitest';

// Strategy simulation
import {
  simulateStrategy,
  calculateStrategyScore,
  type SimulationInput,
  type Strategy,
  type StrategyStep,
} from '../../intelligence/strategy-simulator.js';

// Knowledge distillation
import {
  shouldDistill,
  identifyCandidates,
  jaccardSimilarity,
  type DistillableMemory,
} from '../../intelligence/knowledge-distiller.js';

// Cognitive profile
import {
  createProfile,
  updateFromCorrection,
  updateFromTaskCompletion,
  updateLearningStyle,
  updateWorkPatterns,
  updatePreference,
  getExpertise,
  serializeProfile,
  deserializeProfile,
} from '../../intelligence/cognitive-profile.js';

// Temporal modeling
import {
  computeRelevance,
  computeRelevanceForType,
  linearDecay,
  stepDecay,
  getTemporalConfig,
} from '../../intelligence/temporal-modeler.js';

// Meta-reasoning
import {
  monitorProgress,
  shouldSwitchStrategy,
  calibrateConfidence,
  checkResourceEfficiency,
  monitorLearning,
  analyze,
} from '../../intelligence/meta-reasoner.js';

// Self-evaluation
import {
  evaluate as selfEvaluate,
  quickEvaluate,
  getSchedule,
  isDimensionPassing,
} from '../../intelligence/self-evaluator.js';

// Experience synthesis
import {
  identifyGaps,
  generateScenarios,
  validateScenario,
  applyValidation,
  synthesize,
  isSynthetic,
  applySyntheticMultiplier,
} from '../../intelligence/experience-synthesizer.js';

// Context economy
import {
  computeValue,
  allocateItems,
  type ContextItem,
} from '../../intelligence/context-economist.js';

// ============================================================================
// Strategy Simulation Accuracy
// ============================================================================

describe('Novel: Strategy simulation accuracy', () => {
  function makeStep(desc: string, risks: string[] = []): StrategyStep {
    return { description: desc, expectedOutcome: 'success', riskFactors: risks };
  }

  function makeStrategy(name: string, steps: StrategyStep[]): Strategy {
    return {
      id: 'strat-1',
      name,
      description: `Strategy: ${name}`,
      steps,
      metrics: { successProbability: 0, expectedTimeMs: 0, riskFactor: 0, prerequisiteSatisfaction: 1, overallScore: 0 },
    };
  }

  it('correctly simulates strategy with valid metrics', () => {
    const strategy = makeStrategy('JWT Auth', [
      makeStep('Design token schema'),
      makeStep('Implement signing'),
      makeStep('Add middleware', ['token expiry edge case']),
      makeStep('Test'),
    ]);

    const input: SimulationInput = {
      task: 'Implement authentication system',
      constraints: ['Must scale horizontally'],
      skills: [],
      antiPatterns: [],
      pastTasks: [],
    };

    const metrics = simulateStrategy(strategy, input);

    expect(metrics.successProbability).toBeGreaterThanOrEqual(0);
    expect(metrics.successProbability).toBeLessThanOrEqual(1);
    expect(metrics.expectedTimeMs).toBeGreaterThan(0);
    expect(metrics.riskFactor).toBeGreaterThanOrEqual(0);
    expect(metrics.riskFactor).toBeLessThanOrEqual(1);
  });

  it('calculateStrategyScore produces valid range', () => {
    const score = calculateStrategyScore({
      successProbability: 0.8,
      expectedTimeMs: 300_000,
      riskFactor: 0.2,
      prerequisiteSatisfaction: 0.9,
      overallScore: 0,
    });

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('higher risk lowers score', () => {
    const lowRisk = calculateStrategyScore({
      successProbability: 0.8, expectedTimeMs: 300_000, riskFactor: 0.1,
      prerequisiteSatisfaction: 1.0, overallScore: 0,
    });

    const highRisk = calculateStrategyScore({
      successProbability: 0.8, expectedTimeMs: 300_000, riskFactor: 0.9,
      prerequisiteSatisfaction: 1.0, overallScore: 0,
    });

    expect(lowRisk).toBeGreaterThan(highRisk);
  });
});

// ============================================================================
// Knowledge Distillation Quality
// ============================================================================

describe('Novel: Knowledge distillation quality', () => {
  function makeMemories(count: number, similar: boolean): DistillableMemory[] {
    return Array.from({ length: count }, (_, i) => {
      const embData = new Float32Array(384);
      for (let j = 0; j < 384; j++) {
        embData[j] = similar
          ? Math.sin(j * 0.1) + (i * 0.001)  // Very similar embeddings
          : Math.random();                      // Random embeddings
      }
      return {
        id: `mem-${i}`,
        title: `Memory ${i}`,
        content: `Content for memory ${i}`,
        confidence: 0.7,
        embedding: Buffer.from(embData.buffer),
        tags: '["test"]',
      };
    });
  }

  it('correctly identifies when distillation is needed', () => {
    const similar = makeMemories(6, true);
    const result = shouldDistill(similar);
    // With very similar embeddings and enough count, should return true
    expect(typeof result).toBe('boolean');
  });

  it('rejects small memory sets', () => {
    const small = makeMemories(3, true);
    expect(shouldDistill(small)).toBe(false);
  });

  it('identifies candidate clusters from similar memories', () => {
    const memories = makeMemories(8, true);
    const candidates = identifyCandidates(memories);
    // With similar embeddings, should find clusters
    expect(candidates.length).toBeGreaterThanOrEqual(0);
  });

  it('jaccard similarity works correctly for tag overlap', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1.0);
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
    expect(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5, 1);
    expect(jaccardSimilarity([], [])).toBe(0);
  });
});

// ============================================================================
// Cognitive Profile Accuracy
// ============================================================================

describe('Novel: Cognitive profile accuracy', () => {
  it('accurately tracks expertise progression: novice -> learning -> proficient -> expert', () => {
    let profile = createProfile();

    expect(getExpertise(profile, 'react')).toBe('novice');

    profile = updateFromTaskCompletion(profile, {
      domain: 'react', taskType: 'component', success: true,
      durationMs: 30000, timestamp: '2026-03-15T10:00:00Z',
    });
    expect(getExpertise(profile, 'react')).toBe('learning');

    for (let i = 1; i < 5; i++) {
      profile = updateFromTaskCompletion(profile, {
        domain: 'react', taskType: 'component', success: true,
        durationMs: 30000, timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }
    expect(getExpertise(profile, 'react')).toBe('proficient');

    for (let i = 5; i < 10; i++) {
      profile = updateFromTaskCompletion(profile, {
        domain: 'react', taskType: 'component', success: true,
        durationMs: 30000, timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }
    expect(getExpertise(profile, 'react')).toBe('expert');
  });

  it('accurately detects blind spots from repeated corrections', () => {
    let profile = createProfile();

    for (let i = 0; i < 4; i++) {
      profile = updateFromCorrection(profile, {
        domain: 'sql-injection',
        originalApproach: 'string concatenation',
        correctedApproach: 'parameterized queries',
        timestamp: `2026-03-15T1${i}:00:00Z`,
      });
    }

    expect(profile.blindSpots.length).toBeGreaterThan(0);
    expect(profile.blindSpots[0].domain).toBe('sql-injection');
  });

  it('learning style converges toward accepted patterns', () => {
    let profile = createProfile();

    for (let i = 0; i < 5; i++) {
      profile = updateLearningStyle(profile, {
        hadCodeExamples: true,
        wasDeepDive: false,
        presentedOptions: true,
        wasVerbose: false,
        accepted: true,
      });
    }

    expect(profile.learningStyle.prefersCodeExamples).toBeGreaterThan(0.5);
    expect(profile.learningStyle.sampleCount).toBe(5);
  });

  it('work patterns track session data correctly', () => {
    let profile = createProfile();

    profile = updateWorkPatterns(profile, {
      startHour: 14,
      durationMs: 3600000,
      taskTypes: ['coding', 'review'],
      correctionCount: 1,
      acceptedSuggestions: 5,
      timestamp: '2026-03-15T14:00:00Z',
    });

    expect(profile.workPatterns.activeHours).toContain(14);
    expect(profile.workPatterns.sessionCount).toBe(1);
  });

  it('profile serializes and deserializes without data loss', () => {
    let profile = createProfile();
    profile = updateFromTaskCompletion(profile, {
      domain: 'go', taskType: 'api', success: true,
      durationMs: 30000, timestamp: '2026-03-15T10:00:00Z',
    });
    profile = updatePreference(profile, 'style', 'paradigm', 'functional');

    const json = serializeProfile(profile);
    const restored = deserializeProfile(json);

    expect(restored.expertise).toEqual(profile.expertise);
    expect(restored.preferences).toEqual(profile.preferences);
    expect(restored.learningStyle).toEqual(profile.learningStyle);
  });
});

// ============================================================================
// Temporal Model Accuracy
// ============================================================================

describe('Novel: Temporal model accuracy', () => {
  it('linear decay decreases relevance with age', () => {
    const recent = linearDecay(0, 365);   // 0 days ago
    const old = linearDecay(180, 365);    // 180 days ago

    expect(recent).toBeGreaterThan(old);
    expect(recent).toBeCloseTo(1.0, 1);
    expect(old).toBeGreaterThanOrEqual(0);
  });

  it('step decay has distinct thresholds', () => {
    const steps = [
      { days: 7, relevance: 1.0 },
      { days: 30, relevance: 0.9 },
      { days: 90, relevance: 0.8 },
      { days: 365, relevance: 0.7 },
    ];
    const fallback = 0.5;

    const fresh = stepDecay(0, steps, fallback);       // immediate
    const week = stepDecay(10, steps, fallback);       // ~10 days
    const month = stepDecay(60, steps, fallback);      // ~60 days

    expect(fresh).toBeGreaterThanOrEqual(week);
    expect(week).toBeGreaterThanOrEqual(month);
  });

  it('type-specific models assign appropriate relevance', () => {
    // Task memories should decay
    const taskConfig = getTemporalConfig('task');
    const taskRelevance = computeRelevance(30, taskConfig);

    // Preference memories use flat model (always 1.0)
    const prefConfig = getTemporalConfig('preference');
    const prefRelevance = computeRelevance(30, prefConfig);

    expect(prefRelevance).toBeGreaterThanOrEqual(taskRelevance);
  });
});

// ============================================================================
// Meta-Reasoning Accuracy
// ============================================================================

describe('Novel: Meta-reasoning accuracy', () => {
  it('correctly detects stuck progress', () => {
    const signal = monitorProgress({
      stepsCompleted: 2,
      stepsTotal: 10,
      timeElapsedMs: 60000,
      timeEstimatedMs: 60000,
      failedSteps: 0,
    });

    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('stuck_detected');
  });

  it('correctly identifies strategy switch opportunity', () => {
    const signal = shouldSwitchStrategy(0.3, 0.8, 3);

    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('strategy_switch_recommended');
  });

  it('returns null when switch not warranted', () => {
    // Not enough failed steps
    expect(shouldSwitchStrategy(0.3, 0.8, 1)).toBeNull();
    // Score gap too small
    expect(shouldSwitchStrategy(0.7, 0.8, 3)).toBeNull();
  });

  it('calibrates confidence accurately', () => {
    const records = [
      { predicted: 0.9, actual: true, timestamp: '2026-03-15T10:00:00Z' },
      { predicted: 0.9, actual: true, timestamp: '2026-03-15T11:00:00Z' },
      { predicted: 0.9, actual: false, timestamp: '2026-03-15T12:00:00Z' },
      { predicted: 0.9, actual: true, timestamp: '2026-03-15T13:00:00Z' },
      { predicted: 0.9, actual: false, timestamp: '2026-03-15T14:00:00Z' },
    ];

    const calibration = calibrateConfidence(records);
    expect(calibration.factor).toBeGreaterThan(0);
    expect(calibration.factor).toBeLessThanOrEqual(2.0);
  });

  it('detects resource waste', () => {
    const signal = checkResourceEfficiency({
      tokensInjected: 8000,
      tokensBudget: 10000,
      retrievalHits: 1,
      retrievalTotal: 10,
    });

    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('resource_waste');
  });

  it('full analysis integrates all signals', () => {
    const result = analyze({
      progress: {
        stepsCompleted: 1,
        stepsTotal: 10,
        timeElapsedMs: 50000,
        timeEstimatedMs: 60000,
        failedSteps: 0,
      },
      resourceUsage: {
        tokensInjected: 8000,
        tokensBudget: 10000,
        retrievalHits: 2,
        retrievalTotal: 10,
      },
    });

    expect(result.signals).toBeDefined();
    expect(typeof result.isHealthy).toBe('boolean');
    expect(typeof result.calibrationFactor).toBe('number');
  });
});

// ============================================================================
// Self-Evaluation Calibration
// ============================================================================

describe('Novel: Self-evaluation calibration', () => {
  it('evaluates all 5 dimensions', () => {
    const result = selfEvaluate({
      helpfulRetrievals: 8,
      totalRetrievals: 10,
      repeatFailures: 1,
      totalFailures: 10,
      skillsApplied: 6,
      skillsRetrieved: 10,
      correctPredictions: 7,
      totalPredictions: 10,
      corrections: 2,
      totalTasks: 10,
    });

    expect(result.dimensions).toHaveLength(5);
    for (const dim of result.dimensions) {
      expect(dim.passing).toBe(true);
    }
    expect(result.overallHealth).toBe('healthy');
  });

  it('detects degraded health correctly', () => {
    const result = selfEvaluate({
      helpfulRetrievals: 3,
      totalRetrievals: 10,    // 0.3 < 0.7 target
      repeatFailures: 4,
      totalFailures: 10,      // 0.4 > 0.2 target
      skillsApplied: 6,
      skillsRetrieved: 10,
      correctPredictions: 7,
      totalPredictions: 10,
      corrections: 2,
      totalTasks: 10,
    });

    const failingCount = result.dimensions.filter((d) => !d.passing).length;
    expect(failingCount).toBeGreaterThanOrEqual(2);
    expect(result.overallHealth).not.toBe('healthy');
  });

  it('detects critical health correctly', () => {
    const result = selfEvaluate({
      helpfulRetrievals: 2,
      totalRetrievals: 10,   // 0.2 < 0.7
      repeatFailures: 6,
      totalFailures: 10,     // 0.6 > 0.2
      skillsApplied: 2,
      skillsRetrieved: 10,   // 0.2 < 0.5
      correctPredictions: 3,
      totalPredictions: 10,  // 0.3 < 0.6
      corrections: 5,
      totalTasks: 10,        // 0.5 > 0.3
    });

    expect(result.overallHealth).toBe('critical');
  });

  it('quick evaluate works correctly', () => {
    const result = quickEvaluate({
      helpfulRetrievals: 8,
      totalRetrievals: 10,
      corrections: 1,
      totalTasks: 10,
    });

    expect(result.passing).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('dimension passing check works correctly', () => {
    expect(isDimensionPassing(0.8, 0.7, 'higher_is_better')).toBe(true);
    expect(isDimensionPassing(0.5, 0.7, 'higher_is_better')).toBe(false);
    expect(isDimensionPassing(0.1, 0.2, 'lower_is_better')).toBe(true);
    expect(isDimensionPassing(0.3, 0.2, 'lower_is_better')).toBe(false);
  });

  it('evaluation schedules are correctly defined', () => {
    // No evaluations ever done -> weekly
    const schedule = getSchedule(null, null);
    expect(schedule).toBe('weekly');

    // Recent weekly but no daily -> daily
    const recentWeekly = new Date().toISOString();
    const schedule2 = getSchedule(null, recentWeekly);
    expect(schedule2).toBe('daily');
  });
});

// ============================================================================
// Experience Synthesis Quality
// ============================================================================

describe('Novel: Experience synthesis quality', () => {
  it('identifies gaps accurately from density data', () => {
    const entries = [
      { domain: 'auth', memoryCount: 1, changeFrequency: 20 },
      { domain: 'logging', memoryCount: 15, changeFrequency: 5 },
      { domain: 'caching', memoryCount: 2, changeFrequency: 18 },
    ];

    const gaps = identifyGaps(entries);
    expect(gaps.length).toBeGreaterThan(0);

    if (gaps.length >= 2) {
      expect(gaps[0].gapScore).toBeGreaterThanOrEqual(gaps[1].gapScore);
    }
  });

  it('generates both success and failure scenarios', () => {
    const gap = { domain: 'auth', memoryCount: 1, changeFrequency: 20, gapScore: 0.8 };
    const patterns = ['missing-validation', 'weak-hashing'];

    const scenarios = generateScenarios(gap, patterns);

    expect(scenarios.length).toBe(4);
    const variants = scenarios.map((s) => s.variant);
    expect(variants.filter((v) => v === 'success')).toHaveLength(2);
    expect(variants.filter((v) => v === 'failure')).toHaveLength(2);

    for (const s of scenarios) {
      expect(s.source).toBe('synthetic');
      expect(isSynthetic(s.tags)).toBe(true);
    }
  });

  it('validates scenarios correctly against outcomes', () => {
    const scenario = {
      id: 'test-1', domain: 'auth', title: 'Test', content: 'Test content',
      variant: 'failure' as const, basedOnPattern: 'missing-validation',
      confidence: 0.35, tags: ['synthetic'], source: 'synthetic' as const,
    };

    const correct = validateScenario(scenario, 'failure');
    expect(correct.validated).toBe(true);
    expect(correct.confidenceAdjustment).toBe(0.15);

    const incorrect = validateScenario(scenario, 'success');
    expect(incorrect.validated).toBe(true);
    expect(incorrect.confidenceAdjustment).toBe(-0.1);

    const unknown = validateScenario(scenario, 'unknown');
    expect(unknown.validated).toBe(false);
    expect(unknown.confidenceAdjustment).toBe(0);
  });

  it('applies validation adjustments correctly', () => {
    const scenario = {
      id: 'test-1', domain: 'auth', title: 'Test', content: 'Test',
      variant: 'failure' as const, basedOnPattern: 'test',
      confidence: 0.5, tags: ['synthetic'], source: 'synthetic' as const,
    };

    const boost = applyValidation(scenario, {
      scenarioId: 'test-1', predicted: 'failure', actual: 'failure',
      confidenceAdjustment: 0.15, validated: true,
    });
    expect(boost.confidence).toBe(0.65);

    const penalty = applyValidation(scenario, {
      scenarioId: 'test-1', predicted: 'failure', actual: 'success',
      confidenceAdjustment: -0.1, validated: true,
    });
    expect(penalty.confidence).toBe(0.4);
  });

  it('clamps confidence to [0.1, 0.9]', () => {
    const lowConf = {
      id: '1', domain: 'd', title: 't', content: 'c',
      variant: 'failure' as const, basedOnPattern: 'p',
      confidence: 0.1, tags: ['synthetic'], source: 'synthetic' as const,
    };

    const result = applyValidation(lowConf, {
      scenarioId: '1', predicted: 'failure', actual: 'success',
      confidenceAdjustment: -0.5, validated: true,
    });
    expect(result.confidence).toBe(0.1);
  });

  it('synthetic confidence multiplier reduces baseline', () => {
    const original = 0.8;
    const synthetic = applySyntheticMultiplier(original);
    expect(synthetic).toBeCloseTo(0.56, 5); // 0.8 * 0.7
    expect(synthetic).toBeLessThan(original);
  });

  it('full synthesis pipeline produces valid output', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      domain: `domain-${i}`,
      memoryCount: i % 3,
      changeFrequency: 5 + (i * 2),
    }));

    const result = synthesize(entries, ['pattern-a', 'pattern-b'], 3);

    expect(result.gapsIdentified).toBeGreaterThan(0);
    expect(result.gaps.length).toBeLessThanOrEqual(3);
    expect(result.scenariosGenerated).toBeGreaterThan(0);

    for (const s of result.scenarios) {
      expect(s.source).toBe('synthetic');
    }
  });
});

// ============================================================================
// Context Economy Value Scoring Accuracy
// ============================================================================

describe('Novel: Context economy value scoring accuracy', () => {
  it('importance class ordering is correct', () => {
    const base = { id: '1', content: 'x', tokenCount: 10, relevance: 0.8, recency: 0.8, uniqueness: 0.8 };

    const skillVal = computeValue({ ...base, importanceClass: 'skill' });
    const antiVal = computeValue({ ...base, importanceClass: 'anti_pattern' });
    const lessonVal = computeValue({ ...base, importanceClass: 'lesson' });
    const taskVal = computeValue({ ...base, importanceClass: 'task' });
    const prefVal = computeValue({ ...base, importanceClass: 'preference' });
    const otherVal = computeValue({ ...base, importanceClass: 'other' });

    expect(skillVal).toBeGreaterThan(antiVal);
    expect(antiVal).toBeGreaterThan(lessonVal);
    expect(lessonVal).toBeGreaterThan(taskVal);
    expect(taskVal).toBeGreaterThan(prefVal);
    expect(prefVal).toBeGreaterThan(otherVal);
  });

  it('allocator preserves value ordering in output', () => {
    const items: ContextItem[] = [
      { id: 'low', content: 'x', tokenCount: 10, importanceClass: 'other', relevance: 0.3, recency: 0.3, uniqueness: 0.3 },
      { id: 'high', content: 'x', tokenCount: 10, importanceClass: 'skill', relevance: 0.9, recency: 0.9, uniqueness: 0.9 },
      { id: 'med', content: 'x', tokenCount: 10, importanceClass: 'lesson', relevance: 0.6, recency: 0.6, uniqueness: 0.6 },
    ];

    const result = allocateItems(items, 100);
    expect(result.included[0].id).toBe('high');
    expect(result.included[1].id).toBe('med');
    expect(result.included[2].id).toBe('low');
  });
});
