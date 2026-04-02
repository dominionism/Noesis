import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { DatabaseConnection } from '../../core/database.js';
import { registerMarkdownAssets } from '../../assets/registry.js';
import { seedBuiltInCapsules } from '../../cognitive/capsules/built-in-capsules.js';
import { getCapsuleByName, getComponent } from '../../cognitive/capsules/capsule-store.js';
import { getSkillByName, recordSkillInvocation } from '../../cognitive/skills/skill-store.js';

let tempDir: string;
let db: DatabaseConnection;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'noesis-assets-test-'));
  db = DatabaseConnection.create(join(tempDir, 'test.db'));
});

afterEach(() => {
  db.close();
  DatabaseConnection.resetInstance();
  rmSync(tempDir, { recursive: true, force: true });
});

function sign(content: string): string {
  return `sig:${content.length}`;
}

function createRegistrationOptions() {
  const bundledAssetsDir = join(tempDir, 'bundled-assets');
  const agentsDir = join(tempDir, 'user-assets', 'agents');
  const skillsDir = join(tempDir, 'user-assets', 'skills');
  const rulesDir = join(tempDir, 'user-assets', 'rules');
  const capsulesDir = join(tempDir, 'user-assets', 'capsules');

  mkdirSync(bundledAssetsDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(rulesDir, { recursive: true });
  mkdirSync(capsulesDir, { recursive: true });

  return {
    bundledAssetsDir,
    agentsDir,
    skillsDir,
    rulesDir,
    capsulesDir,
  };
}

function writeAsset(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

describe('registerMarkdownAssets', () => {
  it('registers bundled markdown capsules into an empty database', async () => {
    const stats = await registerMarkdownAssets(db, sign);

    const apiWorkflow = getCapsuleByName(db, 'api-workflow');
    const creativeRedesign = getCapsuleByName(db, 'creative-redesign');

    expect(stats.capsules.loaded).toBeGreaterThanOrEqual(2);
    expect(stats.capsules.registered).toBeGreaterThanOrEqual(2);
    expect(apiWorkflow).not.toBeNull();
    expect(creativeRedesign).not.toBeNull();
    expect(getComponent(db, apiWorkflow!.id, 'intent')?.content).toContain('Activate when the task involves designing, building, or integrating APIs.');
    expect(getComponent(db, apiWorkflow!.id, 'grader')?.content).toContain('API work passes the quality gate when');
  });

  it('upgrades seeded capsules with markdown components while preserving untouched built-in components', async () => {
    seedBuiltInCapsules(db, sign);

    const before = getCapsuleByName(db, 'api-workflow');
    const beforeCritic = getComponent(db, before!.id, 'critic');

    const stats = await registerMarkdownAssets(db, sign);

    const after = getCapsuleByName(db, 'api-workflow');
    const intent = getComponent(db, after!.id, 'intent');
    const grader = getComponent(db, after!.id, 'grader');
    const critic = getComponent(db, after!.id, 'critic');

    expect(stats.capsules.updated).toBeGreaterThanOrEqual(2);
    expect(intent?.content).toContain('Activate when the task involves designing, building, or integrating APIs.');
    expect(grader?.content).toContain('API work passes the quality gate when');
    expect(critic?.content).toBe(beforeCritic?.content);
  });

  it('applies same-name user skill overrides even when the user content is shorter', async () => {
    const options = createRegistrationOptions();
    const bundledSkillPath = join(options.bundledAssetsDir, 'skills', 'override-skill', 'SKILL.md');
    const userSkillPath = join(options.skillsDir, 'override-skill', 'SKILL.md');

    writeAsset(bundledSkillPath, `---
name: override-skill
description: Bundled description
category: workflow
---

# Override Skill

## Rules
- Preserve the bundled content when no user override exists
- This bundled version is intentionally much longer than the user override

## Anti-Patterns
- Bundled anti-pattern
`);

    const firstPass = await registerMarkdownAssets(db, sign, options);
    const seededSkill = getSkillByName(db, 'override-skill');

    expect(firstPass.skills.registered).toBe(1);
    expect(seededSkill).not.toBeNull();

    recordSkillInvocation(db, seededSkill!.id, 'success', sign);

    writeAsset(userSkillPath, `---
name: override-skill
description: User description wins
category: testing
---

# Override Skill

## Rules
- User override
`);

    const secondPass = await registerMarkdownAssets(db, sign, options);
    const overriddenSkill = getSkillByName(db, 'override-skill');

    expect(secondPass.skills.loaded).toBe(2);
    expect(secondPass.skills.updated).toBe(1);
    expect(secondPass.skills.skipped).toBe(1);
    expect(overriddenSkill).not.toBeNull();
    expect(overriddenSkill!.description).toBe('User description wins');
    expect(overriddenSkill!.category).toBe('testing');
    expect(overriddenSkill!.content).toContain('User override');
    expect(overriddenSkill!.content).not.toContain('bundled version is intentionally much longer');
    expect(overriddenSkill!.invocation_count).toBe(1);
    expect(overriddenSkill!.success_rate).toBeGreaterThan(0.5);
  });

  it('loads nested lowercase skill.md assets instead of skipping them', async () => {
    const options = createRegistrationOptions();
    writeAsset(join(options.bundledAssetsDir, 'skills', 'lowercase-skill', 'skill.md'), `---
name: lowercase-skill
description: Lowercase skill asset
category: workflow
---

# Lowercase Skill

## Rules
- Lowercase assets should load
`);

    const stats = await registerMarkdownAssets(db, sign, options);
    const skill = getSkillByName(db, 'lowercase-skill');

    expect(stats.skills.loaded).toBe(1);
    expect(stats.skills.registered).toBe(1);
    expect(stats.skills.errors).toBe(0);
    expect(skill).not.toBeNull();
    expect(skill!.content).toContain('Lowercase assets should load');
  });

  it('reports malformed override assets with diagnostics and keeps earlier valid content', async () => {
    const options = createRegistrationOptions();
    writeAsset(join(options.bundledAssetsDir, 'skills', 'diagnostic-skill', 'SKILL.md'), `---
name: diagnostic-skill
description: Bundled diagnostic skill
category: workflow
---

# Diagnostic Skill

## Rules
- Bundled content remains active if the override is invalid
`);

    writeAsset(join(options.skillsDir, 'diagnostic-skill', 'SKILL.md'), `---
name: diagnostic-skill
description: Invalid user override
category: not-a-real-category
---

# Diagnostic Skill

## Rules
- This should fail registration
`);

    const stats = await registerMarkdownAssets(db, sign, options);
    const skill = getSkillByName(db, 'diagnostic-skill');

    expect(stats.skills.loaded).toBe(2);
    expect(stats.skills.registered).toBe(1);
    expect(stats.skills.updated).toBe(0);
    expect(stats.skills.errors).toBe(1);
    expect(stats.skills.diagnostics).toHaveLength(1);
    expect(stats.skills.diagnostics[0].assetName).toBe('diagnostic-skill');
    expect(stats.skills.diagnostics[0].sourceType).toBe('user');
    expect(stats.skills.diagnostics[0].sourcePath).toContain('diagnostic-skill/SKILL.md');
    expect(stats.skills.diagnostics[0].message).toContain('CHECK constraint failed');
    expect(skill).not.toBeNull();
    expect(skill!.description).toBe('Bundled diagnostic skill');
    expect(skill!.content).toContain('Bundled content remains active');
  });
});
