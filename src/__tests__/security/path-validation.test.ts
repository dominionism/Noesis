/**
 * Tests for src/security/path-validation.ts
 *
 * Validates path traversal prevention, filename sanitization, and
 * directory containment checks. These are critical security boundaries
 * that prevent filesystem escape attacks.
 *
 * Path validation cannot be disabled (invariant 7).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { validatePath, sanitizeFilename, isWithinDirectory } from '../../security/path-validation.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'noesis-path-test-'));
});

afterEach(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
});

// ---------------------------------------------------------------------------
// validatePath
// ---------------------------------------------------------------------------

describe('validatePath', () => {
  describe('happy paths', () => {
    it('accepts a simple filename within the base', () => {
      const result = validatePath('file.txt', tempDir);
      expect(result).toBe(join(tempDir, 'file.txt'));
    });

    it('accepts a relative subdirectory path', () => {
      const result = validatePath('sub/dir/file.txt', tempDir);
      expect(result).toBe(join(tempDir, 'sub', 'dir', 'file.txt'));
    });

    it('accepts an absolute path within the base', () => {
      const absolutePath = join(tempDir, 'inner', 'file.txt');
      const result = validatePath(absolutePath, tempDir);
      expect(result).toBe(absolutePath);
    });

    it('accepts the base directory itself', () => {
      const result = validatePath('.', tempDir);
      expect(result).toBe(resolve(tempDir));
    });

    it('normalizes paths with redundant separators', () => {
      const result = validatePath('sub//dir///file.txt', tempDir);
      expect(result).toBe(join(tempDir, 'sub', 'dir', 'file.txt'));
    });

    it('normalizes paths with single dots', () => {
      const result = validatePath('./sub/./file.txt', tempDir);
      expect(result).toBe(join(tempDir, 'sub', 'file.txt'));
    });

    it('returns an absolute path', () => {
      const result = validatePath('file.txt', tempDir);
      expect(result.startsWith(sep)).toBe(true);
    });
  });

  describe('path traversal prevention', () => {
    it('rejects simple parent directory traversal', () => {
      expect(() => validatePath('../escape', tempDir)).toThrow('Path traversal detected');
    });

    it('rejects deeply nested traversal', () => {
      expect(() => validatePath('a/b/c/../../../../escape', tempDir)).toThrow('Path traversal detected');
    });

    it('rejects traversal that resolves outside base', () => {
      expect(() => validatePath('sub/../../escape', tempDir)).toThrow('Path traversal detected');
    });

    it('rejects absolute paths outside the base', () => {
      expect(() => validatePath('/etc/passwd', tempDir)).toThrow('Path traversal detected');
    });

    it('rejects absolute paths to system directories', () => {
      expect(() => validatePath('/tmp/other', tempDir)).toThrow('Path traversal detected');
    });

    it('rejects traversal via /../../', () => {
      const evilPath = tempDir + '/../../etc/passwd';
      expect(() => validatePath(evilPath, tempDir)).toThrow('Path traversal detected');
    });
  });

  describe('null byte injection', () => {
    it('rejects null bytes in requested path', () => {
      expect(() => validatePath('file\0.txt', tempDir)).toThrow('null bytes');
    });

    it('rejects null bytes in allowed base', () => {
      expect(() => validatePath('file.txt', '/tmp\0/evil')).toThrow('null bytes');
    });

    it('rejects null bytes in the middle of the path', () => {
      expect(() => validatePath('dir/file\0name.txt', tempDir)).toThrow('null bytes');
    });
  });

  describe('input validation', () => {
    it('rejects empty requested path', () => {
      expect(() => validatePath('', tempDir)).toThrow('non-empty string');
    });

    it('rejects whitespace-only requested path', () => {
      expect(() => validatePath('   ', tempDir)).toThrow('non-empty string');
    });

    it('rejects empty allowed base', () => {
      expect(() => validatePath('file.txt', '')).toThrow('non-empty string');
    });

    it('rejects whitespace-only allowed base', () => {
      expect(() => validatePath('file.txt', '  \t ')).toThrow('non-empty string');
    });
  });

  describe('edge cases', () => {
    it('handles paths with spaces', () => {
      const result = validatePath('my file.txt', tempDir);
      expect(result).toBe(join(tempDir, 'my file.txt'));
    });

    it('handles paths with unicode characters', () => {
      const result = validatePath('\u00e9\u00e8\u00ea.txt', tempDir);
      expect(result).toBe(join(tempDir, '\u00e9\u00e8\u00ea.txt'));
    });

    it('handles deep nesting within base', () => {
      const deepPath = 'a/b/c/d/e/f/g/h/file.txt';
      const result = validatePath(deepPath, tempDir);
      expect(result).toBe(join(tempDir, deepPath));
    });

    it('prevents traversal disguised with trailing dot-dot', () => {
      expect(() => validatePath('..', tempDir)).toThrow('Path traversal detected');
    });

    it('handles base path with trailing separator', () => {
      const base = tempDir + sep;
      const result = validatePath('file.txt', base);
      expect(result).toBe(join(tempDir, 'file.txt'));
    });
  });

  describe('prefix attack prevention', () => {
    it('rejects paths that share a prefix but escape the base', () => {
      // If base is /tmp/abc, path /tmp/abcdef/file should be rejected
      // because abcdef is not within abc
      const base = join(tmpdir(), 'noesis-test-base');
      const evil = join(tmpdir(), 'noesis-test-base-extended', 'file.txt');
      mkdirSync(base, { recursive: true });
      try {
        expect(() => validatePath(evil, base)).toThrow('Path traversal detected');
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  });
});

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe('sanitizeFilename', () => {
  describe('safe filenames', () => {
    it('returns safe filenames unchanged', () => {
      expect(sanitizeFilename('file.txt')).toBe('file.txt');
    });

    it('preserves alphanumeric characters', () => {
      expect(sanitizeFilename('MyFile123')).toBe('MyFile123');
    });

    it('preserves hyphens and single dots', () => {
      expect(sanitizeFilename('my-file.test.ts')).toBe('my-file.test.ts');
    });
  });

  describe('dangerous character removal', () => {
    it('replaces forward slashes', () => {
      expect(sanitizeFilename('path/to/file')).toBe('path_to_file');
    });

    it('replaces backslashes', () => {
      expect(sanitizeFilename('path\\to\\file')).toBe('path_to_file');
    });

    it('replaces colons', () => {
      expect(sanitizeFilename('C:file')).toBe('C_file');
    });

    it('replaces asterisks', () => {
      expect(sanitizeFilename('file*.txt')).toBe('file_.txt');
    });

    it('replaces question marks', () => {
      expect(sanitizeFilename('file?.txt')).toBe('file_.txt');
    });

    it('replaces double quotes', () => {
      expect(sanitizeFilename('file"name"')).toBe('file_name_');
    });

    it('replaces angle brackets', () => {
      expect(sanitizeFilename('file<name>')).toBe('file_name_');
    });

    it('replaces pipe characters', () => {
      expect(sanitizeFilename('file|name')).toBe('file_name');
    });
  });

  describe('traversal prevention', () => {
    it('replaces double dots', () => {
      expect(sanitizeFilename('..file')).toBe('_file');
    });

    it('replaces embedded double dots', () => {
      expect(sanitizeFilename('name..suffix')).toBe('name_suffix');
    });

    it('replaces multiple occurrences of double dots', () => {
      const result = sanitizeFilename('a..b..c');
      expect(result).not.toContain('..');
    });
  });

  describe('null byte removal', () => {
    it('strips null bytes', () => {
      expect(sanitizeFilename('file\0name')).toBe('filename');
    });

    it('strips multiple null bytes', () => {
      expect(sanitizeFilename('a\0b\0c')).toBe('abc');
    });
  });

  describe('whitespace handling', () => {
    it('trims leading and trailing whitespace', () => {
      expect(sanitizeFilename('  file.txt  ')).toBe('file.txt');
    });

    it('preserves internal spaces', () => {
      expect(sanitizeFilename('my file')).toBe('my file');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(sanitizeFilename('')).toBe('');
    });

    it('handles string with only unsafe characters', () => {
      const result = sanitizeFilename('/\\:*?"<>|');
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
      expect(result).not.toContain(':');
    });

    it('handles very long filenames', () => {
      const longName = 'a'.repeat(1000);
      const result = sanitizeFilename(longName);
      expect(result).toBe(longName);
    });
  });
});

// ---------------------------------------------------------------------------
// isWithinDirectory
// ---------------------------------------------------------------------------

describe('isWithinDirectory', () => {
  describe('containment checks', () => {
    it('returns true for a file within the directory', () => {
      const filePath = join(tempDir, 'file.txt');
      expect(isWithinDirectory(filePath, tempDir)).toBe(true);
    });

    it('returns true for a file in a subdirectory', () => {
      const filePath = join(tempDir, 'sub', 'deep', 'file.txt');
      expect(isWithinDirectory(filePath, tempDir)).toBe(true);
    });

    it('returns true when file equals the directory', () => {
      expect(isWithinDirectory(tempDir, tempDir)).toBe(true);
    });

    it('returns false for a file outside the directory', () => {
      expect(isWithinDirectory('/etc/passwd', tempDir)).toBe(false);
    });

    it('returns false for a file in a sibling directory', () => {
      const sibling = tempDir + '-sibling';
      const filePath = join(sibling, 'file.txt');
      expect(isWithinDirectory(filePath, tempDir)).toBe(false);
    });

    it('returns false for parent directory', () => {
      const parent = join(tempDir, '..');
      expect(isWithinDirectory(parent, tempDir)).toBe(false);
    });
  });

  describe('path normalization', () => {
    it('handles relative paths by resolving them', () => {
      // This depends on the cwd, but the function resolves both paths
      const result = isWithinDirectory(
        join(tempDir, 'sub', '..', 'file.txt'),
        tempDir,
      );
      expect(result).toBe(true);
    });

    it('handles trailing separators', () => {
      const filePath = join(tempDir, 'file.txt');
      expect(isWithinDirectory(filePath, tempDir + sep)).toBe(true);
    });
  });

  describe('prefix attack prevention', () => {
    it('rejects paths that share a prefix but are not contained', () => {
      // /tmp/base vs /tmp/base-extension
      const base = join(tmpdir(), 'base');
      const notContained = join(tmpdir(), 'base-extension', 'file.txt');
      expect(isWithinDirectory(notContained, base)).toBe(false);
    });
  });
});
