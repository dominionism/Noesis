/**
 * Tests for Inbox Ingester
 */

import { describe, it, expect } from 'vitest';
import {
  parseInboxContent,
  createInboxEntry,
  processInboxEntries,
  isProcessed,
  markProcessed,
  getProcessedCount,
} from '../../sync/inbox-ingester.js';

describe('parseInboxContent', () => {
  it('classifies correction content', () => {
    const learnings = parseInboxContent(
      'Use parameterized queries instead of string concatenation for SQL',
      'claude-code',
    );

    expect(learnings).toHaveLength(1);
    expect(learnings[0].type).toBe('correction');
    expect(learnings[0].source).toBe('claude-code');
    expect(learnings[0].confidence).toBe(0.7);
    expect(learnings[0].tags).toContain('ingested');
    expect(learnings[0].tags).toContain('claude-code');
  });

  it('classifies lesson content', () => {
    const learnings = parseInboxContent(
      'We learned that caching at the service layer reduces latency by 40%',
      'cursor',
    );

    expect(learnings).toHaveLength(1);
    expect(learnings[0].type).toBe('lesson');
    expect(learnings[0].confidence).toBe(0.6);
  });

  it('classifies preference content', () => {
    const learnings = parseInboxContent(
      'Always prefer composition over inheritance in this codebase',
      'aider',
    );

    expect(learnings).toHaveLength(1);
    expect(learnings[0].type).toBe('preference');
    expect(learnings[0].confidence).toBe(0.8);
  });

  it('defaults to task type for unclassified content', () => {
    const learnings = parseInboxContent(
      'Implement the new dashboard feature with chart rendering support',
      'codex',
    );

    expect(learnings).toHaveLength(1);
    expect(learnings[0].type).toBe('task');
    expect(learnings[0].confidence).toBe(0.5);
  });

  it('splits multiple blocks by double newlines', () => {
    const content = [
      'Use parameterized queries instead of string concat',
      '',
      'We learned that error boundaries prevent cascade failures',
    ].join('\n');

    const learnings = parseInboxContent(content, 'claude-code');
    expect(learnings).toHaveLength(2);
    expect(learnings[0].type).toBe('correction');
    expect(learnings[1].type).toBe('lesson');
  });

  it('filters out very short blocks', () => {
    const learnings = parseInboxContent('short', 'claude-code');
    expect(learnings).toHaveLength(0);
  });

  it('extracts title from first line', () => {
    const learnings = parseInboxContent(
      'Use async/await instead of callbacks for error handling consistency',
      'cursor',
    );

    expect(learnings[0].title).toBeTruthy();
    expect(learnings[0].title.length).toBeLessThanOrEqual(80);
  });

  it('truncates long titles', () => {
    const longLine = 'A'.repeat(100) + ' instead of B for very important reasons that go on and on';
    const learnings = parseInboxContent(longLine, 'cursor');

    expect(learnings[0].title.length).toBeLessThanOrEqual(80);
    expect(learnings[0].title).toContain('...');
  });
});

describe('createInboxEntry', () => {
  it('creates an entry with generated ID', () => {
    const entry = createInboxEntry('claude-code', 'some content', 'inbox/file.md');

    expect(entry.id).toBeTruthy();
    expect(entry.adapterId).toBe('claude-code');
    expect(entry.content).toBe('some content');
    expect(entry.source).toBe('inbox/file.md');
    expect(entry.processed).toBe(false);
    expect(entry.receivedAt).toBeTruthy();
  });

  it('generates unique IDs', () => {
    const a = createInboxEntry('a', 'content', 'src');
    const b = createInboxEntry('b', 'content', 'src');
    expect(a.id).not.toBe(b.id);
  });
});

describe('processInboxEntries', () => {
  it('processes entries and counts memories', () => {
    const entry = createInboxEntry(
      'claude-code',
      'Use parameterized queries instead of string concatenation for safety',
      'inbox/test.md',
    );

    const result = processInboxEntries([entry]);

    expect(result.entriesFound).toBe(1);
    expect(result.entriesProcessed).toBe(1);
    expect(result.entriesSkipped).toBe(0);
    expect(result.memoriesCreated).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);
  });

  it('skips already-processed entries', () => {
    const entry = createInboxEntry(
      'claude-code',
      'We learned that index scans improve query performance dramatically',
      'inbox/test2.md',
    );

    // Process once
    processInboxEntries([entry]);

    // Process again — should be skipped
    const result = processInboxEntries([entry]);
    expect(result.entriesSkipped).toBe(1);
    expect(result.entriesProcessed).toBe(0);
  });

  it('handles empty entry list', () => {
    const result = processInboxEntries([]);
    expect(result.entriesFound).toBe(0);
    expect(result.entriesProcessed).toBe(0);
    expect(result.memoriesCreated).toBe(0);
  });
});

describe('isProcessed / markProcessed', () => {
  it('tracks processing state', () => {
    const testId = 'test-entry-' + Date.now();
    expect(isProcessed(testId)).toBe(false);

    markProcessed(testId);
    expect(isProcessed(testId)).toBe(true);
  });
});

describe('getProcessedCount', () => {
  it('returns count of processed entries', () => {
    const count = getProcessedCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
