/**
 * Skill Registry — High-level skill lifecycle management.
 *
 * Coordinates the skill store, matcher, and built-in seeding into a
 * single coherent API for the prompt orchestration engine.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type {
  ExecutableSkill,
  SkillCategory,
  SkillMatch,
  CognitiveOutcomeResult,
  SignFn,
} from '../types.js';
import { getSkill, getSkillByName, listSkills, recordSkillInvocation } from './skill-store.js';
import { matchSkills, resolveSkillChain, formatSkillForContext, formatSkillsForContext } from './skill-matcher.js';
import { seedBuiltInSkills } from './built-in-skills.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the skill system — seeds built-in skills if not present.
 */
export function initializeSkills(db: DatabaseConnection, sign: SignFn): number {
  return seedBuiltInSkills(db, sign);
}

/**
 * Find skills matching a task description.
 */
export function findSkillsForTask(
  db: DatabaseConnection,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null,
  options?: {
    category?: SkillCategory;
    maxResults?: number;
    excludeSkills?: string[];
  },
): SkillMatch[] {
  return matchSkills(db, taskDescription, taskKeywords, embedding, options);
}

/**
 * Find the single best skill for a task.
 */
export function findBestSkill(
  db: DatabaseConnection,
  taskDescription: string,
  taskKeywords: string[],
  embedding: Buffer | null,
): SkillMatch | null {
  const matches = matchSkills(db, taskDescription, taskKeywords, embedding, {
    maxResults: 1,
  });
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Resolve a full skill chain for execution.
 */
export function getSkillChain(
  db: DatabaseConnection,
  skillId: string,
): ExecutableSkill[] {
  return resolveSkillChain(db, skillId);
}

/**
 * Record the outcome of a skill invocation.
 */
export function completeSkillInvocation(
  db: DatabaseConnection,
  skillId: string,
  outcome: CognitiveOutcomeResult,
  sign: SignFn,
): void {
  recordSkillInvocation(db, skillId, outcome, sign);
}

/**
 * Get formatted skill context for prompt injection.
 */
export function getSkillContext(
  db: DatabaseConnection,
  skillId: string,
  tokenBudget: number,
): string | null {
  const skill = getSkill(db, skillId);
  if (!skill) return null;
  return formatSkillForContext(skill, tokenBudget);
}

/**
 * Get formatted context for multiple skills.
 */
export function getMultiSkillContext(
  db: DatabaseConnection,
  skillIds: string[],
  tokenBudget: number,
): string {
  const skills = skillIds
    .map(id => getSkill(db, id))
    .filter((s): s is ExecutableSkill => s !== null);
  return formatSkillsForContext(skills, tokenBudget);
}

// Re-export for convenience
export { getSkill, getSkillByName, listSkills } from './skill-store.js';
export { resolveSkillChain, formatSkillForContext } from './skill-matcher.js';
