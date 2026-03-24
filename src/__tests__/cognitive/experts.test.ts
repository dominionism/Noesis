import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  insertExpert,
  getExpert,
  getExpertByName,
  updateExpert,
  deleteExpert,
  listExperts,
} from '../../cognitive/experts/expert-store.js';
import {
  routeToExpert,
  shouldRouteToExpert,
  formatExpertForContext,
} from '../../cognitive/experts/expert-router.js';
import {
  recordExpertOutcome,
  getExpertPerformance,
} from '../../cognitive/experts/expert-tracker.js';
import {
  seedBuiltInExperts,
  getBuiltInExpertNames,
} from '../../cognitive/experts/built-in-experts.js';
import {
  initializeExperts,
  findExpertForTask,
} from '../../cognitive/experts/expert-registry.js';
import type { ExpertDefinitionInput } from '../../cognitive/types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-experts-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Expert Agent System', () => {
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

  const sampleExpert: ExpertDefinitionInput = {
    name: 'test-expert',
    display_name: 'Test Expert',
    role: 'Test role',
    domain: 'Testing',
    category: 'code_quality',
    trigger_conditions: ['testing', 'quality assurance', 'test coverage'],
    scope: { can: ['Write tests', 'Review coverage'], cannot: ['Deploy code'] },
    deliverables: ['Test suites', 'Coverage reports'],
    anti_patterns: ['Skipping edge cases'],
    grading_criteria: [{ dimension: 'Coverage', weight: 1.0, description: 'Test coverage' }],
    tools: ['Read', 'Bash'],
    content: 'A test expert for unit tests.',
  };

  // -----------------------------------------------------------------------
  // Expert Store CRUD
  // -----------------------------------------------------------------------

  describe('expert-store', () => {
    it('inserts and retrieves an expert by ID', () => {
      const { db } = setup();
      const expert = insertExpert(db, sampleExpert, sign);

      expect(expert.id).toBeTruthy();
      expect(expert.name).toBe('test-expert');
      expect(expert.display_name).toBe('Test Expert');
      expect(expert.category).toBe('code_quality');
      expect(expert.task_count).toBe(0);
      expect(expert.success_rate).toBe(0.5);
      expect(expert.enabled).toBe(true);

      const retrieved = getExpert(db, expert.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.trigger_conditions).toEqual(['testing', 'quality assurance', 'test coverage']);
      expect(retrieved!.scope.can).toEqual(['Write tests', 'Review coverage']);
      expect(retrieved!.scope.cannot).toEqual(['Deploy code']);
      expect(retrieved!.anti_patterns).toEqual(['Skipping edge cases']);
    });

    it('retrieves by name', () => {
      const { db } = setup();
      insertExpert(db, sampleExpert, sign);
      const expert = getExpertByName(db, 'test-expert');
      expect(expert).not.toBeNull();
      expect(expert!.role).toBe('Test role');
    });

    it('returns null for missing experts', () => {
      const { db } = setup();
      expect(getExpert(db, 'nonexistent')).toBeNull();
      expect(getExpertByName(db, 'nonexistent')).toBeNull();
    });

    it('updates an expert', () => {
      const { db } = setup();
      const expert = insertExpert(db, sampleExpert, sign);

      updateExpert(db, expert.id, {
        role: 'Updated role',
        task_count: 5,
        success_rate: 0.8,
      }, sign);

      const updated = getExpert(db, expert.id);
      expect(updated!.role).toBe('Updated role');
      expect(updated!.task_count).toBe(5);
      expect(updated!.success_rate).toBe(0.8);
    });

    it('throws on update of non-existent expert', () => {
      const { db } = setup();
      expect(() => updateExpert(db, 'nonexistent', { role: 'x' }, sign)).toThrow('Expert not found');
    });

    it('deletes an expert', () => {
      const { db } = setup();
      const expert = insertExpert(db, sampleExpert, sign);
      deleteExpert(db, expert.id);
      expect(getExpert(db, expert.id)).toBeNull();
    });

    it('lists experts with filters', () => {
      const { db } = setup();
      insertExpert(db, { ...sampleExpert, name: 'expert-a', category: 'code_quality' }, sign);
      insertExpert(db, { ...sampleExpert, name: 'expert-b', category: 'architecture' }, sign);
      insertExpert(db, { ...sampleExpert, name: 'expert-c', category: 'code_quality' }, sign);

      const all = listExperts(db);
      expect(all).toHaveLength(3);

      const codeQuality = listExperts(db, { category: 'code_quality' });
      expect(codeQuality).toHaveLength(2);

      const arch = listExperts(db, { category: 'architecture' });
      expect(arch).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Expert Router
  // -----------------------------------------------------------------------

  describe('expert-router', () => {
    it('routes by trigger keyword matching', () => {
      const { db } = setup();
      insertExpert(db, sampleExpert, sign);
      insertExpert(db, {
        ...sampleExpert,
        name: 'arch-expert',
        category: 'architecture',
        trigger_conditions: ['architecture', 'system design', 'scalability'],
      }, sign);

      const matches = routeToExpert(db, 'review test coverage', ['test', 'coverage'], null);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].expert.name).toBe('test-expert');
    });

    it('respects category preference', () => {
      const { db } = setup();
      insertExpert(db, sampleExpert, sign);
      insertExpert(db, {
        ...sampleExpert,
        name: 'design-expert',
        category: 'design',
        trigger_conditions: ['design', 'review'],
      }, sign);

      const matches = routeToExpert(db, 'review the design', ['review', 'design'], null, {
        preferCategory: 'design',
      });
      expect(matches.some(m => m.expert.name === 'design-expert')).toBe(true);
    });

    it('excludes specified experts', () => {
      const { db } = setup();
      insertExpert(db, sampleExpert, sign);

      const matches = routeToExpert(db, 'testing', ['testing'], null, {
        excludeExperts: ['test-expert'],
      });
      expect(matches.every(m => m.expert.name !== 'test-expert')).toBe(true);
    });

    it('shouldRouteToExpert returns false for short tasks', () => {
      expect(shouldRouteToExpert('fix typo')).toBe(false);
    });

    it('shouldRouteToExpert returns true for complex tasks', () => {
      expect(shouldRouteToExpert('refactor the authentication module to use JWT tokens and fix security vulnerabilities')).toBe(true);
    });

    it('formats expert for context', () => {
      const { db } = setup();
      const expert = insertExpert(db, sampleExpert, sign);
      const formatted = formatExpertForContext(getExpert(db, expert.id)!, 10000);
      expect(formatted).toContain('## Expert: Test Expert');
      expect(formatted).toContain('**Role:** Test role');
      expect(formatted).toContain('Write tests');
    });

    it('truncates when exceeding token budget', () => {
      const { db } = setup();
      const expert = insertExpert(db, sampleExpert, sign);
      const formatted = formatExpertForContext(getExpert(db, expert.id)!, 5);
      expect(formatted).toContain('[truncated]');
    });
  });

  // -----------------------------------------------------------------------
  // Expert Tracker
  // -----------------------------------------------------------------------

  describe('expert-tracker', () => {
    it('records outcomes and updates success rate', () => {
      const { db } = setup();
      const expert = insertExpert(db, sampleExpert, sign);

      recordExpertOutcome(db, expert.id, 'Write test suite', 'success', sign);
      let updated = getExpert(db, expert.id)!;
      expect(updated.task_count).toBe(1);
      expect(updated.success_rate).toBeGreaterThan(0.5);

      recordExpertOutcome(db, expert.id, 'Write failing test', 'failure', sign, 'logic_error');
      updated = getExpert(db, expert.id)!;
      expect(updated.task_count).toBe(2);
    });

    it('retrieves performance statistics', () => {
      const { db } = setup();
      const expert = insertExpert(db, sampleExpert, sign);

      recordExpertOutcome(db, expert.id, 'Task 1', 'success', sign);
      recordExpertOutcome(db, expert.id, 'Task 2', 'success', sign);
      recordExpertOutcome(db, expert.id, 'Task 3', 'failure', sign, 'logic_error');

      const perf = getExpertPerformance(db, expert.id);
      expect(perf.task_count).toBe(3);
      expect(perf.success_rate).toBeCloseTo(2 / 3, 5);
      expect(perf.common_failures).toContain('logic_error');
    });

    it('creates cognitive_outcomes records', () => {
      const { db } = setup();
      const expert = insertExpert(db, sampleExpert, sign);

      recordExpertOutcome(db, expert.id, 'Test task', 'success', sign, undefined, 'passed all checks');

      const outcomes = db.prepare<[string], { entity_id: string; outcome: string }>(
        'SELECT entity_id, outcome FROM cognitive_outcomes WHERE entity_type = ? AND entity_id = ?',
      ).all('expert', expert.id);
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe('success');
    });
  });

  // -----------------------------------------------------------------------
  // Built-In Experts
  // -----------------------------------------------------------------------

  describe('built-in-experts', () => {
    it('seeds all 37 built-in experts', () => {
      const { db } = setup();
      const seeded = seedBuiltInExperts(db, sign);
      expect(seeded).toBe(37);

      const all = listExperts(db);
      expect(all).toHaveLength(37);
    });

    it('is idempotent', () => {
      const { db } = setup();
      seedBuiltInExperts(db, sign);
      const secondSeed = seedBuiltInExperts(db, sign);
      expect(secondSeed).toBe(0);
      expect(listExperts(db)).toHaveLength(37);
    });

    it('contains all expected expert names', () => {
      const names = getBuiltInExpertNames();
      expect(names).toContain('architect');
      expect(names).toContain('developer');
      expect(names).toContain('qa-engineer');
      expect(names).toContain('ux-expert');
      expect(names).toContain('gsd-planner');
      expect(names).toContain('gsd-executor');
      expect(names).toContain('rpi-critic');
      expect(names).toContain('trace-grader');
      expect(names).toHaveLength(37);
    });

    it('seeded experts have proper categories', () => {
      const { db } = setup();
      seedBuiltInExperts(db, sign);

      const architect = getExpertByName(db, 'architect')!;
      expect(architect.category).toBe('architecture');
      expect(architect.model_preference).toBe('opus');

      const gsdPlanner = getExpertByName(db, 'gsd-planner')!;
      expect(gsdPlanner.category).toBe('gsd');
    });

    it('seeded experts have trigger conditions and scope', () => {
      const { db } = setup();
      seedBuiltInExperts(db, sign);

      const dev = getExpertByName(db, 'developer')!;
      expect(dev.trigger_conditions.length).toBeGreaterThan(0);
      expect(dev.scope.can.length).toBeGreaterThan(0);
      expect(dev.scope.cannot.length).toBeGreaterThan(0);
      expect(dev.deliverables.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Expert Registry
  // -----------------------------------------------------------------------

  describe('expert-registry', () => {
    it('initializes experts', () => {
      const { db } = setup();
      const count = initializeExperts(db, sign);
      expect(count).toBe(37);
    });

    it('findExpertForTask returns null for simple tasks', () => {
      const { db } = setup();
      initializeExperts(db, sign);
      const match = findExpertForTask(db, 'fix typo', ['typo'], null);
      expect(match).toBeNull();
    });

    it('findExpertForTask matches for complex tasks', () => {
      const { db } = setup();
      initializeExperts(db, sign);
      const match = findExpertForTask(db, 'design the system architecture for the new microservice and evaluate scalability trade-offs', ['architecture', 'scalability', 'design'], null);
      expect(match).not.toBeNull();
      expect(match!.expert.category).toBe('architecture');
    });
  });
});
