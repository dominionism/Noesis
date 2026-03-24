/**
 * Tests for Intelligence Metrics Computation
 *
 * Covers:
 * - computeMetrics: all 5 metrics, zero denominators, clamping, rounding
 */

import { describe, it, expect } from 'vitest';
import { computeMetrics } from '../../intelligence/metrics.js';

describe('computeMetrics', () => {
  describe('retrieval_precision', () => {
    it('computes correct ratio of helpful/total retrievals', () => {
      const result = computeMetrics({
        totalRetrievals: 100,
        helpfulRetrievals: 75,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.retrieval_precision).toBe(0.75);
    });

    it('returns 0 when totalRetrievals is 0', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 10,
        gatesPassed: 8,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.retrieval_precision).toBe(0);
    });

    it('clamps to 1.0 when helpfulRetrievals exceeds total', () => {
      const result = computeMetrics({
        totalRetrievals: 10,
        helpfulRetrievals: 15,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.retrieval_precision).toBe(1);
    });
  });

  describe('gate_pass_rate', () => {
    it('computes correct ratio of gates passed / total checks', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 20,
        gatesPassed: 14,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.gate_pass_rate).toBe(0.7);
    });

    it('returns 0 when totalGateChecks is 0', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.gate_pass_rate).toBe(0);
    });

    it('clamps to 1.0 when gatesPassed exceeds total', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 5,
        gatesPassed: 10,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.gate_pass_rate).toBe(1);
    });
  });

  describe('learning_capture_rate', () => {
    it('computes correct ratio of lessons captured / total failures', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 10,
        lessonsCaptured: 8,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.learning_capture_rate).toBe(0.8);
    });

    it('returns 0 when totalFailures is 0', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 5,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.learning_capture_rate).toBe(0);
    });

    it('clamps to 1.0 max', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 3,
        lessonsCaptured: 10,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.learning_capture_rate).toBe(1);
    });
  });

  describe('skill_synthesis_rate', () => {
    it('passes through the raw count (rounded to 4 decimals)', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 7,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.skill_synthesis_rate).toBe(7);
    });

    it('handles 0 skills synthesized', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.skill_synthesis_rate).toBe(0);
    });
  });

  describe('time_to_resolution_trend', () => {
    it('returns ratio < 1.0 when improving (current faster than previous)', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 50,
        avgTimePreviousPeriod: 100,
      });

      expect(result.time_to_resolution_trend).toBe(0.5);
    });

    it('returns ratio > 1.0 when degrading (current slower than previous)', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 200,
        avgTimePreviousPeriod: 100,
      });

      expect(result.time_to_resolution_trend).toBe(2);
    });

    it('returns 1.0 when times are equal (no change)', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 100,
        avgTimePreviousPeriod: 100,
      });

      expect(result.time_to_resolution_trend).toBe(1);
    });

    it('returns 0 when previous period average is 0 (no data)', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 100,
        avgTimePreviousPeriod: 0,
      });

      expect(result.time_to_resolution_trend).toBe(0);
    });
  });

  describe('rounding', () => {
    it('rounds all values to 4 decimal places', () => {
      const result = computeMetrics({
        totalRetrievals: 3,
        helpfulRetrievals: 1,
        totalGateChecks: 3,
        gatesPassed: 1,
        totalFailures: 3,
        lessonsCaptured: 1,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 100,
        avgTimePreviousPeriod: 300,
      });

      // 1/3 = 0.33333... should round to 0.3333
      expect(result.retrieval_precision).toBe(0.3333);
      expect(result.gate_pass_rate).toBe(0.3333);
      expect(result.learning_capture_rate).toBe(0.3333);
      expect(result.time_to_resolution_trend).toBe(0.3333);
    });
  });

  describe('all zeros', () => {
    it('returns all zeros when all inputs are 0', () => {
      const result = computeMetrics({
        totalRetrievals: 0,
        helpfulRetrievals: 0,
        totalGateChecks: 0,
        gatesPassed: 0,
        totalFailures: 0,
        lessonsCaptured: 0,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.retrieval_precision).toBe(0);
      expect(result.gate_pass_rate).toBe(0);
      expect(result.learning_capture_rate).toBe(0);
      expect(result.skill_synthesis_rate).toBe(0);
      expect(result.time_to_resolution_trend).toBe(0);
    });
  });

  describe('full happy path', () => {
    it('computes all metrics correctly with realistic data', () => {
      const result = computeMetrics({
        totalRetrievals: 200,
        helpfulRetrievals: 170,
        totalGateChecks: 50,
        gatesPassed: 42,
        totalFailures: 30,
        lessonsCaptured: 25,
        skillsSynthesizedLast30Days: 3,
        avgTimeCurrentPeriod: 45,
        avgTimePreviousPeriod: 60,
      });

      expect(result.retrieval_precision).toBe(0.85);
      expect(result.gate_pass_rate).toBe(0.84);
      expect(result.learning_capture_rate).toBe(0.8333);
      expect(result.skill_synthesis_rate).toBe(3);
      expect(result.time_to_resolution_trend).toBe(0.75);
    });
  });

  describe('negative values (defensive)', () => {
    it('clamps negative ratios to 0', () => {
      const result = computeMetrics({
        totalRetrievals: 10,
        helpfulRetrievals: -5,
        totalGateChecks: 10,
        gatesPassed: -3,
        totalFailures: 10,
        lessonsCaptured: -2,
        skillsSynthesizedLast30Days: 0,
        avgTimeCurrentPeriod: 0,
        avgTimePreviousPeriod: 0,
      });

      expect(result.retrieval_precision).toBe(0);
      expect(result.gate_pass_rate).toBe(0);
      expect(result.learning_capture_rate).toBe(0);
    });
  });
});
