/**
 * Managed Section Markers
 *
 * Noesis injects context into tool configuration files using delimited
 * managed sections. Each section carries:
 *
 * - adapter ID: which adapter owns this section
 * - version: the adapter version at time of write
 * - hash: SHA-256 of the content between markers
 * - timestamp: ISO 8601 write time
 *
 * The hash allows detection of external modifications (e.g., a user
 * manually editing the managed section). If the hash does not match,
 * Noesis knows the content was tampered with and can decide whether
 * to overwrite or preserve the user's changes.
 *
 * Marker format:
 *   <!-- NOESIS:BEGIN adapter={id} version={ver} hash={sha256} timestamp={iso} -->
 *   {content}
 *   <!-- NOESIS:END adapter={id} -->
 */

import { createHash } from 'node:crypto';
import { MANAGED_SECTION_MARKER } from '../constants.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function beginMarker(adapterId: string, version: string, hash: string, timestamp: string): string {
  return `<!-- ${MANAGED_SECTION_MARKER}:BEGIN adapter=${adapterId} version=${version} hash=${hash} timestamp=${timestamp} -->`;
}

function endMarker(adapterId: string): string {
  return `<!-- ${MANAGED_SECTION_MARKER}:END adapter=${adapterId} -->`;
}

/**
 * Regex to extract a managed section for a given adapter ID.
 *
 * Captures:
 *   1: version
 *   2: hash
 *   3: timestamp
 *   4: content between markers (may contain newlines)
 */
function sectionRegex(adapterId: string): RegExp {
  // Escape special regex characters in adapterId
  const escaped = adapterId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `<!-- ${MANAGED_SECTION_MARKER}:BEGIN adapter=${escaped} version=(\\S+) hash=(\\S+) timestamp=(\\S+) -->\\n([\\s\\S]*?)\\n<!-- ${MANAGED_SECTION_MARKER}:END adapter=${escaped} -->`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a managed section string with markers wrapping the content.
 *
 * @param content - The context content to wrap.
 * @param adapterId - The adapter that owns this section.
 * @param version - The adapter version string.
 * @returns The full managed section including begin/end markers.
 */
export function createManagedSection(
  content: string,
  adapterId: string,
  version: string,
): string {
  const hash = computeHash(content);
  const timestamp = new Date().toISOString();

  return [
    beginMarker(adapterId, version, hash, timestamp),
    content,
    endMarker(adapterId),
  ].join('\n');
}

/**
 * Extract the managed section for a given adapter from file content.
 *
 * @param fileContent - The full file content to search.
 * @param adapterId - The adapter ID to look for.
 * @returns The extracted content, hash, and timestamp, or null if not found.
 */
export function extractManagedSection(
  fileContent: string,
  adapterId: string,
): { content: string; hash: string; timestamp: string } | null {
  const match = sectionRegex(adapterId).exec(fileContent);
  if (!match) {
    return null;
  }

  return {
    content: match[4],
    hash: match[2],
    timestamp: match[3],
  };
}

/**
 * Verify that the managed section has not been modified externally.
 *
 * Recomputes SHA-256 of the content between markers and compares it
 * to the expected hash.
 *
 * @param fileContent - The full file content containing the managed section.
 * @param adapterId - The adapter ID whose section to verify.
 * @param expectedHash - The hash to compare against (from the marker or from a previous sync).
 * @returns true if the content hash matches, false if modified or not found.
 */
export function verifyManagedSection(
  fileContent: string,
  adapterId: string,
  expectedHash: string,
): boolean {
  const section = extractManagedSection(fileContent, adapterId);
  if (!section) {
    return false;
  }

  const actualHash = computeHash(section.content);
  return actualHash === expectedHash;
}

/**
 * Replace the managed section for a given adapter with new content.
 *
 * If no existing section is found, the new section is appended to the
 * end of the file content.
 *
 * @param fileContent - The full file content.
 * @param adapterId - The adapter ID whose section to replace.
 * @param newContent - The new content to place between markers.
 * @param version - The adapter version for the new marker.
 * @returns The updated file content with the replaced section.
 */
export function replaceManagedSection(
  fileContent: string,
  adapterId: string,
  newContent: string,
  version: string,
): string {
  const newSection = createManagedSection(newContent, adapterId, version);
  const regex = sectionRegex(adapterId);

  if (regex.test(fileContent)) {
    return fileContent.replace(regex, newSection);
  }

  // Fall back to legacy format used by the noesis-inject script:
  //   <!-- NOESIS:BEGIN --> ... <!-- NOESIS:END -->
  // Replace it with the richer managed-section format so both tools
  // converge on the same marker standard after the first sync.
  const legacyRegex = /<!-- NOESIS:BEGIN -->[\s\S]*?<!-- NOESIS:END -->/;
  if (legacyRegex.test(fileContent)) {
    return fileContent.replace(legacyRegex, newSection);
  }

  // No existing section found; append
  if (fileContent.length === 0) {
    return newSection;
  }

  const separator = fileContent.length > 0 && !fileContent.endsWith('\n') ? '\n\n' : '\n';
  return fileContent + separator + newSection;
}

/**
 * Compute SHA-256 hash of a content string.
 *
 * Exposed for use by adapters when building SyncResult / VerifyResult.
 */
export function hashContent(content: string): string {
  return computeHash(content);
}
