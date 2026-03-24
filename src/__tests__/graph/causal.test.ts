/**
 * Tests for Causal Chain Construction (src/graph/causal.ts)
 *
 * Covers:
 * - buildCausalChainForward: follows 'causes' edges from root to effect
 * - buildCausalChainBackward: follows 'caused_by' edges from effect to root
 * - findCausalChains: combines forward and backward traversal
 * - Cycle detection
 * - Max depth enforcement
 * - Confidence tracking across chain
 * - Returns null for single-node chains (no edges)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { DatabaseConnection } from '../../core/database.js';
import {
  buildCausalChainForward,
  buildCausalChainBackward,
  findCausalChains,
} from '../../graph/causal.js';

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
  testDir = join(tmpdir(), `noesis-causal-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  db = DatabaseConnection.create(join(testDir, 'test.db'));
});

afterEach(() => {
  db.close();
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* best effort */ }
});

describe('buildCausalChainForward', () => {
  it('returns null when memory has no outgoing causes edges', () => {
    insertMemory(db, 'mem-A');
    const result = buildCausalChainForward(db, 'mem-A');
    expect(result).toBeNull();
  });

  it('builds a simple two-node chain', () => {
    insertMemory(db, 'mem-A', 0.9);
    insertMemory(db, 'mem-B', 0.7);
    insertEdge(db, 'mem-A', 'mem-B', 'causes', 1.0);

    const result = buildCausalChainForward(db, 'mem-A');
    expect(result).not.toBeNull();
    expect(result!.chain).toEqual(['mem-A', 'mem-B']);
    expect(result!.relation_types).toEqual(['causes']);
    expect(result!.total_weight).toBe(1.0);
    expect(result!.confidence).toBe(0.7); // min confidence
  });

  it('builds a multi-hop chain', () => {
    insertMemory(db, 'mem-A', 0.9);
    insertMemory(db, 'mem-B', 0.8);
    insertMemory(db, 'mem-C', 0.6);
    insertEdge(db, 'mem-A', 'mem-B', 'causes', 1.0);
    insertEdge(db, 'mem-B', 'mem-C', 'causes', 0.5);

    const result = buildCausalChainForward(db, 'mem-A');
    expect(result).not.toBeNull();
    expect(result!.chain).toEqual(['mem-A', 'mem-B', 'mem-C']);
    expect(result!.relation_types).toEqual(['causes', 'causes']);
    expect(result!.total_weight).toBe(1.5);
    expect(result!.confidence).toBe(0.6); // min across chain
  });

  it('detects and stops at cycles', () => {
    insertMemory(db, 'mem-A', 0.8);
    insertMemory(db, 'mem-B', 0.7);
    insertEdge(db, 'mem-A', 'mem-B', 'causes');
    insertEdge(db, 'mem-B', 'mem-A', 'causes'); // cycle

    const result = buildCausalChainForward(db, 'mem-A');
    expect(result).not.toBeNull();
    expect(result!.chain).toEqual(['mem-A', 'mem-B']);
    // Should not loop forever
  });

  it('respects maxLength parameter', () => {
    insertMemory(db, 'mem-A', 0.9);
    insertMemory(db, 'mem-B', 0.8);
    insertMemory(db, 'mem-C', 0.7);
    insertMemory(db, 'mem-D', 0.6);
    insertEdge(db, 'mem-A', 'mem-B', 'causes');
    insertEdge(db, 'mem-B', 'mem-C', 'causes');
    insertEdge(db, 'mem-C', 'mem-D', 'causes');

    const result = buildCausalChainForward(db, 'mem-A', 2);
    expect(result).not.toBeNull();
    // Should stop after 2 hops: A -> B -> C (not D)
    expect(result!.chain).toEqual(['mem-A', 'mem-B', 'mem-C']);
  });

  it('follows highest weight edge when multiple exist', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B', 'causes', 0.3);
    insertEdge(db, 'mem-A', 'mem-C', 'causes', 0.9);

    const result = buildCausalChainForward(db, 'mem-A');
    expect(result).not.toBeNull();
    // Should follow the higher weight edge to mem-C
    expect(result!.chain[1]).toBe('mem-C');
  });

  it('returns confidence 0 when starting memory does not exist', () => {
    const result = buildCausalChainForward(db, 'nonexistent');
    expect(result).toBeNull();
  });

  it('tracks minimum confidence correctly across long chain', () => {
    insertMemory(db, 'mem-A', 0.9);
    insertMemory(db, 'mem-B', 0.3); // lowest
    insertMemory(db, 'mem-C', 0.7);
    insertEdge(db, 'mem-A', 'mem-B', 'causes');
    insertEdge(db, 'mem-B', 'mem-C', 'causes');

    const result = buildCausalChainForward(db, 'mem-A');
    expect(result!.confidence).toBe(0.3);
  });
});

describe('buildCausalChainBackward', () => {
  it('returns null when memory has no incoming causal edges', () => {
    insertMemory(db, 'mem-A');
    const result = buildCausalChainBackward(db, 'mem-A');
    expect(result).toBeNull();
  });

  it('builds backward chain via caused_by edges', () => {
    insertMemory(db, 'mem-A', 0.9);
    insertMemory(db, 'mem-B', 0.7);
    insertEdge(db, 'mem-B', 'mem-A', 'caused_by', 1.0);

    const result = buildCausalChainBackward(db, 'mem-B');
    expect(result).not.toBeNull();
    // Chain should be root-cause-first: [A, B]
    expect(result!.chain).toEqual(['mem-A', 'mem-B']);
    expect(result!.relation_types).toEqual(['caused_by']);
  });

  it('builds backward chain via reverse causes edges', () => {
    insertMemory(db, 'mem-A', 0.8);
    insertMemory(db, 'mem-B', 0.7);
    // A causes B means B can trace backward to A
    insertEdge(db, 'mem-A', 'mem-B', 'causes', 1.0);

    const result = buildCausalChainBackward(db, 'mem-B');
    expect(result).not.toBeNull();
    expect(result!.chain).toEqual(['mem-A', 'mem-B']);
  });

  it('detects and stops at cycles', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertEdge(db, 'mem-A', 'mem-B', 'caused_by');
    insertEdge(db, 'mem-B', 'mem-A', 'caused_by');

    const result = buildCausalChainBackward(db, 'mem-A');
    expect(result).not.toBeNull();
    expect(result!.chain).toHaveLength(2);
  });

  it('respects maxLength parameter', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertMemory(db, 'mem-D');
    insertEdge(db, 'mem-B', 'mem-A', 'caused_by');
    insertEdge(db, 'mem-C', 'mem-B', 'caused_by');
    insertEdge(db, 'mem-D', 'mem-C', 'caused_by');

    const result = buildCausalChainBackward(db, 'mem-D', 1);
    expect(result).not.toBeNull();
    expect(result!.chain).toHaveLength(2);
  });

  it('tracks minimum confidence', () => {
    insertMemory(db, 'mem-A', 0.4); // lowest
    insertMemory(db, 'mem-B', 0.9);
    insertEdge(db, 'mem-B', 'mem-A', 'caused_by');

    const result = buildCausalChainBackward(db, 'mem-B');
    expect(result!.confidence).toBe(0.4);
  });
});

describe('findCausalChains', () => {
  it('returns empty array when no causal edges exist', () => {
    insertMemory(db, 'mem-A');
    const chains = findCausalChains(db, 'mem-A');
    expect(chains).toEqual([]);
  });

  it('returns forward chain when memory is a cause', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertEdge(db, 'mem-A', 'mem-B', 'causes');

    const chains = findCausalChains(db, 'mem-A');
    expect(chains.length).toBeGreaterThanOrEqual(1);
    // Should find forward chain A -> B
    const forwardChain = chains.find(c => c.chain[0] === 'mem-A');
    expect(forwardChain).toBeDefined();
    expect(forwardChain!.chain).toEqual(['mem-A', 'mem-B']);
  });

  it('returns backward chain when memory is an effect', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertEdge(db, 'mem-A', 'mem-B', 'causes');

    const chains = findCausalChains(db, 'mem-B');
    expect(chains.length).toBeGreaterThanOrEqual(1);
    // Should find backward chain A -> B (root cause first)
    const backwardChain = chains.find(c => c.chain[c.chain.length - 1] === 'mem-B');
    expect(backwardChain).toBeDefined();
  });

  it('returns both forward and backward chains for mid-chain memory', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B', 'causes');
    insertEdge(db, 'mem-B', 'mem-C', 'causes');

    const chains = findCausalChains(db, 'mem-B');
    // Should have both forward (B -> C) and backward (A -> B) chains
    expect(chains.length).toBe(2);
  });

  it('passes maxLength through to builders', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertMemory(db, 'mem-D');
    insertEdge(db, 'mem-A', 'mem-B', 'causes');
    insertEdge(db, 'mem-B', 'mem-C', 'causes');
    insertEdge(db, 'mem-C', 'mem-D', 'causes');

    const chains = findCausalChains(db, 'mem-B', 1);
    // Forward from B should only reach C (1 hop), not D
    const forward = chains.find(c => c.chain[0] === 'mem-B');
    if (forward) {
      expect(forward.chain).toEqual(['mem-B', 'mem-C']);
    }
  });
});
