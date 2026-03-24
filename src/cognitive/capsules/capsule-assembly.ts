/**
 * Capsule Assembly — Enriches capsule components with memory-informed context.
 *
 * Assembly process:
 * 1. Load all components for the matched capsule
 * 2. Enrich examples with relevant memories
 * 3. Merge anti-patterns with learned failure patterns
 * 4. Enrich critic with past findings from cognitive outcomes
 * 5. Apply user preferences from context state
 *
 * Formatting priority for token-constrained output:
 * intent > anti_patterns > critic > assembly > examples > grader > memory_policy
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  DeepCapsuleDefinition,
  CapsuleComponentType,
  AssembledCapsule,
} from '../types.js';
import type { Memory } from '../../types.js';
import { getComponents } from './capsule-store.js';
import {
  CAPSULE_MAX_MEMORY_EXAMPLES,
  CAPSULE_MAX_PAST_FINDINGS,
} from '../../constants.js';

// ---------------------------------------------------------------------------
// Component formatting priority (highest first)
// ---------------------------------------------------------------------------

const COMPONENT_PRIORITY: CapsuleComponentType[] = [
  'intent',
  'anti_patterns',
  'critic',
  'assembly',
  'examples',
  'grader',
  'memory_policy',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble a capsule by loading its components and enriching them
 * with memory-derived context.
 *
 * @param db - Database connection
 * @param capsule - The matched capsule definition
 * @param memories - Relevant memories retrieved for the current task
 * @param userPreferences - User preference strings from context state
 */
export function assembleCapsule(
  db: DatabaseConnection,
  capsule: DeepCapsuleDefinition,
  memories: Memory[],
  userPreferences: string[],
): AssembledCapsule {
  // 1. Load all components
  const rawComponents = getComponents(db, capsule.id);
  const componentMap: Partial<Record<CapsuleComponentType, string>> = {};
  for (const comp of rawComponents) {
    componentMap[comp.component_type] = comp.content;
  }

  // 2. Enrich examples with relevant memories
  const memoryExamples = selectMemoryExamples(memories, CAPSULE_MAX_MEMORY_EXAMPLES);

  // 3. Synthesize anti-patterns from memory failures
  const synthesizedAntiPatterns = synthesizeAntiPatterns(db, capsule.id, memories);

  // 4. Enrich critic with past cognitive outcome findings
  const pastFindings = loadPastFindings(db, capsule.id, CAPSULE_MAX_PAST_FINDINGS);

  return {
    definition: capsule,
    components: componentMap,
    enrichments: {
      memory_examples: memoryExamples,
      synthesized_anti_patterns: synthesizedAntiPatterns,
      past_critic_findings: pastFindings,
      user_preferences: userPreferences,
    },
  };
}

/**
 * Format an assembled capsule as markdown for prompt injection.
 *
 * Respects token budget by iterating components in priority order
 * and stopping when budget is exhausted.
 */
export function formatAssembledCapsule(
  assembled: AssembledCapsule,
  tokenBudget: number,
): string {
  const sections: string[] = [];
  let usedChars = 0;
  const charBudget = tokenBudget * 4; // 1 token ~ 4 chars

  // Header
  const header = `## Capsule: ${assembled.definition.display_name}\n${assembled.definition.description}`;
  usedChars += header.length;
  sections.push(header);

  // Components in priority order
  for (const type of COMPONENT_PRIORITY) {
    const content = assembled.components[type];
    if (!content) continue;

    const section = `### ${formatComponentLabel(type)}\n${content}`;
    if (usedChars + section.length > charBudget) {
      // Try to fit a truncated version
      const remaining = charBudget - usedChars - 30; // room for label + truncation
      if (remaining > 100) {
        sections.push(`### ${formatComponentLabel(type)}\n${content.slice(0, remaining)}\n[truncated]`);
      }
      break;
    }

    sections.push(section);
    usedChars += section.length;
  }

  // Enrichments (appended if space remains)
  if (usedChars < charBudget) {
    const enrichmentSection = formatEnrichments(assembled, charBudget - usedChars);
    if (enrichmentSection) {
      sections.push(enrichmentSection);
    }
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function selectMemoryExamples(memories: Memory[], max: number): Memory[] {
  // Prefer memories with higher confidence and success outcomes
  const sorted = [...memories].sort((a, b) => {
    // Success outcomes first
    const outcomeRank = (m: Memory) => {
      if (m.outcome === 'success') return 3;
      if (m.outcome === 'partial_success') return 2;
      if (m.outcome === 'failed_then_fixed') return 1;
      return 0;
    };
    const rankDiff = outcomeRank(b) - outcomeRank(a);
    if (rankDiff !== 0) return rankDiff;
    return b.confidence - a.confidence;
  });

  return sorted.slice(0, max);
}

function synthesizeAntiPatterns(
  db: DatabaseConnection,
  capsuleId: string,
  memories: Memory[],
): string[] {
  const patterns: string[] = [];

  // Extract failure patterns from memories
  for (const mem of memories) {
    if (mem.outcome === 'failed' || mem.outcome === 'failed_then_fixed') {
      // Extract the lesson from the failure
      const lesson = mem.title || mem.content.slice(0, 100);
      patterns.push(`Learned from failure: ${lesson}`);
    }
  }

  // Load failure outcomes from cognitive_outcomes for this capsule
  const failureRows = db.prepare<[string, string], { task_description: string; evidence: string | null }>(`
    SELECT task_description, evidence FROM cognitive_outcomes
    WHERE entity_type = ? AND entity_id = ? AND outcome = 'failure'
    ORDER BY created_at DESC LIMIT 5
  `).all('capsule', capsuleId);

  for (const row of failureRows) {
    const desc = row.evidence || row.task_description;
    patterns.push(`Past failure: ${desc.slice(0, 150)}`);
  }

  return patterns;
}

function loadPastFindings(
  db: DatabaseConnection,
  capsuleId: string,
  max: number,
): string[] {
  const rows = db.prepare<[string, string, number], { task_description: string; outcome: string; evidence: string | null }>(`
    SELECT task_description, outcome, evidence FROM cognitive_outcomes
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all('capsule', capsuleId, max);

  return rows.map(r => {
    const status = r.outcome === 'success' ? 'passed' : r.outcome === 'partial' ? 'partial' : 'failed';
    const detail = r.evidence || r.task_description;
    return `[${status}] ${detail.slice(0, 200)}`;
  });
}

function formatComponentLabel(type: CapsuleComponentType): string {
  const labels: Record<CapsuleComponentType, string> = {
    intent: 'Intent',
    assembly: 'Assembly Instructions',
    examples: 'Examples',
    anti_patterns: 'Anti-Patterns',
    critic: 'Critic Dimensions',
    grader: 'Grading Criteria',
    memory_policy: 'Memory Policy',
  };
  return labels[type];
}

function formatEnrichments(
  assembled: AssembledCapsule,
  charBudget: number,
): string | null {
  const parts: string[] = [];

  if (assembled.enrichments.synthesized_anti_patterns.length > 0) {
    parts.push('### Learned Anti-Patterns');
    for (const ap of assembled.enrichments.synthesized_anti_patterns) {
      parts.push(`- ${ap}`);
    }
  }

  if (assembled.enrichments.past_critic_findings.length > 0) {
    parts.push('### Past Findings');
    for (const f of assembled.enrichments.past_critic_findings) {
      parts.push(`- ${f}`);
    }
  }

  if (assembled.enrichments.user_preferences.length > 0) {
    parts.push('### User Preferences');
    for (const p of assembled.enrichments.user_preferences) {
      parts.push(`- ${p}`);
    }
  }

  if (assembled.enrichments.memory_examples.length > 0) {
    parts.push('### Relevant Memory Examples');
    for (const mem of assembled.enrichments.memory_examples) {
      parts.push(`- **${mem.title}** (${mem.outcome ?? 'no outcome'}): ${mem.content.slice(0, 100)}`);
    }
  }

  if (parts.length === 0) return null;

  const result = parts.join('\n');
  if (result.length > charBudget) {
    return result.slice(0, charBudget - 15) + '\n[truncated]';
  }
  return result;
}
