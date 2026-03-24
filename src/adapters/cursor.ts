/**
 * Cursor Adapter
 *
 * Target: .cursorrules
 * Budget: 8K tokens
 * Write-back: None (read-only)
 * Session: No session support
 *
 * Cursor reads .cursorrules from the project root. The file is typically
 * a single markdown document with project-specific instructions. With
 * only 8K tokens available, this adapter aggressively prioritizes
 * conventions and top skills over verbose context.
 *
 * Detection looks for:
 * - .cursor/ directory
 * - .cursorrules file
 * - .cursor/rules/ directory
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

const ADAPTER_ID = 'cursor';
const DISPLAY_NAME = 'Cursor';
const VERSION = '1.0.0';
const TARGET_FILE = '.cursorrules';
const DETECTION_PATHS = ['.cursor', '.cursorrules', '.cursor/rules'];

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createCursorAdapter(): Adapter {
  const capabilities: AdapterCapabilityDeclaration = {
    canWriteBack: false,
    writeBackMechanism: 'none',
    canSubscribeEvents: false,
    canReportSessions: false,
    supportsStructuredCorrection: false,
  };

  const targetCapabilities: TargetToolCapabilities = {
    maxContextTokens: 32_000,
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

      // Config paths for return: .cursorrules or .cursor/rules/
      const configPaths: string[] = [];
      if (found.includes('.cursorrules')) {
        configPaths.push('.cursorrules');
      }
      if (found.includes('.cursor/rules')) {
        configPaths.push('.cursor/rules');
      }

      return {
        detected: found.length > 0,
        confidence: found.length > 0 ? 0.9 : 0,
        configPaths,
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

      const fileWrite = buildFileWrite(
        TARGET_FILE,
        content,
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
