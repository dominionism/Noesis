import { describe, it, expect } from 'vitest';
import { generateId } from '../../core/ulid.js';

describe('generateId', () => {
  it('returns a 26-character string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(26);
  });

  it('returns valid Crockford Base32 characters', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });

  it('encodes timestamp prefix for sortability across milliseconds', async () => {
    const id1 = generateId();
    // Wait to ensure different millisecond
    await new Promise(r => setTimeout(r, 2));
    const id2 = generateId();
    // IDs from different milliseconds should sort correctly
    expect(id1 < id2).toBe(true);
  });
});
