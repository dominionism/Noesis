/**
 * noesis import-config — Import from existing tool configurations
 *
 * Scans for known tool config files (Claude Code CLAUDE.md, Cursor rules,
 * Aider config, Codex AGENTS.md) and imports relevant learnings into
 * Noesis memories via the daemon's noesis.remember RPC method.
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '../../daemon/client.js';

// ---------------------------------------------------------------------------
// Tool config definitions
// ---------------------------------------------------------------------------

interface ToolConfig {
  /** Identifier used with --tool flag */
  id: string;
  /** Human-readable name */
  name: string;
  /** Candidate file paths (absolute). Resolved at scan time. */
  paths: string[];
}

function getToolConfigs(scanDir: string): ToolConfig[] {
  const home = homedir();
  return [
    {
      id: 'claude-code',
      name: 'Claude Code',
      paths: [join(home, '.claude', 'CLAUDE.md')],
    },
    {
      id: 'cursor',
      name: 'Cursor',
      paths: [
        join(scanDir, '.cursorrules'),
        join(scanDir, '.cursor', 'rules'),
      ],
    },
    {
      id: 'aider',
      name: 'Aider',
      paths: [
        join(scanDir, '.aider.conf.yml'),
        join(home, '.aider.conf.yml'),
      ],
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      paths: [join(home, '.codex', 'AGENTS.md')],
    },
  ];
}

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

interface ExtractedSection {
  tool: string;
  sourcePath: string;
  title: string;
  content: string;
}

/**
 * Extract key sections from a config file's content.
 *
 * Splits markdown-style content on heading boundaries (lines starting with #)
 * and returns sections whose headings suggest conventions, rules, or
 * preferences. If no headings are found the entire content is returned as
 * a single section.
 */
function extractSections(tool: string, sourcePath: string, raw: string): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  const lines = raw.split('\n');

  // Keywords that indicate a section is worth importing
  const relevantKeywords = [
    'convention', 'rule', 'preference', 'standard', 'style',
    'pattern', 'guideline', 'principle', 'requirement', 'security',
    'testing', 'architecture', 'workflow', 'practice', 'anti-pattern',
    'instruction', 'behavior', 'philosophy', 'framework', 'checklist',
  ];

  let currentTitle = '';
  let currentContent: string[] = [];

  function flushSection(): void {
    const body = currentContent.join('\n').trim();
    if (!body) return;

    const titleLower = currentTitle.toLowerCase();
    const isRelevant = currentTitle === ''
      || relevantKeywords.some(kw => titleLower.includes(kw));

    if (isRelevant) {
      sections.push({
        tool,
        sourcePath,
        title: currentTitle || `${tool} configuration`,
        content: body,
      });
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      flushSection();
      currentTitle = headingMatch[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  flushSection();

  // If no sections were extracted (e.g. no headings at all), import the whole file
  if (sections.length === 0 && raw.trim().length > 0) {
    sections.push({
      tool,
      sourcePath,
      title: `${tool} configuration`,
      content: raw.trim(),
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerImportConfigCommand(program: Command): void {
  program
    .command('import-config')
    .description('Import learnings from existing tool configuration files')
    .option('--tool <name>', 'Specific tool to import from (e.g., claude-code, cursor, aider, codex)')
    .option('--path <dir>', 'Directory to scan for tool configs')
    .option('--dry-run', 'Show what would be imported without persisting')
    .action(async (options: {
      tool?: string;
      path?: string;
      dryRun?: boolean;
    }) => {
      const globalOpts = program.opts();
      const scanDir = options.path ?? process.cwd();
      const dryRun = options.dryRun ?? false;

      let toolConfigs = getToolConfigs(scanDir);

      // Filter to specific tool if requested
      if (options.tool) {
        toolConfigs = toolConfigs.filter(t => t.id === options.tool);
        if (toolConfigs.length === 0) {
          console.error(`Unknown tool: "${options.tool}". Supported: claude-code, cursor, aider, codex`);
          process.exit(1);
        }
      }

      // Scan for config files
      const discovered: Array<{ tool: ToolConfig; path: string }> = [];

      for (const tool of toolConfigs) {
        for (const candidatePath of tool.paths) {
          if (existsSync(candidatePath)) {
            discovered.push({ tool, path: candidatePath });
            break; // Use only the first match per tool
          }
        }
      }

      if (discovered.length === 0) {
        const msg = options.tool
          ? `No config file found for tool "${options.tool}".`
          : 'No known tool config files found.';
        console.log(msg);

        if (globalOpts.json) {
          console.log(JSON.stringify({
            found: 0,
            imported: 0,
            dry_run: dryRun,
            scan_dir: scanDir,
          }, null, 2));
        }
        return;
      }

      // Extract sections from each discovered file
      const allSections: ExtractedSection[] = [];

      for (const { tool, path } of discovered) {
        try {
          const content = readFileSync(path, 'utf-8');
          const sections = extractSections(tool.id, path, content);
          allSections.push(...sections);
        } catch (err) {
          console.error(`Warning: could not read ${path}: ${(err as Error).message}`);
        }
      }

      if (allSections.length === 0) {
        console.log('Config files found but no importable sections extracted.');
        return;
      }

      // Display what was found
      if (!globalOpts.json) {
        console.log(`Found ${discovered.length} config file(s), ${allSections.length} section(s):\n`);
        for (const section of allSections) {
          const preview = section.content.length > 120
            ? section.content.slice(0, 120) + '...'
            : section.content;
          console.log(`  [${section.tool}] ${section.title}`);
          console.log(`    Source: ${section.sourcePath}`);
          console.log(`    Preview: ${preview.replace(/\n/g, ' ')}`);
          console.log();
        }
      }

      if (dryRun) {
        if (globalOpts.json) {
          console.log(JSON.stringify({
            dry_run: true,
            found: discovered.length,
            sections: allSections.map(s => ({
              tool: s.tool,
              title: s.title,
              source: s.sourcePath,
              content_length: s.content.length,
            })),
          }, null, 2));
        } else {
          console.log('Dry run complete. No memories were persisted.');
        }
        return;
      }

      // Import sections as memories
      const client = createClient();

      try {
        await client.ensureDaemon();
        await client.connect();

        let imported = 0;
        const errors: string[] = [];

        for (const section of allSections) {
          try {
            await client.call<Record<string, unknown>>('noesis.remember', {
              type: 'preference',
              title: `[${section.tool}] ${section.title}`,
              content: section.content,
              tags: ['imported', 'config', section.tool],
              confirmed: true,
            });
            imported++;
          } catch (err) {
            errors.push(`Failed to import "${section.title}": ${(err as Error).message}`);
          }
        }

        if (globalOpts.json) {
          console.log(JSON.stringify({
            dry_run: false,
            found: discovered.length,
            sections_total: allSections.length,
            imported,
            errors,
          }, null, 2));
        } else {
          console.log(`Imported ${imported} of ${allSections.length} section(s) as memories.`);
          if (errors.length > 0) {
            console.log(`\n${errors.length} error(s):`);
            for (const e of errors) {
              console.log(`  - ${e}`);
            }
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
