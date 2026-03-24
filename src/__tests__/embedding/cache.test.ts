/**
 * Tests for src/embedding/cache.ts
 *
 * Covers:
 * - EmbeddingCache: get/set/clear, LRU eviction, size tracking
 * - CachedEmbeddingProvider: cache hit, cache miss, batch delegation, clearCache
 * - withEmbeddingCache: factory function
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { EmbeddingCache, CachedEmbeddingProvider, withEmbeddingCache } from '../../embedding/cache.js';
import type { EmbeddingProvider } from '../../types.js';

function createMockProvider(overrides?: Partial<EmbeddingProvider>): EmbeddingProvider {
  return {
    modelId: 'test-model',
    dimensions: 4,
    embed: vi.fn(async (_text: string) => new Float32Array([0.1, 0.2, 0.3, 0.4])),
    embedBatch: vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4])),
    ),
    ...overrides,
  };
}

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache(3);
  });

  it('returns undefined for a cache miss', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('stores and retrieves an embedding by text key', () => {
    const embedding = new Float32Array([1, 2, 3]);
    cache.set('hello', embedding);
    const result = cache.get('hello');
    expect(result).toBe(embedding);
  });

  it('tracks size correctly', () => {
    expect(cache.size).toBe(0);
    cache.set('a', new Float32Array([1]));
    expect(cache.size).toBe(1);
    cache.set('b', new Float32Array([2]));
    expect(cache.size).toBe(2);
  });

  it('evicts the least recently used entry when capacity is exceeded', () => {
    cache.set('first', new Float32Array([1]));
    cache.set('second', new Float32Array([2]));
    cache.set('third', new Float32Array([3]));

    // Cache is full (capacity 3). Adding a fourth should evict 'first'.
    cache.set('fourth', new Float32Array([4]));

    expect(cache.size).toBe(3);
    expect(cache.get('first')).toBeUndefined();
    expect(cache.get('second')).toBeDefined();
    expect(cache.get('third')).toBeDefined();
    expect(cache.get('fourth')).toBeDefined();
  });

  it('promotes accessed entries so they are not evicted prematurely', () => {
    cache.set('a', new Float32Array([1]));
    cache.set('b', new Float32Array([2]));
    cache.set('c', new Float32Array([3]));

    // Access 'a' to promote it
    cache.get('a');

    // Adding 'd' should evict 'b' (now the LRU), not 'a'
    cache.set('d', new Float32Array([4]));

    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.get('d')).toBeDefined();
  });

  it('overwrites an existing entry without increasing size', () => {
    cache.set('key', new Float32Array([1]));
    cache.set('key', new Float32Array([99]));

    expect(cache.size).toBe(1);
    const result = cache.get('key');
    expect(result).toBeDefined();
    expect(result![0]).toBe(99);
  });

  it('clears all entries', () => {
    cache.set('a', new Float32Array([1]));
    cache.set('b', new Float32Array([2]));
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('uses SHA-256 hash of text as key, so identical text always hits', () => {
    const text = 'identical text input';
    cache.set(text, new Float32Array([42]));

    // Second set with the same text should overwrite, not add
    cache.set(text, new Float32Array([99]));
    expect(cache.size).toBe(1);
    expect(cache.get(text)![0]).toBe(99);
  });

  it('uses default EMBEDDING_CACHE_SIZE when no maxSize provided', () => {
    const defaultCache = new EmbeddingCache();
    // Should not throw; just verify it creates without error
    defaultCache.set('test', new Float32Array([1]));
    expect(defaultCache.size).toBe(1);
  });
});

describe('CachedEmbeddingProvider', () => {
  it('delegates modelId and dimensions to inner provider', () => {
    const inner = createMockProvider({ modelId: 'my-model', dimensions: 768 });
    const cached = new CachedEmbeddingProvider(inner);

    expect(cached.modelId).toBe('my-model');
    expect(cached.dimensions).toBe(768);
  });

  it('calls inner.embed on cache miss and caches the result', async () => {
    const inner = createMockProvider();
    const cached = new CachedEmbeddingProvider(inner);

    const result1 = await cached.embed('hello');
    expect(inner.embed).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(new Float32Array([0.1, 0.2, 0.3, 0.4]));

    // Second call with same text should hit cache
    const result2 = await cached.embed('hello');
    expect(inner.embed).toHaveBeenCalledTimes(1); // Not called again
    expect(result2).toEqual(result1);
  });

  it('calls inner.embed for different texts', async () => {
    const inner = createMockProvider();
    const cached = new CachedEmbeddingProvider(inner);

    await cached.embed('text-a');
    await cached.embed('text-b');

    expect(inner.embed).toHaveBeenCalledTimes(2);
  });

  it('embedBatch delegates each text through the cache', async () => {
    const callCount = { n: 0 };
    const inner = createMockProvider({
      embed: vi.fn(async (_text: string) => {
        callCount.n++;
        return new Float32Array([callCount.n, 0, 0, 0]);
      }),
    });
    const cached = new CachedEmbeddingProvider(inner);

    // Pre-cache one text
    await cached.embed('cached-text');
    expect(inner.embed).toHaveBeenCalledTimes(1);

    // embedBatch with one cached and one new
    const results = await cached.embedBatch(['cached-text', 'new-text']);

    expect(results).toHaveLength(2);
    // 'cached-text' should have been served from cache (value 1)
    expect(results[0][0]).toBe(1);
    // 'new-text' triggered a new embed call (value 2)
    expect(results[1][0]).toBe(2);
    expect(inner.embed).toHaveBeenCalledTimes(2); // Only one new call
  });

  it('clearCache empties the cache and getCacheSize returns 0', async () => {
    const inner = createMockProvider();
    const cached = new CachedEmbeddingProvider(inner);

    await cached.embed('text');
    expect(cached.getCacheSize()).toBe(1);

    cached.clearCache();
    expect(cached.getCacheSize()).toBe(0);

    // After clearing, next embed should hit the inner provider
    await cached.embed('text');
    expect(inner.embed).toHaveBeenCalledTimes(2);
  });

  it('accepts a custom EmbeddingCache instance', async () => {
    const sharedCache = new EmbeddingCache(5);
    const inner = createMockProvider();
    const cached = new CachedEmbeddingProvider(inner, sharedCache);

    await cached.embed('test');
    expect(sharedCache.size).toBe(1);
  });
});

describe('withEmbeddingCache', () => {
  it('returns a CachedEmbeddingProvider wrapping the given provider', async () => {
    const inner = createMockProvider();
    const cached = withEmbeddingCache(inner);

    expect(cached).toBeInstanceOf(CachedEmbeddingProvider);
    expect(cached.modelId).toBe(inner.modelId);
    expect(cached.dimensions).toBe(inner.dimensions);

    await cached.embed('test');
    expect(inner.embed).toHaveBeenCalledTimes(1);

    // Cache hit
    await cached.embed('test');
    expect(inner.embed).toHaveBeenCalledTimes(1);
  });
});
