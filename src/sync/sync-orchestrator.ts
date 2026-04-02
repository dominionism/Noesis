/**
 * Sync Orchestrator
 *
 * Main entry point for bidirectional sync across all adapters.
 * Detects installed tools, assembles context, distributes via
 * adapter-specific transforms, and ingests write-backs.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { createDefaultAdapterRegistry, createSandboxedQuery, createTokenBudget } from '../adapters/index.js';
import { extractManagedSection, replaceManagedSection } from '../adapters/managed-sections.js';
import {
  CONTEXT_SNAPSHOT_TOP_ANTIPATTERNS,
  CONTEXT_SNAPSHOT_TOP_SKILLS,
  FILE_PERMISSIONS,
  INBOX_DIR,
  MANAGED_SECTION_VERSION,
  PROCESSED_INBOX_DIR,
  TOKEN_BUDGETS,
} from '../constants.js';
import { createMemory, getProject, getProjectByPath, listMemories } from '../core/memory-crud.js';
import { generateId } from '../core/ulid.js';
import { hybridRetrieve } from '../retrieval/hybrid.js';
import { executeWritePipeline } from '../memory/write-pipeline.js';
import { validatePath } from '../security/path-validation.js';
import { assembleContexts, getDecisions, getFailurePatterns } from '../cognitive/context/context-engine.js';
import { orchestratePrompt } from '../cognitive/prompt/prompt-engine.js';
import { listSkills } from '../cognitive/skills/skill-store.js';
import { createInboxEntry, parseInboxContent, type InboxEntry, type IngestResult, type ParsedLearning } from './inbox-ingester.js';

import type { DatabaseConnection } from '../core/database.js';
import type { SignFn } from '../cognitive/types.js';
import type {
  Adapter,
  AntiPatternDefinition,
  AuditEntry,
  DangerousMatch,
  EmbeddingProvider,
  Memory,
  NoesisEvent,
  ScanResult,
  ScoredMemory,
  SecretMatch,
  SkillDefinition,
  UniversalContext,
  WritePipelineResult,
} from '../types.js';

// ===========================================================================
// Types
// ===========================================================================

export interface SyncTarget {
  adapterId: string;
  displayName: string;
  detected: boolean;
  configPaths: string[];
  maxContextTokens: number;
  supportsManagedSections: boolean;
  canWriteBack: boolean;
}

export interface SyncPlan {
  id: string;
  targets: SyncTarget[];
  totalTokensBudget: number;
  createdAt: string;
}

export interface SyncOutcome {
  adapterId: string;
  tokensInjected: number;
  tokensBudget: number;
  filesWritten: number;
  errors: string[];
  durationMs: number;
  writtenPaths?: string[];
}

export interface SyncResult {
  planId: string;
  outcomes: SyncOutcome[];
  totalTokensInjected: number;
  totalFilesWritten: number;
  totalErrors: number;
  durationMs: number;
  completedAt: string;
}

export interface SyncOptions {
  dryRun?: boolean;
  adapterFilter?: string[];
  force?: boolean;
  verbose?: boolean;
}

export interface RuntimeSyncDependencies {
  db: DatabaseConnection;
  embeddingProvider: EmbeddingProvider;
  verifySignature: (memory: Memory) => { valid: boolean; tampered: boolean };
  scanSecrets: (text: string) => { clean: string; redacted: boolean; matches: SecretMatch[] };
  signMemory: (memory: {
    id: string;
    type: string;
    title: string;
    content: string;
    project_id: string | null;
  }) => string;
  scanAndRedact: (text: string) => ScanResult;
  checkDangerousPatterns: (text: string) => DangerousMatch[];
  writeAuditLog: (entry: Omit<AuditEntry, 'timestamp'>) => void;
  emitEvent: (event: NoesisEvent) => void;
  generateId: () => string;
  inboxDir?: string;
  processedInboxDir?: string;
}

export interface RuntimeSyncResult extends SyncResult {
  status: 'completed' | 'dry_run' | 'no_targets';
  projectId: string | null;
  projectRoot: string;
  plan: SyncPlan;
  writeback: IngestResult;
}

// ===========================================================================
// Rate limiting
// ===========================================================================

const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let lastSyncAt = 0;

const CONTEXT_DIR = 'Context';
const BRIDGED_CONTEXT_FILENAMES = new Set(['AGENTS.md', 'CLAUDE.md']);
const NOESIS_CONTEXT_GITIGNORE_ENTRIES = [
  'AGENTS.md',
  'CLAUDE.md',
  `${CONTEXT_DIR}/AGENTS.md`,
  `${CONTEXT_DIR}/CLAUDE.md`,
];
const GITIGNORE_BLOCK_BEGIN = '# BEGIN NOESIS GENERATED CONTEXT';
const GITIGNORE_BLOCK_END = '# END NOESIS GENERATED CONTEXT';

// ===========================================================================
// Public API: pure helpers retained for unit tests
// ===========================================================================

/**
 * Create a sync plan by detecting all available adapters.
 */
export function createSyncPlan(targets: SyncTarget[]): SyncPlan {
  const detectedTargets = targets.filter((t) => t.detected);

  return {
    id: generateId(),
    targets: detectedTargets,
    totalTokensBudget: detectedTargets.reduce((sum, t) => sum + t.maxContextTokens, 0),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Check if sync is allowed (rate limiting).
 */
export function canSync(options?: SyncOptions): { allowed: boolean; reason?: string } {
  if (options?.force) return { allowed: true };

  const now = Date.now();
  const elapsed = now - lastSyncAt;

  if (elapsed < SYNC_COOLDOWN_MS) {
    const remaining = Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000);
    return {
      allowed: false,
      reason: `Rate limited. Next sync available in ${remaining} seconds.`,
    };
  }

  return { allowed: true };
}

/**
 * Record a sync timestamp.
 */
export function recordSync(): void {
  lastSyncAt = Date.now();
}

/**
 * Execute sync for a single adapter target.
 */
export function executeSyncForTarget(
  target: SyncTarget,
  contextTokens: number,
  options?: SyncOptions,
): SyncOutcome {
  const start = Date.now();

  if (options?.dryRun) {
    return {
      adapterId: target.adapterId,
      tokensInjected: 0,
      tokensBudget: target.maxContextTokens,
      filesWritten: 0,
      errors: [],
      durationMs: Date.now() - start,
    };
  }

  return {
    adapterId: target.adapterId,
    tokensInjected: Math.min(contextTokens, target.maxContextTokens),
    tokensBudget: target.maxContextTokens,
    filesWritten: target.supportsManagedSections ? 1 : 0,
    errors: [],
    durationMs: Date.now() - start,
  };
}

/**
 * Aggregate sync outcomes into a result.
 */
export function aggregateResults(
  planId: string,
  outcomes: SyncOutcome[],
  startTime: number,
): SyncResult {
  return {
    planId,
    outcomes,
    totalTokensInjected: outcomes.reduce((sum, o) => sum + o.tokensInjected, 0),
    totalFilesWritten: outcomes.reduce((sum, o) => sum + o.filesWritten, 0),
    totalErrors: outcomes.reduce((sum, o) => sum + o.errors.length, 0),
    durationMs: Date.now() - startTime,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Run the pure sync helper pipeline used by isolated unit tests.
 */
export function runSync(
  targets: SyncTarget[],
  contextTokens: number,
  options?: SyncOptions,
): SyncResult {
  const check = canSync(options);
  if (!check.allowed) {
    return {
      planId: '',
      outcomes: [],
      totalTokensInjected: 0,
      totalFilesWritten: 0,
      totalErrors: 1,
      durationMs: 0,
      completedAt: new Date().toISOString(),
    };
  }

  const startTime = Date.now();
  const plan = createSyncPlan(targets);

  const filteredTargets = options?.adapterFilter
    ? plan.targets.filter((t) => options.adapterFilter!.includes(t.adapterId))
    : plan.targets;

  const outcomes: SyncOutcome[] = [];
  for (const target of filteredTargets) {
    outcomes.push(executeSyncForTarget(target, contextTokens, options));
  }

  if (options?.dryRun !== true && filteredTargets.length > 0) {
    recordSync();
  }
  return aggregateResults(plan.id, outcomes, startTime);
}

// ===========================================================================
// Runtime sync: actual adapter detection, file writes, and inbox ingestion
// ===========================================================================

interface ResolvedProjectScope {
  projectRoot: string;
  projectId: string | null;
}

function resolveProjectScope(
  db: DatabaseConnection,
  projectRoot: string | undefined,
  projectId: string | null | undefined,
): ResolvedProjectScope {
  let resolvedRoot = projectRoot ? resolve(projectRoot) : null;
  let resolvedProjectId = projectId ?? null;

  if (resolvedProjectId && resolvedRoot === null) {
    const project = getProject(db, resolvedProjectId);
    if (!project) {
      throw new Error(`Unknown project: ${resolvedProjectId}`);
    }
    resolvedRoot = resolve(project.path);
  }

  if (resolvedRoot === null) {
    throw new Error('Sync requires a project_root or project_id.');
  }

  if (!resolvedProjectId) {
    resolvedProjectId = getProjectByPath(db, resolvedRoot)?.id ?? null;
  }

  return {
    projectRoot: resolvedRoot,
    projectId: resolvedProjectId,
  };
}

function toScoredMemory(memory: Memory): ScoredMemory {
  return {
    ...memory,
    semantic_score: 0,
    bm25_rank: 0,
    vector_rank: 0,
    recency_modifier: 1,
    access_boost: 0,
    success_weight: 0,
    scope_boost: 0,
    final_score: 0,
  };
}

function normalizeProjectRelativePath(pathLike: string): string {
  return pathLike.replace(/\\/g, '/');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBridgedContextTarget(targetPath: string): { canonicalPath: string; bridgePath: string } | null {
  const normalized = normalizeProjectRelativePath(targetPath);
  const fileName = basename(normalized);

  if (!BRIDGED_CONTEXT_FILENAMES.has(fileName)) {
    return null;
  }

  if (normalized === fileName) {
    return {
      canonicalPath: `${CONTEXT_DIR}/${fileName}`,
      bridgePath: fileName,
    };
  }

  if (normalized === `${CONTEXT_DIR}/${fileName}`) {
    return {
      canonicalPath: normalized,
      bridgePath: fileName,
    };
  }

  return null;
}

function readManagedSeedContent(
  projectRoot: string,
  targetPath: string,
  fallbackSourcePaths: string[] = [],
): string {
  const resolvedTargetPath = validatePath(targetPath, projectRoot);

  if (existsSync(resolvedTargetPath)) {
    return readFileSync(resolvedTargetPath, 'utf-8');
  }

  for (const sourcePath of fallbackSourcePaths) {
    const resolvedSourcePath = validatePath(sourcePath, projectRoot);
    if (!existsSync(resolvedSourcePath)) continue;
    return readFileSync(resolvedSourcePath, 'utf-8');
  }

  return '';
}

function ensureCompatibilityBridge(
  projectRoot: string,
  bridgePath: string,
  canonicalPath: string,
): string | null {
  const resolvedBridgePath = validatePath(bridgePath, projectRoot);
  const resolvedCanonicalPath = validatePath(canonicalPath, projectRoot);
  const linkTarget = relative(dirname(resolvedBridgePath), resolvedCanonicalPath) || basename(resolvedCanonicalPath);

  mkdirSync(dirname(resolvedBridgePath), { recursive: true, mode: FILE_PERMISSIONS.DIR });

  if (existsSync(resolvedBridgePath)) {
    const stat = lstatSync(resolvedBridgePath);
    if (stat.isSymbolicLink()) {
      if (readlinkSync(resolvedBridgePath) === linkTarget) {
        return null;
      }
      unlinkSync(resolvedBridgePath);
    } else {
      unlinkSync(resolvedBridgePath);
    }
  }

  try {
    symlinkSync(linkTarget, resolvedBridgePath);
  } catch {
    writeFileSync(resolvedBridgePath, readFileSync(resolvedCanonicalPath, 'utf-8'), {
      encoding: 'utf-8',
      mode: FILE_PERMISSIONS.CONFIG,
    });
  }

  return resolvedBridgePath;
}

function ensureGitignoreEntries(projectRoot: string, relativePaths: string[]): string | null {
  const gitDir = join(projectRoot, '.git');
  if (!existsSync(gitDir)) {
    return null;
  }

  const normalizedEntries = [...new Set(relativePaths.map((entry) => {
    const normalized = normalizeProjectRelativePath(entry).replace(/^\/+/, '');
    return `/${normalized}`;
  }))].sort();

  if (normalizedEntries.length === 0) {
    return null;
  }

  const managedBlock = [
    GITIGNORE_BLOCK_BEGIN,
    ...normalizedEntries,
    GITIGNORE_BLOCK_END,
  ].join('\n');

  const gitignorePath = join(projectRoot, '.gitignore');
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  const blockPattern = new RegExp(
    `${escapeRegExp(GITIGNORE_BLOCK_BEGIN)}[\\s\\S]*?${escapeRegExp(GITIGNORE_BLOCK_END)}`,
    'm',
  );

  let nextContent: string;
  if (blockPattern.test(existing)) {
    nextContent = existing.replace(blockPattern, managedBlock);
  } else {
    const separator = existing.trim().length > 0 ? '\n\n' : '';
    nextContent = `${existing}${separator}${managedBlock}\n`;
  }

  if (nextContent === existing) {
    return null;
  }

  writeFileSync(gitignorePath, nextContent, {
    encoding: 'utf-8',
    mode: FILE_PERMISSIONS.CONFIG,
  });

  return gitignorePath;
}

function summarizeText(content: string, maxLength: number = 280): string {
  const flattened = content.replace(/\s+/g, ' ').trim();
  if (flattened.length <= maxLength) return flattened;
  return flattened.slice(0, maxLength - 3) + '...';
}

function buildSkillDefinitions(db: DatabaseConnection): SkillDefinition[] {
  return listSkills(db, { enabled: true })
    .slice(0, CONTEXT_SNAPSHOT_TOP_SKILLS)
    .map((skill) => {
      const successes = Math.round(skill.success_rate * skill.invocation_count);
      return {
        name: skill.name,
        kind: 'skill',
        description: skill.description,
        trigger_pattern: skill.trigger_conditions.join(', '),
        steps: [],
        prerequisites: [],
        anti_patterns: skill.anti_patterns,
        validation_criteria: [],
        source_lessons: [],
        status: skill.enabled ? 'active' : 'archived',
        confidence: skill.success_rate,
        successes,
        failures: Math.max(0, skill.invocation_count - successes),
        last_used_at: null,
      };
    });
}

function buildAntiPatterns(
  db: DatabaseConnection,
  projectId: string | null,
  skills: SkillDefinition[],
): AntiPatternDefinition[] {
  const failurePatterns = getFailurePatterns(db, projectId).slice(0, CONTEXT_SNAPSHOT_TOP_ANTIPATTERNS);
  const fromContexts: AntiPatternDefinition[] = failurePatterns.map((pattern, index) => ({
    name: pattern.trigger || `failure-pattern-${index + 1}`,
    kind: 'anti_pattern',
    description: pattern.miss || pattern.rootCause || pattern.trigger || 'Known failure pattern',
    trigger_pattern: pattern.trigger || pattern.miss || 'Known failure mode',
    failure_mode: pattern.rootCause || pattern.miss || pattern.trigger || 'Failure pattern',
    correct_approach: pattern.prevention || 'Follow the stored prevention guidance',
    source_lessons: [],
    status: 'active',
    confidence: 0.8,
    successes: 0,
    failures: 1,
    last_used_at: null,
  }));

  if (fromContexts.length > 0) {
    return fromContexts;
  }

  const skillPatterns = skills
    .flatMap((skill) => skill.anti_patterns.map((item) => ({ skill, item })))
    .slice(0, CONTEXT_SNAPSHOT_TOP_ANTIPATTERNS);

  return skillPatterns.map(({ skill, item }, index) => ({
    name: `${skill.name}-anti-pattern-${index + 1}`,
    kind: 'anti_pattern',
    description: item,
    trigger_pattern: item,
    failure_mode: item,
    correct_approach: `Avoid the ${skill.name} anti-pattern and follow the skill guidance instead.`,
    source_lessons: [],
    status: 'active',
    confidence: 0.7,
    successes: 0,
    failures: 1,
    last_used_at: null,
  }));
}

async function buildUniversalContext(
  deps: RuntimeSyncDependencies,
  scope: ResolvedProjectScope,
  maxTokenBudget: number,
): Promise<UniversalContext> {
  const { db, embeddingProvider, verifySignature, scanSecrets, signMemory } = deps;
  const query = `project context conventions decisions lessons checkpoints ${basename(scope.projectRoot)}`;

  let warmMemories: ScoredMemory[] = [];
  try {
    const result = await hybridRetrieve({
      db,
      embeddingProvider,
      recallParams: {
        query,
        project_id: scope.projectId ?? undefined,
        limit: 12,
      },
      verifySignature,
      scanSecrets,
    });
    warmMemories = result.memories;
  } catch {
    warmMemories = listMemories(db, {
      project_id: scope.projectId ?? undefined,
      limit: 12,
    }).map(toScoredMemory);
  }

  const recentMemories: Memory[] = warmMemories;
  const activeCheckpoints = listMemories(db, {
    type: 'checkpoint',
    project_id: scope.projectId ?? undefined,
    limit: 10,
  });
  const latestSession = listMemories(db, {
    type: 'session',
    project_id: scope.projectId ?? undefined,
    limit: 1,
  })[0] ?? null;
  const skills = buildSkillDefinitions(db);
  const antiPatterns = buildAntiPatterns(db, scope.projectId, skills);
  const { contexts } = assembleContexts(db, scope.projectId, Math.max(400, Math.floor(maxTokenBudget * 0.25)));
  const contextByType = new Map(contexts.map((entry) => [entry.context_type, entry.content]));
  const decisions = getDecisions(db, scope.projectId).locked;
  const failurePatterns = getFailurePatterns(db, scope.projectId).map((pattern) =>
    [pattern.trigger, pattern.miss, pattern.rootCause, pattern.prevention]
      .filter(Boolean)
      .join(' | '),
  );

  const sign: SignFn = (content: string) => signMemory({
    id: 'sync',
    type: 'sync',
    title: 'sync',
    content,
    project_id: scope.projectId,
  });

  const promptAssembly = orchestratePrompt(
    db,
    {
      goal: `Synchronize durable project intelligence for ${basename(scope.projectRoot)}`,
      context: `Project root: ${scope.projectRoot}`,
      constraints: [
        'Preserve user-authored content outside managed sections',
        'Favor project-specific context over global defaults',
      ],
      deliverable: 'Adapter instruction files',
      validation: [
        'Managed sections remain intact',
        'Context reflects current project state',
      ],
    },
    scope.projectId,
    recentMemories,
    { sign, tokenBudget: maxTokenBudget },
  );

  const hotMemories = Object.fromEntries(
    recentMemories.slice(0, 6).map((memory) => [memory.title, summarizeText(memory.content)]),
  );

  const conventions: Record<string, string> = {};
  const projectContext: Record<string, string> = {
    root: scope.projectRoot,
  };

  if (contextByType.has('verification')) {
    conventions.verification = summarizeText(contextByType.get('verification')!);
  }
  if (contextByType.has('user_taste')) {
    conventions.user_taste = summarizeText(contextByType.get('user_taste')!);
  }
  if (contextByType.has('reference_library')) {
    conventions.reference_library = summarizeText(contextByType.get('reference_library')!);
  }
  if (contextByType.has('state')) {
    projectContext.state = summarizeText(contextByType.get('state')!);
  }
  if (contextByType.has('tooling')) {
    projectContext.tooling = summarizeText(contextByType.get('tooling')!);
  }
  if (contextByType.has('artifacts')) {
    projectContext.artifacts = summarizeText(contextByType.get('artifacts')!);
  }

  return {
    persona: `Noesis synchronized intelligence context for project ${basename(scope.projectRoot)}. Preserve user-authored instructions outside the managed section.`,
    conventions,
    projectContext,
    hotMemories,
    warmMemories,
    skills,
    antiPatterns,
    activeCheckpoints,
    sessionId: latestSession?.id ?? null,
    cognitiveEnrichment: {
      reasoningScaffold: promptAssembly.reasoning_scaffold,
      rules: promptAssembly.rules,
      expert: promptAssembly.expert,
      capsule: promptAssembly.capsule,
      cognitiveSkills: promptAssembly.skills,
      contexts: promptAssembly.contexts,
      decisions,
      failurePatterns,
    },
  };
}

async function detectTargets(
  projectRoot: string,
  adapterFilter?: string[],
): Promise<Array<{ adapter: Adapter; target: SyncTarget }>> {
  const registry = createDefaultAdapterRegistry();
  const query = createSandboxedQuery(projectRoot);
  const detections = await registry.detect(query);

  const allTargets = Array.from(registry.adapters.values())
    .filter((adapter) => adapterFilter === undefined || adapterFilter.includes(adapter.id))
    .map((adapter) => {
      const detection = detections.get(adapter.id) ?? {
        detected: false,
        confidence: 0,
        configPaths: [],
      };

      return {
        adapter,
        target: {
          adapterId: adapter.id,
          displayName: adapter.displayName,
          detected: detection.detected,
          configPaths: detection.configPaths,
          maxContextTokens: TOKEN_BUDGETS[adapter.id] ?? adapter.targetCapabilities.maxContextTokens,
          supportsManagedSections: adapter.targetCapabilities.supportsManagedSections,
          canWriteBack: adapter.capabilities.canWriteBack,
        },
      };
    });

  const nonGenericDetected = allTargets.filter((item) => item.adapter.id !== 'generic' && item.target.detected);
  const genericDetected = allTargets.find((item) => item.adapter.id === 'generic');

  if (adapterFilter?.includes('generic')) {
    return allTargets.filter((item) => item.target.detected);
  }

  if (nonGenericDetected.length > 0) {
    return nonGenericDetected;
  }

  return genericDetected && genericDetected.target.detected ? [genericDetected] : [];
}

function writeManagedFile(
  projectRoot: string,
  adapterId: string,
  rawContent: string,
  version: string,
  targetPath: string,
  fallbackSourcePaths: string[] = [],
): string {
  const resolvedPath = validatePath(targetPath, projectRoot);
  mkdirSync(dirname(resolvedPath), { recursive: true, mode: FILE_PERMISSIONS.DIR });

  const existing = readManagedSeedContent(projectRoot, targetPath, fallbackSourcePaths);
  const nextContent = replaceManagedSection(existing, adapterId, rawContent, version);

  writeFileSync(resolvedPath, nextContent, {
    encoding: 'utf-8',
    mode: FILE_PERMISSIONS.CONFIG,
  });

  return resolvedPath;
}

function applyFileWrites(
  projectRoot: string,
  writes: Array<{
    path: string;
    content: string;
    managedSection: boolean;
    adapterId: string;
    rawContent?: string;
    version?: string;
  }>,
): string[] {
  const writtenPaths = new Set<string>();
  const gitignoreEntries = new Set<string>();

  for (const write of writes) {
    if (write.managedSection) {
      const embedded = extractManagedSection(write.content, write.adapterId);
      const rawContent = write.rawContent ?? embedded?.content ?? write.content;
      const version = write.version ?? MANAGED_SECTION_VERSION;
      const bridgedTarget = getBridgedContextTarget(write.path);

      if (bridgedTarget) {
        writtenPaths.add(
          writeManagedFile(
            projectRoot,
            write.adapterId,
            rawContent,
            version,
            bridgedTarget.canonicalPath,
            [bridgedTarget.bridgePath],
          ),
        );
        const bridgePath = ensureCompatibilityBridge(
          projectRoot,
          bridgedTarget.bridgePath,
          bridgedTarget.canonicalPath,
        );
        if (bridgePath) {
          writtenPaths.add(bridgePath);
        }
        gitignoreEntries.add(bridgedTarget.bridgePath);
        gitignoreEntries.add(bridgedTarget.canonicalPath);
        continue;
      }

      writtenPaths.add(
        writeManagedFile(projectRoot, write.adapterId, rawContent, version, write.path),
      );
      continue;
    }

    const resolvedPath = validatePath(write.path, projectRoot);
    mkdirSync(dirname(resolvedPath), { recursive: true, mode: FILE_PERMISSIONS.DIR });
    writeFileSync(resolvedPath, write.content, {
      encoding: 'utf-8',
      mode: FILE_PERMISSIONS.CONFIG,
    });
    writtenPaths.add(resolvedPath);
  }

  const gitignorePath = ensureGitignoreEntries(
    projectRoot,
    gitignoreEntries.size > 0 ? NOESIS_CONTEXT_GITIGNORE_ENTRIES : [],
  );
  if (gitignorePath) {
    writtenPaths.add(gitignorePath);
  }

  return [...writtenPaths];
}

function parseInboxAdapterId(filename: string): string | null {
  const stem = filename.replace(/\.[^.]+$/, '');
  const candidate = stem.split('--')[0].trim();
  return candidate.length > 0 ? candidate : null;
}

function collectInboxEntries(adapterIds: string[], inboxDir: string = INBOX_DIR): InboxEntry[] {
  if (!existsSync(inboxDir)) {
    return [];
  }

  const entries: InboxEntry[] = [];
  const adapterSet = new Set(adapterIds);

  for (const dirent of readdirSync(inboxDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (dirent.name === 'processed') continue;

    if (dirent.isDirectory()) {
      const adapterId = dirent.name;
      if (!adapterSet.has(adapterId)) continue;

      const adapterDir = join(inboxDir, adapterId);
      for (const file of readdirSync(adapterDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!file.isFile()) continue;
        const sourcePath = join(adapterDir, file.name);
        entries.push(createInboxEntry(adapterId, readFileSync(sourcePath, 'utf-8'), sourcePath));
      }
      continue;
    }

    if (!dirent.isFile()) continue;

    const adapterId = parseInboxAdapterId(dirent.name);
    if (!adapterId || !adapterSet.has(adapterId)) continue;

    const sourcePath = join(inboxDir, dirent.name);
    entries.push(createInboxEntry(adapterId, readFileSync(sourcePath, 'utf-8'), sourcePath));
  }

  return entries;
}

function archiveInboxSource(sourcePath: string, processedInboxDir: string = PROCESSED_INBOX_DIR): void {
  if (!existsSync(sourcePath)) return;

  mkdirSync(processedInboxDir, {
    recursive: true,
    mode: FILE_PERMISSIONS.DIR,
  });

  const archivedPath = join(
    processedInboxDir,
    `${Date.now()}-${basename(sourcePath)}`,
  );
  renameSync(sourcePath, archivedPath);
}

function buildLearningMemoryInput(
  learning: ParsedLearning,
  entry: InboxEntry,
  projectId: string | null,
): {
  type: 'lesson' | 'preference' | 'task';
  title: string;
  content: string;
  tags: string[];
  project_id: string | null;
  scope: 'project' | 'global';
  source: string;
  confidence: number;
} {
  if (learning.type === 'correction' || learning.type === 'lesson') {
    return {
      type: 'lesson',
      title: learning.type === 'correction' ? `Correction: ${learning.title}` : learning.title,
      content: JSON.stringify({
        trigger: `adapter_writeback:${entry.adapterId}`,
        original_approach: learning.type === 'correction' ? 'Superseded approach captured from adapter artifact' : 'Adapter-captured learning',
        corrected_approach: learning.content,
        root_cause: `Ingested from ${entry.adapterId} write-back`,
        applicable_when: 'When similar adapter-captured behavior or correction appears again',
      }),
      tags: [...learning.tags, learning.type, 'writeback'],
      project_id: projectId,
      scope: projectId ? 'project' : 'global',
      source: `adapter:${entry.adapterId}`,
      confidence: learning.confidence,
    };
  }

  return {
    type: learning.type,
    title: learning.title,
    content: learning.content,
    tags: [...learning.tags, 'writeback'],
    project_id: projectId,
    scope: projectId ? 'project' : 'global',
    source: `adapter:${entry.adapterId}`,
    confidence: learning.confidence,
  };
}

async function ingestInboxEntries(
  deps: RuntimeSyncDependencies,
  adapterIds: string[],
  projectId: string | null,
  dryRun: boolean,
): Promise<IngestResult> {
  const entries = collectInboxEntries(adapterIds, deps.inboxDir);

  if (entries.length === 0) {
    return {
      entriesFound: 0,
      entriesProcessed: 0,
      entriesSkipped: 0,
      memoriesCreated: 0,
      errors: [],
    };
  }

  let entriesProcessed = 0;
  let entriesSkipped = 0;
  let memoriesCreated = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      const learnings = parseInboxContent(entry.content, entry.adapterId);
      if (learnings.length === 0) {
        entriesSkipped++;
        if (!dryRun) {
          archiveInboxSource(entry.source, deps.processedInboxDir);
        }
        continue;
      }

      let entryHadError = false;
      for (const learning of learnings) {
        if (dryRun) {
          memoriesCreated++;
          continue;
        }

        const input = buildLearningMemoryInput(learning, entry, projectId);
        const result: WritePipelineResult = await executeWritePipeline({
          db: deps.db,
          input: {
            input,
            confirmed: true,
          },
          config: { secret_scan_mode: 'redact' },
          signMemory: deps.signMemory,
          scanAndRedact: deps.scanAndRedact,
          checkDangerousPatterns: deps.checkDangerousPatterns,
          createMemory,
          writeAuditLog: deps.writeAuditLog,
          emitEvent: deps.emitEvent,
          generateId: deps.generateId,
          embeddingProvider: deps.embeddingProvider,
        });

        if (result.success && result.memory) {
          memoriesCreated++;
          continue;
        }

        if (result.duplicateOf) {
          continue;
        }

        entryHadError = true;
        errors.push(
          `Inbox ${entry.source}: ${result.error ?? 'write pipeline did not persist learning'}`,
        );
      }

      if (!dryRun && !entryHadError) {
        archiveInboxSource(entry.source, deps.processedInboxDir);
      }

      entriesProcessed++;
    } catch (err) {
      errors.push(`Inbox ${entry.source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    entriesFound: entries.length,
    entriesProcessed,
    entriesSkipped,
    memoriesCreated,
    errors,
  };
}

export async function runRuntimeSync(
  deps: RuntimeSyncDependencies,
  options: SyncOptions & {
    projectRoot?: string;
    projectId?: string | null;
  },
): Promise<RuntimeSyncResult> {
  const check = canSync(options);
  if (!check.allowed) {
    throw new Error(check.reason ?? 'Sync is currently rate limited.');
  }

  const startTime = Date.now();
  const scope = resolveProjectScope(deps.db, options.projectRoot, options.projectId ?? null);
  const detected = await detectTargets(scope.projectRoot, options.adapterFilter);
  const plan = createSyncPlan(detected.map((item) => item.target));

  if (detected.length === 0) {
    return {
      status: 'no_targets',
      projectId: scope.projectId,
      projectRoot: scope.projectRoot,
      plan,
      writeback: {
        entriesFound: 0,
        entriesProcessed: 0,
        entriesSkipped: 0,
        memoriesCreated: 0,
        errors: [],
      },
      ...aggregateResults(plan.id, [], startTime),
    };
  }

  const maxBudget = Math.max(...detected.map((item) => item.target.maxContextTokens));
  const context = await buildUniversalContext(deps, scope, maxBudget);
  const outcomes: SyncOutcome[] = [];

  for (const { adapter, target } of detected) {
    const adapterStart = Date.now();
    try {
      const syncResult = await adapter.transform(
        context,
        createTokenBudget(target.maxContextTokens),
      );
      const writtenPaths = options.dryRun
        ? syncResult.fileWrites.map((write) => validatePath(write.path, scope.projectRoot))
        : applyFileWrites(scope.projectRoot, syncResult.fileWrites);

      outcomes.push({
        adapterId: adapter.id,
        tokensInjected: syncResult.tokensUsed,
        tokensBudget: target.maxContextTokens,
        filesWritten: options.dryRun ? 0 : writtenPaths.length,
        errors: [],
        durationMs: Date.now() - adapterStart,
        writtenPaths,
      });
    } catch (err) {
      outcomes.push({
        adapterId: adapter.id,
        tokensInjected: 0,
        tokensBudget: target.maxContextTokens,
        filesWritten: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        durationMs: Date.now() - adapterStart,
      });
    }
  }

  const writeback = await ingestInboxEntries(
    deps,
    detected.filter((item) => item.target.canWriteBack).map((item) => item.adapter.id),
    scope.projectId,
    options.dryRun === true,
  );

  if (options.dryRun !== true) {
    recordSync();
  }

  return {
    status: options.dryRun === true ? 'dry_run' : 'completed',
    projectId: scope.projectId,
    projectRoot: scope.projectRoot,
    plan,
    writeback,
    ...aggregateResults(plan.id, outcomes, startTime),
  };
}
