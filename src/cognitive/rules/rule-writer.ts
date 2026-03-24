/**
 * Rule Writer — Learning-loop writeback to rules.
 *
 * Enables the active learning system to:
 * - Propose modifications to existing rules (new constraints, threshold changes, new triggers)
 * - Propose entirely new rules from accumulated evidence
 * - Confirm or archive rules
 *
 * All modifications are versioned (old version preserved via version increment).
 * New rules start in draft status (enabled=false) until confirmed.
 * Rule creation requires 3+ evidence memories to justify existence.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  RuleDefinition,
  RuleDefinitionInput,
  RuleModification,
  SignFn,
} from '../types.js';
import { getRule, insertRule, updateRule } from './rule-store.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum evidence memories required to propose a new rule. */
const MIN_EVIDENCE_FOR_NEW_RULE = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Propose a modification to an existing rule.
 *
 * Creates a new version of the rule with the proposed change applied.
 * The old version is preserved (version field incremented).
 * Evidence memory IDs are stored in the rule content for audit trail.
 */
export function proposeRuleModification(
  db: DatabaseConnection,
  ruleId: string,
  modification: RuleModification,
  evidence: string[],
  sign: SignFn,
): RuleDefinition {
  const existing = getRule(db, ruleId);
  if (!existing) {
    throw new Error(`Rule not found: ${ruleId}`);
  }

  // Apply modifications to a copy
  const updatedTriggers = [...existing.trigger_conditions];
  const updatedConstraints = [...existing.constraints];
  const updatedThresholds = { ...existing.thresholds };

  if (modification.add_trigger) {
    updatedTriggers.push(modification.add_trigger);
  }

  if (modification.add_constraint) {
    updatedConstraints.push(modification.add_constraint);
  }

  if (modification.remove_constraint) {
    const idx = updatedConstraints.findIndex(c => c.requirement === modification.remove_constraint);
    if (idx !== -1) {
      updatedConstraints.splice(idx, 1);
    }
  }

  if (modification.modify_threshold) {
    updatedThresholds[modification.modify_threshold.name] = modification.modify_threshold.value;
  }

  // Append evidence to content
  const evidenceNote = `\n\n**Evidence (v${existing.version + 1}):** ${evidence.join(', ')}`;
  const updatedContent = existing.content + evidenceNote;

  updateRule(db, ruleId, {
    trigger_conditions: updatedTriggers,
    constraints: updatedConstraints,
    thresholds: updatedThresholds,
    content: updatedContent,
    version: existing.version + 1,
  }, sign);

  return {
    ...existing,
    trigger_conditions: updatedTriggers,
    constraints: updatedConstraints,
    thresholds: updatedThresholds,
    content: updatedContent,
    version: existing.version + 1,
  };
}

/**
 * Propose an entirely new rule from accumulated evidence.
 *
 * Requires minimum 3 evidence memories to justify creation.
 * New rules are created in draft status (enabled=false).
 */
export function proposeNewRule(
  db: DatabaseConnection,
  input: RuleDefinitionInput,
  evidence: string[],
  sign: SignFn,
): RuleDefinition {
  if (evidence.length < MIN_EVIDENCE_FOR_NEW_RULE) {
    throw new Error(
      `Insufficient evidence: ${evidence.length} memories provided, ` +
      `minimum ${MIN_EVIDENCE_FOR_NEW_RULE} required to propose a new rule`,
    );
  }

  // Append evidence to content
  const evidenceNote = `\n\n**Evidence (creation):** ${evidence.join(', ')}`;
  const contentWithEvidence = input.content + evidenceNote;

  const rule = insertRule(db, {
    ...input,
    content: contentWithEvidence,
  }, sign);

  // Set to draft (disabled) until confirmed
  updateRule(db, rule.id, { enabled: false }, sign);

  return { ...rule, enabled: false };
}

/**
 * Confirm a draft rule, moving it to active status.
 */
export function confirmRule(
  db: DatabaseConnection,
  ruleId: string,
  sign: SignFn,
): void {
  const rule = getRule(db, ruleId);
  if (!rule) {
    throw new Error(`Rule not found: ${ruleId}`);
  }
  updateRule(db, ruleId, { enabled: true }, sign);
}

/**
 * Archive a rule without deleting it. Sets enabled=false.
 */
export function archiveRule(
  db: DatabaseConnection,
  ruleId: string,
  sign: SignFn,
): void {
  const rule = getRule(db, ruleId);
  if (!rule) {
    throw new Error(`Rule not found: ${ruleId}`);
  }
  updateRule(db, ruleId, { enabled: false }, sign);
}
