/**
 * ULID Generator
 *
 * Thin wrapper around the `ulid` package to provide a single import point
 * for identifier generation across the codebase.
 *
 * ULIDs are used instead of UUIDs because they are:
 * - Lexicographically sortable (encodes millisecond timestamp)
 * - Monotonic within the same millisecond
 * - 128-bit compatible with UUID storage
 */

import { ulid } from 'ulid';

/**
 * Generate a new ULID string.
 *
 * Returns a 26-character Crockford Base32 encoded string that is
 * monotonically sortable and globally unique.
 */
export function generateId(): string {
  return ulid();
}
