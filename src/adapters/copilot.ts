/**
 * GitHub Copilot Adapter
 *
 * Target: .github/copilot-instructions.md
 * Budget: 4K tokens
 * Write-back: None (read-only)
 * Session: No session support
 *
 * GitHub Copilot reads instructions from .github/copilot-instructions.md.
 * The extremely tight 4K budget means this adapter outputs only the most
 * critical conventions, anti-patterns, and a brief persona summary.
 * No session continuity or write-back is available. Copilot does not
 * support direct file writes from the adapter.
 *
 * Detection looks for:
 * - .github/copilot-instructions.md
 * - .copilot/ directory
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

const ADAPTER_ID = 'copilot';
const DISPLAY_NAME = 'GitHub Copilot';
const VERSION = '1.0.0';
const TARGET_FILE = '.github/copilot-instructions.md';
const DETECTION_PATHS = ['.github/copilot-instructions.md', '.copilot'];

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createCopilotAdapter(): Adapter {
  const capabilities: AdapterCapabilityDeclaration = {
    canWriteBack: false,
    writeBackMechanism: 'none',
    canSubscribeEvents: false,
    canReportSessions: false,
    supportsStructuredCorrection: false,
  };

  const targetCapabilities: TargetToolCapabilities = {
    maxContextTokens: 8_000,
    supportsSystemPrompt: true,
    supportsFileWrites: false,
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

      const hasInstructionsFile = found.includes(TARGET_FILE);
      const hasCopilotDir = found.includes('.copilot');

      let confidence = 0;
      if (hasInstructionsFile) {
        confidence = 0.9;
      } else if (hasCopilotDir) {
        confidence = 0.5;
      }

      return {
        detected: found.length > 0,
        confidence,
        configPaths: hasInstructionsFile ? [TARGET_FILE] : [],
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

      const header = `# Project Instructions for Copilot\n\n`;
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
