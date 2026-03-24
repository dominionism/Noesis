/**
 * Markdown Asset Loader
 *
 * Loads cognitive assets (experts, skills, rules, capsules, commands, contexts)
 * from Markdown files with YAML frontmatter. Parses frontmatter metadata and
 * extracts body content.
 *
 * Files are loaded from:
 * - {projectRoot}/assets/{type}/  (bundled with noesis)
 * - ~/.agents/{type}/             (user customizations, override bundled)
 *
 * User files take precedence over bundled files when names collide.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface ParsedAsset<T = Record<string, unknown>> {
  /** Parsed YAML frontmatter */
  metadata: T;
  /** Markdown body (everything after frontmatter) */
  content: string;
  /** Absolute path to the source file */
  sourcePath: string;
  /** Filename without extension */
  name: string;
}

export interface LoaderOptions {
  /** Only load files matching these names (without extension) */
  filter?: string[];
  /** File extension to match. Defaults to '.md' */
  extension?: string;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

/**
 * Extracts YAML frontmatter and Markdown body from a file's content.
 *
 * Frontmatter must be delimited by `---` on its own line at the very start
 * of the file. If no frontmatter is found, returns empty metadata and the
 * full content as body.
 */
export function parseFrontmatter(raw: string): { metadata: Record<string, unknown>; content: string } {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('---')) {
    return { metadata: {}, content: raw };
  }

  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { metadata: {}, content: raw };
  }

  const yamlBlock = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 4).trim();

  try {
    const metadata = parseYaml(yamlBlock) as Record<string, unknown>;
    return { metadata: metadata ?? {}, content: body };
  } catch {
    // If YAML parsing fails, treat entire file as content
    return { metadata: {}, content: raw };
  }
}

// ---------------------------------------------------------------------------
// Directory loading
// ---------------------------------------------------------------------------

/**
 * Loads all Markdown assets from a directory.
 *
 * For flat directories (rules, agents), reads `*.md` files directly.
 * For nested directories (skills, capsules), reads `SKILL.md` or
 * `CAPSULE.md` from each subdirectory.
 */
export function loadAssetsFromDirectory<T = Record<string, unknown>>(
  dirPath: string,
  options: LoaderOptions & { nested?: boolean; nestedFilename?: string } = {},
): ParsedAsset<T>[] {
  const { filter, extension = '.md', nested = false, nestedFilename } = options;

  if (!existsSync(dirPath)) {
    return [];
  }

  const assets: ParsedAsset<T>[] = [];

  if (nested && nestedFilename) {
    // Nested: each subdirectory contains a specific file (e.g., skills/tdd-cycle/SKILL.md)
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (filter && !filter.includes(entry.name)) continue;

      const filePath = join(dirPath, entry.name, nestedFilename);
      if (!existsSync(filePath)) continue;

      const raw = readFileSync(filePath, 'utf-8');
      const { metadata, content } = parseFrontmatter(raw);

      assets.push({
        metadata: metadata as T,
        content,
        sourcePath: filePath,
        name: (metadata as Record<string, unknown>).name as string ?? entry.name,
      });
    }
  } else {
    // Flat: directory contains *.md files directly
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(extension)) continue;

      const nameWithoutExt = basename(entry.name, extname(entry.name));
      if (filter && !filter.includes(nameWithoutExt)) continue;

      const filePath = join(dirPath, entry.name);
      const raw = readFileSync(filePath, 'utf-8');
      const { metadata, content } = parseFrontmatter(raw);

      assets.push({
        metadata: metadata as T,
        content,
        sourcePath: filePath,
        name: (metadata as Record<string, unknown>).name as string ?? nameWithoutExt,
      });
    }
  }

  return assets;
}

// ---------------------------------------------------------------------------
// Multi-source loading (bundled + user, with user override)
// ---------------------------------------------------------------------------

/**
 * Loads assets from both bundled and user directories, with user files
 * taking precedence when names collide.
 */
export function loadAssetsWithOverrides<T = Record<string, unknown>>(
  bundledDir: string,
  userDir: string,
  options: LoaderOptions & { nested?: boolean; nestedFilename?: string } = {},
): ParsedAsset<T>[] {
  const bundled = loadAssetsFromDirectory<T>(bundledDir, options);
  const user = loadAssetsFromDirectory<T>(userDir, options);

  // User files override bundled files by name
  const byName = new Map<string, ParsedAsset<T>>();
  for (const asset of bundled) {
    byName.set(asset.name, asset);
  }
  for (const asset of user) {
    byName.set(asset.name, asset); // Override
  }

  return Array.from(byName.values());
}
