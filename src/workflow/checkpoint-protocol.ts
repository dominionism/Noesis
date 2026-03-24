/**
 * Checkpoint Protocol — 3-Type Checkpoint System
 *
 * Manages execution checkpoints that require human interaction:
 *
 * 1. human_verify — human must verify something before continuing
 * 2. decision — human must choose from options before continuing
 * 3. human_action — human must perform an action before continuing
 *
 * Any pending (unresolved) checkpoint blocks further execution.
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export type CheckpointType = 'human_verify' | 'decision' | 'human_action';

export interface Checkpoint {
  id: string;
  type: CheckpointType;
  description: string;
  context: string;
  options?: string[];
  resolved: boolean;
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface CheckpointProtocol {
  create(type: CheckpointType, description: string, context: string, options?: string[]): Checkpoint;
  resolve(id: string, resolution?: string): Checkpoint;
  getPending(): Checkpoint[];
  getAll(): Checkpoint[];
  isBlocked(): boolean;
  clear(): void;
}

// ===========================================================================
// Implementation
// ===========================================================================

/**
 * Create a new checkpoint protocol instance.
 *
 * The protocol manages an in-memory list of checkpoints.
 * Execution is blocked whenever any checkpoint is pending (unresolved).
 */
export function createCheckpointProtocol(): CheckpointProtocol {
  const checkpoints: Checkpoint[] = [];

  return {
    create(
      type: CheckpointType,
      description: string,
      context: string,
      options?: string[],
    ): Checkpoint {
      const checkpoint: Checkpoint = {
        id: generateId(),
        type,
        description,
        context,
        resolved: false,
        createdAt: new Date().toISOString(),
      };

      if (options !== undefined) {
        checkpoint.options = options;
      }

      checkpoints.push(checkpoint);
      return checkpoint;
    },

    resolve(id: string, resolution?: string): Checkpoint {
      const checkpoint = checkpoints.find((c) => c.id === id);
      if (!checkpoint) {
        throw new Error(`Checkpoint not found: ${id}`);
      }
      if (checkpoint.resolved) {
        throw new Error(`Checkpoint already resolved: ${id}`);
      }

      checkpoint.resolved = true;
      checkpoint.resolvedAt = new Date().toISOString();
      if (resolution !== undefined) {
        checkpoint.resolution = resolution;
      }

      return checkpoint;
    },

    getPending(): Checkpoint[] {
      return checkpoints.filter((c) => !c.resolved);
    },

    getAll(): Checkpoint[] {
      return [...checkpoints];
    },

    isBlocked(): boolean {
      return checkpoints.some((c) => !c.resolved);
    },

    clear(): void {
      checkpoints.length = 0;
    },
  };
}
