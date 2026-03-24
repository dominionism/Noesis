/**
 * Learning Loop — Structured Failure Diagnosis
 *
 * NEW for Noesis. Implements structured failure diagnosis with:
 * - Root cause analysis
 * - Lesson capture as memories
 * - Causal chain recording in the knowledge graph
 * - Prevention rule extraction
 *
 * This is the bridge between Agent Workflow's learning-loop.md rules
 * and UAWL's persistent memory store. When a failure occurs, this module
 * captures the full diagnostic chain — not just the lesson, but the
 * reasoning path that led to the failure.
 */

import type { DatabaseConnection } from '../core/database.js';
import type {
  FailureClass,
  LearningEvent,
  LearningEventInput,
  LearningTriggerType,
  Memory,
  MemoryInput,
} from '../types.js';
import { generateId } from '../core/ulid.js';
import { createMemory } from '../core/memory-crud.js';
import { createTypedEdge } from '../graph/edges.js';
import type { EdgeRelation } from '../constants.js';

/**
 * Structured failure report that agents provide when a failure is detected.
 */
export interface FailureReport {
  /** What happened */
  description: string;
  /** Why it happened (root cause analysis) */
  rootCause: string;
  /** How to prevent it in the future */
  preventionRule: string;
  /** What triggered the learning event */
  triggerType: LearningTriggerType;
  /** Categorized failure type */
  failureClass?: FailureClass;
  /** Memory IDs that form the causal chain leading to this failure */
  causalChainIds?: string[];
  /** Project context */
  projectId?: string;
  /** Tags for the lesson memory */
  tags?: string[];
}

/**
 * Result of capturing a learning event.
 */
export interface LearningCaptureResult {
  /** The lesson memory that was created */
  lessonMemory: Memory;
  /** The learning event record */
  learningEvent: LearningEvent;
  /** Number of causal edges created */
  causalEdgesCreated: number;
}

/**
 * Capture a structured learning event from a failure.
 *
 * This function:
 * 1. Creates a lesson memory with the failure description and prevention rule
 * 2. Records a learning_events entry with root cause and causal chain
 * 3. Creates causal edges in the knowledge graph linking the chain
 * 4. Creates 'corrects' edges from the lesson to the failed memories
 *
 * All operations are wrapped in a transaction for atomicity.
 */
export function captureLesson(
  db: DatabaseConnection,
  report: FailureReport,
  signMemory: (input: {
    id: string;
    type: string;
    title: string;
    content: string;
    project_id: string | null;
  }) => string,
): LearningCaptureResult {
  const memoryId = generateId();
  const eventId = generateId();
  const now = new Date().toISOString();

  const content = [
    `## Failure`,
    report.description,
    '',
    `## Root Cause`,
    report.rootCause,
    '',
    `## Prevention`,
    report.preventionRule,
  ].join('\n');

  const title = `Lesson: ${report.description.slice(0, 80)}`;
  const projectId = report.projectId ?? null;

  const signature = signMemory({
    id: memoryId,
    type: 'lesson',
    title,
    content,
    project_id: projectId,
  });

  let lessonMemory: Memory;
  let learningEvent: LearningEvent;
  let causalEdgesCreated = 0;

  const runTransaction = db.transaction(() => {
    // Step 1: Create lesson memory
    const memoryInput: MemoryInput & { signature: string } = {
      type: 'lesson',
      title,
      content,
      tags: report.tags ?? ['lesson', 'failure-analysis'],
      project_id: projectId,
      scope: 'project',
      sensitivity: 'INTERNAL',
      confidence: 0.5,
      source: 'learning_loop',
      signature,
    };

    lessonMemory = createMemory(db, memoryInput, memoryId);

    // Step 2: Record learning event
    const causalChainJson = report.causalChainIds
      ? JSON.stringify(report.causalChainIds)
      : null;

    db.prepare<[string, string, string, string | null, string | null, string | null, string | null, number, string]>(`
      INSERT INTO learning_events (id, memory_id, trigger_type, failure_class, root_cause, prevention_rule, causal_chain, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      memoryId,
      report.triggerType,
      report.failureClass ?? null,
      report.rootCause,
      report.preventionRule,
      causalChainJson,
      0.5,
      now,
    );

    learningEvent = {
      id: eventId,
      memory_id: memoryId,
      trigger_type: report.triggerType,
      failure_class: report.failureClass ?? null,
      root_cause: report.rootCause,
      prevention_rule: report.preventionRule,
      causal_chain: causalChainJson,
      confidence: 0.5,
      project_id: projectId,
      created_at: now,
    };

    // Step 3: Create causal edges from the chain
    if (report.causalChainIds && report.causalChainIds.length >= 2) {
      const chain = report.causalChainIds;
      for (let i = 0; i < chain.length - 1; i++) {
        try {
          createTypedEdge(db, {
            source_id: chain[i],
            target_id: chain[i + 1],
            relation: 'causes' as EdgeRelation,
            weight: 0.8,
          });
          causalEdgesCreated++;
        } catch {
          // Edge may already exist or endpoint may be missing — skip
        }
      }
    }

    // Step 4: Create 'corrects' edges from lesson to failed memories in chain
    if (report.causalChainIds) {
      for (const failedId of report.causalChainIds) {
        try {
          createTypedEdge(db, {
            source_id: memoryId,
            target_id: failedId,
            relation: 'corrects' as EdgeRelation,
            weight: 0.9,
          });
          causalEdgesCreated++;
        } catch {
          // Edge may already exist or endpoint may be missing — skip
        }
      }
    }
  });

  runTransaction();

  return {
    lessonMemory: lessonMemory!,
    learningEvent: learningEvent!,
    causalEdgesCreated,
  };
}

/**
 * Query learning events by failure class for pattern analysis.
 */
export function getLearningEventsByClass(
  db: DatabaseConnection,
  failureClass: string,
  limit: number = 20,
): LearningEvent[] {
  return db.prepare<[string, number], LearningEvent>(
    `SELECT * FROM learning_events
     WHERE failure_class = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(failureClass, limit);
}

/**
 * Get recent learning events for a project.
 */
export function getRecentLearningEvents(
  db: DatabaseConnection,
  projectId?: string,
  limit: number = 10,
): LearningEvent[] {
  if (projectId) {
    return db.prepare<[string, number], LearningEvent>(
      `SELECT le.* FROM learning_events le
       JOIN memories m ON le.memory_id = m.id
       WHERE m.project_id = ?
       ORDER BY le.created_at DESC
       LIMIT ?`,
    ).all(projectId, limit);
  }

  return db.prepare<[number], LearningEvent>(
    `SELECT * FROM learning_events
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(limit);
}
