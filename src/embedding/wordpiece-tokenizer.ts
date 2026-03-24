/**
 * WordPiece Tokenizer for BERT-style Models
 *
 * Loads vocabulary from tokenizer.json (HuggingFace format) and performs
 * proper WordPiece tokenization. This replaces the hash-based simpleTokenize
 * which produced meaningless token IDs for the ONNX model.
 *
 * Supports: lowercasing, punctuation splitting, WordPiece subword splitting,
 * [CLS]/[SEP] special tokens, and attention mask generation.
 */

import { readFileSync } from 'node:fs';

interface TokenizerConfig {
  model: {
    type: string;
    vocab: Record<string, number>;
    unk_token: string;
    continuing_subword_prefix: string;
    max_input_chars_per_word: number;
  };
}

export class WordPieceTokenizer {
  private readonly vocab: Map<string, number>;
  private readonly unkId: number;
  private readonly clsId: number;
  private readonly sepId: number;
  private readonly prefix: string;
  private readonly maxWordLength: number;

  constructor(config: TokenizerConfig) {
    this.vocab = new Map(Object.entries(config.model.vocab));
    this.unkId = this.vocab.get(config.model.unk_token) ?? 100;
    this.clsId = this.vocab.get('[CLS]') ?? 101;
    this.sepId = this.vocab.get('[SEP]') ?? 102;
    this.prefix = config.model.continuing_subword_prefix || '##';
    this.maxWordLength = config.model.max_input_chars_per_word || 100;
  }

  static fromFile(path: string): WordPieceTokenizer {
    const raw = readFileSync(path, 'utf-8');
    const config = JSON.parse(raw) as TokenizerConfig;
    return new WordPieceTokenizer(config);
  }

  /**
   * Tokenize text into padded BigInt64Array for ONNX inference.
   * Adds [CLS] at start and [SEP] at end.
   */
  tokenize(text: string, maxLength: number): BigInt64Array {
    const ids = this.encode(text);
    const result = new BigInt64Array(maxLength);

    // [CLS] + tokens + [SEP], truncated to maxLength
    result[0] = BigInt(this.clsId);
    const limit = Math.min(ids.length, maxLength - 2);
    for (let i = 0; i < limit; i++) {
      result[i + 1] = BigInt(ids[i]);
    }
    result[limit + 1] = BigInt(this.sepId);

    return result;
  }

  private encode(text: string): number[] {
    const normalized = text.toLowerCase().trim();
    const words = this.splitOnPunctuation(normalized);
    const ids: number[] = [];

    for (const word of words) {
      if (word.trim().length === 0) continue;

      if (word.length > this.maxWordLength) {
        ids.push(this.unkId);
        continue;
      }

      const subTokens = this.wordPieceSplit(word);
      for (const sub of subTokens) {
        ids.push(sub);
      }
    }

    return ids;
  }

  private splitOnPunctuation(text: string): string[] {
    const parts: string[] = [];
    let current = '';

    for (const char of text) {
      if (this.isPunctuation(char) || this.isWhitespace(char)) {
        if (current.length > 0) {
          parts.push(current);
          current = '';
        }
        if (this.isPunctuation(char)) {
          parts.push(char);
        }
      } else {
        current += char;
      }
    }

    if (current.length > 0) {
      parts.push(current);
    }

    return parts;
  }

  private wordPieceSplit(word: string): number[] {
    const ids: number[] = [];
    let start = 0;

    while (start < word.length) {
      let end = word.length;
      let found = false;

      while (start < end) {
        const substr = start > 0
          ? this.prefix + word.slice(start, end)
          : word.slice(start, end);

        const id = this.vocab.get(substr);
        if (id !== undefined) {
          ids.push(id);
          found = true;
          break;
        }
        end--;
      }

      if (!found) {
        ids.push(this.unkId);
        break;
      }

      start = end;
    }

    return ids;
  }

  private isPunctuation(char: string): boolean {
    const code = char.charCodeAt(0);
    // ASCII punctuation ranges
    if ((code >= 33 && code <= 47) || (code >= 58 && code <= 64) ||
        (code >= 91 && code <= 96) || (code >= 123 && code <= 126)) {
      return true;
    }
    // Unicode general punctuation
    const cat = char.normalize('NFD');
    return /\p{P}/u.test(cat);
  }

  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }
}
