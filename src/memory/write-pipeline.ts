/**
 * Memory Write Pipeline
 *
 * Orchestrates the full write path for persisting a new memory record.
 * Every memory passes through this pipeline before reaching the database.
 *
 * Pipeline steps:
 * 1. Secret scanning — detect and optionally redact embedded secrets
 * 2. Dangerous pattern check — flag security-weakening content
 * 3. Content classification — assign sensitivity level
 * 4. ID generation — create a ULID
 * 5. HMAC signing — compute tamper-evident signature
 * 6. Schema validation — verify required fields
 * 7. Embedding computation — generate vector embedding for semantic retrieval
 * 8. Deduplication check — detect near-duplicate memories before INSERT
 * 9. SQLite INSERT — persist via createMemory
 * 10. Audit log — record the MEMORY_WRITE event
 * 11. Event emission — notify subscribers
 *
 * Security:
 * - A02: HMAC signing ensures integrity
 * - A03: Content scanned for secrets before persistence
 * - A04: Dangerous pattern check prevents stored security weakening
 * - A08: HMAC signature covers identity fields
 * - A09: Every write is audit-logged with content hash (never raw content)
 */

import { createHash } from 'node:crypto';

import { DEDUP_COSINE_THRESHOLD, DEDUP_JACCARD_THRESHOLD } from '../constants.js';
import type { DatabaseConnection } from '../core/database.js';
import type {
  EmbeddingProvider,
  MemoryInput,
  Memory,
  WritePipelineResult,
  WritePipelineInput,
  DangerousMatch,
  ScanResult,
  AuditEntry,
  NoesisEvent,
  Sensitivity,
} from '../types.js';

export interface WritePipelineParams {
  db: DatabaseConnection;
  input: WritePipelineInput;
  config: { secret_scan_mode: 'warn' | 'redact' };
  signMemory: (memory: {
    id: string;
    type: string;
    title: string;
    content: string;
    project_id: string | null;
  }) => string;
  scanAndRedact: (text: string) => ScanResult;
  checkDangerousPatterns: (text: string) => DangerousMatch[];
  createMemory: (db: DatabaseConnection, memory: MemoryInput & { signature: string }, preGeneratedId?: string) => Memory;
  writeAuditLog: (entry: Omit<AuditEntry, 'timestamp'>) => void;
  emitEvent?: (event: NoesisEvent) => void;
  generateId: () => string;
  /** Optional embedding provider — when supplied, embeddings are computed and stored with the memory. */
  embeddingProvider?: EmbeddingProvider;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function cosineSimilarity(a: Buffer, b: Buffer): number {
  const va = new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  const vb = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < va.length; i++) {
    dot += va[i] * vb[i];
    normA += va[i] * va[i];
    normB += vb[i] * vb[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface ExistingMemoryRow {
  id: string;
  title: string;
  content: string;
  embedding: Buffer | null;
  project_id: string | null;
}

function classifyContent(input: MemoryInput, projectSensitivity?: Sensitivity): Sensitivity {
  if (input.sensitivity) return input.sensitivity;
  return projectSensitivity ?? 'INTERNAL';
}

export async function executeWritePipeline(
  params: WritePipelineParams,
): Promise<WritePipelineResult> {
  const {
    db,
    input: pipelineInput,
    config,
    signMemory,
    scanAndRedact,
    checkDangerousPatterns,
    createMemory,
    writeAuditLog,
    emitEvent,
    generateId,
  } = params;

  const memoryInput = pipelineInput.input;
  let title = memoryInput.title;
  let content = memoryInput.content;
  let secretsRedacted = false;

  // Step 1: Secret scanning
  const titleScan = scanAndRedact(title);
  const contentScan = scanAndRedact(content);

  if (config.secret_scan_mode === 'redact') {
    if (titleScan.redacted) {
      title = titleScan.clean;
      secretsRedacted = true;
    }
    if (contentScan.redacted) {
      content = contentScan.clean;
      secretsRedacted = true;
    }
  } else {
    if (titleScan.redacted || contentScan.redacted) {
      secretsRedacted = false;
      try {
        writeAuditLog({
          event_type: 'SECURITY_EVENT',
          content_hash: sha256(content),
          source: 'system',
          details: {
            action: 'secret_scan_warn',
            title_matches: titleScan.matches.length,
            content_matches: contentScan.matches.length,
          },
        });
      } catch { /* non-fatal */ }
    }
  }

  // Step 2: Dangerous pattern check
  const dangerousMatches = checkDangerousPatterns(content);
  if (dangerousMatches.length > 0 && !pipelineInput.confirmed) {
    return {
      success: false,
      confirmationRequired: true,
      dangerousMatches,
      secretsRedacted,
    };
  }

  // Step 3: Content classification
  const sensitivity = classifyContent(memoryInput);

  // Step 4: Generate ID
  const id = generateId();

  // Step 5: HMAC signing
  const signature = signMemory({
    id,
    type: memoryInput.type,
    title,
    content,
    project_id: memoryInput.project_id ?? null,
  });

  // Step 6: Schema validation
  if (!memoryInput.type) {
    return { success: false, error: 'Missing required field: type' };
  }
  if (!title || title.length === 0) {
    return { success: false, error: 'Missing required field: title' };
  }
  if (content === undefined || content === null) {
    return { success: false, error: 'Missing required field: content' };
  }

  // Step 7: Embedding computation (non-fatal — fallback to no embedding)
  let embedding: Buffer | null = null;
  let embeddingModel: string | null = null;

  if (params.embeddingProvider) {
    try {
      const embeddingText = title + ' ' + content;
      const vector = await params.embeddingProvider.embed(embeddingText);
      embedding = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
      embeddingModel = params.embeddingProvider.modelId;
    } catch (embErr: unknown) {
      const msg = embErr instanceof Error ? embErr.message : String(embErr);
      process.stderr.write(`[noesis:write-pipeline] Embedding computation failed: ${msg}\n`);
      // Continue without embedding — memory is still stored, just without vector search
    }
  }

  // Step 8: Write-time deduplication check
  if (!pipelineInput.confirmed && typeof db.prepare === 'function') {
    try {
      const projectId = memoryInput.project_id ?? null;

      // Query existing memories in the same project scope
      const existingSQL = projectId !== null
        ? 'SELECT id, title, content, embedding, project_id FROM memories WHERE status = \'active\' AND (project_id = ? OR project_id IS NULL)'
        : 'SELECT id, title, content, embedding, project_id FROM memories WHERE status = \'active\'';

      const existingStmt = db.prepare<unknown[], ExistingMemoryRow>(existingSQL);
      const existingRows = projectId !== null
        ? existingStmt.all(projectId)
        : existingStmt.all();

      const newText = title + ' ' + content;

      for (const existing of existingRows) {
        // Cosine similarity check (if both have embeddings)
        let cosine = 0;
        if (embedding !== null && existing.embedding !== null) {
          cosine = cosineSimilarity(embedding, existing.embedding);
        }

        // Jaccard word overlap check (always available)
        const existingText = existing.title + ' ' + existing.content;
        const jaccard = jaccardSimilarity(newText, existingText);

        // Tiered dedup:
        //   Very high cosine (>= 0.92): duplicate regardless of Jaccard
        //     (semantic near-identity — covers subsets and paraphrases)
        //   High cosine (>= threshold): require Jaccard confirmation
        //   Very high Jaccard (>= 0.90): duplicate regardless of cosine
        //     (near-identical text — catches cases without embeddings)
        const isDuplicate =
          cosine >= 0.92 ||
          (cosine >= DEDUP_COSINE_THRESHOLD && jaccard >= DEDUP_JACCARD_THRESHOLD) ||
          jaccard >= 0.90;

        if (isDuplicate) {
          return {
            success: false,
            confirmationRequired: true,
            secretsRedacted,
            duplicateOf: {
              id: existing.id,
              title: existing.title,
              cosineSimilarity: cosine,
              jaccardSimilarity: jaccard,
            },
          };
        }
      }
    } catch { /* dedup check failure is non-fatal — proceed with write */ }
  }

  // Step 9: SQLite INSERT (pass pre-generated ID so it matches the HMAC signature)
  const memory = createMemory(db, {
    ...memoryInput,
    title,
    content,
    sensitivity,
    signature,
    embedding,
    embedding_model: embeddingModel,
  }, id);

  // Step 10: Audit log
  try {
    writeAuditLog({
      event_type: 'MEMORY_WRITE',
      content_hash: sha256(content),
      memory_id: memory.id,
      source: 'agent',
      details: {
        type: memory.type,
        scope: memory.scope,
        sensitivity: memory.sensitivity,
        project_id: memory.project_id,
        secrets_redacted: secretsRedacted,
        dangerous_patterns_confirmed: dangerousMatches.length > 0,
      },
    });
  } catch { /* non-fatal */ }

  // Step 11: Event emission
  if (emitEvent) {
    try {
      emitEvent({
        type: 'memory_written',
        payload: {
          id: memory.id,
          type: memory.type,
          project_id: memory.project_id,
          scope: memory.scope,
        },
      });
    } catch { /* non-fatal */ }
  }

  return { success: true, memory, secretsRedacted };
}
