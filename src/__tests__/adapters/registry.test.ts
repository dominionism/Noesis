/**
 * Tests for adapter registry (src/adapters/interface.ts)
 *
 * Validates registration, duplicate rejection, concurrent detection,
 * and lookup behavior of the adapter registry. These tests focus on
 * the registry as a collection manager, independent of specific adapter
 * implementations.
 */

import { describe, it, expect, vi } from 'vitest';
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
  AdapterCapabilityDeclaration,
  TargetToolCapabilities,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createStubCapabilities(): AdapterCapabilityDeclaration {
  return {
    canWriteBack: false,
    writeBackMechanism: 'none',
    canSubscribeEvents: false,
    canReportSessions: false,
    supportsStructuredCorrection: false,
  };
}

function createStubTargetCapabilities(): TargetToolCapabilities {
  return {
    maxContextTokens: 10_000,
    supportsSystemPrompt: true,
    supportsFileWrites: true,
    supportsManagedSections: true,
  };
}

function createMockAdapter(
  id: string,
  overrides?: Partial<Pick<Adapter, 'detect' | 'transform' | 'extractLearnings' | 'verify'>>,
): Adapter {
  return {
    id,
    displayName: `Mock ${id}`,
    version: '1.0.0',
    capabilities: createStubCapabilities(),
    targetCapabilities: createStubTargetCapabilities(),
    async detect(_query: FilesystemQuery): Promise<DetectionResult> {
      return { detected: true, confidence: 0.9, configPaths: [] };
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
    ...overrides,
  };
}

function createMockQuery(files: Record<string, string> = {}): FilesystemQuery {
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
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(f);
        }
        return f === pattern;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAdapterRegistry', () => {
  describe('register', () => {
    it('adds an adapter to the registry', () => {
      const registry = createAdapterRegistry();
      const adapter = createMockAdapter('test-a');
      registry.register(adapter);
      expect(registry.adapters.size).toBe(1);
      expect(registry.adapters.has('test-a')).toBe(true);
    });

    it('adds multiple distinct adapters', () => {
      const registry = createAdapterRegistry();
      registry.register(createMockAdapter('alpha'));
      registry.register(createMockAdapter('beta'));
      registry.register(createMockAdapter('gamma'));
      expect(registry.adapters.size).toBe(3);
    });

    it('throws when registering a duplicate ID', () => {
      const registry = createAdapterRegistry();
      registry.register(createMockAdapter('duplicate-id'));
      expect(() => registry.register(createMockAdapter('duplicate-id'))).toThrow(
        /duplicate adapter ID/i,
      );
    });

    it('includes the duplicate ID in the error message', () => {
      const registry = createAdapterRegistry();
      registry.register(createMockAdapter('my-adapter'));
      expect(() => registry.register(createMockAdapter('my-adapter'))).toThrow(
        'my-adapter',
      );
    });
  });

  describe('getAdapter', () => {
    it('returns a registered adapter', () => {
      const registry = createAdapterRegistry();
      const adapter = createMockAdapter('lookup');
      registry.register(adapter);
      expect(registry.getAdapter('lookup')).toBe(adapter);
    });

    it('returns undefined for an unknown ID', () => {
      const registry = createAdapterRegistry();
      expect(registry.getAdapter('nonexistent')).toBeUndefined();
    });

    it('returns undefined from an empty registry', () => {
      const registry = createAdapterRegistry();
      expect(registry.getAdapter('anything')).toBeUndefined();
    });

    it('returns the correct adapter when multiple are registered', () => {
      const registry = createAdapterRegistry();
      const a = createMockAdapter('a');
      const b = createMockAdapter('b');
      const c = createMockAdapter('c');
      registry.register(a);
      registry.register(b);
      registry.register(c);

      expect(registry.getAdapter('a')).toBe(a);
      expect(registry.getAdapter('b')).toBe(b);
      expect(registry.getAdapter('c')).toBe(c);
    });
  });

  describe('detect', () => {
    it('runs all adapters concurrently and returns a Map of results', async () => {
      const registry = createAdapterRegistry();

      const detectedAdapter = createMockAdapter('found', {
        async detect() {
          return { detected: true, confidence: 0.95, configPaths: ['config.md'] };
        },
      });
      const notDetectedAdapter = createMockAdapter('missing', {
        async detect() {
          return { detected: false, confidence: 0, configPaths: [] };
        },
      });

      registry.register(detectedAdapter);
      registry.register(notDetectedAdapter);

      const query = createMockQuery();
      const results = await registry.detect(query);

      expect(results.size).toBe(2);
      expect(results.get('found')?.detected).toBe(true);
      expect(results.get('found')?.confidence).toBe(0.95);
      expect(results.get('missing')?.detected).toBe(false);
    });

    it('returns an empty map when no adapters are registered', async () => {
      const registry = createAdapterRegistry();
      const query = createMockQuery();
      const results = await registry.detect(query);
      expect(results.size).toBe(0);
    });

    it('runs detections concurrently (not sequentially)', async () => {
      const registry = createAdapterRegistry();
      const callOrder: string[] = [];

      const slowAdapter = createMockAdapter('slow', {
        async detect() {
          callOrder.push('slow-start');
          await new Promise((resolve) => setTimeout(resolve, 20));
          callOrder.push('slow-end');
          return { detected: true, confidence: 1, configPaths: [] };
        },
      });

      const fastAdapter = createMockAdapter('fast', {
        async detect() {
          callOrder.push('fast-start');
          callOrder.push('fast-end');
          return { detected: true, confidence: 1, configPaths: [] };
        },
      });

      registry.register(slowAdapter);
      registry.register(fastAdapter);

      const query = createMockQuery();
      await registry.detect(query);

      // Both should start before slow finishes
      expect(callOrder.indexOf('fast-start')).toBeLessThan(callOrder.indexOf('slow-end'));
    });

    it('passes the query to each adapter', async () => {
      const registry = createAdapterRegistry();
      const detectSpy = vi.fn(
        async (_query: FilesystemQuery): Promise<DetectionResult> => ({
          detected: false,
          confidence: 0,
          configPaths: [],
        }),
      );

      const adapter = createMockAdapter('spy', { detect: detectSpy });
      registry.register(adapter);

      const query = createMockQuery({ 'test.md': 'content' });
      await registry.detect(query);

      expect(detectSpy).toHaveBeenCalledTimes(1);
      expect(detectSpy).toHaveBeenCalledWith(query);
    });
  });
});
