/**
 * In-Memory LRU Cache for Embedding Vectors
 *
 * Capacity: EMBEDDING_CACHE_SIZE entries (default 100).
 * Key: SHA-256 hash of input text.
 * Value: Float32Array embedding.
 */

import { createHash } from 'node:crypto';

import type { EmbeddingProvider } from '../types.js';
import { EMBEDDING_CACHE_SIZE } from '../constants.js';

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export class EmbeddingCache {
  private readonly maxSize: number;
  private readonly store = new Map<string, Float32Array>();
  private accessOrder: string[] = [];

  constructor(maxSize: number = EMBEDDING_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  get size(): number {
    return this.store.size;
  }

  get(text: string): Float32Array | undefined {
    const key = hashText(text);
    const value = this.store.get(key);
    if (value !== undefined) {
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
      this.accessOrder.push(key);
    }
    return value;
  }

  set(text: string, embedding: Float32Array): void {
    const key = hashText(text);

    if (this.store.has(key)) {
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
    } else if (this.store.size >= this.maxSize) {
      const lruKey = this.accessOrder.shift();
      if (lruKey !== undefined) {
        this.store.delete(lruKey);
      }
    }

    this.store.set(key, embedding);
    this.accessOrder.push(key);
  }

  clear(): void {
    this.store.clear();
    this.accessOrder = [];
  }
}

export class CachedEmbeddingProvider implements EmbeddingProvider {
  private readonly cache: EmbeddingCache;

  constructor(
    private readonly inner: EmbeddingProvider,
    cache?: EmbeddingCache,
  ) {
    this.cache = cache ?? new EmbeddingCache();
  }

  get modelId(): string {
    return this.inner.modelId;
  }

  get dimensions(): number {
    return this.inner.dimensions;
  }

  async embed(text: string): Promise<Float32Array> {
    const cached = this.cache.get(text);
    if (cached !== undefined) return cached;

    const result = await this.inner.embed(text);
    this.cache.set(text, result);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export function withEmbeddingCache(provider: EmbeddingProvider): CachedEmbeddingProvider {
  return new CachedEmbeddingProvider(provider);
}
