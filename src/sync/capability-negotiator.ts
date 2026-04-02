/**
 * Capability Negotiator
 *
 * Detects per-adapter capabilities and negotiates what features
 * each adapter can support for bidirectional sync.
 *
 * `maxContextTokens` reflects the effective Noesis injection budget for the
 * adapter, not the raw model window advertised by the target tool. That keeps
 * planning, negotiation, and actual sync execution on the same budget.
 */

import { createDefaultAdapterRegistry } from '../adapters/index.js';
import { TOKEN_BUDGETS } from '../constants.js';

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

const CAPABILITY_MATRIX: Record<string, AdapterCapability> = Object.fromEntries(
  Array.from(createDefaultAdapterRegistry().adapters.values()).map((adapter) => [
    adapter.id,
    {
      adapterId: adapter.id,
      maxContextTokens: TOKEN_BUDGETS[adapter.id] ?? adapter.targetCapabilities.maxContextTokens,
      supportsSystemPrompt: adapter.targetCapabilities.supportsSystemPrompt,
      supportsFileWrites: adapter.targetCapabilities.supportsFileWrites,
      supportsManagedSections: adapter.targetCapabilities.supportsManagedSections,
      canWriteBack: adapter.capabilities.canWriteBack,
      writeBackMechanism: adapter.capabilities.writeBackMechanism,
      canSubscribeEvents: adapter.capabilities.canSubscribeEvents,
      supportsStructuredCorrection: adapter.capabilities.supportsStructuredCorrection,
    },
  ]),
);

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
