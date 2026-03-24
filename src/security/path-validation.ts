/**
 * Path Traversal Prevention
 *
 * Validates that requested filesystem paths resolve to within an allowed
 * base directory, preventing path traversal attacks.
 *
 * Path validation cannot be disabled (invariant 7).
 */

import { resolve, sep } from 'node:path';

/**
 * Validate that a requested path is contained within an allowed base directory.
 *
 * @param requestedPath - The path to validate (may be relative or absolute).
 * @param allowedBase - The directory boundary that the path must be within.
 * @returns The validated absolute path (resolved and normalized).
 * @throws Error if the resolved path escapes the allowed base directory.
 */
export function validatePath(requestedPath: string, allowedBase: string): string {
  if (typeof requestedPath !== 'string' || requestedPath.trim().length === 0) {
    throw new Error('Path validation failed: requested path must be a non-empty string');
  }

  if (typeof allowedBase !== 'string' || allowedBase.trim().length === 0) {
    throw new Error('Path validation failed: allowed base must be a non-empty string');
  }

  // Reject null bytes
  if (requestedPath.includes('\0') || allowedBase.includes('\0')) {
    throw new Error('Path validation failed: null bytes are not allowed in paths');
  }

  const resolvedBase = resolve(allowedBase);
  const resolvedPath = resolve(resolvedBase, requestedPath);

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + sep)) {
    throw new Error(
      `Path traversal detected: '${requestedPath}' resolves to '${resolvedPath}' ` +
        `which is outside the allowed base '${resolvedBase}'`,
    );
  }

  return resolvedPath;
}

/**
 * Sanitize a filename by removing/replacing unsafe characters.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/\0/g, '')
    .trim();
}

/**
 * Check whether a file path is contained within a directory.
 */
export function isWithinDirectory(filePath: string, dirPath: string): boolean {
  const resolvedFile = resolve(filePath);
  const resolvedDir = resolve(dirPath);
  return resolvedFile === resolvedDir || resolvedFile.startsWith(resolvedDir + sep);
}
