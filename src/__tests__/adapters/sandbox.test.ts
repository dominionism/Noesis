/**
 * Tests for sandboxed filesystem query (src/adapters/sandbox.ts)
 *
 * Validates that the sandboxed query correctly reads files within a
 * project directory and blocks path traversal attempts. Uses real
 * temp directories with actual files for filesystem interaction tests.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createSandboxedQuery } from '../../adapters/sandbox.js';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'noesis-sandbox-test-'));
}

function createFileInDir(dir: string, relativePath: string, content: string): string {
  const fullPath = join(dir, relativePath);
  const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  if (parentDir !== dir) {
    mkdirSync(parentDir, { recursive: true });
  }
  writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSandboxedQuery', () => {
  const cleanups: string[] = [];

  afterEach(() => {
    for (const dir of cleanups) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
  });

  function setup(): string {
    const dir = makeTempDir();
    cleanups.push(dir);
    return dir;
  }

  describe('exists', () => {
    it('returns true for an existing file', async () => {
      const dir = setup();
      createFileInDir(dir, 'README.md', '# Hello');
      const query = createSandboxedQuery(dir);

      expect(await query.exists('README.md')).toBe(true);
    });

    it('returns false for a missing file', async () => {
      const dir = setup();
      const query = createSandboxedQuery(dir);

      expect(await query.exists('nonexistent.txt')).toBe(false);
    });

    it('returns true for an existing subdirectory file', async () => {
      const dir = setup();
      createFileInDir(dir, 'src/main.ts', 'console.log("hi");');
      const query = createSandboxedQuery(dir);

      expect(await query.exists('src/main.ts')).toBe(true);
    });

    it('blocks path traversal via ../', async () => {
      const dir = setup();
      const query = createSandboxedQuery(dir);

      // Attempting to traverse out should fail silently (return false)
      expect(await query.exists('../../../etc/passwd')).toBe(false);
    });

    it('blocks absolute path outside sandbox', async () => {
      const dir = setup();
      const query = createSandboxedQuery(dir);

      expect(await query.exists('/etc/passwd')).toBe(false);
    });
  });

  describe('read', () => {
    it('returns file content for a file inside the sandbox', async () => {
      const dir = setup();
      createFileInDir(dir, 'data.txt', 'file content here');
      const query = createSandboxedQuery(dir);

      const content = await query.read('data.txt');
      expect(content).toBe('file content here');
    });

    it('reads files in subdirectories', async () => {
      const dir = setup();
      createFileInDir(dir, 'config/settings.json', '{"key":"value"}');
      const query = createSandboxedQuery(dir);

      const content = await query.read('config/settings.json');
      expect(content).toBe('{"key":"value"}');
    });

    it('throws on path traversal attempt', async () => {
      const dir = setup();
      const query = createSandboxedQuery(dir);

      await expect(query.read('../../../etc/passwd')).rejects.toThrow();
    });

    it('throws for a non-existent file', async () => {
      const dir = setup();
      const query = createSandboxedQuery(dir);

      await expect(query.read('does-not-exist.txt')).rejects.toThrow();
    });

    it('reads UTF-8 content correctly', async () => {
      const dir = setup();
      const unicodeContent = 'Hello \u00e4\u00f6\u00fc \u00df Unicode \u2603';
      createFileInDir(dir, 'unicode.txt', unicodeContent);
      const query = createSandboxedQuery(dir);

      const content = await query.read('unicode.txt');
      expect(content).toBe(unicodeContent);
    });
  });

  describe('glob', () => {
    it('returns matching files for a simple pattern', async () => {
      const dir = setup();
      createFileInDir(dir, 'file1.ts', 'a');
      createFileInDir(dir, 'file2.ts', 'b');
      createFileInDir(dir, 'file3.md', 'c');
      const query = createSandboxedQuery(dir);

      const results = await query.glob('*.ts');
      expect(results.length).toBeGreaterThanOrEqual(2);
      // Results should contain absolute paths to the .ts files
      const basenames = results.map((r) => r.split('/').pop());
      expect(basenames).toContain('file1.ts');
      expect(basenames).toContain('file2.ts');
    });

    it('returns empty array for non-matching pattern', async () => {
      const dir = setup();
      createFileInDir(dir, 'readme.md', 'hello');
      const query = createSandboxedQuery(dir);

      const results = await query.glob('*.xyz');
      expect(results).toHaveLength(0);
    });

    it('returns empty array for empty directory', async () => {
      const dir = setup();
      const query = createSandboxedQuery(dir);

      const results = await query.glob('*');
      expect(results).toHaveLength(0);
    });

    it('matches files in subdirectories with ** pattern', async () => {
      const dir = setup();
      createFileInDir(dir, 'src/a.ts', 'a');
      createFileInDir(dir, 'src/nested/b.ts', 'b');
      const query = createSandboxedQuery(dir);

      const results = await query.glob('**/*.ts');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });
});
