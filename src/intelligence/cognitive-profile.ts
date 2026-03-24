/**
 * Cognitive Profile
 *
 * Builds and maintains a model of the user's expertise, learning style,
 * blind spots, preference patterns, and work patterns. Used to tailor
 * all interactions to the specific user.
 *
 * Profile Dimensions:
 * 1. Expertise Map — what the user knows well vs learning
 * 2. Learning Style — code examples vs explanations, deep-dive vs summary
 * 3. Blind Spots — recurring mistake patterns
 * 4. Preference Patterns — technology and style preferences
 * 5. Work Patterns — active hours, session duration, complexity preference
 *
 * Storage: 'preference' type memories tagged 'cognitive_profile'.
 * Updated incrementally, never requiring a full recompute.
 */

// ===========================================================================
// Types
// ===========================================================================

export interface ExpertiseEntry {
  domain: string;
  level: 'expert' | 'proficient' | 'learning' | 'novice';
  correctionCount: number;
  successCount: number;
  lastUpdated: string;
}

export interface LearningStyle {
  prefersCodeExamples: number;    // 0-1, higher = prefers code
  prefersDeepDive: number;        // 0-1, higher = prefers deep dive
  prefersOptions: number;         // 0-1, higher = prefers options over recommendations
  prefersVerbose: number;         // 0-1, higher = prefers verbose
  sampleCount: number;
}

export interface BlindSpot {
  domain: string;
  pattern: string;
  occurrenceCount: number;
  lastOccurred: string;
}

export interface PreferencePattern {
  category: 'technology' | 'style' | 'workflow';
  key: string;
  value: string;
  strength: number; // 0-1
  observationCount: number;
}

export interface WorkPattern {
  activeHours: number[];          // Hours of day (0-23) with activity
  avgSessionDurationMs: number;
  sessionCount: number;
  preferredComplexity: 'simple' | 'moderate' | 'complex';
  taskTypeDistribution: Record<string, number>;
}

export interface CognitiveProfile {
  expertise: ExpertiseEntry[];
  learningStyle: LearningStyle;
  blindSpots: BlindSpot[];
  preferences: PreferencePattern[];
  workPatterns: WorkPattern;
  lastUpdated: string;
}

export interface CorrectionEvent {
  domain: string;
  originalApproach: string;
  correctedApproach: string;
  timestamp: string;
}

export interface TaskCompletionEvent {
  domain: string;
  taskType: string;
  success: boolean;
  durationMs: number;
  timestamp: string;
}

export interface SessionEvent {
  startHour: number;
  durationMs: number;
  taskTypes: string[];
  correctionCount: number;
  acceptedSuggestions: number;
  timestamp: string;
}

export interface ResponseFeedback {
  hadCodeExamples: boolean;
  wasDeepDive: boolean;
  presentedOptions: boolean;
  wasVerbose: boolean;
  accepted: boolean;
}

// ===========================================================================
// Default values
// ===========================================================================

function defaultLearningStyle(): LearningStyle {
  return {
    prefersCodeExamples: 0.5,
    prefersDeepDive: 0.5,
    prefersOptions: 0.5,
    prefersVerbose: 0.5,
    sampleCount: 0,
  };
}

function defaultWorkPattern(): WorkPattern {
  return {
    activeHours: [],
    avgSessionDurationMs: 0,
    sessionCount: 0,
    preferredComplexity: 'moderate',
    taskTypeDistribution: {},
  };
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Create an empty cognitive profile.
 */
export function createProfile(): CognitiveProfile {
  return {
    expertise: [],
    learningStyle: defaultLearningStyle(),
    blindSpots: [],
    preferences: [],
    workPatterns: defaultWorkPattern(),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Update expertise based on a correction event.
 *
 * Corrections indicate lower expertise; clusters of corrections
 * in the same domain indicate blind spots.
 */
export function updateFromCorrection(
  profile: CognitiveProfile,
  event: CorrectionEvent,
): CognitiveProfile {
  const updated = structuredClone(profile);

  let entry = updated.expertise.find((e) => e.domain === event.domain);
  if (!entry) {
    entry = {
      domain: event.domain,
      level: 'learning',
      correctionCount: 0,
      successCount: 0,
      lastUpdated: event.timestamp,
    };
    updated.expertise.push(entry);
  }

  entry.correctionCount++;
  entry.lastUpdated = event.timestamp;
  entry.level = computeExpertiseLevel(entry.successCount, entry.correctionCount);

  // Check for blind spot
  const blindSpotThreshold = 3;
  if (entry.correctionCount >= blindSpotThreshold) {
    let spot = updated.blindSpots.find((b) => b.domain === event.domain);
    if (!spot) {
      spot = {
        domain: event.domain,
        pattern: event.originalApproach,
        occurrenceCount: 0,
        lastOccurred: event.timestamp,
      };
      updated.blindSpots.push(spot);
    }
    spot.occurrenceCount++;
    spot.lastOccurred = event.timestamp;
    spot.pattern = event.originalApproach;
  }

  updated.lastUpdated = event.timestamp;
  return updated;
}

/**
 * Update expertise based on a task completion event.
 */
export function updateFromTaskCompletion(
  profile: CognitiveProfile,
  event: TaskCompletionEvent,
): CognitiveProfile {
  const updated = structuredClone(profile);

  let entry = updated.expertise.find((e) => e.domain === event.domain);
  if (!entry) {
    entry = {
      domain: event.domain,
      level: 'learning',
      correctionCount: 0,
      successCount: 0,
      lastUpdated: event.timestamp,
    };
    updated.expertise.push(entry);
  }

  if (event.success) {
    entry.successCount++;
  }
  entry.lastUpdated = event.timestamp;
  entry.level = computeExpertiseLevel(entry.successCount, entry.correctionCount);

  updated.lastUpdated = event.timestamp;
  return updated;
}

/**
 * Update learning style from response feedback.
 *
 * Uses exponential moving average to avoid recency bias.
 */
export function updateLearningStyle(
  profile: CognitiveProfile,
  feedback: ResponseFeedback,
): CognitiveProfile {
  const updated = structuredClone(profile);
  const style = updated.learningStyle;
  const alpha = 0.2; // EMA smoothing factor

  if (feedback.accepted) {
    style.prefersCodeExamples = ema(style.prefersCodeExamples, feedback.hadCodeExamples ? 1 : 0, alpha);
    style.prefersDeepDive = ema(style.prefersDeepDive, feedback.wasDeepDive ? 1 : 0, alpha);
    style.prefersOptions = ema(style.prefersOptions, feedback.presentedOptions ? 1 : 0, alpha);
    style.prefersVerbose = ema(style.prefersVerbose, feedback.wasVerbose ? 1 : 0, alpha);
  } else {
    // Rejected: move away from the presented style
    style.prefersCodeExamples = ema(style.prefersCodeExamples, feedback.hadCodeExamples ? 0 : 1, alpha);
    style.prefersDeepDive = ema(style.prefersDeepDive, feedback.wasDeepDive ? 0 : 1, alpha);
    style.prefersOptions = ema(style.prefersOptions, feedback.presentedOptions ? 0 : 1, alpha);
    style.prefersVerbose = ema(style.prefersVerbose, feedback.wasVerbose ? 0 : 1, alpha);
  }

  style.sampleCount++;
  updated.lastUpdated = new Date().toISOString();
  return updated;
}

/**
 * Update work patterns from a session event.
 */
export function updateWorkPatterns(
  profile: CognitiveProfile,
  session: SessionEvent,
): CognitiveProfile {
  const updated = structuredClone(profile);
  const wp = updated.workPatterns;

  // Track active hours
  if (!wp.activeHours.includes(session.startHour)) {
    wp.activeHours.push(session.startHour);
    wp.activeHours.sort((a, b) => a - b);
  }

  // Update average session duration (incremental mean)
  wp.sessionCount++;
  wp.avgSessionDurationMs += (session.durationMs - wp.avgSessionDurationMs) / wp.sessionCount;

  // Update task type distribution
  for (const taskType of session.taskTypes) {
    wp.taskTypeDistribution[taskType] = (wp.taskTypeDistribution[taskType] ?? 0) + 1;
  }

  updated.lastUpdated = session.timestamp;
  return updated;
}

/**
 * Add or update a preference pattern.
 */
export function updatePreference(
  profile: CognitiveProfile,
  category: PreferencePattern['category'],
  key: string,
  value: string,
): CognitiveProfile {
  const updated = structuredClone(profile);

  let pref = updated.preferences.find(
    (p) => p.category === category && p.key === key,
  );

  if (!pref) {
    pref = { category, key, value, strength: 0.5, observationCount: 0 };
    updated.preferences.push(pref);
  }

  if (pref.value === value) {
    // Reinforce existing preference
    pref.strength = Math.min(pref.strength + 0.1, 1.0);
  } else {
    // Different value: weaken and possibly replace
    pref.strength = Math.max(pref.strength - 0.2, 0);
    if (pref.strength <= 0.1) {
      pref.value = value;
      pref.strength = 0.3;
    }
  }

  pref.observationCount++;
  updated.lastUpdated = new Date().toISOString();
  return updated;
}

/**
 * Get expertise level for a domain.
 */
export function getExpertise(
  profile: CognitiveProfile,
  domain: string,
): ExpertiseEntry['level'] {
  const entry = profile.expertise.find((e) => e.domain === domain);
  return entry?.level ?? 'novice';
}

/**
 * Get active blind spots (domains with recurring mistakes).
 */
export function getBlindSpots(profile: CognitiveProfile): BlindSpot[] {
  return profile.blindSpots.filter((b) => b.occurrenceCount >= 3);
}

/**
 * Serialize the profile for storage.
 */
export function serializeProfile(profile: CognitiveProfile): string {
  return JSON.stringify(profile);
}

/**
 * Deserialize a stored profile.
 */
export function deserializeProfile(json: string): CognitiveProfile {
  return JSON.parse(json) as CognitiveProfile;
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function computeExpertiseLevel(
  successes: number,
  corrections: number,
): ExpertiseEntry['level'] {
  const total = successes + corrections;
  if (total === 0) return 'novice';

  const successRate = successes / total;

  if (total >= 10 && successRate >= 0.9) return 'expert';
  if (total >= 5 && successRate >= 0.7) return 'proficient';
  if (successes > 0) return 'learning';
  return 'novice';
}

function ema(previous: number, current: number, alpha: number): number {
  return alpha * current + (1 - alpha) * previous;
}
