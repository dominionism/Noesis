/**
 * Expert Routing — Expert Agent Routing with Memory Consultation
 *
 * @deprecated Use {@link src/cognitive/experts/expert-router.ts} instead.
 * The cognitive expert router provides 37 experts in 10 categories with
 * 3-factor scoring (triggers 0.4, semantic 0.3, performance 0.3),
 * embedding-based semantic matching, and performance history tracking.
 *
 * Routes tasks to the most appropriate expert agent based on
 * task content matching against expert specialties and patterns.
 *
 * Memory consultation: when scored memories are provided, their
 * content influences routing confidence and decision rationale.
 *
 * 9 built-in expert agents are registered at module load time.
 */

import type { ScoredMemory } from '../types.js';

// ===========================================================================
// Types
// ===========================================================================

export interface ExpertAgent {
  id: string;
  displayName: string;
  description: string;
  specialties: string[];
  matchPatterns: string[];
}

export interface RoutingDecision {
  agent: ExpertAgent;
  confidence: number;
  reason: string;
  memoryInfluence: string[];
}

// ===========================================================================
// Registry
// ===========================================================================

const expertRegistry: Map<string, ExpertAgent> = new Map();

// ===========================================================================
// Built-in experts
// ===========================================================================

const BUILT_IN_EXPERTS: ExpertAgent[] = [
  {
    id: 'continuity-manager',
    displayName: 'Continuity Manager',
    description: 'Manages session continuity, handoffs, and context preservation across agent switches.',
    specialties: ['session management', 'context handoff', 'continuity', 'state preservation'],
    matchPatterns: ['handoff', 'session', 'continuity', 'context switch', 'resume', 'pause'],
  },
  {
    id: 'workflow-router-auditor',
    displayName: 'Workflow Router Auditor',
    description: 'Audits and validates workflow routing decisions, ensuring tasks reach the right agent.',
    specialties: ['routing', 'workflow audit', 'task classification', 'agent selection'],
    matchPatterns: ['route', 'workflow', 'audit', 'classify', 'assign', 'dispatch'],
  },
  {
    id: 'critique-responder',
    displayName: 'Critique Responder',
    description: 'Responds to critic feedback by revising work output to address findings.',
    specialties: ['critique response', 'revision', 'feedback integration', 'quality improvement'],
    matchPatterns: ['critique', 'revise', 'feedback', 'improve', 'address findings', 'fix issues'],
  },
  {
    id: 'artifact-gatekeeper',
    displayName: 'Artifact Gatekeeper',
    description: 'Validates artifacts for quality, completeness, and integration before acceptance.',
    specialties: ['artifact validation', 'quality gate', 'completeness check', 'integration verification'],
    matchPatterns: ['artifact', 'validate', 'gate', 'quality', 'completeness', 'verify'],
  },
  {
    id: 'adapter-parity-auditor',
    displayName: 'Adapter Parity Auditor',
    description: 'Ensures adapter implementations maintain feature parity across tool integrations.',
    specialties: ['adapter audit', 'parity check', 'integration consistency', 'feature coverage'],
    matchPatterns: ['adapter', 'parity', 'integration', 'consistency', 'feature gap'],
  },
  {
    id: 'eval-engineer',
    displayName: 'Eval Engineer',
    description: 'Designs and runs evaluation suites to measure system quality and performance.',
    specialties: ['evaluation', 'testing', 'benchmarking', 'metrics', 'quality measurement'],
    matchPatterns: ['eval', 'evaluate', 'benchmark', 'measure', 'test suite', 'metrics'],
  },
  {
    id: 'trace-grader',
    displayName: 'Trace Grader',
    description: 'Grades execution traces for correctness, efficiency, and adherence to protocols.',
    specialties: ['trace analysis', 'execution grading', 'protocol adherence', 'efficiency audit'],
    matchPatterns: ['trace', 'grade', 'execution', 'protocol', 'efficiency', 'adherence'],
  },
  {
    id: 'failure-analyst',
    displayName: 'Failure Analyst',
    description: 'Analyzes failures, identifies root causes, and proposes prevention strategies.',
    specialties: ['failure analysis', 'root cause', 'incident response', 'prevention', 'debugging'],
    matchPatterns: ['failure', 'error', 'root cause', 'incident', 'debug', 'crash', 'bug'],
  },
  {
    id: 'tooling-integrator',
    displayName: 'Tooling Integrator',
    description: 'Integrates external tools and services, managing configurations and connections.',
    specialties: ['tool integration', 'service connection', 'configuration', 'plugin management'],
    matchPatterns: ['integrate', 'tool', 'plugin', 'configure', 'connect', 'service', 'setup'],
  },
];

// Register built-in experts at module load
for (const expert of BUILT_IN_EXPERTS) {
  expertRegistry.set(expert.id, expert);
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Route a task to the most appropriate expert agent.
 *
 * Scores each registered expert by matching task content against
 * their specialties and match patterns. When memories are provided,
 * relevant memory content can boost confidence.
 *
 * Returns null if no expert scores above the minimum threshold.
 */
export function routeToExpert(
  task: string,
  memories?: ScoredMemory[],
): RoutingDecision | null {
  const taskLower = task.toLowerCase();
  let bestScore = 0;
  let bestExpert: ExpertAgent | null = null;
  let bestReason = '';
  const memoryInfluence: string[] = [];

  for (const expert of expertRegistry.values()) {
    let score = 0;
    const matchedPatterns: string[] = [];

    // Score based on match patterns
    for (const pattern of expert.matchPatterns) {
      if (taskLower.includes(pattern.toLowerCase())) {
        score += 2;
        matchedPatterns.push(pattern);
      }
    }

    // Score based on specialties
    for (const specialty of expert.specialties) {
      const words = specialty.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const matchCount = words.filter((w) => taskLower.includes(w)).length;
      if (matchCount > 0) {
        score += matchCount;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestExpert = expert;
      bestReason = matchedPatterns.length > 0
        ? `Matched patterns: ${matchedPatterns.join(', ')}`
        : `Matched specialties for ${expert.displayName}`;
    }
  }

  if (!bestExpert || bestScore === 0) {
    return null;
  }

  // Memory influence: check if any memories relate to the chosen expert
  if (memories && memories.length > 0) {
    for (const memory of memories) {
      const memContent = (memory.title + ' ' + memory.content).toLowerCase();
      const expertKeywords = [
        ...bestExpert.matchPatterns,
        ...bestExpert.specialties,
      ];
      const relevant = expertKeywords.some((kw) =>
        memContent.includes(kw.toLowerCase()),
      );
      if (relevant) {
        memoryInfluence.push(memory.id);
      }
    }
  }

  // Normalize confidence to 0-1 range
  const maxPossibleScore = bestExpert.matchPatterns.length * 2 + bestExpert.specialties.length * 3;
  const confidence = Math.min(1, bestScore / Math.max(1, maxPossibleScore));

  // Memory boost to confidence
  const memoryBoost = Math.min(0.15, memoryInfluence.length * 0.05);

  return {
    agent: bestExpert,
    confidence: Math.min(1, confidence + memoryBoost),
    reason: bestReason,
    memoryInfluence,
  };
}

/**
 * Get an expert by ID. Returns null if not found.
 */
export function getExpert(id: string): ExpertAgent | null {
  return expertRegistry.get(id) ?? null;
}

/**
 * List all registered experts.
 */
export function listExperts(): ExpertAgent[] {
  return Array.from(expertRegistry.values());
}

/**
 * Register a new expert agent.
 * Overwrites if an expert with the same ID exists.
 */
export function registerExpert(expert: ExpertAgent): void {
  expertRegistry.set(expert.id, expert);
}
