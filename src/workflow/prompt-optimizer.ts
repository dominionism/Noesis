/**
 * Prompt Optimization
 *
 * Extracts structured GOAL/CONTEXT/CONSTRAINTS/DELIVERABLE/VALIDATION
 * from vague user requests. Enhanced for Noesis: retrieves relevant
 * memories to automatically enrich the CONTEXT field.
 *
 * This transforms ambiguous instructions into actionable, structured
 * prompts that agents can execute with precision.
 */

import type { PromptShape, RecallResult } from '../types.js';

/**
 * Minimal capsule shape needed by enrichWithCapsule.
 * The full capsule-router has been removed in favor of the cognitive layer's
 * capsule-engine. This interface is kept for prompt-optimizer compatibility.
 */
export interface CapsuleDefinition {
  displayName: string;
  description: string;
  antiPatterns: string[];
  criticRules: string[];
}

/**
 * Raw user input to be optimized into a structured prompt.
 */
export interface PromptInput {
  /** The user's raw request text */
  rawPrompt: string;
  /** Optional project context */
  projectId?: string;
}

/**
 * Extract a structured prompt shape from raw user input.
 *
 * Uses heuristic analysis to identify goal, constraints, deliverables,
 * and validation criteria from natural language. Falls back to the raw
 * prompt as the goal when structure cannot be detected.
 */
export function extractPromptShape(input: PromptInput): PromptShape {
  const text = input.rawPrompt.trim();
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let goal = text;
  let context = '';
  const constraints: string[] = [];
  let deliverable = '';
  const validation: string[] = [];

  // Heuristic extraction from multi-line input
  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith('goal:') || lower.startsWith('objective:')) {
      goal = line.replace(/^(goal|objective):\s*/i, '');
    } else if (lower.startsWith('context:') || lower.startsWith('background:')) {
      context = line.replace(/^(context|background):\s*/i, '');
    } else if (lower.startsWith('constraint:') || lower.startsWith('requirement:')) {
      constraints.push(line.replace(/^(constraint|requirement):\s*/i, ''));
    } else if (lower.startsWith('deliverable:') || lower.startsWith('output:')) {
      deliverable = line.replace(/^(deliverable|output):\s*/i, '');
    } else if (lower.startsWith('validation:') || lower.startsWith('test:') || lower.startsWith('verify:')) {
      validation.push(line.replace(/^(validation|test|verify):\s*/i, ''));
    } else if (lower.includes('must ') || lower.includes('should ') || lower.includes('cannot ')) {
      constraints.push(line);
    }
  }

  // If no explicit deliverable found, derive from goal
  if (!deliverable && goal) {
    deliverable = goal.length > 100 ? goal.slice(0, 100) + '...' : goal;
  }

  return {
    goal,
    context,
    constraints,
    deliverable,
    validation,
  };
}

/**
 * Enrich a prompt shape with memory-retrieved context.
 *
 * Takes relevant retrieval results and adds them to the prompt's
 * context field so the agent starts with historical knowledge.
 */
export function enrichWithMemories(
  shape: PromptShape,
  recallResult: RecallResult,
): PromptShape {
  if (recallResult.memories.length === 0) {
    return shape;
  }

  const memoryContext: string[] = [];

  // Include top skills
  const skills = recallResult.memories.filter((m) => m.type === 'skill');
  if (skills.length > 0) {
    memoryContext.push('Relevant skills: ' + skills.map((s) => s.title).join(', '));
  }

  // Include relevant lessons
  const lessons = recallResult.memories.filter((m) => m.type === 'lesson');
  if (lessons.length > 0) {
    memoryContext.push('Past lessons: ' + lessons.map((l) => l.title).join(', '));
  }

  // Include relevant decisions
  const decisions = recallResult.memories.filter((m) => m.type === 'decision');
  if (decisions.length > 0) {
    memoryContext.push('Prior decisions: ' + decisions.map((d) => d.title).join(', '));
  }

  // Include incident warnings
  const incidents = recallResult.memories.filter((m) => m.type === 'incident');
  if (incidents.length > 0) {
    memoryContext.push('Past incidents: ' + incidents.map((i) => i.title).join(', '));
  }

  // Surface conflicts
  if (recallResult.conflicts.length > 0) {
    memoryContext.push(
      `Note: ${recallResult.conflicts.length} unresolved knowledge conflict(s) detected.`,
    );
  }

  const enrichedContext = memoryContext.join('\n');

  return {
    ...shape,
    enriched_context: enrichedContext,
    context: shape.context
      ? `${shape.context}\n\n--- Retrieved Context ---\n${enrichedContext}`
      : enrichedContext,
  };
}

/**
 * Enrich a prompt shape with capsule-specific constraints and context.
 *
 * Merges the capsule's anti-patterns as constraints and adds capsule
 * description to the context field. This gives the agent domain-specific
 * guardrails before execution begins.
 */
export function enrichWithCapsule(
  shape: PromptShape,
  capsule: CapsuleDefinition,
): PromptShape {
  // Add capsule anti-patterns as constraints
  const capsuleConstraints = capsule.antiPatterns.map(
    (ap) => `Avoid: ${ap}`,
  );

  // Build capsule context section
  const capsuleContext = [
    `Capsule: ${capsule.displayName}`,
    `Domain: ${capsule.description}`,
    capsule.criticRules.length > 0
      ? `Critic rules: ${capsule.criticRules.join('; ')}`
      : '',
  ]
    .filter((s) => s.length > 0)
    .join('\n');

  return {
    ...shape,
    constraints: [...shape.constraints, ...capsuleConstraints],
    context: shape.context
      ? `${shape.context}\n\n--- Capsule Context ---\n${capsuleContext}`
      : capsuleContext,
  };
}
