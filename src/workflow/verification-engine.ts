/**
 * Verification Engine — Three-Level Goal-Backward Verification
 *
 * Verifies artifacts at three levels:
 * 1. exists — does the artifact exist on the filesystem?
 * 2. substantive — is the content non-trivial (not just stubs/TODOs)?
 * 3. wired — do other files import/reference this artifact?
 *
 * Used by the plan verification step to ensure implementation
 * targets are real, meaningful, and integrated.
 */

import type { FilesystemQuery } from '../types.js';

// ===========================================================================
// Types
// ===========================================================================

export type VerificationLevel = 'exists' | 'substantive' | 'wired';

export interface VerificationTarget {
  /** File path or resource identifier */
  artifact: string;
  /** Human-readable description */
  description: string;
  /** Patterns that should exist in the artifact content */
  expectedPatterns?: string[];
  /** Files that should import this artifact */
  expectedImports?: string[];
}

export interface VerificationResult {
  target: VerificationTarget;
  exists: boolean;
  substantive: boolean;
  wired: boolean;
  issues: string[];
  /** Highest verification level passed */
  level: VerificationLevel;
}

export interface PlanVerificationResult {
  passed: boolean;
  results: VerificationResult[];
  summary: string;
  passRate: number;
}

// ===========================================================================
// Substantiveness check
// ===========================================================================

/**
 * Determine if content is substantive (non-trivial).
 *
 * Checks:
 * - Line count > 5
 * - Not only `return null`
 * - Not only `=> {}`
 * - Not only `console.log`
 * - Not only `// TODO`
 */
export function isSubstantive(content: string): boolean {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  // Must have more than 5 non-empty lines
  if (lines.length <= 5) return false;

  // Check if ALL non-empty lines are only trivial patterns
  const trivialPatterns = [
    /^\s*return\s+null\s*;?\s*$/,
    /^\s*=>\s*\{\s*\}\s*$/,
    /^\s*console\.log\s*\(/,
    /^\s*\/\/\s*TODO/i,
    /^\s*$/,
    /^\s*[{}]\s*$/,
    /^\s*import\s+/,
    /^\s*export\s+/,
  ];

  const substantiveLines = lines.filter((line) => {
    return !trivialPatterns.some((pattern) => pattern.test(line));
  });

  // At least some lines must be substantive beyond just imports/exports and trivial code
  return substantiveLines.length > 0;
}

// ===========================================================================
// Importer search
// ===========================================================================

/**
 * Search for files that import or require the given artifact.
 *
 * Searches using glob pattern for likely source files, then checks content
 * for import/require statements referencing the artifact.
 */
export async function findImporters(artifact: string, query: FilesystemQuery): Promise<string[]> {
  const importers: string[] = [];

  // Extract the module name from the artifact path (e.g. "src/foo/bar.ts" -> "bar")
  const parts = artifact.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1];
  const baseName = fileName.replace(/\.[^.]+$/, '');

  // Also try relative path patterns
  const pathWithoutExt = artifact.replace(/\.[^.]+$/, '');

  // Search for source files
  const sourceGlobs = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'];
  const candidates = new Set<string>();

  for (const glob of sourceGlobs) {
    try {
      const files = await query.glob(glob);
      for (const file of files) {
        // Skip the artifact itself
        if (file === artifact) continue;
        candidates.add(file);
      }
    } catch {
      // Glob may fail if pattern not supported; continue with others
    }
  }

  for (const candidate of candidates) {
    try {
      const content = await query.read(candidate);
      // Check for import patterns
      const importPatterns = [
        new RegExp(`from\\s+['"].*${escapeRegex(baseName)}(?:\\.js)?['"]`, 'i'),
        new RegExp(`require\\s*\\(\\s*['"].*${escapeRegex(baseName)}(?:\\.js)?['"]`, 'i'),
        new RegExp(`import\\s+.*['"].*${escapeRegex(pathWithoutExt)}`, 'i'),
      ];

      if (importPatterns.some((p) => p.test(content))) {
        importers.push(candidate);
      }
    } catch {
      // File read failure; skip
    }
  }

  return importers;
}

// ===========================================================================
// Artifact verification
// ===========================================================================

/**
 * Verify a single artifact at all three levels.
 */
export async function verifyArtifact(
  target: VerificationTarget,
  query: FilesystemQuery,
): Promise<VerificationResult> {
  const issues: string[] = [];
  let exists = false;
  let substantive = false;
  let wired = false;

  // Level 1: Exists
  try {
    exists = await query.exists(target.artifact);
  } catch {
    exists = false;
  }

  if (!exists) {
    issues.push(`Artifact does not exist: ${target.artifact}`);
    return { target, exists, substantive, wired, issues, level: 'exists' };
  }

  // Level 2: Substantive
  try {
    const content = await query.read(target.artifact);
    substantive = isSubstantive(content);

    if (!substantive) {
      issues.push(`Artifact is not substantive (stub/trivial content): ${target.artifact}`);
    }

    // Check expected patterns
    if (target.expectedPatterns) {
      for (const pattern of target.expectedPatterns) {
        if (!content.includes(pattern)) {
          issues.push(`Expected pattern not found: "${pattern}" in ${target.artifact}`);
        }
      }
    }
  } catch {
    issues.push(`Failed to read artifact: ${target.artifact}`);
    return { target, exists, substantive, wired, issues, level: 'exists' };
  }

  if (!substantive) {
    return { target, exists, substantive, wired, issues, level: 'exists' };
  }

  // Level 3: Wired
  try {
    const importers = await findImporters(target.artifact, query);

    if (target.expectedImports) {
      for (const expected of target.expectedImports) {
        if (!importers.includes(expected)) {
          issues.push(`Expected importer not found: ${expected} does not import ${target.artifact}`);
        }
      }
    }

    wired = importers.length > 0;

    if (!wired) {
      issues.push(`Artifact is not imported by any other file: ${target.artifact}`);
    }
  } catch {
    issues.push(`Failed to search for importers of: ${target.artifact}`);
  }

  const level: VerificationLevel = wired ? 'wired' : substantive ? 'substantive' : 'exists';

  return { target, exists, substantive, wired, issues, level };
}

// ===========================================================================
// Plan verification
// ===========================================================================

/**
 * Verify all targets in a plan and produce an aggregate result.
 */
export async function verifyPlan(
  targets: VerificationTarget[],
  query: FilesystemQuery,
): Promise<PlanVerificationResult> {
  if (targets.length === 0) {
    return {
      passed: true,
      results: [],
      summary: 'No verification targets specified.',
      passRate: 1,
    };
  }

  const results: VerificationResult[] = [];

  for (const target of targets) {
    const result = await verifyArtifact(target, query);
    results.push(result);
  }

  const passedCount = results.filter((r) => r.exists && r.substantive).length;
  const passRate = passedCount / targets.length;
  const passed = passRate >= 0.8;

  const existCount = results.filter((r) => r.exists).length;
  const substantiveCount = results.filter((r) => r.substantive).length;
  const wiredCount = results.filter((r) => r.wired).length;

  const summary = [
    `Verified ${targets.length} artifact(s):`,
    `${existCount} exist,`,
    `${substantiveCount} substantive,`,
    `${wiredCount} wired.`,
    `Pass rate: ${(passRate * 100).toFixed(0)}%.`,
    passed ? 'PASSED.' : 'FAILED.',
  ].join(' ');

  return { passed, results, summary, passRate };
}

// ===========================================================================
// Helpers
// ===========================================================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
