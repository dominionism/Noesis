/**
 * Skill Graph Engine
 *
 * Compiles multi-step skills into executable DAGs and validates
 * their structure. This allows smaller models to fill bounded
 * slots within a graph instead of improvising entire workflows.
 *
 * Treats reusable skills as executable graphs.
 */

import type { SkillGraph, SkillGraphStep } from '../types.js';

/**
 * Validate a skill graph structure:
 * - Entry step must exist
 * - All depends_on references must be valid
 * - No circular dependencies
 * - All steps reachable from entry
 */
export function validateSkillGraph(graph: SkillGraph): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const stepIds = new Set(graph.steps.map(s => s.id));

  // Entry step must exist
  if (!stepIds.has(graph.entry_step)) {
    errors.push(`Entry step "${graph.entry_step}" not found in steps`);
  }

  // All dependencies must reference valid steps
  for (const step of graph.steps) {
    for (const dep of step.depends_on) {
      if (!stepIds.has(dep)) {
        errors.push(`Step "${step.id}" depends on unknown step "${dep}"`);
      }
    }
  }

  // Check for circular dependencies
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(stepId: string): boolean {
    if (inStack.has(stepId)) return true;
    if (visited.has(stepId)) return false;

    visited.add(stepId);
    inStack.add(stepId);

    const step = graph.steps.find(s => s.id === stepId);
    if (step) {
      for (const dep of step.depends_on) {
        if (hasCycle(dep)) return true;
      }
    }

    inStack.delete(stepId);
    return false;
  }

  for (const step of graph.steps) {
    if (hasCycle(step.id)) {
      errors.push(`Circular dependency detected involving step "${step.id}"`);
      break;
    }
  }

  // Check reachability from entry (forward traversal via reverse deps)
  const reachable = new Set<string>();
  const queue = [graph.entry_step];
  const dependents = new Map<string, string[]>();

  for (const step of graph.steps) {
    for (const dep of step.depends_on) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(step.id);
    }
  }
  // Also add steps with no deps that aren't the entry
  for (const step of graph.steps) {
    if (step.depends_on.length === 0 && step.id !== graph.entry_step) {
      queue.push(step.id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const deps = dependents.get(current) ?? [];
    for (const d of deps) {
      if (!reachable.has(d)) queue.push(d);
    }
  }

  for (const step of graph.steps) {
    if (!reachable.has(step.id)) {
      errors.push(`Step "${step.id}" is unreachable from entry`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute a topological execution order for a skill graph.
 * Returns steps in dependency-respecting order.
 */
export function computeExecutionOrder(graph: SkillGraph): SkillGraphStep[] {
  const stepMap = new Map(graph.steps.map(s => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const step of graph.steps) {
    inDegree.set(step.id, step.depends_on.length);
    for (const dep of step.depends_on) {
      if (!adjList.has(dep)) adjList.set(dep, []);
      adjList.get(dep)!.push(step.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: SkillGraphStep[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const step = stepMap.get(current);
    if (step) order.push(step);

    for (const neighbor of (adjList.get(current) ?? [])) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return order;
}

/**
 * Identify steps that can execute in parallel (same dependency depth).
 * Returns arrays of step groups, where all steps in a group can run concurrently.
 */
export function computeParallelWaves(graph: SkillGraph): SkillGraphStep[][] {
  const stepMap = new Map(graph.steps.map(s => [s.id, s]));
  const depths = new Map<string, number>();

  function getDepth(stepId: string, visited: Set<string> = new Set()): number {
    if (depths.has(stepId)) return depths.get(stepId)!;
    if (visited.has(stepId)) return 0; // cycle guard
    visited.add(stepId);

    const step = stepMap.get(stepId);
    if (!step || step.depends_on.length === 0) {
      depths.set(stepId, 0);
      return 0;
    }

    const maxDepDepth = Math.max(
      ...step.depends_on.map(d => getDepth(d, visited))
    );
    const depth = maxDepDepth + 1;
    depths.set(stepId, depth);
    return depth;
  }

  for (const step of graph.steps) {
    getDepth(step.id);
  }

  const maxDepth = Math.max(0, ...depths.values());
  const waves: SkillGraphStep[][] = [];

  for (let d = 0; d <= maxDepth; d++) {
    const wave: SkillGraphStep[] = [];
    for (const step of graph.steps) {
      if (depths.get(step.id) === d) wave.push(step);
    }
    if (wave.length > 0) waves.push(wave);
  }

  return waves;
}

/**
 * Create a skill graph from a prose skill definition.
 * Converts step-by-step instructions into a typed DAG.
 */
export function createSkillGraph(
  id: string,
  name: string,
  description: string,
  steps: Array<{
    name: string;
    description: string;
    inputs?: Array<{ name: string; type: string; required?: boolean }>;
    outputs?: Array<{ name: string; type: string }>;
    tools?: string[];
    criteria?: string[];
    depends_on?: string[];
    timeout_ms?: number;
  }>,
): SkillGraph {
  const graphSteps: SkillGraphStep[] = steps.map((s, i) => ({
    id: `step_${i + 1}`,
    name: s.name,
    description: s.description,
    inputs: (s.inputs ?? []).map(inp => ({ ...inp, required: inp.required ?? true })),
    outputs: s.outputs ?? [],
    required_tools: s.tools ?? [],
    success_criteria: s.criteria ?? [],
    timeout_ms: s.timeout_ms ?? 300000,
    depends_on: s.depends_on ?? (i > 0 ? [`step_${i}`] : []),
  }));

  const allTools = new Set<string>();
  let totalEstimate = 0;
  for (const step of graphSteps) {
    for (const tool of step.required_tools) allTools.add(tool);
    totalEstimate += step.timeout_ms;
  }

  return {
    id,
    name,
    description,
    version: 1,
    steps: graphSteps,
    entry_step: graphSteps[0]?.id ?? '',
    exit_conditions: graphSteps.length > 0
      ? graphSteps[graphSteps.length - 1].success_criteria
      : [],
    estimated_duration_ms: totalEstimate,
    required_capabilities: [...allTools],
  };
}
