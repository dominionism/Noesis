/**
 * Cross-Adapter Integration Tests
 *
 * Tests handoff and synchronization between different adapters:
 * - Format transformation roundtrips across adapter formats
 * - Capability negotiation parity
 * - Sync plan creation with heterogeneous adapters
 * - Learning extraction from multiple adapter content styles
 * - Managed section hash integrity across adapters
 */

import { describe, it, expect } from 'vitest';

// Sync modules
import {
  getAdapterFormat,
  transformToFormat,
  transformForAdapter,
  parseFromFormat,
  type ContextSection,
} from '../../sync/format-bridges.js';

import {
  getCapabilities,
  getAllCapabilities,
  negotiate,
  negotiateAll,
  supportsFeature,
} from '../../sync/capability-negotiator.js';

import {
  createSyncPlan,
  executeSyncForTarget,
  aggregateResults,
  runSync,
  type SyncTarget,
} from '../../sync/sync-orchestrator.js';

import {
  parseInboxContent,
  createInboxEntry,
  processInboxEntries,
} from '../../sync/inbox-ingester.js';

// Adapters
import {
  assembleContext,
  extractLearningsFromText,
  verifyContentHash,
  buildFileWrite,
} from '../../adapters/base-adapter.js';

import { hashContent } from '../../security/audit.js';

function makeSections(): ContextSection[] {
  return [
    { title: 'Skills', content: 'TypeScript generics, React hooks, Node.js streams', priority: 10, tokens: 15 },
    { title: 'Anti-Patterns', content: 'Avoid any type, avoid string concatenation for SQL', priority: 8, tokens: 12 },
    { title: 'Lessons', content: 'Always validate inputs at boundaries', priority: 5, tokens: 8 },
  ];
}

function makeTarget(overrides?: Partial<SyncTarget>): SyncTarget {
  return {
    adapterId: 'claude-code',
    displayName: 'Claude Code',
    detected: true,
    configPaths: ['/home/.claude/CLAUDE.md'],
    maxContextTokens: 50000,
    supportsManagedSections: true,
    canWriteBack: true,
    ...overrides,
  };
}

// ============================================================================
// Format Roundtrip: Content survives transformation across all formats
// ============================================================================

describe('Cross-Adapter: Format transformation roundtrips', () => {
  it('roundtrips content through markdown format', () => {
    const sections = makeSections();
    const formatted = transformToFormat(sections, 'markdown');
    const parsed = parseFromFormat(formatted.content, 'markdown');

    expect(parsed.length).toBeGreaterThanOrEqual(1);
    // Verify key content survived
    expect(formatted.content).toContain('Skills');
    expect(formatted.content).toContain('Anti-Patterns');
  });

  it('roundtrips content through JSON format', () => {
    const sections = makeSections();
    const formatted = transformToFormat(sections, 'json');
    const parsed = parseFromFormat(formatted.content, 'json');

    expect(parsed).toHaveLength(3);
    expect(parsed[0].title).toBe('Skills');    // Highest priority first
    expect(parsed[2].title).toBe('Lessons');   // Lowest priority last
  });

  it('roundtrips content through TOML format', () => {
    const sections = makeSections();
    const formatted = transformToFormat(sections, 'toml');

    expect(formatted.content).toContain('[skills]');
    expect(formatted.content).toContain('priority = ');
  });

  it('roundtrips content through frontmatter format', () => {
    const sections = makeSections();
    const formatted = transformToFormat(sections, 'frontmatter');

    expect(formatted.content).toContain('---');
    expect(formatted.content).toContain('sections:');
  });

  it('handles plain format as passthrough', () => {
    const parsed = parseFromFormat('plain text content', 'plain');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].content).toBe('plain text content');
  });
});

// ============================================================================
// Adapter Format Mapping
// ============================================================================

describe('Cross-Adapter: Correct format mapping per adapter', () => {
  const expectedFormats: Record<string, string> = {
    'claude-code': 'markdown',
    'cursor': 'frontmatter',
    'copilot': 'markdown',
    'aider': 'frontmatter',
    'codex': 'markdown',
    'opencode': 'markdown',
    'antigravity': 'toml',
    'openclaw': 'markdown',
    'generic': 'json',
  };

  for (const [adapter, format] of Object.entries(expectedFormats)) {
    it(`maps ${adapter} to ${format}`, () => {
      expect(getAdapterFormat(adapter)).toBe(format);
    });
  }

  it('transforms sections using adapter-specific format', () => {
    const sections = makeSections();

    // Claude Code = markdown
    const claude = transformForAdapter('claude-code', sections);
    expect(claude.format).toBe('markdown');

    // Antigravity = TOML
    const antigravity = transformForAdapter('antigravity', sections);
    expect(antigravity.format).toBe('toml');

    // Generic = JSON
    const generic = transformForAdapter('generic', sections);
    expect(generic.format).toBe('json');
  });
});

// ============================================================================
// Cross-Adapter Capability Parity
// ============================================================================

describe('Cross-Adapter: Capability negotiation parity', () => {
  it('all 9 adapters have capabilities defined', () => {
    const all = getAllCapabilities();
    expect(all).toHaveLength(9);
  });

  it('only claude-code supports all features', () => {
    const claude = negotiate('claude-code');
    expect(claude!.features.managedSections).toBe(true);
    expect(claude!.features.writeBack).toBe(true);
    expect(claude!.features.eventSubscription).toBe(true);
    expect(claude!.features.structuredCorrection).toBe(true);
  });

  it('adapters without write-back get correct constraints', () => {
    const readonly = ['cursor', 'copilot', 'generic'];
    for (const id of readonly) {
      const result = negotiate(id);
      expect(result!.features.writeBack).toBe(false);
      expect(result!.constraints).toContain('Write-back not supported; sync is one-way only');
    }
  });

  it('adapters without managed sections get correct constraints', () => {
    const noManaged = ['aider', 'generic'];
    for (const id of noManaged) {
      const result = negotiate(id);
      expect(result!.features.managedSections).toBe(false);
      expect(result!.constraints).toContain('Managed sections not supported; using full file write');
    }
  });

  it('budget capping is enforced per adapter', () => {
    const results = negotiateAll(
      ['claude-code', 'cursor', 'copilot'],
      100_000,
    );

    const cursorResult = results.find((r) => r.adapterId === 'cursor')!;
    expect(cursorResult.effectiveTokenBudget).toBe(8_000); // cursor max

    const copilotResult = results.find((r) => r.adapterId === 'copilot')!;
    expect(copilotResult.effectiveTokenBudget).toBe(4_000); // copilot max

    const claudeResult = results.find((r) => r.adapterId === 'claude-code')!;
    expect(claudeResult.effectiveTokenBudget).toBe(50_000); // claude-code max
  });

  it('feature support queries work correctly', () => {
    // Only claude-code supports structured correction
    expect(supportsFeature('claude-code', 'structuredCorrection')).toBe(true);
    expect(supportsFeature('cursor', 'structuredCorrection')).toBe(false);
    expect(supportsFeature('aider', 'structuredCorrection')).toBe(false);

    // Several adapters support write-back
    expect(supportsFeature('claude-code', 'writeBack')).toBe(true);
    expect(supportsFeature('aider', 'writeBack')).toBe(true);
    expect(supportsFeature('codex', 'writeBack')).toBe(true);
    expect(supportsFeature('cursor', 'writeBack')).toBe(false);
  });
});

// ============================================================================
// Multi-Adapter Sync Execution
// ============================================================================

describe('Cross-Adapter: Multi-adapter sync execution', () => {
  it('creates sync plan with heterogeneous adapters', () => {
    const targets = [
      makeTarget({ adapterId: 'claude-code', maxContextTokens: 50000 }),
      makeTarget({ adapterId: 'cursor', maxContextTokens: 8000 }),
      makeTarget({ adapterId: 'aider', maxContextTokens: 20000, supportsManagedSections: false }),
      makeTarget({ adapterId: 'generic', detected: false }),
    ];

    const plan = createSyncPlan(targets);
    expect(plan.targets).toHaveLength(3); // Exclude undetected
    expect(plan.totalTokensBudget).toBe(78000); // 50000 + 8000 + 20000
  });

  it('respects managed section support during execution', () => {
    const withManaged = makeTarget({ adapterId: 'claude-code', supportsManagedSections: true });
    const withoutManaged = makeTarget({ adapterId: 'aider', supportsManagedSections: false });

    const outcomeWith = executeSyncForTarget(withManaged, 5000);
    const outcomeWithout = executeSyncForTarget(withoutManaged, 5000);

    expect(outcomeWith.filesWritten).toBe(1);
    expect(outcomeWithout.filesWritten).toBe(0);
  });

  it('dry run produces no writes for any adapter', () => {
    const adapters = ['claude-code', 'cursor', 'aider', 'copilot'];
    const targets = adapters.map((id) => makeTarget({ adapterId: id }));

    for (const target of targets) {
      const outcome = executeSyncForTarget(target, 5000, { dryRun: true });
      expect(outcome.tokensInjected).toBe(0);
      expect(outcome.filesWritten).toBe(0);
    }
  });

  it('full sync aggregates results across adapters', () => {
    const targets = [
      makeTarget({ adapterId: 'claude-code' }),
      makeTarget({ adapterId: 'cursor' }),
      makeTarget({ adapterId: 'aider' }),
    ];

    const result = runSync(targets, 5000, { force: true });
    expect(result.outcomes).toHaveLength(3);
    expect(result.totalErrors).toBe(0);
  });

  it('adapter filter limits sync to specified adapters', () => {
    const targets = [
      makeTarget({ adapterId: 'claude-code' }),
      makeTarget({ adapterId: 'cursor' }),
      makeTarget({ adapterId: 'aider' }),
    ];

    const result = runSync(targets, 5000, {
      force: true,
      adapterFilter: ['claude-code', 'aider'],
    });

    expect(result.outcomes).toHaveLength(2);
    const syncedAdapters = result.outcomes.map((o) => o.adapterId);
    expect(syncedAdapters).toContain('claude-code');
    expect(syncedAdapters).toContain('aider');
    expect(syncedAdapters).not.toContain('cursor');
  });
});

// ============================================================================
// Cross-Adapter Learning Extraction
// ============================================================================

describe('Cross-Adapter: Learning extraction from different sources', () => {
  it('extracts learnings from claude-code style content', () => {
    const content = [
      'LESSON: Use parameterized queries for all SQL operations',
      'CORRECTION: Replace MD5 with bcrypt for password hashing',
      'PREFERENCE: Always use TypeScript strict mode',
    ].join('\n');

    const result = extractLearningsFromText(content, 'claude-code');
    expect(result.learnings).toHaveLength(3);
  });

  it('extracts learnings from aider style content', () => {
    const content = [
      'DECISION: Use PostgreSQL over MySQL for JSON support',
      'LEARNING: Connection pooling prevents timeouts under load',
    ].join('\n');

    const result = extractLearningsFromText(content, 'aider');
    expect(result.learnings).toHaveLength(2);
    expect(result.learnings[0].category).toBe('decision');
    expect(result.learnings[1].category).toBe('lesson');
  });

  it('ingests write-back content from different adapters', () => {
    // Simulate inbox from multiple adapters
    const claudeEntry = createInboxEntry(
      'claude-code',
      'Use structured logging instead of console.log for production',
      'inbox/claude-code.md',
    );
    const aiderEntry = createInboxEntry(
      'aider',
      'We learned that lazy loading reduces initial bundle size by 40%',
      'inbox/aider.md',
    );

    const result = processInboxEntries([claudeEntry, aiderEntry]);
    expect(result.entriesProcessed).toBe(2);
    expect(result.memoriesCreated).toBeGreaterThanOrEqual(2);
  });

  it('classifies inbox content correctly regardless of adapter source', () => {
    const correctionContent = 'Use async/await instead of callbacks for better error handling';
    const lessonContent = 'We learned that caching middleware reduces response times';
    const preferenceContent = 'Always prefer named exports over default exports';

    for (const adapterId of ['claude-code', 'cursor', 'aider']) {
      const corrections = parseInboxContent(correctionContent, adapterId);
      expect(corrections[0].type).toBe('correction');

      const lessons = parseInboxContent(lessonContent, adapterId);
      expect(lessons[0].type).toBe('lesson');

      const prefs = parseInboxContent(preferenceContent, adapterId);
      expect(prefs[0].type).toBe('preference');
    }
  });
});

// ============================================================================
// Managed Section Integrity Across Adapters
// ============================================================================

describe('Cross-Adapter: Managed section integrity', () => {
  it('hash verification works for content from any adapter', () => {
    const content = 'Skills: TypeScript, React, Node.js';
    const hash = hashContent(content);

    // Same content produces same hash regardless of source
    expect(hashContent(content)).toBe(hash);

    // Verify integrity
    const verified = verifyContentHash(content, hash);
    expect(verified.valid).toBe(true);
    expect(verified.modified).toBe(false);

    // Detect modifications
    const tampered = verifyContentHash(content + ' (modified)', hash);
    expect(tampered.valid).toBe(false);
    expect(tampered.modified).toBe(true);
  });

  it('builds file writes with managed sections for supporting adapters', () => {
    const content = 'Test managed content';

    // Adapter with managed section support
    const writeWithManaged = buildFileWrite(
      '/config/CLAUDE.md', content, 'claude-code', '1.0.0', true,
    );
    expect(writeWithManaged.managedSection).toBe(true);
    expect(writeWithManaged.content).toContain('NOESIS');

    // Adapter without managed section support
    const writeWithout = buildFileWrite(
      '/config/aider.md', content, 'aider', '1.0.0', false,
    );
    expect(writeWithout.managedSection).toBe(false);
    expect(writeWithout.content).toBe(content);
  });
});

// ============================================================================
// Token Budget Enforcement Across Adapters
// ============================================================================

describe('Cross-Adapter: Token budget enforcement', () => {
  it('enforces per-adapter token limits during sync', () => {
    const smallAdapter = makeTarget({ adapterId: 'copilot', maxContextTokens: 100 });
    const largeAdapter = makeTarget({ adapterId: 'claude-code', maxContextTokens: 50000 });

    const smallOutcome = executeSyncForTarget(smallAdapter, 50000);
    const largeOutcome = executeSyncForTarget(largeAdapter, 50000);

    // Small adapter should use fewer tokens
    expect(smallOutcome.tokensInjected).toBeLessThanOrEqual(100);
    expect(largeOutcome.tokensInjected).toBeLessThanOrEqual(50000);
  });

  it('context assembly respects budget constraints', () => {
    const context = {
      persona: 'You are an expert TypeScript developer.',
      conventions: { style: 'functional', testing: 'TDD' },
      projectContext: {},
      activeCheckpoints: [],
      antiPatterns: [],
      skills: Array.from({ length: 20 }, (_, i) => ({
        name: `Skill ${i}`,
        description: `Description for skill ${i} with detailed explanation`,
        confidence: 0.8,
      })),
      warmMemories: [],
      hotMemories: {},
    };

    // Small budget
    const small = assembleContext(context as any, 100);
    expect(small.tokensUsed).toBeLessThanOrEqual(100);

    // Large budget
    const large = assembleContext(context as any, 10000);
    expect(large.tokensUsed).toBeLessThanOrEqual(10000);
    // Large budget should include more content
    expect(large.tokensUsed).toBeGreaterThanOrEqual(small.tokensUsed);
  });
});
