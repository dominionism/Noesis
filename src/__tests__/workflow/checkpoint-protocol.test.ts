/**
 * Tests for Checkpoint Protocol — 3-Type Checkpoint System
 *
 * Covers:
 * - create: all 3 checkpoint types
 * - resolve: resolution with and without message
 * - getPending / getAll: filtering
 * - isBlocked: blocked state detection
 * - clear: state reset
 * - Error conditions: not found, already resolved
 */

import { describe, it, expect } from 'vitest';
import {
  createCheckpointProtocol,
  type CheckpointType,
} from '../../workflow/checkpoint-protocol.js';

// ---------------------------------------------------------------------------
// createCheckpointProtocol
// ---------------------------------------------------------------------------

describe('createCheckpointProtocol', () => {
  it('creates a protocol with empty state', () => {
    const protocol = createCheckpointProtocol();
    expect(protocol.getAll()).toHaveLength(0);
    expect(protocol.getPending()).toHaveLength(0);
    expect(protocol.isBlocked()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('create', () => {
  it('creates a human_verify checkpoint', () => {
    const protocol = createCheckpointProtocol();
    const cp = protocol.create(
      'human_verify',
      'Verify the deployment succeeded',
      'Production deployment completed',
    );

    expect(cp.id).toBeDefined();
    expect(cp.type).toBe('human_verify');
    expect(cp.description).toBe('Verify the deployment succeeded');
    expect(cp.context).toBe('Production deployment completed');
    expect(cp.resolved).toBe(false);
    expect(cp.createdAt).toBeDefined();
    expect(cp.options).toBeUndefined();
  });

  it('creates a decision checkpoint with options', () => {
    const protocol = createCheckpointProtocol();
    const cp = protocol.create(
      'decision',
      'Choose database engine',
      'Need to select a database',
      ['PostgreSQL', 'SQLite', 'MySQL'],
    );

    expect(cp.type).toBe('decision');
    expect(cp.options).toEqual(['PostgreSQL', 'SQLite', 'MySQL']);
  });

  it('creates a human_action checkpoint', () => {
    const protocol = createCheckpointProtocol();
    const cp = protocol.create(
      'human_action',
      'Run the migration manually',
      'Database migration requires DBA credentials',
    );

    expect(cp.type).toBe('human_action');
  });

  it('generates unique IDs', () => {
    const protocol = createCheckpointProtocol();
    const cp1 = protocol.create('human_verify', 'check 1', 'ctx 1');
    const cp2 = protocol.create('human_verify', 'check 2', 'ctx 2');

    expect(cp1.id).not.toBe(cp2.id);
  });

  it('all types are supported', () => {
    const protocol = createCheckpointProtocol();
    const types: CheckpointType[] = ['human_verify', 'decision', 'human_action'];

    for (const type of types) {
      const cp = protocol.create(type, `${type} checkpoint`, 'context');
      expect(cp.type).toBe(type);
    }

    expect(protocol.getAll()).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------

describe('resolve', () => {
  it('resolves a pending checkpoint', () => {
    const protocol = createCheckpointProtocol();
    const cp = protocol.create('human_verify', 'check it', 'context');

    const resolved = protocol.resolve(cp.id, 'Looks good');

    expect(resolved.resolved).toBe(true);
    expect(resolved.resolution).toBe('Looks good');
    expect(resolved.resolvedAt).toBeDefined();
  });

  it('resolves without a resolution message', () => {
    const protocol = createCheckpointProtocol();
    const cp = protocol.create('human_verify', 'check it', 'context');

    const resolved = protocol.resolve(cp.id);

    expect(resolved.resolved).toBe(true);
    expect(resolved.resolution).toBeUndefined();
  });

  it('throws for non-existent checkpoint', () => {
    const protocol = createCheckpointProtocol();

    expect(() => protocol.resolve('non-existent')).toThrow('Checkpoint not found');
  });

  it('throws for already resolved checkpoint', () => {
    const protocol = createCheckpointProtocol();
    const cp = protocol.create('human_verify', 'check it', 'context');
    protocol.resolve(cp.id, 'done');

    expect(() => protocol.resolve(cp.id, 'again')).toThrow('already resolved');
  });
});

// ---------------------------------------------------------------------------
// getPending
// ---------------------------------------------------------------------------

describe('getPending', () => {
  it('returns only unresolved checkpoints', () => {
    const protocol = createCheckpointProtocol();
    const cp1 = protocol.create('human_verify', 'check 1', 'ctx');
    protocol.create('decision', 'decide', 'ctx', ['A', 'B']);
    protocol.resolve(cp1.id);

    const pending = protocol.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('decision');
  });

  it('returns empty array when all resolved', () => {
    const protocol = createCheckpointProtocol();
    const cp = protocol.create('human_verify', 'check', 'ctx');
    protocol.resolve(cp.id);

    expect(protocol.getPending()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getAll
// ---------------------------------------------------------------------------

describe('getAll', () => {
  it('returns all checkpoints regardless of status', () => {
    const protocol = createCheckpointProtocol();
    const cp1 = protocol.create('human_verify', 'check 1', 'ctx');
    protocol.create('decision', 'decide', 'ctx');
    protocol.resolve(cp1.id);

    expect(protocol.getAll()).toHaveLength(2);
  });

  it('returns a copy (not internal array)', () => {
    const protocol = createCheckpointProtocol();
    protocol.create('human_verify', 'check', 'ctx');

    const all = protocol.getAll();
    all.push({} as any);

    expect(protocol.getAll()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isBlocked
// ---------------------------------------------------------------------------

describe('isBlocked', () => {
  it('returns false when no checkpoints', () => {
    const protocol = createCheckpointProtocol();
    expect(protocol.isBlocked()).toBe(false);
  });

  it('returns true when any checkpoint is pending', () => {
    const protocol = createCheckpointProtocol();
    protocol.create('human_verify', 'check', 'ctx');

    expect(protocol.isBlocked()).toBe(true);
  });

  it('returns false when all checkpoints resolved', () => {
    const protocol = createCheckpointProtocol();
    const cp = protocol.create('human_verify', 'check', 'ctx');
    protocol.resolve(cp.id);

    expect(protocol.isBlocked()).toBe(false);
  });

  it('returns true when at least one checkpoint is unresolved', () => {
    const protocol = createCheckpointProtocol();
    const cp1 = protocol.create('human_verify', 'check 1', 'ctx');
    protocol.create('human_action', 'do it', 'ctx');
    protocol.resolve(cp1.id);

    expect(protocol.isBlocked()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe('clear', () => {
  it('removes all checkpoints', () => {
    const protocol = createCheckpointProtocol();
    protocol.create('human_verify', 'check', 'ctx');
    protocol.create('decision', 'decide', 'ctx');

    protocol.clear();

    expect(protocol.getAll()).toHaveLength(0);
    expect(protocol.getPending()).toHaveLength(0);
    expect(protocol.isBlocked()).toBe(false);
  });
});
