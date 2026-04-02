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
import type {
  CapsuleComponentInput,
  DeepCapsuleDefinition,
  DeepCapsuleInput,
  ExecutableSkill,
  ExecutableSkillInput,
  ExpertDefinition,
  ExpertDefinitionInput,
  RuleDefinition,
  RuleDefinitionInput,
  SignFn,
} from '../cognitive/types.js';
import {
  AGENTS_DIR,
  SKILLS_DIR,
  RULES_DIR,
  CAPSULES_DIR,
} from '../constants.js';

import {
  loadAssetsInPriorityOrder,
  type AssetSource,
  type ParsedAsset,
} from './loader.js';
import { convertExpert, convertSkill, convertRule, convertCapsule } from './converters.js';
import { getExpertByName, insertExpert, updateExpert } from '../cognitive/experts/expert-store.js';
import { getSkillByName, insertSkill, updateSkill } from '../cognitive/skills/skill-store.js';
import { getRuleByName, insertRule, updateRule } from '../cognitive/rules/rule-store.js';
import {
  getCapsuleByName,
  getComponent,
  insertCapsule,
  insertComponent,
  updateCapsule,
  updateComponent,
} from '../cognitive/capsules/capsule-store.js';

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

export interface RegistrationDiagnostic {
  assetName: string;
  sourcePath: string;
  sourceType: AssetSource;
  message: string;
}

export interface AssetRegistrationStats {
  loaded: number;
  registered: number;
  updated: number;
  skipped: number;
  errors: number;
  diagnostics: RegistrationDiagnostic[];
}

export interface RegistrationStats {
  experts: AssetRegistrationStats;
  skills: AssetRegistrationStats;
  rules: AssetRegistrationStats;
  capsules: AssetRegistrationStats;
}

export interface RegisterMarkdownAssetsOptions {
  bundledAssetsDir?: string;
  agentsDir?: string;
  skillsDir?: string;
  rulesDir?: string;
  capsulesDir?: string;
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
  options: RegisterMarkdownAssetsOptions = {},
): Promise<RegistrationStats> {
  const bundledDir = options.bundledAssetsDir ?? getBundledAssetsDir();
  const agentsDir = options.agentsDir ?? AGENTS_DIR;
  const skillsDir = options.skillsDir ?? SKILLS_DIR;
  const rulesDir = options.rulesDir ?? RULES_DIR;
  const capsulesDir = options.capsulesDir ?? CAPSULES_DIR;
  const stats: RegistrationStats = {
    experts: createAssetRegistrationStats(),
    skills: createAssetRegistrationStats(),
    rules: createAssetRegistrationStats(),
    capsules: createAssetRegistrationStats(),
  };

  // -----------------------------------------------------------------------
  // Experts (flat .md files in agents/ directories)
  // -----------------------------------------------------------------------
  const expertAssets = loadAssetsInPriorityOrder(
    join(bundledDir, 'agents'),
    agentsDir,
  );
  stats.experts.loaded = expertAssets.length;

  for (const asset of expertAssets) {
    try {
      const input = convertExpert(asset);
      const existing = getExpertByName(db, asset.name);

      if (!existing) {
        insertExpert(db, input, sign);
        stats.experts.registered++;
      } else {
        if (areEqual(comparableExpert(existing), comparableExpert(input))) {
          stats.experts.skipped++;
          continue;
        }

        updateExpert(db, existing.id, {
          name: input.name,
          display_name: input.display_name,
          role: input.role,
          domain: input.domain,
          category: input.category,
          trigger_conditions: input.trigger_conditions,
          scope: input.scope,
          deliverables: input.deliverables,
          anti_patterns: input.anti_patterns ?? [],
          grading_criteria: input.grading_criteria ?? [],
          tools: input.tools ?? [],
          model_preference: input.model_preference ?? null,
          content: input.content,
          version: existing.version + 1,
        }, sign);
        stats.experts.updated++;
      }
    } catch (error) {
      recordRegistrationError(stats.experts, asset, error);
    }
  }

  // -----------------------------------------------------------------------
  // Skills (nested directories with SKILL.md)
  // -----------------------------------------------------------------------
  const skillAssets = loadAssetsInPriorityOrder(
    join(bundledDir, 'skills'),
    skillsDir,
    {
      nested: true,
      nestedFilenames: ['SKILL.md', 'skill.md'],
    },
  );
  stats.skills.loaded = skillAssets.length;

  for (const asset of skillAssets) {
    try {
      const input = convertSkill(asset);
      const existing = getSkillByName(db, asset.name);

      if (!existing) {
        insertSkill(db, input, sign);
        stats.skills.registered++;
      } else {
        if (areEqual(comparableSkill(existing), comparableSkill(input))) {
          stats.skills.skipped++;
          continue;
        }

        updateSkill(db, existing.id, {
          name: input.name,
          description: input.description,
          category: input.category,
          trigger_conditions: input.trigger_conditions,
          anti_patterns: input.anti_patterns ?? [],
          rules: input.rules ?? [],
          chain_with: input.chain_with ?? [],
          content: input.content,
        }, sign);
        stats.skills.updated++;
      }
    } catch (error) {
      recordRegistrationError(stats.skills, asset, error);
    }
  }

  // -----------------------------------------------------------------------
  // Rules (flat .md files in rules/ directories)
  // -----------------------------------------------------------------------
  const ruleAssets = loadAssetsInPriorityOrder(
    join(bundledDir, 'rules'),
    rulesDir,
  );
  stats.rules.loaded = ruleAssets.length;

  for (const asset of ruleAssets) {
    try {
      const input = convertRule(asset);
      const existing = getRuleByName(db, asset.name);

      if (!existing) {
        insertRule(db, input, sign);
        stats.rules.registered++;
      } else {
        if (areEqual(comparableRule(existing), comparableRule(input))) {
          stats.rules.skipped++;
          continue;
        }

        updateRule(db, existing.id, {
          name: input.name,
          category: input.category,
          description: input.description,
          trigger_conditions: input.trigger_conditions,
          constraints: input.constraints,
          enforcement: input.enforcement,
          thresholds: input.thresholds ?? {},
          interactions: input.interactions ?? [],
          content: input.content,
          version: existing.version + 1,
        }, sign);
        stats.rules.updated++;
      }
    } catch (error) {
      recordRegistrationError(stats.rules, asset, error);
    }
  }

  // -----------------------------------------------------------------------
  // Capsules (nested directories with CAPSULE.md)
  // -----------------------------------------------------------------------
  const capsuleAssets = loadAssetsInPriorityOrder(
    join(bundledDir, 'capsules'),
    capsulesDir,
    { nested: true, nestedFilename: 'CAPSULE.md' },
  );
  stats.capsules.loaded = capsuleAssets.length;

  for (const asset of capsuleAssets) {
    try {
      const input = convertCapsule(asset);
      const existing = getCapsuleByName(db, asset.name);

      if (!existing) {
        const capsule = insertCapsule(db, input.capsule, sign);
        for (const component of input.components) {
          insertComponent(db, {
            ...component,
            capsule_id: capsule.id,
          }, sign);
        }
        stats.capsules.registered++;
        continue;
      }

      if (!capsuleNeedsUpdate(db, existing, input.capsule, input.components)) {
        stats.capsules.skipped++;
        continue;
      }

      updateCapsule(db, existing.id, {
        ...input.capsule,
        version: existing.version + 1,
      }, sign);
      for (const component of input.components) {
        const existingComponent = getComponent(db, existing.id, component.component_type);
        if (!existingComponent) {
          insertComponent(db, {
            ...component,
            capsule_id: existing.id,
          }, sign);
          continue;
        }

        updateComponent(db, existingComponent.id, component.content, sign);
      }
      stats.capsules.updated++;
    } catch (error) {
      recordRegistrationError(stats.capsules, asset, error);
    }
  }

  return stats;
}

function createAssetRegistrationStats(): AssetRegistrationStats {
  return {
    loaded: 0,
    registered: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    diagnostics: [],
  };
}

function recordRegistrationError(
  stats: AssetRegistrationStats,
  asset: ParsedAsset,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  stats.errors++;
  stats.diagnostics.push({
    assetName: asset.name,
    sourcePath: asset.sourcePath,
    sourceType: asset.sourceType,
    message,
  });
}

function capsuleNeedsUpdate(
  db: DatabaseConnection,
  existing: DeepCapsuleDefinition,
  input: DeepCapsuleInput,
  components: CapsuleComponentInput[],
): boolean {
  if (!areEqual(comparableCapsule(existing), comparableCapsule(input))) {
    return true;
  }

  for (const component of components) {
    const existingComponent = getComponent(db, existing.id, component.component_type);
    if (!existingComponent || existingComponent.content !== component.content) {
      return true;
    }
  }

  return false;
}

function comparableExpert(value: ExpertDefinition | ExpertDefinitionInput) {
  return {
    name: value.name,
    display_name: value.display_name ?? value.name,
    role: value.role,
    domain: value.domain,
    category: value.category,
    trigger_conditions: value.trigger_conditions,
    scope: value.scope,
    deliverables: value.deliverables ?? [],
    anti_patterns: value.anti_patterns ?? [],
    grading_criteria: value.grading_criteria ?? [],
    tools: value.tools ?? [],
    model_preference: value.model_preference ?? null,
    content: value.content,
  };
}

function comparableSkill(value: ExecutableSkill | ExecutableSkillInput) {
  return {
    name: value.name,
    description: value.description,
    category: value.category,
    trigger_conditions: value.trigger_conditions,
    anti_patterns: value.anti_patterns ?? [],
    rules: value.rules ?? [],
    chain_with: value.chain_with ?? [],
    content: value.content,
  };
}

function comparableRule(value: RuleDefinition | RuleDefinitionInput) {
  return {
    name: value.name,
    category: value.category,
    description: value.description,
    trigger_conditions: value.trigger_conditions,
    constraints: value.constraints,
    enforcement: value.enforcement,
    thresholds: value.thresholds ?? {},
    interactions: value.interactions ?? [],
    content: value.content,
  };
}

function comparableCapsule(value: DeepCapsuleDefinition | DeepCapsuleInput) {
  return {
    name: value.name,
    display_name: value.display_name,
    description: value.description,
    trigger_patterns: value.trigger_patterns,
  };
}

function areEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
