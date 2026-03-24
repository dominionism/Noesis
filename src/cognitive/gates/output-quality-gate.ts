/**
 * Output Quality Gate — Prevents generic creative/API work.
 *
 * Two gate types:
 * - Creative gate: 6 required fields for design/UX work
 * - API gate: 4 required fields for API design/integration
 *
 * Gates ensure differentiation evidence exists before substantial
 * creative or API work proceeds.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { CognitiveOutcomeResult, SignFn } from '../types.js';
import { generateId } from '../../core/ulid.js';
import {
  OUTPUT_QUALITY_CREATIVE_REQUIRED,
  OUTPUT_QUALITY_API_REQUIRED,
} from '../../constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreativeGateInput {
  objective?: string;
  audience?: string;
  visual_direction?: string;
  references?: string[];
  banned_patterns?: string[];
  success_criteria?: string[];
}

export interface ApiGateInput {
  contract_target?: string;
  reference_examples?: string[];
  edge_cases?: string[];
  verification_plan?: string;
}

export interface GateResult {
  passed: boolean;
  missing: string[];
  gate_type: 'creative' | 'api';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check creative output quality gate.
 *
 * All 6 fields must be present and non-empty:
 * objective, audience, visual_direction, references,
 * banned_patterns, success_criteria.
 */
export function checkCreativeGate(input: CreativeGateInput): GateResult {
  const missing: string[] = [];

  if (!input.objective?.trim()) missing.push('objective');
  if (!input.audience?.trim()) missing.push('audience');
  if (!input.visual_direction?.trim()) missing.push('visual_direction');
  if (!input.references || input.references.length === 0) missing.push('references');
  if (!input.banned_patterns || input.banned_patterns.length === 0) missing.push('banned_patterns');
  if (!input.success_criteria || input.success_criteria.length === 0) missing.push('success_criteria');

  return {
    passed: missing.length === 0,
    missing,
    gate_type: 'creative',
  };
}

/**
 * Check API output quality gate.
 *
 * All 4 fields must be present and non-empty:
 * contract_target, reference_examples, edge_cases, verification_plan.
 */
export function checkApiGate(input: ApiGateInput): GateResult {
  const missing: string[] = [];

  if (!input.contract_target?.trim()) missing.push('contract_target');
  if (!input.reference_examples || input.reference_examples.length === 0) missing.push('reference_examples');
  if (!input.edge_cases || input.edge_cases.length === 0) missing.push('edge_cases');
  if (!input.verification_plan?.trim()) missing.push('verification_plan');

  return {
    passed: missing.length === 0,
    missing,
    gate_type: 'api',
  };
}

/**
 * Determine if a quality gate should apply based on task description.
 * Returns 'creative', 'api', or null.
 */
export function shouldApplyQualityGate(
  taskDescription: string,
  capsuleName: string | null,
): 'creative' | 'api' | null {
  const desc = taskDescription.toLowerCase();

  // Capsule-based detection
  if (capsuleName === 'creative-redesign') return 'creative';
  if (capsuleName === 'api-workflow') return 'api';

  // Keyword-based detection for creative work
  const creativePatterns = [
    /\bredesign\b/, /\bui\s+design\b/, /\bux\b/, /\bvisual\b/,
    /\bcreative\b/, /\blayout\b/, /\bdesign\s+system\b/,
    /\bcomponent\s+library\b/, /\btheme\b/,
  ];
  for (const p of creativePatterns) {
    if (p.test(desc)) return 'creative';
  }

  // Keyword-based detection for API work
  const apiPatterns = [
    /\bapi\s+design\b/, /\bapi\s+contract\b/, /\bendpoint\s+design\b/,
    /\bopenapi\b/, /\bgraphql\s+schema\b/, /\brpc\s+interface\b/,
    /\brest\s+api\b/, /\bapi\s+integration\b/,
  ];
  for (const p of apiPatterns) {
    if (p.test(desc)) return 'api';
  }

  return null;
}

/**
 * Format gate result as human-readable feedback.
 */
export function formatGateResult(result: GateResult): string {
  if (result.passed) {
    return `${result.gate_type === 'creative' ? 'Creative' : 'API'} quality gate: PASSED`;
  }

  const lines: string[] = [
    `${result.gate_type === 'creative' ? 'Creative' : 'API'} quality gate: BLOCKED`,
    'Missing required inputs:',
  ];

  for (const field of result.missing) {
    const label = field.replace(/_/g, ' ');
    lines.push(`  - ${label}`);
  }

  lines.push('');
  lines.push('Provide these inputs before proceeding with this task.');

  return lines.join('\n');
}

/**
 * Record a quality gate outcome.
 */
export function recordQualityGateOutcome(
  db: DatabaseConnection,
  gateType: 'creative' | 'api',
  passed: boolean,
  taskOutcome: CognitiveOutcomeResult,
  taskDescription: string,
  sign: SignFn,
): void {
  const now = new Date().toISOString();
  const evidence = `gate_type=${gateType},passed=${passed}`;

  db.prepare<[
    string, string, string, string,
    string | null, string,
  ]>(`
    INSERT INTO cognitive_outcomes (
      id, entity_type, entity_id, task_description, outcome,
      evidence, created_at
    ) VALUES (?, 'gate', ?, ?, ?, ?, ?)
  `).run(
    generateId(), `quality_${gateType}`, taskDescription,
    taskOutcome, evidence, now,
  );
}

/**
 * Get gate effectiveness metrics.
 */
export function getGateEffectiveness(
  db: DatabaseConnection,
  gateType: string,
): { passRate: number; falsePassRate: number; falseBlockRate: number; total: number } {
  const rows = db.prepare<[string], { outcome: string; evidence: string | null }>(`
    SELECT outcome, evidence FROM cognitive_outcomes
    WHERE entity_type = 'gate' AND entity_id LIKE ?
    ORDER BY created_at DESC LIMIT 100
  `).all(`%${gateType}%`);

  if (rows.length === 0) {
    return { passRate: 0, falsePassRate: 0, falseBlockRate: 0, total: 0 };
  }

  let passed = 0;
  let falsePass = 0; // Gate passed but task failed
  let falseBlock = 0; // Gate blocked but task succeeded (estimated)

  for (const row of rows) {
    const gatePassed = row.evidence?.includes('passed=true') ?? false;
    if (gatePassed) {
      passed++;
      if (row.outcome === 'failure') falsePass++;
    } else {
      if (row.outcome === 'success') falseBlock++;
    }
  }

  return {
    passRate: passed / rows.length,
    falsePassRate: passed > 0 ? falsePass / passed : 0,
    falseBlockRate: (rows.length - passed) > 0 ? falseBlock / (rows.length - passed) : 0,
    total: rows.length,
  };
}

/**
 * Suggest gate adjustment based on effectiveness metrics.
 */
export function suggestGateAdjustment(
  effectiveness: ReturnType<typeof getGateEffectiveness>,
): { action: 'tighten' | 'relax' | 'none'; rationale: string } {
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
