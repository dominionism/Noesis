/**
 * Tests for Capability Negotiator
 */

import { describe, it, expect } from 'vitest';
import {
  getCapabilities,
  getAllCapabilities,
  negotiate,
  negotiateAll,
  supportsFeature,
} from '../../sync/capability-negotiator.js';

describe('getCapabilities', () => {
  it('returns capabilities for known adapter', () => {
    const cap = getCapabilities('claude-code');
    expect(cap).not.toBeNull();
    expect(cap!.adapterId).toBe('claude-code');
    expect(cap!.maxContextTokens).toBe(50_000);
    expect(cap!.supportsSystemPrompt).toBe(true);
    expect(cap!.supportsManagedSections).toBe(true);
    expect(cap!.canWriteBack).toBe(true);
    expect(cap!.writeBackMechanism).toBe('cli_command');
  });

  it('returns null for unknown adapter', () => {
    expect(getCapabilities('nonexistent')).toBeNull();
  });

  it('returns correct capabilities for cursor', () => {
    const cap = getCapabilities('cursor');
    expect(cap).not.toBeNull();
    expect(cap!.maxContextTokens).toBe(8_000);
    expect(cap!.canWriteBack).toBe(false);
    expect(cap!.writeBackMechanism).toBe('none');
  });

  it('returns correct capabilities for copilot', () => {
    const cap = getCapabilities('copilot');
    expect(cap).not.toBeNull();
    expect(cap!.maxContextTokens).toBe(4_000);
    expect(cap!.supportsSystemPrompt).toBe(true);
  });

  it('returns correct capabilities for generic', () => {
    const cap = getCapabilities('generic');
    expect(cap).not.toBeNull();
    expect(cap!.supportsManagedSections).toBe(false);
    expect(cap!.canWriteBack).toBe(false);
  });
});

describe('getAllCapabilities', () => {
  it('returns all 9 adapters', () => {
    const all = getAllCapabilities();
    expect(all).toHaveLength(9);
  });

  it('includes all adapter IDs', () => {
    const ids = getAllCapabilities().map((c) => c.adapterId);
    expect(ids).toContain('claude-code');
    expect(ids).toContain('cursor');
    expect(ids).toContain('copilot');
    expect(ids).toContain('aider');
    expect(ids).toContain('codex-cli');
    expect(ids).toContain('opencode');
    expect(ids).toContain('antigravity');
    expect(ids).toContain('openclaw');
    expect(ids).toContain('generic');
  });
});

describe('negotiate', () => {
  it('returns null for unknown adapter', () => {
    expect(negotiate('nonexistent')).toBeNull();
  });

  it('uses adapter max when no budget specified', () => {
    const result = negotiate('claude-code');
    expect(result).not.toBeNull();
    expect(result!.effectiveTokenBudget).toBe(50_000);
    expect(result!.constraints).toHaveLength(0);
  });

  it('caps budget to adapter max', () => {
    const result = negotiate('cursor', 100_000);
    expect(result).not.toBeNull();
    expect(result!.effectiveTokenBudget).toBe(8_000);
    expect(result!.constraints.length).toBeGreaterThan(0);
    expect(result!.constraints[0]).toContain('8000');
  });

  it('uses requested budget when below adapter max', () => {
    const result = negotiate('claude-code', 10_000);
    expect(result).not.toBeNull();
    expect(result!.effectiveTokenBudget).toBe(10_000);
  });

  it('reports managed sections constraint when not supported', () => {
    const result = negotiate('generic');
    expect(result).not.toBeNull();
    expect(result!.constraints).toContain('Managed sections not supported; using full file write');
  });

  it('reports write-back constraint when not supported', () => {
    const result = negotiate('cursor');
    expect(result).not.toBeNull();
    expect(result!.constraints).toContain('Write-back not supported; sync is one-way only');
  });

  it('maps features correctly for claude-code', () => {
    const result = negotiate('claude-code');
    expect(result!.features.managedSections).toBe(true);
    expect(result!.features.writeBack).toBe(true);
    expect(result!.features.eventSubscription).toBe(true);
    expect(result!.features.structuredCorrection).toBe(true);
  });

  it('maps features correctly for generic', () => {
    const result = negotiate('generic');
    expect(result!.features.managedSections).toBe(false);
    expect(result!.features.writeBack).toBe(false);
    expect(result!.features.eventSubscription).toBe(false);
    expect(result!.features.structuredCorrection).toBe(false);
  });
});

describe('negotiateAll', () => {
  it('negotiates all detected adapters', () => {
    const results = negotiateAll(['claude-code', 'cursor', 'copilot']);
    expect(results).toHaveLength(3);
  });

  it('skips unknown adapters', () => {
    const results = negotiateAll(['claude-code', 'nonexistent']);
    expect(results).toHaveLength(1);
    expect(results[0].adapterId).toBe('claude-code');
  });

  it('applies global budget to all adapters', () => {
    const results = negotiateAll(['claude-code', 'cursor'], 5_000);
    for (const r of results) {
      expect(r.effectiveTokenBudget).toBeLessThanOrEqual(5_000);
    }
  });

  it('returns empty array for empty input', () => {
    expect(negotiateAll([])).toHaveLength(0);
  });
});

describe('supportsFeature', () => {
  it('returns true for supported features', () => {
    expect(supportsFeature('claude-code', 'managedSections')).toBe(true);
    expect(supportsFeature('claude-code', 'writeBack')).toBe(true);
    expect(supportsFeature('claude-code', 'eventSubscription')).toBe(true);
    expect(supportsFeature('claude-code', 'structuredCorrection')).toBe(true);
  });

  it('returns false for unsupported features', () => {
    expect(supportsFeature('generic', 'managedSections')).toBe(false);
    expect(supportsFeature('generic', 'writeBack')).toBe(false);
    expect(supportsFeature('cursor', 'structuredCorrection')).toBe(false);
  });

  it('returns false for unknown adapter', () => {
    expect(supportsFeature('nonexistent', 'managedSections')).toBe(false);
  });
});
