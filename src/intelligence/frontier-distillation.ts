/**
 * Frontier Distillation — Convert strong-model traces into reusable intelligence.
 *
 * When a frontier model (Opus, GPT-4, etc.) solves a hard task, capture the
 * trace and convert it into rules, skills, anti-patterns, and retrieval anchors
 * that cheaper models can use on similar tasks later.
 *
 * ABILITIES.md Improvement #7: Distill frontier-model work into reusable
 * organizational intelligence.
 *
 * Research basis: Voyager (Wang et al., 2023), DSPy (Khattab et al., 2023),
 * Sub-goal Distillation (Hashemzadeh et al., 2024).
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export type AssetType =
  | 'rule'
  | 'skill'
  | 'anti_pattern'
  | 'capsule_component'
  | 'retrieval_anchor'
  | 'test_case';

export interface ModelTrace {
  traceId: string;
  modelName: string;
  modelTier: 'tier1' | 'tier2' | 'tier3';
  taskDescription: string;
  taskClass: string;           // e.g., 'bug_fix', 'refactor', 'migration', 'api_change'
  steps: TraceStep[];
  outcome: 'success' | 'failure' | 'partial';
  durationMs: number;
  tokenCount: number;
  timestamp: string;
}

export interface TraceStep {
  index: number;
  action: string;              // What the model did
  reasoning: string;           // Why (if available)
  toolsUsed: string[];
  filesChanged: string[];
  outcome: 'success' | 'failure' | 'skipped';
}

export interface DistilledAsset {
  id: string;
  type: AssetType;
  name: string;
  content: string;
  sourceTraceId: string;
  taskClass: string;
  confidence: number;         // 0-1, starts at 0.5
  validations: number;        // Times this asset was validated as helpful
  invalidations: number;      // Times it was found unhelpful
  createdAt: string;
}

export interface DistillationResult {
  assets: DistilledAsset[];
  traceId: string;
  taskClass: string;
  reasoning: string;
}

export interface AssetPerformance {
  assetId: string;
  assetType: AssetType;
  usageCount: number;
  helpfulCount: number;
  helpRate: number;
  shouldPromote: boolean;      // helpRate > 0.7 and usageCount >= 5
  shouldRetire: boolean;       // helpRate < 0.3 and usageCount >= 5
}

// ===========================================================================
// Constants
// ===========================================================================

/** Minimum step count to extract a skill from a successful trace. */
const MIN_STEPS_FOR_SKILL = 3;

/** Initial confidence for all newly distilled assets. */
const INITIAL_CONFIDENCE = 0.5;

/** Minimum usage count before promote/retire decisions apply. */
const MIN_USAGE_FOR_LIFECYCLE = 5;

/** Help rate above which an asset is recommended for promotion. */
const PROMOTE_THRESHOLD = 0.7;

/** Help rate below which an asset is recommended for retirement. */
const RETIRE_THRESHOLD = 0.3;

/** Minimum tool repetitions across steps to trigger a rule. */
const MIN_TOOL_REPETITIONS = 2;

// ===========================================================================
// Core distillation
// ===========================================================================

/**
 * Distill a model trace into reusable assets.
 *
 * Only distills from successful traces. For failures, creates anti-patterns instead.
 *
 * Logic:
 * - For successful traces:
 *   - If 3+ steps: create a skill (the ordered workflow)
 *   - Always: create a retrieval anchor (summary for future similarity matching)
 *   - If specific tools used repeatedly: create a rule about tool usage for this task class
 * - For failed traces:
 *   - Create an anti_pattern documenting what went wrong and at which step
 * - Confidence starts at 0.5 for all new assets
 */
export function distillTrace(trace: ModelTrace): DistillationResult {
  const assets: DistilledAsset[] = [];
  const reasoningParts: string[] = [];
  const now = new Date().toISOString();

  if (trace.outcome === 'success' || trace.outcome === 'partial') {
    // --- Skill extraction (3+ steps) ---
    if (trace.steps.length >= MIN_STEPS_FOR_SKILL) {
      const skillContent = traceToSkillContent(trace);
      assets.push({
        id: generateId(),
        type: 'skill',
        name: `${trace.taskClass}_workflow`,
        content: skillContent,
        sourceTraceId: trace.traceId,
        taskClass: trace.taskClass,
        confidence: INITIAL_CONFIDENCE,
        validations: 0,
        invalidations: 0,
        createdAt: now,
      });
      reasoningParts.push(
        `Extracted skill from ${trace.steps.length}-step successful trace.`,
      );
    }

    // --- Retrieval anchor (always for successes) ---
    const anchorContent = traceToRetrievalAnchor(trace);
    assets.push({
      id: generateId(),
      type: 'retrieval_anchor',
      name: `${trace.taskClass}_anchor`,
      content: anchorContent,
      sourceTraceId: trace.traceId,
      taskClass: trace.taskClass,
      confidence: INITIAL_CONFIDENCE,
      validations: 0,
      invalidations: 0,
      createdAt: now,
    });
    reasoningParts.push('Created retrieval anchor for future similarity matching.');

    // --- Tool-usage rule (repeated tools) ---
    const repeatedTools = findRepeatedTools(trace.steps);
    if (repeatedTools.length > 0) {
      const toolList = repeatedTools.join(', ');
      const ruleContent = [
        `Task class: ${trace.taskClass}`,
        `Recommended tools: ${toolList}`,
        '',
        `When working on "${trace.taskClass}" tasks, prefer these tools:`,
        ...repeatedTools.map((t) => `- ${t}`),
        '',
        `Evidence: ${trace.modelName} (${trace.modelTier}) used these tools`,
        `repeatedly across ${trace.steps.length} steps to achieve a successful outcome.`,
      ].join('\n');

      assets.push({
        id: generateId(),
        type: 'rule',
        name: `${trace.taskClass}_tool_preference`,
        content: ruleContent,
        sourceTraceId: trace.traceId,
        taskClass: trace.taskClass,
        confidence: INITIAL_CONFIDENCE,
        validations: 0,
        invalidations: 0,
        createdAt: now,
      });
      reasoningParts.push(
        `Created tool-usage rule for repeated tools: ${toolList}.`,
      );
    }
  } else {
    // --- Anti-pattern from failure ---
    const antiPatternContent = traceToAntiPattern(trace);
    assets.push({
      id: generateId(),
      type: 'anti_pattern',
      name: `${trace.taskClass}_failure_pattern`,
      content: antiPatternContent,
      sourceTraceId: trace.traceId,
      taskClass: trace.taskClass,
      confidence: INITIAL_CONFIDENCE,
      validations: 0,
      invalidations: 0,
      createdAt: now,
    });
    reasoningParts.push(
      'Created anti-pattern from failed trace documenting failure points.',
    );
  }

  return {
    assets,
    traceId: trace.traceId,
    taskClass: trace.taskClass,
    reasoning: reasoningParts.join(' '),
  };
}

// ===========================================================================
// Asset lifecycle
// ===========================================================================

/**
 * Record that a distilled asset was used and whether it helped.
 * Updates the asset's validation/invalidation counts and confidence.
 *
 * New confidence = (validations + 1) / (validations + invalidations + 2)  [Laplace smoothing]
 */
export function recordAssetUsage(
  asset: DistilledAsset,
  helpful: boolean,
): DistilledAsset {
  const validations = asset.validations + (helpful ? 1 : 0);
  const invalidations = asset.invalidations + (helpful ? 0 : 1);
  const confidence = (validations + 1) / (validations + invalidations + 2);

  return {
    ...asset,
    validations,
    invalidations,
    confidence,
  };
}

/**
 * Evaluate the performance of all tracked assets.
 * Returns performance metrics with promote/retire recommendations.
 */
export function evaluateAssetPerformance(
  assets: DistilledAsset[],
): AssetPerformance[] {
  return assets.map((asset) => {
    const usageCount = asset.validations + asset.invalidations;
    const helpfulCount = asset.validations;
    const helpRate = usageCount > 0 ? helpfulCount / usageCount : 0;
    const hasEnoughUsage = usageCount >= MIN_USAGE_FOR_LIFECYCLE;

    return {
      assetId: asset.id,
      assetType: asset.type,
      usageCount,
      helpfulCount,
      helpRate,
      shouldPromote: hasEnoughUsage && helpRate > PROMOTE_THRESHOLD,
      shouldRetire: hasEnoughUsage && helpRate < RETIRE_THRESHOLD,
    };
  });
}

// ===========================================================================
// Trace formatters
// ===========================================================================

/**
 * Format a successful trace into a skill definition content string.
 * Includes the ordered steps, tools used, and success criteria.
 */
export function traceToSkillContent(trace: ModelTrace): string {
  const stepLines = trace.steps.map((step) => {
    const tools = step.toolsUsed.length > 0
      ? ` [tools: ${step.toolsUsed.join(', ')}]`
      : '';
    const files = step.filesChanged.length > 0
      ? ` [files: ${step.filesChanged.join(', ')}]`
      : '';
    const reasoning = step.reasoning ? ` — ${step.reasoning}` : '';
    return `  ${step.index}. ${step.action}${tools}${files}${reasoning}`;
  });

  const allTools = collectUniqueTools(trace.steps);
  const allFiles = collectUniqueFiles(trace.steps);

  const successSteps = trace.steps.filter((s) => s.outcome === 'success');
  const failedSteps = trace.steps.filter((s) => s.outcome === 'failure');

  return [
    `Skill: ${trace.taskClass} workflow`,
    `Source model: ${trace.modelName} (${trace.modelTier})`,
    `Task: ${trace.taskDescription}`,
    `Duration: ${trace.durationMs}ms | Tokens: ${trace.tokenCount}`,
    '',
    'Steps:',
    ...stepLines,
    '',
    `Tools required: ${allTools.join(', ') || 'none'}`,
    `Files involved: ${allFiles.join(', ') || 'none'}`,
    '',
    'Success criteria:',
    `  - ${successSteps.length}/${trace.steps.length} steps completed successfully`,
    ...(failedSteps.length > 0
      ? [`  - Steps ${failedSteps.map((s) => s.index).join(', ')} failed but were recovered from`]
      : []),
    `  - Overall outcome: ${trace.outcome}`,
  ].join('\n');
}

/**
 * Format a failed trace into an anti-pattern content string.
 * Includes what went wrong, at which step, and what to avoid.
 */
export function traceToAntiPattern(trace: ModelTrace): string {
  const failedSteps = trace.steps.filter((s) => s.outcome === 'failure');
  const failureDetails = failedSteps.map((step) => {
    const tools = step.toolsUsed.length > 0
      ? ` [tools: ${step.toolsUsed.join(', ')}]`
      : '';
    const reasoning = step.reasoning ? ` — ${step.reasoning}` : '';
    return `  Step ${step.index}: ${step.action}${tools}${reasoning}`;
  });

  const lastStep = trace.steps[trace.steps.length - 1];
  const failurePoint = failedSteps.length > 0
    ? `first failure at step ${failedSteps[0].index}`
    : `final step ${lastStep?.index ?? 'unknown'}`;

  return [
    `Anti-pattern: ${trace.taskClass} failure`,
    `Source model: ${trace.modelName} (${trace.modelTier})`,
    `Task: ${trace.taskDescription}`,
    `Outcome: ${trace.outcome} (${failurePoint})`,
    '',
    'What went wrong:',
    ...(failureDetails.length > 0
      ? failureDetails
      : ['  No individual step failures recorded — overall task failed.']),
    '',
    'What to avoid:',
    `  - Do not repeat this approach for "${trace.taskClass}" tasks`,
    ...(failedSteps.length > 0
      ? failedSteps.map(
          (s) => `  - Avoid: ${s.action} (failed at step ${s.index})`,
        )
      : []),
    '',
    `Total steps attempted: ${trace.steps.length}`,
    `Duration: ${trace.durationMs}ms | Tokens: ${trace.tokenCount}`,
  ].join('\n');
}

/**
 * Create a retrieval anchor from a trace — a compact summary
 * optimized for future embedding-based similarity matching.
 */
export function traceToRetrievalAnchor(trace: ModelTrace): string {
  const allTools = collectUniqueTools(trace.steps);
  const allFiles = collectUniqueFiles(trace.steps);
  const keyActions = trace.steps
    .filter((s) => s.outcome === 'success')
    .slice(0, 5)
    .map((s) => s.action);

  return [
    `[${trace.taskClass}] ${trace.taskDescription}`,
    `Outcome: ${trace.outcome} | Model: ${trace.modelName}`,
    `Tools: ${allTools.join(', ') || 'none'}`,
    `Files: ${allFiles.join(', ') || 'none'}`,
    `Key actions: ${keyActions.join('; ') || 'none'}`,
  ].join('\n');
}

// ===========================================================================
// Internal helpers
// ===========================================================================

/**
 * Identify tools that appear in 2+ steps — indicates the tool is
 * important for this class of task.
 */
function findRepeatedTools(steps: TraceStep[]): string[] {
  const toolCounts = new Map<string, number>();

  for (const step of steps) {
    for (const tool of step.toolsUsed) {
      toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
    }
  }

  const repeated: string[] = [];
  for (const [tool, count] of toolCounts) {
    if (count >= MIN_TOOL_REPETITIONS) {
      repeated.push(tool);
    }
  }

  return repeated.sort();
}

/** Collect unique tool names across all steps, sorted. */
function collectUniqueTools(steps: TraceStep[]): string[] {
  const tools = new Set<string>();
  for (const step of steps) {
    for (const tool of step.toolsUsed) {
      tools.add(tool);
    }
  }
  return [...tools].sort();
}

/** Collect unique file paths across all steps, sorted. */
function collectUniqueFiles(steps: TraceStep[]): string[] {
  const files = new Set<string>();
  for (const step of steps) {
    for (const file of step.filesChanged) {
      files.add(file);
    }
  }
  return [...files].sort();
}
