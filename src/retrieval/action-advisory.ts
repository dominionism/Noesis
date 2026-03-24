/**
 * Action Advisory (checkAction)
 *
 * Checks a proposed action against historical incidents and lessons to
 * surface relevant warnings. Warnings are strictly INFORMATIONAL — they
 * never block, gate, or mandate any agent behavior (Invariant 7).
 *
 * The agent receives warnings and decides independently whether and how
 * to act on them.
 */

import type {
  CheckActionRequest,
  CheckActionResponse,
  RecallParams,
  RecallResult,
  MemoryType,
} from '../types.js';

/**
 * Maximum character length for the warning summary field.
 * ~100 tokens at ~4 chars/token.
 */
const SUMMARY_MAX_CHARS = 400;

/** Memory types queried for action advisories. */
const ADVISORY_TYPES: MemoryType[] = ['incident', 'lesson'];

/**
 * Truncate a string to the given character limit, appending an ellipsis
 * if truncation occurs. Avoids cutting mid-word when possible.
 */
function truncateToSummary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');

  if (lastSpace > maxChars * 0.6) {
    return slice.slice(0, lastSpace) + '...';
  }

  return slice + '...';
}

/**
 * Check a proposed action against past incidents and lessons.
 *
 * Scopes retrieval to incident + lesson types and returns compact
 * warning objects with relevance scores for agent inspection.
 */
export async function checkAction(params: {
  request: CheckActionRequest;
  retrieve: (recallParams: RecallParams) => Promise<RecallResult>;
}): Promise<CheckActionResponse> {
  const { request, retrieve } = params;

  const recallParams: RecallParams = {
    query: request.action_description,
    type_filter: ADVISORY_TYPES,
    limit: 20,
  };

  if (request.project_id !== undefined) {
    recallParams.project_id = request.project_id;
  }

  const result: RecallResult = await retrieve(recallParams);

  const warnings = result.memories.map((memory) => ({
    memory_id: memory.id,
    type: memory.type,
    title: memory.title,
    relevance_score: memory.final_score,
    summary: truncateToSummary(memory.content, SUMMARY_MAX_CHARS),
  }));

  return {
    warnings,
    warning_count: warnings.length,
  };
}
