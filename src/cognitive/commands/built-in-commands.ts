/**
 * Built-in Commands — Core operational vocabulary.
 *
 * 51 structured commands across 5 categories:
 * - workflow (10): Planning, execution, verification
 * - gsd (20): Project management, phases, milestones
 * - memory (8): Recall, learn, forget, search
 * - session (8): Checkpoint, handoff, resume, context
 * - utility (5): Help, status, settings, debug
 *
 * Each command has:
 * - name: slash-command identifier
 * - description: what it does
 * - category: routing category
 * - argument_hint: usage hint for arguments
 * - allowed_tools: tools the command may invoke
 * - content: full command prompt/instructions
 *
 * Seeding is idempotent — existing commands by name are skipped.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { CommandDefinitionInput, SignFn } from '../types.js';
import { getCommandByName, insertCommand } from './command-store.js';

// ---------------------------------------------------------------------------
// Built-in command definitions
// ---------------------------------------------------------------------------

const BUILT_IN_COMMANDS: CommandDefinitionInput[] = [
  // =========================================================================
  // WORKFLOW (10)
  // =========================================================================
  {
    name: 'plan',
    description: 'Create a structured, decision-complete plan',
    category: 'workflow',
    argument_hint: '<goal>',
    allowed_tools: ['read', 'search', 'memory'],
    content: 'Create a goal-backward plan. Start with the target state, decompose into phases and tasks. Include verification criteria. Apply discovery-level calibration from memory.',
  },
  {
    name: 'execute',
    description: 'Execute the current plan phase',
    category: 'workflow',
    argument_hint: '[phase-number]',
    allowed_tools: ['read', 'write', 'edit', 'bash', 'memory'],
    content: 'Execute the next phase of the current plan. Track deviations using 4-rule system. Create checkpoints at human decision points. Commit per task.',
  },
  {
    name: 'verify',
    description: 'Verify current phase or task completion',
    category: 'workflow',
    argument_hint: '[phase-number]',
    allowed_tools: ['read', 'bash', 'memory'],
    content: 'Verify the current phase is complete. Check: 1) artifacts exist, 2) artifacts are substantive, 3) artifacts are wired. Run tests if available.',
  },
  {
    name: 'research',
    description: 'Research a topic with memory-aware recall',
    category: 'workflow',
    argument_hint: '<topic>',
    allowed_tools: ['read', 'search', 'memory', 'web'],
    content: 'Research the given topic. Start with memory recall for prior knowledge. Calibrate discovery level. Produce structured findings.',
  },
  {
    name: 'critique',
    description: 'Apply adversarial critic to current work',
    category: 'workflow',
    argument_hint: '[target]',
    allowed_tools: ['read', 'memory'],
    content: 'Apply the adversarial critic protocol. Evaluate across: assumptions, evidence level, alternatives, edge cases, consistency. Maximum 3 revision cycles.',
  },
  {
    name: 'tdd',
    description: 'Start TDD cycle: RED → GREEN → REFACTOR',
    category: 'workflow',
    argument_hint: '<test-description>',
    allowed_tools: ['read', 'write', 'edit', 'bash'],
    content: 'Execute TDD cycle. 1) Write failing test (RED). 2) Implement minimum to pass (GREEN). 3) Refactor with tests passing (REFACTOR). Commit at each stage.',
  },
  {
    name: 'review',
    description: 'Code review with quality gates',
    category: 'workflow',
    argument_hint: '[file-or-diff]',
    allowed_tools: ['read', 'bash', 'memory'],
    content: 'Review code changes. Check: correctness, security (OWASP), performance, maintainability, test coverage. Apply relevant rules and anti-patterns from memory.',
  },
  {
    name: 'iterate',
    description: 'Iterate on current plan with feedback',
    category: 'workflow',
    argument_hint: '<feedback>',
    allowed_tools: ['read', 'write', 'memory'],
    content: 'Incorporate feedback into the current plan. Update tasks, add/remove phases as needed. Re-run plan check after modifications.',
  },
  {
    name: 'validate',
    description: 'Validate plan against requirements',
    category: 'workflow',
    argument_hint: '',
    allowed_tools: ['read', 'memory'],
    content: 'Run 8-dimension plan check. Report: requirement coverage, task completeness, dependency correctness, key links, scope sanity, verification derivation, context compliance, memory compliance.',
  },
  {
    name: 'handoff',
    description: 'Create context handoff for session transition',
    category: 'workflow',
    argument_hint: '',
    allowed_tools: ['read', 'write', 'memory'],
    content: 'Create a structured handoff document capturing: current state, decisions made, work completed, next steps, open questions. Store in memory for next session.',
  },
  // =========================================================================
  // GSD — Project Management (20)
  // =========================================================================
  {
    name: 'new-project',
    description: 'Initialize a new GSD project',
    category: 'gsd',
    argument_hint: '<project-name>',
    allowed_tools: ['read', 'write', 'memory', 'bash'],
    content: 'Initialize a GSD project. Run questioning phase to understand scope. Generate requirements with REQ-IDs. Create initial roadmap.',
  },
  {
    name: 'status',
    description: 'Show project progress and status',
    category: 'gsd',
    argument_hint: '[project-id]',
    allowed_tools: ['read', 'memory'],
    content: 'Show progress for the current or specified project. Display: phases, current phase, completion %, checkpoints, deviations.',
  },
  {
    name: 'milestone',
    description: 'Create or manage a project milestone',
    category: 'gsd',
    argument_hint: '<create|complete|audit> <name>',
    allowed_tools: ['read', 'write', 'memory'],
    content: 'Manage milestones. create: initialize milestone. complete: mark done. audit: check against requirements.',
  },
  {
    name: 'phase',
    description: 'Manage project phases',
    category: 'gsd',
    argument_hint: '<add|insert|remove|plan|execute> [number]',
    allowed_tools: ['read', 'write', 'memory', 'bash'],
    content: 'Manage phases in the roadmap. add: append new phase. insert: insert after specified number. remove: delete pending phase. plan: create plan for phase. execute: run phase.',
  },
  {
    name: 'discuss',
    description: 'Discuss a phase before planning',
    category: 'gsd',
    argument_hint: '<phase-number> <topic>',
    allowed_tools: ['read', 'memory'],
    content: 'Discuss a phase to clarify requirements, constraints, and approach before formal planning begins.',
  },
  {
    name: 'quick',
    description: 'Execute a quick ad-hoc task',
    category: 'gsd',
    argument_hint: '<description>',
    allowed_tools: ['read', 'write', 'edit', 'bash', 'memory'],
    content: 'Quick task execution with ~30% context. Uses planner + executor only. No research phase. Tracked in quick/ subdirectory.',
  },
  {
    name: 'todo',
    description: 'Manage project TODOs',
    category: 'gsd',
    argument_hint: '<add|list|done> [description|id]',
    allowed_tools: ['read', 'write', 'memory'],
    content: 'TODO management. add <desc>: create TODO. list [area]: show TODOs. done <id>: complete TODO.',
  },
  {
    name: 'roadmap',
    description: 'View or modify the project roadmap',
    category: 'gsd',
    argument_hint: '[show|add|reorder]',
    allowed_tools: ['read', 'write', 'memory'],
    content: 'View or modify the project roadmap. show: display all phases. add: append phase. reorder: change phase sequence.',
  },
  {
    name: 'pause',
    description: 'Pause current execution',
    category: 'gsd',
    argument_hint: '',
    allowed_tools: ['write', 'memory'],
    content: 'Pause current phase execution. Save state to memory. Create checkpoint for resumption.',
  },
  {
    name: 'resume',
    description: 'Resume paused execution',
    category: 'gsd',
    argument_hint: '[project-id]',
    allowed_tools: ['read', 'memory'],
    content: 'Resume from last checkpoint. Recall relevant memories. Display what was in progress and next actions.',
  },
  {
    name: 'settings',
    description: 'View or change GSD settings',
    category: 'gsd',
    argument_hint: '[key] [value]',
    allowed_tools: ['read', 'write'],
    content: 'View or modify GSD settings. Keys: researcher, plan_check, verifier, profile, mode. Profiles: quality, balanced, budget.',
  },
  {
    name: 'map',
    description: 'Map the codebase',
    category: 'gsd',
    argument_hint: '<tech|arch|quality|concerns>',
    allowed_tools: ['read', 'bash', 'memory'],
    content: 'Analyze the codebase and produce structured analysis documents. tech: STACK.md + INTEGRATIONS.md. arch: ARCHITECTURE.md + STRUCTURE.md. quality: TESTING.md + CONVENTIONS.md. concerns: CONCERNS.md.',
  },
  {
    name: 'check-plan',
    description: 'Run 8-dimension plan verification',
    category: 'gsd',
    argument_hint: '[phase-number]',
    allowed_tools: ['read', 'memory'],
    content: 'Verify plan against 8 dimensions: requirement coverage, task completeness, dependency correctness, key links, scope sanity, verification derivation, context compliance, memory compliance.',
  },
  {
    name: 'check-integration',
    description: 'Check cross-phase integration',
    category: 'gsd',
    argument_hint: '',
    allowed_tools: ['read', 'memory'],
    content: 'Verify cross-phase wiring. Check: orphaned artifacts, missing connections, broken flows. Report coverage percentage.',
  },
  {
    name: 'debug',
    description: 'Start or manage a debug session',
    category: 'gsd',
    argument_hint: '<start|hypothesis|test|resolve> [args]',
    allowed_tools: ['read', 'bash', 'memory'],
    content: 'Structured debugging. start <slug> <symptoms>: begin session. hypothesis <desc>: add hypothesis. test <index>: test hypothesis. resolve <root-cause> <fix>: close session.',
  },
  {
    name: 'deviation',
    description: 'View or manage deviations',
    category: 'gsd',
    argument_hint: '[list|resolve]',
    allowed_tools: ['read', 'memory'],
    content: 'View deviations from the plan. list: show all deviations. resolve: acknowledge and close a deviation.',
  },
  {
    name: 'checkpoint',
    description: 'Create or resolve a checkpoint',
    category: 'gsd',
    argument_hint: '<create|resolve> <description|index>',
    allowed_tools: ['read', 'write', 'memory'],
    content: 'Manage execution checkpoints. create <type> <desc>: add checkpoint. resolve <index>: mark resolved. Types: human_verify, decision, human_action.',
  },
  {
    name: 'wave',
    description: 'View wave schedule for current phase',
    category: 'gsd',
    argument_hint: '',
    allowed_tools: ['read'],
    content: 'Display the wave schedule for the current phase. Shows task groupings, dependencies, and execution order.',
  },
  {
    name: 'audit',
    description: 'Audit milestone completion',
    category: 'gsd',
    argument_hint: '<milestone-name>',
    allowed_tools: ['read', 'memory'],
    content: 'Audit a milestone against its requirements. Report: completion percentage, gaps, unresolved checkpoints, architectural deviations.',
  },
  {
    name: 'gaps',
    description: 'Identify and plan gap closure',
    category: 'gsd',
    argument_hint: '[phase-number]',
    allowed_tools: ['read', 'memory'],
    content: 'Identify gaps in the current phase or milestone. Create a gap-closure plan if gaps are found.',
  },
  // =========================================================================
  // MEMORY (8)
  // =========================================================================
  {
    name: 'recall',
    description: 'Recall memories relevant to a topic',
    category: 'memory',
    argument_hint: '<query>',
    allowed_tools: ['memory'],
    content: 'Search memory for relevant past experiences, lessons, and decisions. Uses hybrid retrieval: full-text + vector + graph.',
  },
  {
    name: 'learn',
    description: 'Capture a lesson from current work',
    category: 'memory',
    argument_hint: '<lesson>',
    allowed_tools: ['memory'],
    content: 'Capture a structured lesson. Record: what happened, root cause, prevention rule. Store in learning loop for future reference.',
  },
  {
    name: 'forget',
    description: 'Archive or delete a specific memory',
    category: 'memory',
    argument_hint: '<memory-id>',
    allowed_tools: ['memory'],
    content: 'Archive or permanently delete a memory by ID. Archived memories move to cold storage. Deletion is permanent.',
  },
  {
    name: 'decide',
    description: 'Record a locked decision',
    category: 'memory',
    argument_hint: '<decision>',
    allowed_tools: ['memory'],
    content: 'Record a decision in the decisions context. Locked decisions cannot be overridden without explicit user authorization.',
  },
  {
    name: 'taste',
    description: 'Record a user preference',
    category: 'memory',
    argument_hint: '<prefer|dislike> <detail>',
    allowed_tools: ['memory'],
    content: 'Record a user taste preference. prefer: something the user likes. dislike: something the user wants avoided. Stored in user_taste context.',
  },
  {
    name: 'predict',
    description: 'Predict failure modes for a task',
    category: 'memory',
    argument_hint: '<task-description>',
    allowed_tools: ['memory'],
    content: 'Predict likely failure modes based on past learning events. Returns: failure class, likelihood, evidence, prevention guidance.',
  },
  {
    name: 'pattern',
    description: 'Record a failure pattern',
    category: 'memory',
    argument_hint: '<trigger> <prevention>',
    allowed_tools: ['memory'],
    content: 'Record a failure pattern in the failure_patterns context. Includes trigger condition, what was missed, root cause, and prevention rule.',
  },
  {
    name: 'search',
    description: 'Search memories with filters',
    category: 'memory',
    argument_hint: '<query> [--type TYPE] [--project ID]',
    allowed_tools: ['memory'],
    content: 'Advanced memory search with type and project filters. Returns scored results with relevance ranking.',
  },
  // =========================================================================
  // SESSION (8)
  // =========================================================================
  {
    name: 'context',
    description: 'View or set context entries',
    category: 'session',
    argument_hint: '<type> [content]',
    allowed_tools: ['read', 'write', 'memory'],
    content: 'View or update a context entry. Types: state, decisions, failure_patterns, lessons_learned, user_taste, verification, etc.',
  },
  {
    name: 'save',
    description: 'Save current session state',
    category: 'session',
    argument_hint: '',
    allowed_tools: ['write', 'memory'],
    content: 'Save the current session state to memory. Includes: active context, current work, decisions, progress.',
  },
  {
    name: 'restore',
    description: 'Restore session from saved state',
    category: 'session',
    argument_hint: '[session-id]',
    allowed_tools: ['read', 'memory'],
    content: 'Restore session state from a previous save. Loads context, decisions, and progress.',
  },
  {
    name: 'pressure',
    description: 'Check context pressure level',
    category: 'session',
    argument_hint: '',
    allowed_tools: ['read'],
    content: 'Check current context pressure. normal: <70%. warning: >=70%. critical: >=85%. At critical, auto-create handoff.',
  },
  {
    name: 'clear-context',
    description: 'Clear specific context entries',
    category: 'session',
    argument_hint: '<type>',
    allowed_tools: ['write', 'memory'],
    content: 'Clear a specific context type. Does not affect locked decisions or failure patterns.',
  },
  {
    name: 'history',
    description: 'View recent learning events',
    category: 'session',
    argument_hint: '[limit]',
    allowed_tools: ['read', 'memory'],
    content: 'Display recent learning events and lessons. Shows: trigger type, failure class, root cause, prevention rule.',
  },
  {
    name: 'effectiveness',
    description: 'View gate effectiveness metrics',
    category: 'session',
    argument_hint: '[gate-type]',
    allowed_tools: ['read', 'memory'],
    content: 'Show effectiveness metrics for quality gates. Displays: pass rate, false-pass rate, false-block rate. Suggests adjustments.',
  },
  {
    name: 'expert',
    description: 'View or route to an expert',
    category: 'session',
    argument_hint: '[name|task-description]',
    allowed_tools: ['read', 'memory'],
    content: 'View expert details by name, or route a task to the best expert. Shows: role, domain, success rate, deliverables.',
  },
  // =========================================================================
  // UTILITY (5)
  // =========================================================================
  {
    name: 'help',
    description: 'Show available commands',
    category: 'utility',
    argument_hint: '[command-name]',
    allowed_tools: ['read'],
    content: 'Show all available commands grouped by category, or detailed help for a specific command.',
  },
  {
    name: 'version',
    description: 'Show Noesis version and stats',
    category: 'utility',
    argument_hint: '',
    allowed_tools: ['read'],
    content: 'Display Noesis version, schema version, memory count, rule count, expert count, and system health.',
  },
  {
    name: 'readiness',
    description: 'Check readiness for a task',
    category: 'utility',
    argument_hint: '<task-description>',
    allowed_tools: ['read', 'memory'],
    content: 'Run evidence-backed readiness assessment. Scores 5 dimensions: clarity, codebase, constraints, risks, verification. Reports gaps.',
  },
  {
    name: 'rules',
    description: 'View active rules',
    category: 'utility',
    argument_hint: '[category]',
    allowed_tools: ['read'],
    content: 'List active behavioral rules. Optionally filter by category: workflow, quality, discovery, routing, learning, fidelity, operational.',
  },
  {
    name: 'skills',
    description: 'View available skills',
    category: 'utility',
    argument_hint: '[category]',
    allowed_tools: ['read'],
    content: 'List available executable skills. Optionally filter by category: workflow, quality, research, testing, design, backend.',
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed all built-in commands into the database.
 *
 * Idempotent — skips commands that already exist by name.
 */
export function seedBuiltInCommands(
  db: DatabaseConnection,
  sign: SignFn,
): void {
  for (const cmd of BUILT_IN_COMMANDS) {
    const existing = getCommandByName(db, cmd.name);
    if (!existing) {
      insertCommand(db, cmd, sign);
    }
  }
}

/**
 * Get all built-in command names.
 */
export function getBuiltInCommandNames(): string[] {
  return BUILT_IN_COMMANDS.map(c => c.name);
}

/**
 * Get the count of built-in commands.
 */
export function getBuiltInCommandCount(): number {
  return BUILT_IN_COMMANDS.length;
}

/**
 * Get built-in commands grouped by category.
 */
export function getBuiltInCommandsByCategory(): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const cmd of BUILT_IN_COMMANDS) {
    if (!result[cmd.category]) result[cmd.category] = [];
    result[cmd.category].push(cmd.name);
  }

  return result;
}
