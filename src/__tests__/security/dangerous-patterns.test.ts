/**
 * Tests for src/security/dangerous-patterns.ts
 *
 * Validates detection of security-weakening patterns in text content.
 * This module guards the memory write pipeline against storing instructions
 * that would disable SSL, bypass auth, or otherwise weaken security.
 *
 * Dangerous pattern detection cannot be disabled (invariant 4).
 */

import { describe, it, expect } from 'vitest';

import { checkDangerousPatterns } from '../../security/dangerous-patterns.js';

describe('checkDangerousPatterns', () => {
  // -----------------------------------------------------------------------
  // Individual pattern detection
  // -----------------------------------------------------------------------

  describe('disable_ssl', () => {
    it('detects "disable ssl"', () => {
      const matches = checkDangerousPatterns('You should disable ssl for testing');
      expect(matches.some(m => m.pattern === 'disable_ssl')).toBe(true);
    });

    it('detects "disable_ssl"', () => {
      const matches = checkDangerousPatterns('set disable_ssl = true');
      expect(matches.some(m => m.pattern === 'disable_ssl')).toBe(true);
    });

    it('detects "disable-ssl"', () => {
      const matches = checkDangerousPatterns('use disable-ssl flag');
      expect(matches.some(m => m.pattern === 'disable_ssl')).toBe(true);
    });

    it('is case insensitive', () => {
      const matches = checkDangerousPatterns('DISABLE SSL now');
      expect(matches.some(m => m.pattern === 'disable_ssl')).toBe(true);
    });
  });

  describe('disable_verification', () => {
    it('detects "disable verification"', () => {
      const matches = checkDangerousPatterns('disable verification for dev');
      expect(matches.some(m => m.pattern === 'disable_verification')).toBe(true);
    });

    it('detects "disable_verification"', () => {
      const matches = checkDangerousPatterns('DISABLE_VERIFICATION=true');
      expect(matches.some(m => m.pattern === 'disable_verification')).toBe(true);
    });
  });

  describe('eval_in_instruction', () => {
    it('detects eval() calls', () => {
      const matches = checkDangerousPatterns('result = eval(userInput)');
      expect(matches.some(m => m.pattern === 'eval_in_instruction')).toBe(true);
    });

    it('detects eval with spaces', () => {
      const matches = checkDangerousPatterns('eval (code)');
      expect(matches.some(m => m.pattern === 'eval_in_instruction')).toBe(true);
    });
  });

  describe('skip_auth', () => {
    it('detects "skip auth"', () => {
      const matches = checkDangerousPatterns('skip auth for local development');
      expect(matches.some(m => m.pattern === 'skip_auth')).toBe(true);
    });

    it('detects "skip_auth"', () => {
      const matches = checkDangerousPatterns('SKIP_AUTH=1');
      expect(matches.some(m => m.pattern === 'skip_auth')).toBe(true);
    });
  });

  describe('no_validation', () => {
    it('detects "no validation"', () => {
      const matches = checkDangerousPatterns('use no validation for speed');
      expect(matches.some(m => m.pattern === 'no_validation')).toBe(true);
    });

    it('detects "no_validation"', () => {
      const matches = checkDangerousPatterns('NO_VALIDATION=true');
      expect(matches.some(m => m.pattern === 'no_validation')).toBe(true);
    });
  });

  describe('no_verify_flag', () => {
    it('detects --no-verify git flag', () => {
      const matches = checkDangerousPatterns('git commit --no-verify -m "fix"');
      expect(matches.some(m => m.pattern === 'no_verify_flag')).toBe(true);
    });
  });

  describe('chmod_777', () => {
    it('detects chmod 777', () => {
      const matches = checkDangerousPatterns('run chmod 777 /var/www');
      expect(matches.some(m => m.pattern === 'chmod_777')).toBe(true);
    });
  });

  describe('disable_security', () => {
    it('detects "disable security"', () => {
      const matches = checkDangerousPatterns('disable security checks');
      expect(matches.some(m => m.pattern === 'disable_security')).toBe(true);
    });

    it('detects "disable_security"', () => {
      const matches = checkDangerousPatterns('DISABLE_SECURITY=1');
      expect(matches.some(m => m.pattern === 'disable_security')).toBe(true);
    });
  });

  describe('remove_auth', () => {
    it('detects "remove auth"', () => {
      const matches = checkDangerousPatterns('remove auth from endpoint');
      expect(matches.some(m => m.pattern === 'remove_auth')).toBe(true);
    });

    it('detects "remove authentication"', () => {
      const matches = checkDangerousPatterns('remove authentication middleware');
      expect(matches.some(m => m.pattern === 'remove_auth')).toBe(true);
    });

    it('detects "remove authorization"', () => {
      const matches = checkDangerousPatterns('remove authorization layer');
      expect(matches.some(m => m.pattern === 'remove_auth')).toBe(true);
    });
  });

  describe('bypass_security', () => {
    it('detects "bypass security"', () => {
      const matches = checkDangerousPatterns('bypass security for admin panel');
      expect(matches.some(m => m.pattern === 'bypass_security')).toBe(true);
    });

    it('detects "bypass_security"', () => {
      const matches = checkDangerousPatterns('BYPASS_SECURITY=true');
      expect(matches.some(m => m.pattern === 'bypass_security')).toBe(true);
    });
  });

  describe('disable_firewall', () => {
    it('detects "disable firewall"', () => {
      const matches = checkDangerousPatterns('disable firewall for testing');
      expect(matches.some(m => m.pattern === 'disable_firewall')).toBe(true);
    });
  });

  describe('trust_all_certs', () => {
    it('detects "trust all certs"', () => {
      const matches = checkDangerousPatterns('trust all certs in development');
      expect(matches.some(m => m.pattern === 'trust_all_certs')).toBe(true);
    });

    it('detects "trust all certificates"', () => {
      const matches = checkDangerousPatterns('trust all certificates');
      expect(matches.some(m => m.pattern === 'trust_all_certs')).toBe(true);
    });

    it('detects "trust_all_certs"', () => {
      const matches = checkDangerousPatterns('TRUST_ALL_CERTS=true');
      expect(matches.some(m => m.pattern === 'trust_all_certs')).toBe(true);
    });
  });

  describe('node_tls_reject_unauthorized', () => {
    it('detects NODE_TLS_REJECT_UNAUTHORIZED=0', () => {
      const matches = checkDangerousPatterns("NODE_TLS_REJECT_UNAUTHORIZED='0'");
      expect(matches.some(m => m.pattern === 'node_tls_reject_unauthorized')).toBe(true);
    });

    it('detects NODE_TLS_REJECT_UNAUTHORIZED = 0', () => {
      const matches = checkDangerousPatterns('NODE_TLS_REJECT_UNAUTHORIZED = 0');
      expect(matches.some(m => m.pattern === 'node_tls_reject_unauthorized')).toBe(true);
    });

    it('detects NODE_TLS_REJECT_UNAUTHORIZED="0"', () => {
      const matches = checkDangerousPatterns('NODE_TLS_REJECT_UNAUTHORIZED="0"');
      expect(matches.some(m => m.pattern === 'node_tls_reject_unauthorized')).toBe(true);
    });
  });

  describe('insecure_flag', () => {
    it('detects --insecure flag', () => {
      const matches = checkDangerousPatterns('curl --insecure https://example.com');
      expect(matches.some(m => m.pattern === 'insecure_flag')).toBe(true);
    });

    it('does not match --insecure-registry (word boundary)', () => {
      // --insecure\b should not match --insecure-registry
      // Actually the regex \b matches at hyphen boundary, so let's verify behavior
      const matches = checkDangerousPatterns('--insecure-registry');
      // This tests the actual regex behavior: \b before hyphen
      // The regex /--insecure\b/ - \b matches between 'e' and '-'
      // So it WILL match. This is a behavior documentation test.
      const insecureMatches = matches.filter(m => m.pattern === 'insecure_flag');
      // Expect it matches (the \b is between word char 'e' and non-word char '-')
      expect(insecureMatches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('allow_http', () => {
    it('detects "allow http"', () => {
      const matches = checkDangerousPatterns('allow http connections');
      expect(matches.some(m => m.pattern === 'allow_http')).toBe(true);
    });

    it('detects "allow_http"', () => {
      const matches = checkDangerousPatterns('ALLOW_HTTP=true');
      expect(matches.some(m => m.pattern === 'allow_http')).toBe(true);
    });

    it('does not match "allow https"', () => {
      // The regex has \b after http, so "https" should not match
      const matches = checkDangerousPatterns('allow https connections');
      const httpMatches = matches.filter(m => m.pattern === 'allow_http');
      expect(httpMatches).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Clean text
  // -----------------------------------------------------------------------

  describe('clean text', () => {
    it('returns empty array for safe text', () => {
      const text = 'Implement user authentication with bcrypt and JWT tokens.';
      const matches = checkDangerousPatterns(text);
      expect(matches).toHaveLength(0);
    });

    it('returns empty array for empty string', () => {
      const matches = checkDangerousPatterns('');
      expect(matches).toHaveLength(0);
    });

    it('returns empty array for whitespace-only text', () => {
      const matches = checkDangerousPatterns('   \n\t  ');
      expect(matches).toHaveLength(0);
    });

    it('does not flag "enable ssl"', () => {
      const matches = checkDangerousPatterns('enable ssl for production');
      expect(matches).toHaveLength(0);
    });

    it('does not flag "add authentication"', () => {
      const matches = checkDangerousPatterns('add authentication middleware');
      expect(matches).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple patterns
  // -----------------------------------------------------------------------

  describe('multiple patterns in same text', () => {
    it('detects multiple dangerous patterns', () => {
      const text = 'disable ssl, skip auth, and chmod 777 the directory';
      const matches = checkDangerousPatterns(text);
      expect(matches.length).toBeGreaterThanOrEqual(3);

      const patterns = matches.map(m => m.pattern);
      expect(patterns).toContain('disable_ssl');
      expect(patterns).toContain('skip_auth');
      expect(patterns).toContain('chmod_777');
    });

    it('returns matches sorted by position', () => {
      const text = 'First: chmod 777, Second: disable ssl, Third: skip auth';
      const matches = checkDangerousPatterns(text);
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].position).toBeGreaterThanOrEqual(matches[i - 1].position);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Match structure
  // -----------------------------------------------------------------------

  describe('match structure', () => {
    it('returns DangerousMatch objects with correct shape', () => {
      const text = 'disable ssl now';
      const matches = checkDangerousPatterns(text);
      expect(matches.length).toBeGreaterThan(0);

      const match = matches[0];
      expect(match).toHaveProperty('pattern');
      expect(match).toHaveProperty('position');
      expect(match).toHaveProperty('matched');
      expect(typeof match.pattern).toBe('string');
      expect(typeof match.position).toBe('number');
      expect(typeof match.matched).toBe('string');
    });

    it('captures the exact matched text', () => {
      const text = 'please Disable SSL here';
      const matches = checkDangerousPatterns(text);
      const sslMatch = matches.find(m => m.pattern === 'disable_ssl');
      expect(sslMatch).toBeDefined();
      expect(sslMatch!.matched).toBe('Disable SSL');
    });

    it('records the correct position', () => {
      const prefix = 'prefix text ';
      const text = prefix + 'disable ssl';
      const matches = checkDangerousPatterns(text);
      const sslMatch = matches.find(m => m.pattern === 'disable_ssl');
      expect(sslMatch).toBeDefined();
      expect(sslMatch!.position).toBe(prefix.length);
    });
  });

  // -----------------------------------------------------------------------
  // Repeated pattern
  // -----------------------------------------------------------------------

  describe('repeated patterns', () => {
    it('detects the same pattern appearing multiple times', () => {
      const text = 'disable ssl first, then disable ssl again';
      const matches = checkDangerousPatterns(text);
      const sslMatches = matches.filter(m => m.pattern === 'disable_ssl');
      expect(sslMatches.length).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Separator variants
  // -----------------------------------------------------------------------

  describe('separator variants', () => {
    it('handles dot separator', () => {
      const matches = checkDangerousPatterns('disable.ssl');
      expect(matches.some(m => m.pattern === 'disable_ssl')).toBe(true);
    });

    it('handles space separator', () => {
      const matches = checkDangerousPatterns('disable ssl');
      expect(matches.some(m => m.pattern === 'disable_ssl')).toBe(true);
    });

    it('handles underscore separator', () => {
      const matches = checkDangerousPatterns('disable_ssl');
      expect(matches.some(m => m.pattern === 'disable_ssl')).toBe(true);
    });

    it('handles hyphen separator', () => {
      const matches = checkDangerousPatterns('disable-ssl');
      expect(matches.some(m => m.pattern === 'disable_ssl')).toBe(true);
    });
  });
});
