/**
 * Asset Converters
 *
 * Converts parsed Markdown assets (frontmatter + content) into the typed
 * input shapes expected by the database store functions:
 * - ExpertDefinitionInput
 * - ExecutableSkillInput
 * - RuleDefinitionInput
 * - DeepCapsuleInput + CapsuleComponentInput[]
 *
 * Each converter extracts structured data from frontmatter and uses the
 * Markdown body as the `content` field. Missing optional fields get sensible
 * defaults.
 */

import type { ParsedAsset } from './loader.js';
import type {
  ExpertDefinitionInput,
  ExpertCategory,
  ExecutableSkillInput,
  SkillCategory,
  RuleDefinitionInput,
  RuleCategory,
  RuleEnforcement,
  RuleTrigger,
  RuleConstraint,
  DeepCapsuleInput,
  CapsuleComponentInput,
  CapsuleComponentType,
} from '../cognitive/types.js';

// ---------------------------------------------------------------------------
// Expert conversion
// ---------------------------------------------------------------------------

interface ExpertFrontmatter {
  name?: string;
  description?: string;
  tools?: string[];
  category?: ExpertCategory;
  model?: string;
  triggers?: string[];
}

/**
 * Converts a parsed Markdown expert file to ExpertDefinitionInput.
 *
 * Frontmatter fields:
 * - name (required)
 * - description (required)
 * - tools (optional, defaults to ['Read', 'Grep', 'Glob'])
 * - category (optional, inferred from content/name)
 * - model (optional, maps to model_preference)
 * - triggers (optional, extracted from description keywords if absent)
 */
export function convertExpert(asset: ParsedAsset): ExpertDefinitionInput {
  const { content, name } = asset;
  const metadata = asset.metadata as ExpertFrontmatter;

  // Extract trigger conditions from frontmatter or derive from description
  const triggers = metadata.triggers ??
    extractKeywords(metadata.description ?? '', name);

  // Infer category from name/description if not specified
  const category = metadata.category ?? inferExpertCategory(name);

  // Extract the first heading as display name, or title-case the filename
  const displayName = extractFirstHeading(content) ?? titleCase(name);

  // Extract role from the first paragraph after the heading
  const role = metadata.description ?? `Expert in ${name.replace(/-/g, ' ')}`;

  return {
    name,
    display_name: displayName,
    role,
    domain: metadata.description ?? role,
    category,
    trigger_conditions: triggers,
    scope: {
      can: extractListSection(content, 'can') ?? [`Provide expertise in ${name.replace(/-/g, ' ')}`],
      cannot: extractListSection(content, 'cannot') ?? [],
    },
    deliverables: extractListSection(content, 'deliverables') ?? [],
    anti_patterns: extractAntiPatterns(content),
    tools: metadata.tools ?? ['Read', 'Grep', 'Glob'],
    model_preference: metadata.model,
    content,
  };
}

// ---------------------------------------------------------------------------
// Skill conversion
// ---------------------------------------------------------------------------

interface SkillFrontmatter {
  name?: string;
  description?: string;
  category?: SkillCategory;
  triggers?: string[];
  chain_with?: string[];
  'user-invocable'?: boolean;
}

/**
 * Converts a parsed Markdown skill file to ExecutableSkillInput.
 */
export function convertSkill(asset: ParsedAsset): ExecutableSkillInput {
  const { content, name } = asset;
  const metadata = asset.metadata as SkillFrontmatter;

  const triggers = metadata.triggers ??
    extractKeywords(metadata.description ?? '', name);

  const category = metadata.category ?? inferSkillCategory(name);

  return {
    name,
    description: metadata.description ?? `Skill for ${name.replace(/-/g, ' ')}`,
    category,
    trigger_conditions: triggers,
    anti_patterns: extractAntiPatterns(content),
    rules: extractListSection(content, 'rules') ?? [],
    chain_with: metadata.chain_with ?? [],
    content,
  };
}

// ---------------------------------------------------------------------------
// Rule conversion
// ---------------------------------------------------------------------------

interface RuleFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  priority?: 'high' | 'medium' | 'low';
  category?: RuleCategory;
  enforcement?: RuleEnforcement;
}

/**
 * Converts a parsed Markdown rule file to RuleDefinitionInput.
 */
export function convertRule(asset: ParsedAsset): RuleDefinitionInput {
  const { content, name } = asset;
  const metadata = asset.metadata as RuleFrontmatter;

  const enforcement = metadata.enforcement ??
    (metadata.priority === 'high' ? 'hard' : metadata.priority === 'low' ? 'advisory' : 'soft');

  const triggers = metadata.triggers ?? extractKeywords(metadata.description ?? '', name);

  const triggerConditions: RuleTrigger[] = triggers.map(t => ({
    condition: t,
    detection: 'automatic' as const,
    keywords: [t],
  }));

  const category = metadata.category ?? inferRuleCategory(name);

  return {
    name,
    category,
    description: metadata.description ?? `Rule: ${name.replace(/-/g, ' ')}`,
    enforcement,
    trigger_conditions: triggerConditions,
    constraints: extractRuleConstraints(content),
    thresholds: {},
    interactions: [],
    content,
  };
}

// ---------------------------------------------------------------------------
// Capsule conversion
// ---------------------------------------------------------------------------

interface CapsuleFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
}

/**
 * Converts a parsed CAPSULE.md asset into a DeepCapsuleInput and
 * capsule components extracted from markdown sections.
 *
 * The current markdown capsule format is a single CAPSULE.md file with
 * sections such as:
 * - ## Intent
 * - ## Assembly
 * - ## Anti-patterns
 * - ## Quality Criteria
 */
export function convertCapsule(
  asset: ParsedAsset,
): { capsule: DeepCapsuleInput; components: CapsuleComponentInput[]; content: string } {
  const { content, name } = asset;
  const metadata = asset.metadata as CapsuleFrontmatter;
  const componentSections: Array<[CapsuleComponentType, string[]]> = [
    ['intent', ['Intent']],
    ['assembly', ['Assembly']],
    ['examples', ['Examples']],
    ['anti_patterns', ['Anti-patterns']],
    ['critic', ['Critic', 'Critique', 'Review Criteria']],
    ['grader', ['Quality Criteria', 'Grader', 'Evaluation Criteria']],
    ['memory_policy', ['Memory Policy']],
  ];
  const components = componentSections
    .map(([componentType, headings]) => ({
      component_type: componentType,
      content: extractSectionFromHeadings(content, headings),
    }))
    .filter((component): component is { component_type: CapsuleComponentType; content: string } => {
      return component.content !== null;
    })
    .map((component) => ({
      capsule_id: '',
      component_type: component.component_type,
      content: component.content,
    }));

  return {
    capsule: {
      name,
      display_name: titleCase(name),
      description: metadata.description ?? `Capsule for ${name.replace(/-/g, ' ')}`,
      trigger_patterns: metadata.triggers ?? extractKeywords(metadata.description ?? '', name),
    },
    components,
    content,
  };
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function extractFirstHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function titleCase(name: string): string {
  return name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractKeywords(description: string, name: string): string[] {
  // Use the name parts as base keywords
  const nameKeywords = name.split('-').filter(w => w.length > 2);

  // Extract significant words from description
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was',
    'use', 'when', 'how', 'all', 'not', 'but', 'can', 'has', 'have',
    'will', 'been', 'into', 'each', 'any', 'its', 'also', 'than',
  ]);
  const descKeywords = description
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 8);

  return [...new Set([...nameKeywords, ...descKeywords])];
}

function extractAntiPatterns(content: string): string[] {
  const section = extractSection(content, 'Anti-patterns');
  if (!section) return [];

  return section
    .split('\n')
    .filter(line => line.startsWith('- **'))
    .map(line => {
      const match = line.match(/\*\*(.+?)\.\*\*/);
      return match?.[1]?.trim() ?? line.replace(/^-\s*\*\*/, '').replace(/\*\*.*/, '').trim();
    })
    .filter(Boolean);
}

function extractListSection(content: string, sectionName: string): string[] | null {
  const section = extractSection(content, sectionName);
  if (!section) return null;

  return section
    .split('\n')
    .filter(line => line.trim().startsWith('- '))
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

function extractSection(content: string, heading: string): string | null {
  const regex = new RegExp(`^##\\s+${heading}\\b.*$`, 'im');
  const match = content.match(regex);
  if (!match || match.index === undefined) return null;

  const start = match.index + match[0].length;
  const nextHeading = content.indexOf('\n## ', start);
  const end = nextHeading === -1 ? content.length : nextHeading;

  return content.slice(start, end).trim();
}

function extractSectionFromHeadings(content: string, headings: string[]): string | null {
  for (const heading of headings) {
    const section = extractSection(content, heading);
    if (section) {
      return section;
    }
  }

  return null;
}

function extractRuleConstraints(content: string): RuleConstraint[] {
  // Extract requirements from ## Rule section or bullet points
  const ruleSection = extractSection(content, 'Rule');
  if (!ruleSection) return [];

  const constraints: RuleConstraint[] = [];
  const lines = ruleSection.split('\n').filter(line => line.trim().startsWith('- ') || line.trim().startsWith('1. '));
  for (const line of lines.slice(0, 5)) { // Max 5 constraints
    const text = line.replace(/^[-\d.]+\s*/, '').trim();
    if (text.length > 10) {
      constraints.push({
        requirement: text,
        severity: 'warning',
      });
    }
  }

  return constraints;
}

function inferExpertCategory(name: string): ExpertCategory {
  const categoryMap: Record<string, ExpertCategory> = {
    'developer': 'code_quality',
    'architect': 'architecture',
    'qa-engineer': 'code_quality',
    'analyst': 'business',
    'ux-expert': 'design',
    'product-strategist': 'business',
    'codebase-navigator': 'analysis',
    'security-architect': 'architecture',
    'reliability-engineer': 'architecture',
    'database-engineer': 'architecture',
    'observability-engineer': 'infrastructure',
  };

  if (categoryMap[name]) return categoryMap[name];
  if (name.startsWith('gsd-')) return 'gsd';
  if (name.includes('research')) return 'research';
  return 'code_quality';
}

function inferSkillCategory(name: string): SkillCategory {
  if (name.includes('test')) return 'testing';
  if (name.includes('plan') || name.includes('workflow')) return 'workflow';
  if (name.includes('review') || name.includes('debug')) return 'quality';
  if (name.includes('design') || name.includes('frontend')) return 'design';
  if (name.includes('api') || name.includes('database') || name.includes('supabase')) return 'backend';
  if (name.includes('next') || name.includes('react') || name.includes('vercel')) return 'framework';
  return 'utility';
}

function inferRuleCategory(name: string): RuleCategory {
  if (name.includes('decision') || name.includes('fidelity')) return 'fidelity';
  if (name.includes('learn') || name.includes('capture')) return 'learning';
  if (name.includes('search') || name.includes('discover')) return 'discovery';
  if (name.includes('quality') || name.includes('output') || name.includes('verification')) return 'quality';
  return 'workflow';
}
