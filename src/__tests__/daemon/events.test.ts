import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, eventBus, EVENT_TYPES } from '../../daemon/events.js';
import type { NoesisEvent } from '../../types.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  // -------------------------------------------------------------------------
  // subscribe + emit
  // -------------------------------------------------------------------------

  describe('subscribe and emit', () => {
    it('delivers events to a type-specific subscriber', () => {
      const received: NoesisEvent[] = [];
      bus.subscribe('memory_written', (event) => received.push(event));

      const event: NoesisEvent = {
        type: 'memory_written',
        payload: {
          id: 'mem-1',
          type: 'task',
          project_id: null,
          scope: 'global',
        },
      };

      bus.emit(event);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(event);
    });

    it('does not deliver events of other types to a specific subscriber', () => {
      const received: NoesisEvent[] = [];
      bus.subscribe('skill_promoted', (event) => received.push(event));

      bus.emit({
        type: 'memory_written',
        payload: {
          id: 'mem-1',
          type: 'task',
          project_id: null,
          scope: 'global',
        },
      });

      expect(received).toHaveLength(0);
    });

    it('delivers to multiple subscribers for the same event type', () => {
      const receivedA: NoesisEvent[] = [];
      const receivedB: NoesisEvent[] = [];

      bus.subscribe('learning_captured', (e) => receivedA.push(e));
      bus.subscribe('learning_captured', (e) => receivedB.push(e));

      bus.emit({
        type: 'learning_captured',
        payload: {
          learning_id: 'learn-1',
          trigger_type: 'user_correction',
          failure_class: null,
        },
      });

      expect(receivedA).toHaveLength(1);
      expect(receivedB).toHaveLength(1);
    });

    it('does not register the same handler reference twice', () => {
      const received: NoesisEvent[] = [];
      const handler = (event: NoesisEvent) => received.push(event);

      bus.subscribe('memory_written', handler);
      bus.subscribe('memory_written', handler);

      bus.emit({
        type: 'memory_written',
        payload: {
          id: 'mem-1',
          type: 'task',
          project_id: null,
          scope: 'global',
        },
      });

      // Set deduplicates — handler called once
      expect(received).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // subscribeAll
  // -------------------------------------------------------------------------

  describe('subscribeAll', () => {
    it('receives all event types', () => {
      const received: NoesisEvent[] = [];
      bus.subscribeAll((event) => received.push(event));

      bus.emit({
        type: 'memory_written',
        payload: { id: 'a', type: 'task', project_id: null, scope: 'global' },
      });
      bus.emit({
        type: 'skill_promoted',
        payload: { skill_name: 'testing', confidence: 0.9 },
      });
      bus.emit({
        type: 'integrity_violation',
        payload: { memory_id: 'x', violation_type: 'hmac_mismatch' },
      });

      expect(received).toHaveLength(3);
      expect(received[0].type).toBe('memory_written');
      expect(received[1].type).toBe('skill_promoted');
      expect(received[2].type).toBe('integrity_violation');
    });

    it('delivers to both type-specific and wildcard handlers', () => {
      const specific: NoesisEvent[] = [];
      const wildcard: NoesisEvent[] = [];

      bus.subscribe('skill_archived', (e) => specific.push(e));
      bus.subscribeAll((e) => wildcard.push(e));

      const event: NoesisEvent = {
        type: 'skill_archived',
        payload: { skill_name: 'old-skill', reason: 'low confidence' },
      };

      bus.emit(event);

      expect(specific).toHaveLength(1);
      expect(wildcard).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // unsubscribe
  // -------------------------------------------------------------------------

  describe('unsubscribe', () => {
    it('stops receiving events after unsubscribe', () => {
      const received: NoesisEvent[] = [];
      const unsub = bus.subscribe('memory_written', (e) => received.push(e));

      bus.emit({
        type: 'memory_written',
        payload: { id: 'a', type: 'task', project_id: null, scope: 'global' },
      });
      expect(received).toHaveLength(1);

      unsub();

      bus.emit({
        type: 'memory_written',
        payload: { id: 'b', type: 'task', project_id: null, scope: 'global' },
      });
      expect(received).toHaveLength(1);
    });

    it('multiple unsubscribe calls are safe (no-op)', () => {
      const unsub = bus.subscribe('memory_written', () => {});
      unsub();
      unsub();
      unsub();
      // No error thrown
    });

    it('unsubscribing one handler does not affect others', () => {
      const receivedA: NoesisEvent[] = [];
      const receivedB: NoesisEvent[] = [];

      const unsubA = bus.subscribe('memory_written', (e) => receivedA.push(e));
      bus.subscribe('memory_written', (e) => receivedB.push(e));

      unsubA();

      bus.emit({
        type: 'memory_written',
        payload: { id: 'a', type: 'task', project_id: null, scope: 'global' },
      });

      expect(receivedA).toHaveLength(0);
      expect(receivedB).toHaveLength(1);
    });

    it('unsubscribing during emit does not affect current dispatch', () => {
      const received: string[] = [];
      let unsub2: (() => void) | undefined;

      bus.subscribe('memory_written', () => {
        received.push('first');
        // Unsubscribe the second handler mid-dispatch
        if (unsub2) unsub2();
      });

      unsub2 = bus.subscribe('memory_written', () => {
        received.push('second');
      });

      bus.emit({
        type: 'memory_written',
        payload: { id: 'a', type: 'task', project_id: null, scope: 'global' },
      });

      // Both should fire because emit snapshots the handler set
      expect(received).toContain('first');
      expect(received).toContain('second');

      // But on the next emit, second should NOT fire
      received.length = 0;
      bus.emit({
        type: 'memory_written',
        payload: { id: 'b', type: 'task', project_id: null, scope: 'global' },
      });
      expect(received).toEqual(['first']);
    });
  });

  // -------------------------------------------------------------------------
  // Error isolation
  // -------------------------------------------------------------------------

  describe('error isolation', () => {
    it('a throwing handler does not prevent other handlers from receiving the event', () => {
      const received: NoesisEvent[] = [];

      // Suppress console.error during this test
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      bus.subscribe('memory_written', () => {
        throw new Error('handler failure');
      });
      bus.subscribe('memory_written', (e) => received.push(e));

      bus.emit({
        type: 'memory_written',
        payload: { id: 'a', type: 'task', project_id: null, scope: 'global' },
      });

      expect(received).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalledOnce();

      errorSpy.mockRestore();
    });

    it('a throwing wildcard handler does not prevent other wildcard handlers', () => {
      const received: NoesisEvent[] = [];
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      bus.subscribeAll(() => {
        throw new Error('wildcard failure');
      });
      bus.subscribeAll((e) => received.push(e));

      bus.emit({
        type: 'skill_promoted',
        payload: { skill_name: 'test', confidence: 0.8 },
      });

      expect(received).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalledOnce();

      errorSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // listSubscriptions
  // -------------------------------------------------------------------------

  describe('listSubscriptions', () => {
    it('returns empty map when no subscriptions', () => {
      const subs = bus.listSubscriptions();
      expect(subs.size).toBe(0);
    });

    it('counts handlers per event type', () => {
      bus.subscribe('memory_written', () => {});
      bus.subscribe('memory_written', () => {});
      bus.subscribe('skill_promoted', () => {});
      bus.subscribeAll(() => {});

      const subs = bus.listSubscriptions();
      expect(subs.get('memory_written')).toBe(2);
      expect(subs.get('skill_promoted')).toBe(1);
      expect(subs.get('*')).toBe(1);
    });

    it('returns a snapshot that does not affect the bus', () => {
      bus.subscribe('memory_written', () => {});
      const subs = bus.listSubscriptions();
      subs.set('memory_written', 999);

      const subs2 = bus.listSubscriptions();
      expect(subs2.get('memory_written')).toBe(1);
    });

    it('removes event type from map when last handler unsubscribes', () => {
      const unsub = bus.subscribe('memory_written', () => {});
      expect(bus.listSubscriptions().has('memory_written')).toBe(true);

      unsub();
      expect(bus.listSubscriptions().has('memory_written')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------------

  describe('clear', () => {
    it('removes all subscriptions', () => {
      bus.subscribe('memory_written', () => {});
      bus.subscribe('skill_promoted', () => {});
      bus.subscribeAll(() => {});

      bus.clear();

      expect(bus.listSubscriptions().size).toBe(0);
    });

    it('handlers do not fire after clear', () => {
      const received: NoesisEvent[] = [];
      bus.subscribe('memory_written', (e) => received.push(e));
      bus.subscribeAll((e) => received.push(e));

      bus.clear();

      bus.emit({
        type: 'memory_written',
        payload: { id: 'a', type: 'task', project_id: null, scope: 'global' },
      });

      expect(received).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // All 9 event types
  // -------------------------------------------------------------------------

  describe('all event types', () => {
    it('EVENT_TYPES constant contains exactly 26 types', () => {
      expect(EVENT_TYPES).toHaveLength(26);
    });

    it('can emit and receive all 26 event types', () => {
      const received: string[] = [];
      bus.subscribeAll((e) => received.push(e.type));

      const events: NoesisEvent[] = [
        // Core events (9)
        { type: 'memory_written', payload: { id: 'a', type: 'task', project_id: null, scope: 'global' } },
        { type: 'memory_conflict_detected', payload: { conflict_id: 'c1', memory_a_id: 'a', memory_b_id: 'b', conflict_type: 'semantic' } },
        { type: 'skill_promoted', payload: { skill_name: 's1', confidence: 0.9 } },
        { type: 'skill_archived', payload: { skill_name: 's2', reason: 'low usage' } },
        { type: 'anti_pattern_created', payload: { name: 'ap1', failure_mode: 'incorrect retry' } },
        { type: 'checkpoint_available', payload: { checkpoint_id: 'cp1', project_id: 'p1', handoff_target: 'agent-2' } },
        { type: 'integrity_violation', payload: { memory_id: 'm1', violation_type: 'hmac_fail' } },
        { type: 'workflow_state_changed', payload: { workflow_id: 'w1', from_phase: 'plan', to_phase: 'execute' } },
        { type: 'learning_captured', payload: { learning_id: 'l1', trigger_type: 'eval_failure', failure_class: 'logic_error' } },
        // Cognitive events (17)
        { type: 'rule_matched', payload: { rule_id: 'r1', rule_name: 'test', task_id: 't1', matched_triggers: 2 } },
        { type: 'rule_violated', payload: { rule_id: 'r1', rule_name: 'test', violation_count: 1, blocking: true } },
        { type: 'rule_evolved', payload: { rule_id: 'r1', rule_name: 'test', modification_type: 'threshold', trigger: 'learning' } },
        { type: 'expert_routed', payload: { expert_id: 'e1', expert_name: 'arch', task_id: 't1', score: 0.9 } },
        { type: 'expert_outcome', payload: { expert_id: 'e1', expert_name: 'arch', task_id: 't1', outcome: 'success' } },
        { type: 'capsule_matched', payload: { capsule_id: 'c1', capsule_name: 'deep', task_id: 't1', score: 0.8 } },
        { type: 'capsule_assembled', payload: { capsule_id: 'c1', capsule_name: 'deep', component_count: 5, enrichment_count: 3 } },
        { type: 'skill_invoked', payload: { skill_id: 's1', skill_name: 'test', task_id: 't1' } },
        { type: 'context_updated', payload: { context_type: 'state', project_id: null, version: 2 } },
        { type: 'quality_gate_checked', payload: { gate_type: 'readiness', passed: true, score: 85 } },
        { type: 'learning_writeback', payload: { target_type: 'rule', target_id: 'r1', modification_type: 'threshold', trigger: 'failure' } },
        { type: 'prediction_generated', payload: { task_id: 't1', prediction_count: 3, highest_risk: 0.7 } },
        { type: 'checkpoint_created', payload: { checkpoint_id: 'cp2', project_id: 'p1', phase: 'execute' } },
        { type: 'deviation_recorded', payload: { project_id: 'p1', rule: 2, deviation_type: 'scope', auto_fixed: false } },
        { type: 'session_started', payload: { session_id: 'ss1', project_id: 'p1', agent: 'test' } },
        { type: 'session_ended', payload: { session_id: 'ss1', project_id: 'p1', agent: 'test' } },
        { type: 'handoff_created', payload: { handoff_id: 'h1', source_agent: 'a1', target_agent: 'a2', reason: 'context_limit' } },
      ];

      for (const event of events) {
        bus.emit(event);
      }

      expect(received).toHaveLength(26);
      expect(received).toEqual(EVENT_TYPES as unknown as string[]);
    });
  });

  // -------------------------------------------------------------------------
  // Singleton export
  // -------------------------------------------------------------------------

  describe('singleton', () => {
    it('eventBus is an instance of EventBus', () => {
      expect(eventBus).toBeInstanceOf(EventBus);
    });

    it('eventBus is a singleton (same reference on repeated import)', async () => {
      const { eventBus: bus2 } = await import('../../daemon/events.js');
      expect(bus2).toBe(eventBus);
    });
  });
});
