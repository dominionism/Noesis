/**
 * Noesis Configuration Loader
 *
 * Reads `~/.agents/noesis.yaml`, merges with sensible defaults, and provides
 * a typed NoesisConfig object. If the file does not exist, the full default
 * configuration is returned without error.
 *
 * Security notes:
 * - The config file is read from a directory that should have 0o700 permissions.
 * - No secrets are stored in noesis.yaml; API keys are referenced by env-var name.
 * - saveConfig writes with 0o600 permissions to prevent other-user reads.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse, stringify } from 'yaml';

import { CONFIG_PATH, DEFAULT_RETENTION_DAYS, EMBEDDING_MODEL_ID, COLD_STORAGE_MAX_MB, AUDIT_MAX_MB, FILE_PERMISSIONS } from './constants.js';
import type { NoesisConfig } from './types.js';

/**
 * Returns the complete default configuration.
 *
 * Every field has a safe, non-null value so downstream code never needs to
 * handle `undefined` config properties.
 */
function defaultConfig(): NoesisConfig {
  return {
    tools: {},
    projects: {},
    retention_days: DEFAULT_RETENTION_DAYS,
    embedding_model: EMBEDDING_MODEL_ID,
    llm_provider: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      api_key_env: 'ANTHROPIC_API_KEY',
    },
    cold_storage_max_mb: COLD_STORAGE_MAX_MB,
    audit_max_mb: AUDIT_MAX_MB,
    secret_scan_mode: 'redact',
  };
}

/**
 * Deep-merge a partial config from disk over the defaults.
 *
 * Only known keys are merged. Unknown keys in the YAML file are silently
 * dropped to prevent config-injection attacks where a crafted YAML file
 * adds unexpected properties to the runtime object.
 */
function mergeConfig(defaults: NoesisConfig, overrides: Record<string, unknown>): NoesisConfig {
  const merged = { ...defaults };

  if (overrides.tools !== undefined && typeof overrides.tools === 'object' && overrides.tools !== null) {
    merged.tools = overrides.tools as NoesisConfig['tools'];
  }

  if (overrides.projects !== undefined && typeof overrides.projects === 'object' && overrides.projects !== null) {
    merged.projects = overrides.projects as NoesisConfig['projects'];
  }

  if (typeof overrides.retention_days === 'number' && overrides.retention_days > 0) {
    merged.retention_days = overrides.retention_days;
  }

  if (typeof overrides.embedding_model === 'string' && overrides.embedding_model.length > 0) {
    merged.embedding_model = overrides.embedding_model;
  }

  if (overrides.llm_provider !== undefined && typeof overrides.llm_provider === 'object' && overrides.llm_provider !== null) {
    const llm = overrides.llm_provider as Record<string, unknown>;
    merged.llm_provider = {
      provider: typeof llm.provider === 'string' ? llm.provider : defaults.llm_provider.provider,
      model: typeof llm.model === 'string' ? llm.model : defaults.llm_provider.model,
      api_key_env: typeof llm.api_key_env === 'string' ? llm.api_key_env : defaults.llm_provider.api_key_env,
    };
  }

  if (typeof overrides.cold_storage_max_mb === 'number' && overrides.cold_storage_max_mb > 0) {
    merged.cold_storage_max_mb = overrides.cold_storage_max_mb;
  }

  if (typeof overrides.audit_max_mb === 'number' && overrides.audit_max_mb > 0) {
    merged.audit_max_mb = overrides.audit_max_mb;
  }

  if (overrides.secret_scan_mode === 'warn' || overrides.secret_scan_mode === 'redact') {
    merged.secret_scan_mode = overrides.secret_scan_mode;
  }

  return merged;
}

/**
 * Load the Noesis configuration from disk, merged with defaults.
 *
 * If `~/.agents/noesis.yaml` does not exist or is empty, the full default
 * configuration is returned. Malformed YAML causes an error to propagate
 * so the caller can surface it rather than silently running with wrong values.
 */
export function loadConfig(): NoesisConfig {
  const defaults = defaultConfig();

  if (!existsSync(CONFIG_PATH)) {
    return defaults;
  }

  const raw = readFileSync(CONFIG_PATH, 'utf-8');

  if (raw.trim().length === 0) {
    return defaults;
  }

  const parsed: unknown = parse(raw);

  if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
    return defaults;
  }

  return mergeConfig(defaults, parsed as Record<string, unknown>);
}

/**
 * Persist the given configuration to `~/.agents/noesis.yaml`.
 *
 * Creates the parent directory (with 0o700) if it does not exist.
 * The file is written with 0o600 permissions.
 */
export function saveConfig(config: NoesisConfig): void {
  const dir = dirname(CONFIG_PATH);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: FILE_PERMISSIONS.DIR });
  }

  const yamlContent = stringify(config, {
    indent: 2,
    lineWidth: 120,
    sortMapEntries: true,
  });

  writeFileSync(CONFIG_PATH, yamlContent, {
    encoding: 'utf-8',
    mode: FILE_PERMISSIONS.CONFIG,
  });
}
