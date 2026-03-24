/**
 * Push-based Event Notification Bus
 *
 * Provides an in-process publish/subscribe mechanism for Noesis internal
 * events. The EventBus dispatches NoesisEvent payloads to registered
 * handlers, supporting both type-specific and wildcard subscriptions.
 *
 * Design decisions:
 * - Handlers are stored in Sets (O(1) add/delete, no duplicates).
 * - Each subscribe call returns an unsubscribe function (RAII-style cleanup).
 * - Emit iterates a snapshot of the handler set to prevent mutation during
 *   dispatch (a handler calling unsubscribe during its own invocation is safe).
 * - Errors thrown by individual handlers are caught and logged to stderr;
 *   one failing handler never prevents others from receiving the event.
 * - A singleton instance is exported for process-wide use.
 *
 * Supported event types (26 total, from the NoesisEvent discriminated union):
 *   memory_written, memory_conflict_detected, skill_promoted, skill_archived,
 *   anti_pattern_created, checkpoint_available, integrity_violation,
 *   workflow_state_changed, learning_captured, rule_matched, rule_violated,
 *   rule_evolved, expert_routed, expert_outcome, capsule_matched,
 *   capsule_assembled, skill_invoked, context_updated, quality_gate_checked,
 *   learning_writeback, prediction_generated, checkpoint_created,
 *   deviation_recorded, session_started, session_ended, handoff_created
 *
 * Security:
 * - A09: Event payloads never contain raw secrets or sensitive content.
 *         They carry only identifiers, type labels, and numeric scores.
 * - A04: No external input reaches the event bus directly; only internal
 *         modules emit events after validation.
 */

import type { NoesisEvent } from '../types.js';

/**
 * Callback signature for event subscribers.
 */
export type EventHandler = (event: NoesisEvent) => void;

/**
 * All recognized event type strings from the NoesisEvent discriminated union.
 * Used for documentation and validation; the bus itself accepts any string
 * key to remain forward-compatible.
 */
export const EVENT_TYPES = [
  // Core memory events
  'memory_written',
  'memory_conflict_detected',
  'skill_promoted',
  'skill_archived',
  'anti_pattern_created',
  'checkpoint_available',
  'integrity_violation',
  'workflow_state_changed',
  'learning_captured',
  // Cognitive events
  'rule_matched',
  'rule_violated',
  'rule_evolved',
  'expert_routed',
  'expert_outcome',
  'capsule_matched',
  'capsule_assembled',
  'skill_invoked',
  'context_updated',
  'quality_gate_checked',
  'learning_writeback',
  'prediction_generated',
  'checkpoint_created',
  'deviation_recorded',
  'session_started',
  'session_ended',
  'handoff_created',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Internal wildcard key used to store handlers registered via subscribeAll().
 * This is not a valid NoesisEvent type, so it cannot collide with real events.
 */
const WILDCARD_KEY = '*';

/**
 * In-process event bus for Noesis internal notifications.
 *
 * Thread-safety note: Node.js is single-threaded, so there are no data races.
 * The snapshot-before-iterate pattern in emit() guards against mutation during
 * dispatch (e.g., a handler that unsubscribes itself).
 */
export class EventBus {
  /**
   * Map from event type (or wildcard) to the set of registered handlers.
   * Using a Map<string, Set<EventHandler>> provides:
   *   - O(1) subscribe/unsubscribe
   *   - No duplicate handler references per event type
   *   - Clean iteration semantics
   */
  private readonly handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * Subscribe to a specific event type.
   *
   * @param eventType - The event type string to listen for.
   * @param handler   - Callback invoked when a matching event is emitted.
   * @returns An unsubscribe function. Calling it removes this specific
   *          handler from this specific event type. Safe to call multiple
   *          times (subsequent calls are no-ops).
   */
  subscribe(eventType: string, handler: EventHandler): () => void {
    let handlerSet = this.handlers.get(eventType);
    if (!handlerSet) {
      handlerSet = new Set();
      this.handlers.set(eventType, handlerSet);
    }
    handlerSet.add(handler);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      const set = this.handlers.get(eventType);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.handlers.delete(eventType);
        }
      }
    };
  }

  /**
   * Subscribe to all event types (wildcard subscription).
   *
   * The handler will be invoked for every event emitted, regardless of type.
   *
   * @param handler - Callback invoked on every emitted event.
   * @returns An unsubscribe function.
   */
  subscribeAll(handler: EventHandler): () => void {
    return this.subscribe(WILDCARD_KEY, handler);
  }

  /**
   * Dispatch an event to all matching subscribers.
   *
   * Invocation order:
   * 1. All handlers registered for the specific event type.
   * 2. All wildcard handlers (registered via subscribeAll).
   *
   * Each handler is called synchronously in registration order (Set iteration
   * order in V8 is insertion order). A snapshot of the handler set is taken
   * before iteration so that subscribe/unsubscribe calls within a handler
   * do not affect the current dispatch cycle.
   *
   * Errors thrown by any handler are caught, logged to stderr, and do not
   * prevent remaining handlers from executing.
   */
  emit(event: NoesisEvent): void {
    // Dispatch to type-specific handlers
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      const snapshot = Array.from(typeHandlers);
      for (const handler of snapshot) {
        try {
          handler(event);
        } catch (err) {
          // Non-fatal: log and continue dispatching to remaining handlers
          console.error(
            `[EventBus] Handler error for event "${event.type}":`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    // Dispatch to wildcard handlers
    const wildcardHandlers = this.handlers.get(WILDCARD_KEY);
    if (wildcardHandlers) {
      const snapshot = Array.from(wildcardHandlers);
      for (const handler of snapshot) {
        try {
          handler(event);
        } catch (err) {
          console.error(
            `[EventBus] Wildcard handler error for event "${event.type}":`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }

  /**
   * List the number of subscribers per event type.
   *
   * The wildcard key ('*') appears in the map if any subscribeAll handlers
   * are registered.
   *
   * @returns A new Map snapshot; mutations do not affect the bus.
   */
  listSubscriptions(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [eventType, handlerSet] of this.handlers) {
      result.set(eventType, handlerSet.size);
    }
    return result;
  }

  /**
   * Remove all subscriptions from the bus.
   *
   * Useful for test teardown and daemon shutdown.
   */
  clear(): void {
    this.handlers.clear();
  }
}

/**
 * Singleton EventBus instance for process-wide use.
 *
 * All Noesis modules that emit or consume events should use this instance
 * to ensure events flow through a single dispatch point.
 */
export const eventBus = new EventBus();
