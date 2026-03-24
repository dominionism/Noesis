/**
 * Adapter Registry
 *
 * Re-exports the Adapter interface from types.ts and provides a registry
 * for managing multiple adapter instances. The registry supports:
 *
 * - Registration of adapter implementations
 * - Concurrent detection across all registered adapters
 * - Lookup by adapter ID
 *
 * The registry enforces unique IDs: registering an adapter with a
 * duplicate ID throws rather than silently replacing.
 */

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

import type { Adapter, DetectionResult, FilesystemQuery } from '../types.js';

// ---------------------------------------------------------------------------
// Registry interface
// ---------------------------------------------------------------------------

export interface AdapterRegistry {
  readonly adapters: Map<string, Adapter>;
  register(adapter: Adapter): void;
  detect(query: FilesystemQuery): Promise<Map<string, DetectionResult>>;
  getAdapter(id: string): Adapter | undefined;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new adapter registry.
 *
 * The registry holds adapters in a Map keyed by their `id` field.
 * `detect` runs all adapter detection concurrently via `Promise.all`
 * so filesystem queries happen in parallel.
 */
export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, Adapter>();

  return {
    get adapters() {
      return adapters;
    },

    register(adapter: Adapter): void {
      if (adapters.has(adapter.id)) {
        throw new Error(
          `Adapter registry: duplicate adapter ID '${adapter.id}'. ` +
            'Each adapter must have a unique identifier.',
        );
      }
      adapters.set(adapter.id, adapter);
    },

    async detect(query: FilesystemQuery): Promise<Map<string, DetectionResult>> {
      const entries = Array.from(adapters.entries());
      const results = await Promise.all(
        entries.map(async ([id, adapter]) => {
          const result = await adapter.detect(query);
          return [id, result] as const;
        }),
      );

      const detectionMap = new Map<string, DetectionResult>();
      for (const [id, result] of results) {
        detectionMap.set(id, result);
      }
      return detectionMap;
    },

    getAdapter(id: string): Adapter | undefined {
      return adapters.get(id);
    },
  };
}
