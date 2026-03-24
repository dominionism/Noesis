/**
 * Audit Log Writer
 *
 * Provides an append-only, JSONL-formatted audit log for all security-
 * relevant events. Each entry records a timestamp, event type, a SHA-256
 * hash of the content (never raw content), and contextual metadata.
 *
 * Audit logging cannot be disabled (invariant 5).
 */

import { createHash } from 'node:crypto';
import {
  appendFileSync, statSync, renameSync, existsSync,
  chmodSync, readFileSync, mkdirSync, unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';

import { AUDIT_LOG_PATH, AUDIT_MAX_MB, FILE_PERMISSIONS } from '../constants.js';
import type { AuditEntry, AuditEventType } from '../types.js';

const MAX_BYTES = AUDIT_MAX_MB * 1024 * 1024;
const MAX_ROTATIONS = 3;

function ensureAuditLog(): void {
  const dir = dirname(AUDIT_LOG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: FILE_PERMISSIONS.DIR });
  }

  if (!existsSync(AUDIT_LOG_PATH)) {
    appendFileSync(AUDIT_LOG_PATH, '', { mode: FILE_PERMISSIONS.AUDIT_LOG });
  }

  try {
    chmodSync(AUDIT_LOG_PATH, FILE_PERMISSIONS.AUDIT_LOG);
  } catch {
    // Best effort
  }
}

function rotateIfNeeded(): void {
  if (!existsSync(AUDIT_LOG_PATH)) return;

  let fileSize: number;
  try {
    fileSize = statSync(AUDIT_LOG_PATH).size;
  } catch {
    return;
  }

  if (fileSize < MAX_BYTES) return;

  for (let i = MAX_ROTATIONS; i >= 1; i--) {
    const current = `${AUDIT_LOG_PATH}.${i}`;
    if (i === MAX_ROTATIONS) {
      if (existsSync(current)) {
        try { unlinkSync(current); } catch { /* best effort */ }
      }
    } else {
      const next = `${AUDIT_LOG_PATH}.${i + 1}`;
      if (existsSync(current)) {
        try { renameSync(current, next); } catch { /* best effort */ }
      }
    }
  }

  try {
    renameSync(AUDIT_LOG_PATH, `${AUDIT_LOG_PATH}.1`);
  } catch {
    // Accept -- next write appends to existing file
  }
}

function parseLine(line: string): AuditEntry | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (
      typeof parsed.timestamp !== 'string' ||
      typeof parsed.event_type !== 'string' ||
      typeof parsed.content_hash !== 'string' ||
      typeof parsed.source !== 'string'
    ) {
      return null;
    }

    return {
      timestamp: parsed.timestamp,
      event_type: parsed.event_type as AuditEventType,
      content_hash: parsed.content_hash,
      memory_id: typeof parsed.memory_id === 'string' ? parsed.memory_id : undefined,
      source: parsed.source as AuditEntry['source'],
      details: typeof parsed.details === 'object' && parsed.details !== null
        ? parsed.details as Record<string, unknown>
        : {},
    };
  } catch {
    return null;
  }
}

function readLogFile(path: string): AuditEntry[] {
  if (!existsSync(path)) return [];

  try {
    const content = readFileSync(path, 'utf-8');
    const entries: AuditEntry[] = [];
    for (const line of content.split('\n')) {
      const entry = parseLine(line);
      if (entry !== null) entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function writeAuditLog(entry: Omit<AuditEntry, 'timestamp'>): void {
  ensureAuditLog();
  rotateIfNeeded();

  const fullEntry: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  appendFileSync(AUDIT_LOG_PATH, JSON.stringify(fullEntry) + '\n', {
    encoding: 'utf-8',
    mode: FILE_PERMISSIONS.AUDIT_LOG,
  });
}

export function queryAuditLog(options: {
  last?: string;
  type?: AuditEventType;
}): AuditEntry[] {
  const allEntries: AuditEntry[] = [];

  for (let i = MAX_ROTATIONS; i >= 1; i--) {
    allEntries.push(...readLogFile(`${AUDIT_LOG_PATH}.${i}`));
  }
  allEntries.push(...readLogFile(AUDIT_LOG_PATH));

  let filtered = allEntries;

  if (options.last !== undefined) {
    const cutoff = new Date(options.last).getTime();
    filtered = filtered.filter(e => new Date(e.timestamp).getTime() > cutoff);
  }

  if (options.type !== undefined) {
    filtered = filtered.filter(e => e.event_type === options.type);
  }

  filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return filtered;
}
