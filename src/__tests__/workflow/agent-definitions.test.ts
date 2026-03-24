/**
 * Tests for Agent Definitions Manager
 */

import { describe, it, expect } from 'vitest';
import {
  getAgentDefinitions,
  getAgentByName,
  registerAgent,
  getRules,
  getActiveRules,
  registerRule,
  registerCommand,
  getCommands,
  registerScript,
  getScripts,
  registerHook,
  getHooks,
  getHooksForEvent,
  bundleDefinitions,
  serializeBundle,
  deserializeBundle,
} from '../../workflow/agent-definitions.js';

describe('getAgentDefinitions', () => {
  it('includes 9 built-in agents', () => {
    const agents = getAgentDefinitions();
    expect(agents.length).toBeGreaterThanOrEqual(9);
  });

  it('includes all expected agent names', () => {
    const names = getAgentDefinitions().map((a) => a.name);
    expect(names).toContain('continuity-manager');
    expect(names).toContain('workflow-router-auditor');
    expect(names).toContain('critique-responder');
    expect(names).toContain('artifact-gatekeeper');
    expect(names).toContain('adapter-parity-auditor');
    expect(names).toContain('eval-engineer');
    expect(names).toContain('trace-grader');
    expect(names).toContain('failure-analyst');
    expect(names).toContain('tooling-integrator');
  });

  it('all built-in agents are active', () => {
    const agents = getAgentDefinitions().filter((a) => a.id.startsWith('agent-'));
    for (const agent of agents) {
      expect(agent.status).toBe('active');
    }
  });
});

describe('getAgentByName', () => {
  it('returns agent by name', () => {
    const agent = getAgentByName('failure-analyst');
    expect(agent).toBeDefined();
    expect(agent!.displayName).toBe('Failure Analyst');
  });

  it('returns undefined for unknown name', () => {
    expect(getAgentByName('nonexistent')).toBeUndefined();
  });
});

describe('registerAgent', () => {
  it('registers a custom agent', () => {
    const before = getAgentDefinitions().length;
    registerAgent({
      name: 'custom-agent',
      displayName: 'Custom Agent',
      description: 'A custom agent',
      capabilities: ['testing'],
      triggers: ['test_trigger'],
      constraints: [],
      successCriteria: [],
      priority: 50,
      status: 'draft',
    });

    expect(getAgentDefinitions().length).toBe(before + 1);
    expect(getAgentByName('custom-agent')).toBeDefined();
  });
});

describe('getRules', () => {
  it('includes built-in security rules', () => {
    const rules = getRules();
    const names = rules.map((r) => r.name);
    expect(names).toContain('secret-scan');
    expect(names).toContain('hmac-verify');
    expect(names).toContain('path-validation');
    expect(names).toContain('audit-logging');
  });

  it('includes workflow rules', () => {
    const rules = getRules();
    const names = rules.map((r) => r.name);
    expect(names).toContain('readiness-gate');
    expect(names).toContain('critic-max-cycles');
  });
});

describe('getActiveRules', () => {
  it('returns only enabled rules', () => {
    const active = getActiveRules();
    for (const rule of active) {
      expect(rule.enabled).toBe(true);
    }
  });
});

describe('registerRule', () => {
  it('registers a custom rule', () => {
    const before = getRules().length;
    registerRule({
      name: 'custom-rule',
      description: 'A custom rule',
      condition: 'custom_event',
      action: 'custom_action',
      severity: 'advisory',
      category: 'quality',
      enabled: true,
    });

    expect(getRules().length).toBe(before + 1);
  });
});

describe('registerCommand / getCommands', () => {
  it('registers and retrieves commands', () => {
    const before = getCommands().length;
    registerCommand({
      name: 'test-cmd',
      description: 'Test command',
      usage: 'noesis test-cmd',
      parameters: [{ name: 'arg1', type: 'string', required: true, description: 'First arg' }],
      category: 'workflow',
      handler: 'test-handler',
    });

    expect(getCommands().length).toBe(before + 1);
  });
});

describe('registerScript / getScripts', () => {
  it('registers and retrieves scripts', () => {
    const before = getScripts().length;
    registerScript({
      name: 'setup-test',
      description: 'Setup test environment',
      interpreter: 'bash',
      content: '#!/bin/bash\necho "setup"',
      category: 'setup',
    });

    expect(getScripts().length).toBe(before + 1);
  });
});

describe('registerHook / getHooks / getHooksForEvent', () => {
  it('registers and retrieves hooks', () => {
    registerHook({
      name: 'pre-sync-check',
      event: 'pre_sync',
      description: 'Check before sync',
      command: 'echo "pre-sync"',
      enabled: true,
    });

    expect(getHooks().length).toBeGreaterThan(0);
    expect(getHooksForEvent('pre_sync').length).toBeGreaterThan(0);
  });

  it('filters by event type', () => {
    const preSyncHooks = getHooksForEvent('pre_sync');
    for (const hook of preSyncHooks) {
      expect(hook.event).toBe('pre_sync');
    }
  });
});

describe('bundleDefinitions', () => {
  it('bundles all definitions', () => {
    const bundle = bundleDefinitions();
    expect(bundle.agents.length).toBeGreaterThanOrEqual(9);
    expect(bundle.rules.length).toBeGreaterThanOrEqual(8);
    expect(bundle.version).toBe('1.0.0');
    expect(bundle.generatedAt).toBeTruthy();
  });
});

describe('serializeBundle / deserializeBundle', () => {
  it('roundtrips a bundle', () => {
    const bundle = bundleDefinitions();
    const json = serializeBundle(bundle);
    const restored = deserializeBundle(json);

    expect(restored.agents.length).toBe(bundle.agents.length);
    expect(restored.rules.length).toBe(bundle.rules.length);
    expect(restored.version).toBe(bundle.version);
  });
});
