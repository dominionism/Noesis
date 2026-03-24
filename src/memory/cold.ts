/**
 * Cold Storage Management
 *
 * Persists session transcripts and events as JSONL files under
 * ~/.agents/cold/. Cold storage is the lowest tier:
 *
 *   Hot (markdown) -> Warm (SQLite) -> Cold (this module)
 *
 * Rotation at COLD_STORAGE_MAX_MB with numbered suffix scheme.
 * File permissions hardened to 0o600 on every write.
 *
 * Secret scanning is NOT applied here — cold storage captures raw data.
 * Scanning is applied when promoting from cold to warm memory.
 *
 * Security:
 * - A01: File permissions 0o600, directory 0o700
 * - A03: Project IDs validated against path traversal
 * - A08: Each JSONL line is independently parseable
 */

import {
  appendFileSync,
  statSync,
  renameSync,
  existsSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';

import { COLD_STORAGE_DIR, COLD_STORAGE_MAX_MB, FILE_PERMISSIONS } from '../constants.js';
import type { ColdEvent } from '../types.js';

const COLD_FILE_MODE = 0o600;
const EVENTS_FILENAME = 'events.jsonl';
const MAX_ROTATION_GENERATIONS = 3;

function validateProjectId(projectId: string): void {
  if (
    projectId.includes('..') ||
    projectId.includes('/') ||
    projectId.includes('\\') ||
    projectId.includes('\0') ||
    projectId.trim().length === 0
  ) {
    throw new Error(
      `Invalid project ID for cold storage: '${projectId}'`,
    );
  }
}

function ensureColdDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: FILE_PERMISSIONS.COLD_DIR });
  }
}

export function getColdStoragePath(projectId?: string): string {
  if (projectId !== undefined && projectId !== null) {
    validateProjectId(projectId);
    return join(COLD_STORAGE_DIR, projectId, EVENTS_FILENAME);
  }
  return join(COLD_STORAGE_DIR, EVENTS_FILENAME);
}

export function appendColdEvent(event: ColdEvent): void {
  const filePath = getColdStoragePath(event.project_id);
  const dir = dirname(filePath);
  ensureColdDir(dir);

  const line = JSON.stringify(event) + '\n';
  appendFileSync(filePath, line, { encoding: 'utf-8' });
  chmodSync(filePath, COLD_FILE_MODE);
  rotateIfNeeded(filePath, COLD_STORAGE_MAX_MB);
}

export function rotateIfNeeded(filePath: string, maxMB: number = COLD_STORAGE_MAX_MB): void {
  if (!existsSync(filePath)) return;

  let sizeBytes: number;
  try {
    sizeBytes = statSync(filePath).size;
  } catch {
    return;
  }

  const maxBytes = maxMB * 1024 * 1024;
  if (sizeBytes < maxBytes) return;

  for (let gen = MAX_ROTATION_GENERATIONS; gen >= 1; gen--) {
    const source = gen === 1 ? filePath : `${filePath}.${gen - 1}`;
    const target = `${filePath}.${gen}`;

    if (gen === MAX_ROTATION_GENERATIONS && existsSync(target)) {
      try { unlinkSync(target); } catch { /* best effort */ }
    }

    if (existsSync(source)) {
      try { renameSync(source, target); } catch { return; }
    }
  }
}

export function readColdEvents(projectId?: string): ColdEvent[] {
  const filePath = getColdStoragePath(projectId);
  if (!existsSync(filePath)) return [];

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const events: ColdEvent[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    try {
      const parsed = JSON.parse(trimmed) as ColdEvent;
      if (
        typeof parsed.timestamp !== 'string' ||
        typeof parsed.session_memory_id !== 'string' ||
        typeof parsed.agent !== 'string' ||
        typeof parsed.event_type !== 'string' ||
        typeof parsed.content_hash !== 'string' ||
        typeof parsed.content !== 'string'
      ) {
        continue;
      }
      events.push(parsed);
    } catch {
      continue;
    }
  }

  return events;
}
