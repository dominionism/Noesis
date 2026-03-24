/**
 * Post-Seed Embedding Pass
 *
 * After cognitive entities are seeded, this module computes embeddings
 * for any entities that lack them. This enables semantic matching in
 * the rule engine (3-pass: keyword + semantic + category), expert
 * router (3-factor: triggers + semantic + performance), capsule engine,
 * and skill matcher.
 *
 * Idempotent: only processes entities where embedding IS NULL.
 * Non-fatal: embedding failures are logged but do not stop the daemon.
 */

import type { DatabaseConnection } from '../core/database.js';
import type { SignFn } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmbeddableEntity {
  id: string;
  content: string;
}

export interface EmbedPassResult {
  rules: number;
  experts: number;
  capsules: number;
  skills: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute and store embeddings for all cognitive entities that lack them.
 *
 * @param db - Database connection
 * @param sign - HMAC signing function (required for store updates)
 * @returns Count of entities embedded per type
 */
export async function embedSeededEntities(
  db: DatabaseConnection,
  sign: SignFn,
): Promise<EmbedPassResult> {
  const result: EmbedPassResult = { rules: 0, experts: 0, capsules: 0, skills: 0, errors: 0 };

  // Dynamic import: embedding provider is optional
  let embed: (text: string) => Promise<Float32Array>;
  try {
    const { createArcticProvider } = await import('../embedding/arctic.js');
    const provider = await createArcticProvider();
    embed = (text: string) => provider.embed(text);
  } catch {
    // Embedding subsystem unavailable — nothing to do
    return result;
  }

  // Rules
  const nullRules = db.prepare<[], EmbeddableEntity>(
    'SELECT id, content FROM rules WHERE embedding IS NULL AND enabled = 1',
  ).all();

  for (const entity of nullRules) {
    try {
      const embedding = await embed(entity.content);
      const buf = Buffer.from(embedding.buffer);
      db.prepare<[Buffer, string]>(
        'UPDATE rules SET embedding = ?, updated_at = datetime(\'now\') WHERE id = ?',
      ).run(buf, entity.id);
      result.rules++;
    } catch {
      result.errors++;
    }
  }

  // Experts
  const nullExperts = db.prepare<[], EmbeddableEntity>(
    'SELECT id, content FROM experts WHERE embedding IS NULL AND enabled = 1',
  ).all();

  for (const entity of nullExperts) {
    try {
      const embedding = await embed(entity.content);
      const buf = Buffer.from(embedding.buffer);
      db.prepare<[Buffer, string]>(
        'UPDATE experts SET embedding = ?, updated_at = datetime(\'now\') WHERE id = ?',
      ).run(buf, entity.id);
      result.experts++;
    } catch {
      result.errors++;
    }
  }

  // Capsules (embed the description field from deep_capsules)
  const nullCapsules = db.prepare<[], { id: string; content: string }>(
    'SELECT id, description AS content FROM deep_capsules WHERE embedding IS NULL AND enabled = 1',
  ).all();

  for (const entity of nullCapsules) {
    try {
      const embedding = await embed(entity.content);
      const buf = Buffer.from(embedding.buffer);
      db.prepare<[Buffer, string]>(
        'UPDATE deep_capsules SET embedding = ?, updated_at = datetime(\'now\') WHERE id = ?',
      ).run(buf, entity.id);
      result.capsules++;
    } catch {
      result.errors++;
    }
  }

  // Skills
  const nullSkills = db.prepare<[], EmbeddableEntity>(
    'SELECT id, content FROM executable_skills WHERE embedding IS NULL AND enabled = 1',
  ).all();

  for (const entity of nullSkills) {
    try {
      const embedding = await embed(entity.content);
      const buf = Buffer.from(embedding.buffer);
      db.prepare<[Buffer, string]>(
        'UPDATE executable_skills SET embedding = ?, updated_at = datetime(\'now\') WHERE id = ?',
      ).run(buf, entity.id);
      result.skills++;
    } catch {
      result.errors++;
    }
  }

  return result;
}
