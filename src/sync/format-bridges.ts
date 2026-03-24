/**
 * Format Bridges
 *
 * Transforms context between different adapter formats.
 * Each adapter may expect context in a specific format:
 * - Markdown (Claude Code, Codex, OpenCode, OpenClaw)
 * - TOML (Antigravity/Gemini CLI)
 * - Frontmatter YAML + Markdown (Cursor, Aider)
 * - JSON (Generic)
 */

// ===========================================================================
// Types
// ===========================================================================

export type FormatType = 'markdown' | 'toml' | 'frontmatter' | 'json' | 'plain';

export interface ContextSection {
  title: string;
  content: string;
  priority: number;
  tokens: number;
}

export interface FormattedOutput {
  format: FormatType;
  content: string;
  sections: number;
  totalTokens: number;
}

// ===========================================================================
// Adapter format mapping
// ===========================================================================

const ADAPTER_FORMATS: Record<string, FormatType> = {
  'claude-code': 'markdown',
  'cursor': 'frontmatter',
  'copilot': 'markdown',
  'aider': 'frontmatter',
  'codex': 'markdown',
  'opencode': 'markdown',
  'antigravity': 'toml',
  'openclaw': 'markdown',
  'generic': 'json',
};

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Get the expected format for an adapter.
 */
export function getAdapterFormat(adapterId: string): FormatType {
  return ADAPTER_FORMATS[adapterId] ?? 'plain';
}

/**
 * Transform context sections into the target format.
 */
export function transformToFormat(
  sections: ContextSection[],
  format: FormatType,
): FormattedOutput {
  const sorted = [...sections].sort((a, b) => b.priority - a.priority);

  let content: string;
  switch (format) {
    case 'markdown':
      content = toMarkdown(sorted);
      break;
    case 'toml':
      content = toTOML(sorted);
      break;
    case 'frontmatter':
      content = toFrontmatter(sorted);
      break;
    case 'json':
      content = toJSON(sorted);
      break;
    default:
      content = toPlain(sorted);
  }

  const totalTokens = sorted.reduce((sum, s) => sum + s.tokens, 0);

  return { format, content, sections: sorted.length, totalTokens };
}

/**
 * Transform context for a specific adapter.
 */
export function transformForAdapter(
  adapterId: string,
  sections: ContextSection[],
): FormattedOutput {
  const format = getAdapterFormat(adapterId);
  return transformToFormat(sections, format);
}

/**
 * Parse a formatted output back into sections.
 */
export function parseFromFormat(
  content: string,
  format: FormatType,
): ContextSection[] {
  switch (format) {
    case 'markdown':
      return parseMarkdown(content);
    case 'toml':
      return parseTOML(content);
    case 'frontmatter':
      return parseFrontmatter(content);
    case 'json':
      return parseJSON(content);
    default:
      return [{ title: 'Content', content, priority: 0, tokens: estimateTokens(content) }];
  }
}

// ===========================================================================
// Format converters
// ===========================================================================

function toMarkdown(sections: ContextSection[]): string {
  return sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n');
}

function toTOML(sections: ContextSection[]): string {
  return sections.map((s) => {
    const escaped = s.content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `[${sanitizeTomlKey(s.title)}]\ncontent = "${escaped}"\npriority = ${s.priority}`;
  }).join('\n\n');
}

function toFrontmatter(sections: ContextSection[]): string {
  const meta = sections.map((s) => `  - title: "${s.title}"\n    priority: ${s.priority}`).join('\n');
  const body = sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n');

  return `---\nsections:\n${meta}\n---\n\n${body}`;
}

function toJSON(sections: ContextSection[]): string {
  return JSON.stringify(
    sections.map((s) => ({
      title: s.title,
      content: s.content,
      priority: s.priority,
      tokens: s.tokens,
    })),
    null,
    2,
  );
}

function toPlain(sections: ContextSection[]): string {
  return sections.map((s) => `=== ${s.title} ===\n${s.content}`).join('\n\n');
}

// ===========================================================================
// Format parsers
// ===========================================================================

function parseMarkdown(content: string): ContextSection[] {
  const sections: ContextSection[] = [];
  const parts = content.split(/\n---\n/);

  for (const part of parts) {
    const match = part.match(/^##\s+(.+)\n\n([\s\S]*)/);
    if (match) {
      sections.push({
        title: match[1].trim(),
        content: match[2].trim(),
        priority: 0,
        tokens: estimateTokens(match[2]),
      });
    }
  }

  return sections;
}

function parseTOML(content: string): ContextSection[] {
  const sections: ContextSection[] = [];
  const blocks = content.split(/\n\n/);

  for (const block of blocks) {
    const titleMatch = block.match(/^\[(.+)]/);
    const contentMatch = block.match(/content\s*=\s*"(.+)"/);
    const priorityMatch = block.match(/priority\s*=\s*(\d+)/);

    if (titleMatch && contentMatch) {
      const text = contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      sections.push({
        title: titleMatch[1],
        content: text,
        priority: priorityMatch ? parseInt(priorityMatch[1], 10) : 0,
        tokens: estimateTokens(text),
      });
    }
  }

  return sections;
}

function parseFrontmatter(content: string): ContextSection[] {
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);
  if (!bodyMatch) return [];

  return parseMarkdown(bodyMatch[1]);
}

function parseJSON(content: string): ContextSection[] {
  try {
    const parsed = JSON.parse(content) as Array<{
      title: string;
      content: string;
      priority: number;
      tokens: number;
    }>;
    return parsed.map((p) => ({
      title: p.title,
      content: p.content,
      priority: p.priority ?? 0,
      tokens: p.tokens ?? estimateTokens(p.content),
    }));
  } catch {
    return [];
  }
}

// ===========================================================================
// Helpers
// ===========================================================================

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sanitizeTomlKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}
