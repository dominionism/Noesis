/**
 * Friction Detector
 *
 * Identifies moments where the user is struggling and proactively
 * offers help. Tracks 5 friction signals:
 *
 * 1. Rapid Corrections — 3+ corrections in a single session
 * 2. Task Abandonment — task started but no completion event
 * 3. Repeated Query — same/similar query 3+ times
 * 4. Long Silence — >10 minutes gap within session
 * 5. Error Cascades — 3+ tool errors in sequence
 */

// ===========================================================================
// Types
// ===========================================================================

export type FrictionSignalType =
  | 'rapid_corrections'
  | 'task_abandonment'
  | 'repeated_query'
  | 'long_silence'
  | 'error_cascade';

export interface FrictionSignal {
  type: FrictionSignalType;
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
  detectedAt: string;
  metadata: Record<string, unknown>;
}

export interface SessionActivity {
  corrections: number;
  queries: string[];
  errors: string[];
  taskStarted: boolean;
  taskCompleted: boolean;
  lastInteractionAt: string;
  startedAt: string;
}

export interface FrictionAnalysis {
  signals: FrictionSignal[];
  overallFriction: 'none' | 'low' | 'medium' | 'high';
  needsIntervention: boolean;
}

// ===========================================================================
// Constants
// ===========================================================================

const CORRECTION_THRESHOLD = 3;
const REPEATED_QUERY_THRESHOLD = 3;
const SILENCE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const ERROR_CASCADE_THRESHOLD = 3;
const QUERY_SIMILARITY_THRESHOLD = 0.6;

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Analyze a session for friction signals.
 */
export function analyzeSession(activity: SessionActivity): FrictionAnalysis {
  const signals: FrictionSignal[] = [];
  const now = activity.lastInteractionAt;

  // 1. Rapid Corrections
  if (activity.corrections >= CORRECTION_THRESHOLD) {
    signals.push({
      type: 'rapid_corrections',
      severity: activity.corrections >= 5 ? 'high' : 'medium',
      description: `${activity.corrections} corrections in this session`,
      suggestion: 'Consider reviewing preferences or adjusting the approach',
      detectedAt: now,
      metadata: { correctionCount: activity.corrections },
    });
  }

  // 2. Task Abandonment
  if (activity.taskStarted && !activity.taskCompleted) {
    const elapsed = Date.parse(now) - Date.parse(activity.startedAt);
    if (elapsed > SILENCE_THRESHOLD_MS) {
      signals.push({
        type: 'task_abandonment',
        severity: 'medium',
        description: 'Task started but no completion event',
        suggestion: 'Create a checkpoint or try a different approach',
        detectedAt: now,
        metadata: { elapsedMs: elapsed },
      });
    }
  }

  // 3. Repeated Query
  const repeatedQueries = detectRepeatedQueries(activity.queries);
  if (repeatedQueries.length > 0) {
    signals.push({
      type: 'repeated_query',
      severity: repeatedQueries.length >= 5 ? 'high' : 'medium',
      description: `${repeatedQueries.length} similar queries repeated`,
      suggestion: 'Run retrieval gap analysis or create the missing knowledge',
      detectedAt: now,
      metadata: { queries: repeatedQueries },
    });
  }

  // 4. Long Silence
  const silenceMs = Date.parse(now) - Date.parse(activity.startedAt);
  if (silenceMs > SILENCE_THRESHOLD_MS && activity.queries.length <= 1 && !activity.taskCompleted) {
    signals.push({
      type: 'long_silence',
      severity: 'low',
      description: 'Extended gap with minimal interaction',
      suggestion: 'Review relevant context or suggest next steps',
      detectedAt: now,
      metadata: { silenceMs },
    });
  }

  // 5. Error Cascades
  if (activity.errors.length >= ERROR_CASCADE_THRESHOLD) {
    signals.push({
      type: 'error_cascade',
      severity: activity.errors.length >= 5 ? 'high' : 'medium',
      description: `${activity.errors.length} errors in sequence`,
      suggestion: 'Step back and review the approach fundamentally',
      detectedAt: now,
      metadata: { errorCount: activity.errors.length, errors: activity.errors.slice(0, 5) },
    });
  }

  const overallFriction = computeOverallFriction(signals);

  return {
    signals,
    overallFriction,
    needsIntervention: overallFriction === 'high' || signals.length >= 2,
  };
}

/**
 * Check for a long silence signal.
 */
export function detectSilence(
  lastInteractionAt: string,
  currentTime: string,
): FrictionSignal | null {
  const gap = Date.parse(currentTime) - Date.parse(lastInteractionAt);

  if (gap >= SILENCE_THRESHOLD_MS) {
    return {
      type: 'long_silence',
      severity: gap >= SILENCE_THRESHOLD_MS * 3 ? 'high' : 'medium',
      description: `${Math.round(gap / 60_000)} minutes since last interaction`,
      suggestion: 'Offer relevant context or suggest next steps',
      detectedAt: currentTime,
      metadata: { silenceMs: gap },
    };
  }

  return null;
}

/**
 * Check if consecutive errors form a cascade.
 */
export function detectErrorCascade(errors: string[]): FrictionSignal | null {
  if (errors.length < ERROR_CASCADE_THRESHOLD) return null;

  return {
    type: 'error_cascade',
    severity: errors.length >= 5 ? 'high' : 'medium',
    description: `${errors.length} consecutive errors detected`,
    suggestion: 'Something is fundamentally wrong. Step back and review the approach.',
    detectedAt: new Date().toISOString(),
    metadata: { errorCount: errors.length, errors: errors.slice(0, 5) },
  };
}

/**
 * Track corrections and detect rapid correction friction.
 */
export function detectRapidCorrections(correctionCount: number): FrictionSignal | null {
  if (correctionCount < CORRECTION_THRESHOLD) return null;

  return {
    type: 'rapid_corrections',
    severity: correctionCount >= 5 ? 'high' : 'medium',
    description: `${correctionCount} corrections indicate the user is fighting the system`,
    suggestion: 'Review preferences, offer to adjust approach',
    detectedAt: new Date().toISOString(),
    metadata: { correctionCount },
  };
}

/**
 * Compute word-overlap similarity between two queries.
 */
export function querySimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }

  const minSize = Math.min(wordsA.size, wordsB.size);
  return minSize > 0 ? overlap / minSize : 0;
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function detectRepeatedQueries(queries: string[]): string[] {
  if (queries.length < REPEATED_QUERY_THRESHOLD) return [];

  const groups = new Map<number, string[]>();
  let groupId = 0;
  const assigned = new Map<number, number>();

  for (let i = 0; i < queries.length; i++) {
    if (assigned.has(i)) continue;

    const group = [queries[i]];
    assigned.set(i, groupId);

    for (let j = i + 1; j < queries.length; j++) {
      if (assigned.has(j)) continue;

      const sim = querySimilarity(queries[i], queries[j]);
      if (sim >= QUERY_SIMILARITY_THRESHOLD) {
        group.push(queries[j]);
        assigned.set(j, groupId);
      }
    }

    if (group.length >= REPEATED_QUERY_THRESHOLD) {
      groups.set(groupId, group);
    }
    groupId++;
  }

  const repeated: string[] = [];
  for (const group of groups.values()) {
    repeated.push(...group);
  }

  return repeated;
}

function computeOverallFriction(signals: FrictionSignal[]): FrictionAnalysis['overallFriction'] {
  if (signals.length === 0) return 'none';

  const hasHigh = signals.some((s) => s.severity === 'high');
  const hasMedium = signals.some((s) => s.severity === 'medium');

  if (hasHigh || signals.length >= 3) return 'high';
  if (hasMedium || signals.length >= 2) return 'medium';
  return 'low';
}
