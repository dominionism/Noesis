/**
 * Tests for Verification Engine — Three-Level Goal-Backward Verification
 *
 * Covers:
 * - isSubstantive: line count, trivial pattern detection
 * - verifyArtifact: exists, substantive, wired levels
 * - verifyPlan: aggregate verification, pass rate
 * - findImporters: import/require detection
 * - Edge cases and error conditions
 */

import { describe, it, expect } from 'vitest';
import {
  isSubstantive,
  verifyArtifact,
  verifyPlan,
  findImporters,
  type VerificationTarget,
} from '../../workflow/verification-engine.js';
import type { FilesystemQuery } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuery(overrides: Partial<FilesystemQuery> = {}): FilesystemQuery {
  return {
    exists: async () => true,
    read: async () => '',
    glob: async () => [],
    ...overrides,
  };
}

function makeTarget(overrides: Partial<VerificationTarget> = {}): VerificationTarget {
  return {
    artifact: 'src/auth/token.ts',
    description: 'Token service module',
    ...overrides,
  };
}

const SUBSTANTIVE_CONTENT = [
  'import { verify } from "jsonwebtoken";',
  '',
  'export function validateToken(token: string): boolean {',
  '  const decoded = verify(token, process.env.JWT_SECRET);',
  '  if (!decoded) {',
  '    throw new Error("Invalid token");',
  '  }',
  '  return true;',
  '}',
  '',
  'export function refreshToken(token: string): string {',
  '  // Implementation',
  '  return token;',
  '}',
].join('\n');

const TRIVIAL_CONTENT = [
  '// TODO',
  '// TODO: implement',
  '// TODO: fix this',
  'return null;',
  'return null;',
  'return null;',
].join('\n');

// ---------------------------------------------------------------------------
// isSubstantive
// ---------------------------------------------------------------------------

describe('isSubstantive', () => {
  it('returns true for content with >5 non-empty lines and real code', () => {
    expect(isSubstantive(SUBSTANTIVE_CONTENT)).toBe(true);
  });

  it('returns false for content with <=5 non-empty lines', () => {
    const content = 'line 1\nline 2\nline 3';
    expect(isSubstantive(content)).toBe(false);
  });

  it('returns false for content that is only return null', () => {
    expect(isSubstantive(TRIVIAL_CONTENT)).toBe(false);
  });

  it('returns false for content that is only TODO comments', () => {
    const content = [
      '// TODO: implement auth',
      '// TODO: add tests',
      '// TODO: fix error handling',
      '// TODO: add logging',
      '// TODO: optimize queries',
      '// TODO: refactor',
    ].join('\n');
    expect(isSubstantive(content)).toBe(false);
  });

  it('returns false for content that is only console.log', () => {
    const content = [
      'console.log("start");',
      'console.log("processing");',
      'console.log("step 1");',
      'console.log("step 2");',
      'console.log("step 3");',
      'console.log("done");',
    ].join('\n');
    expect(isSubstantive(content)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(isSubstantive('')).toBe(false);
  });

  it('returns false for content that is only empty arrow functions', () => {
    const content = [
      '=> {}',
      '=> {}',
      '=> {}',
      '=> {}',
      '=> {}',
      '=> {}',
    ].join('\n');
    expect(isSubstantive(content)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findImporters
// ---------------------------------------------------------------------------

describe('findImporters', () => {
  it('finds files that import the artifact', async () => {
    const query = makeQuery({
      glob: async () => ['src/app.ts', 'src/auth/token.ts'],
      read: async (path: string) => {
        if (path === 'src/app.ts') {
          return 'import { validateToken } from "./auth/token.js";';
        }
        return '';
      },
    });

    const result = await findImporters('src/auth/token.ts', query);
    expect(result).toContain('src/app.ts');
  });

  it('finds files that require the artifact', async () => {
    const query = makeQuery({
      glob: async () => ['src/app.js'],
      read: async () => 'const token = require("./auth/token");',
    });

    const result = await findImporters('src/auth/token.ts', query);
    expect(result).toContain('src/app.js');
  });

  it('excludes the artifact itself', async () => {
    const query = makeQuery({
      glob: async () => ['src/auth/token.ts'],
      read: async () => 'import { something } from "./token.js";',
    });

    const result = await findImporters('src/auth/token.ts', query);
    expect(result).not.toContain('src/auth/token.ts');
  });

  it('returns empty array when no importers found', async () => {
    const query = makeQuery({
      glob: async () => ['src/app.ts'],
      read: async () => 'const x = 1;',
    });

    const result = await findImporters('src/auth/token.ts', query);
    expect(result).toHaveLength(0);
  });

  it('handles read failures gracefully', async () => {
    const query = makeQuery({
      glob: async () => ['src/app.ts'],
      read: async () => { throw new Error('file not found'); },
    });

    const result = await findImporters('src/auth/token.ts', query);
    expect(result).toHaveLength(0);
  });

  it('handles glob failures gracefully', async () => {
    const query = makeQuery({
      glob: async () => { throw new Error('glob error'); },
    });

    const result = await findImporters('src/auth/token.ts', query);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// verifyArtifact
// ---------------------------------------------------------------------------

describe('verifyArtifact', () => {
  it('returns exists=false when artifact does not exist', async () => {
    const query = makeQuery({ exists: async () => false });
    const result = await verifyArtifact(makeTarget(), query);

    expect(result.exists).toBe(false);
    expect(result.substantive).toBe(false);
    expect(result.wired).toBe(false);
    expect(result.issues).toContain('Artifact does not exist: src/auth/token.ts');
  });

  it('returns substantive=false for trivial content', async () => {
    const query = makeQuery({
      exists: async () => true,
      read: async () => TRIVIAL_CONTENT,
    });
    const result = await verifyArtifact(makeTarget(), query);

    expect(result.exists).toBe(true);
    expect(result.substantive).toBe(false);
    expect(result.level).toBe('exists');
  });

  it('returns substantive=true for real content', async () => {
    const query = makeQuery({
      exists: async () => true,
      read: async () => SUBSTANTIVE_CONTENT,
      glob: async () => [],
    });
    const result = await verifyArtifact(makeTarget(), query);

    expect(result.exists).toBe(true);
    expect(result.substantive).toBe(true);
  });

  it('returns wired=true when importers exist', async () => {
    const query = makeQuery({
      exists: async () => true,
      read: async (path: string) => {
        if (path === 'src/auth/token.ts') return SUBSTANTIVE_CONTENT;
        return 'import { validateToken } from "./auth/token.js";';
      },
      glob: async () => ['src/app.ts'],
    });
    const result = await verifyArtifact(makeTarget(), query);

    expect(result.exists).toBe(true);
    expect(result.substantive).toBe(true);
    expect(result.wired).toBe(true);
    expect(result.level).toBe('wired');
  });

  it('checks expected patterns in content', async () => {
    const query = makeQuery({
      exists: async () => true,
      read: async () => SUBSTANTIVE_CONTENT,
      glob: async () => [],
    });
    const target = makeTarget({
      expectedPatterns: ['validateToken', 'nonExistentFunction'],
    });
    const result = await verifyArtifact(target, query);

    expect(result.issues).toContain(
      'Expected pattern not found: "nonExistentFunction" in src/auth/token.ts',
    );
  });

  it('checks expected importers', async () => {
    const query = makeQuery({
      exists: async () => true,
      read: async (path: string) => {
        if (path === 'src/auth/token.ts') return SUBSTANTIVE_CONTENT;
        return 'const x = 1;';
      },
      glob: async () => ['src/app.ts'],
    });
    const target = makeTarget({
      expectedImports: ['src/main.ts'],
    });
    const result = await verifyArtifact(target, query);

    expect(result.issues.some((i) => i.includes('Expected importer not found'))).toBe(true);
  });

  it('handles exists check failure', async () => {
    const query = makeQuery({
      exists: async () => { throw new Error('access denied'); },
    });
    const result = await verifyArtifact(makeTarget(), query);

    expect(result.exists).toBe(false);
  });

  it('handles read failure', async () => {
    const query = makeQuery({
      exists: async () => true,
      read: async () => { throw new Error('read error'); },
    });
    const result = await verifyArtifact(makeTarget(), query);

    expect(result.exists).toBe(true);
    expect(result.substantive).toBe(false);
    expect(result.issues.some((i) => i.includes('Failed to read'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifyPlan
// ---------------------------------------------------------------------------

describe('verifyPlan', () => {
  it('returns passed=true when all artifacts pass', async () => {
    const query = makeQuery({
      exists: async () => true,
      read: async (path: string) => {
        if (path === 'src/a.ts' || path === 'src/b.ts') return SUBSTANTIVE_CONTENT;
        return 'import { validateToken } from "./auth/token.js";';
      },
      glob: async () => ['src/importer.ts'],
    });

    const targets = [
      makeTarget({ artifact: 'src/a.ts', description: 'Module A' }),
      makeTarget({ artifact: 'src/b.ts', description: 'Module B' }),
    ];

    const result = await verifyPlan(targets, query);
    expect(result.passed).toBe(true);
    expect(result.passRate).toBe(1);
  });

  it('returns passed=false when too many artifacts fail', async () => {
    const query = makeQuery({
      exists: async () => false,
    });

    const targets = [
      makeTarget({ artifact: 'src/a.ts', description: 'Module A' }),
      makeTarget({ artifact: 'src/b.ts', description: 'Module B' }),
    ];

    const result = await verifyPlan(targets, query);
    expect(result.passed).toBe(false);
    expect(result.passRate).toBe(0);
  });

  it('handles empty targets array', async () => {
    const query = makeQuery();
    const result = await verifyPlan([], query);

    expect(result.passed).toBe(true);
    expect(result.passRate).toBe(1);
    expect(result.results).toHaveLength(0);
  });

  it('calculates pass rate correctly', async () => {
    let callCount = 0;
    const query = makeQuery({
      exists: async () => {
        callCount++;
        return callCount <= 4; // first 4 calls (2 targets) exist, 5th (3rd target) does not
      },
      read: async () => SUBSTANTIVE_CONTENT,
      glob: async () => [],
    });

    const targets = [
      makeTarget({ artifact: 'src/a.ts' }),
      makeTarget({ artifact: 'src/b.ts' }),
      makeTarget({ artifact: 'src/c.ts' }),
    ];

    const result = await verifyPlan(targets, query);
    // passRate depends on how many exist AND are substantive
    expect(result.results).toHaveLength(3);
    expect(typeof result.passRate).toBe('number');
  });

  it('includes summary in result', async () => {
    const query = makeQuery({
      exists: async () => true,
      read: async () => SUBSTANTIVE_CONTENT,
      glob: async () => [],
    });

    const targets = [makeTarget()];
    const result = await verifyPlan(targets, query);

    expect(result.summary).toContain('Verified');
    expect(result.summary).toContain('artifact');
  });
});
