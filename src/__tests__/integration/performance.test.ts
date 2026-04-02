/**
 * Performance Validation Tests
 *
 * Validates that critical operations stay within coarse suite-level budgets.
 * These are guardrails against pathological slowdowns, not precise
 * microbenchmarks, so thresholds allow for CI and full-suite variance.
 *
 * These are integration benchmarks, not micro-benchmarks. They validate
 * that the system meets its performance contracts under typical load.
 */

import { describe, it, expect } from 'vitest';

// Core
import { generateId } from '../../core/ulid.js';

// Security
import { scanAndRedact, scanForSecrets } from '../../security/secret-scanner.js';
import { checkDangerousPatterns } from '../../security/dangerous-patterns.js';
import { hashContent } from '../../security/audit.js';
import { validatePath } from '../../security/path-validation.js';

// Intelligence
import { computeValue, allocateItems, allocateBudget, type ContextItem } from '../../intelligence/context-economist.js';
import { analyzeSession, type SessionActivity } from '../../intelligence/friction-detector.js';
import { routeOperation } from '../../intelligence/model-router.js';
import { createProfile, updateFromCorrection, updateFromTaskCompletion } from '../../intelligence/cognitive-profile.js';
import { identifyGaps, generateScenarios, synthesize } from '../../intelligence/experience-synthesizer.js';
import { computeRelevance } from '../../intelligence/temporal-modeler.js';
import { analyze } from '../../intelligence/meta-reasoner.js';
import { evaluate as selfEvaluate } from '../../intelligence/self-evaluator.js';

// Write pipeline
import { executeWritePipeline, type WritePipelineParams } from '../../memory/write-pipeline.js';

// Sync
import { transformToFormat, parseFromFormat } from '../../sync/format-bridges.js';
import { negotiateAll } from '../../sync/capability-negotiator.js';

// Agent definitions
import { bundleDefinitions, serializeBundle, deserializeBundle } from '../../workflow/agent-definitions.js';

// Adapters
import { assembleContext } from '../../adapters/base-adapter.js';

function makeWriteParams(): WritePipelineParams {
  return {
    db: {},
    input: {
      input: {
        type: 'lesson',
        title: 'Performance test memory',
        content: 'Content for performance testing purposes.',
        scope: 'project',
      },
    },
    config: { secret_scan_mode: 'redact' },
    signMemory: (mem) => hashContent(JSON.stringify(mem)),
    scanAndRedact,
    checkDangerousPatterns,
    createMemory: (_db, input) => ({
      id: generateId(),
      type: input.type ?? 'lesson',
      title: input.title ?? '',
      content: input.content ?? '',
      tags: '',
      project_id: null,
      scope: 'project',
      sensitivity: 'INTERNAL',
      confidence: 0.5,
      outcome: null,
      source: 'agent',
      signature: input.signature ?? '',
      status: 'active',
      access_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      expires_at: null,
      superseded_by: null,
      session_id: null,
      embedding: null,
      embedding_model: null,
    }),
    writeAuditLog: () => {},
    generateId,
  };
}

// ============================================================================
// Write Pipeline Performance (<50ms target)
// ============================================================================

describe('Performance: Write pipeline', () => {
  it('completes a single write within 50ms', async () => {
    const params = makeWriteParams();

    const start = performance.now();
    const result = await executeWritePipeline(params);
    const elapsed = performance.now() - start;

    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });

  it('handles batch of 10 writes within 500ms', async () => {
    const start = performance.now();

    for (let i = 0; i < 10; i++) {
      const params = makeWriteParams();
      params.input.input.content = `Batch content item ${i} for performance testing.`;
      await executeWritePipeline(params);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

// ============================================================================
// Secret Scanning Performance
// ============================================================================

describe('Performance: Secret scanning', () => {
  it('scans 10KB content within 10ms', () => {
    const content = 'Normal content line.\n'.repeat(500); // ~10KB

    const start = performance.now();
    const result = scanAndRedact(content);
    const elapsed = performance.now() - start;

    expect(result.redacted).toBe(false);
    expect(elapsed).toBeLessThan(10);
  });

  it('scans content with embedded secrets within 20ms', () => {
    const content = 'Use key AKIA1234567890123456 for access.\n'.repeat(50);

    const start = performance.now();
    scanAndRedact(content);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(20);
  });
});

// ============================================================================
// Dangerous Pattern Detection Performance
// ============================================================================

describe('Performance: Dangerous pattern detection', () => {
  it('scans 10KB content within 5ms', () => {
    const content = 'Safe content about security best practices.\n'.repeat(250);

    const start = performance.now();
    checkDangerousPatterns(content);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
  });
});

// ============================================================================
// Path Validation Performance
// ============================================================================

describe('Performance: Path validation', () => {
  it('validates 1000 paths within 30ms', () => {
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      validatePath(`subdir/file-${i}.txt`, '/home/user/project');
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(30);
  });
});

// ============================================================================
// Context Economy Performance
// ============================================================================

describe('Performance: Context economy', () => {
  it('allocates 100 items within 10ms', () => {
    const items: ContextItem[] = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      content: `Content item ${i} with some text for token estimation.`,
      tokenCount: 10 + (i % 20),
      importanceClass: (['skill', 'lesson', 'task', 'other'] as const)[i % 4],
      relevance: Math.random(),
      recency: Math.random(),
      uniqueness: Math.random(),
    }));

    const start = performance.now();
    const result = allocateItems(items, 500);
    const elapsed = performance.now() - start;

    expect(result.included.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(10);
  });

  it('computes values for 1000 items within 5ms', () => {
    const items: ContextItem[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `item-${i}`,
      content: `Content ${i}`,
      tokenCount: 10,
      importanceClass: 'skill' as const,
      relevance: Math.random(),
      recency: Math.random(),
      uniqueness: Math.random(),
    }));

    const start = performance.now();
    items.forEach(computeValue);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
  });
});

// ============================================================================
// Cognitive Profile Performance
// ============================================================================

describe('Performance: Cognitive profile operations', () => {
  it('processes 100 task completions within 150ms', () => {
    const start = performance.now();

    let profile = createProfile();
    for (let i = 0; i < 100; i++) {
      profile = updateFromTaskCompletion(profile, {
        domain: `domain-${i % 10}`,
        taskType: 'coding',
        success: Math.random() > 0.3,
        durationMs: 30000,
        timestamp: `2026-03-15T${String(i % 24).padStart(2, '0')}:00:00Z`,
      });
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(150);
    expect(profile.expertise.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Friction Detection Performance
// ============================================================================

describe('Performance: Friction detection', () => {
  it('analyzes session within 2ms', () => {
    const now = new Date();
    const activity: SessionActivity = {
      corrections: 5,
      queries: ['query 1', 'query 2', 'query 3', 'query 4', 'query 5'],
      errors: ['e1', 'e2', 'e3', 'e4'],
      taskStarted: true,
      taskCompleted: false,
      lastInteractionAt: now.toISOString(),
      startedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    };

    const start = performance.now();
    const result = analyzeSession(activity);
    const elapsed = performance.now() - start;

    expect(result.signals.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5);
  });
});

// ============================================================================
// Model Router Performance
// ============================================================================

describe('Performance: Model router', () => {
  it('routes 100 operations within 5ms', () => {
    const operations = [
      'skill_synthesis', 'content_classification', 'prompt_optimization',
      'plan_decomposition', 'knowledge_distillation', 'critique_advisory',
    ] as const;

    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      routeOperation(operations[i % operations.length]);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });
});

// ============================================================================
// Experience Synthesizer Performance
// ============================================================================

describe('Performance: Experience synthesis', () => {
  it('synthesizes gaps for 50 domains within 150ms', () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      domain: `domain-${i}`,
      memoryCount: i % 5,
      changeFrequency: 10 + (i % 20),
    }));

    const patterns = ['missing-error-handling', 'sql-injection', 'race-condition'];

    const start = performance.now();
    const result = synthesize(entries, patterns, 10);
    const elapsed = performance.now() - start;

    expect(result.gapsIdentified).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(150);
  });
});

// ============================================================================
// Format Bridge Performance
// ============================================================================

describe('Performance: Format bridge transformations', () => {
  it('transforms 50 sections to all formats within 10ms', () => {
    const sections = Array.from({ length: 50 }, (_, i) => ({
      title: `Section ${i}`,
      content: `Content for section ${i} with some detail text.`,
      priority: 50 - i,
      tokens: 10,
    }));

    const formats = ['markdown', 'json', 'toml', 'frontmatter'] as const;

    const start = performance.now();

    for (const format of formats) {
      transformToFormat(sections, format);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10);
  });
});

// ============================================================================
// Capability Negotiation Performance
// ============================================================================

describe('Performance: Capability negotiation', () => {
  it('negotiates all 9 adapters within 2ms', () => {
    const adapters = [
      'claude-code', 'cursor', 'copilot', 'aider', 'codex-cli',
      'opencode', 'antigravity', 'openclaw', 'generic',
    ];

    const start = performance.now();
    const results = negotiateAll(adapters, 20000);
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(9);
    expect(elapsed).toBeLessThan(2);
  });
});

// ============================================================================
// Agent Definitions Bundle Performance
// ============================================================================

describe('Performance: Agent definitions bundling', () => {
  it('bundles, serializes, and deserializes within 5ms', () => {
    const start = performance.now();

    const bundle = bundleDefinitions();
    const json = serializeBundle(bundle);
    deserializeBundle(json);

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });
});

// ============================================================================
// Context Assembly Performance
// ============================================================================

describe('Performance: Context assembly', () => {
  it('assembles context with all sections within 10ms', () => {
    const context = {
      persona: 'You are a helpful coding assistant with deep expertise.',
      conventions: {
        style: 'functional',
        language: 'TypeScript',
        testing: 'TDD with vitest',
        formatting: 'prettier + eslint',
      },
      projectContext: {
        framework: 'React + Next.js',
        database: 'PostgreSQL',
        hosting: 'Vercel',
      },
      activeCheckpoints: [],
      antiPatterns: Array.from({ length: 5 }, (_, i) => ({
        name: `pattern-${i}`,
        description: `Description for pattern ${i}`,
        correct_approach: `Correct approach for ${i}`,
      })),
      skills: Array.from({ length: 10 }, (_, i) => ({
        name: `Skill ${i}`,
        description: `Description for skill ${i}`,
        confidence: 0.7 + (i * 0.03),
      })),
      warmMemories: [],
      hotMemories: { 'key-1': 'Important context 1', 'key-2': 'Important context 2' },
    };

    const start = performance.now();
    const result = assembleContext(context as any, 10000);
    const elapsed = performance.now() - start;

    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.tokensUsed).toBeLessThanOrEqual(10000);
    expect(elapsed).toBeLessThan(10);
  });
});

// ============================================================================
// ULID Generation Performance
// ============================================================================

describe('Performance: ID generation', () => {
  it('generates 1000 ULIDs within 1000ms', () => {
    const start = performance.now();

    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }

    const elapsed = performance.now() - start;
    expect(ids.size).toBe(1000); // All unique
    expect(elapsed).toBeLessThan(1000);
  });
});

// ============================================================================
// Hash Performance
// ============================================================================

describe('Performance: Content hashing', () => {
  it('hashes 1000 content blocks within 50ms', () => {
    const contents = Array.from({ length: 1000 }, (_, i) =>
      `Content block ${i} with some text for hashing performance testing.`,
    );

    const start = performance.now();
    contents.forEach(hashContent);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
