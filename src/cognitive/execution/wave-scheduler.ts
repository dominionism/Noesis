/**
 * Wave Scheduler — Wave-based task grouping and execution ordering.
 *
 * Tasks are assigned to waves (1, 2, 3, ...). Waves execute sequentially;
 * within a wave, tasks can execute in parallel. A wave cannot start until
 * all tasks in the previous wave are complete.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaveTask {
  id: string;
  description: string;
  wave: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependencies?: string[];
}

export interface WaveGroup {
  wave: number;
  tasks: WaveTask[];
}

export interface WaveSchedule {
  waves: WaveGroup[];
  currentWave: number;
  totalWaves: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Group tasks by wave number and return an ordered schedule.
 */
export function createWaveSchedule(tasks: WaveTask[]): WaveSchedule {
  const waveMap = new Map<number, WaveTask[]>();

  for (const task of tasks) {
    const wave = task.wave || 1;
    const existing = waveMap.get(wave) ?? [];
    existing.push(task);
    waveMap.set(wave, existing);
  }

  const waves: WaveGroup[] = Array.from(waveMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([wave, waveTasks]) => ({ wave, tasks: waveTasks }));

  const currentWave = findCurrentWave(waves);

  return {
    waves,
    currentWave,
    totalWaves: waves.length,
  };
}

/**
 * Check if a wave is complete (all tasks completed or failed).
 */
export function isWaveComplete(waveGroup: WaveGroup): boolean {
  return waveGroup.tasks.every(
    t => t.status === 'completed' || t.status === 'failed',
  );
}

/**
 * Check if a wave can start executing.
 *
 * A wave can start if:
 * 1. It's the first wave, OR
 * 2. All previous waves are complete
 */
export function canStartWave(schedule: WaveSchedule, waveNumber: number): boolean {
  for (const waveGroup of schedule.waves) {
    if (waveGroup.wave >= waveNumber) break;
    if (!isWaveComplete(waveGroup)) return false;
  }
  return true;
}

/**
 * Get the next executable tasks from the current wave.
 *
 * Returns pending tasks from the current wave that have all
 * dependencies satisfied.
 */
export function getExecutableTasks(schedule: WaveSchedule): WaveTask[] {
  const currentGroup = schedule.waves.find(w => w.wave === schedule.currentWave);
  if (!currentGroup) return [];

  const completedIds = new Set(
    schedule.waves
      .flatMap(w => w.tasks)
      .filter(t => t.status === 'completed')
      .map(t => t.id),
  );

  return currentGroup.tasks.filter(task => {
    if (task.status !== 'pending') return false;
    if (!task.dependencies || task.dependencies.length === 0) return true;
    return task.dependencies.every(dep => completedIds.has(dep));
  });
}

/**
 * Assign wave numbers to tasks based on dependencies.
 *
 * Tasks with no dependencies → wave 1
 * Tasks depending on wave N tasks → wave N+1
 */
export function autoAssignWaves(tasks: WaveTask[]): WaveTask[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const assigned = new Map<string, number>();

  function getWave(taskId: string, visited: Set<string>): number {
    if (assigned.has(taskId)) return assigned.get(taskId)!;
    if (visited.has(taskId)) return 1; // Cycle detection — break with wave 1

    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task?.dependencies || task.dependencies.length === 0) {
      assigned.set(taskId, 1);
      return 1;
    }

    let maxDepWave = 0;
    for (const depId of task.dependencies) {
      const depWave = getWave(depId, visited);
      maxDepWave = Math.max(maxDepWave, depWave);
    }

    const wave = maxDepWave + 1;
    assigned.set(taskId, wave);
    return wave;
  }

  for (const task of tasks) {
    getWave(task.id, new Set());
  }

  return tasks.map(t => ({
    ...t,
    wave: assigned.get(t.id) ?? 1,
  }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findCurrentWave(waves: WaveGroup[]): number {
  for (const waveGroup of waves) {
    if (!isWaveComplete(waveGroup)) return waveGroup.wave;
  }
  // All complete — return last wave
  return waves.length > 0 ? waves[waves.length - 1].wave : 1;
}
