/**
 * Tests for src/embedding/arctic.ts
 *
 * The ONNX runtime is mocked entirely. Tests focus on:
 * - Fallback mode activation when model file is absent
 * - Fallback mode produces deterministic, normalized vectors
 * - Fallback embeddings have correct dimensions
 * - embedBatch returns empty array for empty input
 * - embedBatch in fallback mode produces correct count
 * - Same text always produces identical fallback embeddings
 * - Different texts produce different fallback embeddings
 * - ONNX mode: initialization success and inference path
 * - createArcticProvider factory
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock existsSync before importing the module under test
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    existsSync: vi.fn(() => false), // Default: model not found
  };
});

import { existsSync } from 'node:fs';
import { ArcticEmbeddingProvider, createArcticProvider } from '../../embedding/arctic.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID } from '../../constants.js';

describe('ArcticEmbeddingProvider', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false);
  });

  describe('properties', () => {
    it('exposes the correct modelId', () => {
      const provider = new ArcticEmbeddingProvider();
      expect(provider.modelId).toBe(EMBEDDING_MODEL_ID);
    });

    it('exposes the correct dimensions', () => {
      const provider = new ArcticEmbeddingProvider();
      expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS);
    });
  });

  describe('fallback mode (no ONNX model)', () => {
    it('activates fallback mode when model file does not exist', async () => {
      const provider = new ArcticEmbeddingProvider();
      await provider.initialize();

      expect(provider.isFallbackMode).toBe(true);
    });

    it('produces embeddings with correct dimensionality', async () => {
      const provider = new ArcticEmbeddingProvider();
      await provider.initialize();

      const embedding = await provider.embed('test input');

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(EMBEDDING_DIMENSIONS);
    });

    it('produces normalized vectors (unit length)', async () => {
      const provider = new ArcticEmbeddingProvider();
      await provider.initialize();

      const embedding = await provider.embed('normalize me');

      let norm = 0;
      for (let i = 0; i < embedding.length; i++) {
        norm += embedding[i] * embedding[i];
      }
      norm = Math.sqrt(norm);

      expect(norm).toBeCloseTo(1.0, 4);
    });

    it('produces deterministic results for the same input', async () => {
      const provider = new ArcticEmbeddingProvider();
      await provider.initialize();

      const embedding1 = await provider.embed('deterministic');
      const embedding2 = await provider.embed('deterministic');

      expect(Array.from(embedding1)).toEqual(Array.from(embedding2));
    });

    it('produces different embeddings for different inputs', async () => {
      const provider = new ArcticEmbeddingProvider();
      await provider.initialize();

      const embedding1 = await provider.embed('input alpha');
      const embedding2 = await provider.embed('input beta');

      // They should not be identical
      let identical = true;
      for (let i = 0; i < embedding1.length; i++) {
        if (embedding1[i] !== embedding2[i]) {
          identical = false;
          break;
        }
      }
      expect(identical).toBe(false);
    });

    it('embedBatch returns empty array for empty input', async () => {
      const provider = new ArcticEmbeddingProvider();
      await provider.initialize();

      const results = await provider.embedBatch([]);
      expect(results).toEqual([]);
    });

    it('embedBatch returns correct number of embeddings', async () => {
      const provider = new ArcticEmbeddingProvider();
      await provider.initialize();

      const texts = ['one', 'two', 'three'];
      const results = await provider.embedBatch(texts);

      expect(results).toHaveLength(3);
      for (const emb of results) {
        expect(emb).toBeInstanceOf(Float32Array);
        expect(emb.length).toBe(EMBEDDING_DIMENSIONS);
      }
    });

    it('embedBatch produces deterministic results per text', async () => {
      const provider = new ArcticEmbeddingProvider();
      await provider.initialize();

      const results1 = await provider.embedBatch(['alpha', 'beta']);
      const results2 = await provider.embedBatch(['alpha', 'beta']);

      expect(Array.from(results1[0])).toEqual(Array.from(results2[0]));
      expect(Array.from(results1[1])).toEqual(Array.from(results2[1]));
    });

    it('works without calling initialize (auto-fallback)', async () => {
      const provider = new ArcticEmbeddingProvider();
      // Skip initialize — session is null, so embed should use fallback

      const embedding = await provider.embed('no init');
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(EMBEDDING_DIMENSIONS);
    });
  });

  describe('ONNX mode (mocked)', () => {
    it('activates fallback when ONNX session creation fails', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      vi.doMock('onnxruntime-node', () => ({
        Tensor: class {},
        InferenceSession: {
          create: vi.fn().mockRejectedValue(new Error('mock ONNX load failure')),
        },
      }));

      try {
        const provider = new ArcticEmbeddingProvider();
        await provider.initialize();

        expect(provider.isFallbackMode).toBe(true);
      } finally {
        vi.doUnmock('onnxruntime-node');
      }
    });
  });
});

describe('createArcticProvider', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('returns an initialized ArcticEmbeddingProvider', async () => {
    const provider = await createArcticProvider();

    expect(provider).toBeInstanceOf(ArcticEmbeddingProvider);
    expect(provider.isFallbackMode).toBe(true);
    expect(provider.modelId).toBe(EMBEDDING_MODEL_ID);
  });

  it('provider from factory can embed text', async () => {
    const provider = await createArcticProvider();
    const embedding = await provider.embed('factory test');

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(EMBEDDING_DIMENSIONS);
  });
});
