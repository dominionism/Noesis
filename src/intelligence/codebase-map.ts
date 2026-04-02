/**
 * Codebase Map Builder
 *
 * Builds and maintains a structured understanding of a repository
 * at multiple granularities: repo, package, module, file, symbol.
 *
 * Provides repository understanding at multiple granularities.
 *
 * Security:
 * - A05: No external dependencies; only uses fs and path.
 * - A10: No outbound requests; purely local filesystem analysis.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative, basename, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileInfo {
  path: string;
  relativePath: string;
  category: FileCategory;
  extension: string;
  sizeBytes: number;
  lineCount: number;
}

export type FileCategory =
  | 'entry_point'
  | 'config'
  | 'test'
  | 'api_route'
  | 'component'
  | 'utility'
  | 'type_definition'
  | 'style'
  | 'migration'
  | 'documentation'
  | 'script'
  | 'asset'
  | 'unknown';

export interface DirectoryInfo {
  path: string;
  relativePath: string;
  fileCount: number;
  purpose: string;
}

export interface CodebaseMap {
  root: string;
  timestamp: string;
  summary: {
    total_files: number;
    total_lines: number;
    languages: Record<string, number>;
    categories: Record<string, number>;
  };
  directories: DirectoryInfo[];
  files: FileInfo[];
  hotspots: string[];
  entry_points: string[];
  test_directories: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.tox', '.pytest_cache', 'coverage', '.nyc_output', 'vendor',
  '.cargo', 'target', 'bin', 'obj',
]);

const IGNORE_FILES = new Set([
  '.DS_Store', 'thumbs.db', 'package-lock.json', 'yarn.lock',
  'pnpm-lock.yaml', 'bun.lock',
]);

const EXTENSION_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.pyi': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java', '.kt': 'Kotlin',
  '.rb': 'Ruby',
  '.swift': 'Swift',
  '.c': 'C', '.h': 'C', '.cpp': 'C++', '.hpp': 'C++',
  '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS',
  '.html': 'HTML', '.vue': 'Vue',
  '.sql': 'SQL',
  '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell',
  '.md': 'Markdown', '.mdx': 'Markdown',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML',
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function categorizeFile(relativePath: string, name: string, ext: string): FileCategory {
  const lower = name.toLowerCase();
  const dir = dirname(relativePath).toLowerCase();

  // Tests
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('_test.') ||
      dir.includes('test') || dir.includes('__tests__') || dir.includes('spec')) {
    return 'test';
  }

  // Config
  if (['package.json', 'tsconfig.json', 'vitest.config.ts', 'jest.config.ts',
       'webpack.config.js', 'vite.config.ts', '.eslintrc', '.prettierrc',
       'tailwind.config.ts', 'next.config.js', 'next.config.ts'].some(c => lower.includes(c.toLowerCase())) ||
      ext === '.toml' || ext === '.yaml' || ext === '.yml') {
    return 'config';
  }

  // Entry points
  if (['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
       'server.ts', 'server.js', 'mod.ts', 'mod.rs', 'main.go', 'main.py'].includes(lower)) {
    return 'entry_point';
  }

  // API routes
  if (dir.includes('api') || dir.includes('route') || dir.includes('endpoint') ||
      lower.includes('route') || lower.includes('controller')) {
    return 'api_route';
  }

  // Components
  if (dir.includes('component') || dir.includes('widget') || ext === '.tsx' || ext === '.vue') {
    return 'component';
  }

  // Type definitions
  if (lower.includes('types.') || lower.includes('.d.ts') || lower.includes('interface') ||
      lower.includes('schema')) {
    return 'type_definition';
  }

  // Styles
  if (['.css', '.scss', '.less', '.sass'].includes(ext)) {
    return 'style';
  }

  // Migrations
  if (dir.includes('migration') || dir.includes('migrate') || lower.includes('migration')) {
    return 'migration';
  }

  // Documentation
  if (ext === '.md' || ext === '.mdx' || ext === '.rst' || ext === '.txt') {
    return 'documentation';
  }

  // Scripts
  if (dir.includes('script') || dir.includes('bin') || ext === '.sh') {
    return 'script';
  }

  // Assets
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
    return 'asset';
  }

  // Utilities
  if (dir.includes('util') || dir.includes('helper') || dir.includes('lib') ||
      lower.includes('util') || lower.includes('helper')) {
    return 'utility';
  }

  return 'unknown';
}

function countLines(filePath: string): number {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function walkDirectory(
  dirPath: string,
  rootPath: string,
  files: FileInfo[],
  directories: DirectoryInfo[],
  maxDepth: number = 8,
  currentDepth: number = 0,
): void {
  if (currentDepth > maxDepth) return;

  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  let dirFileCount = 0;

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

    const fullPath = join(dirPath, entry.name);
    const relPath = relative(rootPath, fullPath);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkDirectory(fullPath, rootPath, files, directories, maxDepth, currentDepth + 1);
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;

      const ext = extname(entry.name);
      let size = 0;
      try {
        size = statSync(fullPath).size;
      } catch { /* skip */ }

      // Skip very large files (>1MB)
      if (size > 1_000_000) continue;

      const lineCount = countLines(fullPath);
      const category = categorizeFile(relPath, entry.name, ext);

      files.push({
        path: fullPath,
        relativePath: relPath,
        category,
        extension: ext,
        sizeBytes: size,
        lineCount,
      });

      dirFileCount++;
    }
  }

  if (currentDepth > 0 && dirFileCount > 0) {
    const relDir = relative(rootPath, dirPath);
    const dirName = basename(dirPath);
    let purpose = 'general';

    if (dirName.includes('test') || dirName === '__tests__') purpose = 'testing';
    else if (dirName === 'src' || dirName === 'lib') purpose = 'source';
    else if (dirName === 'api' || dirName === 'routes') purpose = 'api';
    else if (dirName === 'components' || dirName === 'views') purpose = 'ui';
    else if (dirName === 'utils' || dirName === 'helpers') purpose = 'utilities';
    else if (dirName === 'types' || dirName === 'interfaces') purpose = 'types';
    else if (dirName === 'config' || dirName === 'configs') purpose = 'configuration';
    else if (dirName === 'scripts' || dirName === 'bin') purpose = 'scripts';
    else if (dirName === 'docs' || dirName === 'documentation') purpose = 'documentation';

    directories.push({
      path: dirPath,
      relativePath: relDir,
      fileCount: dirFileCount,
      purpose,
    });
  }
}

/**
 * Build a structured codebase map for a repository.
 * Scans the filesystem and categorizes all files and directories.
 */
export function buildCodebaseMap(rootPath: string): CodebaseMap {
  if (!existsSync(rootPath)) {
    return {
      root: rootPath,
      timestamp: new Date().toISOString(),
      summary: { total_files: 0, total_lines: 0, languages: {}, categories: {} },
      directories: [],
      files: [],
      hotspots: [],
      entry_points: [],
      test_directories: [],
    };
  }

  const files: FileInfo[] = [];
  const directories: DirectoryInfo[] = [];

  walkDirectory(rootPath, rootPath, files, directories);

  // Compute summary
  const languages: Record<string, number> = {};
  const categories: Record<string, number> = {};
  let totalLines = 0;

  for (const file of files) {
    const lang = EXTENSION_LANGUAGE[file.extension];
    if (lang) {
      languages[lang] = (languages[lang] ?? 0) + 1;
    }
    categories[file.category] = (categories[file.category] ?? 0) + 1;
    totalLines += file.lineCount;
  }

  // Identify hotspots (largest files by line count)
  const sorted = [...files].sort((a, b) => b.lineCount - a.lineCount);
  const hotspotThreshold = Math.ceil(files.length * 0.1);
  const hotspots = sorted.slice(0, hotspotThreshold).map(f => f.relativePath);

  // Identify entry points and test directories
  const entryPoints = files.filter(f => f.category === 'entry_point').map(f => f.relativePath);
  const testDirs = directories.filter(d => d.purpose === 'testing').map(d => d.relativePath);

  return {
    root: rootPath,
    timestamp: new Date().toISOString(),
    summary: {
      total_files: files.length,
      total_lines: totalLines,
      languages,
      categories,
    },
    directories,
    files,
    hotspots,
    entry_points: entryPoints,
    test_directories: testDirs,
  };
}

/**
 * Generate a compact text summary of the codebase map.
 * Suitable for injection into agent context windows.
 */
export function summarizeCodebaseMap(map: CodebaseMap, maxLines: number = 50): string {
  const lines: string[] = [];

  lines.push(`# Codebase: ${basename(map.root)}`);
  lines.push(`${map.summary.total_files} files, ${map.summary.total_lines.toLocaleString()} lines`);
  lines.push('');

  // Languages
  const langEntries = Object.entries(map.summary.languages).sort((a, b) => b[1] - a[1]);
  if (langEntries.length > 0) {
    lines.push('## Languages');
    for (const [lang, count] of langEntries.slice(0, 5)) {
      lines.push(`- ${lang}: ${count} files`);
    }
    lines.push('');
  }

  // Key directories
  const keyDirs = map.directories.filter(d => d.fileCount >= 3).sort((a, b) => b.fileCount - a.fileCount);
  if (keyDirs.length > 0) {
    lines.push('## Key Directories');
    for (const dir of keyDirs.slice(0, 10)) {
      lines.push(`- ${dir.relativePath}/ (${dir.fileCount} files, ${dir.purpose})`);
    }
    lines.push('');
  }

  // Entry points
  if (map.entry_points.length > 0) {
    lines.push('## Entry Points');
    for (const ep of map.entry_points.slice(0, 5)) {
      lines.push(`- ${ep}`);
    }
    lines.push('');
  }

  // Hotspots
  if (map.hotspots.length > 0) {
    lines.push('## Hotspots (largest files)');
    for (const hs of map.hotspots.slice(0, 5)) {
      const file = map.files.find(f => f.relativePath === hs);
      if (file) {
        lines.push(`- ${hs} (${file.lineCount} lines)`);
      }
    }
  }

  return lines.slice(0, maxLines).join('\n');
}
