/**
 * Codex CLI Adapter
 *
 * Canonical target: Context/AGENTS.md
 * Compatibility bridge: AGENTS.md
 * Budget: 20K tokens
 * Write-back: CLI command write-back
 * Session: Session reporting supported
 *
 * OpenAI Codex CLI reads instructions from AGENTS.md in the project root.
 * Noesis stores the managed project copy in Context/AGENTS.md and the
 * sync layer creates a repo-root compatibility bridge at AGENTS.md.
 *
 * Detection looks for:
 * - .codex/ directory
 * - codex.json
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

const ADAPTER_ID = 'codex-cli';
const DISPLAY_NAME = 'Codex CLI';
const VERSION = '1.0.0';
const TARGET_FILE = 'Context/AGENTS.md';
const DETECTION_PATHS = ['.codex', 'codex.json'];
const CONFIG_PATHS = ['.codex/config.json', 'codex.json'];

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createCodexAdapter(): Adapter {
  const capabilities: AdapterCapabilityDeclaration = {
    canWriteBack: true,
    writeBackMechanism: 'cli_command',
    canSubscribeEvents: false,
    canReportSessions: true,
    supportsStructuredCorrection: false,
  };

  const targetCapabilities: TargetToolCapabilities = {
    maxContextTokens: 128_000,
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

      const hasCodexDir = found.includes('.codex');
      const hasCodexJson = found.includes('codex.json');

      let confidence = 0;
      if (hasCodexDir) {
        confidence = 0.9;
      } else if (hasCodexJson) {
        confidence = 0.8;
      }

      return {
        detected: found.length > 0,
        confidence,
        configPaths: configFound,
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

      const header = `# Agent Instructions (Noesis)\n\n`;
      const fullContent = header + content;

      const fileWrite = buildFileWrite(
        TARGET_FILE,
        fullContent,
        ADAPTER_ID,
        VERSION,
        true,
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
