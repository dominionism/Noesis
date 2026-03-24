/**
 * World Model
 *
 * Builds and maintains a structured representation of the project environment.
 * Five components: dependency graph, file topology, runtime profile,
 * API surface, and change velocity.
 *
 * Storage: world model components stored as 'decision' type memories with
 * scope 'project' and tagged 'world_model'. Automatically superseded on update.
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export interface DependencyNode {
  name: string;
  version: string;
  isDev: boolean;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: Array<{ from: string; to: string; relation: 'requires' | 'dev_requires' }>;
}

export type FileCategory =
  | 'entry_point'
  | 'config'
  | 'test'
  | 'api_route'
  | 'component'
  | 'utility'
  | 'type_definition'
  | 'documentation'
  | 'build'
  | 'unknown';

export interface FileTopologyEntry {
  path: string;
  category: FileCategory;
  confidence: number;
}

export interface FileTopology {
  entries: FileTopologyEntry[];
  summary: Record<FileCategory, number>;
}

export interface RuntimeProfile {
  runtime: 'node' | 'deno' | 'bun' | 'unknown';
  runtimeVersion: string | null;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';
  framework: string | null;
  testRunner: string | null;
  language: 'typescript' | 'javascript' | 'mixed' | 'unknown';
  moduleSystem: 'esm' | 'commonjs' | 'mixed' | 'unknown';
}

export interface APIEndpoint {
  method: string;
  path: string;
  file: string;
  line: number;
}

export interface APISurface {
  endpoints: APIEndpoint[];
  exportedFunctions: Array<{ name: string; file: string }>;
  exportedTypes: Array<{ name: string; file: string }>;
}

export interface ChangeVelocityEntry {
  file: string;
  changeCount: number;
  lastChanged: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ChangeVelocity {
  entries: ChangeVelocityEntry[];
  hotspots: string[];
  period: string;
}

export interface WorldModel {
  id: string;
  projectId: string;
  dependencies: DependencyGraph;
  topology: FileTopology;
  runtime: RuntimeProfile;
  apiSurface: APISurface;
  velocity: ChangeVelocity;
  generatedAt: string;
}

// ===========================================================================
// File category classification patterns
// ===========================================================================

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: FileCategory; confidence: number }> = [
  { pattern: /\/(index|main|app|server)\.(ts|js|mjs)$/, category: 'entry_point', confidence: 0.9 },
  { pattern: /\/src\/(index|main)\.(ts|js)$/, category: 'entry_point', confidence: 0.95 },
  { pattern: /\.(config|rc)\.(ts|js|json|yaml|yml|mjs|cjs)$/, category: 'config', confidence: 0.9 },
  { pattern: /^(tsconfig|jest\.config|vitest\.config|webpack\.config|rollup\.config|vite\.config)/, category: 'config', confidence: 0.95 },
  { pattern: /\.(test|spec)\.(ts|js|tsx|jsx)$/, category: 'test', confidence: 0.95 },
  { pattern: /\/__tests__\//, category: 'test', confidence: 0.9 },
  { pattern: /\/(routes?|api|endpoints?)\//, category: 'api_route', confidence: 0.8 },
  { pattern: /\/(components?|views?|pages?)\//, category: 'component', confidence: 0.8 },
  { pattern: /\/(utils?|helpers?|lib|shared)\//, category: 'utility', confidence: 0.7 },
  { pattern: /\.d\.ts$/, category: 'type_definition', confidence: 0.95 },
  { pattern: /\/types?\.(ts|js)$/, category: 'type_definition', confidence: 0.85 },
  { pattern: /\.(md|mdx|txt|rst)$/, category: 'documentation', confidence: 0.9 },
  { pattern: /(^|\/)(?:build|dist|scripts)\//, category: 'build', confidence: 0.8 },
  { pattern: /(^|\/)(?:Makefile|Dockerfile|docker-compose)/, category: 'build', confidence: 0.85 },
];

// ===========================================================================
// Framework detection patterns
// ===========================================================================

const FRAMEWORK_PATTERNS: Record<string, string> = {
  'next': 'Next.js',
  'react': 'React',
  'vue': 'Vue',
  'svelte': 'Svelte',
  'express': 'Express',
  'fastify': 'Fastify',
  'hono': 'Hono',
  'koa': 'Koa',
  'nestjs': 'NestJS',
  '@nestjs/core': 'NestJS',
  'nuxt': 'Nuxt',
  'astro': 'Astro',
  'remix': 'Remix',
  'angular': 'Angular',
  '@angular/core': 'Angular',
};

const TEST_RUNNER_PATTERNS: Record<string, string> = {
  'vitest': 'vitest',
  'jest': 'jest',
  'mocha': 'mocha',
  'ava': 'ava',
  'tap': 'tap',
  'uvu': 'uvu',
};

// ===========================================================================
// API route extraction patterns
// ===========================================================================

const ROUTE_PATTERNS: RegExp[] = [
  /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
];

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Parse a package.json string into a dependency graph.
 */
export function parseDependencyGraph(packageJsonContent: string): DependencyGraph {
  const pkg = JSON.parse(packageJsonContent) as Record<string, unknown>;
  const nodes: DependencyNode[] = [];
  const edges: DependencyGraph['edges'] = [];

  const rootName = (pkg.name as string) ?? 'root';

  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  for (const [name, version] of Object.entries(deps)) {
    nodes.push({ name, version, isDev: false });
    edges.push({ from: rootName, to: name, relation: 'requires' });
  }

  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  for (const [name, version] of Object.entries(devDeps)) {
    nodes.push({ name, version, isDev: true });
    edges.push({ from: rootName, to: name, relation: 'dev_requires' });
  }

  return { nodes, edges };
}

/**
 * Classify a list of file paths into categories.
 */
export function classifyFiles(filePaths: string[]): FileTopology {
  const entries: FileTopologyEntry[] = [];
  const summary: Record<FileCategory, number> = {
    entry_point: 0, config: 0, test: 0, api_route: 0, component: 0,
    utility: 0, type_definition: 0, documentation: 0, build: 0, unknown: 0,
  };

  for (const filePath of filePaths) {
    let bestCategory: FileCategory = 'unknown';
    let bestConfidence = 0;

    for (const { pattern, category, confidence } of CATEGORY_PATTERNS) {
      if (pattern.test(filePath) && confidence > bestConfidence) {
        bestCategory = category;
        bestConfidence = confidence;
      }
    }

    if (bestCategory === 'unknown') {
      bestConfidence = 0.5;
    }

    entries.push({ path: filePath, category: bestCategory, confidence: bestConfidence });
    summary[bestCategory]++;
  }

  return { entries, summary };
}

/**
 * Detect the runtime profile from package.json content and file list.
 */
export function detectRuntimeProfile(
  packageJsonContent: string,
  filePaths: string[],
): RuntimeProfile {
  const pkg = JSON.parse(packageJsonContent) as Record<string, unknown>;

  // Detect runtime
  const engines = (pkg.engines ?? {}) as Record<string, string>;
  let runtime: RuntimeProfile['runtime'] = 'unknown';
  let runtimeVersion: string | null = null;

  if (engines.node) {
    runtime = 'node';
    runtimeVersion = engines.node;
  } else if (engines.bun) {
    runtime = 'bun';
    runtimeVersion = engines.bun;
  } else if (filePaths.some((f) => f.includes('deno.json') || f.includes('deno.lock'))) {
    runtime = 'deno';
  } else {
    // Default to node if package.json exists
    runtime = 'node';
  }

  // Detect package manager
  let packageManager: RuntimeProfile['packageManager'] = 'unknown';
  if (filePaths.some((f) => f.endsWith('bun.lockb') || f.endsWith('bun.lock'))) {
    packageManager = 'bun';
  } else if (filePaths.some((f) => f.endsWith('pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (filePaths.some((f) => f.endsWith('yarn.lock'))) {
    packageManager = 'yarn';
  } else if (filePaths.some((f) => f.endsWith('package-lock.json'))) {
    packageManager = 'npm';
  }

  // Detect framework
  const allDeps = {
    ...(pkg.dependencies ?? {}) as Record<string, string>,
    ...(pkg.devDependencies ?? {}) as Record<string, string>,
  };

  let framework: string | null = null;
  for (const [depName, frameworkName] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (depName in allDeps) {
      framework = frameworkName;
      break;
    }
  }

  // Detect test runner
  let testRunner: string | null = null;
  for (const [depName, runnerName] of Object.entries(TEST_RUNNER_PATTERNS)) {
    if (depName in allDeps) {
      testRunner = runnerName;
      break;
    }
  }

  // Detect language
  const hasTsConfig = filePaths.some((f) => f.includes('tsconfig'));
  const hasTsFiles = filePaths.some((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const hasJsFiles = filePaths.some((f) => f.endsWith('.js') || f.endsWith('.jsx'));

  let language: RuntimeProfile['language'] = 'unknown';
  if (hasTsConfig || (hasTsFiles && !hasJsFiles)) {
    language = 'typescript';
  } else if (hasTsFiles && hasJsFiles) {
    language = 'mixed';
  } else if (hasJsFiles) {
    language = 'javascript';
  }

  // Detect module system
  const pkgType = pkg.type as string | undefined;
  let moduleSystem: RuntimeProfile['moduleSystem'] = 'unknown';
  if (pkgType === 'module') {
    moduleSystem = 'esm';
  } else if (pkgType === 'commonjs') {
    moduleSystem = 'commonjs';
  } else if (filePaths.some((f) => f.endsWith('.mjs'))) {
    moduleSystem = 'esm';
  } else if (filePaths.some((f) => f.endsWith('.cjs'))) {
    moduleSystem = 'commonjs';
  }

  return {
    runtime,
    runtimeVersion,
    packageManager,
    framework,
    testRunner,
    language,
    moduleSystem,
  };
}

/**
 * Extract API endpoints and exports from source file contents.
 */
export function extractAPISurface(
  files: Array<{ path: string; content: string }>,
): APISurface {
  const endpoints: APIEndpoint[] = [];
  const exportedFunctions: APISurface['exportedFunctions'] = [];
  const exportedTypes: APISurface['exportedTypes'] = [];

  for (const file of files) {
    const lines = file.content.split('\n');

    // Extract route definitions
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of ROUTE_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
          endpoints.push({
            method: match[1].toUpperCase(),
            path: match[2],
            file: file.path,
            line: i + 1,
          });
        }
      }
    }

    // Extract exported functions
    const fnPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
    let fnMatch: RegExpExecArray | null;
    while ((fnMatch = fnPattern.exec(file.content)) !== null) {
      exportedFunctions.push({ name: fnMatch[1], file: file.path });
    }

    // Extract exported types/interfaces
    const typePattern = /export\s+(?:type|interface)\s+(\w+)/g;
    let typeMatch: RegExpExecArray | null;
    while ((typeMatch = typePattern.exec(file.content)) !== null) {
      exportedTypes.push({ name: typeMatch[1], file: file.path });
    }
  }

  return { endpoints, exportedFunctions, exportedTypes };
}

/**
 * Analyze file change frequency from git log output.
 *
 * Expects lines in the format: "count\tfilename" (output of
 * `git log --format='' --name-only | sort | uniq -c | sort -rn`).
 */
export function analyzeChangeVelocity(
  gitLogLines: string[],
  period: string,
): ChangeVelocity {
  const entries: ChangeVelocityEntry[] = [];

  for (const line of gitLogLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^\s*(\d+)\s+(.+)$/);
    if (!match) continue;

    const changeCount = parseInt(match[1], 10);
    const file = match[2].trim();

    let riskLevel: ChangeVelocityEntry['riskLevel'] = 'low';
    if (changeCount >= 20) {
      riskLevel = 'high';
    } else if (changeCount >= 10) {
      riskLevel = 'medium';
    }

    entries.push({
      file,
      changeCount,
      lastChanged: new Date().toISOString(),
      riskLevel,
    });
  }

  // Sort by change count descending
  entries.sort((a, b) => b.changeCount - a.changeCount);

  // Top 10% are hotspots
  const hotspotCount = Math.max(1, Math.ceil(entries.length * 0.1));
  const hotspots = entries.slice(0, hotspotCount).map((e) => e.file);

  return { entries, hotspots, period };
}

/**
 * Build a complete world model from project data.
 */
export function buildWorldModel(params: {
  projectId: string;
  packageJsonContent: string;
  filePaths: string[];
  sourceFiles: Array<{ path: string; content: string }>;
  gitLogLines: string[];
  period: string;
}): WorldModel {
  const dependencies = parseDependencyGraph(params.packageJsonContent);
  const topology = classifyFiles(params.filePaths);
  const runtime = detectRuntimeProfile(params.packageJsonContent, params.filePaths);
  const apiSurface = extractAPISurface(params.sourceFiles);
  const velocity = analyzeChangeVelocity(params.gitLogLines, params.period);

  return {
    id: generateId(),
    projectId: params.projectId,
    dependencies,
    topology,
    runtime,
    apiSurface,
    velocity,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Serialize a world model to a memory-storable JSON string.
 */
export function serializeWorldModel(model: WorldModel): string {
  return JSON.stringify(model);
}

/**
 * Deserialize a world model from a JSON string.
 */
export function deserializeWorldModel(json: string): WorldModel {
  return JSON.parse(json) as WorldModel;
}
