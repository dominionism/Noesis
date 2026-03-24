/**
 * Antigravity (Gemini CLI) Adapter
 *
 * Target: GEMINI.md
 * Budget: 20K tokens
 * Write-back: CLI command write-back
 * Session: Session reporting supported
 *
 * Antigravity / Google Gemini CLI reads instructions from GEMINI.md
 * in the project root. The massive 1M token context window allows
 * rich context including detailed skills and lesson histories.
 * Content is written with managed sections.
 *
 * Detection looks for:
 * - .gemini/ directory
 * - GEMINI.md file
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

const ADAPTER_ID = 'antigravity';
const DISPLAY_NAME = 'Antigravity (Gemini CLI)';
const VERSION = '1.0.0';
const TARGET_FILE = 'GEMINI.md';
const DETECTION_PATHS = ['.gemini', 'GEMINI.md'];
const CONFIG_PATHS = ['.gemini/settings.json', 'GEMINI.md'];

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createAntigravityAdapter(): Adapter {
  const capabilities: AdapterCapabilityDeclaration = {
    canWriteBack: true,
    writeBackMechanism: 'cli_command',
    canSubscribeEvents: false,
    canReportSessions: true,
    supportsStructuredCorrection: false,
  };

  const targetCapabilities: TargetToolCapabilities = {
    maxContextTokens: 1_000_000,
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

      const hasGeminiMd = found.includes('GEMINI.md');
      const hasGeminiDir = found.includes('.gemini');

      let confidence = 0;
      if (hasGeminiMd) {
        confidence = 0.9;
      } else if (hasGeminiDir) {
        confidence = 0.6;
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

      const header = `# Noesis Intelligence Context\n\n`;
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
