/**
 * Inbox Ingestion Helpers
 *
 * Parses write-back content from adapter inboxes into structured
 * learning candidates.
 *
 * The live persistence path is implemented by the sync orchestrator,
 * which calls these helpers and then runs the write pipeline. This
 * module deliberately stays lightweight: parsing, entry creation, and
 * basic accounting for unit tests and dry analysis flows. Parsed
 * `correction` blocks are an intermediate classification only; the live
 * write path normalizes them into persisted lesson memories.
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export interface InboxEntry {
  id: string;
  adapterId: string;
  content: string;
  source: string;
  receivedAt: string;
  processed: boolean;
}

export interface IngestResult {
  entriesFound: number;
  entriesProcessed: number;
  entriesSkipped: number;
  memoriesCreated: number;
  errors: string[];
}

export interface ParsedLearning {
  type: 'correction' | 'lesson' | 'preference' | 'task';
  title: string;
  content: string;
  confidence: number;
  source: string;
  tags: string[];
}

// ===========================================================================
// Module state
// ===========================================================================

const processedEntries: Set<string> = new Set();

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Parse raw inbox content into structured learnings.
 */
export function parseInboxContent(
  content: string,
  adapterId: string,
): ParsedLearning[] {
  const learnings: ParsedLearning[] = [];

  // Split by double newlines to find distinct entries
  const blocks = content.split(/\n{2,}/).filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const learning = classifyBlock(block, adapterId);
    if (learning) {
      learnings.push(learning);
    }
  }

  return learnings;
}

/**
 * Create an inbox entry from raw content.
 */
export function createInboxEntry(
  adapterId: string,
  content: string,
  source: string,
): InboxEntry {
  return {
    id: generateId(),
    adapterId,
    content,
    source,
    receivedAt: new Date().toISOString(),
    processed: false,
  };
}

/**
 * Process a batch of inbox entries for parsing/accounting only.
 *
 * This helper does not persist memories; production persistence happens
 * in the sync orchestrator after classification.
 */
export function processInboxEntries(entries: InboxEntry[]): IngestResult {
  let entriesProcessed = 0;
  let entriesSkipped = 0;
  let memoriesCreated = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    if (processedEntries.has(entry.id)) {
      entriesSkipped++;
      continue;
    }

    try {
      const learnings = parseInboxContent(entry.content, entry.adapterId);
      memoriesCreated += learnings.length;
      processedEntries.add(entry.id);
      entriesProcessed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Entry ${entry.id}: ${message}`);
    }
  }

  return {
    entriesFound: entries.length,
    entriesProcessed,
    entriesSkipped,
    memoriesCreated,
    errors,
  };
}

/**
 * Check if an entry has already been processed.
 */
export function isProcessed(entryId: string): boolean {
  return processedEntries.has(entryId);
}

/**
 * Mark an entry as processed.
 */
export function markProcessed(entryId: string): void {
  processedEntries.add(entryId);
}

/**
 * Get count of processed entries.
 */
export function getProcessedCount(): number {
  return processedEntries.size;
}

// ===========================================================================
// Internal helpers
// ===========================================================================

/**
 * Classify a content block into a learning type.
 */
function classifyBlock(block: string, adapterId: string): ParsedLearning | null {
  const lower = block.toLowerCase();
  const trimmed = block.trim();

  if (trimmed.length < 10) return null;

  // Detect corrections
  if (lower.includes('instead') || lower.includes('correction') || lower.includes('actually')) {
    return {
      type: 'correction',
      title: extractTitle(trimmed),
      content: trimmed,
      confidence: 0.7,
      source: adapterId,
      tags: ['ingested', adapterId],
    };
  }

  // Detect lessons
  if (lower.includes('lesson') || lower.includes('learned') || lower.includes('mistake')) {
    return {
      type: 'lesson',
      title: extractTitle(trimmed),
      content: trimmed,
      confidence: 0.6,
      source: adapterId,
      tags: ['ingested', adapterId],
    };
  }

  // Detect preferences
  if (lower.includes('prefer') || lower.includes('always') || lower.includes('never')) {
    return {
      type: 'preference',
      title: extractTitle(trimmed),
      content: trimmed,
      confidence: 0.8,
      source: adapterId,
      tags: ['ingested', adapterId],
    };
  }

  // Default to task
  return {
    type: 'task',
    title: extractTitle(trimmed),
    content: trimmed,
    confidence: 0.5,
    source: adapterId,
    tags: ['ingested', adapterId],
  };
}

function extractTitle(content: string): string {
  // Use first line or first 80 chars
  const firstLine = content.split('\n')[0].trim();
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
}
