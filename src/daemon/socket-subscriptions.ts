import { eventBus } from './events.js';

import type { Socket } from 'node:net';
import type { NoesisEvent } from '../types.js';

type WritableSocket = Pick<Socket, 'destroyed' | 'writable' | 'write'>;

function normalizeSubscriptionId(subscriptionId: string | number): string {
  return String(subscriptionId);
}

function writeNotification(socket: WritableSocket, event: NoesisEvent): void {
  if (socket.destroyed || !socket.writable) {
    return;
  }

  try {
    socket.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'event',
      params: event,
    }) + '\n');
  } catch {
    // Best-effort transport; socket lifecycle is managed by the daemon.
  }
}

export interface SocketSubscriptionTransport {
  subscribe(subscriptionId: string | number, events: string[]): void;
  unsubscribe(subscriptionId: string | number): boolean;
  cleanup(): void;
}

export function createSocketSubscriptionTransport(socket: WritableSocket): SocketSubscriptionTransport {
  const subscriptions = new Map<string, () => void>();

  return {
    subscribe(subscriptionId, events): void {
      const key = normalizeSubscriptionId(subscriptionId);
      const uniqueEvents = Array.from(new Set(events));

      subscriptions.get(key)?.();

      const cleanups = uniqueEvents.map((eventType) =>
        eventBus.subscribe(eventType, (event) => {
          writeNotification(socket, event);
        }),
      );

      subscriptions.set(key, () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
        subscriptions.delete(key);
      });
    },

    unsubscribe(subscriptionId): boolean {
      const key = normalizeSubscriptionId(subscriptionId);
      const cleanup = subscriptions.get(key);
      if (!cleanup) {
        return false;
      }

      cleanup();
      return true;
    },

    cleanup(): void {
      for (const cleanup of Array.from(subscriptions.values())) {
        cleanup();
      }
      subscriptions.clear();
    },
  };
}
