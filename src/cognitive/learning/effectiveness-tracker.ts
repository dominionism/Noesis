/**
 * Effectiveness Tracker — Track and evaluate gate/rule/expert effectiveness.
 *
 * Wraps the gate-level tracking from Phase 7 and adds cross-subsystem
 * effectiveness monitoring. Tracks false positives (gate passed but task
 * failed) and false negatives (gate blocked but task would have succeeded).
 *
 * Delegates to existing cognitive_outcomes table.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { CognitiveOutcomeResult } from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateType = 'readiness' | 'output_quality' | 'verification';

export interface EffectivenessMetrics {
  passRate: number;
  falsePassRate: number;
  falseBlockRate: number;
  total: number;
}

export interface AdjustmentSuggestion {
  action: 'tighten' | 'relax' | 'none';
  rationale: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track a gate evaluation outcome.
 *
 * Records whether the gate passed/blocked and the eventual task outcome,
 * allowing effectiveness analysis over time.
 */
export function trackGateEffectiveness(
  db: DatabaseConnection,
  gateType: GateType,
  passed: boolean,
  taskOutcome: CognitiveOutcomeResult,
): void {
  const now = new Date().toISOString();
  const evidence = `gate_type=${gateType},gate_passed=${passed}`;

  db.prepare<[
    string, string, string,
    string, string, string,
  ]>(`
    INSERT INTO cognitive_outcomes (
      id, entity_type, entity_id, task_description, outcome,
      evidence, created_at
    ) VALUES (?, 'gate', ?, ?, ?, ?, ?)
  `).run(
    generateId(), `effectiveness_${gateType}`, `gate_${gateType}_evaluation`,
    taskOutcome, evidence, now,
  );
}

/**
 * Get effectiveness metrics for a gate type.
 *
 * Analyzes the last 100 outcomes for the specified gate type
 * and computes pass rate, false-pass rate, and false-block rate.
 */
export function getEffectivenessMetrics(
  db: DatabaseConnection,
  gateType: GateType,
): EffectivenessMetrics {
  const rows = db.prepare<[string], { outcome: string; evidence: string | null }>(`
    SELECT outcome, evidence FROM cognitive_outcomes
    WHERE entity_type = 'gate' AND entity_id LIKE ?
    ORDER BY created_at DESC LIMIT 100
  `).all(`%${gateType}%`);

  if (rows.length === 0) {
    return { passRate: 0, falsePassRate: 0, falseBlockRate: 0, total: 0 };
  }

  let passed = 0;
  let falsePass = 0;
  let falseBlock = 0;

  for (const row of rows) {
    const gatePassed = row.evidence?.includes('passed=true') ||
                       row.evidence?.includes('gate_passed=true') || false;
    if (gatePassed) {
      passed++;
      if (row.outcome === 'failure') falsePass++;
    } else {
      if (row.outcome === 'success') falseBlock++;
    }
  }

  const blocked = rows.length - passed;

  return {
    passRate: passed / rows.length,
    falsePassRate: passed > 0 ? falsePass / passed : 0,
    falseBlockRate: blocked > 0 ? falseBlock / blocked : 0,
    total: rows.length,
  };
}

/**
 * Suggest gate adjustment based on effectiveness metrics.
 *
 * Thresholds:
 * - falsePassRate > 20% → tighten (gate is too permissive)
 * - falseBlockRate > 30% → relax (gate is too restrictive)
 * - Otherwise → no adjustment needed
 */
export function suggestAdjustment(
  effectiveness: EffectivenessMetrics,
): AdjustmentSuggestion {
  if (effectiveness.total < 10) {
    return { action: 'none', rationale: 'Insufficient data for adjustment (need 10+ outcomes).' };
  }

  if (effectiveness.falsePassRate > 0.2) {
    return {
      action: 'tighten',
      rationale: `False pass rate ${(effectiveness.falsePassRate * 100).toFixed(0)}% exceeds 20% threshold. Gate is too permissive.`,
    };
  }

  if (effectiveness.falseBlockRate > 0.3) {
    return {
      action: 'relax',
      rationale: `False block rate ${(effectiveness.falseBlockRate * 100).toFixed(0)}% exceeds 30% threshold. Gate is too restrictive.`,
    };
  }

  return { action: 'none', rationale: 'Gate effectiveness within acceptable range.' };
}

/**
 * Get cross-subsystem effectiveness summary.
 *
 * Returns effectiveness for all gate types plus overall statistics.
 */
export function getCrossSubsystemEffectiveness(
  db: DatabaseConnection,
): Record<GateType, EffectivenessMetrics> & { overall: EffectivenessMetrics } {
  const readiness = getEffectivenessMetrics(db, 'readiness');
  const outputQuality = getEffectivenessMetrics(db, 'output_quality');
  const verification = getEffectivenessMetrics(db, 'verification');

  const totalEntries = readiness.total + outputQuality.total + verification.total;
  const weightedPassRate = totalEntries > 0
    ? (readiness.passRate * readiness.total +
       outputQuality.passRate * outputQuality.total +
       verification.passRate * verification.total) / totalEntries
    : 0;

  const weightedFalsePassRate = totalEntries > 0
    ? (readiness.falsePassRate * readiness.total +
       outputQuality.falsePassRate * outputQuality.total +
       verification.falsePassRate * verification.total) / totalEntries
    : 0;

  const weightedFalseBlockRate = totalEntries > 0
    ? (readiness.falseBlockRate * readiness.total +
       outputQuality.falseBlockRate * outputQuality.total +
       verification.falseBlockRate * verification.total) / totalEntries
    : 0;

  return {
    readiness,
    output_quality: outputQuality,
    verification,
    overall: {
      passRate: weightedPassRate,
      falsePassRate: weightedFalsePassRate,
      falseBlockRate: weightedFalseBlockRate,
      total: totalEntries,
    },
  };
}
