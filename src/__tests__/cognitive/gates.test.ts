import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  computeEvidenceBackedReadiness,
  getHistoricalReadinessCorrelation,
  recordReadinessOutcome,
} from '../../cognitive/gates/readiness-gate.js';
import type { EnhancedReadinessInput, ReadinessEvidence } from '../../cognitive/gates/readiness-gate.js';
import {
  checkCreativeGate,
  checkApiGate,
  shouldApplyQualityGate,
  formatGateResult,
  recordQualityGateOutcome,
  getGateEffectiveness,
  suggestGateAdjustment,
} from '../../cognitive/gates/output-quality-gate.js';
import {
  detectVerificationCapabilities,
  createVerificationPlan,
  formatVerificationPlan,
} from '../../cognitive/gates/verification-gate.js';
import type { Memory } from '../../types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-gates-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'mem-1',
    type: 'task',
    title: overrides.title ?? 'Test memory',
    content: overrides.content ?? 'Memory content',
    tags: [],
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence: overrides.confidence ?? 0.8,
    outcome: overrides.outcome ?? 'success',
    source: 'agent',
    embedding: null,
    embedding_model: null,
    signature: 'sig_test',
    status: 'active',
    access_count: 0,
    created_at: now,
    updated_at: now,
    last_accessed_at: now,
    expires_at: null,
    superseded_by: null,
    session_id: null,
  };
}

function makeReadinessInput(overrides: Partial<EnhancedReadinessInput> = {}): EnhancedReadinessInput {
  return {
    taskDescription: overrides.taskDescription ?? 'Implement a new feature with proper testing and documentation',
    hasGoal: overrides.hasGoal ?? true,
    hasDeliverable: overrides.hasDeliverable ?? true,
    constraintsIdentified: overrides.constraintsIdentified ?? 3,
    codebaseExplored: overrides.codebaseExplored ?? true,
    architectureUnderstood: overrides.architectureUnderstood ?? true,
    risksIdentified: overrides.risksIdentified ?? 2,
    hasVerificationPlan: overrides.hasVerificationPlan ?? true,
    validationCriteria: overrides.validationCriteria ?? 2,
  };
}

function makeEvidence(overrides: Partial<ReadinessEvidence> = {}): ReadinessEvidence {
  return {
    similarPastTasks: overrides.similarPastTasks ?? [],
    pastReadinessOutcomes: overrides.pastReadinessOutcomes ?? [],
    relevantFailures: overrides.relevantFailures ?? [],
    relevantAntiPatternCount: overrides.relevantAntiPatternCount ?? 0,
  };
}

describe('Quality Gates', () => {
  const cleanups: Array<{ db: DatabaseConnection; dir: string }> = [];
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const { db, dir } of cleanups) {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
    DatabaseConnection.resetInstance();
  });

  function setup() {
    const ctx = createTestDb();
    cleanups.push(ctx);
    return ctx;
  }

  function createTempProject(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'noesis-verify-'));
    tempDirs.push(dir);
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(dir, path);
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(fullPath, content);
    }
    return dir;
  }

  // -----------------------------------------------------------------------
  // Readiness Gate
  // -----------------------------------------------------------------------

  describe('readiness-gate', () => {
    it('passes with complete input and no evidence', () => {
      const input = makeReadinessInput();
      const evidence = makeEvidence();

      const score = computeEvidenceBackedReadiness(input, evidence);
      expect(score.passed).toBe(true);
      expect(score.total).toBeGreaterThanOrEqual(70);
      expect(score.clarity).toBeGreaterThanOrEqual(15);
      expect(score.codebase).toBeGreaterThanOrEqual(15);
    });

    it('fails with minimal input', () => {
      const input = makeReadinessInput({
        hasGoal: false,
        hasDeliverable: false,
        constraintsIdentified: 0,
        codebaseExplored: false,
        architectureUnderstood: false,
        risksIdentified: 0,
        hasVerificationPlan: false,
        validationCriteria: 0,
      });
      const evidence = makeEvidence();

      const score = computeEvidenceBackedReadiness(input, evidence);
      expect(score.passed).toBe(false);
      expect(score.total).toBeLessThan(70);
    });

    it('boosts score with successful past tasks', () => {
      const input = makeReadinessInput({ codebaseExplored: false }); // Partially ready
      const baseScore = computeEvidenceBackedReadiness(input, makeEvidence());

      const boostedEvidence = makeEvidence({
        similarPastTasks: [
          makeMemory({ outcome: 'success' }),
          makeMemory({ id: 'mem-2', outcome: 'success' }),
          makeMemory({ id: 'mem-3', outcome: 'success' }),
        ],
      });
      const boostedScore = computeEvidenceBackedReadiness(input, boostedEvidence);

      expect(boostedScore.clarity).toBeGreaterThanOrEqual(baseScore.clarity);
    });

    it('penalizes with relevant failures', () => {
      const input = makeReadinessInput();
      const baseScore = computeEvidenceBackedReadiness(input, makeEvidence());

      const penalizedEvidence = makeEvidence({
        relevantFailures: [
          makeMemory({ outcome: 'failed' }),
          makeMemory({ id: 'mem-2', outcome: 'failed' }),
        ],
      });
      const penalizedScore = computeEvidenceBackedReadiness(input, penalizedEvidence);

      expect(penalizedScore.risks).toBeLessThanOrEqual(baseScore.risks);
    });

    it('adjusts for anti-patterns when risks not addressed', () => {
      const input = makeReadinessInput({ risksIdentified: 0 });
      const withAntiPatterns = makeEvidence({ relevantAntiPatternCount: 3 });

      const score = computeEvidenceBackedReadiness(input, withAntiPatterns);
      expect(score.risks).toBeLessThanOrEqual(0); // Penalized for unaddressed patterns
    });

    it('identifies gaps', () => {
      const input = makeReadinessInput({
        hasGoal: false,
        hasDeliverable: false,
        codebaseExplored: false,
        architectureUnderstood: false,
      });

      const score = computeEvidenceBackedReadiness(input, makeEvidence());
      expect(score.gaps.length).toBeGreaterThan(0);
      expect(score.gaps.some(g => g.dimension === 'clarity')).toBe(true);
      expect(score.gaps.some(g => g.dimension === 'codebase')).toBe(true);
    });

    it('records and queries readiness outcomes', () => {
      const { db } = setup();
      const input = makeReadinessInput();
      const score = computeEvidenceBackedReadiness(input, makeEvidence());

      recordReadinessOutcome(db, score, 'success', 'Test task', sign);

      const correlation = getHistoricalReadinessCorrelation(db);
      expect(correlation.averagePassedScore).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Output Quality Gate
  // -----------------------------------------------------------------------

  describe('output-quality-gate', () => {
    it('passes creative gate with all fields', () => {
      const result = checkCreativeGate({
        objective: 'Redesign the dashboard',
        audience: 'Product managers',
        visual_direction: 'Clean, minimal',
        references: ['Stripe dashboard'],
        banned_patterns: ['Carousels'],
        success_criteria: ['Users find data in under 3 clicks'],
      });

      expect(result.passed).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('fails creative gate with missing fields', () => {
      const result = checkCreativeGate({
        objective: 'Redesign the dashboard',
        // Missing: audience, visual_direction, references, banned_patterns, success_criteria
      });

      expect(result.passed).toBe(false);
      expect(result.missing).toContain('audience');
      expect(result.missing).toContain('visual_direction');
      expect(result.missing).toContain('references');
      expect(result.missing).toContain('banned_patterns');
      expect(result.missing).toContain('success_criteria');
    });

    it('fails creative gate with empty fields', () => {
      const result = checkCreativeGate({
        objective: '',
        audience: '  ',
        visual_direction: '',
        references: [],
        banned_patterns: [],
        success_criteria: [],
      });

      expect(result.passed).toBe(false);
      expect(result.missing).toHaveLength(6);
    });

    it('passes API gate with all fields', () => {
      const result = checkApiGate({
        contract_target: 'REST API v2',
        reference_examples: ['GET /users returns 200'],
        edge_cases: ['Empty response', 'Rate limited'],
        verification_plan: 'Integration tests with real database',
      });

      expect(result.passed).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('fails API gate with missing fields', () => {
      const result = checkApiGate({
        contract_target: 'REST API',
        // Missing: reference_examples, edge_cases, verification_plan
      });

      expect(result.passed).toBe(false);
      expect(result.missing).toContain('reference_examples');
      expect(result.missing).toContain('edge_cases');
      expect(result.missing).toContain('verification_plan');
    });

    it('detects creative gate applicability', () => {
      expect(shouldApplyQualityGate('redesign the dashboard UI', null)).toBe('creative');
      expect(shouldApplyQualityGate('fix a typo', null)).toBeNull();
      expect(shouldApplyQualityGate('task', 'creative-redesign')).toBe('creative');
    });

    it('detects API gate applicability', () => {
      expect(shouldApplyQualityGate('design the REST API contract', null)).toBe('api');
      expect(shouldApplyQualityGate('task', 'api-workflow')).toBe('api');
    });

    it('formats gate results', () => {
      const passed = checkCreativeGate({
        objective: 'x', audience: 'x', visual_direction: 'x',
        references: ['x'], banned_patterns: ['x'], success_criteria: ['x'],
      });
      expect(formatGateResult(passed)).toContain('PASSED');

      const failed = checkCreativeGate({});
      expect(formatGateResult(failed)).toContain('BLOCKED');
      expect(formatGateResult(failed)).toContain('Missing required inputs');
    });

    it('records and queries gate effectiveness', () => {
      const { db } = setup();

      recordQualityGateOutcome(db, 'creative', true, 'success', 'Task 1', sign);
      recordQualityGateOutcome(db, 'creative', true, 'failure', 'Task 2', sign);
      recordQualityGateOutcome(db, 'creative', false, 'success', 'Task 3', sign);

      const effectiveness = getGateEffectiveness(db, 'creative');
      expect(effectiveness.total).toBe(3);
      expect(effectiveness.passRate).toBeCloseTo(2 / 3, 5);
    });

    it('suggests tightening when false pass rate too high', () => {
      const suggestion = suggestGateAdjustment({
        passRate: 0.8,
        falsePassRate: 0.25,
        falseBlockRate: 0,
        total: 20,
      });
      expect(suggestion.action).toBe('tighten');
    });

    it('suggests relaxing when false block rate too high', () => {
      const suggestion = suggestGateAdjustment({
        passRate: 0.5,
        falsePassRate: 0,
        falseBlockRate: 0.35,
        total: 20,
      });
      expect(suggestion.action).toBe('relax');
    });

    it('suggests no change within acceptable range', () => {
      const suggestion = suggestGateAdjustment({
        passRate: 0.7,
        falsePassRate: 0.1,
        falseBlockRate: 0.1,
        total: 20,
      });
      expect(suggestion.action).toBe('none');
    });

    it('requires minimum data for adjustment', () => {
      const suggestion = suggestGateAdjustment({
        passRate: 0.5,
        falsePassRate: 0.5,
        falseBlockRate: 0.5,
        total: 5,
      });
      expect(suggestion.action).toBe('none');
      expect(suggestion.rationale).toContain('Insufficient data');
    });
  });

  // -----------------------------------------------------------------------
  // Verification Gate
  // -----------------------------------------------------------------------

  describe('verification-gate', () => {
    it('detects npm from package-lock.json', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
        'package-lock.json': '{}',
      });

      const caps = detectVerificationCapabilities(dir);
      expect(caps.packageManager).toBe('npm');
      expect(caps.availableScripts['test']).toBe('vitest');
    });

    it('detects pnpm from lockfile', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({ scripts: {} }),
        'pnpm-lock.yaml': '',
      });

      const caps = detectVerificationCapabilities(dir);
      expect(caps.packageManager).toBe('pnpm');
    });

    it('detects yarn from lockfile', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({ scripts: {} }),
        'yarn.lock': '',
      });

      const caps = detectVerificationCapabilities(dir);
      expect(caps.packageManager).toBe('yarn');
    });

    it('detects bun from lockfile', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({ scripts: {} }),
        'bun.lock': '',
      });

      const caps = detectVerificationCapabilities(dir);
      expect(caps.packageManager).toBe('bun');
    });

    it('detects packageManager field', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({ packageManager: 'pnpm@8.0.0', scripts: {} }),
      });

      const caps = detectVerificationCapabilities(dir);
      expect(caps.packageManager).toBe('pnpm');
    });

    it('detects available scripts', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({
          scripts: {
            test: 'vitest',
            lint: 'eslint .',
            build: 'tsc',
            typecheck: 'tsc --noEmit',
          },
        }),
      });

      const caps = detectVerificationCapabilities(dir);
      expect(caps.availableScripts['test']).toBe('vitest');
      expect(caps.availableScripts['lint']).toBe('eslint .');
      expect(caps.availableScripts['build']).toBe('tsc');
    });

    it('detects Makefile targets', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({ scripts: {} }),
        'Makefile': 'test:\n\techo test\n\nbuild:\n\techo build\n',
      });

      const caps = detectVerificationCapabilities(dir);
      expect(caps.makeTargets).toContain('test');
      expect(caps.makeTargets).toContain('build');
    });

    it('finds aggregate command', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({
          scripts: { test: 'vitest', lint: 'eslint', verify: 'npm run lint && npm run test' },
        }),
      });

      const caps = detectVerificationCapabilities(dir);
      expect(caps.aggregateCommand).toContain('verify');
    });

    it('creates verification plan', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({
          scripts: {
            test: 'vitest',
            lint: 'eslint .',
            build: 'tsc',
            typecheck: 'tsc --noEmit',
          },
        }),
      });

      const caps = detectVerificationCapabilities(dir);
      const plan = createVerificationPlan(caps);

      expect(plan.steps.length).toBeGreaterThan(0);
      // Should have typecheck, lint, test, build in order
      const descriptions = plan.steps.map(s => s.description);
      expect(descriptions).toContain('Type checking');
      expect(descriptions).toContain('Lint check');
      expect(descriptions).toContain('Run tests');
      expect(descriptions).toContain('Build verification');
    });

    it('marks test and build as blocking', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({
          scripts: { test: 'vitest', lint: 'eslint', build: 'tsc' },
        }),
      });

      const caps = detectVerificationCapabilities(dir);
      const plan = createVerificationPlan(caps);

      const testStep = plan.steps.find(s => s.description === 'Run tests');
      expect(testStep?.blocking).toBe(true);

      const lintStep = plan.steps.find(s => s.description === 'Lint check');
      expect(lintStep?.blocking).toBe(false);
    });

    it('formats verification plan', () => {
      const plan = {
        steps: [
          { command: 'npm run test', description: 'Run tests', blocking: true },
          { command: 'npm run lint', description: 'Lint check', blocking: false },
        ],
      };

      const formatted = formatVerificationPlan(plan);
      expect(formatted).toContain('### Verification Plan');
      expect(formatted).toContain('`npm run test`');
      expect(formatted).toContain('[blocking]');
    });

    it('handles empty plan', () => {
      const formatted = formatVerificationPlan({ steps: [] });
      expect(formatted).toContain('No verification capabilities detected');
    });

    it('handles project with no package.json', () => {
      const dir = createTempProject({});
      const caps = detectVerificationCapabilities(dir);
      expect(caps.packageManager).toBe('npm'); // Default
      expect(Object.keys(caps.availableScripts)).toHaveLength(0);
    });
  });
});
