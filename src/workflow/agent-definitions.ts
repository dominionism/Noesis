/**
 * Agent Definitions Manager
 *
 * Manages the lifecycle of expert agent definitions, workflow commands,
 * reusable rules, helper scripts, and hooks. These are the portable
 * artifacts that get distributed to all adapters via noesis sync.
 *
 * Directory Structure:
 *   ~/.agents/agents/      — Expert agent definitions (YAML)
 *   ~/.agents/commands/    — Workflow commands
 *   ~/.agents/rules/common/ — Reusable rules
 *   ~/.agents/scripts/     — Helper scripts
 *   ~/.agents/hooks/       — Tool hooks
 */

import { generateId } from '../core/ulid.js';

// ===========================================================================
// Types
// ===========================================================================

export interface AgentDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  capabilities: string[];
  triggers: string[];
  constraints: string[];
  successCriteria: string[];
  priority: number;
  status: 'active' | 'draft' | 'archived';
}

export interface WorkflowCommand {
  id: string;
  name: string;
  description: string;
  usage: string;
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  category: 'workflow' | 'memory' | 'sync' | 'admin';
  handler: string; // Reference to CLI command
}

export interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  action: string;
  severity: 'blocking' | 'warning' | 'advisory';
  category: 'quality' | 'safety' | 'workflow' | 'security';
  enabled: boolean;
}

export interface HelperScript {
  id: string;
  name: string;
  description: string;
  interpreter: 'bash' | 'node' | 'python';
  content: string;
  category: 'setup' | 'deploy' | 'utility' | 'debug';
}

export interface ToolHook {
  id: string;
  name: string;
  event: 'pre_commit' | 'post_commit' | 'pre_sync' | 'post_sync' | 'pre_workflow' | 'post_workflow';
  description: string;
  command: string;
  enabled: boolean;
}

export interface DefinitionsBundle {
  agents: AgentDefinition[];
  commands: WorkflowCommand[];
  rules: WorkflowRule[];
  scripts: HelperScript[];
  hooks: ToolHook[];
  version: string;
  generatedAt: string;
}

// ===========================================================================
// Built-in agent definitions (9 experts from spec)
// ===========================================================================

const BUILT_IN_AGENTS: AgentDefinition[] = [
  {
    id: 'agent-continuity-manager',
    name: 'continuity-manager',
    displayName: 'Continuity Manager',
    description: 'Manages sessions, handoffs, and runtime state for context continuity',
    capabilities: ['session_management', 'handoff_protocol', 'state_tracking'],
    triggers: ['context_limit', 'session_transition', 'tool_switch'],
    constraints: ['Must preserve all in-flight state', 'Must create checkpoint before handoff'],
    successCriteria: ['Zero context loss during transitions', 'Handoff acknowledged within 1 interaction'],
    priority: 90,
    status: 'active',
  },
  {
    id: 'agent-workflow-auditor',
    name: 'workflow-router-auditor',
    displayName: 'Workflow Router Auditor',
    description: 'Enforces RPI gate compliance and validates readiness evidence',
    capabilities: ['readiness_validation', 'gate_enforcement', 'workflow_audit'],
    triggers: ['workflow_start', 'phase_transition', 'gate_check'],
    constraints: ['Cannot bypass readiness gates', 'Must log all gate decisions'],
    successCriteria: ['All workflows pass readiness checks', 'No gate bypasses'],
    priority: 95,
    status: 'active',
  },
  {
    id: 'agent-critique-responder',
    name: 'critique-responder',
    displayName: 'Critique Responder',
    description: 'Maps critique feedback to actionable fixes',
    capabilities: ['critique_analysis', 'fix_mapping', 'issue_remediation'],
    triggers: ['critique_received', 'review_feedback', 'blocking_issue'],
    constraints: ['Must address all blocking issues', 'Max 2 revision cycles'],
    successCriteria: ['All blocking critiques resolved', 'Fix quality verified'],
    priority: 80,
    status: 'active',
  },
  {
    id: 'agent-artifact-gatekeeper',
    name: 'artifact-gatekeeper',
    displayName: 'Artifact Gatekeeper',
    description: 'Makes artifact promotion decisions based on quality gates',
    capabilities: ['artifact_validation', 'promotion_gates', 'quality_assessment'],
    triggers: ['artifact_ready', 'promotion_request', 'release_candidate'],
    constraints: ['Must verify all quality criteria', 'No silent promotions'],
    successCriteria: ['Promoted artifacts meet all gates', 'Rejection reasons documented'],
    priority: 85,
    status: 'active',
  },
  {
    id: 'agent-adapter-parity-auditor',
    name: 'adapter-parity-auditor',
    displayName: 'Adapter Parity Auditor',
    description: 'Ensures cross-CLI capability matrix alignment',
    capabilities: ['capability_comparison', 'parity_checking', 'adapter_sync'],
    triggers: ['sync_request', 'adapter_update', 'parity_check'],
    constraints: ['Must respect per-adapter capabilities', 'Cannot force unsupported features'],
    successCriteria: ['All adapters receive appropriate context', 'No capability mismatches'],
    priority: 70,
    status: 'active',
  },
  {
    id: 'agent-eval-engineer',
    name: 'eval-engineer',
    displayName: 'Eval Engineer',
    description: 'Designs and runs scenario-based regression tests',
    capabilities: ['test_design', 'regression_detection', 'coverage_analysis'],
    triggers: ['test_request', 'regression_suspected', 'coverage_gap'],
    constraints: ['Must cover happy, edge, and failure cases', 'Tests as documentation'],
    successCriteria: ['Test coverage meets thresholds', 'No regressions introduced'],
    priority: 75,
    status: 'active',
  },
  {
    id: 'agent-trace-grader',
    name: 'trace-grader',
    displayName: 'Trace Grader',
    description: 'Assesses trajectory quality and detects delegation drift',
    capabilities: ['trajectory_analysis', 'quality_grading', 'drift_detection'],
    triggers: ['workflow_complete', 'quality_review', 'delegation_audit'],
    constraints: ['Must grade against original intent', 'Must detect scope creep'],
    successCriteria: ['Trajectory aligns with intent', 'No undetected drift'],
    priority: 65,
    status: 'active',
  },
  {
    id: 'agent-failure-analyst',
    name: 'failure-analyst',
    displayName: 'Failure Analyst',
    description: 'Diagnoses failures and extracts lessons',
    capabilities: ['failure_diagnosis', 'root_cause_analysis', 'lesson_extraction'],
    triggers: ['task_failure', 'error_detected', 'incident_report'],
    constraints: ['Must identify root cause, not symptoms', 'Must produce actionable lessons'],
    successCriteria: ['Root cause identified', 'Lesson captured and retrievable'],
    priority: 85,
    status: 'active',
  },
  {
    id: 'agent-tooling-integrator',
    name: 'tooling-integrator',
    displayName: 'Tooling Integrator',
    description: 'Manages MCP integration, approvals, and helper script setup',
    capabilities: ['mcp_integration', 'approval_management', 'script_setup'],
    triggers: ['tool_setup', 'integration_request', 'automation_need'],
    constraints: ['Must validate tool compatibility', 'Must handle permission requirements'],
    successCriteria: ['Tools integrated and functional', 'Automation working correctly'],
    priority: 60,
    status: 'active',
  },
];

// ===========================================================================
// Built-in workflow rules
// ===========================================================================

const BUILT_IN_RULES: WorkflowRule[] = [
  {
    id: 'rule-readiness-gate',
    name: 'readiness-gate',
    description: 'Block implementation if readiness score < 70',
    condition: 'readiness_score < 70',
    action: 'block_and_suggest_improvements',
    severity: 'blocking',
    category: 'workflow',
    enabled: true,
  },
  {
    id: 'rule-critic-max-cycles',
    name: 'critic-max-cycles',
    description: 'Limit critic revision cycles to 2',
    condition: 'critic_cycles > 2',
    action: 'require_human_judgment',
    severity: 'blocking',
    category: 'workflow',
    enabled: true,
  },
  {
    id: 'rule-secret-scan',
    name: 'secret-scan',
    description: 'Scan all memory content for secrets before storage',
    condition: 'memory_write',
    action: 'scan_and_redact',
    severity: 'blocking',
    category: 'security',
    enabled: true,
  },
  {
    id: 'rule-hmac-verify',
    name: 'hmac-verify',
    description: 'Verify HMAC signature on all memory reads',
    condition: 'memory_read',
    action: 'verify_integrity',
    severity: 'blocking',
    category: 'security',
    enabled: true,
  },
  {
    id: 'rule-path-validation',
    name: 'path-validation',
    description: 'Validate all file paths to prevent traversal',
    condition: 'file_operation',
    action: 'validate_path',
    severity: 'blocking',
    category: 'security',
    enabled: true,
  },
  {
    id: 'rule-audit-logging',
    name: 'audit-logging',
    description: 'Log all security-relevant events',
    condition: 'security_event',
    action: 'append_audit_log',
    severity: 'blocking',
    category: 'security',
    enabled: true,
  },
  {
    id: 'rule-verification-required',
    name: 'verification-required',
    description: 'Require verification step before marking implementation complete',
    condition: 'implementation_complete',
    action: 'run_verification',
    severity: 'warning',
    category: 'quality',
    enabled: true,
  },
  {
    id: 'rule-deviation-tracking',
    name: 'deviation-tracking',
    description: 'Track and auto-fix deviations from plan',
    condition: 'deviation_detected',
    action: 'auto_fix_or_escalate',
    severity: 'warning',
    category: 'workflow',
    enabled: true,
  },
];

// ===========================================================================
// Module state
// ===========================================================================

const customAgents: AgentDefinition[] = [];
const customCommands: WorkflowCommand[] = [];
const customRules: WorkflowRule[] = [];
const customScripts: HelperScript[] = [];
const customHooks: ToolHook[] = [];

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Get all agent definitions (built-in + custom).
 */
export function getAgentDefinitions(): AgentDefinition[] {
  return [...BUILT_IN_AGENTS, ...customAgents];
}

/**
 * Get a specific agent definition by name.
 */
export function getAgentByName(name: string): AgentDefinition | undefined {
  return getAgentDefinitions().find((a) => a.name === name);
}

/**
 * Register a custom agent definition.
 */
export function registerAgent(agent: Omit<AgentDefinition, 'id'>): AgentDefinition {
  const def: AgentDefinition = { ...agent, id: generateId() };
  customAgents.push(def);
  return def;
}

/**
 * Get all workflow rules (built-in + custom).
 */
export function getRules(): WorkflowRule[] {
  return [...BUILT_IN_RULES, ...customRules];
}

/**
 * Get active rules only.
 */
export function getActiveRules(): WorkflowRule[] {
  return getRules().filter((r) => r.enabled);
}

/**
 * Register a custom rule.
 */
export function registerRule(rule: Omit<WorkflowRule, 'id'>): WorkflowRule {
  const r: WorkflowRule = { ...rule, id: generateId() };
  customRules.push(r);
  return r;
}

/**
 * Register a workflow command.
 */
export function registerCommand(cmd: Omit<WorkflowCommand, 'id'>): WorkflowCommand {
  const c: WorkflowCommand = { ...cmd, id: generateId() };
  customCommands.push(c);
  return c;
}

/**
 * Get all registered commands.
 */
export function getCommands(): WorkflowCommand[] {
  return [...customCommands];
}

/**
 * Register a helper script.
 */
export function registerScript(script: Omit<HelperScript, 'id'>): HelperScript {
  const s: HelperScript = { ...script, id: generateId() };
  customScripts.push(s);
  return s;
}

/**
 * Get all registered scripts.
 */
export function getScripts(): HelperScript[] {
  return [...customScripts];
}

/**
 * Register a tool hook.
 */
export function registerHook(hook: Omit<ToolHook, 'id'>): ToolHook {
  const h: ToolHook = { ...hook, id: generateId() };
  customHooks.push(h);
  return h;
}

/**
 * Get all registered hooks.
 */
export function getHooks(): ToolHook[] {
  return [...customHooks];
}

/**
 * Get hooks for a specific event.
 */
export function getHooksForEvent(event: ToolHook['event']): ToolHook[] {
  return customHooks.filter((h) => h.event === event && h.enabled);
}

/**
 * Bundle all definitions for distribution.
 */
export function bundleDefinitions(): DefinitionsBundle {
  return {
    agents: getAgentDefinitions(),
    commands: getCommands(),
    rules: getRules(),
    scripts: getScripts(),
    hooks: getHooks(),
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Serialize a bundle to JSON.
 */
export function serializeBundle(bundle: DefinitionsBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Deserialize a bundle from JSON.
 */
export function deserializeBundle(json: string): DefinitionsBundle {
  return JSON.parse(json) as DefinitionsBundle;
}
