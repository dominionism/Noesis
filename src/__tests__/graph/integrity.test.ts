/**
 * Tests for Knowledge Graph Integrity Validation (src/graph/integrity.ts)
 *
 * Covers:
 * - validateGraphIntegrity: edge counting, orphan detection, valid edges
 * - pruneOrphanedEdges: removal of orphaned edges
 * - Edge cases: empty graph, all valid, all orphaned, mixed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { DatabaseConnection } from '../../core/database.js';
import {
  validateGraphIntegrity,
  pruneOrphanedEdges,
} from '../../graph/integrity.js';

let testDir: string;
let db: DatabaseConnection;

function insertMemory(db: DatabaseConnection, id: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO memories (id, type, title, content, tags, scope, sensitivity, confidence, source, signature, status, access_count, created_at, updated_at, last_accessed_at)
    VALUES (?, 'task', 'Test', 'content', '[]', 'global', 'INTERNAL', 0.5, 'agent', 'sig', 'active', 0, ?, ?, ?)
  `).run(id, now, now, now);
}

function insertEdge(db: DatabaseConnection, source: string, target: string, relation: string = 'related_to'): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO memory_edges (source_id, target_id, relation, weight, created_at)
    VALUES (?, ?, ?, 1.0, ?)
  `).run(source, target, relation, now);
}

function deleteMemory(db: DatabaseConnection, id: string): void {
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

beforeEach(() => {
  testDir = join(tmpdir(), `noesis-integrity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  db = DatabaseConnection.create(join(testDir, 'test.db'));
});

afterEach(() => {
  db.close();
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* best effort */ }
});

describe('validateGraphIntegrity', () => {
  it('returns zeroed report for empty graph', () => {
    const report = validateGraphIntegrity(db);
    expect(report.total_edges).toBe(0);
    expect(report.valid).toBe(0);
    expect(report.orphaned).toBe(0);
    expect(report.invalid_relation).toBe(0);
    expect(report.details).toEqual([]);
  });

  it('reports all edges as valid when both endpoints exist', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B');
    insertEdge(db, 'mem-B', 'mem-C');

    const report = validateGraphIntegrity(db);
    expect(report.total_edges).toBe(2);
    expect(report.valid).toBe(2);
    expect(report.orphaned).toBe(0);
    expect(report.details).toEqual([]);
  });

  it('detects orphaned edge when source is missing', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertEdge(db, 'mem-A', 'mem-B');

    // Delete source memory (cascade should delete edges, but let's
    // create the orphan condition by inserting an edge with a non-existent source directly)
    // We need to work around CASCADE by disabling FK temporarily
    db.exec('PRAGMA foreign_keys = OFF');
    insertEdge(db, 'phantom-source', 'mem-B');
    db.exec('PRAGMA foreign_keys = ON');

    const report = validateGraphIntegrity(db);
    expect(report.orphaned).toBe(1);
    const orphan = report.details.find(d => d.source_id === 'phantom-source');
    expect(orphan).toBeDefined();
    expect(orphan!.issue).toBe('source memory missing');
  });

  it('detects orphaned edge when target is missing', () => {
    insertMemory(db, 'mem-A');
    db.exec('PRAGMA foreign_keys = OFF');
    insertEdge(db, 'mem-A', 'phantom-target');
    db.exec('PRAGMA foreign_keys = ON');

    const report = validateGraphIntegrity(db);
    expect(report.orphaned).toBe(1);
    const orphan = report.details.find(d => d.target_id === 'phantom-target');
    expect(orphan).toBeDefined();
    expect(orphan!.issue).toBe('target memory missing');
  });

  it('detects orphaned edge when both endpoints missing', () => {
    db.exec('PRAGMA foreign_keys = OFF');
    insertEdge(db, 'phantom-A', 'phantom-B');
    db.exec('PRAGMA foreign_keys = ON');

    const report = validateGraphIntegrity(db);
    expect(report.orphaned).toBe(1);
    expect(report.details[0].issue).toBe('both endpoints missing');
  });

  it('correctly counts mixed valid and orphaned edges', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertEdge(db, 'mem-A', 'mem-B'); // valid

    db.exec('PRAGMA foreign_keys = OFF');
    insertEdge(db, 'phantom-X', 'mem-A'); // orphaned
    insertEdge(db, 'mem-B', 'phantom-Y'); // orphaned
    db.exec('PRAGMA foreign_keys = ON');

    const report = validateGraphIntegrity(db);
    expect(report.total_edges).toBe(3);
    expect(report.valid).toBe(1);
    expect(report.orphaned).toBe(2);
  });
});

describe('pruneOrphanedEdges', () => {
  it('returns 0 when no edges exist', () => {
    const removed = pruneOrphanedEdges(db);
    expect(removed).toBe(0);
  });

  it('returns 0 when all edges are valid', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertEdge(db, 'mem-A', 'mem-B');

    const removed = pruneOrphanedEdges(db);
    expect(removed).toBe(0);
  });

  it('removes orphaned edges and returns count', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertEdge(db, 'mem-A', 'mem-B'); // valid

    db.exec('PRAGMA foreign_keys = OFF');
    insertEdge(db, 'phantom-X', 'mem-A');
    insertEdge(db, 'mem-B', 'phantom-Y');
    db.exec('PRAGMA foreign_keys = ON');

    const removed = pruneOrphanedEdges(db);
    expect(removed).toBe(2);

    // Verify only valid edges remain
    const report = validateGraphIntegrity(db);
    expect(report.total_edges).toBe(1);
    expect(report.valid).toBe(1);
    expect(report.orphaned).toBe(0);
  });

  it('removes edges where both endpoints are missing', () => {
    db.exec('PRAGMA foreign_keys = OFF');
    insertEdge(db, 'phantom-A', 'phantom-B');
    db.exec('PRAGMA foreign_keys = ON');

    const removed = pruneOrphanedEdges(db);
    expect(removed).toBe(1);
  });

  it('preserves valid edges while removing orphans', () => {
    insertMemory(db, 'mem-A');
    insertMemory(db, 'mem-B');
    insertMemory(db, 'mem-C');
    insertEdge(db, 'mem-A', 'mem-B', 'causes');
    insertEdge(db, 'mem-B', 'mem-C', 'requires');

    db.exec('PRAGMA foreign_keys = OFF');
    insertEdge(db, 'phantom', 'mem-A', 'related_to');
    db.exec('PRAGMA foreign_keys = ON');

    const removed = pruneOrphanedEdges(db);
    expect(removed).toBe(1);

    const report = validateGraphIntegrity(db);
    expect(report.total_edges).toBe(2);
    expect(report.valid).toBe(2);
  });
});
