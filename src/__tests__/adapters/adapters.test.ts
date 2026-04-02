/**
 * Tests for all 9 adapter implementations
 *
 * Validates metadata, capability declarations, detection logic,
 * context transformation, learning extraction, and hash verification
 * for each adapter. Uses mock filesystem queries to avoid actual I/O.
 */

import { describe, it, expect } from 'vitest';

import { createClaudeCodeAdapter } from '../../adapters/claude-code.js';
import { createCursorAdapter } from '../../adapters/cursor.js';
import { createCopilotAdapter } from '../../adapters/copilot.js';
import { createAiderAdapter } from '../../adapters/aider.js';
import { createCodexAdapter } from '../../adapters/codex.js';
import { createOpenCodeAdapter } from '../../adapters/opencode.js';
import { createAntigravityAdapter } from '../../adapters/antigravity.js';
import { createOpenClawAdapter } from '../../adapters/openclaw.js';
import { createGenericAdapter } from '../../adapters/generic.js';
import { createTokenBudget } from '../../adapters/context-budget.js';
import { hashContent } from '../../adapters/managed-sections.js';

import type {
  Adapter,
  FilesystemQuery,
  UniversalContext,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockQuery(files: Record<string, string>): FilesystemQuery {
  return {
    async exists(path: string): Promise<boolean> {
      return path in files;
    },
    async read(path: string): Promise<string> {
      if (!(path in files)) throw new Error(`File not found: ${path}`);
      return files[path];
    },
    async glob(pattern: string): Promise<string[]> {
      return Object.keys(files).filter((f) => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
          return regex.test(f);
        }
        return f === pattern;
      });
    },
  };
}

function createTestContext(overrides?: Partial<UniversalContext>): UniversalContext {
  return {
    persona: 'Test user persona',
    conventions: { naming: 'Use camelCase for variables' },
    projectContext: { stack: 'TypeScript + Node.js' },
    hotMemories: { patterns: 'Use dependency injection' },
    warmMemories: [],
    skills: [],
    antiPatterns: [],
    activeCheckpoints: [],
    sessionId: null,
    ...overrides,
  };
}

function createMinimalContext(): UniversalContext {
  return {
    persona: null,
    conventions: {},
    projectContext: {},
    hotMemories: {},
    warmMemories: [],
    skills: [],
    antiPatterns: [],
    activeCheckpoints: [],
    sessionId: null,
  };
}

// ---------------------------------------------------------------------------
// Adapter metadata type (for parameterized tests)
// ---------------------------------------------------------------------------

interface AdapterTestSpec {
  factory: () => Adapter;
  expectedId: string;
  expectedDisplayName: string;
  detectionFiles: Record<string, string>;
  nonDetectionFiles: Record<string, string>;
  expectedCapabilities: {
    canWriteBack: boolean;
    writeBackMechanism: 'cli_command' | 'file_append' | 'none';
  };
  expectedTargetCapabilities: {
    supportsSystemPrompt: boolean;
    supportsManagedSections: boolean;
  };
  /** If true, generic adapter always detects. */
  alwaysDetects?: boolean;
  /** For openclaw, detection requires .openclaw dir. */
  requiresSpecificDetection?: boolean;
}

const adapterSpecs: AdapterTestSpec[] = [
  {
    factory: createClaudeCodeAdapter,
    expectedId: 'claude-code',
    expectedDisplayName: 'Claude Code',
    detectionFiles: { 'CLAUDE.md': '# Claude', '.claude': '' },
    nonDetectionFiles: {},
    expectedCapabilities: { canWriteBack: true, writeBackMechanism: 'cli_command' },
    expectedTargetCapabilities: { supportsSystemPrompt: true, supportsManagedSections: true },
  },
  {
    factory: createCursorAdapter,
    expectedId: 'cursor',
    expectedDisplayName: 'Cursor',
    detectionFiles: { '.cursorrules': 'rules' },
    nonDetectionFiles: {},
    expectedCapabilities: { canWriteBack: false, writeBackMechanism: 'none' },
    expectedTargetCapabilities: { supportsSystemPrompt: true, supportsManagedSections: true },
  },
  {
    factory: createCopilotAdapter,
    expectedId: 'copilot',
    expectedDisplayName: 'GitHub Copilot',
    detectionFiles: { '.github/copilot-instructions.md': 'instructions', '.github': '' },
    nonDetectionFiles: {},
    expectedCapabilities: { canWriteBack: false, writeBackMechanism: 'none' },
    expectedTargetCapabilities: { supportsSystemPrompt: true, supportsManagedSections: true },
  },
  {
    factory: createAiderAdapter,
    expectedId: 'aider',
    expectedDisplayName: 'Aider',
    detectionFiles: { '.aider.conf.yml': 'config: true' },
    nonDetectionFiles: {},
    expectedCapabilities: { canWriteBack: true, writeBackMechanism: 'file_append' },
    expectedTargetCapabilities: { supportsSystemPrompt: true, supportsManagedSections: false },
  },
  {
    factory: createCodexAdapter,
    expectedId: 'codex-cli',
    expectedDisplayName: 'Codex CLI',
    detectionFiles: { '.codex': '' },
    nonDetectionFiles: {},
    expectedCapabilities: { canWriteBack: true, writeBackMechanism: 'cli_command' },
    expectedTargetCapabilities: { supportsSystemPrompt: true, supportsManagedSections: true },
  },
  {
    factory: createOpenCodeAdapter,
    expectedId: 'opencode',
    expectedDisplayName: 'OpenCode',
    detectionFiles: { '.opencode': '', 'AGENTS.md': '# Agents' },
    nonDetectionFiles: {},
    expectedCapabilities: { canWriteBack: true, writeBackMechanism: 'file_append' },
    expectedTargetCapabilities: { supportsSystemPrompt: true, supportsManagedSections: true },
  },
  {
    factory: createAntigravityAdapter,
    expectedId: 'antigravity',
    expectedDisplayName: 'Antigravity (Gemini CLI)',
    detectionFiles: { 'GEMINI.md': '# Gemini' },
    nonDetectionFiles: {},
    expectedCapabilities: { canWriteBack: true, writeBackMechanism: 'cli_command' },
    expectedTargetCapabilities: { supportsSystemPrompt: true, supportsManagedSections: true },
  },
  {
    factory: createOpenClawAdapter,
    expectedId: 'openclaw',
    expectedDisplayName: 'OpenClaw',
    detectionFiles: { '.openclaw': '', 'CLAUDE.md': '# Claude' },
    nonDetectionFiles: { 'CLAUDE.md': '# Claude' }, // CLAUDE.md alone is not enough
    expectedCapabilities: { canWriteBack: true, writeBackMechanism: 'file_append' },
    expectedTargetCapabilities: { supportsSystemPrompt: true, supportsManagedSections: true },
    requiresSpecificDetection: true,
  },
  {
    factory: createGenericAdapter,
    expectedId: 'generic',
    expectedDisplayName: 'Generic Adapter',
    detectionFiles: {},
    nonDetectionFiles: {},
    expectedCapabilities: { canWriteBack: false, writeBackMechanism: 'none' },
    expectedTargetCapabilities: { supportsSystemPrompt: false, supportsManagedSections: false },
    alwaysDetects: true,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.each(adapterSpecs)(
  'Adapter: $expectedId',
  ({
    factory,
    expectedId,
    expectedDisplayName,
    detectionFiles,
    nonDetectionFiles,
    expectedCapabilities,
    expectedTargetCapabilities,
    alwaysDetects,
    requiresSpecificDetection,
  }) => {
    const adapter = factory();

    describe('metadata', () => {
      it(`has id "${expectedId}"`, () => {
        expect(adapter.id).toBe(expectedId);
      });

      it(`has displayName "${expectedDisplayName}"`, () => {
        expect(adapter.displayName).toBe(expectedDisplayName);
      });

      it('has a version string', () => {
        expect(adapter.version).toBeTruthy();
        expect(typeof adapter.version).toBe('string');
      });
    });

    describe('capabilities', () => {
      it(`canWriteBack is ${expectedCapabilities.canWriteBack}`, () => {
        expect(adapter.capabilities.canWriteBack).toBe(expectedCapabilities.canWriteBack);
      });

      it(`writeBackMechanism is "${expectedCapabilities.writeBackMechanism}"`, () => {
        expect(adapter.capabilities.writeBackMechanism).toBe(
          expectedCapabilities.writeBackMechanism,
        );
      });
    });

    describe('targetCapabilities', () => {
      it('has a positive maxContextTokens', () => {
        expect(adapter.targetCapabilities.maxContextTokens).toBeGreaterThan(0);
      });

      it(`supportsSystemPrompt is ${expectedTargetCapabilities.supportsSystemPrompt}`, () => {
        expect(adapter.targetCapabilities.supportsSystemPrompt).toBe(
          expectedTargetCapabilities.supportsSystemPrompt,
        );
      });

      it(`supportsManagedSections is ${expectedTargetCapabilities.supportsManagedSections}`, () => {
        expect(adapter.targetCapabilities.supportsManagedSections).toBe(
          expectedTargetCapabilities.supportsManagedSections,
        );
      });
    });

    describe('detect', () => {
      if (alwaysDetects) {
        it('always detects (generic fallback)', async () => {
          const query = createMockQuery({});
          const result = await adapter.detect(query);
          expect(result.detected).toBe(true);
          expect(result.confidence).toBeGreaterThan(0);
        });
      } else {
        it('detects matching filesystem', async () => {
          const query = createMockQuery(detectionFiles);
          const result = await adapter.detect(query);
          expect(result.detected).toBe(true);
          expect(result.confidence).toBeGreaterThan(0);
        });

        if (requiresSpecificDetection) {
          it('does not detect without required specific file', async () => {
            const query = createMockQuery(nonDetectionFiles);
            const result = await adapter.detect(query);
            expect(result.detected).toBe(false);
          });
        }

        it('returns not detected for empty filesystem', async () => {
          const query = createMockQuery({});
          const result = await adapter.detect(query);
          expect(result.detected).toBe(false);
          expect(result.confidence).toBe(0);
        });
      }

      it('returns a DetectionResult with required fields', async () => {
        const query = createMockQuery(detectionFiles);
        const result = await adapter.detect(query);
        expect(result).toHaveProperty('detected');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('configPaths');
        expect(typeof result.detected).toBe('boolean');
        expect(typeof result.confidence).toBe('number');
        expect(Array.isArray(result.configPaths)).toBe(true);
      });
    });

    describe('transform', () => {
      it('produces a valid SyncResult', async () => {
        const context = createTestContext();
        const budget = createTokenBudget(adapter.targetCapabilities.maxContextTokens);
        const result = await adapter.transform(context, budget);

        expect(result).toHaveProperty('fileWrites');
        expect(result).toHaveProperty('apiPayloads');
        expect(result).toHaveProperty('tokensUsed');
        expect(Array.isArray(result.fileWrites)).toBe(true);
        expect(Array.isArray(result.apiPayloads)).toBe(true);
        expect(typeof result.tokensUsed).toBe('number');
      });

      it('produces at least one file write', async () => {
        const context = createTestContext();
        const budget = createTokenBudget(adapter.targetCapabilities.maxContextTokens);
        const result = await adapter.transform(context, budget);

        expect(result.fileWrites.length).toBeGreaterThanOrEqual(1);
      });

      it('file writes have correct adapterId', async () => {
        const context = createTestContext();
        const budget = createTokenBudget(adapter.targetCapabilities.maxContextTokens);
        const result = await adapter.transform(context, budget);

        for (const write of result.fileWrites) {
          expect(write.adapterId).toBe(expectedId);
        }
      });

      it('file writes have a SHA-256 hash', async () => {
        const context = createTestContext();
        const budget = createTokenBudget(adapter.targetCapabilities.maxContextTokens);
        const result = await adapter.transform(context, budget);

        for (const write of result.fileWrites) {
          expect(write.hash).toBeTruthy();
          expect(write.hash).toHaveLength(64); // SHA-256 hex = 64 chars
        }
      });

      it(`file writes have managedSection set to ${expectedTargetCapabilities.supportsManagedSections}`, async () => {
        const context = createTestContext();
        const budget = createTokenBudget(adapter.targetCapabilities.maxContextTokens);
        const result = await adapter.transform(context, budget);

        for (const write of result.fileWrites) {
          expect(write.managedSection).toBe(expectedTargetCapabilities.supportsManagedSections);
        }
      });

      it('handles empty context without error', async () => {
        const context = createMinimalContext();
        const budget = createTokenBudget(adapter.targetCapabilities.maxContextTokens);
        const result = await adapter.transform(context, budget);

        expect(result.fileWrites.length).toBeGreaterThanOrEqual(1);
      });

      it('includes persona content when provided', async () => {
        const context = createTestContext({ persona: 'Unique test persona marker' });
        const budget = createTokenBudget(adapter.targetCapabilities.maxContextTokens);
        const result = await adapter.transform(context, budget);

        const allContent = result.fileWrites.map((w) => w.content).join('');
        expect(allContent).toContain('Unique test persona marker');
      });

      it('includes conventions when provided', async () => {
        const context = createTestContext({
          conventions: { formatting: 'Use Prettier with 2-space tabs' },
        });
        const budget = createTokenBudget(adapter.targetCapabilities.maxContextTokens);
        const result = await adapter.transform(context, budget);

        const allContent = result.fileWrites.map((w) => w.content).join('');
        expect(allContent).toContain('Prettier');
      });

      it('reports positive tokensUsed when context has content', async () => {
        const context = createTestContext();
        const budget = createTokenBudget(adapter.targetCapabilities.maxContextTokens);
        const result = await adapter.transform(context, budget);

        expect(result.tokensUsed).toBeGreaterThan(0);
      });
    });

    describe('extractLearnings', () => {
      it('returns ExtractedLearnings structure', async () => {
        const result = await adapter.extractLearnings('some content');
        expect(result).toHaveProperty('learnings');
        expect(Array.isArray(result.learnings)).toBe(true);
      });

      it('extracts LESSON: prefixed lines', async () => {
        const content = 'Some text\nLESSON: Always validate user input\nMore text';
        const result = await adapter.extractLearnings(content);
        expect(result.learnings).toHaveLength(1);
        expect(result.learnings[0].content).toBe('Always validate user input');
        expect(result.learnings[0].category).toBe('lesson');
        expect(result.learnings[0].source).toBe(expectedId);
      });

      it('extracts CORRECTION: prefixed lines', async () => {
        const content = 'CORRECTION: Use prepared statements not string concatenation';
        const result = await adapter.extractLearnings(content);
        expect(result.learnings).toHaveLength(1);
        expect(result.learnings[0].content).toBe(
          'Use prepared statements not string concatenation',
        );
        expect(result.learnings[0].confidence).toBe(0.8);
      });

      it('extracts PREFERENCE: prefixed lines', async () => {
        const content = 'PREFERENCE: Use functional components over class components';
        const result = await adapter.extractLearnings(content);
        expect(result.learnings).toHaveLength(1);
        expect(result.learnings[0].category).toBe('preference');
      });

      it('extracts DECISION: prefixed lines', async () => {
        const content = 'DECISION: Adopt PostgreSQL as primary database';
        const result = await adapter.extractLearnings(content);
        expect(result.learnings).toHaveLength(1);
        expect(result.learnings[0].category).toBe('decision');
      });

      it('returns empty learnings for content without markers', async () => {
        const content = 'Regular text without any learning markers at all.';
        const result = await adapter.extractLearnings(content);
        expect(result.learnings).toHaveLength(0);
      });

      it('handles multiple learning markers in one input', async () => {
        const content = [
          'LESSON: First lesson',
          'Some filler text',
          'PREFERENCE: My preference',
          'DECISION: A decision',
        ].join('\n');
        const result = await adapter.extractLearnings(content);
        expect(result.learnings).toHaveLength(3);
      });
    });

    describe('verify', () => {
      it('returns valid for matching hash', () => {
        const content = 'test content for verification';
        const hash = hashContent(content);
        const result = adapter.verify(content, hash);
        expect(result.valid).toBe(true);
        expect(result.modified).toBe(false);
        expect(result.expectedHash).toBe(hash);
        expect(result.actualHash).toBe(hash);
      });

      it('returns invalid for mismatching hash', () => {
        const content = 'current content';
        const wrongHash = hashContent('different content');
        const result = adapter.verify(content, wrongHash);
        expect(result.valid).toBe(false);
        expect(result.modified).toBe(true);
        expect(result.expectedHash).toBe(wrongHash);
        expect(result.actualHash).toBe(hashContent(content));
      });

      it('returns a complete VerifyResult', () => {
        const content = 'content';
        const hash = hashContent(content);
        const result = adapter.verify(content, hash);
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('expectedHash');
        expect(result).toHaveProperty('actualHash');
        expect(result).toHaveProperty('modified');
      });
    });
  },
);

// ---------------------------------------------------------------------------
// Additional adapter-specific tests
// ---------------------------------------------------------------------------

describe('Adapter-specific behavior', () => {
  describe('Claude Code adapter', () => {
    const adapter = createClaudeCodeAdapter();

    it('targets CLAUDE.md file', async () => {
      const context = createTestContext();
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('Context/CLAUDE.md');
    });

    it('detects with high confidence when CLAUDE.md exists', async () => {
      const query = createMockQuery({ 'CLAUDE.md': '# Claude' });
      const result = await adapter.detect(query);
      expect(result.confidence).toBe(0.95);
    });

    it('detects with high confidence when .claude dir exists', async () => {
      const query = createMockQuery({ '.claude': '' });
      const result = await adapter.detect(query);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('supports event subscription', () => {
      expect(adapter.capabilities.canSubscribeEvents).toBe(true);
    });

    it('supports structured correction', () => {
      expect(adapter.capabilities.supportsStructuredCorrection).toBe(true);
    });

    it('targets 200K context tokens', () => {
      expect(adapter.targetCapabilities.maxContextTokens).toBe(200_000);
    });
  });

  describe('Cursor adapter', () => {
    const adapter = createCursorAdapter();

    it('targets .cursorrules file', async () => {
      const context = createTestContext();
      const budget = createTokenBudget(8_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('.cursorrules');
    });

    it('detects when .cursorrules exists', async () => {
      const query = createMockQuery({ '.cursorrules': 'rules' });
      const result = await adapter.detect(query);
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('Copilot adapter', () => {
    const adapter = createCopilotAdapter();

    it('targets .github/copilot-instructions.md', async () => {
      const context = createTestContext();
      const budget = createTokenBudget(4_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('.github/copilot-instructions.md');
    });

    it('does not support write-back', () => {
      expect(adapter.capabilities.canWriteBack).toBe(false);
      expect(adapter.capabilities.writeBackMechanism).toBe('none');
    });

    it('does not support sessions', () => {
      expect(adapter.capabilities.canReportSessions).toBe(false);
    });
  });

  describe('Aider adapter', () => {
    const adapter = createAiderAdapter();

    it('targets CONVENTIONS.md', async () => {
      const context = createTestContext();
      const budget = createTokenBudget(20_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('CONVENTIONS.md');
    });

    it('detects .aider.conf.yml with high confidence', async () => {
      const query = createMockQuery({ '.aider.conf.yml': 'model: gpt-4' });
      const result = await adapter.detect(query);
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('Codex CLI adapter', () => {
    const adapter = createCodexAdapter();

    it('targets AGENTS.md', async () => {
      const context = createTestContext();
      const budget = createTokenBudget(20_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('Context/AGENTS.md');
    });
  });

  describe('OpenCode adapter', () => {
    const adapter = createOpenCodeAdapter();

    it('targets AGENTS.md', async () => {
      const context = createTestContext();
      const budget = createTokenBudget(20_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('Context/AGENTS.md');
    });

    it('detects .opencode with higher confidence', async () => {
      const query = createMockQuery({ '.opencode': '' });
      const result = await adapter.detect(query);
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('Antigravity adapter', () => {
    const adapter = createAntigravityAdapter();

    it('targets GEMINI.md', async () => {
      const context = createTestContext();
      const budget = createTokenBudget(20_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('GEMINI.md');
    });
  });

  describe('OpenClaw adapter', () => {
    const adapter = createOpenClawAdapter();

    it('targets CLAUDE.md', async () => {
      const context = createTestContext();
      const budget = createTokenBudget(20_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('Context/CLAUDE.md');
    });

    it('requires .openclaw directory for detection', async () => {
      // CLAUDE.md alone is not sufficient
      const queryNoOpenClaw = createMockQuery({ 'CLAUDE.md': '# Claude' });
      const result1 = await adapter.detect(queryNoOpenClaw);
      expect(result1.detected).toBe(false);

      // .openclaw directory is required
      const queryWithOpenClaw = createMockQuery({ '.openclaw': '', 'CLAUDE.md': '' });
      const result2 = await adapter.detect(queryWithOpenClaw);
      expect(result2.detected).toBe(true);
      expect(result2.confidence).toBe(0.95);
    });

    it('does not support structured correction', () => {
      expect(adapter.capabilities.supportsStructuredCorrection).toBe(false);
    });
  });

  describe('Generic adapter', () => {
    it('targets .noesis-context.md by default', async () => {
      const adapter = createGenericAdapter();
      const context = createTestContext();
      const budget = createTokenBudget(10_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('.noesis-context.md');
    });

    it('accepts custom target file via options', async () => {
      const adapter = createGenericAdapter({ targetFile: 'custom-context.md' });
      const context = createTestContext();
      const budget = createTokenBudget(10_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].path).toBe('custom-context.md');
    });

    it('accepts custom max tokens via options', () => {
      const adapter = createGenericAdapter({ maxTokens: 5_000 });
      expect(adapter.targetCapabilities.maxContextTokens).toBe(5_000);
    });

    it('always detects with low confidence as fallback', async () => {
      const adapter = createGenericAdapter();
      const query = createMockQuery({});
      const result = await adapter.detect(query);
      expect(result.detected).toBe(true);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('does not support system prompt', () => {
      const adapter = createGenericAdapter();
      expect(adapter.targetCapabilities.supportsSystemPrompt).toBe(false);
    });
  });
});
