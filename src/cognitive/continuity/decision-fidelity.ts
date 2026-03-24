/**
 * Decision Fidelity — Decision enforcement and deferred idea tracking.
 *
 * Locked decisions are stored in `context_state` with `context_type='decisions'`
 * per project. Each project has a single decisions document containing an
 * array of decision records and a separate array of deferred ideas.
 *
 * Decision fidelity checking compares proposed actions against locked
 * decisions to detect contradictions. Deferred ideas are tracked separately
 * as a parking lot for future work that should not be acted on now.
 *
 * Follows standard patterns: explicit DatabaseConnection injection,
 * parameterized queries, HMAC signing.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { SignFn } from '../types.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecisionRecord {
  id: string;
  description: string;
  rationale: string;
  locked: boolean;
  tags: string[];
  created_at: string;
}

export interface DeferredIdea {
  id: string;
  description: string;
  reason_deferred: string;
  related_decision_id: string | null;
  created_at: string;
}

export interface DecisionState {
  decisions: DecisionRecord[];
  deferred: DeferredIdea[];
}

export interface FidelityCheck {
  compliant: boolean;
  conflicts: Array<{
    decision: DecisionRecord;
    conflict_description: string;
  }>;
}

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface ContextRow {
  id: string;
  context_type: string;
  project_id: string | null;
  content: string;
  version: number;
  signature: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DECISIONS_CONTEXT_TYPE = 'decisions';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getDecisionState(
  db: DatabaseConnection,
  projectId: string,
): { row: ContextRow | undefined; state: DecisionState } {
  const row = db.prepare<[string, string], ContextRow>(
    'SELECT * FROM context_state WHERE context_type = ? AND project_id = ?',
  ).get(DECISIONS_CONTEXT_TYPE, projectId);

  if (row) {
    try {
      return { row, state: JSON.parse(row.content) };
    } catch {
      // Fall through
    }
  }

  return {
    row,
    state: { decisions: [], deferred: [] },
  };
}

function saveDecisionState(
  db: DatabaseConnection,
  projectId: string,
  state: DecisionState,
  existing: ContextRow | undefined,
  sign: SignFn,
): void {
  const now = new Date().toISOString();
  const content = JSON.stringify(state);
  const signature = sign(content);

  if (existing) {
    db.prepare<[string, number, string, string, string]>(
      'UPDATE context_state SET content = ?, version = ?, signature = ?, updated_at = ? WHERE id = ?',
    ).run(content, existing.version + 1, signature, now, existing.id);
  } else {
    const id = generateId();
    db.prepare<[string, string, string, string, string, string, string]>(`
      INSERT INTO context_state (
        id, context_type, project_id, content, signature, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, DECISIONS_CONTEXT_TYPE, projectId, content, signature, now, now);
  }
}

// ---------------------------------------------------------------------------
// Public API — Decisions
// ---------------------------------------------------------------------------

/**
 * Record a decision with rationale. Decisions are locked by default,
 * meaning they should be honored in subsequent actions.
 */
export function documentDecision(
  db: DatabaseConnection,
  projectId: string,
  description: string,
  rationale: string,
  sign: SignFn,
  options?: { locked?: boolean; tags?: string[] },
): DecisionRecord {
  const { row, state } = getDecisionState(db, projectId);

  const decision: DecisionRecord = {
    id: generateId(),
    description,
    rationale,
    locked: options?.locked !== false,
    tags: options?.tags ?? [],
    created_at: new Date().toISOString(),
  };

  state.decisions.push(decision);
  saveDecisionState(db, projectId, state, row, sign);

  return decision;
}

/**
 * Get all decisions for a project.
 */
export function getDecisions(
  db: DatabaseConnection,
  projectId: string,
): DecisionRecord[] {
  const { state } = getDecisionState(db, projectId);
  return state.decisions;
}

/**
 * Get only locked decisions for a project.
 */
export function getLockedDecisions(
  db: DatabaseConnection,
  projectId: string,
): DecisionRecord[] {
  const { state } = getDecisionState(db, projectId);
  return state.decisions.filter(d => d.locked);
}

/**
 * Unlock a decision, allowing it to be overridden.
 */
export function unlockDecision(
  db: DatabaseConnection,
  projectId: string,
  decisionId: string,
  sign: SignFn,
): void {
  const { row, state } = getDecisionState(db, projectId);

  const decision = state.decisions.find(d => d.id === decisionId);
  if (!decision) throw new Error(`Decision not found: ${decisionId}`);

  decision.locked = false;
  saveDecisionState(db, projectId, state, row, sign);
}

/**
 * Check whether a proposed action conflicts with any locked decisions.
 *
 * Performs keyword-based overlap detection between the proposed action
 * and each locked decision's description. If >40% of the decision's
 * significant words appear in the proposal (or vice versa), it flags
 * a potential conflict.
 */
export function checkDecisionFidelity(
  db: DatabaseConnection,
  projectId: string,
  proposedAction: string,
): FidelityCheck {
  const locked = getLockedDecisions(db, projectId);
  const conflicts: FidelityCheck['conflicts'] = [];

  const proposalWords = extractSignificantWords(proposedAction);

  for (const decision of locked) {
    const decisionWords = extractSignificantWords(decision.description);

    // Check for contradiction indicators
    const hasNegation = containsContradiction(proposedAction, decision.description);

    if (hasNegation) {
      conflicts.push({
        decision,
        conflict_description: `Proposed action may contradict locked decision: "${decision.description}"`,
      });
      continue;
    }

    // Check keyword overlap for relevance — high overlap + different intent = conflict
    const overlap = wordOverlap(proposalWords, decisionWords);
    if (overlap > 0.4) {
      // High overlap means the action is about the same topic
      // Check if the action uses negation or reversal language relative to the decision
      const actionLower = proposedAction.toLowerCase();
      const negationPatterns = ['remove', 'delete', 'drop', 'undo', 'revert', 'stop', 'disable', 'skip'];
      const hasReversal = negationPatterns.some(p => actionLower.includes(p));

      if (hasReversal) {
        conflicts.push({
          decision,
          conflict_description: `Action appears to reverse or undo locked decision: "${decision.description}"`,
        });
      }
    }
  }

  return {
    compliant: conflicts.length === 0,
    conflicts,
  };
}

// ---------------------------------------------------------------------------
// Public API — Deferred Ideas
// ---------------------------------------------------------------------------

/**
 * Defer an idea for later consideration.
 */
export function deferIdea(
  db: DatabaseConnection,
  projectId: string,
  description: string,
  reasonDeferred: string,
  sign: SignFn,
  relatedDecisionId?: string,
): DeferredIdea {
  const { row, state } = getDecisionState(db, projectId);

  const idea: DeferredIdea = {
    id: generateId(),
    description,
    reason_deferred: reasonDeferred,
    related_decision_id: relatedDecisionId ?? null,
    created_at: new Date().toISOString(),
  };

  state.deferred.push(idea);
  saveDecisionState(db, projectId, state, row, sign);

  return idea;
}

/**
 * Check if an idea (by keyword match) has been deferred.
 */
export function isDeferred(
  db: DatabaseConnection,
  projectId: string,
  ideaDescription: string,
): DeferredIdea | null {
  const { state } = getDecisionState(db, projectId);
  const queryWords = extractSignificantWords(ideaDescription);

  for (const idea of state.deferred) {
    const ideaWords = extractSignificantWords(idea.description);
    const overlap = wordOverlap(queryWords, ideaWords);
    if (overlap > 0.5) return idea;
  }

  return null;
}

/**
 * Get all deferred ideas for a project.
 */
export function getDeferredIdeas(
  db: DatabaseConnection,
  projectId: string,
): DeferredIdea[] {
  const { state } = getDecisionState(db, projectId);
  return state.deferred;
}

/**
 * Remove a deferred idea (when it's acted on or dismissed).
 */
export function removeDeferredIdea(
  db: DatabaseConnection,
  projectId: string,
  ideaId: string,
  sign: SignFn,
): void {
  const { row, state } = getDecisionState(db, projectId);

  const idx = state.deferred.findIndex(d => d.id === ideaId);
  if (idx === -1) throw new Error(`Deferred idea not found: ${ideaId}`);

  state.deferred.splice(idx, 1);
  saveDecisionState(db, projectId, state, row, sign);
}

// ---------------------------------------------------------------------------
// Text analysis helpers
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'it', 'be', 'as', 'do', 'no', 'not', 'this',
  'that', 'we', 'us', 'our', 'will', 'should', 'would', 'can', 'may',
  'has', 'have', 'had', 'was', 'were', 'been', 'are', 'from', 'so',
]);

function extractSignificantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function wordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let matches = 0;
  for (const word of a) {
    if (b.has(word)) matches++;
  }
  return matches / Math.min(a.size, b.size);
}

function containsContradiction(proposed: string, decision: string): boolean {
  const lower = proposed.toLowerCase();
  const decLower = decision.toLowerCase();

  // Check for direct negation patterns
  const contradictionPairs = [
    [/\buse\b/, /\bnot use\b|\bavoid\b|\bdon't use\b/],
    [/\badd\b/, /\bremove\b|\bdelete\b/],
    [/\benable\b/, /\bdisable\b/],
    [/\binclude\b/, /\bexclude\b/],
  ];

  for (const [positive, negative] of contradictionPairs) {
    if (positive.test(lower) && negative.test(decLower)) return true;
    if (positive.test(decLower) && negative.test(lower)) return true;
  }

  return false;
}
