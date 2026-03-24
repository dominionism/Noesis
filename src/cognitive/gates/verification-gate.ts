/**
 * Verification Gate — Repo-capability-derived verification planning.
 *
 * Detects verification capabilities from actual project files:
 * - Package manager detection (npm/pnpm/yarn/bun)
 * - Available scripts from package.json
 * - Makefile targets
 * - Preferred aggregate commands
 *
 * Creates ordered verification plans from detected capabilities.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface VerificationCapabilities {
  packageManager: PackageManager;
  availableScripts: Record<string, string>;
  makeTargets: string[];
  preferredOrder: string[];
  aggregateCommand: string | null;
}

export interface VerificationStep {
  command: string;
  description: string;
  blocking: boolean;
}

export interface VerificationPlan {
  steps: VerificationStep[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect verification capabilities from a project root.
 *
 * Detection order for package manager:
 * 1. packageManager field in package.json
 * 2. bun.lock → bun
 * 3. pnpm-lock.yaml → pnpm
 * 4. yarn.lock → yarn
 * 5. package-lock.json → npm
 * 6. Default: npm
 */
export function detectVerificationCapabilities(
  projectRoot: string,
): VerificationCapabilities {
  const packageManager = detectPackageManager(projectRoot);
  const availableScripts = detectScripts(projectRoot);
  const makeTargets = detectMakeTargets(projectRoot);

  // Determine preferred verification order
  const preferredOrder = prioritizeScripts(availableScripts, makeTargets);

  // Find aggregate command
  const aggregateCommand = findAggregateCommand(availableScripts, packageManager);

  return {
    packageManager,
    availableScripts,
    makeTargets,
    preferredOrder,
    aggregateCommand,
  };
}

/**
 * Create a verification plan from detected capabilities.
 */
export function createVerificationPlan(
  capabilities: VerificationCapabilities,
): VerificationPlan {
  const steps: VerificationStep[] = [];
  const pm = capabilities.packageManager;
  const run = pm === 'npm' ? 'npm run' : pm;

  // Type checking (if available)
  if (capabilities.availableScripts['typecheck'] || capabilities.availableScripts['type-check']) {
    const scriptName = capabilities.availableScripts['typecheck'] ? 'typecheck' : 'type-check';
    steps.push({
      command: `${run} ${scriptName}`,
      description: 'Type checking',
      blocking: true,
    });
  }

  // Linting (if available)
  if (capabilities.availableScripts['lint']) {
    steps.push({
      command: `${run} lint`,
      description: 'Lint check',
      blocking: false,
    });
  }

  // Tests (if available)
  if (capabilities.availableScripts['test']) {
    steps.push({
      command: `${run} test`,
      description: 'Run tests',
      blocking: true,
    });
  }

  // Build (if available)
  if (capabilities.availableScripts['build']) {
    steps.push({
      command: `${run} build`,
      description: 'Build verification',
      blocking: true,
    });
  }

  // Make targets as fallback
  if (steps.length === 0 && capabilities.makeTargets.length > 0) {
    for (const target of capabilities.makeTargets.slice(0, 3)) {
      steps.push({
        command: `make ${target}`,
        description: `Make target: ${target}`,
        blocking: target === 'test' || target === 'build',
      });
    }
  }

  // If aggregate command exists, add it as final step
  if (capabilities.aggregateCommand && steps.length > 0) {
    const existing = steps.map(s => s.command);
    if (!existing.includes(capabilities.aggregateCommand)) {
      steps.push({
        command: capabilities.aggregateCommand,
        description: 'Aggregate verification',
        blocking: true,
      });
    }
  }

  return { steps };
}

/**
 * Format a verification plan as markdown.
 */
export function formatVerificationPlan(plan: VerificationPlan): string {
  if (plan.steps.length === 0) {
    return 'No verification capabilities detected.';
  }

  const lines: string[] = ['### Verification Plan'];

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const blocking = step.blocking ? ' [blocking]' : '';
    lines.push(`${i + 1}. \`${step.command}\` — ${step.description}${blocking}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function detectPackageManager(projectRoot: string): PackageManager {
  // 1. Check packageManager field in package.json
  const pkgJsonPath = join(projectRoot, 'package.json');
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      if (typeof pkg.packageManager === 'string') {
        if (pkg.packageManager.startsWith('pnpm')) return 'pnpm';
        if (pkg.packageManager.startsWith('yarn')) return 'yarn';
        if (pkg.packageManager.startsWith('bun')) return 'bun';
        if (pkg.packageManager.startsWith('npm')) return 'npm';
      }
    } catch {
      // Ignore parse errors
    }
  }

  // 2. Check lockfiles in priority order
  if (existsSync(join(projectRoot, 'bun.lock')) || existsSync(join(projectRoot, 'bun.lockb'))) return 'bun';
  if (existsSync(join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectRoot, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectRoot, 'package-lock.json'))) return 'npm';

  // 3. Default
  return 'npm';
}

function detectScripts(projectRoot: string): Record<string, string> {
  const pkgJsonPath = join(projectRoot, 'package.json');
  if (!existsSync(pkgJsonPath)) return {};

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (pkg.scripts && typeof pkg.scripts === 'object') {
      return pkg.scripts as Record<string, string>;
    }
  } catch {
    // Ignore
  }

  return {};
}

function detectMakeTargets(projectRoot: string): string[] {
  const makefilePath = join(projectRoot, 'Makefile');
  if (!existsSync(makefilePath)) return [];

  try {
    const content = readFileSync(makefilePath, 'utf-8');
    const targets: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
      if (match && !match[1].startsWith('.')) {
        targets.push(match[1]);
      }
    }

    return targets;
  } catch {
    return [];
  }
}

function prioritizeScripts(
  scripts: Record<string, string>,
  makeTargets: string[],
): string[] {
  const priority = ['typecheck', 'type-check', 'lint', 'test', 'build', 'verify', 'check'];
  const ordered: string[] = [];

  for (const name of priority) {
    if (scripts[name]) ordered.push(name);
  }

  // Add make targets not already covered
  for (const target of makeTargets) {
    if (!ordered.includes(target)) ordered.push(target);
  }

  // Add remaining scripts
  for (const name of Object.keys(scripts)) {
    if (!ordered.includes(name)) ordered.push(name);
  }

  return ordered;
}

function findAggregateCommand(
  scripts: Record<string, string>,
  pm: PackageManager,
): string | null {
  const run = pm === 'npm' ? 'npm run' : pm;
  const aggregateNames = ['verify', 'check', 'ci', 'validate'];

  for (const name of aggregateNames) {
    if (scripts[name]) {
      return `${run} ${name}`;
    }
  }

  return null;
}
