/**
 * Capsule Router
 *
 * @deprecated Use {@link src/cognitive/capsules/capsule-engine.ts} instead.
 * This legacy module provides 5 simple keyword-matched capsules as data objects.
 * The cognitive capsule engine provides 7 deep capsules with 7 components each,
 * dynamic memory-enriched assembly, semantic matching, and learning writeback.
 *
 * Routes tasks to pre-packaged context capsules based on task-class matching.
 * Capsules provide domain-specific context, anti-patterns, critic rules,
 * and memory policies.
 *
 * Built-in capsule IDs:
 * - 'api-workflow': API design, integration, contract-heavy backend
 * - 'creative-redesign': Redesigns, visual refresh, anti-generic creative work
 * - 'security-hardening': Security audit, vulnerability remediation
 * - 'performance-optimization': Performance profiling, bottleneck resolution
 * - 'migration': Database migrations, API version upgrades, framework migrations
 */

import type { PromptShape } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapsuleDefinition {
  id: string;
  displayName: string;
  description: string;
  matchPatterns: string[]; // Keywords/patterns that trigger this capsule
  contextSections: string[]; // What context to load
  antiPatterns: string[]; // Domain-specific anti-patterns
  criticRules: string[]; // Custom critique rules
  memoryPolicy: {
    preferredTypes: string[]; // Memory types to prioritize
    requiredTags: string[]; // Tags to require in retrieval
    boostFactor: number; // Boost factor for matching memories
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const capsuleRegistry: Map<string, CapsuleDefinition> = new Map();

// ---------------------------------------------------------------------------
// Built-in capsule definitions
// ---------------------------------------------------------------------------

const BUILTIN_CAPSULES: CapsuleDefinition[] = [
  {
    id: 'api-workflow',
    displayName: 'API Workflow',
    description: 'API design, integration, and contract-heavy backend work.',
    matchPatterns: [
      'api', 'endpoint', 'rest', 'graphql', 'grpc', 'webhook', 'integration',
      'contract', 'schema', 'openapi', 'swagger', 'route', 'handler',
      'middleware', 'request', 'response', 'http', 'service',
    ],
    contextSections: ['api-conventions', 'error-handling', 'authentication', 'rate-limiting'],
    antiPatterns: [
      'inconsistent-error-format',
      'missing-input-validation',
      'n-plus-one-queries',
      'breaking-contract-change',
    ],
    criticRules: [
      'must include error handling',
      'must include input validation',
      'required: consistent response format',
      'required: status code correctness',
    ],
    memoryPolicy: {
      preferredTypes: ['skill', 'lesson', 'decision'],
      requiredTags: ['api', 'backend'],
      boostFactor: 1.5,
    },
  },
  {
    id: 'creative-redesign',
    displayName: 'Creative Redesign',
    description: 'Redesigns, visual refresh, and anti-generic creative work.',
    matchPatterns: [
      'redesign', 'design', 'ui', 'ux', 'visual', 'layout', 'theme',
      'brand', 'creative', 'refresh', 'aesthetic', 'style', 'component',
      'frontend', 'interface', 'responsive', 'animation',
    ],
    contextSections: ['design-system', 'accessibility', 'brand-guidelines', 'component-library'],
    antiPatterns: [
      'generic-bootstrap-look',
      'inconsistent-spacing',
      'missing-responsive-breakpoints',
      'inaccessible-contrast',
    ],
    criticRules: [
      'must include accessibility considerations',
      'required: responsive design',
      'must include visual hierarchy',
      'required: consistent spacing system',
    ],
    memoryPolicy: {
      preferredTypes: ['skill', 'decision', 'preference'],
      requiredTags: ['design', 'ui'],
      boostFactor: 1.3,
    },
  },
  {
    id: 'security-hardening',
    displayName: 'Security Hardening',
    description: 'Security audit, vulnerability remediation, and hardening.',
    matchPatterns: [
      'security', 'vulnerability', 'audit', 'harden', 'hardening', 'cve',
      'owasp', 'penetration', 'exploit', 'injection', 'xss', 'csrf',
      'authentication', 'authorization', 'encryption', 'certificate', 'tls',
    ],
    contextSections: ['security-policy', 'threat-model', 'compliance', 'auth-architecture'],
    antiPatterns: [
      'hardcoded-credentials',
      'missing-input-sanitization',
      'insecure-defaults',
      'overly-permissive-cors',
      'missing-rate-limiting',
    ],
    criticRules: [
      'must include threat model reference',
      'required: input sanitization',
      'must include principle of least privilege',
      'required: secure defaults',
    ],
    memoryPolicy: {
      preferredTypes: ['incident', 'lesson', 'skill'],
      requiredTags: ['security'],
      boostFactor: 2.0,
    },
  },
  {
    id: 'performance-optimization',
    displayName: 'Performance Optimization',
    description: 'Performance profiling, bottleneck resolution, and optimization.',
    matchPatterns: [
      'performance', 'optimize', 'optimization', 'bottleneck', 'profiling',
      'latency', 'throughput', 'cache', 'caching', 'memory', 'cpu',
      'benchmark', 'slow', 'fast', 'speed', 'load', 'scaling',
    ],
    contextSections: ['performance-baseline', 'monitoring', 'caching-strategy', 'scaling-plan'],
    antiPatterns: [
      'premature-optimization',
      'missing-baseline-measurement',
      'unbounded-cache-growth',
      'synchronous-blocking',
    ],
    criticRules: [
      'must include baseline measurement',
      'required: before/after comparison',
      'must include regression guard',
      'required: measurable improvement target',
    ],
    memoryPolicy: {
      preferredTypes: ['skill', 'lesson', 'incident'],
      requiredTags: ['performance'],
      boostFactor: 1.4,
    },
  },
  {
    id: 'migration',
    displayName: 'Migration',
    description: 'Database migrations, API version upgrades, and framework migrations.',
    matchPatterns: [
      'migration', 'migrate', 'upgrade', 'downgrade', 'schema', 'database',
      'version', 'breaking', 'backward', 'compatibility', 'rollback',
      'transition', 'deprecate', 'legacy', 'refactor',
    ],
    contextSections: ['migration-plan', 'rollback-strategy', 'data-integrity', 'compatibility-matrix'],
    antiPatterns: [
      'no-rollback-plan',
      'data-loss-risk',
      'big-bang-migration',
      'missing-data-validation',
    ],
    criticRules: [
      'must include rollback plan',
      'required: data integrity verification',
      'must include backward compatibility check',
      'required: staged rollout strategy',
    ],
    memoryPolicy: {
      preferredTypes: ['lesson', 'incident', 'decision'],
      requiredTags: ['migration', 'database'],
      boostFactor: 1.6,
    },
  },
];

// ---------------------------------------------------------------------------
// Initialize built-in capsules
// ---------------------------------------------------------------------------

for (const capsule of BUILTIN_CAPSULES) {
  capsuleRegistry.set(capsule.id, capsule);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate a match score between a prompt shape and a capsule definition.
 *
 * Scores based on keyword presence in the prompt shape's goal, context,
 * constraints, and deliverable fields. Returns a value between 0 and 1.
 */
export function matchScore(promptShape: PromptShape, capsule: CapsuleDefinition): number {
  if (capsule.matchPatterns.length === 0) {
    return 0;
  }

  // Build a searchable text corpus from the prompt shape
  const corpus = [
    promptShape.goal,
    promptShape.context,
    promptShape.deliverable,
    ...promptShape.constraints,
    ...promptShape.validation,
  ]
    .join(' ')
    .toLowerCase();

  let matchCount = 0;
  for (const pattern of capsule.matchPatterns) {
    if (corpus.includes(pattern.toLowerCase())) {
      matchCount++;
    }
  }

  return matchCount / capsule.matchPatterns.length;
}

/**
 * Route a prompt shape to the best-matching capsule.
 *
 * Returns the capsule with the highest match score, provided that score
 * exceeds a minimum threshold of 0.15 (at least ~15% of keywords match).
 * Returns null if no capsule matches above the threshold.
 */
export function routeToCapsule(promptShape: PromptShape): CapsuleDefinition | null {
  const MATCH_THRESHOLD = 0.15;

  let bestCapsule: CapsuleDefinition | null = null;
  let bestScore = 0;

  for (const capsule of capsuleRegistry.values()) {
    const score = matchScore(promptShape, capsule);
    if (score > bestScore && score >= MATCH_THRESHOLD) {
      bestScore = score;
      bestCapsule = capsule;
    }
  }

  return bestCapsule;
}

/**
 * Get a capsule definition by its ID.
 *
 * Returns the capsule if found, null otherwise.
 */
export function getCapsule(id: string): CapsuleDefinition | null {
  return capsuleRegistry.get(id) ?? null;
}

/**
 * List all registered capsule definitions.
 *
 * Returns a new array to prevent mutation of the internal registry.
 */
export function listCapsules(): CapsuleDefinition[] {
  return Array.from(capsuleRegistry.values());
}

/**
 * Register a custom capsule definition.
 *
 * If a capsule with the same ID already exists, it is replaced.
 * This enables project-specific or user-defined capsules.
 */
export function registerCapsule(capsule: CapsuleDefinition): void {
  capsuleRegistry.set(capsule.id, capsule);
}
