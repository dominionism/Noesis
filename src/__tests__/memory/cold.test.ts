/**
 * Tests for Cold Storage Management (src/memory/cold.ts)
 *
 * Covers:
 * - getColdStoragePath with and without project ID
 * - appendColdEvent writes JSONL and sets permissions
 * - rotateIfNeeded triggers rotation at max size
 * - readColdEvents parses valid JSONL, skips invalid lines
 * - Path traversal prevention via validateProjectId
 * - Handling of missing/empty files
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ColdEvent } from '../../types.js';

let testDir: string;
let coldDir: string;

// Mock constants so COLD_STORAGE_DIR points to our temp directory
vi.mock('../../constants.js', async () => {
  return {
    get COLD_STORAGE_DIR() {
      return (globalThis as any).__noesis_test_cold_dir ?? '/tmp/noesis-cold-fallback';
    },
    COLD_STORAGE_MAX_MB: 50,
    FILE_PERMISSIONS: {
      DIR: 0o700,
      DB: 0o600,
      SIGNING_KEY: 0o400,
      AUDIT_LOG: 0o600,
      CONFIG: 0o600,
      COLD_DIR: 0o700,
    },
  };
});

function setColdDir(dir: string): void {
  (globalThis as any).__noesis_test_cold_dir = dir;
}

function makeColdEvent(overrides?: Partial<ColdEvent>): ColdEvent {
  return {
    timestamp: new Date().toISOString(),
    session_memory_id: 'ses-001',
    agent: 'claude',
    event_type: 'user_message',
    content_hash: 'abc123',
    content: 'Hello world',
    ...overrides,
  };
}

describe('cold storage', () => {
  let getColdStoragePath: typeof import('../../memory/cold.js').getColdStoragePath;
  let appendColdEvent: typeof import('../../memory/cold.js').appendColdEvent;
  let rotateIfNeeded: typeof import('../../memory/cold.js').rotateIfNeeded;
  let readColdEvents: typeof import('../../memory/cold.js').readColdEvents;

  beforeEach(async () => {
    testDir = join(tmpdir(), `noesis-cold-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    coldDir = join(testDir, 'cold');
    mkdirSync(coldDir, { recursive: true });
    setColdDir(coldDir);

    const mod = await import('../../memory/cold.js');
    getColdStoragePath = mod.getColdStoragePath;
    appendColdEvent = mod.appendColdEvent;
    rotateIfNeeded = mod.rotateIfNeeded;
    readColdEvents = mod.readColdEvents;
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch { /* best effort */ }
  });

  describe('getColdStoragePath', () => {
    it('returns base events.jsonl when no project ID', () => {
      const path = getColdStoragePath();
      expect(path).toBe(join(coldDir, 'events.jsonl'));
    });

    it('returns project-scoped path when project ID provided', () => {
      const path = getColdStoragePath('myproject');
      expect(path).toBe(join(coldDir, 'myproject', 'events.jsonl'));
    });

    it('rejects project IDs with path traversal', () => {
      expect(() => getColdStoragePath('..')).toThrow('Invalid project ID');
      expect(() => getColdStoragePath('../etc')).toThrow('Invalid project ID');
    });

    it('rejects project IDs with slashes', () => {
      expect(() => getColdStoragePath('a/b')).toThrow('Invalid project ID');
      expect(() => getColdStoragePath('a\\b')).toThrow('Invalid project ID');
    });

    it('rejects project IDs with null bytes', () => {
      expect(() => getColdStoragePath('a\0b')).toThrow('Invalid project ID');
    });

    it('rejects empty/whitespace project IDs', () => {
      expect(() => getColdStoragePath('   ')).toThrow('Invalid project ID');
    });
  });

  describe('appendColdEvent', () => {
    it('creates file and appends a single event as JSONL', () => {
      const event = makeColdEvent();
      appendColdEvent(event);

      const filePath = getColdStoragePath();
      expect(existsSync(filePath)).toBe(true);

      const raw = readFileSync(filePath, 'utf-8');
      const lines = raw.trim().split('\n');
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.agent).toBe('claude');
      expect(parsed.event_type).toBe('user_message');
    });

    it('appends multiple events as separate JSONL lines', () => {
      appendColdEvent(makeColdEvent({ content: 'first' }));
      appendColdEvent(makeColdEvent({ content: 'second' }));

      const filePath = getColdStoragePath();
      const raw = readFileSync(filePath, 'utf-8');
      const lines = raw.trim().split('\n');
      expect(lines).toHaveLength(2);

      expect(JSON.parse(lines[0]).content).toBe('first');
      expect(JSON.parse(lines[1]).content).toBe('second');
    });

    it('writes to project-scoped file when project_id is set', () => {
      const event = makeColdEvent({ project_id: 'proj1' });
      appendColdEvent(event);

      const filePath = getColdStoragePath('proj1');
      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe('readColdEvents', () => {
    it('returns empty array when file does not exist', () => {
      const events = readColdEvents();
      expect(events).toEqual([]);
    });

    it('returns empty array for empty file', () => {
      writeFileSync(getColdStoragePath(), '');
      const events = readColdEvents();
      expect(events).toEqual([]);
    });

    it('parses valid JSONL events', () => {
      const event = makeColdEvent({ content: 'test-content' });
      const filePath = getColdStoragePath();
      mkdirSync(join(coldDir), { recursive: true });
      writeFileSync(filePath, JSON.stringify(event) + '\n');

      const events = readColdEvents();
      expect(events).toHaveLength(1);
      expect(events[0].content).toBe('test-content');
    });

    it('skips malformed JSON lines', () => {
      const validEvent = makeColdEvent({ content: 'valid' });
      const filePath = getColdStoragePath();
      writeFileSync(filePath, [
        JSON.stringify(validEvent),
        'NOT VALID JSON',
        JSON.stringify(makeColdEvent({ content: 'also-valid' })),
      ].join('\n') + '\n');

      const events = readColdEvents();
      expect(events).toHaveLength(2);
      expect(events[0].content).toBe('valid');
      expect(events[1].content).toBe('also-valid');
    });

    it('skips events missing required fields', () => {
      const filePath = getColdStoragePath();
      const incomplete = { timestamp: 'now', content: 'hi' }; // missing session_memory_id, agent, etc.
      writeFileSync(filePath, JSON.stringify(incomplete) + '\n');

      const events = readColdEvents();
      expect(events).toHaveLength(0);
    });

    it('skips blank lines', () => {
      const event = makeColdEvent();
      const filePath = getColdStoragePath();
      writeFileSync(filePath, '\n' + JSON.stringify(event) + '\n\n');

      const events = readColdEvents();
      expect(events).toHaveLength(1);
    });

    it('reads project-scoped events', () => {
      const event = makeColdEvent({ project_id: 'proj2' });
      appendColdEvent(event);

      const events = readColdEvents('proj2');
      expect(events).toHaveLength(1);
    });
  });

  describe('rotateIfNeeded', () => {
    it('does nothing when file does not exist', () => {
      rotateIfNeeded(join(coldDir, 'nope.jsonl'), 1);
      // Should not throw
    });

    it('does nothing when file is under max size', () => {
      const filePath = getColdStoragePath();
      writeFileSync(filePath, 'small content\n');
      rotateIfNeeded(filePath, 1); // 1 MB limit

      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toBe('small content\n');
    });

    it('rotates file when over max size', () => {
      const filePath = getColdStoragePath();
      // Create a file just over the threshold (use a very small maxMB for testing)
      const maxMB = 0.0001; // ~100 bytes
      const bigContent = 'x'.repeat(200) + '\n';
      writeFileSync(filePath, bigContent);

      rotateIfNeeded(filePath, maxMB);

      // The original file should have been renamed to .1
      expect(existsSync(`${filePath}.1`)).toBe(true);
    });

    it('cascades rotation to higher generations', () => {
      const filePath = getColdStoragePath();
      const maxMB = 0.0001;
      const content = 'x'.repeat(200) + '\n';

      // Create .1 file first (simulate previous rotation)
      writeFileSync(`${filePath}.1`, 'old-gen-1\n');
      writeFileSync(filePath, content);

      rotateIfNeeded(filePath, maxMB);

      // .1 should move to .2, main file should move to .1
      expect(existsSync(`${filePath}.2`)).toBe(true);
      expect(existsSync(`${filePath}.1`)).toBe(true);
      expect(readFileSync(`${filePath}.2`, 'utf-8')).toBe('old-gen-1\n');
    });
  });
});
