import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  insertRule,
  getRule,
  getRuleByName,
  updateRule,
  deleteRule,
  listRules,
  recordRuleOutcome,
} from '../../cognitive/rules/rule-store.js';
import {
  matchRulesForTask,
  getActiveRules,
  formatRulesForContext,
  applyRuleDecay,
} from '../../cognitive/rules/rule-engine.js';
import {
  checkCompliance,
  enforceHardRules,
  formatComplianceReport,
} from '../../cognitive/rules/rule-compliance.js';
import {
  proposeRuleModification,
  proposeNewRule,
  confirmRule,
  archiveRule,
} from '../../cognitive/rules/rule-writer.js';
import {
  seedBuiltInRules,
  getBuiltInRuleNames,
} from '../../cognitive/rules/built-in-rules.js';
import type { RuleDefinitionInput, ComplianceContext } from '../../cognitive/types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-rules-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Rule Engine', () => {
  const cleanups: Array<{ db: DatabaseConnection; dir: string }> = [];

  afterEach(() => {
    for (const { db, dir } of cleanups) {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
    DatabaseConnection.resetInstance();
  });

  function setup() {
    const ctx = createTestDb();
    cleanups.push(ctx);
    return ctx;
  }

  const sampleRule: RuleDefinitionInput = {
    name: 'test-rule',
    category: 'workflow',
    description: 'A test rule',
    trigger_conditions: [
      { condition: 'When testing', detection: 'automatic', keywords: ['test', 'verify'] },
    ],
    constraints: [
      { requirement: 'Must have tests', severity: 'blocking' },
      { requirement: 'Should be documented', severity: 'warning' },
    ],
    enforcement: 'hard',
    thresholds: { min_coverage: 80 },
    interactions: ['other-rule'],
    content: 'Full rule content here.',
  };

  // -----------------------------------------------------------------------
  // Rule Store CRUD
  // -----------------------------------------------------------------------

  describe('rule-store', () => {
    it('inserts and retrieves a rule by ID', () => {
      const { db } = setup();
      const rule = insertRule(db, sampleRule, sign);

      expect(rule.id).toBeTruthy();
      expect(rule.name).toBe('test-rule');
      expect(rule.category).toBe('workflow');
      expect(rule.enforcement).toBe('hard');
      expect(rule.confidence).toBe(0.5);
      expect(rule.version).toBe(1);
      expect(rule.enabled).toBe(true);

      const retrieved = getRule(db, rule.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('test-rule');
      expect(retrieved!.trigger_conditions).toHaveLength(1);
      expect(retrieved!.constraints).toHaveLength(2);
      expect(retrieved!.thresholds).toEqual({ min_coverage: 80 });
      expect(retrieved!.interactions).toEqual(['other-rule']);
    });

    it('retrieves a rule by name', () => {
      const { db } = setup();
      insertRule(db, sampleRule, sign);

      const rule = getRuleByName(db, 'test-rule');
      expect(rule).not.toBeNull();
      expect(rule!.description).toBe('A test rule');
    });

    it('returns null for missing rules', () => {
      const { db } = setup();
      expect(getRule(db, 'nonexistent')).toBeNull();
      expect(getRuleByName(db, 'nonexistent')).toBeNull();
    });

    it('updates a rule', () => {
      const { db } = setup();
      const rule = insertRule(db, sampleRule, sign);

      updateRule(db, rule.id, {
        description: 'Updated description',
        version: 2,
        confidence: 0.8,
      }, sign);

      const updated = getRule(db, rule.id);
      expect(updated!.description).toBe('Updated description');
      expect(updated!.version).toBe(2);
      expect(updated!.confidence).toBe(0.8);
    });

    it('throws on update of non-existent rule', () => {
      const { db } = setup();
      expect(() => updateRule(db, 'nonexistent', { description: 'x' }, sign)).toThrow('Rule not found');
    });

    it('deletes a rule', () => {
      const { db } = setup();
      const rule = insertRule(db, sampleRule, sign);
      deleteRule(db, rule.id);
      expect(getRule(db, rule.id)).toBeNull();
    });

    it('lists rules with filters', () => {
      const { db } = setup();
      insertRule(db, { ...sampleRule, name: 'rule-a', category: 'workflow' }, sign);
      insertRule(db, { ...sampleRule, name: 'rule-b', category: 'quality' }, sign);
      insertRule(db, { ...sampleRule, name: 'rule-c', category: 'workflow' }, sign);

      const all = listRules(db);
      expect(all).toHaveLength(3);

      const workflow = listRules(db, { category: 'workflow' });
      expect(workflow).toHaveLength(2);

      const quality = listRules(db, { category: 'quality' });
      expect(quality).toHaveLength(1);
    });

    it('records outcomes with Bayesian confidence updates', () => {
      const { db } = setup();
      const rule = insertRule(db, sampleRule, sign);

      // Initial: confidence = 0.5, outcome_count = 0, success_count = 0
      recordRuleOutcome(db, rule.id, 'success');
      let updated = getRule(db, rule.id)!;
      // Laplace: (0 + 1 + 1) / (0 + 1 + 2) = 2/3
      expect(updated.outcome_count).toBe(1);
      expect(updated.success_count).toBe(1);
      expect(updated.confidence).toBeCloseTo(2 / 3, 5);

      recordRuleOutcome(db, rule.id, 'failure');
      updated = getRule(db, rule.id)!;
      // Laplace: (1 + 1) / (2 + 2) = 2/4 = 0.5
      expect(updated.outcome_count).toBe(2);
      expect(updated.success_count).toBe(1);
      expect(updated.confidence).toBeCloseTo(0.5, 5);

      recordRuleOutcome(db, rule.id, 'success');
      recordRuleOutcome(db, rule.id, 'success');
      updated = getRule(db, rule.id)!;
      // Laplace: (3 + 1) / (4 + 2) = 4/6
      expect(updated.confidence).toBeCloseTo(4 / 6, 5);
    });
  });

  // -----------------------------------------------------------------------
  // Rule Engine (matching, formatting, decay)
  // -----------------------------------------------------------------------

  describe('rule-engine', () => {
    it('matches rules by keyword', () => {
      const { db } = setup();
      insertRule(db, sampleRule, sign);
      insertRule(db, {
        ...sampleRule,
        name: 'unrelated-rule',
        trigger_conditions: [
          { condition: 'When deploying', detection: 'automatic', keywords: ['deploy', 'production'] },
        ],
      }, sign);

      const matches = matchRulesForTask(db, 'write tests for module', ['test', 'module'], null);
      expect(matches).toHaveLength(1);
      expect(matches[0].name).toBe('test-rule');
    });

    it('matches rules by category inference', () => {
      const { db } = setup();
      insertRule(db, {
        ...sampleRule,
        name: 'learning-rule',
        category: 'learning',
        trigger_conditions: [{ condition: 'On correction', detection: 'manual' }],
      }, sign);

      const matches = matchRulesForTask(db, 'fix the broken test after correction', ['fix', 'correction'], null);
      expect(matches.some(r => r.name === 'learning-rule')).toBe(true);
    });

    it('returns active rules sorted by confidence', () => {
      const { db } = setup();
      const r1 = insertRule(db, { ...sampleRule, name: 'low-conf' }, sign);
      const r2 = insertRule(db, { ...sampleRule, name: 'high-conf' }, sign);

      // Boost r2's confidence
      recordRuleOutcome(db, r2.id, 'success');
      recordRuleOutcome(db, r2.id, 'success');
      recordRuleOutcome(db, r2.id, 'success');

      const active = getActiveRules(db);
      expect(active[0].name).toBe('high-conf');
    });

    it('formats rules for context within token budget', () => {
      const { db } = setup();
      insertRule(db, sampleRule, sign);
      const rules = listRules(db);

      const formatted = formatRulesForContext(rules, 10000);
      expect(formatted).toContain('## Rule: test-rule');
      expect(formatted).toContain('**Enforcement:** hard');
      expect(formatted).toContain('min_coverage: 80');
    });

    it('respects token budget in formatting', () => {
      const { db } = setup();
      for (let i = 0; i < 10; i++) {
        insertRule(db, { ...sampleRule, name: `rule-${i}` }, sign);
      }
      const rules = listRules(db);

      // Very small budget should only include a few rules
      const formatted = formatRulesForContext(rules, 100);
      const ruleCount = (formatted.match(/## Rule:/g) || []).length;
      expect(ruleCount).toBeLessThan(10);
    });

    it('applies decay to stale rules', () => {
      const { db } = setup();
      const rule = insertRule(db, sampleRule, sign);

      // Manually set updated_at to 100 days ago
      const past = new Date();
      past.setDate(past.getDate() - 100);
      db.prepare('UPDATE rules SET updated_at = ? WHERE id = ?')
        .run(past.toISOString(), rule.id);

      const decayed = applyRuleDecay(db);
      expect(decayed).toBe(1);

      const updated = getRule(db, rule.id)!;
      expect(updated.confidence).toBeLessThan(0.5);
      expect(updated.confidence).toBeCloseTo(0.5 * 0.95, 5);
    });
  });

  // -----------------------------------------------------------------------
  // Rule Compliance
  // -----------------------------------------------------------------------

  describe('rule-compliance', () => {
    const baseContext: ComplianceContext = {
      phase: 'execute',
      hasReadiness: true,
      hasResearch: true,
      hasPlan: true,
      hasVerification: true,
      isSubstantial: true,
      isCreative: false,
      isApiWork: false,
      searchCompleted: true,
      decisionsHonored: true,
    };

    it('passes compliant context', () => {
      const { db } = setup();
      const rule = insertRule(db, sampleRule, sign);
      const rules = [getRule(db, rule.id)!];

      const results = checkCompliance(rules, baseContext);
      expect(results[0].compliant).toBe(true);
      expect(results[0].violations).toHaveLength(0);
    });

    it('detects readiness violation for substantial task', () => {
      const { db } = setup();
      insertRule(db, {
        ...sampleRule,
        name: 'readiness-rule',
        constraints: [
          { requirement: 'Must pass readiness gate', severity: 'blocking', check_fn: 'check_readiness_gate' },
        ],
      }, sign);
      const rules = [getRuleByName(db, 'readiness-rule')!];

      const failContext = { ...baseContext, hasReadiness: false };
      const results = checkCompliance(rules, failContext);
      expect(results[0].compliant).toBe(false);
      expect(results[0].violations).toHaveLength(1);
      expect(results[0].violations[0].severity).toBe('blocking');
    });

    it('enforceHardRules blocks on blocking violations', () => {
      const { db } = setup();
      insertRule(db, {
        ...sampleRule,
        name: 'hard-rule',
        enforcement: 'hard',
        constraints: [
          { requirement: 'Must search first', severity: 'blocking', check_fn: 'check_search_first' },
        ],
      }, sign);
      const rules = [getRuleByName(db, 'hard-rule')!];

      const failContext = { ...baseContext, searchCompleted: false };
      const results = checkCompliance(rules, failContext);
      const enforcement = enforceHardRules(results);
      expect(enforcement.blocked).toBe(true);
      expect(enforcement.blocking_violations).toHaveLength(1);
    });

    it('formats compliance report', () => {
      const { db } = setup();
      insertRule(db, {
        ...sampleRule,
        name: 'report-rule',
        constraints: [
          { requirement: 'Must search first', severity: 'blocking', check_fn: 'check_search_first' },
        ],
      }, sign);
      const rules = [getRuleByName(db, 'report-rule')!];

      const results = checkCompliance(rules, { ...baseContext, searchCompleted: false });
      const report = formatComplianceReport(results);
      expect(report).toContain('# Compliance Report');
      expect(report).toContain('report-rule: FAIL');
      expect(report).toContain('[BLOCKING]');
    });
  });

  // -----------------------------------------------------------------------
  // Rule Writer
  // -----------------------------------------------------------------------

  describe('rule-writer', () => {
    it('proposes rule modification with version increment', () => {
      const { db } = setup();
      const rule = insertRule(db, sampleRule, sign);

      const modified = proposeRuleModification(
        db,
        rule.id,
        {
          add_constraint: { requirement: 'New constraint', severity: 'warning' },
          modify_threshold: { name: 'min_coverage', value: 90 },
        },
        ['evidence-1', 'evidence-2', 'evidence-3'],
        sign,
      );

      expect(modified.version).toBe(2);
      expect(modified.constraints).toHaveLength(3);
      expect(modified.thresholds.min_coverage).toBe(90);
      expect(modified.content).toContain('Evidence (v2)');
    });

    it('proposes new rule requiring minimum evidence', () => {
      const { db } = setup();

      // Should fail with insufficient evidence
      expect(() =>
        proposeNewRule(db, { ...sampleRule, name: 'new-rule' }, ['e1', 'e2'], sign),
      ).toThrow('Insufficient evidence');

      // Should succeed with 3+ evidence
      const rule = proposeNewRule(
        db,
        { ...sampleRule, name: 'new-rule' },
        ['e1', 'e2', 'e3'],
        sign,
      );
      expect(rule.enabled).toBe(false); // Draft status
      expect(rule.content).toContain('Evidence (creation)');
    });

    it('confirms and archives rules', () => {
      const { db } = setup();
      const rule = proposeNewRule(
        db,
        { ...sampleRule, name: 'lifecycle-rule' },
        ['e1', 'e2', 'e3'],
        sign,
      );
      expect(getRule(db, rule.id)!.enabled).toBe(false);

      confirmRule(db, rule.id, sign);
      expect(getRule(db, rule.id)!.enabled).toBe(true);

      archiveRule(db, rule.id, sign);
      expect(getRule(db, rule.id)!.enabled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Built-In Rules
  // -----------------------------------------------------------------------

  describe('built-in-rules', () => {
    it('seeds all 14 built-in rules', () => {
      const { db } = setup();
      const seeded = seedBuiltInRules(db, sign);
      expect(seeded).toBe(14);

      const all = listRules(db);
      expect(all).toHaveLength(14);
    });

    it('is idempotent — does not duplicate rules on re-seed', () => {
      const { db } = setup();
      seedBuiltInRules(db, sign);
      const secondSeed = seedBuiltInRules(db, sign);
      expect(secondSeed).toBe(0);
      expect(listRules(db)).toHaveLength(14);
    });

    it('contains all expected rule names', () => {
      const names = getBuiltInRuleNames();
      expect(names).toContain('workflow-router');
      expect(names).toContain('decision-fidelity');
      expect(names).toContain('learning-loop');
      expect(names).toContain('output-quality-gate');
      expect(names).toContain('search-first');
      expect(names).toContain('discovery-levels');
      expect(names).toContain('session-continuity');
      expect(names).toContain('verification-automation');
      expect(names).toContain('package-manager-detection');
      expect(names).toHaveLength(14);
    });

    it('seeded rules have proper enforcement levels', () => {
      const { db } = setup();
      seedBuiltInRules(db, sign);

      const workflowRouter = getRuleByName(db, 'workflow-router')!;
      expect(workflowRouter.enforcement).toBe('hard');

      const discoveryLevels = getRuleByName(db, 'discovery-levels')!;
      expect(discoveryLevels.enforcement).toBe('advisory');

      const searchFirst = getRuleByName(db, 'search-first')!;
      expect(searchFirst.enforcement).toBe('soft');
    });

    it('seeded rules have trigger conditions and constraints', () => {
      const { db } = setup();
      seedBuiltInRules(db, sign);

      const rule = getRuleByName(db, 'workflow-router')!;
      expect(rule.trigger_conditions.length).toBeGreaterThan(0);
      expect(rule.constraints.length).toBeGreaterThan(0);
      expect(rule.content).toContain('**What:**');
      expect(rule.content).toContain('**Why:**');
    });

    it('preserves user modifications on re-seed', () => {
      const { db } = setup();
      seedBuiltInRules(db, sign);

      const rule = getRuleByName(db, 'workflow-router')!;
      updateRule(db, rule.id, { description: 'User modified' }, sign);

      seedBuiltInRules(db, sign);
      const after = getRuleByName(db, 'workflow-router')!;
      expect(after.description).toBe('User modified');
    });
  });
});
