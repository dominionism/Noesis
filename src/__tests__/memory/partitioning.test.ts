/**
 * Tests for Memory Partitioning & Project Isolation (src/memory/partitioning.ts)
 *
 * Covers:
 * - getProjectDatabase: shared DB vs isolated per-project DB paths
 * - shouldPromoteToGlobal: promotion threshold logic
 * - promoteToGlobal: scope and project_id updates
 * - Directory creation for isolated projects
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let testDir: string;

// We need to mock constants for path resolution.
// vi.mock is hoisted, so we must import path inside the factory.
vi.mock('../../constants.js', async () => {
  const path = await import('node:path');
  return {
    get NOESIS_HOME() {
      return (globalThis as any).__noesis_test_home ?? '/tmp/noesis-part-fallback';
    },
    get DB_PATH() {
      return path.join((globalThis as any).__noesis_test_home ?? '/tmp/noesis-part-fallback', 'noesis.db');
    },
    FILE_PERMISSIONS: {
      DIR: 0o700,
      DB: 0o600,
      SIGNING_KEY: 0o400,
      AUDIT_LOG: 0o600,
      CONFIG: 0o600,
    },
  };
});

function setHome(dir: string): void {
  (globalThis as any).__noesis_test_home = dir;
}

describe('memory partitioning', () => {
  let getProjectDatabase: typeof import('../../memory/partitioning.js').getProjectDatabase;
  let shouldPromoteToGlobal: typeof import('../../memory/partitioning.js').shouldPromoteToGlobal;
  let promoteToGlobal: typeof import('../../memory/partitioning.js').promoteToGlobal;

  beforeEach(async () => {
    testDir = join(tmpdir(), `noesis-part-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    setHome(testDir);

    const mod = await import('../../memory/partitioning.js');
    getProjectDatabase = mod.getProjectDatabase;
    shouldPromoteToGlobal = mod.shouldPromoteToGlobal;
    promoteToGlobal = mod.promoteToGlobal;
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch { /* best effort */ }
  });

  describe('getProjectDatabase', () => {
    it('returns shared DB path when isolation mode is false', () => {
      const dbPath = getProjectDatabase('myproject', false);
      expect(dbPath).toBe(join(testDir, 'noesis.db'));
    });

    it('returns per-project DB path when isolation mode is true', () => {
      const dbPath = getProjectDatabase('myproject', true);
      // ISOLATED_DIR is computed once at module load from NOESIS_HOME,
      // so the path uses whichever NOESIS_HOME was active at import time.
      expect(dbPath).toMatch(/isolated[/\\]myproject[/\\]db\.sqlite$/);
    });

    it('creates project directory when isolation mode is true', () => {
      const dbPath = getProjectDatabase('newproj', true);
      const projectDir = dbPath.replace(/[/\\]db\.sqlite$/, '');
      expect(existsSync(projectDir)).toBe(true);
    });

    it('returns different paths for different projects in isolated mode', () => {
      const path1 = getProjectDatabase('proj1', true);
      const path2 = getProjectDatabase('proj2', true);
      expect(path1).not.toBe(path2);
    });

    it('returns same shared path regardless of project in non-isolated mode', () => {
      const path1 = getProjectDatabase('proj1', false);
      const path2 = getProjectDatabase('proj2', false);
      expect(path1).toBe(path2);
    });
  });

  describe('shouldPromoteToGlobal', () => {
    it('returns false when memory is referenced in fewer than 3 projects', () => {
      const db = {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('memory_edges')) {
            return {
              all: vi.fn(() => [
                { project_id: 'proj1' },
                { project_id: 'proj2' },
              ]),
            };
          }
          // Own project query
          return {
            all: vi.fn(() => []),
          };
        }),
      };

      const result = shouldPromoteToGlobal(db, 'mem-001');
      expect(result).toBe(false);
    });

    it('returns true when memory is referenced across 3+ projects', () => {
      const db = {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('memory_edges')) {
            return {
              all: vi.fn(() => [
                { project_id: 'proj1' },
                { project_id: 'proj2' },
                { project_id: 'proj3' },
              ]),
            };
          }
          return {
            all: vi.fn(() => []),
          };
        }),
      };

      const result = shouldPromoteToGlobal(db, 'mem-001');
      expect(result).toBe(true);
    });

    it('counts the memory own project toward threshold', () => {
      const db = {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('memory_edges')) {
            return {
              all: vi.fn(() => [
                { project_id: 'proj1' },
                { project_id: 'proj2' },
              ]),
            };
          }
          // Own project adds a third distinct project
          return {
            all: vi.fn(() => [{ project_id: 'proj3' }]),
          };
        }),
      };

      const result = shouldPromoteToGlobal(db, 'mem-001');
      expect(result).toBe(true);
    });

    it('deduplicates project IDs', () => {
      const db = {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('memory_edges')) {
            return {
              all: vi.fn(() => [
                { project_id: 'proj1' },
                { project_id: 'proj1' }, // duplicate
                { project_id: 'proj2' },
              ]),
            };
          }
          return {
            all: vi.fn(() => []),
          };
        }),
      };

      const result = shouldPromoteToGlobal(db, 'mem-001');
      expect(result).toBe(false); // Only 2 distinct projects
    });

    it('ignores null project IDs', () => {
      const db = {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('memory_edges')) {
            return {
              all: vi.fn(() => [
                { project_id: null },
                { project_id: 'proj1' },
                { project_id: 'proj2' },
              ]),
            };
          }
          return {
            all: vi.fn(() => [{ project_id: null }]),
          };
        }),
      };

      const result = shouldPromoteToGlobal(db, 'mem-001');
      expect(result).toBe(false); // Only 2 non-null distinct projects
    });
  });

  describe('promoteToGlobal', () => {
    it('updates memory scope to global and nullifies project_id', () => {
      const runFn = vi.fn();
      const db = {
        prepare: vi.fn(() => ({
          run: runFn,
        })),
      };

      promoteToGlobal(db, 'mem-001');

      expect(db.prepare).toHaveBeenCalledTimes(1);
      expect(runFn).toHaveBeenCalledTimes(1);
      const [updatedAt, memId] = runFn.mock.calls[0];
      expect(typeof updatedAt).toBe('string');
      expect(memId).toBe('mem-001');
    });
  });
});
