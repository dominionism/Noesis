import type { Memory } from '../../types.js';

type JsonRecord = Record<string, unknown>;

export interface StoredPlan {
  kind: 'plan';
  version: 1;
  request: string;
  project_id: string | null;
  created_at: string;
  summary: string;
  assembly: JsonRecord;
  readiness: JsonRecord;
}

function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

export function buildPlanTitle(description: string): string {
  return `Plan: ${description.slice(0, 80)}`;
}

export function buildPlanSummary(
  request: string,
  assembly: JsonRecord,
  readiness: JsonRecord,
): string {
  const lines = [`Goal: ${request}`];

  const priorityOrder = Array.isArray(assembly.priority_order)
    ? assembly.priority_order.filter((section): section is string => typeof section === 'string')
    : [];

  if (priorityOrder.length > 0) {
    lines.push('', 'Prompt sections:');
    for (const section of priorityOrder) {
      lines.push(`- ${section}`);
    }
  }

  if (assembly.expert && typeof assembly.expert === 'object' && assembly.expert !== null) {
    const expert = assembly.expert as JsonRecord;
    const expertName = expert.display_name ?? expert.name;
    if (typeof expertName === 'string' && expertName.length > 0) {
      lines.push('', `Expert: ${expertName}`);
    }
  }

  if (Array.isArray(assembly.rules)) {
    lines.push(`Rules applied: ${assembly.rules.length}`);
  }

  if (Array.isArray(assembly.memories)) {
    lines.push(`Relevant memories: ${assembly.memories.length}`);
  }

  const total = typeof readiness.total === 'number' ? readiness.total : 0;
  const passed = readiness.passed === true;

  lines.push(
    '',
    `Readiness: ${total}/100 ${passed ? '[PASS]' : '[FAIL]'}`,
    `Clarity: ${typeof readiness.clarity === 'number' ? readiness.clarity : 0}/20`,
    `Codebase: ${typeof readiness.codebase === 'number' ? readiness.codebase : 0}/20`,
    `Constraints: ${typeof readiness.constraints === 'number' ? readiness.constraints : 0}/20`,
    `Risks: ${typeof readiness.risks === 'number' ? readiness.risks : 0}/20`,
    `Verification: ${typeof readiness.verification === 'number' ? readiness.verification : 0}/20`,
  );

  const gaps = Array.isArray(readiness.gaps)
    ? readiness.gaps.filter((gap): gap is JsonRecord => typeof gap === 'object' && gap !== null)
    : [];

  if (gaps.length > 0) {
    lines.push('', 'Gaps:');
    for (const gap of gaps) {
      lines.push(
        `- [${String(gap.dimension ?? 'unknown')}] ${String(gap.current ?? 0)}/${String(gap.required ?? 0)} -- ${String(gap.suggestion ?? '')}`,
      );
    }
  }

  return lines.join('\n');
}

export function createStoredPlan(
  request: string,
  projectId: string | null,
  assembly: JsonRecord,
  readiness: JsonRecord,
): StoredPlan {
  return {
    kind: 'plan',
    version: 1,
    request,
    project_id: projectId,
    created_at: new Date().toISOString(),
    summary: buildPlanSummary(request, assembly, readiness),
    assembly,
    readiness,
  };
}

export function parseStoredPlanContent(content: string): StoredPlan | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { kind?: unknown }).kind !== 'plan' ||
      (parsed as { version?: unknown }).version !== 1
    ) {
      return null;
    }

    const plan = parsed as Partial<StoredPlan>;
    if (
      typeof plan.request !== 'string' ||
      typeof plan.created_at !== 'string' ||
      typeof plan.summary !== 'string' ||
      typeof plan.assembly !== 'object' ||
      plan.assembly === null ||
      typeof plan.readiness !== 'object' ||
      plan.readiness === null
    ) {
      return null;
    }

    return {
      kind: 'plan',
      version: 1,
      request: plan.request,
      project_id: typeof plan.project_id === 'string' ? plan.project_id : null,
      created_at: plan.created_at,
      summary: plan.summary,
      assembly: plan.assembly as JsonRecord,
      readiness: plan.readiness as JsonRecord,
    };
  } catch {
    return null;
  }
}

export function isPlanMemory(memory: Memory): boolean {
  if (memory.type !== 'task') {
    return false;
  }

  const tags = parseTags(memory.tags);
  if (tags.includes('plan')) {
    return true;
  }

  return parseStoredPlanContent(memory.content) !== null;
}

export function extractPlanText(memory: Memory): string {
  const storedPlan = parseStoredPlanContent(memory.content);
  return storedPlan?.summary ?? memory.content;
}
