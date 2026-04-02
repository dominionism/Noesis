/**
 * Context Engine — Priority-ordered context assembly with token budgets.
 *
 * Loads contexts in CONTEXT_LOAD_PRIORITY order, respecting token budgets.
 * Project-specific contexts override global contexts of the same type.
 *
 * Also provides structured parsers for specific context types:
 * decisions, failure_patterns, user_taste.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { ContextEntry, ContextType } from '../types.js';
import { getContext } from './context-store.js';
import { CONTEXT_LOAD_PRIORITY } from '../../constants.js';
import { getContextTemplate } from './built-in-contexts.js';
import { computeValue, allocateItems, estimateTokens as economistEstimateTokens } from '../../intelligence/context-economist.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble contexts in priority order within a token budget.
 *
 * Iterates CONTEXT_LOAD_PRIORITY, loading each context (project-specific
 * with global fallback). Stops when the token budget is exhausted.
 */
export function assembleContexts(
  db: DatabaseConnection,
  projectId: string | null,
  tokenBudget: number,
): { contexts: ContextEntry[]; totalTokens: number } {
  const loaded: ContextEntry[] = [];
  let totalTokens = 0;

  for (const contextType of CONTEXT_LOAD_PRIORITY) {
    const entry = getContext(db, contextType as ContextType, projectId);
    if (!entry) continue;

    const normalizedEntry = normalizeContextEntry(entry);
    if (!isSubstantiveContextEntry(normalizedEntry)) continue;

    const entryTokens = estimateTokens(normalizedEntry.content);

    if (totalTokens + entryTokens > tokenBudget) {
      // Try to fit a truncated version if remaining budget is meaningful
      const remainingTokens = tokenBudget - totalTokens;
      if (remainingTokens > 50) {
        const truncated = truncateToTokens(normalizedEntry, remainingTokens);
        loaded.push(truncated);
        totalTokens += remainingTokens;
      }
      break;
    }

    loaded.push(normalizedEntry);
    totalTokens += entryTokens;
  }

  return { contexts: loaded, totalTokens };
}

/**
 * Assemble contexts using value-based allocation from intelligence/context-economist.
 *
 * Instead of simple priority ordering, this computes a value score for each
 * context entry (relevance * recency * uniqueness * importance) and allocates
 * the token budget to maximize total value.
 */
export function assembleContextsWithEconomist(
  db: DatabaseConnection,
  projectId: string | null,
  tokenBudget: number,
): { contexts: ContextEntry[]; totalTokens: number; allocation: import('../../intelligence/context-economist.js').AllocationResult } {
  // Load all substantive contexts first
  const candidates: Array<ContextEntry & { tokens: number }> = [];

  for (const contextType of CONTEXT_LOAD_PRIORITY) {
    const entry = getContext(db, contextType as ContextType, projectId);
    if (!entry) continue;

    const normalizedEntry = normalizeContextEntry(entry);
    if (!isSubstantiveContextEntry(normalizedEntry)) continue;

    const tokens = estimateTokens(normalizedEntry.content);
    candidates.push({ ...normalizedEntry, tokens });
  }

  // Convert to ContextItem for the economist
  const contextItems = candidates.map((c, i) => ({
    id: c.context_type,
    content: c.content,
    tokenCount: c.tokens,
    importanceClass: mapContextTypeToImportance(c.context_type),
    relevance: 1.0 - (i * 0.05), // Higher priority contexts get higher relevance
    recency: 1.0,
    uniqueness: 1.0,
  }));

  const allocation = allocateItems(contextItems, tokenBudget);

  // Map back to ContextEntry format
  const loaded: ContextEntry[] = [];
  let totalTokens = 0;

  for (const item of allocation.included) {
    const candidate = candidates.find(c => c.context_type === item.id);
    if (candidate) {
      loaded.push(candidate);
      totalTokens += item.finalTokenCount;
    }
  }

  return { contexts: loaded, totalTokens, allocation };
}

function mapContextTypeToImportance(type: string): import('../../intelligence/context-economist.js').ImportanceClass {
  switch (type) {
    case 'decisions': return 'skill';
    case 'failure_patterns': return 'anti_pattern';
    case 'lessons_learned': return 'lesson';
    case 'active_plan': return 'task';
    case 'user_taste': return 'preference';
    default: return 'other';
  }
}

/**
 * Parse the 'decisions' context into structured categories.
 *
 * Expected format:
 * ## Locked Decisions
 * - decision 1
 *
 * ## Deferred
 * - deferred item
 *
 * ## Discretion
 * - discretionary item
 */
export function getDecisions(
  db: DatabaseConnection,
  projectId?: string | null,
): { locked: string[]; deferred: string[]; discretion: string[] } {
  const entry = getContext(db, 'decisions', projectId);
  if (!entry) return { locked: [], deferred: [], discretion: [] };

  return parseDecisions(entry.content);
}

/**
 * Parse the 'failure_patterns' context into structured patterns.
 */
export function getFailurePatterns(
  db: DatabaseConnection,
  projectId?: string | null,
): FailurePattern[] {
  const entry = getContext(db, 'failure_patterns', projectId);
  if (!entry) return [];

  return parseFailurePatterns(entry.content);
}

/**
 * Parse the 'user_taste' context into structured preferences.
 */
export function getUserTaste(
  db: DatabaseConnection,
): { preferred: string[]; disliked: string[]; confirmations: string[] } {
  const entry = getContext(db, 'user_taste', null);
  if (!entry) return { preferred: [], disliked: [], confirmations: [] };

  return parseUserTaste(entry.content);
}

/**
 * Format contexts as markdown for prompt injection.
 */
export function formatContextsForPrompt(
  contexts: ContextEntry[],
  tokenBudget: number,
): string {
  const sections: string[] = [];
  let usedChars = 0;
  const charBudget = tokenBudget * 4;

  for (const ctx of contexts) {
    const normalizedCtx = normalizeContextEntry(ctx);
    if (!isSubstantiveContextEntry(normalizedCtx)) {
      continue;
    }
    const section = `### ${formatContextLabel(normalizedCtx.context_type)} (v${normalizedCtx.version})\n${normalizedCtx.content}`;

    if (usedChars + section.length > charBudget) {
      const remaining = charBudget - usedChars;
      if (remaining > 20) {
        const truncContent = section.slice(0, remaining - 15) + '\n[truncated]';
        sections.push(truncContent);
      }
      break;
    }

    sections.push(section);
    usedChars += section.length;
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FailurePattern {
  trigger: string;
  miss: string;
  rootCause: string;
  prevention: string;
}

interface DecisionRecordShape {
  description?: unknown;
  rationale?: unknown;
  locked?: unknown;
  tags?: unknown;
}

interface DeferredIdeaShape {
  description?: unknown;
  reason_deferred?: unknown;
}

interface DecisionStateShape {
  decisions?: unknown;
  deferred?: unknown;
}

interface ParsedFailurePattern extends FailurePattern {
  title: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function truncateToTokens(entry: ContextEntry, tokenBudget: number): ContextEntry {
  const charBudget = tokenBudget * 4;
  return {
    ...entry,
    content: entry.content.slice(0, charBudget) + '\n[truncated]',
  };
}

function formatContextLabel(type: ContextType): string {
  const labels: Record<ContextType, string> = {
    state: 'Project State',
    decisions: 'Locked Decisions',
    failure_patterns: 'Failure Patterns',
    lessons_learned: 'Lessons Learned',
    user_taste: 'User Preferences',
    verification: 'Verification',
    reference_library: 'Reference Library',
    ui_ux: 'UI/UX Brief',
    artifacts: 'Artifacts',
    tooling: 'Tooling',
    research_index: 'Research Index',
    session_index: 'Session Index',
    agent_catalog: 'Agent Catalog',
  };
  return labels[type] ?? type;
}

function normalizeContextEntry(entry: ContextEntry): ContextEntry {
  const normalizedContent = normalizeContextContent(entry.context_type, entry.content);

  if (normalizedContent === entry.content) {
    return entry;
  }

  return {
    ...entry,
    content: normalizedContent,
  };
}

export function isSubstantiveContextEntry(entry: ContextEntry): boolean {
  const normalizedContent = normalizeContextContent(entry.context_type, entry.content).trim();
  if (normalizedContent.length === 0) {
    return false;
  }

  const normalizedTemplate = normalizeContextContent(
    entry.context_type,
    getContextTemplate(entry.context_type),
  ).trim();

  if (normalizedContent === normalizedTemplate) {
    return false;
  }

  switch (entry.context_type) {
    case 'decisions': {
      const parsed = parseDecisions(normalizedContent);
      if (parsed.locked.length > 0 || parsed.deferred.length > 0 || parsed.discretion.length > 0) {
        return true;
      }

      return hasRenderableContextBody(normalizedContent);
    }
    case 'failure_patterns':
      return parseFailurePatternBlocks(normalizedContent).length > 0 || hasRenderableContextBody(normalizedContent);
    case 'user_taste': {
      const parsed = parseUserTaste(normalizedContent);
      if (parsed.preferred.length > 0 || parsed.disliked.length > 0 || parsed.confirmations.length > 0) {
        return true;
      }

      return hasRenderableContextBody(normalizedContent);
    }
    default:
      return hasRenderableContextBody(normalizedContent);
  }
}

function normalizeContextContent(type: ContextType, content: string): string {
  switch (type) {
    case 'decisions':
      return normalizeDecisionsContent(content);
    case 'failure_patterns':
      return normalizeFailurePatternsContent(content);
    default:
      return content;
  }
}

function parseDecisions(content: string): {
  locked: string[];
  deferred: string[];
  discretion: string[];
} {
  const decisionState = parseDecisionState(content);
  if (decisionState) {
    return {
      locked: decisionState.decisions
        .filter(decision => decision.locked !== false)
        .map(decision => decision.description),
      deferred: decisionState.deferred.map(idea => idea.description),
      discretion: [],
    };
  }

  const locked: string[] = [];
  const deferred: string[] = [];
  const discretion: string[] = [];

  let current: string[] | null = null;
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('## locked') || lower.startsWith('# locked')) {
      current = locked;
    } else if (lower.startsWith('## deferred') || lower.startsWith('# deferred')) {
      current = deferred;
    } else if (lower.startsWith('## discretion') || lower.startsWith('# discretion')) {
      current = discretion;
    } else if (trimmed.startsWith('- ') && current) {
      current.push(trimmed.slice(2).trim());
    }
  }

  return { locked, deferred, discretion };
}

function parseFailurePatterns(content: string): FailurePattern[] {
  return parseFailurePatternBlocks(content).map(({ title: _title, ...pattern }) => pattern);
}

function parseUserTaste(content: string): {
  preferred: string[];
  disliked: string[];
  confirmations: string[];
} {
  const preferred: string[] = [];
  const disliked: string[] = [];
  const confirmations: string[] = [];

  let current: string[] | null = null;
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('## preferred') || lower.startsWith('# preferred')) {
      current = preferred;
    } else if (lower.startsWith('## disliked') || lower.startsWith('# disliked')) {
      current = disliked;
    } else if (lower.startsWith('## confirmation') || lower.startsWith('# confirmation')) {
      current = confirmations;
    } else if (trimmed.startsWith('- ') && current) {
      current.push(trimmed.slice(2).trim());
    }
  }

  return { preferred, disliked, confirmations };
}

function parseDecisionState(content: string): {
  decisions: Array<{
    description: string;
    rationale: string;
    locked: boolean;
    tags: string[];
  }>;
  deferred: Array<{
    description: string;
    reasonDeferred: string;
  }>;
} | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as DecisionStateShape;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const decisions = Array.isArray(parsed.decisions)
      ? parsed.decisions
          .map(decision => normalizeDecisionRecord(decision))
          .filter((decision): decision is NonNullable<typeof decision> => decision !== null)
      : [];
    const deferred = Array.isArray(parsed.deferred)
      ? parsed.deferred
          .map(idea => normalizeDeferredIdea(idea))
          .filter((idea): idea is NonNullable<typeof idea> => idea !== null)
      : [];

    if (!Array.isArray(parsed.decisions) && !Array.isArray(parsed.deferred)) {
      return null;
    }

    return { decisions, deferred };
  } catch {
    return null;
  }
}

function normalizeDecisionRecord(value: unknown): {
  description: string;
  rationale: string;
  locked: boolean;
  tags: string[];
} | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as DecisionRecordShape;
  if (typeof record.description !== 'string' || record.description.trim().length === 0) {
    return null;
  }

  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];

  return {
    description: record.description.trim(),
    rationale: typeof record.rationale === 'string' ? record.rationale.trim() : '',
    locked: record.locked !== false,
    tags,
  };
}

function normalizeDeferredIdea(value: unknown): {
  description: string;
  reasonDeferred: string;
} | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const idea = value as DeferredIdeaShape;
  if (typeof idea.description !== 'string' || idea.description.trim().length === 0) {
    return null;
  }

  return {
    description: idea.description.trim(),
    reasonDeferred: typeof idea.reason_deferred === 'string' ? idea.reason_deferred.trim() : '',
  };
}

function normalizeDecisionsContent(content: string): string {
  const decisionState = parseDecisionState(content);
  if (decisionState) {
    const lines: string[] = [];
    const lockedDecisions = decisionState.decisions.filter(decision => decision.locked !== false);

    if (lockedDecisions.length > 0) {
      for (const decision of lockedDecisions) {
        lines.push(`- ${decision.description}`);
        if (decision.rationale) {
          lines.push(`  Why: ${decision.rationale}`);
        }
        if (decision.tags.length > 0) {
          lines.push(`  Tags: ${decision.tags.join(', ')}`);
        }
      }
    } else {
      lines.push('<!-- Non-negotiable decisions that must be honored -->');
    }

    lines.push('', '## Deferred');

    if (decisionState.deferred.length > 0) {
      for (const idea of decisionState.deferred) {
        lines.push(`- ${idea.description}`);
        if (idea.reasonDeferred) {
          lines.push(`  Reason Deferred: ${idea.reasonDeferred}`);
        }
      }
    } else {
      lines.push('<!-- Items explicitly deferred / out of scope -->');
    }

    lines.push('', '## Discretion');
    lines.push('<!-- Agent may decide at its discretion -->');

    return lines.join('\n');
  }

  return stripLeadingSectionHeading(content, 'locked decisions');
}

function normalizeFailurePatternsContent(content: string): string {
  const patterns = parseFailurePatternBlocks(content);
  if (patterns.length === 0) {
    return stripLeadingSectionHeading(content, 'failure patterns');
  }

  return patterns.map(renderFailurePattern).join('\n\n');
}

function parseFailurePatternBlocks(content: string): ParsedFailurePattern[] {
  const patterns: ParsedFailurePattern[] = [];
  let current: ParsedFailurePattern | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#{2,3}\s+(.+)$/);

    if (headingMatch) {
      if (current && hasFailurePatternData(current)) {
        patterns.push(current);
      }

      const title = headingMatch[1].trim();
      current = {
        title,
        trigger: extractTriggerFromTitle(title),
        miss: '',
        rootCause: '',
        prevention: '',
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const field = parseFailurePatternField(trimmed);
    if (!field) {
      continue;
    }

    switch (field.label) {
      case 'trigger':
        current.trigger = field.value;
        break;
      case 'miss':
        current.miss = field.value;
        break;
      case 'rootcause':
        current.rootCause = field.value;
        break;
      case 'prevention':
        current.prevention = field.value;
        break;
      default:
        break;
    }
  }

  if (current && hasFailurePatternData(current)) {
    patterns.push(current);
  }

  return patterns;
}

function hasFailurePatternData(pattern: ParsedFailurePattern): boolean {
  if (pattern.trigger || pattern.miss || pattern.rootCause) {
    return true;
  }

  return Boolean(pattern.prevention && !isGenericFailurePatternHeading(pattern.title));
}

function extractTriggerFromTitle(title: string): string {
  const trimmed = title.trim();
  if (isGenericFailurePatternHeading(trimmed)) {
    return '';
  }

  const separator = trimmed.indexOf(':');
  if (separator === -1) {
    return trimmed;
  }

  return trimmed.slice(separator + 1).trim();
}

function hasRenderableContextBody(content: string): boolean {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, '');

  for (const line of withoutComments.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      continue;
    }

    return true;
  }

  return false;
}

function isGenericFailurePatternHeading(title: string): boolean {
  const lower = title.trim().toLowerCase();
  return lower === 'failure patterns' || lower === 'predicted failure modes';
}

function parseFailurePatternField(trimmed: string): {
  label: 'trigger' | 'miss' | 'rootcause' | 'prevention';
  value: string;
} | null {
  if (!trimmed) {
    return null;
  }

  const withoutBullet = trimmed.replace(/^-\s*/, '');
  const normalized = withoutBullet.replace(/\*\*/g, '');
  const separator = normalized.indexOf(':');
  if (separator === -1) {
    return null;
  }

  const rawLabel = normalized.slice(0, separator).trim().toLowerCase().replace(/\s+/g, '');
  const value = normalized.slice(separator + 1).trim();
  if (!value) {
    return null;
  }

  switch (rawLabel) {
    case 'trigger':
    case 'miss':
    case 'rootcause':
    case 'prevention':
      return { label: rawLabel, value };
    default:
      return null;
  }
}

function renderFailurePattern(pattern: ParsedFailurePattern): string {
  const title = pattern.title.trim() || pattern.trigger || 'Failure Pattern';
  const lines = [`## ${title}`];

  if (pattern.trigger) {
    lines.push(`- Trigger: ${pattern.trigger}`);
  }
  if (pattern.miss) {
    lines.push(`- Miss: ${pattern.miss}`);
  }
  if (pattern.rootCause) {
    lines.push(`- Root Cause: ${pattern.rootCause}`);
  }
  if (pattern.prevention) {
    lines.push(`- Prevention: ${pattern.prevention}`);
  }

  return lines.join('\n');
}

function stripLeadingSectionHeading(content: string, heading: string): string {
  const lines = content.split('\n');
  if (lines.length === 0) {
    return content;
  }

  const firstLine = lines[0]?.trim().toLowerCase();
  const normalizedHeading = heading.toLowerCase();

  if (firstLine === `## ${normalizedHeading}` || firstLine === `# ${normalizedHeading}`) {
    return lines.slice(1).join('\n').replace(/^\n+/, '');
  }

  return content;
}
