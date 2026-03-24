/**
 * Capability Negotiator
 *
 * Detects per-adapter capabilities and negotiates what features
 * each adapter can support for bidirectional sync.
 */

// ===========================================================================
// Types
// ===========================================================================

export interface AdapterCapability {
  adapterId: string;
  maxContextTokens: number;
  supportsSystemPrompt: boolean;
  supportsFileWrites: boolean;
  supportsManagedSections: boolean;
  canWriteBack: boolean;
  writeBackMechanism: 'cli_command' | 'file_append' | 'none';
  canSubscribeEvents: boolean;
  supportsStructuredCorrection: boolean;
}

export interface NegotiationResult {
  adapterId: string;
  effectiveTokenBudget: number;
  features: {
    managedSections: boolean;
    writeBack: boolean;
    eventSubscription: boolean;
    structuredCorrection: boolean;
  };
  constraints: string[];
}

// ===========================================================================
// Adapter capability matrix
// ===========================================================================

const CAPABILITY_MATRIX: Record<string, AdapterCapability> = {
  'claude-code': {
    adapterId: 'claude-code',
    maxContextTokens: 50_000,
    supportsSystemPrompt: true,
    supportsFileWrites: true,
    supportsManagedSections: true,
    canWriteBack: true,
    writeBackMechanism: 'file_append',
    canSubscribeEvents: true,
    supportsStructuredCorrection: true,
  },
  'cursor': {
    adapterId: 'cursor',
    maxContextTokens: 8_000,
    supportsSystemPrompt: true,
    supportsFileWrites: true,
    supportsManagedSections: true,
    canWriteBack: false,
    writeBackMechanism: 'none',
    canSubscribeEvents: false,
    supportsStructuredCorrection: false,
  },
  'copilot': {
    adapterId: 'copilot',
    maxContextTokens: 4_000,
    supportsSystemPrompt: false,
    supportsFileWrites: true,
    supportsManagedSections: true,
    canWriteBack: false,
    writeBackMechanism: 'none',
    canSubscribeEvents: false,
    supportsStructuredCorrection: false,
  },
  'aider': {
    adapterId: 'aider',
    maxContextTokens: 20_000,
    supportsSystemPrompt: false,
    supportsFileWrites: true,
    supportsManagedSections: false,
    canWriteBack: true,
    writeBackMechanism: 'file_append',
    canSubscribeEvents: false,
    supportsStructuredCorrection: false,
  },
  'codex': {
    adapterId: 'codex',
    maxContextTokens: 20_000,
    supportsSystemPrompt: true,
    supportsFileWrites: true,
    supportsManagedSections: true,
    canWriteBack: true,
    writeBackMechanism: 'cli_command',
    canSubscribeEvents: false,
    supportsStructuredCorrection: false,
  },
  'opencode': {
    adapterId: 'opencode',
    maxContextTokens: 20_000,
    supportsSystemPrompt: false,
    supportsFileWrites: true,
    supportsManagedSections: true,
    canWriteBack: true,
    writeBackMechanism: 'file_append',
    canSubscribeEvents: false,
    supportsStructuredCorrection: false,
  },
  'antigravity': {
    adapterId: 'antigravity',
    maxContextTokens: 20_000,
    supportsSystemPrompt: false,
    supportsFileWrites: true,
    supportsManagedSections: true,
    canWriteBack: true,
    writeBackMechanism: 'file_append',
    canSubscribeEvents: false,
    supportsStructuredCorrection: false,
  },
  'openclaw': {
    adapterId: 'openclaw',
    maxContextTokens: 20_000,
    supportsSystemPrompt: false,
    supportsFileWrites: true,
    supportsManagedSections: true,
    canWriteBack: true,
    writeBackMechanism: 'file_append',
    canSubscribeEvents: false,
    supportsStructuredCorrection: false,
  },
  'generic': {
    adapterId: 'generic',
    maxContextTokens: 10_000,
    supportsSystemPrompt: false,
    supportsFileWrites: true,
    supportsManagedSections: false,
    canWriteBack: false,
    writeBackMechanism: 'none',
    canSubscribeEvents: false,
    supportsStructuredCorrection: false,
  },
};

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Get capabilities for a specific adapter.
 */
export function getCapabilities(adapterId: string): AdapterCapability | null {
  return CAPABILITY_MATRIX[adapterId] ?? null;
}

/**
 * Get all known adapter capabilities.
 */
export function getAllCapabilities(): AdapterCapability[] {
  return Object.values(CAPABILITY_MATRIX);
}

/**
 * Negotiate effective features for an adapter given a requested budget.
 */
export function negotiate(
  adapterId: string,
  requestedBudget?: number,
): NegotiationResult | null {
  const cap = CAPABILITY_MATRIX[adapterId];
  if (!cap) return null;

  const constraints: string[] = [];
  const effectiveBudget = Math.min(
    requestedBudget ?? cap.maxContextTokens,
    cap.maxContextTokens,
  );

  if (requestedBudget && requestedBudget > cap.maxContextTokens) {
    constraints.push(
      `Requested ${requestedBudget} tokens but adapter max is ${cap.maxContextTokens}`,
    );
  }

  if (!cap.supportsManagedSections) {
    constraints.push('Managed sections not supported; using full file write');
  }

  if (!cap.canWriteBack) {
    constraints.push('Write-back not supported; sync is one-way only');
  }

  return {
    adapterId,
    effectiveTokenBudget: effectiveBudget,
    features: {
      managedSections: cap.supportsManagedSections,
      writeBack: cap.canWriteBack,
      eventSubscription: cap.canSubscribeEvents,
      structuredCorrection: cap.supportsStructuredCorrection,
    },
    constraints,
  };
}

/**
 * Negotiate all detected adapters.
 */
export function negotiateAll(
  detectedAdapterIds: string[],
  globalBudget?: number,
): NegotiationResult[] {
  const results: NegotiationResult[] = [];

  for (const id of detectedAdapterIds) {
    const result = negotiate(id, globalBudget);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Check if an adapter supports a specific feature.
 */
export function supportsFeature(
  adapterId: string,
  feature: keyof NegotiationResult['features'],
): boolean {
  const cap = CAPABILITY_MATRIX[adapterId];
  if (!cap) return false;

  switch (feature) {
    case 'managedSections': return cap.supportsManagedSections;
    case 'writeBack': return cap.canWriteBack;
    case 'eventSubscription': return cap.canSubscribeEvents;
    case 'structuredCorrection': return cap.supportsStructuredCorrection;
    default: return false;
  }
}
