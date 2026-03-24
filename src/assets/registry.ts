/**
 * Asset Registry
 *
 * Orchestrates loading Markdown assets from the filesystem and registering
 * them in the database. Supports both bundled assets (shipped with noesis)
 * and user-customized assets in ~/.agents/.
 *
 * Loading order:
 * 1. Built-in TypeScript definitions (existing seeding functions)
 * 2. Bundled Markdown assets (noesis/assets/)
 * 3. User Markdown assets (~/.agents/)
 *
 * Later sources override earlier sources by name. Database entries are
 * upserted: if an asset with the same name exists, its content is updated
 * but user-modified metadata (success_rate, task_count) is preserved.
 */

import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import type { DatabaseConnection } from '../core/database.js';
import type { SignFn } from '../cognitive/types.js';
import {
  AGENTS_DIR,
  SKILLS_DIR,
  RULES_DIR,
  CAPSULES_DIR,
} from '../constants.js';

import { loadAssetsWithOverrides } from './loader.js';
import { convertExpert, convertSkill, convertRule, convertCapsule } from './converters.js';
import { getExpertByName, insertExpert, updateExpert } from '../cognitive/experts/expert-store.js';
import { getSkillByName, insertSkill, updateSkill } from '../cognitive/skills/skill-store.js';
import { getRuleByName, insertRule, updateRule } from '../cognitive/rules/rule-store.js';

/**
 * Minimum content length ratio to trigger an upgrade.
 * If the Markdown content is at least this many times longer than the
 * existing database content, the database entry's content is updated.
 * This ensures rich Markdown replaces compressed built-in content
 * while avoiding overwriting user-edited content that is already detailed.
 */
const CONTENT_UPGRADE_RATIO = 3;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Returns the path to the bundled assets directory.
 * In development: {projectRoot}/assets/
 * In production (dist/): {projectRoot}/assets/ (resolved relative to dist)
 */
function getBundledAssetsDir(): string {
  // Walk up from src/assets/ or dist/assets/ to project root
  const projectRoot = resolve(__dirname, '..', '..');
  const assetsDir = join(projectRoot, 'assets');

  if (existsSync(assetsDir)) {
    return assetsDir;
  }

  // Fallback: one more level up (if running from dist/src/assets/)
  const altRoot = resolve(__dirname, '..', '..', '..');
  const altDir = join(altRoot, 'assets');
  if (existsSync(altDir)) {
    return altDir;
  }

  return assetsDir; // Return the expected path even if missing
}

// ---------------------------------------------------------------------------
// Registration stats
// ---------------------------------------------------------------------------

export interface RegistrationStats {
  experts: { loaded: number; registered: number; upgraded: number; skipped: number };
  skills: { loaded: number; registered: number; upgraded: number; skipped: number };
  rules: { loaded: number; registered: number; upgraded: number; skipped: number };
  capsules: { loaded: number; registered: number; upgraded: number; skipped: number };
}

// ---------------------------------------------------------------------------
// Main registration function
// ---------------------------------------------------------------------------

/**
 * Loads all Markdown assets from bundled and user directories, converts them
 * to the appropriate types, and registers them in the database.
 *
 * Assets already present in the database (by name) are skipped to preserve
 * user modifications. To force re-registration, delete the asset from the
 * database first.
 *
 * Call this AFTER the built-in seeding functions have run, so that Markdown
 * assets can override built-in definitions.
 */
export async function registerMarkdownAssets(
  db: DatabaseConnection,
  sign: SignFn,
): Promise<RegistrationStats> {
  const bundledDir = getBundledAssetsDir();
  const stats: RegistrationStats = {
    experts: { loaded: 0, registered: 0, upgraded: 0, skipped: 0 },
    skills: { loaded: 0, registered: 0, upgraded: 0, skipped: 0 },
    rules: { loaded: 0, registered: 0, upgraded: 0, skipped: 0 },
    capsules: { loaded: 0, registered: 0, upgraded: 0, skipped: 0 },
  };

  // -----------------------------------------------------------------------
  // Experts (flat .md files in agents/ directories)
  // -----------------------------------------------------------------------
  const expertAssets = loadAssetsWithOverrides(
    join(bundledDir, 'agents'),
    AGENTS_DIR,
  );
  stats.experts.loaded = expertAssets.length;

  for (const asset of expertAssets) {
    try {
      const input = convertExpert(asset);
      const existing = getExpertByName(db, asset.name);

      if (!existing) {
        insertExpert(db, input, sign);
        stats.experts.registered++;
      } else if (input.content.length > existing.content.length * CONTENT_UPGRADE_RATIO) {
        // Markdown content is substantially richer — upgrade the content
        // while preserving user-modified metadata (task_count, success_rate)
        updateExpert(db, existing.id, { content: input.content }, sign);
        stats.experts.upgraded++;
      } else {
        stats.experts.skipped++;
      }
    } catch {
      stats.experts.skipped++;
    }
  }

  // -----------------------------------------------------------------------
  // Skills (nested directories with SKILL.md)
  // -----------------------------------------------------------------------
  const skillAssets = loadAssetsWithOverrides(
    join(bundledDir, 'skills'),
    SKILLS_DIR,
    { nested: true, nestedFilename: 'SKILL.md' },
  );
  stats.skills.loaded = skillAssets.length;

  for (const asset of skillAssets) {
    try {
      const input = convertSkill(asset);
      const existing = getSkillByName(db, asset.name);

      if (!existing) {
        insertSkill(db, input, sign);
        stats.skills.registered++;
      } else if (input.content.length > existing.content.length * CONTENT_UPGRADE_RATIO) {
        updateSkill(db, existing.id, { content: input.content }, sign);
        stats.skills.upgraded++;
      } else {
        stats.skills.skipped++;
      }
    } catch {
      stats.skills.skipped++;
    }
  }

  // -----------------------------------------------------------------------
  // Rules (flat .md files in rules/ directories)
  // -----------------------------------------------------------------------
  const ruleAssets = loadAssetsWithOverrides(
    join(bundledDir, 'rules'),
    RULES_DIR,
  );
  stats.rules.loaded = ruleAssets.length;

  for (const asset of ruleAssets) {
    try {
      const input = convertRule(asset);
      const existing = getRuleByName(db, asset.name);

      if (!existing) {
        insertRule(db, input, sign);
        stats.rules.registered++;
      } else if (input.content.length > existing.content.length * CONTENT_UPGRADE_RATIO) {
        updateRule(db, existing.id, { content: input.content }, sign);
        stats.rules.upgraded++;
      } else {
        stats.rules.skipped++;
      }
    } catch {
      stats.rules.skipped++;
    }
  }

  // -----------------------------------------------------------------------
  // Capsules (nested directories with CAPSULE.md)
  // -----------------------------------------------------------------------
  // Capsule registration is simpler — we just load the CAPSULE.md content
  // The capsule engine handles component loading separately
  const capsuleAssets = loadAssetsWithOverrides(
    join(bundledDir, 'capsules'),
    CAPSULES_DIR,
    { nested: true, nestedFilename: 'CAPSULE.md' },
  );
  stats.capsules.loaded = capsuleAssets.length;
  // Capsule registration deferred — the capsule store uses a different
  // insert pattern (capsule + components). For now, track what was loaded.
  stats.capsules.skipped = capsuleAssets.length;

  return stats;
}
