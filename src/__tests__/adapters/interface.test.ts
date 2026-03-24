/**
 * Tests for src/adapters/interface.ts
 *
 * Validates the adapter registry: registration, duplicate rejection,
 * concurrent detection, and lookup behavior.
 */

import { describe, it, expect } from 'vitest';
import { createAdapterRegistry } from '../../adapters/interface.js';
import type {
  Adapter,
  FilesystemQuery,
  DetectionResult,
  UniversalContext,
  TokenBudget,
  SyncResult,
  ExtractedLearnings,
  VerifyResult,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockAdapter(id: string, detected = true, confidence = 0.9): Adapter {
  return {
    id,
    displayName: `Mock ${id}`,
    version: '1.0.0',
    capabilities: {
      canWriteBack: false,
      writeBackMechanism: 'none',
      canSubscribeEvents: false,
      canReportSessions: false,
      supportsStructuredCorrection: false,
    },
    targetCapabilities: {
      maxContextTokens: 10_000,
      supportsSystemPrompt: true,
      supportsFileWrites: true,
      supportsManagedSections: true,
    },
    async detect(_query: FilesystemQuery): Promise<DetectionResult> {
      return { detected, confidence, configPaths: [] };
    },
    async transform(_context: UniversalContext, _budget: TokenBudget): Promise<SyncResult> {
      return { fileWrites: [], apiPayloads: [], tokensUsed: 0 };
    },
    async extractLearnings(_content: string): Promise<ExtractedLearnings> {
      return { learnings: [] };
    },
    verify(_content: string, _expectedHash: string): VerifyResult {
      return { valid: true, expectedHash: '', actualHash: '', modified: false };
    },
  };
}

function createMockQuery(existingPaths: string[] = []): FilesystemQuery {
  return {
    async exists(path: string): Promise<boolean> {
      return existingPaths.includes(path);
    },
    async read(_path: string): Promise<string> {
      return '';
    },
    async glob(_pattern: string): Promise<string[]> {
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAdapterRegistry', () => {
  it('creates an empty registry', () => {
    const registry = createAdapterRegistry();
    expect(registry.adapters.size).toBe(0);
  });

  describe('register', () => {
    it('registers an adapter', () => {
      const registry = createAdapterRegistry();
      const adapter = createMockAdapter('test-adapter');
      registry.register(adapter);
      expect(registry.adapters.size).toBe(1);
      expect(registry.adapters.has('test-adapter')).toBe(true);
    });

    it('registers multiple adapters', () => {
      const registry = createAdapterRegistry();
      registry.register(createMockAdapter('adapter-a'));
      registry.register(createMockAdapter('adapter-b'));
      registry.register(createMockAdapter('adapter-c'));
      expect(registry.adapters.size).toBe(3);
    });

    it('throws on duplicate adapter ID', () => {
      const registry = createAdapterRegistry();
      registry.register(createMockAdapter('duplicate'));
      expect(() => registry.register(createMockAdapter('duplicate'))).toThrow(
        'duplicate adapter ID',
      );
    });
  });

  describe('getAdapter', () => {
    it('returns a registered adapter by ID', () => {
      const registry = createAdapterRegistry();
      const adapter = createMockAdapter('test-adapter');
      registry.register(adapter);
      expect(registry.getAdapter('test-adapter')).toBe(adapter);
    });

    it('returns undefined for unknown ID', () => {
      const registry = createAdapterRegistry();
      expect(registry.getAdapter('nonexistent')).toBeUndefined();
    });
  });

  describe('detect', () => {
    it('runs detection across all registered adapters', async () => {
      const registry = createAdapterRegistry();
      registry.register(createMockAdapter('detected-a', true, 0.9));
      registry.register(createMockAdapter('detected-b', true, 0.8));
      registry.register(createMockAdapter('not-detected', false, 0));

      const query = createMockQuery();
      const results = await registry.detect(query);

      expect(results.size).toBe(3);
      expect(results.get('detected-a')?.detected).toBe(true);
      expect(results.get('detected-a')?.confidence).toBe(0.9);
      expect(results.get('detected-b')?.detected).toBe(true);
      expect(results.get('not-detected')?.detected).toBe(false);
    });

    it('returns empty map when no adapters are registered', async () => {
      const registry = createAdapterRegistry();
      const query = createMockQuery();
      const results = await registry.detect(query);
      expect(results.size).toBe(0);
    });

    it('runs detections concurrently', async () => {
      const registry = createAdapterRegistry();
      const callOrder: string[] = [];

      // Create adapters with slight delays to verify concurrency
      const slowAdapter: Adapter = {
        ...createMockAdapter('slow'),
        async detect() {
          callOrder.push('slow-start');
          await new Promise((r) => setTimeout(r, 10));
          callOrder.push('slow-end');
          return { detected: true, confidence: 1, configPaths: [] };
        },
      };

      const fastAdapter: Adapter = {
        ...createMockAdapter('fast'),
        async detect() {
          callOrder.push('fast-start');
          callOrder.push('fast-end');
          return { detected: true, confidence: 1, configPaths: [] };
        },
      };

      registry.register(slowAdapter);
      registry.register(fastAdapter);

      const query = createMockQuery();
      const results = await registry.detect(query);

      expect(results.size).toBe(2);
      // Both should have started before slow finished
      expect(callOrder.indexOf('fast-start')).toBeLessThan(callOrder.indexOf('slow-end'));
    });
  });
});
