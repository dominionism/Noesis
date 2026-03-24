/**
 * Secret Scanning Pipeline
 *
 * Scans text content for embedded secrets, API keys, tokens, and other
 * sensitive material before it is persisted to the memory layer.
 *
 * Scanning modes (configured via NoesisConfig.secret_scan_mode):
 * - 'warn'   -- Detect and report secrets but do not modify content
 * - 'redact' -- Detect and replace secrets with redaction markers
 *
 * There is intentionally no 'off' mode. Secret scanning cannot be
 * disabled (invariant 3).
 */

import { createHash } from 'node:crypto';

import type { SecretMatch, ScanResult } from '../types.js';

// ---------------------------------------------------------------------------
// Shannon entropy calculation
// ---------------------------------------------------------------------------

function shannonEntropy(str: string): number {
  if (str.length === 0) {
    return 0;
  }

  const freq = new Map<string, number>();
  for (const ch of str) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PatternDef {
  type: string;
  regex: RegExp;
}

const PATTERNS: readonly PatternDef[] = Object.freeze([
  { type: 'aws_access_key', regex: /AKIA[0-9A-Z]{16}/g },
  { type: 'github_token', regex: /gh[pos]_[A-Za-z0-9_]{36,}/g },
  { type: 'jwt', regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+/g },
  { type: 'pem_private_key', regex: /-----BEGIN[A-Z\s]*PRIVATE KEY-----/g },
  { type: 'connection_string', regex: /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:\s]+:[^@\s]+@[^\s]+/g },
  { type: 'generic_api_key', regex: /(?:api[_-]?key|api[_-]?secret|access[_-]?key|auth[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_\-/+]{20,}['"]?/gi },
]);

const SENSITIVE_KEYWORDS: readonly RegExp[] = Object.freeze([
  /\bkey\b/i, /\btoken\b/i, /\bsecret\b/i, /\bpassword\b/i,
  /\bpasswd\b/i, /\bapi[_-]?key\b/i, /\bauth\b/i,
  /\bcredential\b/i, /\baccess[_-]?key\b/i, /\bprivate[_-]?key\b/i,
]);

const MIN_ENTROPY_STRING_LENGTH = 20;
const MIN_ENTROPY_THRESHOLD = 4.5;
const CANDIDATE_STRING_REGEX = /[A-Za-z0-9+/=_-]{20,}/g;
const KEYWORD_PROXIMITY_WINDOW = 100;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sha256Prefix8(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex').slice(0, 8);
}

function overlaps(matches: SecretMatch[], position: number, length: number): boolean {
  const end = position + length;
  for (const m of matches) {
    const mEnd = m.position + m.length;
    if (position < mEnd && end > m.position) {
      return true;
    }
  }
  return false;
}

function isNearSensitiveKeyword(text: string, position: number): boolean {
  const windowStart = Math.max(0, position - KEYWORD_PROXIMITY_WINDOW);
  const windowEnd = Math.min(text.length, position + KEYWORD_PROXIMITY_WINDOW);
  const window = text.slice(windowStart, windowEnd);

  for (const kw of SENSITIVE_KEYWORDS) {
    if (kw.test(window)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scanForSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];

  for (const patternDef of PATTERNS) {
    const regex = new RegExp(patternDef.regex.source, patternDef.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const position = match.index;
      const matched = match[0];

      if (!overlaps(matches, position, matched.length)) {
        matches.push({ type: patternDef.type, position, length: matched.length, matched });
      }
    }
  }

  const candidateRegex = new RegExp(CANDIDATE_STRING_REGEX.source, CANDIDATE_STRING_REGEX.flags);
  let candidate: RegExpExecArray | null;

  while ((candidate = candidateRegex.exec(text)) !== null) {
    const candidateStr = candidate[0];
    const position = candidate.index;

    if (overlaps(matches, position, candidateStr.length)) continue;
    if (candidateStr.length < MIN_ENTROPY_STRING_LENGTH) continue;

    const entropy = shannonEntropy(candidateStr);
    if (entropy > MIN_ENTROPY_THRESHOLD && isNearSensitiveKeyword(text, position)) {
      matches.push({ type: 'high_entropy_secret', position, length: candidateStr.length, matched: candidateStr });
    }
  }

  matches.sort((a, b) => a.position - b.position);
  return matches;
}

export function redactSecrets(text: string, matches: SecretMatch[]): string {
  if (matches.length === 0) return text;

  const sorted = [...matches].sort((a, b) => b.position - a.position);
  let redacted = text;

  for (const match of sorted) {
    const prefix = sha256Prefix8(match.matched);
    const marker = `[REDACTED:${match.type}:${prefix}]`;
    redacted = redacted.slice(0, match.position) + marker + redacted.slice(match.position + match.length);
  }

  return redacted;
}

export function scanAndRedact(text: string): ScanResult {
  const matches = scanForSecrets(text);

  if (matches.length === 0) {
    return { clean: text, redacted: false, matches: [] };
  }

  return { clean: redactSecrets(text, matches), redacted: true, matches };
}
