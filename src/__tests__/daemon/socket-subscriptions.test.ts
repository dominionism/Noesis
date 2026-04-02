import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSocketSubscriptionTransport } from '../../daemon/socket-subscriptions.js';
import { eventBus } from '../../daemon/events.js';

describe('createSocketSubscriptionTransport', () => {
  afterEach(() => {
    eventBus.clear();
  });

  it('forwards subscribed events as JSON-RPC notifications', () => {
    const socket = {
      destroyed: false,
      writable: true,
      write: vi.fn(),
    };
    const transport = createSocketSubscriptionTransport(socket);

    transport.subscribe('sub-1', ['memory_written']);
    eventBus.emit({
      type: 'memory_written',
      payload: { id: 'mem-1', type: 'task', project_id: null, scope: 'global' },
    });

    expect(socket.write).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((socket.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string) as {
      jsonrpc: string;
      method: string;
      params: { type: string };
    };
    expect(payload.jsonrpc).toBe('2.0');
    expect(payload.method).toBe('event');
    expect(payload.params.type).toBe('memory_written');
  });

  it('stops forwarding after unsubscribe', () => {
    const socket = {
      destroyed: false,
      writable: true,
      write: vi.fn(),
    };
    const transport = createSocketSubscriptionTransport(socket);

    transport.subscribe('sub-1', ['memory_written']);
    expect(transport.unsubscribe('sub-1')).toBe(true);

    eventBus.emit({
      type: 'memory_written',
      payload: { id: 'mem-1', type: 'task', project_id: null, scope: 'global' },
    });

    expect(socket.write).not.toHaveBeenCalled();
    expect(transport.unsubscribe('sub-1')).toBe(false);
  });

  it('replaces existing subscriptions with the same ID', () => {
    const socket = {
      destroyed: false,
      writable: true,
      write: vi.fn(),
    };
    const transport = createSocketSubscriptionTransport(socket);

    transport.subscribe('sub-1', ['memory_written']);
    transport.subscribe('sub-1', ['skill_promoted']);

    eventBus.emit({
      type: 'memory_written',
      payload: { id: 'mem-1', type: 'task', project_id: null, scope: 'global' },
    });
    eventBus.emit({
      type: 'skill_promoted',
      payload: { skill_name: 'linting', confidence: 0.9 },
    });

    expect(socket.write).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((socket.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string) as {
      params: { type: string };
    };
    expect(payload.params.type).toBe('skill_promoted');
  });
});
