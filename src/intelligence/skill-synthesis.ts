/**
 * Skill Synthesis (Learning Loop 3 — positive path)
 *
 * Takes a cluster of 3+ similar successful memories and uses an LLM to
 * extract a reusable SkillDefinition. The synthesized skill starts in
 * 'draft' status with confidence 0.5 and must be promoted through the
 * feedback loop before reaching 'active'.
 *
 * Enhanced for Noesis: skill versions are tracked in the skill_versions
 * table, enabling evolution of skills over time as new evidence accumulates.
 */

import type { SkillDefinition, Memory } from '../types.js';

// ---------------------------------------------------------------------------
// LLM provider interface (injected dependency)
// ---------------------------------------------------------------------------

export interface LlmProvider {
  generate(prompt: string, schema: Record<string, unknown>): Promise<string>;
}

// ---------------------------------------------------------------------------
// JSON schema for structured LLM output
// ---------------------------------------------------------------------------

const SKILL_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', minLength: 1, maxLength: 500 },
    trigger_pattern: { type: 'string', minLength: 1, maxLength: 300 },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          command: { type: 'string' },
          conditions: { type: 'string' },
        },
        required: ['description'],
        additionalProperties: false,
      },
      minItems: 1,
    },
    prerequisites: { type: 'array', items: { type: 'string' } },
    anti_patterns: { type: 'array', items: { type: 'string' } },
    validation_criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          check: { type: 'string' },
          method: { type: 'string' },
        },
        required: ['check', 'method'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'name', 'description', 'trigger_pattern', 'steps',
    'prerequisites', 'anti_patterns', 'validation_criteria',
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
    'You are a skill extraction engine. Analyze the following cluster of',
    `${cluster.length} successful task memories that share a common pattern.`,
    'Extract a single reusable skill definition that captures the technique',
    'demonstrated across these memories.',
    '',
    'Requirements:',
    '- The skill name should be concise and descriptive.',
    '- The description should explain when and why to use this skill.',
    '- The trigger_pattern should describe the situation that calls for this skill.',
    '- Steps should be concrete and actionable.',
    '- Prerequisites list anything needed before applying the skill.',
    '- Anti-patterns list common mistakes to avoid.',
    '- Validation criteria describe how to verify the skill was applied correctly.',
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

interface RawSkillResponse {
  name: string;
  description: string;
  trigger_pattern: string;
  steps: Array<{ description: string; command?: string; conditions?: string }>;
  prerequisites: string[];
  anti_patterns: string[];
  validation_criteria: Array<{ check: string; method: string }>;
}

function validateResponse(raw: unknown): RawSkillResponse {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Skill synthesis: LLM response is not an object');
  }

  const obj = raw as Record<string, unknown>;

  for (const field of ['name', 'description', 'trigger_pattern'] as const) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
      throw new Error(`Skill synthesis: missing or empty required field '${field}'`);
    }
  }

  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new Error('Skill synthesis: steps must be a non-empty array');
  }
  for (const step of obj.steps as unknown[]) {
    if (step === null || typeof step !== 'object') {
      throw new Error('Skill synthesis: each step must be an object');
    }
    if (typeof (step as Record<string, unknown>).description !== 'string') {
      throw new Error('Skill synthesis: each step must have a string description');
    }
  }

  for (const field of ['prerequisites', 'anti_patterns'] as const) {
    if (!Array.isArray(obj[field])) {
      throw new Error(`Skill synthesis: '${field}' must be an array`);
    }
    for (const item of obj[field] as unknown[]) {
      if (typeof item !== 'string') {
        throw new Error(`Skill synthesis: each item in '${field}' must be a string`);
      }
    }
  }

  if (!Array.isArray(obj.validation_criteria)) {
    throw new Error('Skill synthesis: validation_criteria must be an array');
  }
  for (const vc of obj.validation_criteria as unknown[]) {
    if (vc === null || typeof vc !== 'object') {
      throw new Error('Skill synthesis: each validation criterion must be an object');
    }
    const vcObj = vc as Record<string, unknown>;
    if (typeof vcObj.check !== 'string' || typeof vcObj.method !== 'string') {
      throw new Error('Skill synthesis: validation criterion must have check and method strings');
    }
  }

  return raw as RawSkillResponse;
}

/**
 * Synthesize a SkillDefinition from a cluster of similar successful memories.
 *
 * @throws If the cluster has fewer than 3 members
 * @throws If the LLM returns invalid or unparseable JSON
 */
export async function synthesizeSkill(params: {
  cluster: Memory[];
  llm: LlmProvider;
  generateId: () => string;
}): Promise<SkillDefinition> {
  const { cluster, llm, generateId } = params;

  if (cluster.length < 3) {
    throw new Error(
      `Skill synthesis requires at least 3 memories, received ${cluster.length}`,
    );
  }

  const prompt = buildPrompt(cluster);
  const rawJson = await llm.generate(prompt, SKILL_OUTPUT_SCHEMA);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error(
      `Skill synthesis: LLM returned invalid JSON: ${rawJson.slice(0, 200)}`,
    );
  }

  const validated = validateResponse(parsed);
  const sourceIds = cluster.map((m) => m.id);

  const skill: SkillDefinition = {
    name: `${validated.name} [${generateId()}]`,
    kind: 'skill',
    description: validated.description,
    trigger_pattern: validated.trigger_pattern,
    steps: validated.steps.map((s) => ({
      description: s.description,
      ...(s.command !== undefined ? { command: s.command } : {}),
      ...(s.conditions !== undefined ? { conditions: s.conditions } : {}),
    })),
    prerequisites: validated.prerequisites,
    anti_patterns: validated.anti_patterns,
    validation_criteria: validated.validation_criteria,
    source_lessons: sourceIds,
    status: 'draft',
    confidence: 0.5,
    successes: 0,
    failures: 0,
    last_used_at: null,
  };

  return skill;
}
