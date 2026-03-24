import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  insertSkill,
  getSkill,
  getSkillByName,
  updateSkill,
  deleteSkill,
  listSkills,
  recordSkillInvocation,
} from '../../cognitive/skills/skill-store.js';
import {
  matchSkills,
  resolveSkillChain,
  formatSkillForContext,
  formatSkillsForContext,
} from '../../cognitive/skills/skill-matcher.js';
import {
  initializeSkills,
  findSkillsForTask,
  findBestSkill,
  getSkillChain,
  completeSkillInvocation,
} from '../../cognitive/skills/skill-registry.js';
import {
  seedBuiltInSkills,
  getBuiltInSkillNames,
  getBuiltInSkillCount,
} from '../../cognitive/skills/built-in-skills.js';
import type { ExecutableSkillInput } from '../../cognitive/types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-skills-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Executable Skill System', () => {
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

  const sampleSkill: ExecutableSkillInput = {
    name: 'test-skill',
    description: 'A test skill for unit testing.',
    category: 'testing',
    trigger_conditions: ['test', 'unit test', 'vitest', 'jest'],
    anti_patterns: ['Testing implementation details'],
    rules: ['Test behavior not implementation'],
    chain_with: [],
    content: 'Test skill content for testing purposes.',
  };

  // -----------------------------------------------------------------------
  // Skill Store CRUD
  // -----------------------------------------------------------------------

  describe('skill-store', () => {
    it('inserts and retrieves a skill by ID', () => {
      const { db } = setup();
      const skill = insertSkill(db, sampleSkill, sign);

      expect(skill.id).toBeTruthy();
      expect(skill.name).toBe('test-skill');
      expect(skill.category).toBe('testing');
      expect(skill.invocation_count).toBe(0);
      expect(skill.success_rate).toBe(0.5);
      expect(skill.enabled).toBe(true);
      expect(skill.version).toBe('1.0.0');

      const retrieved = getSkill(db, skill.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.trigger_conditions).toEqual(['test', 'unit test', 'vitest', 'jest']);
      expect(retrieved!.anti_patterns).toEqual(['Testing implementation details']);
      expect(retrieved!.rules).toEqual(['Test behavior not implementation']);
    });

    it('retrieves by name', () => {
      const { db } = setup();
      insertSkill(db, sampleSkill, sign);
      const skill = getSkillByName(db, 'test-skill');
      expect(skill).not.toBeNull();
      expect(skill!.description).toBe('A test skill for unit testing.');
    });

    it('returns null for missing skills', () => {
      const { db } = setup();
      expect(getSkill(db, 'nonexistent')).toBeNull();
      expect(getSkillByName(db, 'nonexistent')).toBeNull();
    });

    it('updates a skill', () => {
      const { db } = setup();
      const skill = insertSkill(db, sampleSkill, sign);

      updateSkill(db, skill.id, {
        description: 'Updated description',
        invocation_count: 10,
        success_rate: 0.9,
      }, sign);

      const updated = getSkill(db, skill.id);
      expect(updated!.description).toBe('Updated description');
      expect(updated!.invocation_count).toBe(10);
      expect(updated!.success_rate).toBe(0.9);
    });

    it('throws on update of non-existent skill', () => {
      const { db } = setup();
      expect(() => updateSkill(db, 'nonexistent', { description: 'x' }, sign)).toThrow('Skill not found');
    });

    it('deletes a skill', () => {
      const { db } = setup();
      const skill = insertSkill(db, sampleSkill, sign);
      deleteSkill(db, skill.id);
      expect(getSkill(db, skill.id)).toBeNull();
    });

    it('lists skills with category filter', () => {
      const { db } = setup();
      insertSkill(db, { ...sampleSkill, name: 'skill-a', category: 'testing' }, sign);
      insertSkill(db, { ...sampleSkill, name: 'skill-b', category: 'workflow' }, sign);
      insertSkill(db, { ...sampleSkill, name: 'skill-c', category: 'testing' }, sign);

      const all = listSkills(db);
      expect(all).toHaveLength(3);

      const testing = listSkills(db, { category: 'testing' });
      expect(testing).toHaveLength(2);

      const workflow = listSkills(db, { category: 'workflow' });
      expect(workflow).toHaveLength(1);
    });

    it('lists skills with enabled filter', () => {
      const { db } = setup();
      const skill = insertSkill(db, sampleSkill, sign);
      insertSkill(db, { ...sampleSkill, name: 'skill-disabled' }, sign);

      updateSkill(db, skill.id, { enabled: false }, sign);

      const enabled = listSkills(db, { enabled: true });
      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe('skill-disabled');
    });

    it('records invocation with Bayesian update', () => {
      const { db } = setup();
      const skill = insertSkill(db, sampleSkill, sign);

      recordSkillInvocation(db, skill.id, 'success', sign);
      let updated = getSkill(db, skill.id)!;
      expect(updated.invocation_count).toBe(1);
      expect(updated.success_rate).toBeGreaterThan(0.5);

      recordSkillInvocation(db, skill.id, 'failure', sign);
      updated = getSkill(db, skill.id)!;
      expect(updated.invocation_count).toBe(2);

      recordSkillInvocation(db, skill.id, 'partial', sign);
      updated = getSkill(db, skill.id)!;
      expect(updated.invocation_count).toBe(3);
    });

    it('throws on invocation of non-existent skill', () => {
      const { db } = setup();
      expect(() => recordSkillInvocation(db, 'nonexistent', 'success', sign)).toThrow('Skill not found');
    });
  });

  // -----------------------------------------------------------------------
  // Skill Matcher
  // -----------------------------------------------------------------------

  describe('skill-matcher', () => {
    it('matches skills by trigger keywords', () => {
      const { db } = setup();
      insertSkill(db, sampleSkill, sign);
      insertSkill(db, {
        ...sampleSkill,
        name: 'security-skill',
        category: 'quality',
        trigger_conditions: ['security', 'vulnerability', 'owasp'],
      }, sign);

      const matches = matchSkills(db, 'write unit tests with vitest', ['test', 'vitest'], null);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].skill.name).toBe('test-skill');
    });

    it('filters by category', () => {
      const { db } = setup();
      insertSkill(db, sampleSkill, sign);
      insertSkill(db, {
        ...sampleSkill,
        name: 'workflow-skill',
        category: 'workflow',
        trigger_conditions: ['plan', 'implement'],
      }, sign);

      const matches = matchSkills(db, 'test plan implementation', ['test', 'plan'], null, {
        category: 'workflow',
      });
      // Should only return workflow category skills
      for (const m of matches) {
        expect(m.skill.category).toBe('workflow');
      }
    });

    it('excludes specified skills', () => {
      const { db } = setup();
      insertSkill(db, sampleSkill, sign);

      const matches = matchSkills(db, 'testing with vitest', ['test', 'vitest'], null, {
        excludeSkills: ['test-skill'],
      });
      expect(matches.every(m => m.skill.name !== 'test-skill')).toBe(true);
    });

    it('resolves skill chain', () => {
      const { db } = setup();
      const primary = insertSkill(db, {
        ...sampleSkill,
        name: 'primary',
        chain_with: ['secondary'],
      }, sign);
      insertSkill(db, {
        ...sampleSkill,
        name: 'secondary',
        chain_with: ['tertiary'],
      }, sign);
      insertSkill(db, {
        ...sampleSkill,
        name: 'tertiary',
        chain_with: [],
      }, sign);

      const chain = resolveSkillChain(db, primary.id);
      expect(chain).toHaveLength(3);
      expect(chain[0].name).toBe('primary');
      expect(chain[1].name).toBe('secondary');
      expect(chain[2].name).toBe('tertiary');
    });

    it('prevents cycles in skill chain', () => {
      const { db } = setup();
      const skillA = insertSkill(db, {
        ...sampleSkill,
        name: 'skill-a',
        chain_with: ['skill-b'],
      }, sign);
      insertSkill(db, {
        ...sampleSkill,
        name: 'skill-b',
        chain_with: ['skill-a'], // Cycle back to A
      }, sign);

      const chain = resolveSkillChain(db, skillA.id);
      expect(chain).toHaveLength(2); // A -> B, stops because A already visited
      expect(chain[0].name).toBe('skill-a');
      expect(chain[1].name).toBe('skill-b');
    });

    it('respects max chain depth', () => {
      const { db } = setup();
      // Create a chain of 5 skills (deeper than SKILL_MAX_CHAIN_DEPTH=3)
      const s1 = insertSkill(db, { ...sampleSkill, name: 's1', chain_with: ['s2'] }, sign);
      insertSkill(db, { ...sampleSkill, name: 's2', chain_with: ['s3'] }, sign);
      insertSkill(db, { ...sampleSkill, name: 's3', chain_with: ['s4'] }, sign);
      insertSkill(db, { ...sampleSkill, name: 's4', chain_with: ['s5'] }, sign);
      insertSkill(db, { ...sampleSkill, name: 's5', chain_with: [] }, sign);

      const chain = resolveSkillChain(db, s1.id);
      // s1 at depth 0, s2 at depth 1, s3 at depth 2 — s4 would be depth 3 which is MAX
      expect(chain.length).toBeLessThanOrEqual(4);
      expect(chain[0].name).toBe('s1');
    });

    it('formats skill for context', () => {
      const { db } = setup();
      const skill = insertSkill(db, sampleSkill, sign);
      const formatted = formatSkillForContext(getSkill(db, skill.id)!, 10000);
      expect(formatted).toContain('## Skill: test-skill');
      expect(formatted).toContain('**Category:** testing');
      expect(formatted).toContain('Testing implementation details');
    });

    it('truncates when exceeding token budget', () => {
      const { db } = setup();
      const skill = insertSkill(db, sampleSkill, sign);
      const formatted = formatSkillForContext(getSkill(db, skill.id)!, 5);
      expect(formatted).toContain('[truncated]');
    });

    it('formats multiple skills with distributed budget', () => {
      const { db } = setup();
      insertSkill(db, sampleSkill, sign);
      insertSkill(db, { ...sampleSkill, name: 'skill-2' }, sign);

      const skills = listSkills(db);
      const formatted = formatSkillsForContext(skills, 10000);
      expect(formatted).toContain('test-skill');
      expect(formatted).toContain('skill-2');
      expect(formatted).toContain('---');
    });
  });

  // -----------------------------------------------------------------------
  // Skill Registry
  // -----------------------------------------------------------------------

  describe('skill-registry', () => {
    it('initializes skills (seeds built-ins)', () => {
      const { db } = setup();
      const count = initializeSkills(db, sign);
      expect(count).toBe(17);
    });

    it('findSkillsForTask returns matches', () => {
      const { db } = setup();
      initializeSkills(db, sign);

      const matches = findSkillsForTask(
        db, 'write unit tests with vitest and check coverage',
        ['test', 'vitest', 'coverage'], null,
      );
      expect(matches.length).toBeGreaterThan(0);
    });

    it('findBestSkill returns single match', () => {
      const { db } = setup();
      initializeSkills(db, sign);

      const match = findBestSkill(
        db, 'create an implementation plan for the new feature',
        ['plan', 'implementation'], null,
      );
      expect(match).not.toBeNull();
      expect(match!.skill.category).toBe('workflow');
    });

    it('getSkillChain resolves chains from built-ins', () => {
      const { db } = setup();
      initializeSkills(db, sign);

      const createPlan = getSkillByName(db, 'create-plan')!;
      const chain = getSkillChain(db, createPlan.id);
      expect(chain.length).toBeGreaterThan(1);
      expect(chain[0].name).toBe('create-plan');
      // Should include validate-plan and/or implement-plan
      const chainNames = chain.map(s => s.name);
      expect(chainNames).toContain('validate-plan');
    });

    it('completeSkillInvocation updates tracking', () => {
      const { db } = setup();
      initializeSkills(db, sign);

      const skill = getSkillByName(db, 'code-review')!;
      completeSkillInvocation(db, skill.id, 'success', sign);

      const updated = getSkill(db, skill.id)!;
      expect(updated.invocation_count).toBe(1);
      expect(updated.success_rate).toBeGreaterThan(0.5);
    });
  });

  // -----------------------------------------------------------------------
  // Built-In Skills
  // -----------------------------------------------------------------------

  describe('built-in-skills', () => {
    it('seeds all 17 built-in skills', () => {
      const { db } = setup();
      const seeded = seedBuiltInSkills(db, sign);
      expect(seeded).toBe(17);

      const all = listSkills(db);
      expect(all).toHaveLength(17);
    });

    it('is idempotent', () => {
      const { db } = setup();
      seedBuiltInSkills(db, sign);
      const secondSeed = seedBuiltInSkills(db, sign);
      expect(secondSeed).toBe(0);
      expect(listSkills(db)).toHaveLength(17);
    });

    it('contains all expected skill names', () => {
      const names = getBuiltInSkillNames();
      // Workflow
      expect(names).toContain('create-plan');
      expect(names).toContain('implement-plan');
      expect(names).toContain('iterate-plan');
      expect(names).toContain('validate-plan');
      expect(names).toContain('tdd-cycle');
      // Quality
      expect(names).toContain('code-review');
      expect(names).toContain('rpi-critique');
      expect(names).toContain('code-analysis');
      // Research
      expect(names).toContain('research-codebase');
      expect(names).toContain('prompt-handoff-optimizer');
      // Testing
      expect(names).toContain('javascript-testing-patterns');
      expect(names).toContain('python-testing-patterns');
      expect(names).toContain('e2e-testing-patterns');
      // Design
      expect(names).toContain('frontend-design');
      expect(names).toContain('superdesign');
      // Backend
      expect(names).toContain('api-design-principles');
      expect(names).toContain('supabase-postgres-best-practices');
      expect(names).toHaveLength(17);
    });

    it('reports correct count', () => {
      expect(getBuiltInSkillCount()).toBe(17);
    });

    it('seeded skills have proper categories', () => {
      const { db } = setup();
      seedBuiltInSkills(db, sign);

      const createPlan = getSkillByName(db, 'create-plan')!;
      expect(createPlan.category).toBe('workflow');

      const codeReview = getSkillByName(db, 'code-review')!;
      expect(codeReview.category).toBe('quality');

      const jsPatterns = getSkillByName(db, 'javascript-testing-patterns')!;
      expect(jsPatterns.category).toBe('testing');
    });

    it('seeded skills have trigger conditions and content', () => {
      const { db } = setup();
      seedBuiltInSkills(db, sign);

      const all = listSkills(db);
      for (const skill of all) {
        expect(skill.trigger_conditions.length).toBeGreaterThan(0);
        expect(skill.content.length).toBeGreaterThan(0);
      }
    });

    it('workflow skills have chain_with references', () => {
      const { db } = setup();
      seedBuiltInSkills(db, sign);

      const createPlan = getSkillByName(db, 'create-plan')!;
      expect(createPlan.chain_with).toContain('validate-plan');
      expect(createPlan.chain_with).toContain('implement-plan');

      const tdd = getSkillByName(db, 'tdd-cycle')!;
      expect(tdd.chain_with).toContain('code-review');
    });
  });
});
