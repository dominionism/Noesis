/**
 * Tests for src/adapters/claude-code.ts
 *
 * Full adapter integration test validating detection, transform,
 * learning extraction, and hash verification for the Claude Code adapter.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createClaudeCodeAdapter } from '../../adapters/claude-code.js';
import { createTokenBudget } from '../../adapters/context-budget.js';
import { hashContent } from '../../adapters/managed-sections.js';
import type {
  FilesystemQuery,
  UniversalContext,
  ScoredMemory,
  SkillDefinition,
  AntiPatternDefinition,
  Memory,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockQuery(files: Record<string, string> = {}): FilesystemQuery {
  return {
    async exists(path: string): Promise<boolean> {
      return path in files;
    },
    async read(path: string): Promise<string> {
      if (path in files) {
        return files[path];
      }
      throw new Error(`File not found: ${path}`);
    },
    async glob(_pattern: string): Promise<string[]> {
      return Object.keys(files);
    },
  };
}

function createMinimalContext(overrides?: Partial<UniversalContext>): UniversalContext {
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
    ...overrides,
  };
}

function createMockScoredMemory(overrides?: Partial<ScoredMemory>): ScoredMemory {
  return {
    id: 'test-memory-id',
    type: 'lesson',
    title: 'Test Lesson',
    content: JSON.stringify({
      trigger: 'test trigger',
      original_approach: 'wrong way',
      corrected_approach: 'right way',
      root_cause: 'misunderstanding',
      applicable_when: 'always',
    }),
    tags: '[]',
    project_id: null,
    scope: 'project',
    sensitivity: 'INTERNAL',
    confidence: 0.9,
    outcome: null,
    source: 'test',
    embedding: null,
    embedding_model: null,
    signature: 'test-sig',
    status: 'active',
    access_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_accessed_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    superseded_by: null,
    session_id: null,
    semantic_score: 0.8,
    bm25_rank: 1,
    vector_rank: 1,
    recency_modifier: 1.0,
    access_boost: 1.0,
    success_weight: 1.0,
    scope_boost: 1.0,
    final_score: 0.9,
    ...overrides,
  };
}

function createMockSkill(name: string): SkillDefinition {
  return {
    name,
    kind: 'skill',
    description: `${name} skill description`,
    trigger_pattern: `when ${name}`,
    steps: [{ description: 'step 1' }],
    prerequisites: [],
    anti_patterns: [],
    validation_criteria: [],
    source_lessons: [],
    status: 'active',
    confidence: 0.85,
    successes: 5,
    failures: 0,
    last_used_at: null,
  };
}

function createMockAntiPattern(name: string): AntiPatternDefinition {
  return {
    name,
    kind: 'anti_pattern',
    description: `${name} anti-pattern`,
    trigger_pattern: `avoid ${name}`,
    failure_mode: 'causes failures',
    correct_approach: 'do it right',
    source_lessons: [],
    status: 'active',
    confidence: 0.9,
    successes: 3,
    failures: 0,
    last_used_at: null,
  };
}

function createMockCheckpoint(title: string, planName?: string): Memory {
  const content: Record<string, unknown> = {
    task_description: `Task for ${title}`,
    completed_steps: ['step 1'],
    remaining_steps: ['step 2', 'step 3'],
    current_blockers: [],
    relevant_files: [],
    working_state: 'in progress',
    handoff_source: 'agent-a',
    handoff_target: 'agent-b',
  };

  if (planName) {
    content['plan_name'] = planName;
    content['phases'] = [
      { name: 'Phase 1', status: 'completed', details: 'Done' },
      { name: 'Phase 2', status: 'in_progress', details: 'Working' },
    ];
  }

  return {
    id: 'checkpoint-id',
    type: 'checkpoint',
    title,
    content: JSON.stringify(content),
    tags: '[]',
    project_id: null,
    scope: 'project',
    sensitivity: 'INTERNAL',
    confidence: 1.0,
    outcome: null,
    source: 'test',
    embedding: null,
    embedding_model: null,
    signature: 'sig',
    status: 'active',
    access_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_accessed_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    superseded_by: null,
    session_id: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createClaudeCodeAdapter', () => {
  const adapter = createClaudeCodeAdapter();

  describe('metadata', () => {
    it('has correct ID', () => {
      expect(adapter.id).toBe('claude-code');
    });

    it('has correct display name', () => {
      expect(adapter.displayName).toBe('Claude Code');
    });

    it('has version 1.0.0', () => {
      expect(adapter.version).toBe('1.0.0');
    });

    it('supports CLI write-back', () => {
      expect(adapter.capabilities.canWriteBack).toBe(true);
      expect(adapter.capabilities.writeBackMechanism).toBe('cli_command');
    });

    it('supports sessions', () => {
      expect(adapter.capabilities.canReportSessions).toBe(true);
    });

    it('supports structured correction', () => {
      expect(adapter.capabilities.supportsStructuredCorrection).toBe(true);
    });

    it('targets 200K tokens', () => {
      expect(adapter.targetCapabilities.maxContextTokens).toBe(200_000);
    });

    it('supports managed sections', () => {
      expect(adapter.targetCapabilities.supportsManagedSections).toBe(true);
    });
  });

  describe('detect', () => {
    it('detects when CLAUDE.md exists', async () => {
      const query = createMockQuery({ 'CLAUDE.md': '# Claude' });
      const result = await adapter.detect(query);
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.configPaths).toContain('CLAUDE.md');
    });

    it('detects when .claude dir exists', async () => {
      const query = createMockQuery({ '.claude': '' });
      const result = await adapter.detect(query);
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.95);
    });

    it('detects with lower confidence when only .clauderc exists', async () => {
      const query = createMockQuery({ '.clauderc': '' });
      const result = await adapter.detect(query);
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(0.7);
    });

    it('returns config paths separately from detection paths', async () => {
      const query = createMockQuery({
        '.claude': '',
        'CLAUDE.md': '# Claude',
        '.claude/settings.json': '{}',
      });
      const result = await adapter.detect(query);
      expect(result.detected).toBe(true);
      expect(result.configPaths).toContain('CLAUDE.md');
      expect(result.configPaths).toContain('.claude/settings.json');
    });

    it('returns not detected when nothing exists', async () => {
      const query = createMockQuery({});
      const result = await adapter.detect(query);
      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('transform', () => {
    it('produces a SyncResult with file writes', async () => {
      const context = createMinimalContext({
        persona: 'You are a test assistant.',
        conventions: { style: 'TypeScript strict mode' },
      });
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);

      expect(result.fileWrites).toHaveLength(1);
      expect(result.fileWrites[0].path).toBe('Context/CLAUDE.md');
      expect(result.fileWrites[0].managedSection).toBe(true);
      expect(result.fileWrites[0].adapterId).toBe('claude-code');
      expect(result.tokensUsed).toBeGreaterThan(0);
    });

    it('includes persona in output', async () => {
      const context = createMinimalContext({
        persona: 'You are an elite pair programmer.',
      });
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].content).toContain('elite pair programmer');
    });

    it('includes conventions in output', async () => {
      const context = createMinimalContext({
        conventions: { language: 'TypeScript', testing: 'Vitest' },
      });
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].content).toContain('TypeScript');
      expect(result.fileWrites[0].content).toContain('Vitest');
    });

    it('includes skills in output', async () => {
      const context = createMinimalContext({
        skills: [createMockSkill('database-migration'), createMockSkill('api-design')],
      });
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].content).toContain('database-migration');
      expect(result.fileWrites[0].content).toContain('api-design');
    });

    it('includes anti-patterns in output', async () => {
      const context = createMinimalContext({
        antiPatterns: [createMockAntiPattern('raw-sql'), createMockAntiPattern('global-state')],
      });
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].content).toContain('raw-sql');
      expect(result.fileWrites[0].content).toContain('global-state');
    });

    it('includes lessons from warm memories', async () => {
      const context = createMinimalContext({
        warmMemories: [
          createMockScoredMemory({
            title: 'Always validate inputs',
            type: 'lesson',
          }),
        ],
      });
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].content).toContain('Always validate inputs');
    });

    it('includes active plans', async () => {
      const context = createMinimalContext({
        activeCheckpoints: [createMockCheckpoint('Build API', 'API Implementation Plan')],
      });
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].content).toContain('API Implementation Plan');
    });

    it('includes non-plan checkpoints', async () => {
      const context = createMinimalContext({
        activeCheckpoints: [createMockCheckpoint('Fix bug #123')],
      });
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);
      expect(result.fileWrites[0].content).toContain('Fix bug #123');
    });

    it('respects budget limits', async () => {
      const context = createMinimalContext({
        persona: 'x'.repeat(100_000), // Very long persona
        skills: Array.from({ length: 50 }, (_, i) => createMockSkill(`skill-${i}`)),
      });
      const budget = createTokenBudget(100); // Very small budget
      const result = await adapter.transform(context, budget);

      // Output should be truncated to fit
      expect(result.tokensUsed).toBeLessThanOrEqual(150); // Some overhead from headers
    });

    it('produces a valid hash in file write', async () => {
      const context = createMinimalContext({
        persona: 'Test persona',
      });
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);

      const write = result.fileWrites[0];
      expect(write.hash).toBeTruthy();
      expect(write.hash).toHaveLength(64); // SHA-256 hex length
    });

    it('handles empty context', async () => {
      const context = createMinimalContext();
      const budget = createTokenBudget(50_000);
      const result = await adapter.transform(context, budget);

      expect(result.fileWrites).toHaveLength(1);
      // Should still produce a header at minimum
      expect(result.fileWrites[0].content).toContain('Noesis');
    });
  });

  describe('extractLearnings', () => {
    it('extracts LESSON: prefixed lines', async () => {
      const content = 'Some text\nLESSON: Always use parameterized queries\nMore text';
      const result = await adapter.extractLearnings(content);
      expect(result.learnings).toHaveLength(1);
      expect(result.learnings[0].content).toBe('Always use parameterized queries');
      expect(result.learnings[0].category).toBe('lesson');
    });

    it('extracts LEARNING: prefixed lines', async () => {
      const content = 'LEARNING: Cache invalidation is hard';
      const result = await adapter.extractLearnings(content);
      expect(result.learnings).toHaveLength(1);
      expect(result.learnings[0].content).toBe('Cache invalidation is hard');
    });

    it('extracts CORRECTION: prefixed lines', async () => {
      const content = 'CORRECTION: Use bcrypt not MD5 for passwords';
      const result = await adapter.extractLearnings(content);
      expect(result.learnings).toHaveLength(1);
      expect(result.learnings[0].content).toBe('Use bcrypt not MD5 for passwords');
      expect(result.learnings[0].confidence).toBe(0.8);
    });

    it('extracts PREFERENCE: prefixed lines', async () => {
      const content = 'PREFERENCE: Use single quotes in TypeScript';
      const result = await adapter.extractLearnings(content);
      expect(result.learnings).toHaveLength(1);
      expect(result.learnings[0].category).toBe('preference');
    });

    it('extracts DECISION: prefixed lines', async () => {
      const content = 'DECISION: Use PostgreSQL instead of MySQL';
      const result = await adapter.extractLearnings(content);
      expect(result.learnings).toHaveLength(1);
      expect(result.learnings[0].category).toBe('decision');
    });

    it('extracts multiple learnings', async () => {
      const content = [
        'LESSON: Validate all inputs',
        'Some text in between',
        'PREFERENCE: Use ESM modules',
        'DECISION: Deploy to AWS',
      ].join('\n');
      const result = await adapter.extractLearnings(content);
      expect(result.learnings).toHaveLength(3);
    });

    it('returns empty for content without learning markers', async () => {
      const content = 'Just regular content without any markers';
      const result = await adapter.extractLearnings(content);
      expect(result.learnings).toHaveLength(0);
    });

    it('sets source to adapter ID', async () => {
      const content = 'LESSON: Something learned';
      const result = await adapter.extractLearnings(content);
      expect(result.learnings[0].source).toBe('claude-code');
    });
  });

  describe('verify', () => {
    it('returns valid for matching hash', () => {
      const content = 'verified content';
      const hash = hashContent(content);
      const result = adapter.verify(content, hash);
      expect(result.valid).toBe(true);
      expect(result.modified).toBe(false);
    });

    it('returns invalid for mismatching hash', () => {
      const content = 'modified content';
      const originalHash = hashContent('original content');
      const result = adapter.verify(content, originalHash);
      expect(result.valid).toBe(false);
      expect(result.modified).toBe(true);
    });

    it('includes both expected and actual hashes', () => {
      const content = 'test content';
      const hash = hashContent(content);
      const result = adapter.verify(content, hash);
      expect(result.expectedHash).toBe(hash);
      expect(result.actualHash).toBe(hash);
    });

    it('detects tampering', () => {
      const original = 'original content';
      const tampered = 'tampered content';
      const originalHash = hashContent(original);
      const result = adapter.verify(tampered, originalHash);
      expect(result.modified).toBe(true);
      expect(result.actualHash).not.toBe(result.expectedHash);
    });
  });
});
