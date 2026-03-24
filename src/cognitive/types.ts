/**
 * Cognitive Architecture Type Definitions
 *
 * All interfaces, type aliases, and discriminated unions for the cognitive
 * architecture layer: rules, experts, capsules, skills, contexts, execution,
 * prompts, gates, and outcome tracking.
 *
 * Organized by subsystem. Every type used across multiple cognitive modules
 * is defined here — no local type aliases in implementation files.
 */

import type { FailureClass, Memory, PromptShape } from '../types.js';

// ===========================================================================
// Rule Engine
// ===========================================================================

export type RuleCategory =
  | 'workflow'
  | 'quality'
  | 'discovery'
  | 'routing'
  | 'learning'
  | 'continuity'
  | 'fidelity'
  | 'operational';

export type RuleEnforcement = 'hard' | 'soft' | 'advisory';

export interface RuleTrigger {
  condition: string;
  detection: 'automatic' | 'manual';
  keywords?: string[];
}

export interface RuleConstraint {
  requirement: string;
  severity: 'blocking' | 'warning' | 'info';
  check_fn?: string;
}

export interface RuleDefinition {
  id: string;
  name: string;
  category: RuleCategory;
  description: string;
  trigger_conditions: RuleTrigger[];
  constraints: RuleConstraint[];
  enforcement: RuleEnforcement;
  thresholds: Record<string, number>;
  interactions: string[];
  version: number;
  enabled: boolean;
  confidence: number;
  outcome_count: number;
  success_count: number;
  content: string;
  embedding?: Buffer | null;
  created_at: string;
  updated_at: string;
}

export interface RuleDefinitionInput {
  name: string;
  category: RuleCategory;
  description: string;
  trigger_conditions: RuleTrigger[];
  constraints: RuleConstraint[];
  enforcement: RuleEnforcement;
  thresholds?: Record<string, number>;
  interactions?: string[];
  content: string;
  embedding?: Buffer | null;
}

export interface RuleComplianceResult {
  rule_id: string;
  rule_name: string;
  compliant: boolean;
  violations: RuleViolation[];
  warnings: string[];
}

export interface RuleViolation {
  constraint: string;
  severity: 'blocking' | 'warning';
  description: string;
  suggested_fix: string;
}

export interface RuleModification {
  add_constraint?: RuleConstraint;
  modify_threshold?: { name: string; value: number };
  add_trigger?: RuleTrigger;
  remove_constraint?: string;
}

// ===========================================================================
// Expert Agent System
// ===========================================================================

export type ExpertCategory =
  | 'business'
  | 'architecture'
  | 'code_quality'
  | 'design'
  | 'gsd'
  | 'analysis'
  | 'workflow'
  | 'research'
  | 'infrastructure'
  | 'grading';

export interface GradingCriterion {
  dimension: string;
  weight: number;
  description: string;
}

export interface ExpertDefinition {
  id: string;
  name: string;
  display_name: string;
  role: string;
  domain: string;
  category: ExpertCategory;
  trigger_conditions: string[];
  scope: {
    can: string[];
    cannot: string[];
  };
  deliverables: string[];
  anti_patterns: string[];
  grading_criteria: GradingCriterion[];
  tools: string[];
  model_preference?: string;
  version: number;
  enabled: boolean;
  task_count: number;
  success_rate: number;
  content: string;
  embedding?: Buffer | null;
  created_at: string;
  updated_at: string;
}

export interface ExpertDefinitionInput {
  name: string;
  display_name: string;
  role: string;
  domain: string;
  category: ExpertCategory;
  trigger_conditions: string[];
  scope: { can: string[]; cannot: string[] };
  deliverables: string[];
  anti_patterns?: string[];
  grading_criteria?: GradingCriterion[];
  tools?: string[];
  model_preference?: string;
  content: string;
  embedding?: Buffer | null;
}

export interface ExpertMatch {
  expert: ExpertDefinition;
  score: number;
  matched_triggers: string[];
  memory_evidence: string[];
}

export interface ExpertPerformance {
  task_count: number;
  success_rate: number;
  common_failures: string[];
}

// ===========================================================================
// Deep Capsule System
// ===========================================================================

export type CapsuleComponentType =
  | 'intent'
  | 'assembly'
  | 'examples'
  | 'anti_patterns'
  | 'critic'
  | 'grader'
  | 'memory_policy';

export interface DeepCapsuleDefinition {
  id: string;
  name: string;
  display_name: string;
  description: string;
  trigger_patterns: string[];
  version: number;
  enabled: boolean;
  match_count: number;
  success_rate: number;
  embedding?: Buffer | null;
  created_at: string;
  updated_at: string;
}

export interface DeepCapsuleInput {
  name: string;
  display_name: string;
  description: string;
  trigger_patterns: string[];
  embedding?: Buffer | null;
}

export interface CapsuleComponent {
  id: string;
  capsule_id: string;
  component_type: CapsuleComponentType;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CapsuleComponentInput {
  capsule_id: string;
  component_type: CapsuleComponentType;
  content: string;
}

export interface AssembledCapsule {
  definition: DeepCapsuleDefinition;
  components: Partial<Record<CapsuleComponentType, string>>;
  enrichments: {
    memory_examples: Memory[];
    synthesized_anti_patterns: string[];
    past_critic_findings: string[];
    user_preferences: string[];
  };
}

// ===========================================================================
// Executable Skill System
// ===========================================================================

export type SkillCategory =
  | 'workflow'
  | 'quality'
  | 'research'
  | 'testing'
  | 'design'
  | 'backend'
  | 'framework'
  | 'domain'
  | 'utility';

export interface ExecutableSkill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  trigger_conditions: string[];
  anti_patterns: string[];
  rules: string[];
  chain_with: string[];
  version: string;
  enabled: boolean;
  invocation_count: number;
  success_rate: number;
  content: string;
  embedding?: Buffer | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutableSkillInput {
  name: string;
  description: string;
  category: SkillCategory;
  trigger_conditions: string[];
  anti_patterns?: string[];
  rules?: string[];
  chain_with?: string[];
  version?: string;
  content: string;
  embedding?: Buffer | null;
}

export interface SkillMatch {
  skill: ExecutableSkill;
  score: number;
  matched_triggers: string[];
}

// ===========================================================================
// Context System
// ===========================================================================

export type ContextType =
  | 'state'
  | 'decisions'
  | 'failure_patterns'
  | 'lessons_learned'
  | 'user_taste'
  | 'verification'
  | 'reference_library'
  | 'ui_ux'
  | 'artifacts'
  | 'tooling'
  | 'research_index'
  | 'session_index'
  | 'agent_catalog';

export interface ContextEntry {
  id: string;
  context_type: ContextType;
  project_id: string | null;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ContextEntryInput {
  context_type: ContextType;
  project_id?: string | null;
  content: string;
}

// ===========================================================================
// Execution Engine
// ===========================================================================

export type ExecutionStatus =
  | 'pending'
  | 'researching'
  | 'planning'
  | 'checking'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'blocked'
  | 'paused';

export interface ExecutionCheckpoint {
  type: 'human_verify' | 'decision' | 'human_action';
  description: string;
  resolved: boolean;
  resolved_at: string | null;
}

export interface ExecutionDeviation {
  rule: 1 | 2 | 3 | 4;
  type: string;
  description: string;
  task_id: string;
  auto_fixed: boolean;
  timestamp: string;
}

export interface DebugHypothesis {
  description: string;
  confidence: 'high' | 'medium' | 'low';
  evidence_for: string[];
  evidence_against: string[];
  tested: boolean;
  result: 'confirmed' | 'rejected' | 'inconclusive' | null;
}

export interface DebugState {
  slug: string;
  status: 'gathering' | 'investigating' | 'fixing' | 'verifying' | 'resolved';
  symptoms: string[];
  hypotheses: DebugHypothesis[];
  root_cause: string | null;
  fix_description: string | null;
}

export interface ExecutionState {
  id: string;
  project_id: string;
  milestone: string | null;
  phase_number: number;
  plan_id: string | null;
  status: ExecutionStatus;
  current_task: number | null;
  total_tasks: number | null;
  wave: number;
  checkpoints: ExecutionCheckpoint[];
  deviations: ExecutionDeviation[];
  debug_state: DebugState | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionStateInput {
  project_id: string;
  milestone?: string | null;
  phase_number?: number;
  plan_id?: string | null;
  status?: ExecutionStatus;
}

// ===========================================================================
// Cognitive Outcome Tracking
// ===========================================================================

export type CognitiveEntityType = 'rule' | 'expert' | 'capsule' | 'skill' | 'gate';
export type CognitiveOutcomeResult = 'success' | 'failure' | 'partial';

export interface CognitiveOutcome {
  id: string;
  entity_type: CognitiveEntityType;
  entity_id: string;
  task_description: string;
  outcome: CognitiveOutcomeResult;
  failure_class: FailureClass | null;
  evidence: string;
  correction: string | null;
  created_at: string;
}

export interface CognitiveOutcomeInput {
  entity_type: CognitiveEntityType;
  entity_id: string;
  task_description: string;
  outcome: CognitiveOutcomeResult;
  failure_class?: FailureClass | null;
  evidence: string;
  correction?: string | null;
}

// ===========================================================================
// Command System
// ===========================================================================

export type CommandCategory = 'workflow' | 'gsd' | 'memory' | 'session' | 'utility';

export interface CommandDefinition {
  id: string;
  name: string;
  description: string;
  category: CommandCategory;
  argument_hint: string;
  allowed_tools: string[];
  content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommandDefinitionInput {
  name: string;
  description: string;
  category: CommandCategory;
  argument_hint?: string;
  allowed_tools?: string[];
  content: string;
}

// ===========================================================================
// Prompt Orchestration
// ===========================================================================

export type ReasoningPhase =
  | 'recall'
  | 'predict'
  | 'understand'
  | 'constrain'
  | 'route'
  | 'assess'
  | 'plan'
  | 'execute'
  | 'verify'
  | 'learn';

export interface PromptAssembly {
  reasoning_scaffold: string;
  rules: RuleDefinition[];
  expert: ExpertDefinition | null;
  capsule: AssembledCapsule | null;
  skills: ExecutableSkill[];
  memories: Memory[];
  contexts: ContextEntry[];
  prompt_shape: PromptShape;
  token_budget: number;
  priority_order: string[];
}

// ===========================================================================
// Discovery Levels
// ===========================================================================

export type DiscoveryLevel = 0 | 1 | 2 | 3;

export interface DiscoveryAssessment {
  level: DiscoveryLevel;
  rationale: string;
  expected_artifacts: string[];
  estimated_scope: 'narrow' | 'moderate' | 'broad';
}

// ===========================================================================
// Task Classification
// ===========================================================================

export interface TaskClassification {
  substantial: boolean;
  creative: boolean;
  api_work: boolean;
  discovery_level: DiscoveryLevel;
  estimated_files: number;
  subsystems: string[];
  keywords: string[];
}

// ===========================================================================
// Compliance Context (used by rule compliance checker)
// ===========================================================================

export interface ComplianceContext {
  phase: ReasoningPhase;
  hasReadiness: boolean;
  hasResearch: boolean;
  hasPlan: boolean;
  hasVerification: boolean;
  isSubstantial: boolean;
  isCreative: boolean;
  isApiWork: boolean;
  searchCompleted: boolean;
  decisionsHonored: boolean;
}

// ===========================================================================
// Sign function type (dependency injection for HMAC signing)
// ===========================================================================

export type SignFn = (content: string) => string;

// ---------------------------------------------------------------------------
// Executable Skill Graphs (ABILITIES.md Improvement #4)
// ---------------------------------------------------------------------------

/**
 * A typed step within an executable skill graph.
 * Each step has clear inputs, outputs, required tools, and success criteria.
 */
export interface SkillGraphStep {
  id: string;
  name: string;
  description: string;
  inputs: Array<{ name: string; type: string; required: boolean }>;
  outputs: Array<{ name: string; type: string }>;
  required_tools: string[];
  success_criteria: string[];
  timeout_ms: number;
  depends_on: string[];
}

/**
 * An executable skill graph — a DAG of typed steps with clear
 * control flow, rather than prose instructions.
 */
export interface SkillGraph {
  id: string;
  name: string;
  description: string;
  version: number;
  steps: SkillGraphStep[];
  entry_step: string;
  exit_conditions: string[];
  estimated_duration_ms: number;
  required_capabilities: string[];
}

/**
 * Result of executing a single step within a skill graph.
 */
export interface StepExecutionResult {
  step_id: string;
  status: 'completed' | 'failed' | 'skipped' | 'timeout';
  outputs: Record<string, unknown>;
  duration_ms: number;
  evidence: string[];
  error?: string;
}

/**
 * Result of executing an entire skill graph.
 */
export interface SkillGraphExecutionResult {
  graph_id: string;
  status: 'completed' | 'partial' | 'failed';
  step_results: StepExecutionResult[];
  total_duration_ms: number;
  completion_rate: number;
}
