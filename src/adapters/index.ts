/**
 * Adapter Framework
 *
 * Public API for the Noesis adapter system. This barrel re-exports:
 *
 * - The adapter registry (interface + factory)
 * - Managed section utilities
 * - Token budget management
 * - Sandboxed filesystem query
 * - All 9 adapter factories
 *
 * Usage:
 *   import { createAdapterRegistry, createClaudeCodeAdapter } from './adapters/index.js';
 *
 *   const registry = createAdapterRegistry();
 *   registry.register(createClaudeCodeAdapter());
 */

// Registry
export { createAdapterRegistry } from './interface.js';
export type { AdapterRegistry } from './interface.js';

// Managed sections
export {
  createManagedSection,
  extractManagedSection,
  verifyManagedSection,
  replaceManagedSection,
  hashContent,
} from './managed-sections.js';

// Token budget
export {
  createTokenBudget,
  allocateTokens,
  estimateTokens,
  compressContent,
} from './context-budget.js';

// Sandbox
export { createSandboxedQuery } from './sandbox.js';

// Base adapter utilities
export {
  assembleContext,
  assembleEnhancedContext,
  buildFileWrite,
  buildSyncResult,
  extractLearningsFromText,
  verifyContentHash,
} from './base-adapter.js';
export type { CognitiveEnrichment } from './base-adapter.js';

// Adapter factories
export { createClaudeCodeAdapter } from './claude-code.js';
export { createCursorAdapter } from './cursor.js';
export { createCopilotAdapter } from './copilot.js';
export { createAiderAdapter } from './aider.js';
export { createCodexAdapter } from './codex.js';
export { createOpenCodeAdapter } from './opencode.js';
export { createAntigravityAdapter } from './antigravity.js';
export { createOpenClawAdapter } from './openclaw.js';
export { createGenericAdapter } from './generic.js';
export type { GenericAdapterOptions } from './generic.js';

// Re-export types for convenience
export type {
  Adapter,
  AdapterCapabilityDeclaration,
  TargetToolCapabilities,
  DetectionResult,
  UniversalContext,
  TokenBudget,
  SyncResult,
  FileWriteRequest,
  ExtractedLearnings,
  VerifyResult,
  FilesystemQuery,
} from '../types.js';
