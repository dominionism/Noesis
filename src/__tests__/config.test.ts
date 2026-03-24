/**
 * Tests for src/config.ts
 *
 * Validates the loadConfig/saveConfig pipeline including:
 * - Default configuration generation
 * - YAML parsing and merging
 * - Unknown-key rejection (defense against config injection)
 * - Type-safe merge behavior
 * - File I/O with proper permissions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';

// We need to mock CONFIG_PATH before importing config.ts
// This avoids touching the real ~/.agents/noesis.yaml

let tempDir: string;
let configPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'noesis-config-test-'));
  configPath = join(tempDir, 'noesis.yaml');
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
});

// Since config.ts uses the real CONFIG_PATH constant, we mock the constants module
// to redirect file operations to our temp directory.

vi.mock('../constants.js', async () => {
  const actual = await vi.importActual('../constants.js') as Record<string, unknown>;
  return {
    ...actual,
    get CONFIG_PATH() {
      return configPath;
    },
  };
});

// Dynamic import after mocking
const { loadConfig, saveConfig } = await import('../config.js');

describe('loadConfig', () => {
  describe('default configuration', () => {
    it('returns defaults when config file does not exist', () => {
      const config = loadConfig();
      expect(config).toBeDefined();
      expect(config.tools).toEqual({});
      expect(config.projects).toEqual({});
      expect(config.retention_days).toBe(180);
      expect(config.embedding_model).toBe('snowflake-arctic-embed-s');
      expect(config.cold_storage_max_mb).toBe(50);
      expect(config.audit_max_mb).toBe(10);
      expect(config.secret_scan_mode).toBe('redact');
    });

    it('returns defaults with correct llm_provider structure', () => {
      const config = loadConfig();
      expect(config.llm_provider).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        api_key_env: 'ANTHROPIC_API_KEY',
      });
    });

    it('returns defaults when config file is empty', () => {
      writeFileSync(configPath, '', 'utf-8');
      const config = loadConfig();
      expect(config.retention_days).toBe(180);
      expect(config.secret_scan_mode).toBe('redact');
    });

    it('returns defaults when config file contains only whitespace', () => {
      writeFileSync(configPath, '   \n\n  \t  \n', 'utf-8');
      const config = loadConfig();
      expect(config.retention_days).toBe(180);
    });

    it('returns defaults when YAML parses to null', () => {
      writeFileSync(configPath, '---\n', 'utf-8');
      const config = loadConfig();
      expect(config.retention_days).toBe(180);
    });
  });

  describe('merge behavior', () => {
    it('overrides retention_days from YAML', () => {
      writeFileSync(configPath, stringify({ retention_days: 365 }), 'utf-8');
      const config = loadConfig();
      expect(config.retention_days).toBe(365);
    });

    it('ignores negative retention_days', () => {
      writeFileSync(configPath, stringify({ retention_days: -1 }), 'utf-8');
      const config = loadConfig();
      expect(config.retention_days).toBe(180);
    });

    it('ignores zero retention_days', () => {
      writeFileSync(configPath, stringify({ retention_days: 0 }), 'utf-8');
      const config = loadConfig();
      expect(config.retention_days).toBe(180);
    });

    it('ignores non-numeric retention_days', () => {
      writeFileSync(configPath, stringify({ retention_days: 'forever' }), 'utf-8');
      const config = loadConfig();
      expect(config.retention_days).toBe(180);
    });

    it('overrides embedding_model from YAML', () => {
      writeFileSync(configPath, stringify({ embedding_model: 'custom-model' }), 'utf-8');
      const config = loadConfig();
      expect(config.embedding_model).toBe('custom-model');
    });

    it('ignores empty embedding_model', () => {
      writeFileSync(configPath, stringify({ embedding_model: '' }), 'utf-8');
      const config = loadConfig();
      expect(config.embedding_model).toBe('snowflake-arctic-embed-s');
    });

    it('ignores non-string embedding_model', () => {
      writeFileSync(configPath, stringify({ embedding_model: 42 }), 'utf-8');
      const config = loadConfig();
      expect(config.embedding_model).toBe('snowflake-arctic-embed-s');
    });

    it('overrides secret_scan_mode to warn', () => {
      writeFileSync(configPath, stringify({ secret_scan_mode: 'warn' }), 'utf-8');
      const config = loadConfig();
      expect(config.secret_scan_mode).toBe('warn');
    });

    it('overrides secret_scan_mode to redact', () => {
      writeFileSync(configPath, stringify({ secret_scan_mode: 'redact' }), 'utf-8');
      const config = loadConfig();
      expect(config.secret_scan_mode).toBe('redact');
    });

    it('ignores invalid secret_scan_mode values', () => {
      writeFileSync(configPath, stringify({ secret_scan_mode: 'off' }), 'utf-8');
      const config = loadConfig();
      expect(config.secret_scan_mode).toBe('redact');
    });

    it('rejects attempt to disable secret scanning', () => {
      writeFileSync(configPath, stringify({ secret_scan_mode: 'disabled' }), 'utf-8');
      const config = loadConfig();
      expect(config.secret_scan_mode).toBe('redact');
    });

    it('overrides cold_storage_max_mb', () => {
      writeFileSync(configPath, stringify({ cold_storage_max_mb: 100 }), 'utf-8');
      const config = loadConfig();
      expect(config.cold_storage_max_mb).toBe(100);
    });

    it('ignores non-positive cold_storage_max_mb', () => {
      writeFileSync(configPath, stringify({ cold_storage_max_mb: -5 }), 'utf-8');
      const config = loadConfig();
      expect(config.cold_storage_max_mb).toBe(50);
    });

    it('overrides audit_max_mb', () => {
      writeFileSync(configPath, stringify({ audit_max_mb: 25 }), 'utf-8');
      const config = loadConfig();
      expect(config.audit_max_mb).toBe(25);
    });

    it('ignores non-positive audit_max_mb', () => {
      writeFileSync(configPath, stringify({ audit_max_mb: 0 }), 'utf-8');
      const config = loadConfig();
      expect(config.audit_max_mb).toBe(10);
    });
  });

  describe('tools and projects merge', () => {
    it('merges tools object from YAML', () => {
      const yamlData = {
        tools: {
          'claude-code': {
            enabled: true,
            adapter: 'claude-code',
            settings: { max_tokens: 4096 },
          },
        },
      };
      writeFileSync(configPath, stringify(yamlData), 'utf-8');
      const config = loadConfig();
      expect(config.tools).toHaveProperty('claude-code');
      expect(config.tools['claude-code'].enabled).toBe(true);
    });

    it('ignores non-object tools', () => {
      writeFileSync(configPath, stringify({ tools: 'invalid' }), 'utf-8');
      const config = loadConfig();
      expect(config.tools).toEqual({});
    });

    it('ignores null tools', () => {
      writeFileSync(configPath, stringify({ tools: null }), 'utf-8');
      const config = loadConfig();
      expect(config.tools).toEqual({});
    });

    it('merges projects object from YAML', () => {
      const yamlData = {
        projects: {
          myapp: {
            path: '/home/user/myapp',
            sensitivity: 'INTERNAL' as const,
            isolation_mode: false,
          },
        },
      };
      writeFileSync(configPath, stringify(yamlData), 'utf-8');
      const config = loadConfig();
      expect(config.projects).toHaveProperty('myapp');
      expect(config.projects['myapp'].path).toBe('/home/user/myapp');
    });

    it('ignores non-object projects', () => {
      writeFileSync(configPath, stringify({ projects: 123 }), 'utf-8');
      const config = loadConfig();
      expect(config.projects).toEqual({});
    });
  });

  describe('llm_provider merge', () => {
    it('merges partial llm_provider', () => {
      const yamlData = {
        llm_provider: {
          model: 'gpt-4o',
        },
      };
      writeFileSync(configPath, stringify(yamlData), 'utf-8');
      const config = loadConfig();
      expect(config.llm_provider.model).toBe('gpt-4o');
      expect(config.llm_provider.provider).toBe('anthropic');
      expect(config.llm_provider.api_key_env).toBe('ANTHROPIC_API_KEY');
    });

    it('merges full llm_provider', () => {
      const yamlData = {
        llm_provider: {
          provider: 'openai',
          model: 'gpt-4o',
          api_key_env: 'OPENAI_API_KEY',
        },
      };
      writeFileSync(configPath, stringify(yamlData), 'utf-8');
      const config = loadConfig();
      expect(config.llm_provider.provider).toBe('openai');
      expect(config.llm_provider.model).toBe('gpt-4o');
      expect(config.llm_provider.api_key_env).toBe('OPENAI_API_KEY');
    });

    it('ignores non-string fields in llm_provider', () => {
      const yamlData = {
        llm_provider: {
          provider: 123,
          model: true,
          api_key_env: null,
        },
      };
      writeFileSync(configPath, stringify(yamlData), 'utf-8');
      const config = loadConfig();
      expect(config.llm_provider.provider).toBe('anthropic');
      expect(config.llm_provider.model).toBe('claude-sonnet-4-20250514');
      expect(config.llm_provider.api_key_env).toBe('ANTHROPIC_API_KEY');
    });

    it('ignores non-object llm_provider', () => {
      writeFileSync(configPath, stringify({ llm_provider: 'bad' }), 'utf-8');
      const config = loadConfig();
      expect(config.llm_provider.provider).toBe('anthropic');
    });

    it('ignores null llm_provider', () => {
      writeFileSync(configPath, stringify({ llm_provider: null }), 'utf-8');
      const config = loadConfig();
      expect(config.llm_provider.provider).toBe('anthropic');
    });
  });

  describe('config injection protection', () => {
    it('drops unknown top-level keys', () => {
      const yamlData = {
        retention_days: 90,
        malicious_flag: true,
      };
      writeFileSync(configPath, stringify(yamlData), 'utf-8');
      const config = loadConfig();
      expect(config.retention_days).toBe(90);
      expect((config as Record<string, unknown>)['malicious_flag']).toBeUndefined();
    });

    it('handles multiple overrides simultaneously', () => {
      const yamlData = {
        retention_days: 90,
        embedding_model: 'custom-v2',
        cold_storage_max_mb: 200,
        audit_max_mb: 5,
        secret_scan_mode: 'warn',
      };
      writeFileSync(configPath, stringify(yamlData), 'utf-8');
      const config = loadConfig();
      expect(config.retention_days).toBe(90);
      expect(config.embedding_model).toBe('custom-v2');
      expect(config.cold_storage_max_mb).toBe(200);
      expect(config.audit_max_mb).toBe(5);
      expect(config.secret_scan_mode).toBe('warn');
    });
  });
});

describe('saveConfig', () => {
  it('writes a valid YAML file to the config path', () => {
    const config = loadConfig();
    saveConfig(config);
    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('creates parent directory if it does not exist', () => {
    const nestedDir = join(tempDir, 'nested', 'deep');
    configPath = join(nestedDir, 'noesis.yaml');

    const config = loadConfig();
    saveConfig(config);
    expect(existsSync(configPath)).toBe(true);
  });

  it('round-trips a config through save and load', () => {
    const original = loadConfig();
    original.retention_days = 999;
    original.embedding_model = 'test-model';
    original.secret_scan_mode = 'warn';

    saveConfig(original);

    const reloaded = loadConfig();
    expect(reloaded.retention_days).toBe(999);
    expect(reloaded.embedding_model).toBe('test-model');
    expect(reloaded.secret_scan_mode).toBe('warn');
  });

  it('writes sorted YAML keys', () => {
    const config = loadConfig();
    saveConfig(config);
    const content = readFileSync(configPath, 'utf-8');
    // The YAML library sorts keys; verify audit_max_mb comes before cold_storage_max_mb
    const auditPos = content.indexOf('audit_max_mb');
    const coldPos = content.indexOf('cold_storage_max_mb');
    expect(auditPos).toBeLessThan(coldPos);
  });
});
