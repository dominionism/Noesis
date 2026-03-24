/**
 * Tests for src/security/hmac.ts
 *
 * Validates HMAC-SHA256 signing and verification for memory integrity.
 * Tests cover key generation, key loading, signing, verification,
 * tamper detection, and canonical serialization.
 *
 * Since the real module interacts with the OS keychain and filesystem,
 * we mock the key storage to isolate the cryptographic logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';

let tempDir: string;
let signingKeyPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'noesis-hmac-test-'));
  signingKeyPath = join(tempDir, '.signing_key');
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
});

// Mock constants and child_process to avoid touching real keychain/files
vi.mock('../../constants.js', async () => {
  const actual = await vi.importActual('../../constants.js') as Record<string, unknown>;
  return {
    ...actual,
    get SIGNING_KEY_PATH() {
      return signingKeyPath;
    },
    get NOESIS_HOME() {
      return tempDir;
    },
  };
});

// Mock child_process to prevent actual keychain access
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => {
    throw new Error('keychain not available in test');
  }),
}));

// Mock platform to simulate non-darwin to avoid keychain paths
vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os') as Record<string, unknown>;
  return {
    ...actual,
    platform: () => 'linux',
  };
});

const { generateSigningKey, loadSigningKey, signMemory, verifyMemory } = await import('../../security/hmac.js');

// ---------------------------------------------------------------------------
// Helper to create a test memory
// ---------------------------------------------------------------------------

function makeMemory(overrides?: Partial<{
  id: string;
  type: string;
  title: string;
  content: string;
  project_id: string | null;
  signature: string;
}>) {
  return {
    id: '01HXYZ1234567890ABCDEFGH',
    type: 'decision',
    title: 'Use PostgreSQL over MySQL',
    content: '{"rationale": "better JSON support"}',
    project_id: 'proj-001',
    signature: '',
    ...overrides,
  };
}

describe('generateSigningKey', () => {
  it('generates a 32-byte key', () => {
    const key = generateSigningKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('writes the key to the signing key file', () => {
    const key = generateSigningKey();
    expect(existsSync(signingKeyPath)).toBe(true);
    const stored = readFileSync(signingKeyPath, 'utf-8').trim();
    expect(stored).toBe(key.toString('hex'));
  });

  it('generates different keys on each call', () => {
    const key1 = generateSigningKey();
    // First call sets file to 0o400 (read-only); make it writable before second call
    chmodSync(signingKeyPath, 0o600);
    const key2 = generateSigningKey();
    expect(key1.equals(key2)).toBe(false);
  });

  it('stores key as 64-character hex string', () => {
    generateSigningKey();
    const stored = readFileSync(signingKeyPath, 'utf-8').trim();
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('loadSigningKey', () => {
  it('loads a previously generated key', () => {
    const generated = generateSigningKey();
    const loaded = loadSigningKey();
    expect(loaded.equals(generated)).toBe(true);
  });

  it('throws when no key exists', () => {
    expect(() => loadSigningKey()).toThrow('Signing key not found');
  });

  it('returns null-equivalent for corrupted key file (wrong length)', () => {
    writeFileSync(signingKeyPath, 'tooshort', 'utf-8');
    expect(() => loadSigningKey()).toThrow('Signing key not found');
  });

  it('returns null-equivalent for empty key file', () => {
    writeFileSync(signingKeyPath, '', 'utf-8');
    expect(() => loadSigningKey()).toThrow('Signing key not found');
  });

  it('rejects key files with invalid hex content length', () => {
    // 63 hex chars instead of 64
    writeFileSync(signingKeyPath, 'a'.repeat(63), 'utf-8');
    expect(() => loadSigningKey()).toThrow('Signing key not found');
  });
});

describe('signMemory', () => {
  beforeEach(() => {
    generateSigningKey();
  });

  it('returns a hex string signature', () => {
    const memory = makeMemory();
    const signature = signMemory(memory);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces deterministic signatures for the same input', () => {
    const memory = makeMemory();
    const sig1 = signMemory(memory);
    const sig2 = signMemory(memory);
    expect(sig1).toBe(sig2);
  });

  it('produces different signatures for different memory IDs', () => {
    const mem1 = makeMemory({ id: 'ID_A' });
    const mem2 = makeMemory({ id: 'ID_B' });
    expect(signMemory(mem1)).not.toBe(signMemory(mem2));
  });

  it('produces different signatures for different content', () => {
    const mem1 = makeMemory({ content: 'content A' });
    const mem2 = makeMemory({ content: 'content B' });
    expect(signMemory(mem1)).not.toBe(signMemory(mem2));
  });

  it('produces different signatures for different titles', () => {
    const mem1 = makeMemory({ title: 'Title A' });
    const mem2 = makeMemory({ title: 'Title B' });
    expect(signMemory(mem1)).not.toBe(signMemory(mem2));
  });

  it('produces different signatures for different types', () => {
    const mem1 = makeMemory({ type: 'decision' });
    const mem2 = makeMemory({ type: 'task' });
    expect(signMemory(mem1)).not.toBe(signMemory(mem2));
  });

  it('produces different signatures for different project_ids', () => {
    const mem1 = makeMemory({ project_id: 'proj-A' });
    const mem2 = makeMemory({ project_id: 'proj-B' });
    expect(signMemory(mem1)).not.toBe(signMemory(mem2));
  });

  it('handles null project_id', () => {
    const memory = makeMemory({ project_id: null });
    const signature = signMemory(memory);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes project_id null vs non-null distinction in signature', () => {
    const mem1 = makeMemory({ project_id: null });
    const mem2 = makeMemory({ project_id: 'proj-001' });
    expect(signMemory(mem1)).not.toBe(signMemory(mem2));
  });

  it('handles empty strings in fields', () => {
    const memory = makeMemory({ title: '', content: '' });
    const signature = signMemory(memory);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles unicode content', () => {
    const memory = makeMemory({ content: 'Unicode: \u00e9\u00e8\u00ea\u00f1 \u2603 \ud83d\ude80' });
    const signature = signMemory(memory);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyMemory', () => {
  beforeEach(() => {
    generateSigningKey();
  });

  it('returns valid=true for unmodified memory', () => {
    const memory = makeMemory();
    const signature = signMemory(memory);
    const result = verifyMemory({ ...memory, signature });
    expect(result.valid).toBe(true);
    expect(result.tampered).toBe(false);
  });

  it('detects tampered content', () => {
    const memory = makeMemory();
    const signature = signMemory(memory);
    const tampered = { ...memory, signature, content: 'TAMPERED CONTENT' };
    const result = verifyMemory(tampered);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('detects tampered title', () => {
    const memory = makeMemory();
    const signature = signMemory(memory);
    const tampered = { ...memory, signature, title: 'TAMPERED TITLE' };
    const result = verifyMemory(tampered);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('detects tampered ID', () => {
    const memory = makeMemory();
    const signature = signMemory(memory);
    const tampered = { ...memory, signature, id: 'TAMPERED_ID' };
    const result = verifyMemory(tampered);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('detects tampered type', () => {
    const memory = makeMemory();
    const signature = signMemory(memory);
    const tampered = { ...memory, signature, type: 'incident' };
    const result = verifyMemory(tampered);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('detects tampered project_id', () => {
    const memory = makeMemory();
    const signature = signMemory(memory);
    const tampered = { ...memory, signature, project_id: 'different-project' };
    const result = verifyMemory(tampered);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('detects invalid hex signature', () => {
    const memory = makeMemory();
    const result = verifyMemory({ ...memory, signature: 'not-valid-hex' });
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('detects empty signature', () => {
    const memory = makeMemory();
    const result = verifyMemory({ ...memory, signature: '' });
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('detects wrong-length signature', () => {
    const memory = makeMemory();
    const result = verifyMemory({ ...memory, signature: 'abcdef1234' });
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('uses timing-safe comparison (functional verification)', () => {
    // Verify that valid signatures pass and invalid ones fail.
    // Timing safety cannot be directly tested, but we verify the
    // function correctly distinguishes valid/invalid.
    const memory = makeMemory();
    const realSig = signMemory(memory);

    // Off by one character
    const fakeSig = realSig.slice(0, -1) + (realSig.endsWith('0') ? '1' : '0');

    expect(verifyMemory({ ...memory, signature: realSig }).valid).toBe(true);
    expect(verifyMemory({ ...memory, signature: fakeSig }).valid).toBe(false);
  });
});

describe('canonical serialization', () => {
  beforeEach(() => {
    generateSigningKey();
  });

  it('field order does not affect signature', () => {
    // Both constructions have the same fields; canonical sort should
    // produce the same JSON regardless of object key insertion order.
    const mem1 = {
      id: 'ID1',
      type: 'task',
      title: 'T',
      content: 'C',
      project_id: null as string | null,
    };
    const mem2 = {
      content: 'C',
      project_id: null as string | null,
      type: 'task',
      id: 'ID1',
      title: 'T',
    };

    const sig1 = signMemory(mem1);
    const sig2 = signMemory(mem2);
    expect(sig1).toBe(sig2);
  });

  it('extra fields on the memory object do not affect signature', () => {
    const base = makeMemory();
    const sig1 = signMemory(base);

    const extended = {
      ...base,
      extra_field: 'should be ignored',
      confidence: 0.9,
      tags: '[]',
    };
    const sig2 = signMemory(extended);
    expect(sig1).toBe(sig2);
  });
});

describe('key isolation', () => {
  it('different keys produce different signatures for the same memory', () => {
    const memory = makeMemory();

    // Generate first key and sign
    generateSigningKey();
    const sig1 = signMemory(memory);

    // First call sets file to 0o400 (read-only); make it writable before second call
    chmodSync(signingKeyPath, 0o600);

    // Generate a new (different) key and sign again
    generateSigningKey();
    const sig2 = signMemory(memory);

    // Keys are random so signatures should differ
    // (There's a negligible probability of collision)
    expect(sig1).not.toBe(sig2);
  });
});
