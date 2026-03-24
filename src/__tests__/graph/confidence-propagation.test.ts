/**
 * Tests for Confidence Propagation (src/graph/confidence-propagation.ts)
 *
 * Covers:
 * - computeEffectiveConfidence: own confidence, dependency chain, cycle detection
 * - propagateConfidenceChange: finds dependents and computes effective values
 * - batchEffectiveConfidence: batch computation
 * - Edge weighting effect on propagated confidence
 * - Non-mutating (advisory) behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { DatabaseConnection } from '../../core/database.js';
import {
  computeEffectiveConfidence,
  propagateConfidenceChange,
  batchEffectiveConfidence,
} from '../../graph/confidence-propagation.js';

let testDir: string;
let db: DatabaseConnection;

function insertMemory(db: DatabaseConnection, id: string, confidence: number = 0.8): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO memories (id, type, title, content, tags, scope, sensitivity, confidence, source, signature, status, access_count, created_at, updated_at, last_accessed_at)
    VALUES (?, 'task', 'Test', 'content', '[]', 'global', 'INTERNAL', ?, 'agent', 'sig', 'active', 0, ?, ?, ?)
  `).run(id, confidence, now, now, now);
}

function insertEdge(db: DatabaseConnection, source: string, target: string, relation: string, weight: number = 1.0): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO memory_edges (source_id, target_id, relation, weight, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(source, target, relation, weight, now);
}

beforeEach(() => {
  testDir = join(tmpdir(), `noesis-confprop-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  db = DatabaseConnection.create(join(testDir, 'test.db'));
});

afterEach(() => {
  db.close();
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* best effort */ }
});

describe('computeEffectiveConfidence', () => {
  it('returns 0 when memory does not exist', () => {
    const result = computeEffectiveConfidence(db, 'nonexistent');
    expect(result).toBe(0);
  });

  it('returns own confidence when no dependencies', () => {
    insertMemory(db, 'mem-A', 0.9);
    const result = computeEffectiveConfidence(db, 'mem-A');
    expect(result).toBe(0.9);
  });

  it('reduces confidence based on dependency confidence', () => {
    insertMemory(db, 'mem-A', 0.8); // A requires B
    insertMemory(db, 'mem-B', 0.5);
    insertEdge(db, 'mem-A', 'mem-B', 'requires', 1.0);

    const result = computeEffectiveConfidence(db, 'mem-A');
    // effective = 0.8 * min(0.5 * 1.0) = 0.8 * 0.5 = 0.4
    expect(result).toBeCloseTo(0.4, 5);
  });

  it('uses minimum dependency confidence when multiple deps exist', () => {
    insertMemory(db, 'mem-A', 0.9);
    insertMemory(db, 'mem-B', 0.7);
    insertMemory(db, 'mem-C', 0.3); // lowest dependency
    insertEdge(db, 'mem-A', 'mem-B', 'requires', 1.0);
    insertEdge(db, 'mem-A', 'mem-C', 'requires', 1.0);

    const result = computeEffectiveConfidence(db, 'mem-A');
    // effective = 0.9 * min(0.7, 0.3) = 0.9 * 0.3 = 0.27
    expect(result).toBeCloseTo(0.27, 5);
  });

  it('applies edge weight to dependency confidence', () => {
    insertMemory(db, 'mem-A', 0.8);
    insertMemory(db, 'mem-B', 0.6);
    insertEdge(db, 'mem-A', 'mem-B', 'requires', 0.5);

    const result = computeEffectiveConfidence(db, 'mem-A');
    // effective = 0.8 * (0.6 * 0.5) = 0.8 * 0.3 = 0.24
    expect(result).toBeCloseTo(0.24, 5);
  });

  it('handles transitive dependencies', () => {
    insertMemory(db, 'mem-A', 0.9);
    insertMemory(db, 'mem-B', 0.8);
    insertMemory(db, 'mem-C', 0.5);
    insertEdge(db, 'mem-A', 'mem-B', 'requires', 1.0);
    insertEdge(db, 'mem-B', 'mem-C', 'requires', 1.0);

    const result = computeEffectiveConfidence(db, 'mem-A');
    // B's effective = 0.8 * 0.5 = 0.4
    // A's effective = 0.9 * 0.4 = 0.36
    expect(result).toBeCloseTo(0.36, 5);
  });

  it('detects cycles and breaks with confidence 1.0', () => {
    insertMemory(db, 'mem-A', 0.8);
    insertMemory(db, 'mem-B', 0.7);
    insertEdge(db, 'mem-A', 'mem-B', 'requires', 1.0);
    insertEdge(db, 'mem-B', 'mem-A', 'requires', 1.0);

    // Should not hang or throw
    const result = computeEffectiveConfidence(db, 'mem-A');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('ignores non-requires edges', () => {
    insertMemory(db, 'mem-A', 0.9);
    insertMemory(db, 'mem-B', 0.1);
    // Use 'causes' instead of 'requires'
    insertEdge(db, 'mem-A', 'mem-B', 'causes', 1.0);

    const result = computeEffectiveConfidence(db, 'mem-A');
    // Should not be affected by non-requires edges
    expect(result).toBe(0.9);
  });

  it('handles a memory with no dependencies returning own confidence', () => {
    insertMemory(db, 'mem-Standalone', 0.75);
    const result = computeEffectiveConfidence(db, 'mem-Standalone');
    expect(result).toBe(0.75);
  });
});

describe('propagateConfidenceChange', () => {
  it('returns empty array when no dependents exist', () => {
    insertMemory(db, 'mem-A');
    const results = propagateConfidenceChange(db, 'mem-A');
    expect(results).toEqual([]);
  });

  it('finds dependents and computes their effective confidence', () => {
    insertMemory(db, 'mem-A', 0.8);
    insertMemory(db, 'mem-B', 0.5); // B is the changed memory
    insertEdge(db, 'mem-A', 'mem-B', 'requires', 1.0);

    const results = propagateConfidenceChange(db, 'mem-B');
    expect(results).toHaveLength(1);
    expect(results[0].memoryId).toBe('mem-A');
    expect(results[0].effectiveConfidence).toBeCloseTo(0.4, 5);
  });

  it('finds multiple dependents', () => {
    insertMemory(db, 'mem-A', 0.8);
    insertMemory(db, 'mem-B', 0.9);
    insertMemory(db, 'mem-C', 0.5); // changed
    insertEdge(db, 'mem-A', 'mem-C', 'requires', 1.0);
    insertEdge(db, 'mem-B', 'mem-C', 'requires', 1.0);

    const results = propagateConfidenceChange(db, 'mem-C');
    expect(results).toHaveLength(2);
    const memoryIds = results.map(r => r.memoryId).sort();
    expect(memoryIds).toEqual(['mem-A', 'mem-B']);
  });

  it('does not mutate the database', () => {
    insertMemory(db, 'mem-A', 0.8);
    insertMemory(db, 'mem-B', 0.5);
    insertEdge(db, 'mem-A', 'mem-B', 'requires', 1.0);

    propagateConfidenceChange(db, 'mem-B');

    // Verify A's stored confidence is unchanged
    const row = db.prepare<[string], { confidence: number }>(
      'SELECT confidence FROM memories WHERE id = ?',
    ).get('mem-A');
    expect(row!.confidence).toBe(0.8); // unchanged
  });
});

describe('batchEffectiveConfidence', () => {
  it('returns empty map for empty input', () => {
    const result = batchEffectiveConfidence(db, []);
    expect(result.size).toBe(0);
  });

  it('computes effective confidence for multiple memories', () => {
    insertMemory(db, 'mem-A', 0.9);
    insertMemory(db, 'mem-B', 0.7);
    insertMemory(db, 'mem-C', 0.5);
    insertEdge(db, 'mem-A', 'mem-C', 'requires', 1.0);

    const result = batchEffectiveConfidence(db, ['mem-A', 'mem-B']);
    expect(result.size).toBe(2);
    // mem-A depends on mem-C (0.5): effective = 0.9 * 0.5 = 0.45
    expect(result.get('mem-A')).toBeCloseTo(0.45, 5);
    // mem-B has no deps: effective = 0.7
    expect(result.get('mem-B')).toBe(0.7);
  });

  it('returns 0 for nonexistent memory IDs', () => {
    const result = batchEffectiveConfidence(db, ['nonexistent']);
    expect(result.get('nonexistent')).toBe(0);
  });
});
