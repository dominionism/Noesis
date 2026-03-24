/**
 * Prompt Engine — Top-level orchestration for cognitive prompt assembly.
 *
 * Coordinates all cognitive subsystems (rules, experts, capsules, skills,
 * contexts, memories) into a coherent PromptAssembly. This is the main
 * entry point for the cognitive architecture.
 *
 * Orchestration flow:
 * 1. Classify the task (substantial vs operational)
 * 2. Match rules
 * 3. Route to expert (if substantial)
 * 4. Match capsule (if task class fits)
 * 5. Assess discovery level
 * 6. Assemble contexts in priority order
 * 7. Match relevant skills
 * 7.5. Predict failure modes and inject preventive guidance (correction→prediction→injection loop)
 * 8. Build reasoning scaffold
 * 9. Assemble everything within token budget
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  PromptAssembly,
  RuleDefinition,
  ExpertDefinition,
  AssembledCapsule,
  ExecutableSkill,
  ContextEntry,
  DiscoveryAssessment,
  TaskClassification,
  SignFn,
} from '../types.js';
import type { Memory, PromptShape } from '../../types.js';
import { matchRulesForTask } from '../rules/rule-engine.js';
import { findExpertForTask } from '../experts/expert-registry.js';
import { matchCapsule } from '../capsules/capsule-engine.js';
import { assembleCapsule } from '../capsules/capsule-assembly.js';
import { matchSkills } from '../skills/skill-matcher.js';
import { assembleContexts } from '../context/context-engine.js';
import { buildReasoningScaffold } from './reasoning-scaffold.js';
import type { CommunicationMode } from './reasoning-scaffold.js';
import { assessDiscoveryLevel } from './discovery-levels.js';
import { PROMPT_ASSEMBLY_ORDER } from '../../constants.js';
import { predictFailureModes, getPreventiveGuidance } from '../learning/predictive-failure.js';
import { generateId } from '../../core/ulid.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full reasoning orchestration. Assembles all cognitive entities into
 * a PromptAssembly ready for rendering.
 */
export function orchestratePrompt(
  db: DatabaseConnection,
  promptShape: PromptShape,
  projectId: string | null,
  memories: Memory[],
  options: {
    sign: SignFn;
    tokenBudget: number;
    communicationMode?: CommunicationMode;
    taskKeywords?: string[];
    embedding?: Buffer | null;
  },
): PromptAssembly {
  const taskDescription = `${promptShape.goal} ${promptShape.context}`;
  const keywords = options.taskKeywords ?? extractKeywords(taskDescription);
  const embedding = options.embedding ?? null;
  const classification = classifyTask(taskDescription, promptShape);

  // 1. Match rules
  const rules = matchRulesForTask(db, taskDescription, keywords, embedding);

  // 2. Route to expert (if substantial)
  let expert: ExpertDefinition | null = null;
  if (classification.substantial) {
    const expertMatch = findExpertForTask(db, taskDescription, keywords, embedding);
    expert = expertMatch?.expert ?? null;
  }

  // 3. Match capsule
  let capsule: AssembledCapsule | null = null;
  const capsuleMatches = matchCapsule(db, taskDescription, keywords, embedding);
  if (capsuleMatches.length > 0) {
    capsule = assembleCapsule(db, capsuleMatches[0].capsule, memories, []);
  }

  // 4. Assess discovery level
  const discovery = assessDiscoveryLevel(
    promptShape,
    memories,
    false, // codebaseExplored — caller should set based on actual state
  );

  // 5. Assemble contexts
  const contextBudget = Math.floor(options.tokenBudget * 0.3); // 30% for contexts
  const { contexts } = assembleContexts(db, projectId, contextBudget);

  // 6. Match skills
  const skillMatches = matchSkills(db, taskDescription, keywords, embedding, {
    maxResults: 3,
  });
  const skills = skillMatches.map(m => m.skill);

  // 6.5. Predict failure modes and inject preventive guidance
  const predictionResult = predictFailureModes(db, taskDescription);
  if (predictionResult.predictions.length > 0) {
    const guidance = getPreventiveGuidance(predictionResult.predictions);
    if (guidance) {
      const now = new Date().toISOString();
      contexts.push({
        id: generateId(),
        context_type: 'failure_patterns',
        content: guidance,
        project_id: projectId,
        version: 1,
        created_at: now,
        updated_at: now,
      });
    }
  }

  // 7. Build reasoning scaffold
  const scaffold = buildReasoningScaffold({
    communicationMode: options.communicationMode ?? 'intermediate',
    taskType: classification.substantial ? 'substantial' : 'operational',
    hasMemories: memories.length > 0,
    hasPredictions: contexts.some(c => c.context_type === 'failure_patterns'),
    hasExpert: expert !== null,
    hasCapsule: capsule !== null,
    domain: inferDomain(classification),
  });

  return {
    reasoning_scaffold: scaffold,
    rules,
    expert,
    capsule,
    skills,
    memories,
    contexts,
    prompt_shape: promptShape,
    token_budget: options.tokenBudget,
    priority_order: [...PROMPT_ASSEMBLY_ORDER],
  };
}

/**
 * Classify a task to determine its characteristics.
 */
export function classifyTask(
  taskDescription: string,
  promptShape: PromptShape,
): TaskClassification {
  const desc = taskDescription.toLowerCase();
  const substantial = isSubstantialTask(taskDescription);

  const creativePatterns = [/\bdesign\b/, /\bredesign\b/, /\bui\b/, /\bux\b/, /\blayout\b/, /\bvisual\b/];
  const apiPatterns = [/\bapi\b/, /\bendpoint\b/, /\broute\b/, /\bcontract\b/, /\bgraphql\b/, /\brpc\b/];

  const creative = creativePatterns.some(p => p.test(desc));
  const apiWork = apiPatterns.some(p => p.test(desc));
  const keywords = extractKeywords(taskDescription);

  // Estimate file count
  const filePatterns = [
    /(\d+)\s*files?/,
    /\bmultiple\s*(files|modules|components)/,
    /\bacross\s*(files|modules|services)/,
  ];
  let estimatedFiles = 1;
  for (const p of filePatterns) {
    const match = desc.match(p);
    if (match) {
      estimatedFiles = match[1] ? parseInt(match[1], 10) : 3;
      break;
    }
  }

  // Discovery level
  let discoveryLevel: 0 | 1 | 2 | 3 = 1;
  if (!substantial) discoveryLevel = 0;
  else if (desc.length > 300 || estimatedFiles > 5) discoveryLevel = 3;
  else if (desc.length > 150 || estimatedFiles > 2) discoveryLevel = 2;

  return {
    substantial,
    creative,
    api_work: apiWork,
    discovery_level: discoveryLevel,
    estimated_files: estimatedFiles,
    subsystems: inferSubsystems(desc),
    keywords,
  };
}

/**
 * Determine if a task is substantial enough to warrant full workflow.
 */
export function isSubstantialTask(request: string): boolean {
  const desc = request.toLowerCase();

  // Length check
  if (desc.length < 50) return false;

  // Multi-step indicators
  const multiStep = [
    /\band\s+then\b/, /\bafter\s+that\b/, /\bfirst.*then\b/,
    /\bmultiple\b/, /\bseveral\b/, /\bsteps?\b/,
  ];

  // Complexity indicators
  const complexity = [
    /\brefactor/i, /\bredesign/i, /\bmigrat/i, /\bintegrat/i,
    /\barchitect/i, /\bsecurity/i, /\bperform/i, /\boptimiz/i,
    /\bimplement/i, /\btest.*suite/i, /\breview/i,
  ];

  let signals = 0;
  for (const p of [...multiStep, ...complexity]) {
    if (p.test(desc)) signals++;
  }

  return signals >= 1 && desc.length >= 50;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'out', 'off', 'over', 'under', 'again',
    'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not',
    'so', 'if', 'this', 'that', 'these', 'those', 'it', 'its',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too',
    'very', 'just', 'also', 'now',
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Deduplicate and return top keywords
  return [...new Set(words)].slice(0, 20);
}

function inferSubsystems(desc: string): string[] {
  const subsystems: string[] = [];
  const patterns: [RegExp, string][] = [
    [/\b(api|endpoint|route|handler)\b/, 'api'],
    [/\b(database|query|migration|schema)\b/, 'database'],
    [/\b(ui|component|frontend|layout)\b/, 'frontend'],
    [/\b(auth|login|session|permission)\b/, 'auth'],
    [/\b(test|spec|coverage)\b/, 'testing'],
    [/\b(deploy|ci|pipeline|build)\b/, 'infrastructure'],
    [/\b(config|setting|environment)\b/, 'configuration'],
  ];

  for (const [pattern, name] of patterns) {
    if (pattern.test(desc)) subsystems.push(name);
  }

  return subsystems;
}

function inferDomain(
  classification: TaskClassification,
): 'backend' | 'frontend' | 'testing' | 'security' | 'general' {
  if (classification.subsystems.includes('frontend') || classification.creative) return 'frontend';
  if (classification.subsystems.includes('testing')) return 'testing';
  if (classification.subsystems.includes('auth')) return 'security';
  if (classification.api_work || classification.subsystems.includes('api')) return 'backend';
  if (classification.subsystems.includes('database')) return 'backend';
  return 'general';
}
