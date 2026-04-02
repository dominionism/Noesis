import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import {
  upsertContext,
  getContext,
  getContextById,
  listContexts,
  updateContext,
  appendToContext,
  deleteContext,
} from '../../cognitive/context/context-store.js';
import {
  assembleContexts,
  getDecisions,
  getFailurePatterns,
  getUserTaste,
  formatContextsForPrompt,
} from '../../cognitive/context/context-engine.js';
import {
  assessContextPressure,
  shouldCreateCheckpoint,
  shouldCreateHandoff,
  remainingBudget,
  estimateRemainingCapacity,
} from '../../cognitive/context/context-pressure.js';
import {
  seedBuiltInContexts,
  getBuiltInContextTemplates,
  getBuiltInContextTypes,
  getContextTemplate,
} from '../../cognitive/context/built-in-contexts.js';
import {
  documentDecision,
  deferIdea,
} from '../../cognitive/continuity/decision-fidelity.js';
import type { ContextType } from '../../cognitive/types.js';

const sign = (content: string) => `sig_${content.length}`;

function createTestDb(): { db: DatabaseConnection; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-context-test-'));
  const db = DatabaseConnection.create(join(dir, 'test.db'));
  return { db, dir };
}

describe('Context Engine', () => {
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

  // -----------------------------------------------------------------------
  // Context Store CRUD
  // -----------------------------------------------------------------------

  describe('context-store', () => {
    it('upserts and retrieves a global context', () => {
      const { db } = setup();
      const entry = upsertContext(db, {
        context_type: 'decisions',
        content: '## Locked Decisions\n- Use TypeScript',
      }, sign);

      expect(entry.id).toBeTruthy();
      expect(entry.context_type).toBe('decisions');
      expect(entry.project_id).toBeNull();
      expect(entry.version).toBe(1);

      const retrieved = getContext(db, 'decisions');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.content).toContain('Use TypeScript');
    });

    it('upserts project-specific context', () => {
      const { db } = setup();
      upsertContext(db, {
        context_type: 'state',
        project_id: 'proj-1',
        content: 'Project 1 state',
      }, sign);

      const entry = getContext(db, 'state', 'proj-1');
      expect(entry).not.toBeNull();
      expect(entry!.project_id).toBe('proj-1');
      expect(entry!.content).toBe('Project 1 state');
    });

    it('project-specific overrides global', () => {
      const { db } = setup();
      upsertContext(db, {
        context_type: 'decisions',
        content: 'Global decisions',
      }, sign);
      upsertContext(db, {
        context_type: 'decisions',
        project_id: 'proj-1',
        content: 'Project decisions',
      }, sign);

      const entry = getContext(db, 'decisions', 'proj-1');
      expect(entry!.content).toBe('Project decisions');

      // Without project, gets global
      const global = getContext(db, 'decisions');
      expect(global!.content).toBe('Global decisions');
    });

    it('falls back to global when project context missing', () => {
      const { db } = setup();
      upsertContext(db, {
        context_type: 'decisions',
        content: 'Global decisions',
      }, sign);

      const entry = getContext(db, 'decisions', 'proj-no-override');
      expect(entry!.content).toBe('Global decisions');
    });

    it('returns null when no context exists', () => {
      const { db } = setup();
      expect(getContext(db, 'decisions')).toBeNull();
      expect(getContext(db, 'state', 'proj-1')).toBeNull();
    });

    it('increments version on upsert', () => {
      const { db } = setup();
      const first = upsertContext(db, { context_type: 'state', content: 'v1' }, sign);
      expect(first.version).toBe(1);

      const second = upsertContext(db, { context_type: 'state', content: 'v2' }, sign);
      expect(second.version).toBe(2);
      expect(second.id).toBe(first.id); // Same ID, updated
    });

    it('retrieves by ID', () => {
      const { db } = setup();
      const entry = upsertContext(db, { context_type: 'tooling', content: 'npm' }, sign);
      const retrieved = getContextById(db, entry.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.context_type).toBe('tooling');
    });

    it('lists contexts by project', () => {
      const { db } = setup();
      upsertContext(db, { context_type: 'decisions', content: 'global' }, sign);
      upsertContext(db, { context_type: 'state', content: 'global state' }, sign);
      upsertContext(db, { context_type: 'state', project_id: 'p1', content: 'p1 state' }, sign);

      const globals = listContexts(db, null);
      expect(globals).toHaveLength(2);

      const p1 = listContexts(db, 'p1');
      expect(p1).toHaveLength(1);
      expect(p1[0].content).toBe('p1 state');

      const all = listContexts(db);
      expect(all).toHaveLength(3);
    });

    it('updates context content and version', () => {
      const { db } = setup();
      const entry = upsertContext(db, { context_type: 'decisions', content: 'original' }, sign);

      updateContext(db, entry.id, 'updated content', sign);

      const updated = getContextById(db, entry.id)!;
      expect(updated.content).toBe('updated content');
      expect(updated.version).toBe(2);
    });

    it('throws on update of non-existent context', () => {
      const { db } = setup();
      expect(() => updateContext(db, 'nonexistent', 'x', sign)).toThrow('Context not found');
    });

    it('appends to existing context', () => {
      const { db } = setup();
      upsertContext(db, { context_type: 'failure_patterns', content: 'Pattern 1' }, sign);

      const updated = appendToContext(db, 'failure_patterns', null, 'Pattern 2', sign);
      expect(updated.content).toBe('Pattern 1\nPattern 2');
      expect(updated.version).toBe(2);
    });

    it('creates new context when appending to non-existent', () => {
      const { db } = setup();
      const entry = appendToContext(db, 'lessons_learned', null, 'First lesson', sign);
      expect(entry.content).toBe('First lesson');
      expect(entry.version).toBe(1);
    });

    it('deletes a context', () => {
      const { db } = setup();
      const entry = upsertContext(db, { context_type: 'state', content: 'to delete' }, sign);
      deleteContext(db, entry.id);
      expect(getContextById(db, entry.id)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Context Engine
  // -----------------------------------------------------------------------

  describe('context-engine', () => {
    it('assembles contexts in priority order', () => {
      const { db } = setup();
      upsertContext(db, { context_type: 'decisions', content: 'Decisions content' }, sign);
      upsertContext(db, { context_type: 'state', content: 'State content' }, sign);
      upsertContext(db, { context_type: 'agent_catalog', content: 'Catalog content' }, sign);

      const { contexts, totalTokens } = assembleContexts(db, null, 10000);

      expect(contexts.length).toBe(3);
      // Priority order: decisions first, then state, then agent_catalog
      expect(contexts[0].context_type).toBe('decisions');
      expect(contexts[1].context_type).toBe('state');
      expect(contexts[2].context_type).toBe('agent_catalog');
      expect(totalTokens).toBeGreaterThan(0);
    });

    it('respects token budget', () => {
      const { db } = setup();
      // Create a large context that exceeds a small budget
      upsertContext(db, { context_type: 'decisions', content: 'Short' }, sign);
      upsertContext(db, { context_type: 'state', content: 'A'.repeat(4000) }, sign); // ~1000 tokens
      upsertContext(db, { context_type: 'failure_patterns', content: 'Should not load' }, sign);

      const { contexts } = assembleContexts(db, null, 50); // Very small budget

      // Should load decisions (small) and maybe truncated state, but not failure_patterns
      expect(contexts.length).toBeLessThanOrEqual(2);
      expect(contexts[0].context_type).toBe('decisions');
    });

    it('uses project-specific contexts in assembly', () => {
      const { db } = setup();
      upsertContext(db, { context_type: 'decisions', content: 'Global decisions' }, sign);
      upsertContext(db, { context_type: 'decisions', project_id: 'p1', content: 'Project decisions' }, sign);

      const { contexts } = assembleContexts(db, 'p1', 10000);
      const decisions = contexts.find(c => c.context_type === 'decisions');
      expect(decisions!.content).toBe('Project decisions');
    });

    it('filters seeded template-only contexts from assembly', () => {
      const { db } = setup();
      seedBuiltInContexts(db, sign);

      const { contexts, totalTokens } = assembleContexts(db, null, 10000);

      expect(contexts).toHaveLength(0);
      expect(totalTokens).toBe(0);
    });

    it('keeps populated contexts while dropping placeholder-only templates', () => {
      const { db } = setup();
      seedBuiltInContexts(db, sign);
      upsertContext(db, {
        context_type: 'state',
        content: `## Project Status
Active remediation

## Current Phase
P7 implementation

## Working Set
- src/assets/registry.ts`,
      }, sign);

      const { contexts } = assembleContexts(db, null, 10000);

      expect(contexts).toHaveLength(1);
      expect(contexts[0].context_type).toBe('state');
      expect(contexts[0].content).toContain('Active remediation');
    });

    it('parses decisions into categories', () => {
      const { db } = setup();
      upsertContext(db, {
        context_type: 'decisions',
        content: `## Locked Decisions
- Use TypeScript strict mode
- SQLite for storage

## Deferred
- Mobile support
- GraphQL API

## Discretion
- Formatting preferences
- Comment style`,
      }, sign);

      const decisions = getDecisions(db);
      expect(decisions.locked).toEqual(['Use TypeScript strict mode', 'SQLite for storage']);
      expect(decisions.deferred).toEqual(['Mobile support', 'GraphQL API']);
      expect(decisions.discretion).toEqual(['Formatting preferences', 'Comment style']);
    });

    it('parses and renders decisions stored by decision-fidelity', () => {
      const { db } = setup();

      documentDecision(
        db,
        'proj-1',
        'Use TypeScript strict mode',
        'Type safety is non-negotiable',
        sign,
        { tags: ['typescript', 'quality'] },
      );
      deferIdea(
        db,
        'proj-1',
        'Add GraphQL API',
        'Deferred until after MVP',
        sign,
      );

      const decisions = getDecisions(db, 'proj-1');
      expect(decisions.locked).toEqual(['Use TypeScript strict mode']);
      expect(decisions.deferred).toEqual(['Add GraphQL API']);

      const { contexts } = assembleContexts(db, 'proj-1', 10000);
      const decisionsCtx = contexts.find(c => c.context_type === 'decisions');
      expect(decisionsCtx).toBeDefined();
      expect(decisionsCtx!.content).toContain('- Use TypeScript strict mode');
      expect(decisionsCtx!.content).toContain('Why: Type safety is non-negotiable');
      expect(decisionsCtx!.content).toContain('## Deferred');
      expect(decisionsCtx!.content).not.toContain('"decisions"');
    });

    it('returns empty decisions when no context', () => {
      const { db } = setup();
      const decisions = getDecisions(db);
      expect(decisions.locked).toEqual([]);
      expect(decisions.deferred).toEqual([]);
      expect(decisions.discretion).toEqual([]);
    });

    it('parses failure patterns', () => {
      const { db } = setup();
      upsertContext(db, {
        context_type: 'failure_patterns',
        content: `## N+1 Query Pattern
- Trigger: ORM loop without eager loading
- Miss: Missing join/include in query
- Root Cause: Defaulting to lazy loading
- Prevention: Always use eager loading for list queries

## Missing Validation
- Trigger: User input reaching database layer
- Miss: No input validation middleware
- Root Cause: Skipped validation step
- Prevention: Add Zod schemas to all endpoints`,
      }, sign);

      const patterns = getFailurePatterns(db);
      expect(patterns).toHaveLength(2);
      expect(patterns[0].trigger).toBe('ORM loop without eager loading');
      expect(patterns[0].prevention).toBe('Always use eager loading for list queries');
      expect(patterns[1].rootCause).toBe('Skipped validation step');
    });

    it('parses and normalizes legacy failure-pattern writeback format', () => {
      const { db } = setup();
      upsertContext(db, {
        context_type: 'failure_patterns',
        content: `## Failure Patterns
### verification: Test suite did not cover edge case
- **Miss:** Edge case in date parsing
- **Root Cause:** No boundary tests for leap years
- **Prevention:** Add boundary tests for all date operations`,
      }, sign);

      const patterns = getFailurePatterns(db);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].trigger).toBe('Test suite did not cover edge case');
      expect(patterns[0].miss).toBe('Edge case in date parsing');
      expect(patterns[0].rootCause).toBe('No boundary tests for leap years');
      expect(patterns[0].prevention).toBe('Add boundary tests for all date operations');

      const { contexts } = assembleContexts(db, null, 10000);
      const failureCtx = contexts.find(c => c.context_type === 'failure_patterns');
      expect(failureCtx).toBeDefined();
      expect(failureCtx!.content).toContain('## verification: Test suite did not cover edge case');
      expect(failureCtx!.content).toContain('- Trigger: Test suite did not cover edge case');
      expect(failureCtx!.content).not.toContain('**Miss:**');
    });

    it('parses user taste', () => {
      const { db } = setup();
      upsertContext(db, {
        context_type: 'user_taste',
        content: `## Preferred Patterns
- Functional style
- Explicit error handling

## Disliked Patterns
- Classes for simple data
- Excessive abstraction

## Confirmations Required
- Before deleting files
- Before force pushing`,
      }, sign);

      const taste = getUserTaste(db);
      expect(taste.preferred).toEqual(['Functional style', 'Explicit error handling']);
      expect(taste.disliked).toEqual(['Classes for simple data', 'Excessive abstraction']);
      expect(taste.confirmations).toEqual(['Before deleting files', 'Before force pushing']);
    });

    it('formats contexts for prompt', () => {
      const { db } = setup();
      upsertContext(db, { context_type: 'decisions', content: 'Use TypeScript' }, sign);
      upsertContext(db, { context_type: 'state', content: 'Phase 2' }, sign);

      const { contexts } = assembleContexts(db, null, 10000);
      const formatted = formatContextsForPrompt(contexts, 10000);

      expect(formatted).toContain('### Locked Decisions');
      expect(formatted).toContain('Use TypeScript');
      expect(formatted).toContain('### Project State');
      expect(formatted).toContain('Phase 2');
    });

    it('truncates formatted contexts within budget', () => {
      const { db } = setup();
      upsertContext(db, { context_type: 'decisions', content: 'A'.repeat(1000) }, sign);

      const { contexts } = assembleContexts(db, null, 10000);
      const formatted = formatContextsForPrompt(contexts, 10); // Very small budget
      expect(formatted).toContain('[truncated]');
    });
  });

  // -----------------------------------------------------------------------
  // Context Pressure
  // -----------------------------------------------------------------------

  describe('context-pressure', () => {
    it('returns normal for low usage', () => {
      const assessment = assessContextPressure(3000, 10000);
      expect(assessment.level).toBe('normal');
      expect(assessment.percentage).toBe(0.3);
    });

    it('returns warning at 70%', () => {
      const assessment = assessContextPressure(7000, 10000);
      expect(assessment.level).toBe('warning');
      expect(assessment.percentage).toBe(0.7);
    });

    it('returns critical at 85%', () => {
      const assessment = assessContextPressure(8500, 10000);
      expect(assessment.level).toBe('critical');
      expect(assessment.percentage).toBe(0.85);
    });

    it('returns critical for zero budget', () => {
      const assessment = assessContextPressure(100, 0);
      expect(assessment.level).toBe('critical');
    });

    it('shouldCreateCheckpoint at warning', () => {
      const warning = assessContextPressure(7500, 10000);
      expect(shouldCreateCheckpoint(warning)).toBe(true);

      const normal = assessContextPressure(5000, 10000);
      expect(shouldCreateCheckpoint(normal)).toBe(false);
    });

    it('shouldCreateCheckpoint at critical too', () => {
      const critical = assessContextPressure(9000, 10000);
      expect(shouldCreateCheckpoint(critical)).toBe(true);
    });

    it('shouldCreateHandoff only at critical', () => {
      const critical = assessContextPressure(9000, 10000);
      expect(shouldCreateHandoff(critical)).toBe(true);

      const warning = assessContextPressure(7500, 10000);
      expect(shouldCreateHandoff(warning)).toBe(false);

      const normal = assessContextPressure(3000, 10000);
      expect(shouldCreateHandoff(normal)).toBe(false);
    });

    it('calculates remaining budget', () => {
      expect(remainingBudget(3000, 10000)).toBe(7000);
      expect(remainingBudget(10000, 10000)).toBe(0);
      expect(remainingBudget(12000, 10000)).toBe(0); // Clamped to 0
    });

    it('estimates remaining capacity', () => {
      expect(estimateRemainingCapacity(3000, 10000, 500)).toBe(14);
      expect(estimateRemainingCapacity(9500, 10000, 500)).toBe(1);
      expect(estimateRemainingCapacity(10000, 10000, 500)).toBe(0);
      expect(estimateRemainingCapacity(5000, 10000, 0)).toBe(0); // Division guard
    });
  });

  // -----------------------------------------------------------------------
  // Built-In Contexts
  // -----------------------------------------------------------------------

  describe('built-in-contexts', () => {
    it('seeds all 13 context templates', () => {
      const { db } = setup();
      const seeded = seedBuiltInContexts(db, sign);
      expect(seeded).toBe(13);

      const all = listContexts(db, null);
      expect(all).toHaveLength(13);
    });

    it('is idempotent', () => {
      const { db } = setup();
      seedBuiltInContexts(db, sign);
      const secondSeed = seedBuiltInContexts(db, sign);
      expect(secondSeed).toBe(0);
      expect(listContexts(db, null)).toHaveLength(13);
    });

    it('returns all 13 context types', () => {
      const types = getBuiltInContextTypes();
      expect(types).toHaveLength(13);
      expect(types).toContain('decisions');
      expect(types).toContain('state');
      expect(types).toContain('failure_patterns');
      expect(types).toContain('lessons_learned');
      expect(types).toContain('user_taste');
      expect(types).toContain('verification');
      expect(types).toContain('reference_library');
      expect(types).toContain('ui_ux');
      expect(types).toContain('artifacts');
      expect(types).toContain('tooling');
      expect(types).toContain('research_index');
      expect(types).toContain('session_index');
      expect(types).toContain('agent_catalog');
    });

    it('templates have expected structure', () => {
      const templates = getBuiltInContextTemplates();
      expect(templates.decisions).toContain('## Locked Decisions');
      expect(templates.decisions).toContain('## Deferred');
      expect(templates.decisions).toContain('## Discretion');

      expect(templates.user_taste).toContain('## Preferred Patterns');
      expect(templates.user_taste).toContain('## Disliked Patterns');
      expect(templates.user_taste).toContain('## Confirmations Required');

      expect(templates.failure_patterns).toContain('Trigger');
      expect(templates.failure_patterns).toContain('Prevention');
    });

    it('individual template retrieval works', () => {
      const template = getContextTemplate('decisions');
      expect(template).toContain('## Locked Decisions');
    });

    it('seeded contexts are retrievable with fallback', () => {
      const { db } = setup();
      seedBuiltInContexts(db, sign);

      // Global context retrievable without project
      const decisions = getContext(db, 'decisions');
      expect(decisions).not.toBeNull();
      expect(decisions!.content).toContain('## Locked Decisions');

      // Global context serves as fallback for any project
      const projDecisions = getContext(db, 'decisions', 'any-project');
      expect(projDecisions).not.toBeNull();
      expect(projDecisions!.content).toContain('## Locked Decisions');
    });

    it('seeded templates do not assemble as substantive active context', () => {
      const { db } = setup();
      seedBuiltInContexts(db, sign);

      const { contexts } = assembleContexts(db, null, 100000);
      expect(contexts).toHaveLength(0);
    });
  });
});
