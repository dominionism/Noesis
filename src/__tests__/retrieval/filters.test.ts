/**
 * Tests for src/retrieval/filters.ts
 *
 * Covers:
 * - Always includes status = 'active' condition
 * - project_id filter: OR-with-NULL pattern
 * - type_filter inclusion
 * - type_exclude exclusion
 * - tag_filter with json_each
 * - min_confidence threshold
 * - outcome_filter
 * - Combinations of multiple filters
 * - Empty/minimal params
 * - Parameterized values never appear in SQL string (injection prevention)
 */

import { describe, it, expect } from 'vitest';

import { buildFilterSQL } from '../../retrieval/filters.js';
import type { RecallParams } from '../../types.js';

describe('buildFilterSQL', () => {
  it('always includes status = active condition', () => {
    const result = buildFilterSQL({ query: 'anything' });

    expect(result.where).toContain("m.status = 'active'");
    expect(result.values).toEqual([]);
  });

  it('returns a WHERE clause even with only the mandatory filter', () => {
    const result = buildFilterSQL({ query: 'test' });

    expect(result.where).toMatch(/^WHERE /);
  });

  it('adds project_id filter with OR NULL pattern', () => {
    const result = buildFilterSQL({
      query: 'test',
      project_id: 'proj-123',
    });

    expect(result.where).toContain('(m.project_id = ? OR m.project_id IS NULL)');
    expect(result.values).toContain('proj-123');
  });

  it('adds type_filter with IN clause', () => {
    const result = buildFilterSQL({
      query: 'test',
      type_filter: ['task', 'decision'],
    });

    expect(result.where).toContain('m.type IN (?, ?)');
    expect(result.values).toContain('task');
    expect(result.values).toContain('decision');
  });

  it('adds type_exclude with NOT IN clause', () => {
    const result = buildFilterSQL({
      query: 'test',
      type_exclude: ['session', 'checkpoint'],
    });

    expect(result.where).toContain('m.type NOT IN (?, ?)');
    expect(result.values).toContain('session');
    expect(result.values).toContain('checkpoint');
  });

  it('adds tag_filter with json_each EXISTS subquery', () => {
    const result = buildFilterSQL({
      query: 'test',
      tag_filter: ['typescript', 'testing'],
    });

    expect(result.where).toContain('EXISTS');
    expect(result.where).toContain('json_each(m.tags)');
    expect(result.where).toContain('jt.value IN (?, ?)');
    expect(result.values).toContain('typescript');
    expect(result.values).toContain('testing');
  });

  it('adds min_confidence filter', () => {
    const result = buildFilterSQL({
      query: 'test',
      min_confidence: 0.8,
    });

    expect(result.where).toContain('m.confidence >= ?');
    expect(result.values).toContain(0.8);
  });

  it('adds outcome_filter with IN clause', () => {
    const result = buildFilterSQL({
      query: 'test',
      outcome_filter: ['success', 'partial_success'],
    });

    expect(result.where).toContain('m.outcome IN (?, ?)');
    expect(result.values).toContain('success');
    expect(result.values).toContain('partial_success');
  });

  it('combines multiple filters with AND', () => {
    const result = buildFilterSQL({
      query: 'test',
      project_id: 'proj-1',
      type_filter: ['task'],
      min_confidence: 0.5,
      outcome_filter: ['success'],
    });

    const andCount = (result.where.match(/ AND /g) || []).length;
    expect(andCount).toBeGreaterThanOrEqual(3); // active AND project AND type AND confidence AND outcome
    expect(result.values).toHaveLength(4); // proj-1, task, 0.5, success
  });

  it('preserves parameter ordering in values array', () => {
    const result = buildFilterSQL({
      query: 'test',
      project_id: 'proj-1',
      type_filter: ['task', 'decision'],
      min_confidence: 0.7,
    });

    // Values should be in the order: project_id, type_filter entries, min_confidence
    expect(result.values[0]).toBe('proj-1');
    expect(result.values[1]).toBe('task');
    expect(result.values[2]).toBe('decision');
    expect(result.values[3]).toBe(0.7);
  });

  it('skips type_filter when array is empty', () => {
    const result = buildFilterSQL({
      query: 'test',
      type_filter: [],
    });

    expect(result.where).not.toContain('m.type IN');
    expect(result.values).toEqual([]);
  });

  it('skips type_exclude when array is empty', () => {
    const result = buildFilterSQL({
      query: 'test',
      type_exclude: [],
    });

    expect(result.where).not.toContain('m.type NOT IN');
    expect(result.values).toEqual([]);
  });

  it('skips tag_filter when array is empty', () => {
    const result = buildFilterSQL({
      query: 'test',
      tag_filter: [],
    });

    expect(result.where).not.toContain('json_each');
    expect(result.values).toEqual([]);
  });

  it('skips outcome_filter when array is empty', () => {
    const result = buildFilterSQL({
      query: 'test',
      outcome_filter: [],
    });

    expect(result.where).not.toContain('m.outcome IN');
    expect(result.values).toEqual([]);
  });

  it('does not interpolate user values into the SQL string (injection prevention)', () => {
    const malicious: RecallParams = {
      query: "'; DROP TABLE memories; --",
      project_id: "'; DROP TABLE memories; --",
      type_filter: ['task'],
      tag_filter: ["'; DELETE FROM memories; --"],
      min_confidence: 0.5,
    };

    const result = buildFilterSQL(malicious);

    // SQL should only contain placeholders, not the actual malicious strings
    expect(result.where).not.toContain('DROP');
    expect(result.where).not.toContain('DELETE');
    // Values should contain the raw strings (to be passed as bind params)
    expect(result.values).toContain("'; DROP TABLE memories; --");
  });

  it('handles single-element arrays correctly', () => {
    const result = buildFilterSQL({
      query: 'test',
      type_filter: ['lesson'],
      tag_filter: ['security'],
      outcome_filter: ['failed'],
    });

    expect(result.where).toContain('m.type IN (?)');
    expect(result.where).toContain('jt.value IN (?)');
    expect(result.where).toContain('m.outcome IN (?)');
    expect(result.values).toEqual(['lesson', 'security', 'failed']);
  });
});
