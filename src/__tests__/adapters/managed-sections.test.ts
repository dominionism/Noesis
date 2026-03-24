/**
 * Tests for src/adapters/managed-sections.ts
 *
 * Validates managed section creation, extraction, hash verification,
 * and replacement. These markers are the integrity mechanism that
 * detects external modification of Noesis-managed content.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createManagedSection,
  extractManagedSection,
  verifyManagedSection,
  replaceManagedSection,
  hashContent,
} from '../../adapters/managed-sections.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

// ---------------------------------------------------------------------------
// createManagedSection
// ---------------------------------------------------------------------------

describe('createManagedSection', () => {
  it('wraps content with begin and end markers', () => {
    const result = createManagedSection('test content', 'test-adapter', '1.0.0');
    expect(result).toContain('<!-- NOESIS:BEGIN adapter=test-adapter');
    expect(result).toContain('<!-- NOESIS:END adapter=test-adapter -->');
    expect(result).toContain('test content');
  });

  it('includes version in the begin marker', () => {
    const result = createManagedSection('content', 'my-adapter', '2.0.0');
    expect(result).toContain('version=2.0.0');
  });

  it('includes a SHA-256 hash of the content', () => {
    const content = 'some content to hash';
    const expectedHash = sha256(content);
    const result = createManagedSection(content, 'test', '1.0.0');
    expect(result).toContain(`hash=${expectedHash}`);
  });

  it('includes an ISO 8601 timestamp', () => {
    const result = createManagedSection('content', 'test', '1.0.0');
    // Match ISO 8601 pattern: timestamp=YYYY-MM-DDTHH:MM:SS.sssZ
    expect(result).toMatch(/timestamp=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('places content between markers on its own line', () => {
    const result = createManagedSection('my content', 'test', '1.0.0');
    const lines = result.split('\n');
    // First line is begin marker, last line is end marker, middle is content
    expect(lines[0]).toMatch(/^<!-- NOESIS:BEGIN/);
    expect(lines[1]).toBe('my content');
    expect(lines[2]).toMatch(/^<!-- NOESIS:END/);
  });

  it('handles multi-line content', () => {
    const content = 'line 1\nline 2\nline 3';
    const result = createManagedSection(content, 'test', '1.0.0');
    expect(result).toContain(content);
    const extracted = extractManagedSection(result, 'test');
    expect(extracted?.content).toBe(content);
  });

  it('handles empty content', () => {
    const result = createManagedSection('', 'test', '1.0.0');
    expect(result).toContain(`hash=${sha256('')}`);
  });
});

// ---------------------------------------------------------------------------
// extractManagedSection
// ---------------------------------------------------------------------------

describe('extractManagedSection', () => {
  it('extracts content from a valid managed section', () => {
    const section = createManagedSection('extracted content', 'test-adapter', '1.0.0');
    const result = extractManagedSection(section, 'test-adapter');
    expect(result).not.toBeNull();
    expect(result!.content).toBe('extracted content');
  });

  it('returns the recorded hash', () => {
    const content = 'content for hash';
    const section = createManagedSection(content, 'test', '1.0.0');
    const result = extractManagedSection(section, 'test');
    expect(result!.hash).toBe(sha256(content));
  });

  it('returns the recorded timestamp', () => {
    const section = createManagedSection('content', 'test', '1.0.0');
    const result = extractManagedSection(section, 'test');
    expect(result!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns null for non-matching adapter ID', () => {
    const section = createManagedSection('content', 'adapter-a', '1.0.0');
    const result = extractManagedSection(section, 'adapter-b');
    expect(result).toBeNull();
  });

  it('returns null for content without managed sections', () => {
    const result = extractManagedSection('just regular content', 'test');
    expect(result).toBeNull();
  });

  it('extracts from file with surrounding content', () => {
    const before = '# My Config\n\nSome existing content.\n\n';
    const after = '\n\n# More content\n';
    const section = createManagedSection('managed', 'test', '1.0.0');
    const fullFile = before + section + after;

    const result = extractManagedSection(fullFile, 'test');
    expect(result).not.toBeNull();
    expect(result!.content).toBe('managed');
  });

  it('handles adapter IDs with special regex characters', () => {
    const section = createManagedSection('content', 'test.adapter', '1.0.0');
    const result = extractManagedSection(section, 'test.adapter');
    expect(result).not.toBeNull();
    expect(result!.content).toBe('content');
  });

  it('extracts multi-line content correctly', () => {
    const multiLine = 'line 1\nline 2\nline 3\nline 4';
    const section = createManagedSection(multiLine, 'test', '1.0.0');
    const result = extractManagedSection(section, 'test');
    expect(result!.content).toBe(multiLine);
  });
});

// ---------------------------------------------------------------------------
// verifyManagedSection
// ---------------------------------------------------------------------------

describe('verifyManagedSection', () => {
  it('returns true for unmodified content', () => {
    const content = 'verified content';
    const hash = sha256(content);
    const section = createManagedSection(content, 'test', '1.0.0');
    expect(verifyManagedSection(section, 'test', hash)).toBe(true);
  });

  it('returns false when content has been modified', () => {
    const original = 'original content';
    const hash = sha256(original);
    const section = createManagedSection(original, 'test', '1.0.0');

    // Tamper with the content between markers
    const tampered = section.replace('original content', 'tampered content');
    expect(verifyManagedSection(tampered, 'test', hash)).toBe(false);
  });

  it('returns false for non-existent section', () => {
    expect(verifyManagedSection('no section here', 'test', 'somehash')).toBe(false);
  });

  it('returns false for wrong adapter ID', () => {
    const content = 'content';
    const hash = sha256(content);
    const section = createManagedSection(content, 'adapter-a', '1.0.0');
    expect(verifyManagedSection(section, 'adapter-b', hash)).toBe(false);
  });

  it('verifies against the actual content hash, not the marker hash', () => {
    const content = 'some content';
    const correctHash = sha256(content);
    const section = createManagedSection(content, 'test', '1.0.0');

    // Pass the correct hash for current content
    expect(verifyManagedSection(section, 'test', correctHash)).toBe(true);
    // Pass an incorrect hash
    expect(verifyManagedSection(section, 'test', 'wronghash')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// replaceManagedSection
// ---------------------------------------------------------------------------

describe('replaceManagedSection', () => {
  it('replaces an existing managed section', () => {
    const original = createManagedSection('old content', 'test', '1.0.0');
    const result = replaceManagedSection(original, 'test', 'new content', '1.0.1');

    const extracted = extractManagedSection(result, 'test');
    expect(extracted).not.toBeNull();
    expect(extracted!.content).toBe('new content');
  });

  it('preserves surrounding content when replacing', () => {
    const before = '# Header\n\nSome text.\n\n';
    const after = '\n\n# Footer';
    const section = createManagedSection('old', 'test', '1.0.0');
    const file = before + section + after;

    const result = replaceManagedSection(file, 'test', 'new', '1.0.1');
    expect(result).toContain('# Header');
    expect(result).toContain('# Footer');
    expect(result).toContain('new');
    expect(result).not.toContain('old');
  });

  it('appends when no existing section is found', () => {
    const existing = '# Existing content\n';
    const result = replaceManagedSection(existing, 'test', 'appended', '1.0.0');
    expect(result).toContain('# Existing content');
    expect(result).toContain('appended');
    expect(result).toContain('<!-- NOESIS:BEGIN adapter=test');
  });

  it('updates the hash in the new marker', () => {
    const original = createManagedSection('old', 'test', '1.0.0');
    const result = replaceManagedSection(original, 'test', 'new', '1.0.1');

    const newHash = sha256('new');
    expect(result).toContain(`hash=${newHash}`);
  });

  it('updates the version in the new marker', () => {
    const original = createManagedSection('old', 'test', '1.0.0');
    const result = replaceManagedSection(original, 'test', 'new', '2.0.0');
    expect(result).toContain('version=2.0.0');
  });

  it('only replaces the section for the specified adapter', () => {
    const sectionA = createManagedSection('content A', 'adapter-a', '1.0.0');
    const sectionB = createManagedSection('content B', 'adapter-b', '1.0.0');
    const file = sectionA + '\n' + sectionB;

    const result = replaceManagedSection(file, 'adapter-a', 'new A', '1.0.1');

    const extractedA = extractManagedSection(result, 'adapter-a');
    const extractedB = extractManagedSection(result, 'adapter-b');

    expect(extractedA!.content).toBe('new A');
    expect(extractedB!.content).toBe('content B');
  });
});

// ---------------------------------------------------------------------------
// hashContent
// ---------------------------------------------------------------------------

describe('hashContent', () => {
  it('returns SHA-256 hex digest', () => {
    expect(hashContent('test')).toBe(sha256('test'));
  });

  it('returns consistent hashes for same input', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'));
  });

  it('returns different hashes for different input', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'));
  });

  it('handles empty string', () => {
    expect(hashContent('')).toBe(sha256(''));
  });
});
