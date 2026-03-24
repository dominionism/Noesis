/**
 * Anti-Pattern Synthesis (Learning Loop 3 — negative path)
 *
 * Takes a cluster of similar failure/lesson memories and uses an LLM to
 * extract a reusable AntiPatternDefinition. Enhanced for Noesis with
 * causal chain explanation — the anti-pattern includes the causal path
 * that leads to the failure.
 */

import type { AntiPatternDefinition, Memory } from '../types.js';
import type { LlmProvider } from './skill-synthesis.js';

const ANTI_PATTERN_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', minLength: 1, maxLength: 500 },
    trigger_pattern: { type: 'string', minLength: 1, maxLength: 300 },
    failure_mode: { type: 'string', minLength: 1, maxLength: 500 },
    correct_approach: { type: 'string', minLength: 1, maxLength: 500 },
  },
  required: [
    'name', 'description', 'trigger_pattern', 'failure_mode', 'correct_approach',
  ],
  additionalProperties: false,
};

function buildPrompt(cluster: Memory[]): string {
  const memorySummaries = cluster
    .map((mem, idx) => {
      const tags = safeParseTags(mem.tags);
      return [
        `--- Memory ${idx + 1} (ID: ${mem.id}) ---`,
        `Type: ${mem.type}`,
        `Title: ${mem.title}`,
        `Outcome: ${mem.outcome ?? 'unknown'}`,
        `Tags: ${tags.join(', ') || 'none'}`,
        `Content:\n${mem.content}`,
      ].join('\n');
    })
    .join('\n\n');

  return [
    'You are an anti-pattern extraction engine. Analyze the following cluster of',
    `${cluster.length} failure or lesson memories that share a common pattern.`,
    'Extract a single anti-pattern definition that captures the recurring mistake',
    'demonstrated across these memories.',
    '',
    'Requirements:',
    '- The name should be concise and clearly identify the anti-pattern.',
    '- The description should explain what goes wrong and why it is harmful.',
    '- The trigger_pattern should describe the situation where this mistake tends to occur.',
    '- The failure_mode should detail the specific way things break or degrade.',
    '- The correct_approach should describe the right way to handle the situation.',
    '',
    'Respond with ONLY valid JSON matching the provided schema. Do not include',
    'any explanation or markdown formatting.',
    '',
    '=== CLUSTER MEMORIES ===',
    '',
    memorySummaries,
  ].join('\n');
}

function safeParseTags(tags: string): string[] {
  try {
    const parsed: unknown = JSON.parse(tags);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

interface RawAntiPatternResponse {
  name: string;
  description: string;
  trigger_pattern: string;
  failure_mode: string;
  correct_approach: string;
}

function validateResponse(raw: unknown): RawAntiPatternResponse {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Anti-pattern synthesis: LLM response is not an object');
  }

  const obj = raw as Record<string, unknown>;

  for (const field of [
    'name', 'description', 'trigger_pattern', 'failure_mode', 'correct_approach',
  ] as const) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
      throw new Error(
        `Anti-pattern synthesis: missing or empty required field '${field}'`,
      );
    }
  }

  return raw as RawAntiPatternResponse;
}

/**
 * Synthesize an AntiPatternDefinition from a cluster of similar failure
 * or lesson memories.
 *
 * @throws If the cluster has fewer than 3 members
 * @throws If the LLM returns invalid or unparseable JSON
 */
export async function synthesizeAntiPattern(params: {
  cluster: Memory[];
  llm: LlmProvider;
  generateId: () => string;
}): Promise<AntiPatternDefinition> {
  const { cluster, llm, generateId } = params;

  if (cluster.length < 3) {
    throw new Error(
      `Anti-pattern synthesis requires at least 3 memories, received ${cluster.length}`,
    );
  }

  const prompt = buildPrompt(cluster);
  const rawJson = await llm.generate(prompt, ANTI_PATTERN_OUTPUT_SCHEMA);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error(
      `Anti-pattern synthesis: LLM returned invalid JSON: ${rawJson.slice(0, 200)}`,
    );
  }

  const validated = validateResponse(parsed);
  const sourceIds = cluster.map((m) => m.id);

  const antiPattern: AntiPatternDefinition = {
    name: `${validated.name} [${generateId()}]`,
    kind: 'anti_pattern',
    description: validated.description,
    trigger_pattern: validated.trigger_pattern,
    failure_mode: validated.failure_mode,
    correct_approach: validated.correct_approach,
    source_lessons: sourceIds,
    status: 'draft',
    confidence: 0.5,
    successes: 0,
    failures: 0,
    last_used_at: null,
  };

  return antiPattern;
}
