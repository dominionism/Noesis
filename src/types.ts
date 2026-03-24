/**
 * Noesis Type Definitions
 *
 * Every interface, type alias, and discriminated union used across the
 * Noesis intelligence layer. This file is the single source of truth
 * for the project's type system.
 *
 * Types are organized into:
 * - Memory domain types (from UAWL, enhanced)
 * - Knowledge graph types (new: typed edges, causal chains)
 * - Retrieval types (from UAWL)
 * - Workflow types (new: readiness, critic, learning)
 * - Agent & session types (new: routing, continuity)
 * - Integration types (new: adapters, managed sections)
 * - Meta-intelligence types (new: metrics, predictions)
 * - Security types (from UAWL)
 * - Event types (enhanced)
 * - Config types (enhanced)
 */

import type { EdgeRelation } from './constants.js';

// ===========================================================================
// Memory domain types
// ===========================================================================

export type MemoryType =
  | 'task'
  | 'decision'
  | 'preference'
  | 'skill'
  | 'incident'
  | 'lesson'
  | 'checkpoint'
  | 'session'
  | 'verification';

export type MemoryOutcome =
  | 'success'
  | 'partial_success'
  | 'failed_then_fixed'
  | 'failed';

export type MemoryStatus = 'active' | 'superseded' | 'archived' | 'conflicted';

export type MemoryScope = 'global' | 'project' | 'session';

export type Sensitivity = 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';

// ===========================================================================
// Core memory record
// ===========================================================================

export interface Memory {
  id: string; // ULID
  type: MemoryType;
  title: string;
  content: string; // JSON string for structured types
  tags: string; // JSON array string
  project_id: string | null;
  scope: MemoryScope;
  sensitivity: Sensitivity;
  confidence: number;
  outcome: MemoryOutcome | null;
  source: string;
  embedding: Buffer | null;
  embedding_model: string | null;
  signature: string;
  status: MemoryStatus;
  access_count: number;
  created_at: string; // ISO 8601
  updated_at: string;
  last_accessed_at: string;
  expires_at: string | null;
  superseded_by: string | null;
  session_id: string | null;
}

export interface MemoryInput {
  type: MemoryType;
  title: string;
  content: string;
  tags?: string[];
  project_id?: string | null;
  scope?: MemoryScope;
  sensitivity?: Sensitivity;
  confidence?: number;
  outcome?: MemoryOutcome | null;
  source?: string;
  embedding?: Buffer | null;
  embedding_model?: string | null;
  expires_at?: string | null;
  session_id?: string | null;
}

// ===========================================================================
// Knowledge graph edges (enhanced with typed relations and weight)
// ===========================================================================

export interface KnowledgeEdge {
  source_id: string;
  target_id: string;
  relation: EdgeRelation;
  weight: number;
  metadata: string | null; // JSON
  created_at: string;
}

export interface KnowledgeEdgeInput {
  source_id: string;
  target_id: string;
  relation: EdgeRelation;
  weight?: number;
  metadata?: string | null;
}

/** Causal chain: ordered sequence of memory IDs forming a reasoning path. */
export interface CausalChain {
  chain: string[]; // Ordered memory IDs from root cause to effect
  relation_types: EdgeRelation[]; // Relations between consecutive nodes
  total_weight: number;
  confidence: number; // Min confidence across the chain
}

// ===========================================================================
// Memory conflicts
// ===========================================================================

export interface MemoryConflict {
  id: string; // ULID
  memory_a_id: string;
  memory_b_id: string;
  conflict_type: string;
  similarity_score: number;
  resolution: string | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface ConflictInput {
  memory_a_id: string;
  memory_b_id: string;
  conflict_type: string;
  similarity_score: number;
}

// ===========================================================================
// Projects
// ===========================================================================

export interface Project {
  id: string;
  name: string;
  path: string;
  sensitivity: Sensitivity;
  isolation_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  name: string;
  path: string;
  sensitivity?: Sensitivity;
  isolation_mode?: boolean;
}

// ===========================================================================
// Structured memory content interfaces
// ===========================================================================

export interface TaskMemory {
  task_type: string;
  context: string;
  action: string;
  outcome: MemoryOutcome;
  key_insight: string;
  artifacts: string[];
}

export interface LessonMemory {
  trigger: string;
  original_approach: string;
  corrected_approach: string;
  root_cause: string;
  applicable_when: string;
}

export interface CheckpointMemory {
  task_description: string;
  completed_steps: string[];
  remaining_steps: string[];
  current_blockers: string[];
  relevant_files: string[];
  working_state: string;
  handoff_source: string;
  handoff_target: string;
  plan_name?: string;
  phases?: Array<{ name: string; status: string; details: string }>;
}

export interface SessionMemory {
  agent: string;
  status: 'active' | 'completed' | 'failed' | 'handed_off';
  started_at: string;
  ended_at: string | null;
  token_estimate: number | null;
  tool_calls: number | null;
  summary: string | null;
}

export interface VerificationMemory {
  command: string;
  purpose: string;
  runner: string;
  typical_duration_ms: number;
  last_known_status: string;
  notes: string;
}

// ===========================================================================
// Retrieval types
// ===========================================================================

export interface RecallParams {
  query: string;
  project_id?: string;
  limit?: number;
  type_filter?: MemoryType[];
  type_exclude?: MemoryType[];
  tag_filter?: string[];
  min_confidence?: number;
  outcome_filter?: MemoryOutcome[];
}

export interface RecallResult {
  memories: ScoredMemory[];
  conflicts: MemoryConflict[];
  total_candidates: number;
  retrieval_time_ms: number;
}

export interface ScoredMemory extends Memory {
  semantic_score: number;
  bm25_rank: number;
  vector_rank: number;
  recency_modifier: number;
  access_boost: number;
  success_weight: number;
  scope_boost: number;
  final_score: number;
}

export interface RetrievalGapRequest {
  task_description: string;
  project_id?: string;
}

export interface RetrievalGapResponse {
  total_results: number;
  results_by_type: Record<MemoryType, number>;
  missing_types: MemoryType[];
  unresolved_conflicts: number;
  confidence_distribution: {
    high: number;
    medium: number;
    low: number;
  };
  coverage_summary: string;
}

export interface CheckActionRequest {
  action_description: string;
  project_id?: string;
}

export interface CheckActionResponse {
  warnings: Array<{
    memory_id: string;
    type: MemoryType;
    title: string;
    relevance_score: number;
    summary: string;
  }>;
  warning_count: number;
}

export interface ExplainRequest {
  query: string;
  memory_id?: string;
  project_id?: string;
}

export interface ExplainResponse {
  query_embedding_preview: string;
  results: Array<{
    memory_id: string;
    title: string;
    semantic_score: number;
    bm25_rank: number;
    vector_rank: number;
    recency_modifier: number;
    access_boost: number;
    success_weight: number;
    scope_boost: number;
    final_score: number;
    included: boolean;
    exclusion_reason?: string;
  }>;
  applied_filters: Record<string, unknown>;
}

// ===========================================================================
// Workflow types (new for Noesis)
// ===========================================================================

export type WorkflowType = 'rpi' | 'quick' | 'learning' | 'critic';

export type WorkflowStatus = 'active' | 'completed' | 'failed' | 'abandoned';

export interface WorkflowRun {
  id: string;
  project_id: string | null;
  task_description: string;
  workflow_type: WorkflowType;
  status: WorkflowStatus;
  readiness_score: number | null;
  phases_completed: number;
  phases_total: number | null;
  started_at: string;
  completed_at: string | null;
  metrics: string | null; // JSON: {retrieval_count, memories_created, lessons_captured, duration_ms}
}

export interface WorkflowRunInput {
  project_id?: string | null;
  task_description: string;
  workflow_type: WorkflowType;
  phases_total?: number | null;
}

export interface WorkflowMetrics {
  retrieval_count: number;
  memories_created: number;
  lessons_captured: number;
  duration_ms: number;
}

/** 5-dimension readiness scoring system. */
export interface ReadinessScore {
  clarity: number; // 0-20, >= 15 required
  codebase: number; // 0-20, >= 15 required
  constraints: number; // 0-20
  risks: number; // 0-20
  verification: number; // 0-20
  total: number; // 0-100, >= 70 required
  passed: boolean;
  gaps: ReadinessGap[];
}

export interface ReadinessGap {
  dimension: string;
  current: number;
  required: number;
  suggestion: string;
}

/** Critic feedback from evaluation cycle. */
export interface CriticFeedback {
  cycle: number;
  passed: boolean;
  issues: CriticIssue[];
  suggestions: string[];
  anti_patterns_matched: string[];
}

export interface CriticIssue {
  severity: 'critical' | 'major' | 'minor';
  category: string;
  description: string;
  location?: string;
}

/** Structured prompt shape from optimization pass. */
export interface PromptShape {
  goal: string;
  context: string;
  constraints: string[];
  deliverable: string;
  validation: string[];
  enriched_context?: string; // Memory-retrieved context
}

// ===========================================================================
// Learning types (new for Noesis)
// ===========================================================================

export type LearningTriggerType =
  | 'user_correction'
  | 'eval_failure'
  | 'critic_rejection'
  | 'repeated_failure'
  | 'manual';

export type FailureClass =
  | 'logic_error'
  | 'missing_context'
  | 'wrong_assumption'
  | 'integration_failure'
  | 'security_gap'
  | 'performance_issue';

export interface LearningEvent {
  id: string;
  memory_id: string;
  trigger_type: LearningTriggerType;
  failure_class: FailureClass | null;
  root_cause: string | null;
  prevention_rule: string | null;
  causal_chain: string | null; // JSON array of memory IDs
  confidence: number;
  project_id: string | null;
  created_at: string;
}

export interface LearningEventInput {
  memory_id: string;
  trigger_type: LearningTriggerType;
  failure_class?: FailureClass | null;
  root_cause?: string | null;
  prevention_rule?: string | null;
  causal_chain?: string[] | null;
  confidence?: number;
  project_id?: string | null;
}

// ===========================================================================
// Skill version tracking (new for Noesis)
// ===========================================================================

export interface SkillVersion {
  id: string;
  skill_id: string;
  version: number;
  definition: string; // YAML content
  source_cluster: string | null; // JSON array of memory IDs
  confidence: number;
  created_at: string;
  superseded_at: string | null;
}

export interface SkillVersionInput {
  skill_id: string;
  version: number;
  definition: string;
  source_cluster?: string[] | null;
  confidence?: number;
}

// ===========================================================================
// Agent routing (new for Noesis)
// ===========================================================================

export type AgentRoutingOutcome = 'success' | 'partial_success' | 'failed' | 'unknown';

export interface AgentRoute {
  id: string;
  agent_name: string;
  task_type: string;
  outcome: AgentRoutingOutcome | null;
  duration_ms: number | null;
  project_id: string | null;
  created_at: string;
}

export interface AgentRouteInput {
  agent_name: string;
  task_type: string;
  outcome?: AgentRoutingOutcome | null;
  duration_ms?: number | null;
  project_id?: string | null;
}

// ===========================================================================
// System metrics (new for Noesis)
// ===========================================================================

export interface SystemMetric {
  id: string;
  metric_type: string;
  value: number;
  period: string; // ISO 8601 date (daily granularity)
  metadata: string | null; // JSON with breakdown details
  created_at: string;
}

export interface SystemMetricInput {
  metric_type: string;
  value: number;
  period: string;
  metadata?: Record<string, unknown> | null;
}

// ===========================================================================
// Session & continuity types
// ===========================================================================

export interface SessionState {
  project_id: string;
  current_phase: string;
  blockers: string[];
  working_set: string[]; // File paths in active use
  decisions_made: string[];
  started_at: string;
  updated_at: string;
}

export interface Handoff {
  id: string;
  source_agent: string;
  target_agent: string;
  reason: 'context_limit' | 'session_end' | 'tool_switch' | 'explicit_transfer';
  priority: 'immediate' | 'normal';
  state_summary: string;
  memory_refs: string[]; // HMAC-signed memory IDs
  created_at: string;
}

export interface HandoffInput {
  source_agent: string;
  target_agent: string;
  reason: Handoff['reason'];
  priority?: Handoff['priority'];
  state_summary: string;
  memory_refs?: string[];
}

// ===========================================================================
// Integration types (auto-integration engine)
// ===========================================================================

export interface ManagedSectionMeta {
  adapter: string;
  version: string;
  hash: string;
  timestamp: string;
}

export interface ToolAdapter {
  id: string;
  name: string;
  configDir: string;
  supportsSymlinks: boolean;
  supportsGenerated: boolean;
  supportsManagedSections: boolean;
  detected: boolean;
}

export interface ContextSnapshot {
  top_skills: Array<{ name: string; confidence: number; description: string }>;
  top_anti_patterns: Array<{ name: string; description: string }>;
  project_state: string | null;
  recent_decisions: string[];
  available_commands: string[];
  generated_at: string;
}

// ===========================================================================
// Embedding types
// ===========================================================================

export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

// ===========================================================================
// Skill / AntiPattern types
// ===========================================================================

export interface SkillDefinition {
  name: string;
  kind: 'skill';
  description: string;
  trigger_pattern: string;
  steps: Array<{
    description: string;
    command?: string;
    conditions?: string;
  }>;
  prerequisites: string[];
  anti_patterns: string[];
  validation_criteria: Array<{
    check: string;
    method: string;
  }>;
  source_lessons: string[];
  status: 'draft' | 'active' | 'archived';
  confidence: number;
  successes: number;
  failures: number;
  last_used_at: string | null;
}

export interface AntiPatternDefinition {
  name: string;
  kind: 'anti_pattern';
  description: string;
  trigger_pattern: string;
  failure_mode: string;
  correct_approach: string;
  source_lessons: string[];
  status: 'draft' | 'active' | 'archived';
  confidence: number;
  successes: number;
  failures: number;
  last_used_at: string | null;
}

// ===========================================================================
// Adapter types
// ===========================================================================

export interface FilesystemQuery {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  glob(pattern: string): Promise<string[]>;
}

export interface AdapterCapabilityDeclaration {
  canWriteBack: boolean;
  writeBackMechanism: 'cli_command' | 'file_append' | 'none';
  canSubscribeEvents: boolean;
  canReportSessions: boolean;
  supportsStructuredCorrection: boolean;
}

export interface TargetToolCapabilities {
  maxContextTokens: number;
  supportsSystemPrompt: boolean;
  supportsFileWrites: boolean;
  supportsManagedSections: boolean;
}

export interface DetectionResult {
  detected: boolean;
  confidence: number;
  configPaths: string[];
  version?: string;
}

export interface UniversalContext {
  persona: string | null;
  conventions: Record<string, string>;
  projectContext: Record<string, string>;
  hotMemories: Record<string, string>;
  warmMemories: ScoredMemory[];
  skills: SkillDefinition[];
  antiPatterns: AntiPatternDefinition[];
  activeCheckpoints: Memory[];
  sessionId: string | null;
  /**
   * Cognitive enrichment payload from the prompt engine.
   * Populated by the sync layer when the cognitive architecture is available.
   * Typed as `unknown` here to avoid circular imports; cast to
   * `CognitiveEnrichment` in the adapter layer (base-adapter.ts).
   */
  cognitiveEnrichment?: unknown;
}

export interface TokenBudget {
  total: number;
  allocated: Record<string, number>;
  remaining: number;
}

export interface SyncResult {
  fileWrites: FileWriteRequest[];
  apiPayloads: Record<string, unknown>[];
  tokensUsed: number;
}

export interface FileWriteRequest {
  path: string;
  content: string;
  managedSection: boolean;
  adapterId: string;
  hash: string;
}

export interface ExtractedLearnings {
  learnings: Array<{
    content: string;
    category: MemoryType;
    source: string;
    confidence: number;
  }>;
}

export interface VerifyResult {
  valid: boolean;
  expectedHash: string;
  actualHash: string;
  modified: boolean;
}

export interface Adapter {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly capabilities: AdapterCapabilityDeclaration;
  readonly targetCapabilities: TargetToolCapabilities;
  detect(query: FilesystemQuery): Promise<DetectionResult>;
  transform(context: UniversalContext, budget: TokenBudget): Promise<SyncResult>;
  extractLearnings(content: string): Promise<ExtractedLearnings>;
  verify(content: string, expectedHash: string): VerifyResult;
}

// ===========================================================================
// Sync types
// ===========================================================================

export interface SyncResponse {
  tokens_injected: number;
  tokens_budget: number;
  tokens_available: number;
  truncated_memories: Array<{
    memory_id: string;
    title: string;
    relevance: number;
  }>;
}

// ===========================================================================
// Cold event type
// ===========================================================================

export interface ColdEvent {
  timestamp: string;
  session_memory_id: string;
  agent: string;
  event_type:
    | 'user_message'
    | 'agent_message'
    | 'tool_call'
    | 'tool_result'
    | 'correction'
    | 'error';
  content_hash: string;
  content: string;
  tool_name?: string;
  project_id?: string;
}

// ===========================================================================
// Secret scanning types
// ===========================================================================

export interface SecretMatch {
  type: string;
  position: number;
  length: number;
  matched: string;
}

export interface DangerousMatch {
  pattern: string;
  position: number;
  matched: string;
}

export interface ScanResult {
  clean: string;
  redacted: boolean;
  matches: SecretMatch[];
}

// ===========================================================================
// Audit types
// ===========================================================================

export type AuditEventType =
  | 'MEMORY_WRITE'
  | 'MEMORY_READ'
  | 'CONFIG_WRITE'
  | 'INTEGRITY_CHECK'
  | 'SECURITY_EVENT'
  | 'COGNITIVE_WRITE';

export interface AuditEntry {
  timestamp: string;
  event_type: AuditEventType;
  content_hash: string;
  memory_id?: string;
  source: 'agent' | 'user' | 'system';
  details: Record<string, unknown>;
}

// ===========================================================================
// Write pipeline types
// ===========================================================================

export interface WritePipelineResult {
  success: boolean;
  memory?: Memory;
  confirmationRequired?: boolean;
  dangerousMatches?: DangerousMatch[];
  secretsRedacted?: boolean;
  error?: string;
  /** Present when a near-duplicate memory was detected during write. */
  duplicateOf?: {
    id: string;
    title: string;
    cosineSimilarity: number;
    jaccardSimilarity: number;
  };
}

export interface WritePipelineInput {
  input: MemoryInput;
  confirmed?: boolean;
}

// ===========================================================================
// List filter type for CRUD
// ===========================================================================

export interface ListFilters {
  type?: MemoryType;
  status?: MemoryStatus;
  project_id?: string;
  limit?: number;
  offset?: number;
}

// ===========================================================================
// Event payload types (internal event bus)
// ===========================================================================

export interface MemoryWrittenEvent {
  id: string;
  type: MemoryType;
  project_id: string | null;
  scope: MemoryScope;
}

export interface MemoryConflictDetectedEvent {
  conflict_id: string;
  memory_a_id: string;
  memory_b_id: string;
  conflict_type: string;
}

export interface SkillPromotedEvent {
  skill_name: string;
  confidence: number;
}

export interface SkillArchivedEvent {
  skill_name: string;
  reason: string;
}

export interface AntiPatternCreatedEvent {
  name: string;
  failure_mode: string;
}

export interface CheckpointAvailableEvent {
  checkpoint_id: string;
  project_id: string;
  handoff_target: string;
}

export interface IntegrityViolationEvent {
  memory_id: string;
  violation_type: string;
}

export interface WorkflowStateChangedEvent {
  workflow_id: string;
  from_phase: string;
  to_phase: string;
}

export interface LearningCapturedEvent {
  learning_id: string;
  trigger_type: LearningTriggerType;
  failure_class: FailureClass | null;
}

// ---------------------------------------------------------------------------
// Cognitive event payload types
// ---------------------------------------------------------------------------

export interface RuleMatchedEvent {
  rule_id: string;
  rule_name: string;
  task_id: string;
  matched_triggers: number;
}

export interface RuleViolatedEvent {
  rule_id: string;
  rule_name: string;
  violation_count: number;
  blocking: boolean;
}

export interface RuleEvolvedEvent {
  rule_id: string;
  rule_name: string;
  modification_type: string;
  trigger: string;
}

export interface ExpertRoutedEvent {
  expert_id: string;
  expert_name: string;
  task_id: string;
  score: number;
}

export interface ExpertOutcomeEvent {
  expert_id: string;
  expert_name: string;
  task_id: string;
  outcome: 'success' | 'failure' | 'partial';
}

export interface CapsuleMatchedEvent {
  capsule_id: string;
  capsule_name: string;
  task_id: string;
  score: number;
}

export interface CapsuleAssembledEvent {
  capsule_id: string;
  capsule_name: string;
  component_count: number;
  enrichment_count: number;
}

export interface SkillInvokedEvent {
  skill_id: string;
  skill_name: string;
  task_id: string;
}

export interface ContextUpdatedEvent {
  context_type: string;
  project_id: string | null;
  version: number;
}

export interface QualityGateCheckedEvent {
  gate_type: string;
  passed: boolean;
  score: number;
}

export interface LearningWritebackEvent {
  target_type: string;
  target_id: string;
  modification_type: string;
  trigger: string;
}

export interface PredictionGeneratedEvent {
  task_id: string;
  prediction_count: number;
  highest_risk: number;
}

export interface CognitiveCheckpointCreatedEvent {
  checkpoint_id: string;
  project_id: string;
  phase: string;
}

export interface DeviationRecordedEvent {
  project_id: string;
  rule: number;
  deviation_type: string;
  auto_fixed: boolean;
}

export interface SessionStartedEvent {
  session_id: string;
  project_id: string;
  agent: string;
}

export interface SessionEndedEvent {
  session_id: string;
  project_id: string;
  agent: string;
}

export interface HandoffCreatedEvent {
  handoff_id: string;
  source_agent: string;
  target_agent: string;
  reason: string;
}

export type NoesisEvent =
  | { type: 'memory_written'; payload: MemoryWrittenEvent }
  | { type: 'memory_conflict_detected'; payload: MemoryConflictDetectedEvent }
  | { type: 'skill_promoted'; payload: SkillPromotedEvent }
  | { type: 'skill_archived'; payload: SkillArchivedEvent }
  | { type: 'anti_pattern_created'; payload: AntiPatternCreatedEvent }
  | { type: 'checkpoint_available'; payload: CheckpointAvailableEvent }
  | { type: 'integrity_violation'; payload: IntegrityViolationEvent }
  | { type: 'workflow_state_changed'; payload: WorkflowStateChangedEvent }
  | { type: 'learning_captured'; payload: LearningCapturedEvent }
  | { type: 'rule_matched'; payload: RuleMatchedEvent }
  | { type: 'rule_violated'; payload: RuleViolatedEvent }
  | { type: 'rule_evolved'; payload: RuleEvolvedEvent }
  | { type: 'expert_routed'; payload: ExpertRoutedEvent }
  | { type: 'expert_outcome'; payload: ExpertOutcomeEvent }
  | { type: 'capsule_matched'; payload: CapsuleMatchedEvent }
  | { type: 'capsule_assembled'; payload: CapsuleAssembledEvent }
  | { type: 'skill_invoked'; payload: SkillInvokedEvent }
  | { type: 'context_updated'; payload: ContextUpdatedEvent }
  | { type: 'quality_gate_checked'; payload: QualityGateCheckedEvent }
  | { type: 'learning_writeback'; payload: LearningWritebackEvent }
  | { type: 'prediction_generated'; payload: PredictionGeneratedEvent }
  | { type: 'checkpoint_created'; payload: CognitiveCheckpointCreatedEvent }
  | { type: 'deviation_recorded'; payload: DeviationRecordedEvent }
  | { type: 'session_started'; payload: SessionStartedEvent }
  | { type: 'session_ended'; payload: SessionEndedEvent }
  | { type: 'handoff_created'; payload: HandoffCreatedEvent };

// ===========================================================================
// Config type
// ===========================================================================

export interface NoesisConfig {
  tools: Record<
    string,
    {
      enabled: boolean;
      adapter: string;
      settings: Record<string, unknown>;
    }
  >;
  projects: Record<
    string,
    {
      path: string;
      sensitivity: Sensitivity;
      isolation_mode: boolean;
    }
  >;
  retention_days: number;
  embedding_model: string;
  llm_provider: {
    provider: string;
    model: string;
    api_key_env: string;
  };
  cold_storage_max_mb: number;
  audit_max_mb: number;
  secret_scan_mode: 'warn' | 'redact';
}

// ===========================================================================
// Intelligence metric types
// ===========================================================================

export interface IntelligenceMetrics {
  retrieval_precision: number;
  gate_pass_rate: number;
  learning_capture_rate: number;
  skill_synthesis_rate: number;
  time_to_resolution_trend: number;
}

// ===========================================================================
// Handoff metadata types
// ===========================================================================

export interface HandoffMetadata {
  handoff_source: string;
  handoff_target: string;
  handoff_reason:
    | 'context_limit'
    | 'session_end'
    | 'tool_switch'
    | 'explicit_transfer';
  priority: 'immediate' | 'normal';
}
