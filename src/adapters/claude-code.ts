/**
 * Claude Code Adapter
 *
 * Target: CLAUDE.md
 * Budget: 50K tokens
 * Write-back: Full CLI write-back via `noesis` commands
 * Session: Full session support with structured correction
 *
 * Claude Code reads CLAUDE.md from the project root and from
 * ~/.claude/CLAUDE.md for global instructions. This adapter targets
 * the project-level CLAUDE.md file with managed sections.
 *
 * Detection looks for:
 * - .claude/ directory
 * - CLAUDE.md file
 * - .clauderc file
 */

import type {
  Adapter,
  AdapterCapabilityDeclaration,
  TargetToolCapabilities,
  DetectionResult,
  UniversalContext,
  TokenBudget,
  SyncResult,
  ExtractedLearnings,
  VerifyResult,
  FilesystemQuery,
} from '../types.js';

import { TOKEN_BUDGETS } from '../constants.js';
import {
  assembleContext,
  assembleEnhancedContext,
  buildFileWrite,
  buildSyncResult,
  extractLearningsFromText,
  verifyContentHash,
} from './base-adapter.js';
import type { CognitiveEnrichment } from './base-adapter.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAPTER_ID = 'claude-code';
const DISPLAY_NAME = 'Claude Code';
const VERSION = '1.0.0';
const TARGET_FILE = 'CLAUDE.md';
const DETECTION_PATHS = ['.claude', 'CLAUDE.md', '.clauderc'];
const CONFIG_PATHS = ['.claude/settings.json', 'CLAUDE.md'];

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createClaudeCodeAdapter(): Adapter {
  const capabilities: AdapterCapabilityDeclaration = {
    canWriteBack: true,
    writeBackMechanism: 'cli_command',
    canSubscribeEvents: true,
    canReportSessions: true,
    supportsStructuredCorrection: true,
  };

  const targetCapabilities: TargetToolCapabilities = {
    maxContextTokens: 200_000,
    supportsSystemPrompt: true,
    supportsFileWrites: true,
    supportsManagedSections: true,
  };

  return {
    id: ADAPTER_ID,
    displayName: DISPLAY_NAME,
    version: VERSION,
    capabilities,
    targetCapabilities,

    async detect(query: FilesystemQuery): Promise<DetectionResult> {
      const found: string[] = [];

      for (const path of DETECTION_PATHS) {
        if (await query.exists(path)) {
          found.push(path);
        }
      }

      // Collect actual config paths that exist
      const configFound: string[] = [];
      for (const configPath of CONFIG_PATHS) {
        if (await query.exists(configPath)) {
          configFound.push(configPath);
        }
      }

      const hasClaudeDir = found.includes('.claude');
      const hasClaudeMd = found.includes('CLAUDE.md');
      const hasClaudeRc = found.includes('.clauderc');

      let confidence = 0;
      if (hasClaudeMd || hasClaudeDir) {
        confidence = 0.95;
      } else if (hasClaudeRc) {
        confidence = 0.7;
      }

      return {
        detected: found.length > 0,
        confidence,
        configPaths: configFound,
        version: undefined,
      };
    },

    async transform(context: UniversalContext, budget: TokenBudget): Promise<SyncResult> {
      const effectiveBudget = Math.min(
        budget.remaining,
        TOKEN_BUDGETS[ADAPTER_ID],
      );
      const enrichment = context.cognitiveEnrichment as CognitiveEnrichment | undefined;
      const { content, tokensUsed } = enrichment
        ? assembleEnhancedContext(context, effectiveBudget, enrichment)
        : assembleContext(context, effectiveBudget);

      const header = `# Noesis Intelligence Context\n\n> Auto-generated context from Noesis. Do not edit the managed section manually.\n\n`;
      const fullContent = header + content;

      const fileWrite = buildFileWrite(
        TARGET_FILE,
        fullContent,
        ADAPTER_ID,
        VERSION,
        true, // use managed sections
      );

      return buildSyncResult([fileWrite], tokensUsed);
    },

    async extractLearnings(content: string): Promise<ExtractedLearnings> {
      return extractLearningsFromText(content, ADAPTER_ID);
    },

    verify(content: string, expectedHash: string): VerifyResult {
      return verifyContentHash(content, expectedHash);
    },
  };
}
