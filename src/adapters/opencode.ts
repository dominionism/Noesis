/**
 * OpenCode Adapter
 *
 * Canonical target: Context/AGENTS.md
 * Compatibility bridge: AGENTS.md
 * Budget: 20K tokens
 * Write-back: File append
 * Session: No session support
 *
 * OpenCode reads instructions from AGENTS.md. Noesis stores the managed
 * project copy in Context/AGENTS.md and the sync layer creates a repo-root
 * compatibility bridge at AGENTS.md. This adapter shares the canonical file
 * with Codex CLI but uses a distinct adapter ID so both can coexist with
 * separate managed sections. Content is formatted in a frontmatter-compatible style.
 *
 * Detection looks for:
 * - .opencode/ directory
 * - opencode.json
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

const ADAPTER_ID = 'opencode';
const DISPLAY_NAME = 'OpenCode';
const VERSION = '1.0.0';
const TARGET_FILE = 'Context/AGENTS.md';
const DETECTION_PATHS = ['.opencode', 'opencode.json'];
const CONFIG_PATH = '.opencode/config.json';

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createOpenCodeAdapter(): Adapter {
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

      const hasOpenCodeDir = found.includes('.opencode');
      const hasOpenCodeJson = found.includes('opencode.json');

      let confidence = 0;
      if (hasOpenCodeDir) {
        confidence = 0.9;
      } else if (hasOpenCodeJson) {
        confidence = 0.7;
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
