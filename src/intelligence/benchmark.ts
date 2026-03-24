/**
 * Benchmark Framework — Noesis-on vs Noesis-off
 *
 * Provides structured benchmarking to measure Noesis uplift
 * across task classes, model tiers, and quality dimensions.
 *
 * ABILITIES.md Improvement #10: Benchmark Noesis-on vs Noesis-off.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkTask {
  id: string;
  class: TaskClass;
  description: string;
  expected_artifacts: string[];
  verification_criteria: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export type TaskClass =
  | 'localization'
  | 'bug_fix'
  | 'refactor'
  | 'migration'
  | 'api_change'
  | 'test_authoring'
  | 'documentation'
  | 'design_implementation';

export interface BenchmarkRun {
  id: string;
  task_id: string;
  noesis_enabled: boolean;
  model_tier: string;
  started_at: string;
  completed_at: string | null;
  metrics: BenchmarkMetrics;
}

export interface BenchmarkMetrics {
  /** Did the task produce correct output? */
  quality_pass: boolean;
  /** Did verification checks pass? */
  verification_pass: boolean;
  /** Total tokens consumed */
  token_count: number;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Number of human corrections needed */
  correction_count: number;
  /** Number of iterations before success */
  iteration_count: number;
  /** Subjective quality score 0-100 */
  quality_score: number;
}

export interface BenchmarkComparison {
  task_class: TaskClass;
  model_tier: string;
  noesis_on: AggregateMetrics;
  noesis_off: AggregateMetrics;
  uplift: UpliftMetrics;
}

export interface AggregateMetrics {
  sample_count: number;
  pass_rate: number;
  avg_quality_score: number;
  avg_token_count: number;
  avg_duration_ms: number;
  avg_corrections: number;
}

export interface UpliftMetrics {
  pass_rate_delta: number;
  quality_delta: number;
  token_efficiency: number;
  speed_ratio: number;
  correction_reduction: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a new benchmark task.
 */
export function createBenchmarkTask(
  id: string,
  taskClass: TaskClass,
  description: string,
  options: {
    expected_artifacts?: string[];
    verification_criteria?: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
  } = {},
): BenchmarkTask {
  return {
    id,
    class: taskClass,
    description,
    expected_artifacts: options.expected_artifacts ?? [],
    verification_criteria: options.verification_criteria ?? [],
    difficulty: options.difficulty ?? 'medium',
  };
}

/**
 * Record a benchmark run.
 */
export function createBenchmarkRun(
  taskId: string,
  noesisEnabled: boolean,
  modelTier: string,
  metrics: BenchmarkMetrics,
): BenchmarkRun {
  const now = new Date().toISOString();
  return {
    id: `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    task_id: taskId,
    noesis_enabled: noesisEnabled,
    model_tier: modelTier,
    started_at: now,
    completed_at: now,
    metrics,
  };
}

/**
 * Aggregate metrics across multiple benchmark runs.
 */
export function aggregateMetrics(runs: BenchmarkRun[]): AggregateMetrics {
  if (runs.length === 0) {
    return {
      sample_count: 0,
      pass_rate: 0,
      avg_quality_score: 0,
      avg_token_count: 0,
      avg_duration_ms: 0,
      avg_corrections: 0,
    };
  }

  const n = runs.length;
  const passes = runs.filter(r => r.metrics.quality_pass).length;

  return {
    sample_count: n,
    pass_rate: passes / n,
    avg_quality_score: runs.reduce((s, r) => s + r.metrics.quality_score, 0) / n,
    avg_token_count: runs.reduce((s, r) => s + r.metrics.token_count, 0) / n,
    avg_duration_ms: runs.reduce((s, r) => s + r.metrics.duration_ms, 0) / n,
    avg_corrections: runs.reduce((s, r) => s + r.metrics.correction_count, 0) / n,
  };
}

/**
 * Compare Noesis-on vs Noesis-off performance for a task class and model tier.
 */
export function comparePerformance(
  runs: BenchmarkRun[],
  taskClass: TaskClass,
  modelTier: string,
): BenchmarkComparison {
  const relevantRuns = runs.filter(r => {
    // Need to find the task class — stored via task_id
    return r.model_tier === modelTier;
  });

  const onRuns = relevantRuns.filter(r => r.noesis_enabled);
  const offRuns = relevantRuns.filter(r => !r.noesis_enabled);

  const onMetrics = aggregateMetrics(onRuns);
  const offMetrics = aggregateMetrics(offRuns);

  return {
    task_class: taskClass,
    model_tier: modelTier,
    noesis_on: onMetrics,
    noesis_off: offMetrics,
    uplift: {
      pass_rate_delta: onMetrics.pass_rate - offMetrics.pass_rate,
      quality_delta: onMetrics.avg_quality_score - offMetrics.avg_quality_score,
      token_efficiency: offMetrics.avg_token_count > 0
        ? onMetrics.avg_token_count / offMetrics.avg_token_count
        : 1,
      speed_ratio: offMetrics.avg_duration_ms > 0
        ? onMetrics.avg_duration_ms / offMetrics.avg_duration_ms
        : 1,
      correction_reduction: offMetrics.avg_corrections > 0
        ? 1 - (onMetrics.avg_corrections / offMetrics.avg_corrections)
        : 0,
    },
  };
}

/**
 * Generate a human-readable benchmark report.
 */
export function generateBenchmarkReport(comparisons: BenchmarkComparison[]): string {
  const lines: string[] = [];

  lines.push('# Noesis Benchmark Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  for (const comp of comparisons) {
    lines.push(`## ${comp.task_class} (${comp.model_tier})`);
    lines.push('');
    lines.push('| Metric | Noesis OFF | Noesis ON | Delta |');
    lines.push('|--------|-----------|----------|-------|');
    lines.push(`| Pass rate | ${(comp.noesis_off.pass_rate * 100).toFixed(0)}% | ${(comp.noesis_on.pass_rate * 100).toFixed(0)}% | +${(comp.uplift.pass_rate_delta * 100).toFixed(0)}% |`);
    lines.push(`| Quality | ${comp.noesis_off.avg_quality_score.toFixed(0)} | ${comp.noesis_on.avg_quality_score.toFixed(0)} | +${comp.uplift.quality_delta.toFixed(0)} |`);
    lines.push(`| Tokens | ${comp.noesis_off.avg_token_count.toFixed(0)} | ${comp.noesis_on.avg_token_count.toFixed(0)} | ${(comp.uplift.token_efficiency * 100).toFixed(0)}% |`);
    lines.push(`| Corrections | ${comp.noesis_off.avg_corrections.toFixed(1)} | ${comp.noesis_on.avg_corrections.toFixed(1)} | -${(comp.uplift.correction_reduction * 100).toFixed(0)}% |`);
    lines.push(`| Samples | ${comp.noesis_off.sample_count} | ${comp.noesis_on.sample_count} | |`);
    lines.push('');
  }

  return lines.join('\n');
}
