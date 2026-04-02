import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getToolConfigs, resolveImportPaths, SUPPORTED_IMPORT_TOOLS } from '../../cli/commands/import-config.js';
import { loadRuntimeSkills, resolveSkillStatusFilter } from '../../cli/commands/skills.js';
import { getRuntimeSkillCounts } from '../../cli/commands/status.js';
import { DatabaseConnection } from '../../core/database.js';
import { insertSkill, updateSkill } from '../../cognitive/skills/skill-store.js';

describe('P6 command/store drift helpers', () => {
  let tempDir: string;
  let db: DatabaseConnection;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'noesis-p6-cli-'));
    db = DatabaseConnection.create(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads runtime skills from executable_skills with active/archive filters', () => {
    const sign = (_content: string) => 'sig';
    const active = insertSkill(db, {
      name: 'Active Skill',
      description: 'Runs from the runtime store',
      category: 'testing',
      trigger_conditions: ['tests'],
      content: 'active skill content',
    }, sign);
    const archived = insertSkill(db, {
      name: 'Archived Skill',
      description: 'Disabled in runtime store',
      category: 'backend',
      trigger_conditions: ['api'],
      content: 'archived skill content',
    }, sign);

    updateSkill(db, archived.id, { enabled: false }, sign);

    expect(loadRuntimeSkills(db)).toHaveLength(2);
    expect(loadRuntimeSkills(db, 'active').map(skill => skill.name)).toEqual([active.name]);
    expect(loadRuntimeSkills(db, 'archived').map(skill => skill.name)).toEqual([archived.name]);
    expect(resolveSkillStatusFilter('draft').supported).toBe(false);
  });

  it('counts runtime skills from executable_skills', () => {
    const sign = (_content: string) => 'sig';
    insertSkill(db, {
      name: 'Enabled Skill',
      description: 'Enabled',
      category: 'testing',
      trigger_conditions: ['tests'],
      content: 'enabled skill content',
    }, sign);
    const archived = insertSkill(db, {
      name: 'Disabled Skill',
      description: 'Disabled',
      category: 'backend',
      trigger_conditions: ['api'],
      content: 'disabled skill content',
    }, sign);

    updateSkill(db, archived.id, { enabled: false }, sign);

    expect(getRuntimeSkillCounts(db)).toEqual({
      total: 2,
      enabled: 1,
      archived: 1,
    });
  });

  it('covers the advertised adapter surface and project-local instruction files', () => {
    const scanDir = join(tempDir, 'project');
    const configs = getToolConfigs(scanDir);
    const ids = configs.map(config => config.id);

    expect(ids).toEqual([...SUPPORTED_IMPORT_TOOLS]);
    expect(configs.find(config => config.id === 'claude-code')?.paths).toContain(join(scanDir, 'CLAUDE.md'));
    expect(configs.find(config => config.id === 'claude-code')?.paths).toContain(join(scanDir, 'Context', 'CLAUDE.md'));
    expect(configs.find(config => config.id === 'codex-cli')?.paths).toContain(join(scanDir, 'AGENTS.md'));
    expect(configs.find(config => config.id === 'codex-cli')?.paths).toContain(join(scanDir, 'Context', 'AGENTS.md'));
    expect(configs.find(config => config.id === 'copilot')?.paths).toContain(
      join(scanDir, '.github', 'copilot-instructions.md'),
    );
    expect(configs.find(config => config.id === 'antigravity')?.paths).toContain(join(scanDir, 'GEMINI.md'));
    expect(configs.find(config => config.id === 'generic')?.paths).toContain(
      join(scanDir, '.noesis-context.md'),
    );
  });

  it('expands directory-backed config sources into importable files', () => {
    const rulesDir = join(tempDir, '.cursor', 'rules');
    mkdirSync(join(rulesDir, 'nested'), { recursive: true });
    writeFileSync(join(rulesDir, 'root.mdc'), '# Root rule\n');
    writeFileSync(join(rulesDir, 'nested', 'child.md'), '# Child rule\n');

    expect(resolveImportPaths(rulesDir)).toEqual([
      join(rulesDir, 'nested', 'child.md'),
      join(rulesDir, 'root.mdc'),
    ]);
  });
});
