/**
 * Tests for World Model
 *
 * Covers:
 * - parseDependencyGraph: package.json parsing, dev/prod separation
 * - classifyFiles: file path categorization, unknown fallback
 * - detectRuntimeProfile: runtime, package manager, framework, test runner detection
 * - extractAPISurface: route extraction, export detection
 * - analyzeChangeVelocity: frequency parsing, hotspot detection, risk levels
 * - buildWorldModel: full pipeline integration
 * - serializeWorldModel / deserializeWorldModel: round-trip
 */

import { describe, it, expect } from 'vitest';
import {
  parseDependencyGraph,
  classifyFiles,
  detectRuntimeProfile,
  extractAPISurface,
  analyzeChangeVelocity,
  buildWorldModel,
  serializeWorldModel,
  deserializeWorldModel,
} from '../../intelligence/world-model.js';

// ===========================================================================
// Helpers
// ===========================================================================

const MINIMAL_PACKAGE_JSON = JSON.stringify({
  name: 'test-project',
  version: '1.0.0',
  type: 'module',
  dependencies: {
    express: '^4.18.0',
    'better-sqlite3': '^9.0.0',
  },
  devDependencies: {
    vitest: '^1.0.0',
    typescript: '^5.0.0',
  },
  engines: {
    node: '>=18.0.0',
  },
});

// ===========================================================================
// parseDependencyGraph
// ===========================================================================

describe('parseDependencyGraph', () => {
  it('parses production dependencies', () => {
    const graph = parseDependencyGraph(MINIMAL_PACKAGE_JSON);
    const prodNodes = graph.nodes.filter((n) => !n.isDev);

    expect(prodNodes).toHaveLength(2);
    expect(prodNodes.map((n) => n.name)).toContain('express');
    expect(prodNodes.map((n) => n.name)).toContain('better-sqlite3');
  });

  it('parses dev dependencies', () => {
    const graph = parseDependencyGraph(MINIMAL_PACKAGE_JSON);
    const devNodes = graph.nodes.filter((n) => n.isDev);

    expect(devNodes).toHaveLength(2);
    expect(devNodes.map((n) => n.name)).toContain('vitest');
    expect(devNodes.map((n) => n.name)).toContain('typescript');
  });

  it('creates edges from root to each dependency', () => {
    const graph = parseDependencyGraph(MINIMAL_PACKAGE_JSON);

    expect(graph.edges.length).toBe(4);

    const requiresEdges = graph.edges.filter((e) => e.relation === 'requires');
    const devRequiresEdges = graph.edges.filter((e) => e.relation === 'dev_requires');

    expect(requiresEdges).toHaveLength(2);
    expect(devRequiresEdges).toHaveLength(2);

    for (const edge of graph.edges) {
      expect(edge.from).toBe('test-project');
    }
  });

  it('handles empty dependencies', () => {
    const pkg = JSON.stringify({ name: 'empty' });
    const graph = parseDependencyGraph(pkg);

    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it('includes version information', () => {
    const graph = parseDependencyGraph(MINIMAL_PACKAGE_JSON);
    const express = graph.nodes.find((n) => n.name === 'express')!;
    expect(express.version).toBe('^4.18.0');
  });
});

// ===========================================================================
// classifyFiles
// ===========================================================================

describe('classifyFiles', () => {
  it('classifies entry points', () => {
    const result = classifyFiles(['src/index.ts', 'src/main.ts']);
    expect(result.entries[0].category).toBe('entry_point');
    expect(result.summary.entry_point).toBe(2);
  });

  it('classifies config files', () => {
    const result = classifyFiles(['tsconfig.json', 'vitest.config.ts', 'app.config.js']);
    for (const entry of result.entries) {
      expect(entry.category).toBe('config');
    }
  });

  it('classifies test files', () => {
    const result = classifyFiles(['src/__tests__/foo.test.ts', 'lib/bar.spec.js']);
    for (const entry of result.entries) {
      expect(entry.category).toBe('test');
    }
  });

  it('classifies API route files', () => {
    const result = classifyFiles(['src/routes/users.ts', 'src/api/auth.ts']);
    for (const entry of result.entries) {
      expect(entry.category).toBe('api_route');
    }
  });

  it('classifies component files', () => {
    const result = classifyFiles(['src/components/Button.tsx', 'src/views/Home.tsx']);
    for (const entry of result.entries) {
      expect(entry.category).toBe('component');
    }
  });

  it('classifies utility files', () => {
    const result = classifyFiles(['src/utils/format.ts', 'src/helpers/parse.ts']);
    for (const entry of result.entries) {
      expect(entry.category).toBe('utility');
    }
  });

  it('classifies type definition files', () => {
    const result = classifyFiles(['src/types.ts', 'global.d.ts']);
    for (const entry of result.entries) {
      expect(entry.category).toBe('type_definition');
    }
  });

  it('classifies documentation files', () => {
    const result = classifyFiles(['README.md', 'docs/guide.mdx']);
    for (const entry of result.entries) {
      expect(entry.category).toBe('documentation');
    }
  });

  it('classifies build files', () => {
    const result = classifyFiles(['build/output.js', 'Dockerfile']);
    for (const entry of result.entries) {
      expect(entry.category).toBe('build');
    }
  });

  it('falls back to unknown for unrecognized paths', () => {
    const result = classifyFiles(['random-file.xyz']);
    expect(result.entries[0].category).toBe('unknown');
    expect(result.entries[0].confidence).toBe(0.5);
  });

  it('provides correct summary counts', () => {
    const result = classifyFiles([
      'src/index.ts',
      'src/__tests__/a.test.ts',
      'src/__tests__/b.test.ts',
      'tsconfig.json',
    ]);

    expect(result.summary.entry_point).toBe(1);
    expect(result.summary.test).toBe(2);
    expect(result.summary.config).toBe(1);
  });
});

// ===========================================================================
// detectRuntimeProfile
// ===========================================================================

describe('detectRuntimeProfile', () => {
  it('detects node runtime from engines', () => {
    const profile = detectRuntimeProfile(MINIMAL_PACKAGE_JSON, []);
    expect(profile.runtime).toBe('node');
    expect(profile.runtimeVersion).toBe('>=18.0.0');
  });

  it('detects bun runtime from engines', () => {
    const pkg = JSON.stringify({ engines: { bun: '>=1.0.0' } });
    const profile = detectRuntimeProfile(pkg, []);
    expect(profile.runtime).toBe('bun');
  });

  it('detects deno runtime from deno.json presence', () => {
    const pkg = JSON.stringify({});
    const profile = detectRuntimeProfile(pkg, ['deno.json', 'src/main.ts']);
    expect(profile.runtime).toBe('deno');
  });

  it('detects npm package manager', () => {
    const profile = detectRuntimeProfile(MINIMAL_PACKAGE_JSON, ['package-lock.json']);
    expect(profile.packageManager).toBe('npm');
  });

  it('detects yarn package manager', () => {
    const profile = detectRuntimeProfile(MINIMAL_PACKAGE_JSON, ['yarn.lock']);
    expect(profile.packageManager).toBe('yarn');
  });

  it('detects pnpm package manager', () => {
    const profile = detectRuntimeProfile(MINIMAL_PACKAGE_JSON, ['pnpm-lock.yaml']);
    expect(profile.packageManager).toBe('pnpm');
  });

  it('detects bun package manager', () => {
    const profile = detectRuntimeProfile(MINIMAL_PACKAGE_JSON, ['bun.lockb']);
    expect(profile.packageManager).toBe('bun');
  });

  it('detects Express framework', () => {
    const profile = detectRuntimeProfile(MINIMAL_PACKAGE_JSON, []);
    expect(profile.framework).toBe('Express');
  });

  it('detects vitest test runner', () => {
    const profile = detectRuntimeProfile(MINIMAL_PACKAGE_JSON, []);
    expect(profile.testRunner).toBe('vitest');
  });

  it('detects TypeScript language', () => {
    const profile = detectRuntimeProfile(MINIMAL_PACKAGE_JSON, ['tsconfig.json', 'src/index.ts']);
    expect(profile.language).toBe('typescript');
  });

  it('detects ESM module system', () => {
    const profile = detectRuntimeProfile(MINIMAL_PACKAGE_JSON, []);
    expect(profile.moduleSystem).toBe('esm');
  });

  it('detects CommonJS module system', () => {
    const pkg = JSON.stringify({ type: 'commonjs' });
    const profile = detectRuntimeProfile(pkg, []);
    expect(profile.moduleSystem).toBe('commonjs');
  });

  it('handles minimal package.json', () => {
    const pkg = JSON.stringify({});
    const profile = detectRuntimeProfile(pkg, []);
    expect(profile.runtime).toBe('node'); // defaults to node
    expect(profile.framework).toBeNull();
    expect(profile.testRunner).toBeNull();
  });
});

// ===========================================================================
// extractAPISurface
// ===========================================================================

describe('extractAPISurface', () => {
  it('extracts route definitions', () => {
    const files = [{
      path: 'src/routes/users.ts',
      content: `
        app.get('/api/users', handler);
        app.post('/api/users', createHandler);
        app.delete('/api/users/:id', deleteHandler);
      `,
    }];

    const surface = extractAPISurface(files);
    expect(surface.endpoints).toHaveLength(3);
    expect(surface.endpoints[0].method).toBe('GET');
    expect(surface.endpoints[0].path).toBe('/api/users');
    expect(surface.endpoints[1].method).toBe('POST');
    expect(surface.endpoints[2].method).toBe('DELETE');
  });

  it('extracts router-based routes', () => {
    const files = [{
      path: 'src/routes/auth.ts',
      content: `router.post('/login', loginHandler);`,
    }];

    const surface = extractAPISurface(files);
    expect(surface.endpoints).toHaveLength(1);
    expect(surface.endpoints[0].method).toBe('POST');
    expect(surface.endpoints[0].path).toBe('/login');
  });

  it('extracts exported functions', () => {
    const files = [{
      path: 'src/utils.ts',
      content: `
        export function parseInput(data: string) { }
        export async function fetchData() { }
        function internalHelper() { }
      `,
    }];

    const surface = extractAPISurface(files);
    expect(surface.exportedFunctions).toHaveLength(2);
    expect(surface.exportedFunctions.map((f) => f.name)).toContain('parseInput');
    expect(surface.exportedFunctions.map((f) => f.name)).toContain('fetchData');
    expect(surface.exportedFunctions.map((f) => f.name)).not.toContain('internalHelper');
  });

  it('extracts exported types and interfaces', () => {
    const files = [{
      path: 'src/types.ts',
      content: `
        export interface UserProfile { }
        export type Status = 'active' | 'inactive';
        interface InternalType { }
      `,
    }];

    const surface = extractAPISurface(files);
    expect(surface.exportedTypes).toHaveLength(2);
    expect(surface.exportedTypes.map((t) => t.name)).toContain('UserProfile');
    expect(surface.exportedTypes.map((t) => t.name)).toContain('Status');
  });

  it('handles empty file list', () => {
    const surface = extractAPISurface([]);
    expect(surface.endpoints).toHaveLength(0);
    expect(surface.exportedFunctions).toHaveLength(0);
    expect(surface.exportedTypes).toHaveLength(0);
  });

  it('tracks file and line for endpoints', () => {
    const files = [{
      path: 'src/routes.ts',
      content: `// comment\napp.get('/health', handler);`,
    }];

    const surface = extractAPISurface(files);
    expect(surface.endpoints[0].file).toBe('src/routes.ts');
    expect(surface.endpoints[0].line).toBe(2);
  });
});

// ===========================================================================
// analyzeChangeVelocity
// ===========================================================================

describe('analyzeChangeVelocity', () => {
  it('parses git log lines with counts', () => {
    const lines = [
      '  25 src/index.ts',
      '  15 src/utils.ts',
      '   5 README.md',
    ];

    const result = analyzeChangeVelocity(lines, '30d');
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].changeCount).toBe(25);
    expect(result.entries[0].file).toBe('src/index.ts');
  });

  it('sorts entries by change count descending', () => {
    const lines = [
      '   5 a.ts',
      '  20 b.ts',
      '  10 c.ts',
    ];

    const result = analyzeChangeVelocity(lines, '30d');
    expect(result.entries[0].file).toBe('b.ts');
    expect(result.entries[1].file).toBe('c.ts');
    expect(result.entries[2].file).toBe('a.ts');
  });

  it('assigns risk levels based on change count', () => {
    const lines = [
      '  25 high-risk.ts',
      '  15 medium-risk.ts',
      '   5 low-risk.ts',
    ];

    const result = analyzeChangeVelocity(lines, '30d');
    expect(result.entries[0].riskLevel).toBe('high');
    expect(result.entries[1].riskLevel).toBe('medium');
    expect(result.entries[2].riskLevel).toBe('low');
  });

  it('identifies hotspots as top 10%', () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      `  ${20 - i} file${i}.ts`,
    );

    const result = analyzeChangeVelocity(lines, '30d');
    // Top 10% of 20 = 2 hotspots
    expect(result.hotspots.length).toBe(2);
    expect(result.hotspots[0]).toBe('file0.ts');
    expect(result.hotspots[1]).toBe('file1.ts');
  });

  it('handles empty input', () => {
    const result = analyzeChangeVelocity([], '30d');
    expect(result.entries).toHaveLength(0);
    expect(result.hotspots).toHaveLength(0);
  });

  it('skips malformed lines', () => {
    const lines = ['not a valid line', '', '  10 valid.ts'];
    const result = analyzeChangeVelocity(lines, '30d');
    expect(result.entries).toHaveLength(1);
  });

  it('preserves period', () => {
    const result = analyzeChangeVelocity([], '90d');
    expect(result.period).toBe('90d');
  });
});

// ===========================================================================
// buildWorldModel
// ===========================================================================

describe('buildWorldModel', () => {
  it('builds a complete world model from project data', () => {
    const model = buildWorldModel({
      projectId: 'proj-1',
      packageJsonContent: MINIMAL_PACKAGE_JSON,
      filePaths: ['src/index.ts', 'tsconfig.json', 'package-lock.json'],
      sourceFiles: [{
        path: 'src/index.ts',
        content: 'export function main() { }',
      }],
      gitLogLines: ['  10 src/index.ts'],
      period: '30d',
    });

    expect(model.id).toBeTruthy();
    expect(model.projectId).toBe('proj-1');
    expect(model.dependencies.nodes.length).toBeGreaterThan(0);
    expect(model.topology.entries.length).toBe(3);
    expect(model.runtime.runtime).toBe('node');
    expect(model.apiSurface.exportedFunctions.length).toBe(1);
    expect(model.velocity.entries.length).toBe(1);
    expect(model.generatedAt).toBeTruthy();
  });
});

// ===========================================================================
// serializeWorldModel / deserializeWorldModel
// ===========================================================================

describe('serializeWorldModel / deserializeWorldModel', () => {
  it('round-trips a world model through JSON', () => {
    const model = buildWorldModel({
      projectId: 'proj-rt',
      packageJsonContent: JSON.stringify({ name: 'rt' }),
      filePaths: ['src/app.ts'],
      sourceFiles: [],
      gitLogLines: [],
      period: '7d',
    });

    const json = serializeWorldModel(model);
    const restored = deserializeWorldModel(json);

    expect(restored.id).toBe(model.id);
    expect(restored.projectId).toBe(model.projectId);
    expect(restored.runtime.runtime).toBe(model.runtime.runtime);
    expect(restored.generatedAt).toBe(model.generatedAt);
  });
});
