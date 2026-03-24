/**
 * Correction Detector — Detect user corrections from message content.
 *
 * Two detection modes:
 * - Explicit: direct correction signals ("no", "wrong", "instead", etc.)
 * - Implicit: user rephrases request or undoes changes
 *
 * Also detects repeated failures within a time window for systemic
 * writeback escalation.
 */

import type { DatabaseConnection } from '../../core/database.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CorrectionType = 'explicit' | 'implicit';

export interface CorrectionDetection {
  detected: boolean;
  type: CorrectionType | null;
  signal: string;
}

export interface RepeatedFailureDetection {
  repeated: boolean;
  count: number;
  relatedIds: string[];
}

// ---------------------------------------------------------------------------
// Explicit correction patterns
// ---------------------------------------------------------------------------

const EXPLICIT_PATTERNS: { pattern: RegExp; signal: string }[] = [
  { pattern: /\bno[,.]?\s+(?:that'?s?\s+)?(?:wrong|incorrect|not\s+(?:right|what))/i, signal: 'explicit-negation' },
  { pattern: /\bdon'?t\b/i, signal: 'explicit-dont' },
  { pattern: /\binstead\b/i, signal: 'explicit-instead' },
  { pattern: /\bnot\s+that\b/i, signal: 'explicit-not-that' },
  { pattern: /\bactually[,.]?\s/i, signal: 'explicit-actually' },
  { pattern: /\bwrong\b/i, signal: 'explicit-wrong' },
  { pattern: /\bincorrect\b/i, signal: 'explicit-incorrect' },
  { pattern: /\bstop\b/i, signal: 'explicit-stop' },
  { pattern: /\brevert\b/i, signal: 'explicit-revert' },
  { pattern: /\bundo\b/i, signal: 'explicit-undo' },
  { pattern: /\bfix\s+(?:this|that|it)\b/i, signal: 'explicit-fix' },
  { pattern: /\bthat'?s?\s+not\b/i, signal: 'explicit-thats-not' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether a user message contains a correction.
 *
 * Checks explicit patterns first (stronger signal), then falls back
 * to implicit detection by comparing with previous output.
 */
export function detectCorrection(
  userMessage: string,
  previousOutput: string | null,
): CorrectionDetection {
  const trimmed = userMessage.trim();

  // 1. Check explicit correction patterns
  for (const { pattern, signal } of EXPLICIT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { detected: true, type: 'explicit', signal };
    }
  }

  // 2. Check implicit correction (user rephrases with similar intent)
  if (previousOutput) {
    const implicit = detectImplicitCorrection(trimmed, previousOutput);
    if (implicit) {
      return { detected: true, type: 'implicit', signal: implicit };
    }
  }

  return { detected: false, type: null, signal: '' };
}

/**
 * Detect repeated failures of the same class within a time window.
 *
 * Used to trigger systemic writeback: 3+ similar failures suggests
 * a missing rule or misconfigured gate.
 *
 * Queries cognitive_outcomes where failure evidence matches the class,
 * then filters by keyword similarity with the task description.
 */
export function detectRepeatedFailure(
  db: DatabaseConnection,
  taskDescription: string,
  failureClass: string,
  windowHours: number = 24,
): RepeatedFailureDetection {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  // Query cognitive_outcomes for failures with matching evidence pattern
  const rows = db.prepare<[string], { id: string; task_description: string; evidence: string | null }>(`
    SELECT id, task_description, evidence FROM cognitive_outcomes
    WHERE outcome = 'failure' AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(cutoff);

  // Filter for rows matching the failure class (in evidence or failure_class)
  const classMatched = rows.filter(row =>
    row.evidence?.includes(failureClass) ?? false,
  );

  // Further filter by task-similarity (simple keyword overlap)
  const taskKeywords = extractKeywords(taskDescription);
  const related = classMatched.filter(row => {
    const rowKeywords = extractKeywords(row.task_description);
    const overlap = taskKeywords.filter(k => rowKeywords.includes(k));
    return overlap.length >= Math.min(2, taskKeywords.length);
  });

  return {
    repeated: related.length >= 3,
    count: related.length,
    relatedIds: related.map(r => r.id),
  };
}

/**
 * Extract correction content from an explicit correction message.
 *
 * Strips the correction signal prefix and returns the actionable content.
 */
export function extractCorrectionContent(
  userMessage: string,
  detection: CorrectionDetection,
): string {
  if (!detection.detected) return userMessage;

  // For explicit corrections, the whole message is the correction
  return userMessage.trim();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function detectImplicitCorrection(
  currentMessage: string,
  previousOutput: string,
): string | null {
  const currentWords = new Set(currentMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const previousWords = new Set(previousOutput.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  // High word overlap with different phrasing suggests rephrasing
  let overlap = 0;
  for (const word of currentWords) {
    if (previousWords.has(word)) overlap++;
  }

  const overlapRatio = currentWords.size > 0 ? overlap / currentWords.size : 0;

  // >50% word overlap but messages aren't identical → likely rephrasing
  if (overlapRatio > 0.5 && currentMessage.trim() !== previousOutput.trim()) {
    return 'implicit-rephrasing';
  }

  return null;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'as', 'until', 'while', 'of',
  'at', 'by', 'for', 'with', 'about', 'against', 'between', 'through',
  'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up',
  'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'it', 'its',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}
