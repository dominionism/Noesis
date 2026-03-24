/**
 * Base Adapter Utilities
 *
 * Shared logic for all adapter implementations. Individual adapters
 * delegate context assembly and hash verification here to avoid
 * duplicating priority-ordered rendering, budget tracking, and
 * hash computation across 9 separate files.
 *
 * Context is assembled in strict priority order:
 * 1. System identity (persona, conventions)
 * 2. Active plan (from checkpoints with plan_name)
 * 3. Active checkpoints
 * 4. Critical anti-patterns
 * 5. Relevant skills
 * 6. Recent lessons (warm memories)
 *
 * Each section is compressed/truncated as needed to fit the budget.
 */

import type {
  UniversalContext,
  TokenBudget,
  SyncResult,
  FileWriteRequest,
  ExtractedLearnings,
  VerifyResult,
  MemoryType,
} from '../types.js';

import type { DatabaseConnection } from '../core/database.js';
import type {
  RuleDefinition,
  ExpertDefinition,
  AssembledCapsule,
  ExecutableSkill,
  ContextEntry,
} from '../cognitive/types.js';

import { createTokenBudget, allocateTokens, estimateTokens, compressContent } from './context-budget.js';
import { createManagedSection, hashContent } from './managed-sections.js';

// ---------------------------------------------------------------------------
// Section rendering
// ---------------------------------------------------------------------------

function renderPersona(context: UniversalContext): string {
  if (!context.persona) {
    return '';
  }
  return `## System Identity\n\n${context.persona}`;
}

function renderConventions(context: UniversalContext): string {
  const entries = Object.entries(context.conventions);
  if (entries.length === 0) {
    return '';
  }
  const lines = entries.map(([key, value]) => `- **${key}**: ${value}`);
  return `## Conventions\n\n${lines.join('\n')}`;
}

function renderProjectContext(context: UniversalContext): string {
  const entries = Object.entries(context.projectContext);
  if (entries.length === 0) {
    return '';
  }
  const lines = entries.map(([key, value]) => `- **${key}**: ${value}`);
  return `## Project Context\n\n${lines.join('\n')}`;
}

function renderActivePlan(context: UniversalContext): string {
  // Find checkpoints that represent active plans
  const planCheckpoints = context.activeCheckpoints.filter((cp) => {
    try {
      const parsed = JSON.parse(cp.content);
      return parsed.plan_name != null;
    } catch {
      return false;
    }
  });

  if (planCheckpoints.length === 0) {
    return '';
  }

  const sections = planCheckpoints.map((cp) => {
    try {
      const parsed = JSON.parse(cp.content);
      const lines = [`### ${parsed.plan_name ?? cp.title}`];
      if (parsed.phases && Array.isArray(parsed.phases)) {
        for (const phase of parsed.phases) {
          lines.push(`- [${phase.status === 'completed' ? 'x' : ' '}] ${phase.name}: ${phase.details}`);
        }
      }
      if (parsed.remaining_steps && parsed.remaining_steps.length > 0) {
        lines.push('\n**Remaining:**');
        for (const step of parsed.remaining_steps) {
          lines.push(`- ${step}`);
        }
      }
      return lines.join('\n');
    } catch {
      return `### ${cp.title}\n\n${cp.content}`;
    }
  });

  return `## Active Plan\n\n${sections.join('\n\n')}`;
}

function renderCheckpoints(context: UniversalContext): string {
  // Non-plan checkpoints
  const nonPlan = context.activeCheckpoints.filter((cp) => {
    try {
      const parsed = JSON.parse(cp.content);
      return parsed.plan_name == null;
    } catch {
      return true;
    }
  });

  if (nonPlan.length === 0) {
    return '';
  }

  const lines = nonPlan.map((cp) => {
    try {
      const parsed = JSON.parse(cp.content);
      const summary = parsed.working_state ?? parsed.task_description ?? cp.title;
      return `- **${cp.title}**: ${summary}`;
    } catch {
      return `- **${cp.title}**: ${cp.content.slice(0, 200)}`;
    }
  });

  return `## Active Checkpoints\n\n${lines.join('\n')}`;
}

function renderAntiPatterns(context: UniversalContext): string {
  if (context.antiPatterns.length === 0) {
    return '';
  }
  const lines = context.antiPatterns.map(
    (ap) => `- **${ap.name}**: ${ap.description} (correct: ${ap.correct_approach})`,
  );
  return `## Anti-Patterns (Avoid)\n\n${lines.join('\n')}`;
}

function renderSkills(context: UniversalContext): string {
  if (context.skills.length === 0) {
    return '';
  }
  const lines = context.skills.map(
    (sk) => `- **${sk.name}** (confidence: ${sk.confidence.toFixed(2)}): ${sk.description}`,
  );
  return `## Available Skills\n\n${lines.join('\n')}`;
}

function renderLessons(context: UniversalContext): string {
  // Use warm memories of type 'lesson'
  const lessons = context.warmMemories.filter((m) => m.type === 'lesson');
  if (lessons.length === 0) {
    return '';
  }
  const lines = lessons.map((m) => {
    try {
      const parsed = JSON.parse(m.content);
      return `- **${m.title}**: ${parsed.corrected_approach ?? m.content.slice(0, 200)}`;
    } catch {
      return `- **${m.title}**: ${m.content.slice(0, 200)}`;
    }
  });
  return `## Recent Lessons\n\n${lines.join('\n')}`;
}

function renderHotMemories(context: UniversalContext): string {
  const entries = Object.entries(context.hotMemories);
  if (entries.length === 0) {
    return '';
  }
  const lines = entries.map(([key, value]) => `### ${key}\n\n${value}`);
  return `## Key Memories\n\n${lines.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Cognitive section renderers
// ---------------------------------------------------------------------------

/**
 * Cognitive enrichment payload injected into context assembly
 * when cognitive modules are available. All fields optional so
 * the adapter degrades gracefully without cognitive modules.
 */
export interface CognitiveEnrichment {
  reasoningScaffold?: string;
  rules?: RuleDefinition[];
  expert?: ExpertDefinition | null;
  capsule?: AssembledCapsule | null;
  cognitiveSkills?: ExecutableSkill[];
  contexts?: ContextEntry[];
  decisions?: string[];
  failurePatterns?: string[];
}

function renderDecisions(enrichment: CognitiveEnrichment): string {
  if (!enrichment.decisions || enrichment.decisions.length === 0) return '';
  const lines = enrichment.decisions.map(d => `- ${d}`);
  return `## Locked Decisions\n\n${lines.join('\n')}`;
}

function renderRules(enrichment: CognitiveEnrichment): string {
  if (!enrichment.rules || enrichment.rules.length === 0) return '';
  const lines = enrichment.rules.map(r =>
    `- **${r.name}** [${r.enforcement}]: ${r.description}`,
  );
  return `## Active Rules\n\n${lines.join('\n')}`;
}

function renderExpert(enrichment: CognitiveEnrichment): string {
  if (!enrichment.expert) return '';
  const e = enrichment.expert;
  const lines = [
    `**${e.display_name}** (${e.role})`,
    `Domain: ${e.domain}`,
    `Deliverables: ${e.deliverables.join(', ')}`,
  ];
  if (e.anti_patterns.length > 0) {
    lines.push(`Avoid: ${e.anti_patterns.slice(0, 3).join('; ')}`);
  }
  return `## Expert Agent\n\n${lines.join('\n')}`;
}

function renderCapsule(enrichment: CognitiveEnrichment): string {
  if (!enrichment.capsule) return '';
  const c = enrichment.capsule;
  const lines = [`**${c.definition.display_name}**: ${c.definition.description}`];
  if (c.components.intent) {
    lines.push(`\n### Intent\n${c.components.intent}`);
  }
  if (c.components.anti_patterns) {
    lines.push(`\n### Anti-Patterns\n${c.components.anti_patterns}`);
  }
  if (c.enrichments.synthesized_anti_patterns.length > 0) {
    lines.push(`\n### Learned Anti-Patterns\n${c.enrichments.synthesized_anti_patterns.map(a => `- ${a}`).join('\n')}`);
  }
  return `## Deep Capsule\n\n${lines.join('\n')}`;
}

function renderFailurePatterns(enrichment: CognitiveEnrichment): string {
  if (!enrichment.failurePatterns || enrichment.failurePatterns.length === 0) return '';
  const lines = enrichment.failurePatterns.map(f => `- ${f}`);
  return `## Failure Patterns\n\n${lines.join('\n')}`;
}

function renderCognitiveSkills(enrichment: CognitiveEnrichment): string {
  if (!enrichment.cognitiveSkills || enrichment.cognitiveSkills.length === 0) return '';
  const lines = enrichment.cognitiveSkills.map(s => `- **${s.name}**: ${s.description}`);
  return `## Cognitive Skills\n\n${lines.join('\n')}`;
}

function renderContextEntries(enrichment: CognitiveEnrichment): string {
  if (!enrichment.contexts || enrichment.contexts.length === 0) return '';
  const lines = enrichment.contexts.map(c => `### ${c.context_type}\n${c.content.slice(0, 500)}`);
  return `## Context\n\n${lines.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Budget-aware assembly
// ---------------------------------------------------------------------------

interface SectionDef {
  name: string;
  render: (ctx: UniversalContext) => string;
  /** Fraction of total budget to allocate (approximate). */
  budgetFraction: number;
}

/**
 * Legacy section priority — used when no cognitive enrichment is provided.
 * Preserved for backward compatibility with existing adapters.
 */
const SECTION_PRIORITY: SectionDef[] = [
  { name: 'persona', render: renderPersona, budgetFraction: 0.10 },
  { name: 'conventions', render: renderConventions, budgetFraction: 0.08 },
  { name: 'projectContext', render: renderProjectContext, budgetFraction: 0.07 },
  { name: 'activePlan', render: renderActivePlan, budgetFraction: 0.15 },
  { name: 'checkpoints', render: renderCheckpoints, budgetFraction: 0.10 },
  { name: 'antiPatterns', render: renderAntiPatterns, budgetFraction: 0.10 },
  { name: 'skills', render: renderSkills, budgetFraction: 0.15 },
  { name: 'hotMemories', render: renderHotMemories, budgetFraction: 0.10 },
  { name: 'lessons', render: renderLessons, budgetFraction: 0.15 },
];

/**
 * Assemble context into a markdown string within the given token budget.
 *
 * Each section is rendered, then compressed if needed. Sections are
 * assembled in priority order so higher-priority content gets full
 * space first, and lower-priority sections use whatever remains.
 */
export function assembleContext(
  context: UniversalContext,
  totalTokens: number,
): { content: string; tokensUsed: number; budget: TokenBudget } {
  let budget = createTokenBudget(totalTokens);
  const parts: string[] = [];

  for (const section of SECTION_PRIORITY) {
    if (budget.remaining <= 0) {
      break;
    }

    const raw = section.render(context);
    if (raw.length === 0) {
      continue;
    }

    // Calculate token allocation: proportional fraction but capped by remaining
    const sectionBudget = Math.min(
      Math.ceil(totalTokens * section.budgetFraction),
      budget.remaining,
    );

    const compressed = compressContent(raw, sectionBudget);
    const tokens = estimateTokens(compressed);
    budget = allocateTokens(budget, section.name, tokens);
    parts.push(compressed);
  }

  const content = parts.join('\n\n');
  const tokensUsed = estimateTokens(content);

  return { content, tokensUsed, budget };
}

/**
 * Enhanced context assembly with cognitive entities.
 *
 * Priority order (from INTELLIGENCE.md):
 * decisions → rules → expert → capsule → failure_patterns → memories → skills → contexts → anti_patterns
 *
 * Falls back to legacy assembleContext when no enrichment is provided.
 */
export function assembleEnhancedContext(
  context: UniversalContext,
  totalTokens: number,
  enrichment: CognitiveEnrichment,
): { content: string; tokensUsed: number; budget: TokenBudget } {
  // If no cognitive enrichment, fall back to legacy
  const hasEnrichment =
    enrichment.reasoningScaffold ||
    (enrichment.rules && enrichment.rules.length > 0) ||
    enrichment.expert ||
    enrichment.capsule ||
    (enrichment.cognitiveSkills && enrichment.cognitiveSkills.length > 0) ||
    (enrichment.contexts && enrichment.contexts.length > 0) ||
    (enrichment.decisions && enrichment.decisions.length > 0) ||
    (enrichment.failurePatterns && enrichment.failurePatterns.length > 0);

  if (!hasEnrichment) {
    return assembleContext(context, totalTokens);
  }

  // Cognitive-enhanced section priority
  interface EnrichedSectionDef {
    name: string;
    render: () => string;
    budgetFraction: number;
  }

  const sections: EnrichedSectionDef[] = [
    // Reasoning scaffold (always first — the cognitive reasoning framework)
    { name: 'reasoningScaffold', render: () => enrichment.reasoningScaffold ?? '', budgetFraction: 0.15 },
    // System identity
    { name: 'persona', render: () => renderPersona(context), budgetFraction: 0.05 },
    { name: 'conventions', render: () => renderConventions(context), budgetFraction: 0.03 },
    // Cognitive entities (new priority order)
    { name: 'decisions', render: () => renderDecisions(enrichment), budgetFraction: 0.05 },
    { name: 'rules', render: () => renderRules(enrichment), budgetFraction: 0.07 },
    { name: 'expert', render: () => renderExpert(enrichment), budgetFraction: 0.07 },
    { name: 'capsule', render: () => renderCapsule(enrichment), budgetFraction: 0.10 },
    { name: 'failurePatterns', render: () => renderFailurePatterns(enrichment), budgetFraction: 0.05 },
    // Memory and context
    { name: 'hotMemories', render: () => renderHotMemories(context), budgetFraction: 0.08 },
    { name: 'lessons', render: () => renderLessons(context), budgetFraction: 0.07 },
    { name: 'cognitiveSkills', render: () => renderCognitiveSkills(enrichment), budgetFraction: 0.08 },
    { name: 'contexts', render: () => renderContextEntries(enrichment), budgetFraction: 0.08 },
    // Legacy sections at lower priority
    { name: 'antiPatterns', render: () => renderAntiPatterns(context), budgetFraction: 0.05 },
    { name: 'activePlan', render: () => renderActivePlan(context), budgetFraction: 0.05 },
  ];

  let budget = createTokenBudget(totalTokens);
  const parts: string[] = [];

  for (const section of sections) {
    if (budget.remaining <= 0) break;

    const raw = section.render();
    if (raw.length === 0) continue;

    const sectionBudget = Math.min(
      Math.ceil(totalTokens * section.budgetFraction),
      budget.remaining,
    );

    const compressed = compressContent(raw, sectionBudget);
    const tokens = estimateTokens(compressed);
    budget = allocateTokens(budget, section.name, tokens);
    parts.push(compressed);
  }

  const content = parts.join('\n\n');
  const tokensUsed = estimateTokens(content);

  return { content, tokensUsed, budget };
}

// ---------------------------------------------------------------------------
// File write helper
// ---------------------------------------------------------------------------

/**
 * Build a FileWriteRequest with a managed section.
 */
export function buildFileWrite(
  path: string,
  content: string,
  adapterId: string,
  version: string,
  useManagedSection: boolean,
): FileWriteRequest {
  const finalContent = useManagedSection
    ? createManagedSection(content, adapterId, version)
    : content;

  return {
    path,
    content: finalContent,
    managedSection: useManagedSection,
    adapterId,
    hash: hashContent(content),
  };
}

/**
 * Build a SyncResult from assembled context.
 */
export function buildSyncResult(
  fileWrites: FileWriteRequest[],
  tokensUsed: number,
): SyncResult {
  return {
    fileWrites,
    apiPayloads: [],
    tokensUsed,
  };
}

// ---------------------------------------------------------------------------
// Learning extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract learnings from free-form text content.
 *
 * Looks for patterns like:
 * - "LESSON:" or "LEARNING:" prefixed lines
 * - "CORRECTION:" prefixed lines (user_correction pattern)
 * - "PREFERENCE:" prefixed lines
 *
 * This is a best-effort extraction; individual adapters can override
 * with tool-specific parsing.
 */
export function extractLearningsFromText(
  content: string,
  source: string,
): ExtractedLearnings {
  const learnings: ExtractedLearnings['learnings'] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^LESSON:\s*/i.test(trimmed)) {
      learnings.push({
        content: trimmed.replace(/^LESSON:\s*/i, ''),
        category: 'lesson' as MemoryType,
        source,
        confidence: 0.7,
      });
    } else if (/^LEARNING:\s*/i.test(trimmed)) {
      learnings.push({
        content: trimmed.replace(/^LEARNING:\s*/i, ''),
        category: 'lesson' as MemoryType,
        source,
        confidence: 0.7,
      });
    } else if (/^CORRECTION:\s*/i.test(trimmed)) {
      learnings.push({
        content: trimmed.replace(/^CORRECTION:\s*/i, ''),
        category: 'lesson' as MemoryType,
        source,
        confidence: 0.8,
      });
    } else if (/^PREFERENCE:\s*/i.test(trimmed)) {
      learnings.push({
        content: trimmed.replace(/^PREFERENCE:\s*/i, ''),
        category: 'preference' as MemoryType,
        source,
        confidence: 0.8,
      });
    } else if (/^DECISION:\s*/i.test(trimmed)) {
      learnings.push({
        content: trimmed.replace(/^DECISION:\s*/i, ''),
        category: 'decision' as MemoryType,
        source,
        confidence: 0.8,
      });
    }
  }

  return { learnings };
}

// ---------------------------------------------------------------------------
// Verification helper
// ---------------------------------------------------------------------------

/**
 * Verify content hash for managed section integrity.
 */
export function verifyContentHash(content: string, expectedHash: string): VerifyResult {
  const actualHash = hashContent(content);
  const valid = actualHash === expectedHash;

  return {
    valid,
    expectedHash,
    actualHash,
    modified: !valid,
  };
}
