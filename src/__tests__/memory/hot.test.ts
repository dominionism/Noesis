/**
 * Tests for Hot Memory Management (src/memory/hot.ts)
 *
 * Covers:
 * - Loading individual hot memory files with mtime caching
 * - Loading all hot memory (global, project, top-level)
 * - Project-specific hot memory loading
 * - Path traversal prevention via validateProjectId
 * - Line counting
 * - Cache invalidation on mtime change
 * - Handling of missing directories and files
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to mock MEMORY_DIR and HOT_MEMORY_LINE_LIMIT before importing.
// Since the module reads constants at import time, we use vitest's module mocking.
import { vi } from 'vitest';

let testDir: string;
let memoryDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `noesis-hot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  memoryDir = join(testDir, 'memory');
  mkdirSync(memoryDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* best effort */ }
  vi.restoreAllMocks();
});

// We dynamically mock the constants module so MEMORY_DIR points to our temp dir.
vi.mock('../../constants.js', async () => {
  // This mock is hoisted, so we use a getter to pick up `memoryDir` lazily.
  return {
    get MEMORY_DIR() {
      // We store the current memoryDir on globalThis for the mock to read.
      return (globalThis as any).__noesis_test_memory_dir ?? '/tmp/noesis-test-memory-fallback';
    },
    HOT_MEMORY_LINE_LIMIT: 2000,
  };
});

// Helper to update the memory dir reference the mock reads
function setMemoryDir(dir: string): void {
  (globalThis as any).__noesis_test_memory_dir = dir;
}

describe('hot memory', () => {
  // Import after mock setup
  let loadHotMemoryFile: typeof import('../../memory/hot.js').loadHotMemoryFile;
  let loadHotMemory: typeof import('../../memory/hot.js').loadHotMemory;
  let getProjectHotMemory: typeof import('../../memory/hot.js').getProjectHotMemory;
  let clearHotMemoryCache: typeof import('../../memory/hot.js').clearHotMemoryCache;
  let getHotMemoryLineCount: typeof import('../../memory/hot.js').getHotMemoryLineCount;

  beforeEach(async () => {
    setMemoryDir(memoryDir);
    const mod = await import('../../memory/hot.js');
    loadHotMemoryFile = mod.loadHotMemoryFile;
    loadHotMemory = mod.loadHotMemory;
    getProjectHotMemory = mod.getProjectHotMemory;
    clearHotMemoryCache = mod.clearHotMemoryCache;
    getHotMemoryLineCount = mod.getHotMemoryLineCount;
    clearHotMemoryCache();
  });

  describe('loadHotMemoryFile', () => {
    it('returns null for a non-existent file', () => {
      const result = loadHotMemoryFile(join(memoryDir, 'does-not-exist.md'));
      expect(result).toBeNull();
    });

    it('loads content from an existing file', () => {
      const filePath = join(memoryDir, 'test.md');
      writeFileSync(filePath, '# Test\nSome content\n');
      const result = loadHotMemoryFile(filePath);
      expect(result).toBe('# Test\nSome content\n');
    });

    it('returns cached content on second read with same mtime', () => {
      const filePath = join(memoryDir, 'cached.md');
      writeFileSync(filePath, 'original');
      const first = loadHotMemoryFile(filePath);
      const second = loadHotMemoryFile(filePath);
      expect(first).toBe('original');
      expect(second).toBe('original');
    });

    it('re-reads file when mtime changes', () => {
      const filePath = join(memoryDir, 'mtime.md');
      writeFileSync(filePath, 'version-1');
      const first = loadHotMemoryFile(filePath);
      expect(first).toBe('version-1');

      // Modify content and change mtime
      writeFileSync(filePath, 'version-2');
      // Force a different mtime by setting it to the future
      const futureTime = new Date(Date.now() + 10000);
      utimesSync(filePath, futureTime, futureTime);

      const second = loadHotMemoryFile(filePath);
      expect(second).toBe('version-2');
    });

    it('clears cache entry when file is deleted between calls', () => {
      const filePath = join(memoryDir, 'delete-me.md');
      writeFileSync(filePath, 'content');
      const first = loadHotMemoryFile(filePath);
      expect(first).toBe('content');

      rmSync(filePath);
      const second = loadHotMemoryFile(filePath);
      expect(second).toBeNull();
    });
  });

  describe('loadHotMemory', () => {
    it('returns empty set when no files exist', () => {
      const result = loadHotMemory();
      expect(result.memories).toEqual({});
      expect(result.totalLines).toBe(0);
    });

    it('loads top-level memory files', () => {
      writeFileSync(join(memoryDir, 'index.md'), '# Index\nLine 2\n');
      writeFileSync(join(memoryDir, 'patterns.md'), '# Patterns\n');

      const result = loadHotMemory();
      expect(result.memories['index.md']).toBe('# Index\nLine 2\n');
      expect(result.memories['patterns.md']).toBe('# Patterns\n');
      expect(result.totalLines).toBeGreaterThan(0);
    });

    it('loads per-project memory files from projects subdir', () => {
      const projectsDir = join(memoryDir, 'projects');
      mkdirSync(projectsDir, { recursive: true });
      writeFileSync(join(projectsDir, 'myproject.md'), '# MyProject\n');

      const result = loadHotMemory();
      expect(result.memories['projects/myproject.md']).toBe('# MyProject\n');
    });

    it('loads global memory files from global subdir', () => {
      const globalDir = join(memoryDir, 'global');
      mkdirSync(globalDir, { recursive: true });
      writeFileSync(join(globalDir, 'conventions.md'), '# Conventions\n');

      const result = loadHotMemory();
      expect(result.memories['global/conventions.md']).toBe('# Conventions\n');
    });

    it('ignores non-markdown files in projects dir', () => {
      const projectsDir = join(memoryDir, 'projects');
      mkdirSync(projectsDir, { recursive: true });
      writeFileSync(join(projectsDir, 'data.json'), '{}');

      const result = loadHotMemory();
      expect(Object.keys(result.memories)).not.toContain('projects/data.json');
    });

    it('counts lines correctly across multiple files', () => {
      writeFileSync(join(memoryDir, 'index.md'), 'line1\nline2\nline3\n');
      writeFileSync(join(memoryDir, 'patterns.md'), 'a\nb\n');

      const result = loadHotMemory();
      // "line1\nline2\nline3\n" = 3 lines
      // "a\nb\n" = 2 lines
      expect(result.totalLines).toBe(5);
    });
  });

  describe('getProjectHotMemory', () => {
    it('returns content for an existing project file', () => {
      const projectsDir = join(memoryDir, 'projects');
      mkdirSync(projectsDir, { recursive: true });
      writeFileSync(join(projectsDir, 'proj1.md'), '# Project 1\n');

      const result = getProjectHotMemory('proj1');
      expect(result).toBe('# Project 1\n');
    });

    it('returns null when project file does not exist', () => {
      const result = getProjectHotMemory('nonexistent');
      expect(result).toBeNull();
    });

    it('rejects project IDs with path traversal (..)', () => {
      expect(() => getProjectHotMemory('../etc')).toThrow('Invalid project ID');
    });

    it('rejects project IDs with forward slashes', () => {
      expect(() => getProjectHotMemory('a/b')).toThrow('Invalid project ID');
    });

    it('rejects project IDs with backslashes', () => {
      expect(() => getProjectHotMemory('a\\b')).toThrow('Invalid project ID');
    });

    it('rejects project IDs with null bytes', () => {
      expect(() => getProjectHotMemory('a\0b')).toThrow('Invalid project ID');
    });

    it('rejects empty/whitespace-only project IDs', () => {
      expect(() => getProjectHotMemory('   ')).toThrow('Invalid project ID');
    });
  });

  describe('getHotMemoryLineCount', () => {
    it('returns 0 when no files exist', () => {
      expect(getHotMemoryLineCount()).toBe(0);
    });

    it('returns correct count with files', () => {
      writeFileSync(join(memoryDir, 'index.md'), 'one\ntwo\n');
      expect(getHotMemoryLineCount()).toBe(2);
    });
  });

  describe('clearHotMemoryCache', () => {
    it('forces re-read after cache clear', () => {
      const filePath = join(memoryDir, 'cache-test.md');
      writeFileSync(filePath, 'v1');
      const first = loadHotMemoryFile(filePath);
      expect(first).toBe('v1');

      // Overwrite with same mtime (simulate)
      writeFileSync(filePath, 'v2');
      clearHotMemoryCache();

      const second = loadHotMemoryFile(filePath);
      expect(second).toBe('v2');
    });
  });
});
