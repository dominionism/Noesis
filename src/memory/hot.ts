/**
 * Hot Memory Management
 *
 * Loads markdown files from the ~/.agents/ directory tree into memory
 * for injection into agent context windows. Hot memory files are the
 * highest-priority, always-included layer of the memory hierarchy:
 *
 *   Hot (this module) -> Warm (SQLite retrieval) -> Cold (JSONL transcripts)
 *
 * Uses mtime-based caching to avoid unnecessary I/O while detecting edits.
 * Synchronous I/O is intentional — files are small and local.
 *
 * Security:
 * - A01: Files live under ~/.agents/ with 0o700 permissions
 * - A03: File paths from constants, projectId validated against traversal
 */

import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { MEMORY_DIR, HOT_MEMORY_LINE_LIMIT } from '../constants.js';

export interface HotMemorySet {
  /** Memory files: filename -> content */
  memories: Record<string, string>;
  /** Total line count across all loaded files */
  totalLines: number;
}

interface CachedFile {
  content: string;
  mtimeMs: number;
}

const fileCache = new Map<string, CachedFile>();

function countLines(content: string): number {
  if (content.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') count++;
  }
  if (content[content.length - 1] === '\n') count--;
  return count;
}

function validateProjectId(projectId: string): void {
  if (
    projectId.includes('..') ||
    projectId.includes('/') ||
    projectId.includes('\\') ||
    projectId.includes('\0') ||
    projectId.trim().length === 0
  ) {
    throw new Error(
      `Invalid project ID for hot memory lookup: '${projectId}'`,
    );
  }
}

function loadMarkdownDir(dirPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(dirPath)) return result;

  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(dirPath, entry);
    const content = loadHotMemoryFile(filePath);
    if (content !== null) {
      result[entry] = content;
    }
  }

  return result;
}

/**
 * Load a single hot memory file with mtime-based caching.
 */
export function loadHotMemoryFile(filePath: string): string | null {
  if (!existsSync(filePath)) {
    fileCache.delete(filePath);
    return null;
  }

  let mtimeMs: number;
  try {
    const stats = statSync(filePath);
    mtimeMs = stats.mtimeMs;
  } catch {
    fileCache.delete(filePath);
    return null;
  }

  const cached = fileCache.get(filePath);
  if (cached !== undefined && cached.mtimeMs === mtimeMs) {
    return cached.content;
  }

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    fileCache.delete(filePath);
    return null;
  }

  fileCache.set(filePath, { content, mtimeMs });
  return content;
}

/**
 * Load ALL hot memory files from ~/.agents/memory/.
 */
export function loadHotMemory(): HotMemorySet {
  let totalLines = 0;
  const memories: Record<string, string> = {};

  // Top-level memory files
  const memoryFiles = ['index.md', 'patterns.md', 'preferences.md', 'solutions.md'];
  for (const filename of memoryFiles) {
    const filePath = join(MEMORY_DIR, filename);
    const content = loadHotMemoryFile(filePath);
    if (content !== null) {
      memories[filename] = content;
      totalLines += countLines(content);
    }
  }

  // Per-project: memory/projects/*.md
  const projectsDir = join(MEMORY_DIR, 'projects');
  if (existsSync(projectsDir)) {
    let projectEntries: string[];
    try {
      projectEntries = readdirSync(projectsDir);
    } catch {
      projectEntries = [];
    }

    for (const entry of projectEntries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = join(projectsDir, entry);
      const content = loadHotMemoryFile(filePath);
      if (content !== null) {
        memories[`projects/${entry}`] = content;
        totalLines += countLines(content);
      }
    }
  }

  // Global memory directory
  const globalDir = join(MEMORY_DIR, 'global');
  const globalFiles = loadMarkdownDir(globalDir);
  for (const [name, content] of Object.entries(globalFiles)) {
    memories[`global/${name}`] = content;
    totalLines += countLines(content);
  }

  return { memories, totalLines };
}

/**
 * Load project-specific hot memory.
 */
export function getProjectHotMemory(projectId: string): string | null {
  validateProjectId(projectId);
  const filePath = join(MEMORY_DIR, 'projects', `${projectId}.md`);
  return loadHotMemoryFile(filePath);
}

export function getHotMemoryLineCount(): number {
  return loadHotMemory().totalLines;
}

export function clearHotMemoryCache(): void {
  fileCache.clear();
}
