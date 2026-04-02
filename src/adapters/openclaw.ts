/**
 * OpenClaw Adapter
 *
 * Canonical target: Context/CLAUDE.md
 * Compatibility bridge: CLAUDE.md
 * Budget: 20K tokens
 * Write-back: File append
 * Session: No session support
 *
 * OpenClaw is an open-source Claude Code alternative that reads
 * CLAUDE.md. Noesis stores the managed project copy in
 * Context/CLAUDE.md and the sync layer creates a repo-root
 * compatibility bridge at CLAUDE.md. Shares the canonical file
 * with Claude Code but uses a distinct adapter ID for separate
 * managed sections. Content is formatted in a YAML-friendly style.
 *
 * Detection looks for:
 * - .openclaw/ directory
 * - openclaw.yaml
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

const ADAPTER_ID = 'openclaw';
const DISPLAY_NAME = 'OpenClaw';
const VERSION = '1.0.0';
const TARGET_FILE = 'Context/CLAUDE.md';
const DETECTION_PATHS = ['.openclaw', 'openclaw.yaml'];
const CONFIG_PATH = '.openclaw/config.yaml';

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createOpenClawAdapter(): Adapter {
  const capabilities: AdapterCapabilityDeclaration = {
    canWriteBack: true,
    writeBackMechanism: 'file_append',
    canSubscribeEvents: false,
    canReportSessions: false,
    supportsStructuredCorrection: false,
  };

  const targetCapabilities: TargetToolCapabilities = {
    maxContextTokens: 100_000,
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

      // Check for the config file
      const configFound: string[] = [];
      if (await query.exists(CONFIG_PATH)) {
        configFound.push(CONFIG_PATH);
      }

      const hasOpenClawDir = found.includes('.openclaw');
      const hasOpenClawYaml = found.includes('openclaw.yaml');

      let confidence = 0;
      if (hasOpenClawDir) {
        confidence = 0.95;
      } else if (hasOpenClawYaml) {
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

      const header = `# Noesis Intelligence Context\n\n> Auto-generated context from Noesis. Do not edit the managed section manually.\n\n`;
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
