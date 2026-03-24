/**
 * Sandboxed Filesystem Query
 *
 * Provides a read-only FilesystemQuery implementation that is confined
 * to a specific project directory. All path operations are validated
 * through the security/path-validation module to prevent path traversal.
 *
 * The sandbox:
 * - Only allows reads within the project directory
 * - Prevents path traversal via ../  or absolute paths outside the boundary
 * - Never writes, deletes, or modifies files
 * - Returns graceful results (false / empty) rather than throwing for
 *   missing files, since detection is a normal "file not found" scenario
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import type { FilesystemQuery } from '../types.js';
import { validatePath, isWithinDirectory } from '../security/path-validation.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a path within the sandbox boundary.
 * Throws if the path escapes the project directory.
 */
function resolveSandboxed(projectPath: string, requestedPath: string): string {
  return validatePath(requestedPath, projectPath);
}

// ---------------------------------------------------------------------------
// Glob implementation
// ---------------------------------------------------------------------------

/**
 * Convert a glob pattern to a RegExp for matching against relative paths.
 *
 * Supports:
 * - ** (matches any path segments, including nested directories)
 * - *  (matches any characters except path separator)
 * - ?  (matches a single character except path separator)
 * - .  (literal dot, escaped)
 */
function globToRegex(pattern: string): RegExp {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars (except * and ?)
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')     // Temporarily replace **
    .replace(/\*/g, '[^/]*')                 // * matches non-separator chars
    .replace(/\?/g, '[^/]')                  // ? matches single non-separator char
    .replace(/<<<GLOBSTAR>>>/g, '.*');       // ** matches anything including separators

  return new RegExp(`^${regexStr}$`);
}

/**
 * Glob files within a directory using recursive readdir.
 *
 * All results are validated against the sandbox boundary.
 */
async function globFiles(basePath: string, pattern: string): Promise<string[]> {
  const regex = globToRegex(pattern);
  const results: string[] = [];

  try {
    const entries = await readdir(basePath, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const parentPath = 'parentPath' in entry ? String(entry.parentPath) : basePath;
        const fullPath = join(parentPath, entry.name);
        const relativePath = fullPath.slice(basePath.length + 1);
        if (regex.test(relativePath) && isWithinDirectory(fullPath, basePath)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Directory does not exist or is unreadable
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a sandboxed FilesystemQuery confined to the given project directory.
 *
 * All operations are read-only. Path traversal is prevented.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns A FilesystemQuery that only reads within projectPath.
 */
export function createSandboxedQuery(projectPath: string): FilesystemQuery {
  const resolvedBase = resolve(projectPath);

  return {
    async exists(path: string): Promise<boolean> {
      try {
        const resolved = resolveSandboxed(resolvedBase, path);
        await stat(resolved);
        return true;
      } catch {
        return false;
      }
    },

    async read(path: string): Promise<string> {
      const resolved = resolveSandboxed(resolvedBase, path);
      return readFile(resolved, 'utf-8');
    },

    async glob(pattern: string): Promise<string[]> {
      return globFiles(resolvedBase, pattern);
    },
  };
}
