/**
 * Snowflake Arctic Embed-S Embedding Provider
 *
 * Two operating modes:
 * 1. ONNX mode (preferred): Loads model + WordPiece tokenizer from ~/.agents/models/
 * 2. Fallback mode: Deterministic hash-based 384-dim vectors
 *
 * The class automatically selects the mode during initialize().
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { MODELS_DIR, EMBEDDING_MODEL_ID, EMBEDDING_DIMENSIONS } from '../constants.js';
import { WordPieceTokenizer } from './wordpiece-tokenizer.js';
import type { EmbeddingProvider } from '../types.js';

/** Minimal type surface for onnxruntime-node (optional dependency). */
interface OnnxTensorCtor {
  new (type: string, data: BigInt64Array, shape: readonly number[]): unknown;
}

interface OnnxRuntime {
  Tensor: OnnxTensorCtor;
  InferenceSession: {
    create(path: string, options: Record<string, unknown>): Promise<OnnxSession>;
  };
}

interface OnnxSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
}

const MODEL_DIR = join(MODELS_DIR, EMBEDDING_MODEL_ID);
const MODEL_PATH = join(MODEL_DIR, 'model.onnx');
const TOKENIZER_PATH = join(MODEL_DIR, 'tokenizer.json');
const MAX_SEQUENCE_LENGTH = 256;

// ---------------------------------------------------------------------------
// Tokenization fallback (used when tokenizer.json is missing)
// ---------------------------------------------------------------------------

function simpleTokenize(text: string, maxLength: number): BigInt64Array {
  const tokens = text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter((t) => t.length > 0);

  const ids = new BigInt64Array(maxLength);
  ids[0] = 101n; // [CLS]

  const limit = Math.min(tokens.length, maxLength - 2);
  for (let i = 0; i < limit; i++) {
    const hash = createHash('sha256').update(tokens[i]).digest();
    ids[i + 1] = BigInt(hash.readUInt32BE(0) % 30522);
  }

  ids[limit + 1] = 102n; // [SEP]
  return ids;
}

function createAttentionMask(tokenIds: BigInt64Array): BigInt64Array {
  const mask = new BigInt64Array(tokenIds.length);
  for (let i = 0; i < tokenIds.length; i++) {
    mask[i] = tokenIds[i] !== 0n ? 1n : 0n;
  }
  return mask;
}

// ---------------------------------------------------------------------------
// Fallback embedding (no ONNX model)
// ---------------------------------------------------------------------------

function fallbackEmbed(text: string, dimensions: number): Float32Array {
  const result = new Float32Array(dimensions);
  let hashInput = text;
  let offset = 0;

  while (offset < dimensions) {
    const digest = createHash('sha512').update(hashInput).digest();
    const floatsFromDigest = Math.min(16, dimensions - offset);

    for (let i = 0; i < floatsFromDigest; i++) {
      const uint32 = digest.readUInt32BE(i * 4);
      result[offset + i] = (uint32 / 0xffffffff) * 2 - 1;
    }

    offset += floatsFromDigest;
    hashInput = digest.toString('hex');
  }

  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += result[i] * result[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      result[i] /= norm;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ArcticEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string = EMBEDDING_MODEL_ID;
  readonly dimensions: number = EMBEDDING_DIMENSIONS;

  private session: OnnxSession | null = null;
  private ort: OnnxRuntime | null = null;
  private tokenizer: WordPieceTokenizer | null = null;
  private usingFallback = false;

  get isFallbackMode(): boolean {
    return this.usingFallback;
  }

  async initialize(): Promise<void> {
    if (!existsSync(MODEL_PATH)) {
      this.usingFallback = true;
      process.stderr.write(
        `[noesis:embedding] ONNX model not found at ${MODEL_PATH}. ` +
        `Using deterministic hash fallback.\n`
      );
      return;
    }

    try {
      const ortModule = await import('onnxruntime-node') as unknown as OnnxRuntime;
      this.ort = ortModule;

      this.session = await ortModule.InferenceSession.create(MODEL_PATH, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });
    } catch (err: unknown) {
      this.usingFallback = true;
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[noesis:embedding] Failed to load ONNX model: ${message}. ` +
        `Using deterministic hash fallback.\n`
      );
      return;
    }

    // Load proper WordPiece tokenizer if available
    if (existsSync(TOKENIZER_PATH)) {
      try {
        this.tokenizer = WordPieceTokenizer.fromFile(TOKENIZER_PATH);
        process.stderr.write(
          `[noesis:embedding] Loaded WordPiece tokenizer (${TOKENIZER_PATH})\n`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[noesis:embedding] Could not load tokenizer: ${message}. ` +
          `Using simple tokenizer (reduced accuracy).\n`
        );
      }
    } else {
      process.stderr.write(
        `[noesis:embedding] tokenizer.json not found. Using simple tokenizer (reduced accuracy).\n`
      );
    }
  }

  async embed(text: string): Promise<Float32Array> {
    if (this.usingFallback || this.session === null) {
      return fallbackEmbed(text, this.dimensions);
    }
    return this.runOnnxInference(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    if (this.usingFallback || this.session === null) {
      return texts.map((t) => fallbackEmbed(t, this.dimensions));
    }

    const results: Float32Array[] = [];
    for (const text of texts) {
      results.push(await this.runOnnxInference(text));
    }
    return results;
  }

  private async runOnnxInference(text: string): Promise<Float32Array> {
    const ort = this.ort!;
    const session = this.session!;

    const tokenIds = this.tokenizer
      ? this.tokenizer.tokenize(text, MAX_SEQUENCE_LENGTH)
      : simpleTokenize(text, MAX_SEQUENCE_LENGTH);
    const attentionMask = createAttentionMask(tokenIds);
    const tokenTypeIds = new BigInt64Array(MAX_SEQUENCE_LENGTH);

    const shape = [1, MAX_SEQUENCE_LENGTH] as const;
    const feeds: Record<string, unknown> = {
      input_ids: new ort.Tensor('int64', tokenIds, shape),
      attention_mask: new ort.Tensor('int64', attentionMask, shape),
      token_type_ids: new ort.Tensor('int64', tokenTypeIds, shape),
    };

    const output = await session.run(feeds);

    const outputKey =
      output['sentence_embedding'] !== undefined ? 'sentence_embedding'
        : output['last_hidden_state'] !== undefined ? 'last_hidden_state'
          : Object.keys(output)[0];

    const outputData = output[outputKey].data as Float32Array;

    let embedding: Float32Array;
    if (outputData.length === this.dimensions) {
      embedding = new Float32Array(outputData);
    } else if (outputData.length >= this.dimensions) {
      embedding = new Float32Array(outputData.buffer, outputData.byteOffset, this.dimensions);
    } else {
      embedding = new Float32Array(this.dimensions);
      embedding.set(outputData);
    }

    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      const normalized = new Float32Array(this.dimensions);
      for (let i = 0; i < this.dimensions; i++) {
        normalized[i] = embedding[i] / norm;
      }
      return normalized;
    }

    return embedding;
  }
}

export async function createArcticProvider(): Promise<ArcticEmbeddingProvider> {
  const provider = new ArcticEmbeddingProvider();
  await provider.initialize();
  return provider;
}
