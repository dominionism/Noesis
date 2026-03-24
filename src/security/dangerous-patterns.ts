/**
 * Dangerous Pattern Detection
 *
 * Scans text for patterns that indicate an attempt to weaken, bypass,
 * or disable security controls. This module acts as a guardrail in the
 * memory write pipeline.
 *
 * This check cannot be disabled (invariant 4). There is no configuration
 * flag, environment variable, or code path that bypasses dangerous
 * pattern detection.
 */

import type { DangerousMatch } from '../types.js';

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface DangerousPatternDef {
  label: string;
  regex: RegExp;
}

const DANGEROUS_PATTERNS: readonly DangerousPatternDef[] = Object.freeze([
  { label: 'disable_ssl', regex: /disable\s*[._-]?\s*ssl/gi },
  { label: 'disable_verification', regex: /disable\s*[._-]?\s*verification/gi },
  { label: 'eval_in_instruction', regex: /eval\s*\(/gi },
  { label: 'skip_auth', regex: /skip\s*[._-]?\s*auth/gi },
  { label: 'no_validation', regex: /no\s*[._-]?\s*validation/gi },
  { label: 'no_verify_flag', regex: /--no-verify/gi },
  { label: 'chmod_777', regex: /chmod\s+777/gi },
  { label: 'disable_security', regex: /disable\s*[._-]?\s*security/gi },
  { label: 'remove_auth', regex: /remove\s*[._-]?\s*auth(?:entication|orization)?/gi },
  { label: 'bypass_security', regex: /bypass\s*[._-]?\s*security/gi },
  { label: 'disable_firewall', regex: /disable\s*[._-]?\s*firewall/gi },
  { label: 'trust_all_certs', regex: /trust\s*[._-]?\s*all\s*[._-]?\s*cert(?:ificate)?s?/gi },
  { label: 'node_tls_reject_unauthorized', regex: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?/gi },
  { label: 'insecure_flag', regex: /--insecure\b/gi },
  { label: 'allow_http', regex: /allow\s*[._-]?\s*http\b/gi },
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function checkDangerousPatterns(text: string): DangerousMatch[] {
  const matches: DangerousMatch[] = [];

  for (const patternDef of DANGEROUS_PATTERNS) {
    const regex = new RegExp(patternDef.regex.source, patternDef.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        pattern: patternDef.label,
        position: match.index,
        matched: match[0],
      });
    }
  }

  matches.sort((a, b) => a.position - b.position);
  return matches;
}
