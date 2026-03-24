/**
 * Command Registry — Command loading, matching, and routing.
 *
 * High-level API that sits above the store, providing:
 * - Command initialization (seeding built-in commands)
 * - Command matching by name or keyword
 * - Command routing (resolving a user input to a command)
 * - Formatted output for tool integration
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  CommandDefinition,
  CommandCategory,
  SignFn,
} from '../types.js';
import {
  getCommandByName,
  listCommands,
  insertCommand,
} from './command-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandMatch {
  command: CommandDefinition;
  score: number;
  matchType: 'exact' | 'prefix' | 'keyword';
}

export interface CommandRoute {
  command: CommandDefinition;
  args: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Route a user input string to a command.
 *
 * Parsing: "/<command-name> <args>"
 * 1. Exact name match
 * 2. Prefix match (shortest unique prefix)
 * 3. null if no match
 */
export function routeCommand(
  db: DatabaseConnection,
  input: string,
): CommandRoute | null {
  const trimmed = input.trim();

  // Must start with /
  if (!trimmed.startsWith('/')) return null;

  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');
  const name = spaceIndex >= 0 ? withoutSlash.slice(0, spaceIndex) : withoutSlash;
  const args = spaceIndex >= 0 ? withoutSlash.slice(spaceIndex + 1).trim() : '';

  // 1. Exact match
  const exact = getCommandByName(db, name);
  if (exact && exact.enabled) {
    return { command: exact, args };
  }

  // 2. Prefix match
  const allEnabled = listCommands(db, { enabledOnly: true });
  const prefixMatches = allEnabled.filter(c => c.name.startsWith(name));

  if (prefixMatches.length === 1) {
    return { command: prefixMatches[0], args };
  }

  return null;
}

/**
 * Match commands by keyword search.
 *
 * Searches name, description, and content.
 * Returns matches sorted by score descending.
 */
export function matchCommands(
  db: DatabaseConnection,
  query: string,
  options?: { category?: CommandCategory; limit?: number },
): CommandMatch[] {
  const commands = listCommands(db, {
    category: options?.category,
    enabledOnly: true,
  });

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (queryWords.length === 0) return [];

  const matches: CommandMatch[] = [];

  for (const command of commands) {
    // Exact name match
    if (command.name === query.toLowerCase()) {
      matches.push({ command, score: 1.0, matchType: 'exact' });
      continue;
    }

    // Prefix match
    if (command.name.startsWith(query.toLowerCase())) {
      matches.push({ command, score: 0.8, matchType: 'prefix' });
      continue;
    }

    // Keyword match across name + description + content
    const searchText = `${command.name} ${command.description} ${command.content}`.toLowerCase();
    const matchedWords = queryWords.filter(w => searchText.includes(w));
    const score = matchedWords.length / queryWords.length;

    if (score > 0.3) {
      matches.push({ command, score: score * 0.6, matchType: 'keyword' });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  const limit = options?.limit ?? 10;
  return matches.slice(0, limit);
}

/**
 * Get all commands grouped by category.
 */
export function getCommandsByCategory(
  db: DatabaseConnection,
): Record<CommandCategory, CommandDefinition[]> {
  const all = listCommands(db, { enabledOnly: true });

  const grouped: Record<CommandCategory, CommandDefinition[]> = {
    workflow: [],
    gsd: [],
    memory: [],
    session: [],
    utility: [],
  };

  for (const cmd of all) {
    grouped[cmd.category].push(cmd);
  }

  return grouped;
}

/**
 * Format a command as help text.
 */
export function formatCommandHelp(command: CommandDefinition): string {
  const lines: string[] = [
    `**/${command.name}** — ${command.description}`,
  ];

  if (command.argument_hint) {
    lines.push(`Usage: /${command.name} ${command.argument_hint}`);
  }

  if (command.allowed_tools.length > 0) {
    lines.push(`Tools: ${command.allowed_tools.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format all commands as a help index.
 */
export function formatCommandIndex(
  db: DatabaseConnection,
): string {
  const grouped = getCommandsByCategory(db);
  const lines: string[] = ['## Available Commands', ''];

  const categoryLabels: Record<CommandCategory, string> = {
    workflow: 'Workflow',
    gsd: 'GSD (Get Stuff Done)',
    memory: 'Memory',
    session: 'Session',
    utility: 'Utility',
  };

  for (const [category, label] of Object.entries(categoryLabels)) {
    const commands = grouped[category as CommandCategory];
    if (commands.length === 0) continue;

    lines.push(`### ${label}`);
    for (const cmd of commands) {
      const hint = cmd.argument_hint ? ` ${cmd.argument_hint}` : '';
      lines.push(`- \`/${cmd.name}${hint}\` — ${cmd.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
