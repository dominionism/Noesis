import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  insertCapsule,
  getCapsule,
  getCapsuleByName,
  updateCapsule,
  deleteCapsule,
  listCapsules,
  insertComponent,
  getComponents,
  getComponent,
  updateComponent,
  deleteComponent,
} from '../../cognitive/capsules/capsule-store.js';
import {
  matchCapsule,
  recordCapsuleMatch,
  recordCapsuleOutcome,
  formatCapsuleForContext,
} from '../../cognitive/capsules/capsule-engine.js';
import {
  assembleCapsule,
  formatAssembledCapsule,
} from '../../cognitive/capsules/capsule-assembly.js';
import {
  seedBuiltInCapsules,
  getBuiltInCapsuleNames,
  getBuiltInCapsuleCount,
} from '../../cognitive/capsules/built-in-capsules.js';
import type { DeepCapsuleInput, CapsuleComponentType } from '../../cognitive/types.js';
import type { Memory } from '../../types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-capsules-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Deep Capsule System', () => {
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

  const sampleCapsule: DeepCapsuleInput = {
    name: 'test-capsule',
    display_name: 'Test Capsule',
    description: 'A test capsule for unit tests.',
    trigger_patterns: ['testing', 'unit test', 'test coverage', 'tdd'],
  };

  // -----------------------------------------------------------------------
  // Capsule Store CRUD
  // -----------------------------------------------------------------------

  describe('capsule-store', () => {
    it('inserts and retrieves a capsule by ID', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);

      expect(capsule.id).toBeTruthy();
      expect(capsule.name).toBe('test-capsule');
      expect(capsule.display_name).toBe('Test Capsule');
      expect(capsule.match_count).toBe(0);
      expect(capsule.success_rate).toBe(0.5);
      expect(capsule.enabled).toBe(true);

      const retrieved = getCapsule(db, capsule.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.trigger_patterns).toEqual(['testing', 'unit test', 'test coverage', 'tdd']);
    });

    it('retrieves by name', () => {
      const { db } = setup();
      insertCapsule(db, sampleCapsule, sign);
      const capsule = getCapsuleByName(db, 'test-capsule');
      expect(capsule).not.toBeNull();
      expect(capsule!.description).toBe('A test capsule for unit tests.');
    });

    it('returns null for missing capsules', () => {
      const { db } = setup();
      expect(getCapsule(db, 'nonexistent')).toBeNull();
      expect(getCapsuleByName(db, 'nonexistent')).toBeNull();
    });

    it('updates a capsule', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);

      updateCapsule(db, capsule.id, {
        description: 'Updated description',
        match_count: 5,
        success_rate: 0.8,
      }, sign);

      const updated = getCapsule(db, capsule.id);
      expect(updated!.description).toBe('Updated description');
      expect(updated!.match_count).toBe(5);
      expect(updated!.success_rate).toBe(0.8);
    });

    it('throws on update of non-existent capsule', () => {
      const { db } = setup();
      expect(() => updateCapsule(db, 'nonexistent', { description: 'x' }, sign)).toThrow('Capsule not found');
    });

    it('deletes a capsule', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);
      deleteCapsule(db, capsule.id);
      expect(getCapsule(db, capsule.id)).toBeNull();
    });

    it('lists capsules with filters', () => {
      const { db } = setup();
      insertCapsule(db, { ...sampleCapsule, name: 'capsule-a' }, sign);
      insertCapsule(db, { ...sampleCapsule, name: 'capsule-b' }, sign);
      insertCapsule(db, { ...sampleCapsule, name: 'capsule-c' }, sign);

      const all = listCapsules(db);
      expect(all).toHaveLength(3);

      // Disable one and filter
      const capsuleB = getCapsuleByName(db, 'capsule-b')!;
      updateCapsule(db, capsuleB.id, { enabled: false }, sign);

      const enabled = listCapsules(db, { enabled: true });
      expect(enabled).toHaveLength(2);

      const disabled = listCapsules(db, { enabled: false });
      expect(disabled).toHaveLength(1);
      expect(disabled[0].name).toBe('capsule-b');
    });

    it('cascade deletes components when capsule is deleted', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);
      insertComponent(db, { capsule_id: capsule.id, component_type: 'intent', content: 'Test intent' }, sign);
      insertComponent(db, { capsule_id: capsule.id, component_type: 'assembly', content: 'Test assembly' }, sign);

      expect(getComponents(db, capsule.id)).toHaveLength(2);
      deleteCapsule(db, capsule.id);
      expect(getComponents(db, capsule.id)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Component CRUD
  // -----------------------------------------------------------------------

  describe('component-store', () => {
    it('inserts and retrieves components', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);

      const comp = insertComponent(db, {
        capsule_id: capsule.id,
        component_type: 'intent',
        content: 'The intent of this capsule is testing.',
      }, sign);

      expect(comp.id).toBeTruthy();
      expect(comp.component_type).toBe('intent');

      const components = getComponents(db, capsule.id);
      expect(components).toHaveLength(1);
      expect(components[0].content).toBe('The intent of this capsule is testing.');
    });

    it('retrieves a specific component by type', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);
      insertComponent(db, { capsule_id: capsule.id, component_type: 'intent', content: 'Intent content' }, sign);
      insertComponent(db, { capsule_id: capsule.id, component_type: 'critic', content: 'Critic content' }, sign);

      const intent = getComponent(db, capsule.id, 'intent');
      expect(intent).not.toBeNull();
      expect(intent!.content).toBe('Intent content');

      const critic = getComponent(db, capsule.id, 'critic');
      expect(critic).not.toBeNull();
      expect(critic!.content).toBe('Critic content');

      expect(getComponent(db, capsule.id, 'grader')).toBeNull();
    });

    it('updates a component', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);
      const comp = insertComponent(db, {
        capsule_id: capsule.id,
        component_type: 'intent',
        content: 'Original intent',
      }, sign);

      updateComponent(db, comp.id, 'Updated intent', sign);

      const updated = getComponent(db, capsule.id, 'intent');
      expect(updated!.content).toBe('Updated intent');
    });

    it('throws on update of non-existent component', () => {
      const { db } = setup();
      expect(() => updateComponent(db, 'nonexistent', 'x', sign)).toThrow('Component not found');
    });

    it('deletes a component', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);
      const comp = insertComponent(db, {
        capsule_id: capsule.id,
        component_type: 'intent',
        content: 'To be deleted',
      }, sign);

      deleteComponent(db, comp.id);
      expect(getComponent(db, capsule.id, 'intent')).toBeNull();
    });

    it('enforces unique component type per capsule', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);
      insertComponent(db, { capsule_id: capsule.id, component_type: 'intent', content: 'First' }, sign);

      expect(() =>
        insertComponent(db, { capsule_id: capsule.id, component_type: 'intent', content: 'Duplicate' }, sign),
      ).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Capsule Engine
  // -----------------------------------------------------------------------

  describe('capsule-engine', () => {
    it('matches capsules by trigger keyword', () => {
      const { db } = setup();
      insertCapsule(db, sampleCapsule, sign);
      insertCapsule(db, {
        ...sampleCapsule,
        name: 'security-capsule',
        trigger_patterns: ['security', 'vulnerability', 'owasp'],
      }, sign);

      const matches = matchCapsule(db, 'review test coverage and write unit tests', ['test', 'coverage'], null, {
        maxResults: 3,
      });
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].capsule.name).toBe('test-capsule');
    });

    it('excludes specified capsules', () => {
      const { db } = setup();
      insertCapsule(db, sampleCapsule, sign);

      const matches = matchCapsule(db, 'testing strategy', ['testing'], null, {
        excludeCapsules: ['test-capsule'],
      });
      expect(matches.every(m => m.capsule.name !== 'test-capsule')).toBe(true);
    });

    it('records match count', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);
      expect(getCapsule(db, capsule.id)!.match_count).toBe(0);

      recordCapsuleMatch(db, capsule.id, sign);
      expect(getCapsule(db, capsule.id)!.match_count).toBe(1);

      recordCapsuleMatch(db, capsule.id, sign);
      expect(getCapsule(db, capsule.id)!.match_count).toBe(2);
    });

    it('records outcome with Bayesian update', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);

      recordCapsuleOutcome(db, capsule.id, 'success', sign);
      let updated = getCapsule(db, capsule.id)!;
      expect(updated.match_count).toBe(1);
      expect(updated.success_rate).toBeGreaterThan(0.5);

      recordCapsuleOutcome(db, capsule.id, 'failure', sign);
      updated = getCapsule(db, capsule.id)!;
      expect(updated.match_count).toBe(2);
    });

    it('formats capsule for context', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);
      const formatted = formatCapsuleForContext(getCapsule(db, capsule.id)!, 10000);
      expect(formatted).toContain('## Capsule: Test Capsule');
      expect(formatted).toContain('A test capsule for unit tests.');
    });

    it('truncates when exceeding token budget', () => {
      const { db } = setup();
      const capsule = insertCapsule(db, sampleCapsule, sign);
      const formatted = formatCapsuleForContext(getCapsule(db, capsule.id)!, 5);
      expect(formatted).toContain('[truncated]');
    });
  });

  // -----------------------------------------------------------------------
  // Capsule Assembly
  // -----------------------------------------------------------------------

  describe('capsule-assembly', () => {
    function setupCapsuleWithComponents(db: DatabaseConnection) {
      const capsule = insertCapsule(db, sampleCapsule, sign);
      const types: CapsuleComponentType[] = [
        'intent', 'assembly', 'examples', 'anti_patterns',
        'critic', 'grader', 'memory_policy',
      ];
      for (const type of types) {
        insertComponent(db, {
          capsule_id: capsule.id,
          component_type: type,
          content: `${type} content for testing.`,
        }, sign);
      }
      return capsule;
    }

    it('assembles capsule with all components', () => {
      const { db } = setup();
      const capsule = setupCapsuleWithComponents(db);
      const def = getCapsule(db, capsule.id)!;

      const assembled = assembleCapsule(db, def, [], []);

      expect(assembled.definition.name).toBe('test-capsule');
      expect(Object.keys(assembled.components)).toHaveLength(7);
      expect(assembled.components.intent).toBe('intent content for testing.');
      expect(assembled.components.critic).toBe('critic content for testing.');
    });

    it('enriches with memory examples sorted by outcome', () => {
      const { db } = setup();
      const capsule = setupCapsuleWithComponents(db);
      const def = getCapsule(db, capsule.id)!;

      const memories: Memory[] = [
        createMockMemory('mem-1', 'Failed task', 'failed', 0.8),
        createMockMemory('mem-2', 'Successful task', 'success', 0.7),
        createMockMemory('mem-3', 'Partial success', 'partial_success', 0.9),
      ];

      const assembled = assembleCapsule(db, def, memories, []);

      // Success should be first (sorted by outcome rank)
      expect(assembled.enrichments.memory_examples[0].title).toBe('Successful task');
      expect(assembled.enrichments.memory_examples[1].title).toBe('Partial success');
    });

    it('includes user preferences', () => {
      const { db } = setup();
      const capsule = setupCapsuleWithComponents(db);
      const def = getCapsule(db, capsule.id)!;

      const assembled = assembleCapsule(db, def, [], ['Prefer TypeScript', 'Use tabs']);

      expect(assembled.enrichments.user_preferences).toEqual(['Prefer TypeScript', 'Use tabs']);
    });

    it('synthesizes anti-patterns from failure memories', () => {
      const { db } = setup();
      const capsule = setupCapsuleWithComponents(db);
      const def = getCapsule(db, capsule.id)!;

      const memories: Memory[] = [
        createMockMemory('mem-1', 'SQL injection vulnerability', 'failed', 0.8),
        createMockMemory('mem-2', 'Good implementation', 'success', 0.9),
      ];

      const assembled = assembleCapsule(db, def, memories, []);

      expect(assembled.enrichments.synthesized_anti_patterns.length).toBeGreaterThan(0);
      expect(assembled.enrichments.synthesized_anti_patterns[0]).toContain('SQL injection vulnerability');
    });

    it('formats assembled capsule as markdown', () => {
      const { db } = setup();
      const capsule = setupCapsuleWithComponents(db);
      const def = getCapsule(db, capsule.id)!;

      const assembled = assembleCapsule(db, def, [], ['Use ESM imports']);
      const formatted = formatAssembledCapsule(assembled, 10000);

      expect(formatted).toContain('## Capsule: Test Capsule');
      expect(formatted).toContain('### Intent');
      expect(formatted).toContain('### Anti-Patterns');
      expect(formatted).toContain('### User Preferences');
    });

    it('respects token budget during formatting', () => {
      const { db } = setup();
      const capsule = setupCapsuleWithComponents(db);
      const def = getCapsule(db, capsule.id)!;

      const assembled = assembleCapsule(db, def, [], []);
      const formatted = formatAssembledCapsule(assembled, 20);

      // Should fit within ~80 chars (20 tokens * 4)
      // The header alone will use some budget, so we just check it exists
      expect(formatted.length).toBeLessThan(200);
    });
  });

  // -----------------------------------------------------------------------
  // Built-In Capsules
  // -----------------------------------------------------------------------

  describe('built-in-capsules', () => {
    it('seeds all 7 built-in capsules', () => {
      const { db } = setup();
      const seeded = seedBuiltInCapsules(db, sign);
      expect(seeded).toBe(7);

      const all = listCapsules(db);
      expect(all).toHaveLength(7);
    });

    it('is idempotent', () => {
      const { db } = setup();
      seedBuiltInCapsules(db, sign);
      const secondSeed = seedBuiltInCapsules(db, sign);
      expect(secondSeed).toBe(0);
      expect(listCapsules(db)).toHaveLength(7);
    });

    it('contains all expected capsule names', () => {
      const names = getBuiltInCapsuleNames();
      expect(names).toContain('api-workflow');
      expect(names).toContain('creative-redesign');
      expect(names).toContain('security-hardening');
      expect(names).toContain('performance-optimization');
      expect(names).toContain('migration');
      expect(names).toContain('testing-strategy');
      expect(names).toContain('refactoring');
      expect(names).toHaveLength(7);
    });

    it('reports correct count', () => {
      expect(getBuiltInCapsuleCount()).toBe(7);
    });

    it('seeded capsules have all 7 components', () => {
      const { db } = setup();
      seedBuiltInCapsules(db, sign);

      const all = listCapsules(db);
      for (const capsule of all) {
        const components = getComponents(db, capsule.id);
        expect(components).toHaveLength(7);

        // Verify all 7 component types exist
        const types = components.map(c => c.component_type).sort();
        expect(types).toEqual([
          'anti_patterns', 'assembly', 'critic',
          'examples', 'grader', 'intent', 'memory_policy',
        ]);
      }
    });

    it('seeded capsules have trigger patterns', () => {
      const { db } = setup();
      seedBuiltInCapsules(db, sign);

      const all = listCapsules(db);
      for (const capsule of all) {
        expect(capsule.trigger_patterns.length).toBeGreaterThan(0);
      }
    });

    it('seeded capsules are assembable', () => {
      const { db } = setup();
      seedBuiltInCapsules(db, sign);

      const apiCapsule = getCapsuleByName(db, 'api-workflow')!;
      const assembled = assembleCapsule(db, apiCapsule, [], []);

      expect(assembled.definition.name).toBe('api-workflow');
      expect(assembled.components.intent).toBeTruthy();
      expect(assembled.components.assembly).toBeTruthy();
      expect(assembled.components.critic).toBeTruthy();
      expect(Object.keys(assembled.components)).toHaveLength(7);
    });
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockMemory(
  id: string,
  title: string,
  outcome: Memory['outcome'],
  confidence: number,
): Memory {
  const now = new Date().toISOString();
  return {
    id,
    type: 'task',
    title,
    content: `Content for ${title}`,
    tags: [],
    project_id: null,
    scope: 'global',
    sensitivity: 'INTERNAL',
    confidence,
    outcome,
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
