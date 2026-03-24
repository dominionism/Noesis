/**
 * Settings Manager — GSD settings and model profiles.
 *
 * Stores per-project settings as JSON in context_state.
 * Three profiles control model selection per task type:
 *
 * - quality: Best models everywhere
 * - balanced: Mix of capability and cost
 * - budget: Cost-optimized
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { SignFn } from '../types.js';
import { upsertContext, getContext } from '../context/context-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GsdProfile = 'quality' | 'balanced' | 'budget';

export interface GsdSettings {
  researcher: boolean;
  plan_check: boolean;
  verifier: boolean;
  profile: GsdProfile;
  mode: 'interactive' | 'auto';
}

export interface ProfileConfig {
  planning: string;
  execution: string;
  research: string;
  verification: string;
}

// ---------------------------------------------------------------------------
// Profile definitions
// ---------------------------------------------------------------------------

const PROFILES: Record<GsdProfile, ProfileConfig> = {
  quality: {
    planning: 'opus',
    execution: 'opus',
    research: 'opus',
    verification: 'sonnet',
  },
  balanced: {
    planning: 'opus',
    execution: 'sonnet',
    research: 'sonnet',
    verification: 'sonnet',
  },
  budget: {
    planning: 'sonnet',
    execution: 'sonnet',
    research: 'haiku',
    verification: 'haiku',
  },
};

const DEFAULT_SETTINGS: GsdSettings = {
  researcher: true,
  plan_check: true,
  verifier: true,
  profile: 'balanced',
  mode: 'interactive',
};

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const SETTINGS_CONTEXT_TYPE = 'tooling' as const;

function settingsKey(projectId: string): string {
  return `gsd_settings_${projectId}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get GSD settings for a project.
 *
 * Returns default settings if none are stored.
 */
export function getSettings(
  db: DatabaseConnection,
  projectId: string,
): GsdSettings {
  const ctx = getContext(db, SETTINGS_CONTEXT_TYPE, projectId);
  if (!ctx) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(ctx.content);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Update GSD settings for a project.
 */
export function updateSettings(
  db: DatabaseConnection,
  projectId: string,
  settings: Partial<GsdSettings>,
  sign: SignFn,
): void {
  const current = getSettings(db, projectId);
  const merged = { ...current, ...settings };

  upsertContext(db, {
    context_type: SETTINGS_CONTEXT_TYPE,
    project_id: projectId,
    content: JSON.stringify(merged),
  }, sign);
}

/**
 * Set a profile and apply its defaults.
 */
export function setProfile(
  db: DatabaseConnection,
  projectId: string,
  profile: GsdProfile,
  sign: SignFn,
): void {
  updateSettings(db, projectId, { profile }, sign);
}

/**
 * Get the model configuration for the current profile.
 */
export function getProfileConfig(
  db: DatabaseConnection,
  projectId: string,
): ProfileConfig {
  const settings = getSettings(db, projectId);
  return PROFILES[settings.profile];
}

/**
 * Get the default settings.
 */
export function getDefaultSettings(): GsdSettings {
  return { ...DEFAULT_SETTINGS };
}

/**
 * Get all available profiles and their configurations.
 */
export function getAvailableProfiles(): Record<GsdProfile, ProfileConfig> {
  return { ...PROFILES };
}
