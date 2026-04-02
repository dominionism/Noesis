/**
 * Prompt Assembler — Renders cognitive entities into structured markdown.
 *
 * Assembly order is non-negotiable:
 * 1. Cognitive Reasoning Framework (reasoning scaffold)
 * 2. Locked Decisions
 * 3. Active Rules (with "why")
 * 4. Expert Guidance
 * 5. Task Class (Capsule)
 * 6. Failure Predictions
 * 7. Relevant Memories
 * 8. Active Context
 * 9. Available Skills
 * 10. Prompt Shape (the actual task)
 *
 * Token budget enforcement uses PROMPT_ASSEMBLY_ORDER to determine
 * what to truncate when budget is exceeded.
 */

import type { PromptAssembly } from '../types.js';
import type { RuleDefinition, ExpertDefinition, ExecutableSkill, ContextEntry } from '../types.js';
import type { AssembledCapsule } from '../types.js';
import type { Memory, PromptShape } from '../../types.js';
import { PROMPT_ASSEMBLY_ORDER } from '../../constants.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble a full prompt from a PromptAssembly. No token enforcement —
 * returns the complete rendered prompt.
 */
export function assemblePrompt(assembly: PromptAssembly): string {
  const sections: string[] = [];

  // 1. Reasoning scaffold (always first)
  if (assembly.reasoning_scaffold) {
    sections.push(assembly.reasoning_scaffold);
  }

  // 2. Locked decisions (from contexts)
  const decisionsCtx = assembly.contexts.find(c => c.context_type === 'decisions');
  if (decisionsCtx) {
    sections.push(`## Locked Decisions\n${decisionsCtx.content}`);
  }

  // 3. Active rules
  if (assembly.rules.length > 0) {
    sections.push(formatRulesSection(assembly.rules));
  }

  // 4. Expert guidance
  if (assembly.expert) {
    sections.push(formatExpertSection(assembly.expert));
  }

  // 5. Task class (capsule)
  if (assembly.capsule) {
    sections.push(formatCapsuleSection(assembly.capsule));
  }

  // 6. Failure predictions (from failure_patterns context)
  const failureCtx = assembly.contexts.find(c => c.context_type === 'failure_patterns');
  if (failureCtx) {
    sections.push(`## Failure Predictions\n${failureCtx.content}`);
  }

  // 7. Relevant memories
  if (assembly.memories.length > 0) {
    sections.push(formatMemoriesSection(assembly.memories));
  }

  // 8. Active context (non-decisions, non-failure_patterns)
  const otherContexts = assembly.contexts.filter(
    c => c.context_type !== 'decisions' && c.context_type !== 'failure_patterns',
  );
  if (otherContexts.length > 0) {
    sections.push(formatContextSection(otherContexts));
  }

  // 9. Available skills
  if (assembly.skills.length > 0) {
    sections.push(formatSkillsSection(assembly.skills));
  }

  // 10. Prompt shape (always last)
  sections.push(formatPromptShape(assembly.prompt_shape));

  return sections.join('\n\n');
}

/**
 * Assemble with strict token budget enforcement.
 *
 * Uses PROMPT_ASSEMBLY_ORDER to determine truncation priority.
 * Lower-priority sections are removed first when budget is exceeded.
 */
export function assembleWithBudget(
  assembly: PromptAssembly,
  tokenBudget: number,
): { prompt: string; truncated: string[]; tokenCount: number } {
  const charBudget = tokenBudget * 4;
  const truncated: string[] = [];

  // Build sections in order with their labels
  const sectionMap = buildSectionMap(assembly);

  // Start with reasoning scaffold and prompt shape (always included)
  let usedChars = 0;
  const includedSections: string[] = [];

  // Reasoning scaffold is always included (position 0, before assembly order)
  if (assembly.reasoning_scaffold) {
    usedChars += assembly.reasoning_scaffold.length;
    includedSections.push(assembly.reasoning_scaffold);
  }

  // Prompt shape is always included (last position)
  const promptShapeStr = formatPromptShape(assembly.prompt_shape);
  const promptShapeChars = promptShapeStr.length;
  const availableForMiddle = charBudget - usedChars - promptShapeChars;

  // Add sections in priority order within remaining budget
  let middleUsed = 0;
  for (const key of PROMPT_ASSEMBLY_ORDER) {
    const section = sectionMap.get(key);
    if (!section) continue;

    if (middleUsed + section.length <= availableForMiddle) {
      includedSections.push(section);
      middleUsed += section.length;
    } else {
      // Try to fit truncated version
      const remaining = availableForMiddle - middleUsed;
      if (remaining > 100) {
        includedSections.push(section.slice(0, remaining - 15) + '\n[truncated]');
        middleUsed += remaining;
        truncated.push(key + ' (partial)');
      } else {
        truncated.push(key);
      }
    }
  }

  // Append prompt shape at the end
  includedSections.push(promptShapeStr);

  const prompt = includedSections.join('\n\n');
  const tokenCount = Math.ceil(prompt.length / 4);

  return { prompt, truncated, tokenCount };
}

/**
 * Estimate the token count for a prompt assembly without rendering.
 */
export function estimateAssemblyTokens(assembly: PromptAssembly): number {
  let chars = 0;

  if (assembly.reasoning_scaffold) chars += assembly.reasoning_scaffold.length;

  for (const rule of assembly.rules) {
    chars += rule.content.length + rule.name.length + 50; // overhead
  }

  if (assembly.expert) {
    chars += assembly.expert.content.length + 200; // overhead
  }

  if (assembly.capsule) {
    for (const content of Object.values(assembly.capsule.components)) {
      if (content) chars += content.length;
    }
    chars += 200; // overhead
  }

  for (const mem of assembly.memories) {
    chars += mem.content.length + mem.title.length + 50;
  }

  for (const ctx of assembly.contexts) {
    chars += ctx.content.length + 50;
  }

  for (const skill of assembly.skills) {
    chars += skill.content.length + skill.description.length + 50;
  }

  chars += assembly.prompt_shape.goal.length +
    assembly.prompt_shape.context.length +
    assembly.prompt_shape.deliverable.length +
    assembly.prompt_shape.constraints.join('').length +
    assembly.prompt_shape.validation.join('').length + 200;

  return Math.ceil(chars / 4);
}

// ---------------------------------------------------------------------------
// Internal section formatters
// ---------------------------------------------------------------------------

function buildSectionMap(assembly: PromptAssembly): Map<string, string> {
  const map = new Map<string, string>();

  // Decisions context
  const decisionsCtx = assembly.contexts.find(c => c.context_type === 'decisions');
  if (decisionsCtx) {
    map.set('decisions', `## Locked Decisions\n${decisionsCtx.content}`);
  }

  // Rules
  if (assembly.rules.length > 0) {
    map.set('rules', formatRulesSection(assembly.rules));
  }

  // Expert
  if (assembly.expert) {
    map.set('expert', formatExpertSection(assembly.expert));
  }

  // Capsule
  if (assembly.capsule) {
    map.set('capsule', formatCapsuleSection(assembly.capsule));
  }

  // Failure predictions
  const failureCtx = assembly.contexts.find(c => c.context_type === 'failure_patterns');
  if (failureCtx) {
    map.set('failure_predictions', `## Failure Predictions\n${failureCtx.content}`);
  }

  // Memories
  if (assembly.memories.length > 0) {
    map.set('memories', formatMemoriesSection(assembly.memories));
  }

  // Other contexts
  const otherContexts = assembly.contexts.filter(
    c => c.context_type !== 'decisions' && c.context_type !== 'failure_patterns',
  );
  if (otherContexts.length > 0) {
    map.set('contexts', formatContextSection(otherContexts));
  }

  // Skills
  if (assembly.skills.length > 0) {
    map.set('skills', formatSkillsSection(assembly.skills));
  }

  return map;
}

function formatRulesSection(rules: RuleDefinition[]): string {
  const lines: string[] = ['## Active Rules'];

  // Sort by enforcement (hard first) then confidence
  const sorted = [...rules].sort((a, b) => {
    const enfOrder = { hard: 0, soft: 1, advisory: 2 };
    const enfDiff = (enfOrder[a.enforcement] ?? 2) - (enfOrder[b.enforcement] ?? 2);
    if (enfDiff !== 0) return enfDiff;
    return b.confidence - a.confidence;
  });

  for (const rule of sorted) {
    lines.push(`### ${rule.name} [${rule.enforcement}] (${(rule.confidence * 100).toFixed(0)}%)`);
    lines.push(rule.description);
    if (rule.constraints.length > 0) {
      for (const c of rule.constraints) {
        lines.push(`- [${c.severity}] ${c.requirement}`);
      }
    }
  }

  return lines.join('\n');
}

function formatExpertSection(expert: ExpertDefinition): string {
  const lines: string[] = [
    `## Expert Guidance: ${expert.display_name}`,
    `**Role:** ${expert.role}`,
    `**Domain:** ${expert.domain}`,
  ];

  if (expert.tools.length > 0) {
    lines.push(`**Tools:** ${expert.tools.join(', ')}`);
  }

  if (expert.scope.can.length > 0) {
    lines.push('**Can:**');
    for (const item of expert.scope.can) lines.push(`- ${item}`);
  }

  if (expert.scope.cannot.length > 0) {
    lines.push('**Cannot:**');
    for (const item of expert.scope.cannot) lines.push(`- ${item}`);
  }

  if (expert.deliverables.length > 0) {
    lines.push('**Deliverables:**');
    for (const d of expert.deliverables) lines.push(`- ${d}`);
  }

  if (expert.anti_patterns.length > 0) {
    lines.push('**Anti-patterns:**');
    for (const ap of expert.anti_patterns) lines.push(`- ${ap}`);
  }

  if (expert.grading_criteria.length > 0) {
    lines.push('**Grading:**');
    for (const gc of expert.grading_criteria) {
      lines.push(`- ${gc.dimension} (${(gc.weight * 100).toFixed(0)}%): ${gc.description}`);
    }
  }

  // Full expert content — persona, workflow, principles, patterns
  if (expert.content && expert.content.length > 0) {
    lines.push('');
    lines.push(expert.content);
  }

  return lines.join('\n');
}

function formatCapsuleSection(capsule: AssembledCapsule): string {
  const lines: string[] = [
    `## Task Class: ${capsule.definition.display_name}`,
    capsule.definition.description,
  ];

  // Components in priority order
  const priorityOrder = ['intent', 'anti_patterns', 'critic', 'assembly', 'examples', 'grader', 'memory_policy'] as const;
  for (const type of priorityOrder) {
    const content = capsule.components[type];
    if (content) {
      const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      lines.push(`### ${label}`);
      lines.push(content);
    }
  }

  return lines.join('\n');
}

function formatMemoriesSection(memories: Memory[]): string {
  const lines: string[] = ['## Relevant Memories'];

  for (const mem of memories) {
    const outcome = mem.outcome ? ` [${mem.outcome}]` : '';
    const confidence = ` (${(mem.confidence * 100).toFixed(0)}% confidence)`;
    lines.push(`- **${mem.title}**${outcome}${confidence}`);
    lines.push(`  ${mem.content.slice(0, 200)}${mem.content.length > 200 ? '...' : ''}`);
  }

  return lines.join('\n');
}

function formatContextSection(contexts: ContextEntry[]): string {
  const lines: string[] = ['## Active Context'];

  for (const ctx of contexts) {
    const label = ctx.context_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    lines.push(`### ${label} (v${ctx.version})`);
    lines.push(ctx.content);
  }

  return lines.join('\n');
}

function formatSkillsSection(skills: ExecutableSkill[]): string {
  const lines: string[] = ['## Available Skills'];

  for (const skill of skills) {
    lines.push(`### ${skill.name} (${skill.category})`);
    lines.push(skill.description);

    if (skill.rules.length > 0) {
      lines.push('**Rules:**');
      for (const r of skill.rules) lines.push(`- ${r}`);
    }

    if (skill.anti_patterns.length > 0) {
      lines.push('**Anti-patterns:**');
      for (const ap of skill.anti_patterns) lines.push(`- ${ap}`);
    }

    if (skill.chain_with.length > 0) {
      lines.push(`**Chains with:** ${skill.chain_with.join(', ')}`);
    }

    // Full skill content — process, workflow, patterns, examples
    if (skill.content && skill.content.length > 0) {
      lines.push('');
      lines.push(skill.content);
    }
  }

  return lines.join('\n');
}

function formatPromptShape(shape: PromptShape): string {
  const lines: string[] = [
    '## Task',
    `**GOAL:** ${shape.goal}`,
    `**CONTEXT:** ${shape.context}`,
  ];

  if (shape.constraints.length > 0) {
    lines.push('**CONSTRAINTS:**');
    for (const c of shape.constraints) lines.push(`- ${c}`);
  }

  lines.push(`**DELIVERABLE:** ${shape.deliverable}`);

  if (shape.validation.length > 0) {
    lines.push('**VALIDATION:**');
    for (const v of shape.validation) lines.push(`- ${v}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Preventive learning injection
// ---------------------------------------------------------------------------

/**
 * Inject top preventive lessons into the prompt assembly.
 * Only includes high-confidence, task-matched prevention guidance.
 * Maximum 3 lessons, each under 200 tokens, to avoid context bloat.
 */
export function injectPreventiveLessons(
  sections: Array<{ label: string; content: string; priority: number }>,
  lessons: Array<{
    trigger: string;
    wrong_pattern: string;
    corrected_pattern: string;
    confidence: number;
    failure_class: string;
  }>,
  maxLessons: number = 3,
  minConfidence: number = 0.6,
): Array<{ label: string; content: string; priority: number }> {
  const filtered = lessons
    .filter(l => l.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxLessons);

  if (filtered.length === 0) return sections;

  const lessonContent = filtered.map((l, i) =>
    `${i + 1}. [${l.failure_class}] When: ${l.trigger}\n   Avoid: ${l.wrong_pattern}\n   Instead: ${l.corrected_pattern} (confidence: ${(l.confidence * 100).toFixed(0)}%)`
  ).join('\n');

  const preventionSection = {
    label: 'preventive_lessons',
    content: `## Preventive Lessons (from verified past failures)\n\n${lessonContent}`,
    priority: 85, // High priority — between rules and expert context
  };

  return [...sections, preventionSection].sort((a, b) => b.priority - a.priority);
}
