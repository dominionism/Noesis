/**
 * Tests for src/constants.ts
 *
 * Validates that all exported constants have the correct types, values,
 * and relationships. Constants are the foundation of the security model
 * (file permissions, thresholds, paths), so correctness is critical.
 */

import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  NOESIS_HOME,
  DB_PATH,
  SIGNING_KEY_PATH,
  AUDIT_LOG_PATH,
  DAEMON_SOCKET_PATH,
  DAEMON_PID_PATH,
  COLD_STORAGE_DIR,
  BACKUPS_DIR,
  MODELS_DIR,
  MEMORY_DIR,
  SKILLS_DIR,
  ANTI_PATTERNS_DIR,
  CONFIG_PATH,
  PROMPTS_DIR,
  RULES_DIR,
  CAPSULES_DIR,
  AGENTS_DIR,
  COMMANDS_DIR,
  CONTEXTS_DIR,
  HOOKS_DIR,
  ADAPTERS_DIR,
  PROJECTS_DIR,
  SCRIPTS_DIR,
  GSD_DIR,
  SHELL_DIR,
  MANIFEST_PATH,
  SYNC_SCRIPT_PATH,
  HOT_MEMORY_LINE_LIMIT,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  SCHEMA_VERSION,
  AUDIT_MAX_MB,
  COLD_STORAGE_MAX_MB,
  DEFAULT_RETENTION_DAYS,
  MAX_MEMORIES,
  MAX_MEMORY_TOKENS,
  MAX_RETRIEVAL_RESULTS,
  RRF_K,
  CONFLICT_SIMILARITY_THRESHOLD,
  CLUSTERING_SIMILARITY_THRESHOLD,
  CLUSTERING_MIN_SIZE,
  CLUSTERING_K_NEIGHBORS,
  COLD_START_SIMILARITY_THRESHOLD,
  COLD_START_MIN_SIZE,
  COLD_START_MEMORY_COUNT,
  EPSILON_GREEDY,
  MAX_GRAPH_DEPTH,
  MAX_GRAPH_FANOUT,
  CONFIDENCE_DECAY_MONTHLY,
  ENTROPY_THRESHOLD,
  SCORING_WEIGHTS,
  EMBEDDING_CACHE_SIZE,
  RESULT_CACHE_SIZE,
  DAEMON_IDLE_TIMEOUT_MS,
  READINESS_THRESHOLD_TOTAL,
  READINESS_THRESHOLD_CLARITY,
  READINESS_THRESHOLD_CODEBASE,
  MAX_CRITIC_CYCLES,
  CONTEXT_SNAPSHOT_TOKEN_BUDGET,
  CONTEXT_SNAPSHOT_TOP_SKILLS,
  CONTEXT_SNAPSHOT_TOP_ANTIPATTERNS,
  TOKEN_BUDGETS,
  FILE_PERMISSIONS,
  MANAGED_SECTION_MARKER,
  MANAGED_SECTION_VERSION,
  EDGE_RELATIONS,
} from '../constants.js';

describe('constants', () => {
  // -----------------------------------------------------------------------
  // Base directory
  // -----------------------------------------------------------------------

  describe('NOESIS_HOME', () => {
    it('resolves to ~/.agents', () => {
      expect(NOESIS_HOME).toBe(join(homedir(), '.agents'));
    });

    it('is an absolute path', () => {
      expect(NOESIS_HOME.startsWith('/')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // File / directory paths
  // -----------------------------------------------------------------------

  describe('file and directory paths', () => {
    it('DB_PATH is within NOESIS_HOME', () => {
      expect(DB_PATH).toBe(join(NOESIS_HOME, 'noesis.db'));
    });

    it('SIGNING_KEY_PATH is within NOESIS_HOME', () => {
      expect(SIGNING_KEY_PATH).toBe(join(NOESIS_HOME, '.signing_key'));
    });

    it('AUDIT_LOG_PATH is within NOESIS_HOME', () => {
      expect(AUDIT_LOG_PATH).toBe(join(NOESIS_HOME, 'audit.log'));
    });

    it('DAEMON_SOCKET_PATH is within NOESIS_HOME', () => {
      expect(DAEMON_SOCKET_PATH).toBe(join(NOESIS_HOME, 'daemon.sock'));
    });

    it('DAEMON_PID_PATH is within NOESIS_HOME', () => {
      expect(DAEMON_PID_PATH).toBe(join(NOESIS_HOME, 'daemon.pid'));
    });

    it('COLD_STORAGE_DIR is within NOESIS_HOME', () => {
      expect(COLD_STORAGE_DIR).toBe(join(NOESIS_HOME, 'cold'));
    });

    it('BACKUPS_DIR is within NOESIS_HOME', () => {
      expect(BACKUPS_DIR).toBe(join(NOESIS_HOME, 'backups'));
    });

    it('MODELS_DIR is within NOESIS_HOME', () => {
      expect(MODELS_DIR).toBe(join(NOESIS_HOME, 'models'));
    });

    it('MEMORY_DIR is within NOESIS_HOME', () => {
      expect(MEMORY_DIR).toBe(join(NOESIS_HOME, 'memory'));
    });

    it('SKILLS_DIR is within NOESIS_HOME', () => {
      expect(SKILLS_DIR).toBe(join(NOESIS_HOME, 'skills'));
    });

    it('ANTI_PATTERNS_DIR is within NOESIS_HOME', () => {
      expect(ANTI_PATTERNS_DIR).toBe(join(NOESIS_HOME, 'anti-patterns'));
    });

    it('CONFIG_PATH is within NOESIS_HOME', () => {
      expect(CONFIG_PATH).toBe(join(NOESIS_HOME, 'noesis.yaml'));
    });

    it('all paths start with NOESIS_HOME', () => {
      const allPaths = [
        DB_PATH, SIGNING_KEY_PATH, AUDIT_LOG_PATH, DAEMON_SOCKET_PATH,
        DAEMON_PID_PATH, COLD_STORAGE_DIR, BACKUPS_DIR, MODELS_DIR,
        MEMORY_DIR, SKILLS_DIR, ANTI_PATTERNS_DIR, CONFIG_PATH,
        PROMPTS_DIR, RULES_DIR, CAPSULES_DIR, AGENTS_DIR, COMMANDS_DIR,
        CONTEXTS_DIR, HOOKS_DIR, ADAPTERS_DIR, PROJECTS_DIR, SCRIPTS_DIR,
        GSD_DIR, SHELL_DIR, MANIFEST_PATH, SYNC_SCRIPT_PATH,
      ];

      for (const p of allPaths) {
        expect(p.startsWith(NOESIS_HOME)).toBe(true);
      }
    });
  });

  describe('workflow and orchestration directories', () => {
    it('PROMPTS_DIR is within NOESIS_HOME', () => {
      expect(PROMPTS_DIR).toBe(join(NOESIS_HOME, 'prompts'));
    });

    it('RULES_DIR is within NOESIS_HOME', () => {
      expect(RULES_DIR).toBe(join(NOESIS_HOME, 'rules'));
    });

    it('CAPSULES_DIR is within NOESIS_HOME', () => {
      expect(CAPSULES_DIR).toBe(join(NOESIS_HOME, 'capsules'));
    });

    it('AGENTS_DIR is within NOESIS_HOME', () => {
      expect(AGENTS_DIR).toBe(join(NOESIS_HOME, 'agents'));
    });

    it('COMMANDS_DIR is within NOESIS_HOME', () => {
      expect(COMMANDS_DIR).toBe(join(NOESIS_HOME, 'commands'));
    });

    it('CONTEXTS_DIR is within NOESIS_HOME', () => {
      expect(CONTEXTS_DIR).toBe(join(NOESIS_HOME, 'contexts'));
    });

    it('HOOKS_DIR is within NOESIS_HOME', () => {
      expect(HOOKS_DIR).toBe(join(NOESIS_HOME, 'hooks'));
    });

    it('ADAPTERS_DIR is within NOESIS_HOME', () => {
      expect(ADAPTERS_DIR).toBe(join(NOESIS_HOME, 'adapters'));
    });

    it('PROJECTS_DIR is within NOESIS_HOME', () => {
      expect(PROJECTS_DIR).toBe(join(NOESIS_HOME, 'projects'));
    });

    it('SCRIPTS_DIR is within NOESIS_HOME', () => {
      expect(SCRIPTS_DIR).toBe(join(NOESIS_HOME, 'scripts'));
    });

    it('GSD_DIR is within NOESIS_HOME', () => {
      expect(GSD_DIR).toBe(join(NOESIS_HOME, 'get-shit-done'));
    });

    it('SHELL_DIR is within NOESIS_HOME', () => {
      expect(SHELL_DIR).toBe(join(NOESIS_HOME, 'shell'));
    });

    it('MANIFEST_PATH is within NOESIS_HOME', () => {
      expect(MANIFEST_PATH).toBe(join(NOESIS_HOME, 'manifest.json'));
    });

    it('SYNC_SCRIPT_PATH is within NOESIS_HOME', () => {
      expect(SYNC_SCRIPT_PATH).toBe(join(NOESIS_HOME, 'sync.sh'));
    });
  });

  // -----------------------------------------------------------------------
  // Numeric limits
  // -----------------------------------------------------------------------

  describe('numeric limits', () => {
    it('HOT_MEMORY_LINE_LIMIT is a positive integer', () => {
      expect(HOT_MEMORY_LINE_LIMIT).toBe(2000);
      expect(Number.isInteger(HOT_MEMORY_LINE_LIMIT)).toBe(true);
    });

    it('EMBEDDING_DIMENSIONS is a positive integer', () => {
      expect(EMBEDDING_DIMENSIONS).toBe(384);
      expect(Number.isInteger(EMBEDDING_DIMENSIONS)).toBe(true);
    });

    it('EMBEDDING_MODEL_ID is a non-empty string', () => {
      expect(EMBEDDING_MODEL_ID).toBe('snowflake-arctic-embed-s');
      expect(EMBEDDING_MODEL_ID.length).toBeGreaterThan(0);
    });

    it('SCHEMA_VERSION is a positive integer', () => {
      expect(SCHEMA_VERSION).toBe(3);
      expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
      expect(SCHEMA_VERSION).toBeGreaterThan(0);
    });

    it('AUDIT_MAX_MB is a positive number', () => {
      expect(AUDIT_MAX_MB).toBe(10);
      expect(AUDIT_MAX_MB).toBeGreaterThan(0);
    });

    it('COLD_STORAGE_MAX_MB is a positive number', () => {
      expect(COLD_STORAGE_MAX_MB).toBe(50);
      expect(COLD_STORAGE_MAX_MB).toBeGreaterThan(0);
    });

    it('DEFAULT_RETENTION_DAYS is a positive integer', () => {
      expect(DEFAULT_RETENTION_DAYS).toBe(180);
      expect(Number.isInteger(DEFAULT_RETENTION_DAYS)).toBe(true);
      expect(DEFAULT_RETENTION_DAYS).toBeGreaterThan(0);
    });

    it('MAX_MEMORIES is a positive integer', () => {
      expect(MAX_MEMORIES).toBe(10_000);
      expect(Number.isInteger(MAX_MEMORIES)).toBe(true);
    });

    it('MAX_MEMORY_TOKENS is a positive integer', () => {
      expect(MAX_MEMORY_TOKENS).toBe(2000);
      expect(Number.isInteger(MAX_MEMORY_TOKENS)).toBe(true);
    });

    it('MAX_RETRIEVAL_RESULTS is a positive integer', () => {
      expect(MAX_RETRIEVAL_RESULTS).toBe(20);
      expect(Number.isInteger(MAX_RETRIEVAL_RESULTS)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Retrieval algorithm parameters
  // -----------------------------------------------------------------------

  describe('retrieval algorithm parameters', () => {
    it('RRF_K is a positive integer', () => {
      expect(RRF_K).toBe(60);
      expect(Number.isInteger(RRF_K)).toBe(true);
    });

    it('CONFLICT_SIMILARITY_THRESHOLD is between 0 and 1', () => {
      expect(CONFLICT_SIMILARITY_THRESHOLD).toBe(0.70);
      expect(CONFLICT_SIMILARITY_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(CONFLICT_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1);
    });

    it('CLUSTERING_SIMILARITY_THRESHOLD is between 0 and 1', () => {
      expect(CLUSTERING_SIMILARITY_THRESHOLD).toBe(0.80);
      expect(CLUSTERING_SIMILARITY_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(CLUSTERING_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1);
    });

    it('CLUSTERING_MIN_SIZE is a positive integer', () => {
      expect(CLUSTERING_MIN_SIZE).toBe(3);
      expect(Number.isInteger(CLUSTERING_MIN_SIZE)).toBe(true);
    });

    it('CLUSTERING_K_NEIGHBORS is a positive integer', () => {
      expect(CLUSTERING_K_NEIGHBORS).toBe(20);
      expect(Number.isInteger(CLUSTERING_K_NEIGHBORS)).toBe(true);
    });

    it('COLD_START_SIMILARITY_THRESHOLD is between 0 and 1', () => {
      expect(COLD_START_SIMILARITY_THRESHOLD).toBe(0.75);
      expect(COLD_START_SIMILARITY_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(COLD_START_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1);
    });

    it('COLD_START_MIN_SIZE is a positive integer', () => {
      expect(COLD_START_MIN_SIZE).toBe(2);
      expect(Number.isInteger(COLD_START_MIN_SIZE)).toBe(true);
    });

    it('COLD_START_MEMORY_COUNT is a positive integer', () => {
      expect(COLD_START_MEMORY_COUNT).toBe(50);
      expect(Number.isInteger(COLD_START_MEMORY_COUNT)).toBe(true);
    });

    it('EPSILON_GREEDY is between 0 and 1', () => {
      expect(EPSILON_GREEDY).toBe(0.1);
      expect(EPSILON_GREEDY).toBeGreaterThanOrEqual(0);
      expect(EPSILON_GREEDY).toBeLessThanOrEqual(1);
    });

    it('MAX_GRAPH_DEPTH is a positive integer', () => {
      expect(MAX_GRAPH_DEPTH).toBe(3);
      expect(Number.isInteger(MAX_GRAPH_DEPTH)).toBe(true);
    });

    it('MAX_GRAPH_FANOUT is a positive integer', () => {
      expect(MAX_GRAPH_FANOUT).toBe(10);
      expect(Number.isInteger(MAX_GRAPH_FANOUT)).toBe(true);
    });

    it('CONFIDENCE_DECAY_MONTHLY is a small positive number', () => {
      expect(CONFIDENCE_DECAY_MONTHLY).toBe(0.02);
      expect(CONFIDENCE_DECAY_MONTHLY).toBeGreaterThan(0);
      expect(CONFIDENCE_DECAY_MONTHLY).toBeLessThan(1);
    });

    it('ENTROPY_THRESHOLD is a positive number used for secret detection', () => {
      expect(ENTROPY_THRESHOLD).toBe(4.5);
      expect(ENTROPY_THRESHOLD).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Scoring weights
  // -----------------------------------------------------------------------

  describe('SCORING_WEIGHTS', () => {
    it('contains all five scoring factors', () => {
      expect(SCORING_WEIGHTS).toHaveProperty('fts');
      expect(SCORING_WEIGHTS).toHaveProperty('vector');
      expect(SCORING_WEIGHTS).toHaveProperty('recency');
      expect(SCORING_WEIGHTS).toHaveProperty('confidence');
      expect(SCORING_WEIGHTS).toHaveProperty('graph');
    });

    it('weights sum to 1.0', () => {
      const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('all weights are positive', () => {
      for (const [key, value] of Object.entries(SCORING_WEIGHTS)) {
        expect(value).toBeGreaterThan(0);
      }
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(SCORING_WEIGHTS)).toBe(true);
    });

    it('has exactly 5 keys', () => {
      expect(Object.keys(SCORING_WEIGHTS)).toHaveLength(5);
    });
  });

  // -----------------------------------------------------------------------
  // Cache sizes
  // -----------------------------------------------------------------------

  describe('cache sizes', () => {
    it('EMBEDDING_CACHE_SIZE is a positive integer', () => {
      expect(EMBEDDING_CACHE_SIZE).toBe(100);
      expect(Number.isInteger(EMBEDDING_CACHE_SIZE)).toBe(true);
    });

    it('RESULT_CACHE_SIZE is a positive integer', () => {
      expect(RESULT_CACHE_SIZE).toBe(50);
      expect(Number.isInteger(RESULT_CACHE_SIZE)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Daemon
  // -----------------------------------------------------------------------

  describe('daemon constants', () => {
    it('DAEMON_IDLE_TIMEOUT_MS is 10 minutes in ms', () => {
      expect(DAEMON_IDLE_TIMEOUT_MS).toBe(600_000);
    });
  });

  // -----------------------------------------------------------------------
  // Workflow parameters
  // -----------------------------------------------------------------------

  describe('workflow parameters', () => {
    it('READINESS_THRESHOLD_TOTAL is 70', () => {
      expect(READINESS_THRESHOLD_TOTAL).toBe(70);
    });

    it('READINESS_THRESHOLD_CLARITY is 15', () => {
      expect(READINESS_THRESHOLD_CLARITY).toBe(15);
    });

    it('READINESS_THRESHOLD_CODEBASE is 15', () => {
      expect(READINESS_THRESHOLD_CODEBASE).toBe(15);
    });

    it('MAX_CRITIC_CYCLES is a positive integer', () => {
      expect(MAX_CRITIC_CYCLES).toBe(2);
      expect(Number.isInteger(MAX_CRITIC_CYCLES)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Context snapshot budgets
  // -----------------------------------------------------------------------

  describe('context snapshot budgets', () => {
    it('CONTEXT_SNAPSHOT_TOKEN_BUDGET is positive', () => {
      expect(CONTEXT_SNAPSHOT_TOKEN_BUDGET).toBe(1000);
      expect(CONTEXT_SNAPSHOT_TOKEN_BUDGET).toBeGreaterThan(0);
    });

    it('CONTEXT_SNAPSHOT_TOP_SKILLS is positive', () => {
      expect(CONTEXT_SNAPSHOT_TOP_SKILLS).toBe(5);
      expect(CONTEXT_SNAPSHOT_TOP_SKILLS).toBeGreaterThan(0);
    });

    it('CONTEXT_SNAPSHOT_TOP_ANTIPATTERNS is positive', () => {
      expect(CONTEXT_SNAPSHOT_TOP_ANTIPATTERNS).toBe(3);
      expect(CONTEXT_SNAPSHOT_TOP_ANTIPATTERNS).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Token budgets
  // -----------------------------------------------------------------------

  describe('TOKEN_BUDGETS', () => {
    it('contains expected tool adapters', () => {
      const expectedKeys = [
        'claude-code', 'codex-cli', 'opencode', 'antigravity',
        'openclaw', 'cursor', 'copilot', 'aider', 'generic',
      ];
      for (const key of expectedKeys) {
        expect(TOKEN_BUDGETS).toHaveProperty(key);
      }
    });

    it('all budget values are positive integers', () => {
      for (const [key, value] of Object.entries(TOKEN_BUDGETS)) {
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(TOKEN_BUDGETS)).toBe(true);
    });

    it('claude-code has the largest budget', () => {
      const maxBudget = Math.max(...Object.values(TOKEN_BUDGETS));
      expect(TOKEN_BUDGETS['claude-code']).toBe(maxBudget);
    });
  });

  // -----------------------------------------------------------------------
  // File permissions
  // -----------------------------------------------------------------------

  describe('FILE_PERMISSIONS', () => {
    it('DIR is 0o700 (owner rwx only)', () => {
      expect(FILE_PERMISSIONS.DIR).toBe(0o700);
    });

    it('DB is 0o600 (owner rw only)', () => {
      expect(FILE_PERMISSIONS.DB).toBe(0o600);
    });

    it('SIGNING_KEY is 0o400 (owner read only)', () => {
      expect(FILE_PERMISSIONS.SIGNING_KEY).toBe(0o400);
    });

    it('AUDIT_LOG is 0o600 (owner rw only)', () => {
      expect(FILE_PERMISSIONS.AUDIT_LOG).toBe(0o600);
    });

    it('CONFIG is 0o600 (owner rw only)', () => {
      expect(FILE_PERMISSIONS.CONFIG).toBe(0o600);
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(FILE_PERMISSIONS)).toBe(true);
    });

    it('no permission allows group or other access', () => {
      for (const [key, mode] of Object.entries(FILE_PERMISSIONS)) {
        // Bits 0o077 represent group+other permissions
        const groupOther = mode & 0o077;
        expect(groupOther).toBe(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Managed section markers
  // -----------------------------------------------------------------------

  describe('managed section markers', () => {
    it('MANAGED_SECTION_MARKER is "NOESIS"', () => {
      expect(MANAGED_SECTION_MARKER).toBe('NOESIS');
    });

    it('MANAGED_SECTION_VERSION follows semver format', () => {
      expect(MANAGED_SECTION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  // -----------------------------------------------------------------------
  // Edge relations
  // -----------------------------------------------------------------------

  describe('EDGE_RELATIONS', () => {
    it('contains expected relation types', () => {
      const expectedRelations = [
        'causes', 'caused_by', 'contradicts', 'supersedes', 'requires',
        'exemplifies', 'generalizes', 'prevents', 'corrects', 'related_to',
        'part_of', 'created_during',
      ];
      for (const rel of expectedRelations) {
        expect(EDGE_RELATIONS).toContain(rel);
      }
    });

    it('has exactly 12 relations', () => {
      expect(EDGE_RELATIONS).toHaveLength(12);
    });

    it('contains no duplicates', () => {
      const unique = new Set(EDGE_RELATIONS);
      expect(unique.size).toBe(EDGE_RELATIONS.length);
    });

    it('all relations are non-empty strings', () => {
      for (const rel of EDGE_RELATIONS) {
        expect(typeof rel).toBe('string');
        expect(rel.length).toBeGreaterThan(0);
      }
    });
  });
});
