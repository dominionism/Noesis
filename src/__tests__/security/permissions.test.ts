/**
 * Tests for src/security/permissions.ts
 *
 * Validates POSIX file permission enforcement for Noesis-managed paths.
 * Tests use temporary directories to avoid touching real Noesis files.
 *
 * Permission enforcement cannot be disabled (invariant 6).
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, chmodSync,
  statSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

// Path variables must be initialized at declaration time because
// MANAGED_PATHS in permissions.ts is computed at module load from
// the mocked constants. If these are undefined at import time,
// MANAGED_PATHS will contain undefined paths and enforcePermissions
// will skip all files.
let tempDir: string = mkdtempSync(join(tmpdir(), 'noesis-perms-test-'));
let homePath: string = tempDir;
let dbPath: string = join(tempDir, 'noesis.db');
let signingKeyPath: string = join(tempDir, '.signing_key');
let auditLogPath: string = join(tempDir, 'audit.log');
let memoryDir: string = join(tempDir, 'memory');
let skillsDir: string = join(tempDir, 'skills');
let antiPatternsDir: string = join(tempDir, 'anti-patterns');
let coldStorageDir: string = join(tempDir, 'cold');
let backupsDir: string = join(tempDir, 'backups');
let auditLogContent: string[] = [];

beforeEach(() => {
  // Clean and recreate the temp dir for test isolation
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch { /* best effort */ }
  mkdirSync(tempDir, { recursive: true });
  auditLogContent = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// Clean up temp directory after all tests
afterAll(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
});

// Mock the constants to point at temp directory
vi.mock('../../constants.js', async () => {
  const actual = await vi.importActual('../../constants.js') as Record<string, unknown>;
  return {
    ...actual,
    get NOESIS_HOME() { return homePath; },
    get DB_PATH() { return dbPath; },
    get SIGNING_KEY_PATH() { return signingKeyPath; },
    get AUDIT_LOG_PATH() { return auditLogPath; },
    get MEMORY_DIR() { return memoryDir; },
    get SKILLS_DIR() { return skillsDir; },
    get ANTI_PATTERNS_DIR() { return antiPatternsDir; },
    get COLD_STORAGE_DIR() { return coldStorageDir; },
    get BACKUPS_DIR() { return backupsDir; },
    FILE_PERMISSIONS: Object.freeze({
      DIR: 0o700,
      DB: 0o600,
      SIGNING_KEY: 0o400,
      AUDIT_LOG: 0o600,
      CONFIG: 0o600,
    }),
  };
});

// Mock the audit module to capture audit log writes without filesystem side effects
vi.mock('../../security/audit.js', () => ({
  writeAuditLog: vi.fn((entry: Record<string, unknown>) => {
    auditLogContent.push(JSON.stringify(entry));
  }),
  hashContent: vi.fn((content: string) => {
    return 'mock_hash_' + content.slice(0, 20);
  }),
}));

const { enforcePermissions } = await import('../../security/permissions.js');
const { writeAuditLog } = await import('../../security/audit.js');

describe('enforcePermissions', () => {
  describe('on non-Windows platform', () => {
    it('does not throw when no managed paths exist', () => {
      expect(() => enforcePermissions()).not.toThrow();
    });

    it('skips non-existent paths silently', () => {
      // None of our managed paths exist yet. Should not throw.
      enforcePermissions();
      // No audit log entries for non-existent paths
    });

    it('corrects directory permissions from 0o755 to 0o700', () => {
      if (platform() === 'win32') return;

      mkdirSync(homePath, { recursive: true, mode: 0o755 });
      chmodSync(homePath, 0o755);

      enforcePermissions();

      const mode = statSync(homePath).mode & 0o7777;
      expect(mode).toBe(0o700);
    });

    it('corrects file permissions from 0o644 to 0o600', () => {
      if (platform() === 'win32') return;

      writeFileSync(dbPath, 'test', { mode: 0o644 });
      chmodSync(dbPath, 0o644);

      enforcePermissions();

      const mode = statSync(dbPath).mode & 0o7777;
      expect(mode).toBe(0o600);
    });

    it('corrects signing key permissions to 0o400 (read-only)', () => {
      if (platform() === 'win32') return;

      writeFileSync(signingKeyPath, 'test-key', { mode: 0o644 });
      chmodSync(signingKeyPath, 0o644);

      enforcePermissions();

      const mode = statSync(signingKeyPath).mode & 0o7777;
      expect(mode).toBe(0o400);
    });

    it('does not modify paths already at correct permissions', () => {
      if (platform() === 'win32') return;

      mkdirSync(homePath, { recursive: true, mode: 0o700 });
      chmodSync(homePath, 0o700);

      enforcePermissions();

      // No correction audit log should be written for this path
      const auditCalls = vi.mocked(writeAuditLog).mock.calls;
      const correctionEntries = auditCalls.filter(
        call => (call[0] as Record<string, unknown>).details &&
          ((call[0] as Record<string, unknown>).details as Record<string, unknown>).action === 'permission_corrected' &&
          ((call[0] as Record<string, unknown>).details as Record<string, unknown>).path === homePath,
      );
      expect(correctionEntries).toHaveLength(0);
    });

    it('writes audit log when correcting permissions', () => {
      if (platform() === 'win32') return;

      mkdirSync(memoryDir, { recursive: true, mode: 0o755 });
      chmodSync(memoryDir, 0o755);

      enforcePermissions();

      const auditCalls = vi.mocked(writeAuditLog).mock.calls;
      const correctionEntries = auditCalls.filter(
        call => {
          const details = (call[0] as Record<string, unknown>).details as Record<string, unknown>;
          return details?.action === 'permission_corrected' && details?.path === memoryDir;
        },
      );
      expect(correctionEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('handles multiple paths needing correction', () => {
      if (platform() === 'win32') return;

      // Create several paths with wrong permissions
      mkdirSync(homePath, { recursive: true, mode: 0o755 });
      chmodSync(homePath, 0o755);
      mkdirSync(memoryDir, { recursive: true, mode: 0o777 });
      chmodSync(memoryDir, 0o777);
      mkdirSync(skillsDir, { recursive: true, mode: 0o750 });
      chmodSync(skillsDir, 0o750);

      enforcePermissions();

      expect(statSync(homePath).mode & 0o7777).toBe(0o700);
      expect(statSync(memoryDir).mode & 0o7777).toBe(0o700);
      expect(statSync(skillsDir).mode & 0o7777).toBe(0o700);
    });

    it('corrects audit log file permissions', () => {
      if (platform() === 'win32') return;

      writeFileSync(auditLogPath, 'log data', { mode: 0o644 });
      chmodSync(auditLogPath, 0o644);

      enforcePermissions();

      const mode = statSync(auditLogPath).mode & 0o7777;
      expect(mode).toBe(0o600);
    });

    it('corrects cold storage directory permissions', () => {
      if (platform() === 'win32') return;

      mkdirSync(coldStorageDir, { recursive: true, mode: 0o755 });
      chmodSync(coldStorageDir, 0o755);

      enforcePermissions();

      const mode = statSync(coldStorageDir).mode & 0o7777;
      expect(mode).toBe(0o700);
    });

    it('corrects backup directory permissions', () => {
      if (platform() === 'win32') return;

      mkdirSync(backupsDir, { recursive: true, mode: 0o777 });
      chmodSync(backupsDir, 0o777);

      enforcePermissions();

      const mode = statSync(backupsDir).mode & 0o7777;
      expect(mode).toBe(0o700);
    });
  });
});
