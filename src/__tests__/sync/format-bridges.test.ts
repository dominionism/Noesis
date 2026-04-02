/**
 * Tests for Format Bridges
 */

import { describe, it, expect } from 'vitest';
import {
  getAdapterFormat,
  transformToFormat,
  transformForAdapter,
  parseFromFormat,
  type ContextSection,
} from '../../sync/format-bridges.js';

function makeSections(): ContextSection[] {
  return [
    { title: 'Skills', content: 'Skill A, Skill B', priority: 10, tokens: 5 },
    { title: 'Lessons', content: 'Lesson learned', priority: 5, tokens: 3 },
  ];
}

describe('getAdapterFormat', () => {
  it('returns markdown for claude-code', () => {
    expect(getAdapterFormat('claude-code')).toBe('markdown');
  });

  it('returns markdown for antigravity', () => {
    expect(getAdapterFormat('antigravity')).toBe('markdown');
  });

  it('returns markdown for cursor', () => {
    expect(getAdapterFormat('cursor')).toBe('markdown');
  });

  it('returns markdown for generic', () => {
    expect(getAdapterFormat('generic')).toBe('markdown');
  });

  it('returns plain for unknown adapter', () => {
    expect(getAdapterFormat('unknown')).toBe('plain');
  });
});

describe('transformToFormat', () => {
  it('transforms to markdown', () => {
    const result = transformToFormat(makeSections(), 'markdown');
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('## Skills');
    expect(result.content).toContain('## Lessons');
    expect(result.sections).toBe(2);
  });

  it('transforms to TOML', () => {
    const result = transformToFormat(makeSections(), 'toml');
    expect(result.format).toBe('toml');
    expect(result.content).toContain('[skills]');
    expect(result.content).toContain('priority = ');
  });

  it('transforms to frontmatter', () => {
    const result = transformToFormat(makeSections(), 'frontmatter');
    expect(result.format).toBe('frontmatter');
    expect(result.content).toContain('---');
    expect(result.content).toContain('sections:');
  });

  it('transforms to JSON', () => {
    const result = transformToFormat(makeSections(), 'json');
    expect(result.format).toBe('json');
    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveLength(2);
  });

  it('sorts sections by priority descending', () => {
    const result = transformToFormat(makeSections(), 'json');
    const parsed = JSON.parse(result.content);
    expect(parsed[0].title).toBe('Skills'); // priority 10
    expect(parsed[1].title).toBe('Lessons'); // priority 5
  });

  it('computes total tokens', () => {
    const result = transformToFormat(makeSections(), 'markdown');
    expect(result.totalTokens).toBe(8);
  });
});

describe('transformForAdapter', () => {
  it('uses the correct format for the adapter', () => {
    const result = transformForAdapter('antigravity', makeSections());
    expect(result.format).toBe('markdown');
  });
});

describe('parseFromFormat', () => {
  it('roundtrips markdown', () => {
    const sections = makeSections();
    const formatted = transformToFormat(sections, 'markdown');
    const parsed = parseFromFormat(formatted.content, 'markdown');

    expect(parsed.length).toBeGreaterThanOrEqual(1);
  });

  it('roundtrips JSON', () => {
    const sections = makeSections();
    const formatted = transformToFormat(sections, 'json');
    const parsed = parseFromFormat(formatted.content, 'json');

    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe('Skills');
  });

  it('handles invalid JSON gracefully', () => {
    const parsed = parseFromFormat('not valid json', 'json');
    expect(parsed).toHaveLength(0);
  });

  it('creates single section for plain format', () => {
    const parsed = parseFromFormat('some plain text', 'plain');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].content).toBe('some plain text');
  });
});
