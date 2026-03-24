/**
 * HMAC-SHA256 Signing and Verification
 *
 * Provides tamper-evident integrity signing for every memory record stored
 * in Noesis. Each memory is signed over a canonical JSON representation of
 * its identity-bearing fields, and verification recomputes the signature
 * to detect any modification.
 *
 * Key storage strategy (ordered by preference):
 * 1. macOS Keychain via `security` CLI -- strongest OS-level protection
 * 2. File-based fallback at ~/.agents/.signing_key with 0o400 permissions
 *
 * Signing cannot be disabled (invariant 1). There is no configuration
 * flag, environment variable, or code path that bypasses signature
 * generation or verification.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { dirname } from 'node:path';

import { SIGNING_KEY_PATH, FILE_PERMISSIONS, NOESIS_HOME } from '../constants.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEYCHAIN_SERVICE = 'com.noesis.signing-key';
const KEYCHAIN_ACCOUNT = 'noesis';
const KEY_LENGTH_BYTES = 32; // 256 bits

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function storeKeyInKeychain(key: Buffer): boolean {
  if (platform() !== 'darwin') {
    return false;
  }

  try {
    try {
      execSync(
        `security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}"`,
        { stdio: 'pipe' },
      );
    } catch {
      // Entry did not exist -- expected on first run.
    }

    const hexKey = key.toString('hex');
    execSync(
      `security add-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w "${hexKey}"`,
      { stdio: 'pipe' },
    );
    return true;
  } catch {
    return false;
  }
}

function loadKeyFromKeychain(): Buffer | null {
  if (platform() !== 'darwin') {
    return null;
  }

  try {
    const hexKey = execSync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w`,
      { stdio: 'pipe', encoding: 'utf-8' },
    ).trim();

    if (hexKey.length !== KEY_LENGTH_BYTES * 2) {
      return null;
    }

    return Buffer.from(hexKey, 'hex');
  } catch {
    return null;
  }
}

function storeKeyToFile(key: Buffer): void {
  const dir = dirname(SIGNING_KEY_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: FILE_PERMISSIONS.DIR });
  }

  writeFileSync(SIGNING_KEY_PATH, key.toString('hex'), {
    encoding: 'utf-8',
    mode: FILE_PERMISSIONS.SIGNING_KEY,
  });

  chmodSync(SIGNING_KEY_PATH, FILE_PERMISSIONS.SIGNING_KEY);
}

function loadKeyFromFile(): Buffer | null {
  if (!existsSync(SIGNING_KEY_PATH)) {
    return null;
  }

  try {
    const hexKey = readFileSync(SIGNING_KEY_PATH, 'utf-8').trim();

    if (hexKey.length !== KEY_LENGTH_BYTES * 2) {
      return null;
    }

    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== KEY_LENGTH_BYTES) {
      return null;
    }

    return key;
  } catch {
    return null;
  }
}

function canonicalize(memory: {
  id: string;
  type: string;
  title: string;
  content: string;
  project_id: string | null;
}): string {
  const fields = {
    content: memory.content,
    id: memory.id,
    project_id: memory.project_id,
    title: memory.title,
    type: memory.type,
  };

  const sortedKeys = Object.keys(fields).sort();
  return JSON.stringify(fields, sortedKeys);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateSigningKey(): Buffer {
  const key = randomBytes(KEY_LENGTH_BYTES);
  storeKeyInKeychain(key);
  storeKeyToFile(key);
  return key;
}

export function loadSigningKey(): Buffer {
  const keychainKey = loadKeyFromKeychain();
  if (keychainKey !== null) {
    return keychainKey;
  }

  const fileKey = loadKeyFromFile();
  if (fileKey !== null) {
    return fileKey;
  }

  throw new Error(
    'Signing key not found. Run `noesis init` to generate a signing key. ' +
      `Checked: OS keychain (service=${KEYCHAIN_SERVICE}), file (${SIGNING_KEY_PATH})`,
  );
}

/**
 * Sign arbitrary content with the HMAC-SHA256 signing key.
 * Used by the cognitive architecture to sign rules, experts,
 * capsules, skills, contexts, and commands.
 */
export function signContent(content: string): string {
  const key = loadSigningKey();
  const hmac = createHmac('sha256', key);
  hmac.update(content, 'utf-8');
  return hmac.digest('hex');
}

export function signMemory(memory: {
  id: string;
  type: string;
  title: string;
  content: string;
  project_id: string | null;
}): string {
  const key = loadSigningKey();
  const canonical = canonicalize(memory);
  const hmac = createHmac('sha256', key);
  hmac.update(canonical, 'utf-8');
  return hmac.digest('hex');
}

export function verifyMemory(memory: {
  id: string;
  type: string;
  title: string;
  content: string;
  project_id: string | null;
  signature: string;
}): { valid: boolean; tampered: boolean } {
  let expectedSignature: string;

  try {
    const key = loadSigningKey();
    const canonical = canonicalize(memory);
    const hmac = createHmac('sha256', key);
    hmac.update(canonical, 'utf-8');
    expectedSignature = hmac.digest('hex');
  } catch {
    return { valid: false, tampered: true };
  }

  const expected = Buffer.from(expectedSignature, 'hex');
  const actual = Buffer.from(memory.signature, 'hex');

  if (expected.length !== actual.length) {
    return { valid: false, tampered: true };
  }

  const isValid = timingSafeEqual(expected, actual);
  return { valid: isValid, tampered: !isValid };
}
