/**
 * File Permission Enforcement
 *
 * Verifies and corrects POSIX file permissions for all Noesis-managed paths.
 * Permission enforcement cannot be disabled (invariant 6).
 */

import { existsSync, statSync, chmodSync } from 'node:fs';
import { platform } from 'node:os';

import {
  NOESIS_HOME,
  DB_PATH,
  SIGNING_KEY_PATH,
  AUDIT_LOG_PATH,
  MEMORY_DIR,
  SKILLS_DIR,
  ANTI_PATTERNS_DIR,
  COLD_STORAGE_DIR,
  BACKUPS_DIR,
  FILE_PERMISSIONS,
} from '../constants.js';

import { writeAuditLog, hashContent } from './audit.js';

// ---------------------------------------------------------------------------
// Path-to-permission mapping
// ---------------------------------------------------------------------------

const MANAGED_PATHS: ReadonlyArray<{ path: string; expectedMode: number; label: string }> =
  Object.freeze([
    { path: NOESIS_HOME, expectedMode: FILE_PERMISSIONS.DIR, label: 'NOESIS_HOME' },
    { path: DB_PATH, expectedMode: FILE_PERMISSIONS.DB, label: 'DB' },
    { path: SIGNING_KEY_PATH, expectedMode: FILE_PERMISSIONS.SIGNING_KEY, label: 'SIGNING_KEY' },
    { path: AUDIT_LOG_PATH, expectedMode: FILE_PERMISSIONS.AUDIT_LOG, label: 'AUDIT_LOG' },
    { path: MEMORY_DIR, expectedMode: FILE_PERMISSIONS.DIR, label: 'MEMORY_DIR' },
    { path: SKILLS_DIR, expectedMode: FILE_PERMISSIONS.DIR, label: 'SKILLS_DIR' },
    { path: ANTI_PATTERNS_DIR, expectedMode: FILE_PERMISSIONS.DIR, label: 'ANTI_PATTERNS_DIR' },
    { path: COLD_STORAGE_DIR, expectedMode: FILE_PERMISSIONS.DIR, label: 'COLD_DIR' },
    { path: BACKUPS_DIR, expectedMode: FILE_PERMISSIONS.DIR, label: 'BACKUPS_DIR' },
  ]);

function permissionBits(mode: number): number {
  return mode & 0o7777;
}

function formatOctal(mode: number): string {
  return '0o' + mode.toString(8).padStart(3, '0');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function enforcePermissions(): void {
  if (platform() === 'win32') {
    writeAuditLog({
      event_type: 'SECURITY_EVENT',
      content_hash: hashContent('permission_enforcement_skipped_windows'),
      source: 'system',
      details: {
        action: 'permission_enforcement_skipped',
        reason: 'Windows platform uses ACLs instead of POSIX mode bits',
      },
    });
    return;
  }

  for (const managed of MANAGED_PATHS) {
    if (!existsSync(managed.path)) continue;

    let currentMode: number;
    try {
      currentMode = permissionBits(statSync(managed.path).mode);
    } catch {
      continue;
    }

    const expectedPerms = permissionBits(managed.expectedMode);
    if (currentMode === expectedPerms) continue;

    try {
      chmodSync(managed.path, managed.expectedMode);
    } catch (err: unknown) {
      writeAuditLog({
        event_type: 'SECURITY_EVENT',
        content_hash: hashContent(`permission_correction_failed:${managed.path}`),
        source: 'system',
        details: {
          action: 'permission_correction_failed',
          path: managed.path,
          label: managed.label,
          current_mode: formatOctal(currentMode),
          expected_mode: formatOctal(expectedPerms),
          error: err instanceof Error ? err.message : String(err),
        },
      });
      continue;
    }

    writeAuditLog({
      event_type: 'SECURITY_EVENT',
      content_hash: hashContent(`permission_corrected:${managed.path}:${formatOctal(currentMode)}:${formatOctal(expectedPerms)}`),
      source: 'system',
      details: {
        action: 'permission_corrected',
        path: managed.path,
        label: managed.label,
        previous_mode: formatOctal(currentMode),
        corrected_mode: formatOctal(expectedPerms),
      },
    });
  }
}
