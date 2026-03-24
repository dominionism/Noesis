/**
 * Tests for src/security/secret-scanner.ts
 *
 * Validates the secret scanning pipeline including:
 * - Pattern-based detection (AWS keys, GitHub tokens, JWTs, PEM keys,
 *   connection strings, generic API keys)
 * - High-entropy string detection near sensitive keywords
 * - Redaction with SHA-256 prefix markers
 * - Combined scan-and-redact workflow
 * - Edge cases: overlapping matches, empty input, unicode
 */

import { describe, it, expect } from 'vitest';

import { scanForSecrets, redactSecrets, scanAndRedact } from '../../security/secret-scanner.js';

// ---------------------------------------------------------------------------
// Pattern-based detection
// ---------------------------------------------------------------------------

describe('scanForSecrets', () => {
  describe('AWS access keys', () => {
    it('detects AWS access key IDs', () => {
      const text = 'My key is AKIAIOSFODNN7EXAMPLE';
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some(m => m.type === 'aws_access_key')).toBe(true);
    });

    it('detects AWS key embedded in text', () => {
      const text = 'config: aws_access_key_id=AKIAIOSFODNN7EXAMPLE; region=us-east-1';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'aws_access_key')).toBe(true);
    });

    it('does not match partial AWS keys', () => {
      const text = 'AKIA is a prefix but AKIA123 is too short';
      const matches = scanForSecrets(text);
      const awsMatches = matches.filter(m => m.type === 'aws_access_key');
      expect(awsMatches).toHaveLength(0);
    });
  });

  describe('GitHub tokens', () => {
    it('detects GitHub personal access tokens (ghp_)', () => {
      const token = 'ghp_' + 'A'.repeat(36);
      const text = `GITHUB_TOKEN=${token}`;
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'github_token')).toBe(true);
    });

    it('detects GitHub OAuth tokens (gho_)', () => {
      const token = 'gho_' + 'B'.repeat(36);
      const text = `token: ${token}`;
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'github_token')).toBe(true);
    });

    it('detects GitHub server tokens (ghs_)', () => {
      const token = 'ghs_' + 'C'.repeat(36);
      const text = `Authorization: Bearer ${token}`;
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'github_token')).toBe(true);
    });
  });

  describe('JWTs', () => {
    it('detects JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      const text = `Bearer ${jwt}`;
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'jwt')).toBe(true);
    });

    it('detects JWT with longer payload', () => {
      const header = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9';
      const payload = 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0';
      const jwt = `${header}.${payload}`;
      const text = `token=${jwt}`;
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'jwt')).toBe(true);
    });
  });

  describe('PEM private keys', () => {
    it('detects PEM private key headers', () => {
      const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpA...';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'pem_private_key')).toBe(true);
    });

    it('detects generic private key header', () => {
      const text = '-----BEGIN PRIVATE KEY-----\nMIIE...';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'pem_private_key')).toBe(true);
    });

    it('does not match public key headers', () => {
      const text = '-----BEGIN PUBLIC KEY-----\nMIIB...';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'pem_private_key')).toBe(false);
    });
  });

  describe('connection strings', () => {
    it('detects database connection strings with credentials', () => {
      const text = 'DATABASE_URL=postgres://admin:s3cretP4ss@db.example.com:5432/mydb';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'connection_string')).toBe(true);
    });

    it('detects MongoDB connection strings', () => {
      const text = 'MONGO_URI=mongodb://user:password123@mongo.host.com/dbname';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'connection_string')).toBe(true);
    });

    it('detects Redis connection strings', () => {
      const text = 'REDIS_URL=redis://default:mypass@redis.example.com:6379';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'connection_string')).toBe(true);
    });
  });

  describe('generic API keys', () => {
    it('detects api_key=VALUE patterns', () => {
      const text = 'api_key=sk_live_abcdefghij1234567890';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'generic_api_key')).toBe(true);
    });

    it('detects api-secret: VALUE patterns', () => {
      const text = 'api-secret: "xK9mP2nL4qR7sT1vW3yZ5aB8cD0eF6g"';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'generic_api_key')).toBe(true);
    });

    it('detects auth_token = VALUE patterns', () => {
      const text = 'auth_token = ABCDEFGHIJKLMNOPQRSTUVWXYZ1234';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'generic_api_key')).toBe(true);
    });

    it('detects access_key patterns', () => {
      const text = "access_key: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'";
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'generic_api_key')).toBe(true);
    });

    it('is case insensitive for key labels', () => {
      const text = 'API_KEY=sk_live_abcdefghij1234567890';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'generic_api_key')).toBe(true);
    });
  });

  describe('high entropy secrets', () => {
    it('detects high-entropy strings near keyword "token"', () => {
      // Generate a high-entropy string
      const highEntropy = 'aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2u';
      const text = `The auth token is ${highEntropy}`;
      const matches = scanForSecrets(text);
      // Should detect either as generic_api_key or high_entropy_secret
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('detects high-entropy strings near keyword "secret"', () => {
      const highEntropy = 'xK9mP2nL4qR7sT1vW3yZ5aB8cD0eF6gH';
      // Use "secret" with word boundaries (not embedded in "client_secret"
      // where \bsecret\b fails because _ is a word character in regex)
      const text = `The secret is ${highEntropy}`;
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('does not flag low-entropy strings', () => {
      const lowEntropy = 'AAAAAAAAAAAAAAAAAAAAAAAAA';
      const text = `Some value is ${lowEntropy}`;
      const matches = scanForSecrets(text);
      // Low entropy repeated character should not match
      const entropyMatches = matches.filter(m => m.type === 'high_entropy_secret');
      expect(entropyMatches).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for clean text', () => {
      const text = 'This is a normal sentence with no secrets.';
      const matches = scanForSecrets(text);
      expect(matches).toHaveLength(0);
    });

    it('returns empty array for empty string', () => {
      const matches = scanForSecrets('');
      expect(matches).toHaveLength(0);
    });

    it('handles multiple secrets in the same text', () => {
      const text = [
        'AWS key: AKIAIOSFODNN7EXAMPLE',
        'GitHub: ghp_' + 'A'.repeat(36),
        '-----BEGIN PRIVATE KEY-----',
      ].join('\n');
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });

    it('returns matches sorted by position', () => {
      const text = [
        'First: AKIAIOSFODNN7EXAMPLE',
        'Second: ghp_' + 'B'.repeat(36),
      ].join('\n');
      const matches = scanForSecrets(text);
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].position).toBeGreaterThanOrEqual(matches[i - 1].position);
      }
    });

    it('captures correct position and length for matches', () => {
      const prefix = 'key=';
      const awsKey = 'AKIAIOSFODNN7EXAMPLE';
      const text = prefix + awsKey;
      const matches = scanForSecrets(text);
      const awsMatch = matches.find(m => m.type === 'aws_access_key');
      expect(awsMatch).toBeDefined();
      expect(awsMatch!.position).toBe(prefix.length);
      expect(awsMatch!.length).toBe(awsKey.length);
      expect(awsMatch!.matched).toBe(awsKey);
    });

    it('handles text with unicode characters', () => {
      const text = 'Clave: AKIAIOSFODNN7EXAMPLE \u00e9\u00e8';
      const matches = scanForSecrets(text);
      expect(matches.some(m => m.type === 'aws_access_key')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

describe('redactSecrets', () => {
  it('replaces matched secrets with redaction markers', () => {
    const text = 'My AWS key: AKIAIOSFODNN7EXAMPLE rest of text';
    const matches = scanForSecrets(text);
    const redacted = redactSecrets(text, matches);
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(redacted).toContain('[REDACTED:aws_access_key:');
    expect(redacted).toContain('rest of text');
  });

  it('returns original text when no matches', () => {
    const text = 'clean text with no secrets';
    const redacted = redactSecrets(text, []);
    expect(redacted).toBe(text);
  });

  it('redaction marker includes SHA-256 prefix for forensics', () => {
    const text = 'AKIAIOSFODNN7EXAMPLE';
    const matches = scanForSecrets(text);
    const redacted = redactSecrets(text, matches);
    // Marker format: [REDACTED:type:8-char-sha256-prefix]
    expect(redacted).toMatch(/\[REDACTED:aws_access_key:[0-9a-f]{8}\]/);
  });

  it('handles multiple redactions in correct positions', () => {
    const key1 = 'AKIAIOSFODNN7EXAMPLE';
    const key2 = 'AKIAZ99999999999TEST';
    const text = `first: ${key1}, second: ${key2}`;
    const matches = scanForSecrets(text);
    const redacted = redactSecrets(text, matches);
    expect(redacted).not.toContain(key1);
    expect(redacted).not.toContain(key2);
    expect(redacted).toContain('first:');
    expect(redacted).toContain('second:');
  });

  it('preserves surrounding text after redaction', () => {
    const text = 'before AKIAIOSFODNN7EXAMPLE after';
    const matches = scanForSecrets(text);
    const redacted = redactSecrets(text, matches);
    expect(redacted.startsWith('before ')).toBe(true);
    expect(redacted.endsWith(' after')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Combined scan-and-redact
// ---------------------------------------------------------------------------

describe('scanAndRedact', () => {
  it('returns clean=true and unmodified text for clean content', () => {
    const text = 'Normal content without any secrets.';
    const result = scanAndRedact(text);
    expect(result.clean).toBe(text);
    expect(result.redacted).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('returns redacted text and matches for secret content', () => {
    const text = 'key: AKIAIOSFODNN7EXAMPLE';
    const result = scanAndRedact(text);
    expect(result.redacted).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.clean).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('returns correct ScanResult shape', () => {
    const result = scanAndRedact('test');
    expect(result).toHaveProperty('clean');
    expect(result).toHaveProperty('redacted');
    expect(result).toHaveProperty('matches');
    expect(typeof result.clean).toBe('string');
    expect(typeof result.redacted).toBe('boolean');
    expect(Array.isArray(result.matches)).toBe(true);
  });

  it('redacts GitHub tokens', () => {
    const token = 'ghp_' + 'X'.repeat(36);
    const text = `GITHUB_TOKEN="${token}"`;
    const result = scanAndRedact(text);
    expect(result.redacted).toBe(true);
    expect(result.clean).not.toContain(token);
    expect(result.clean).toContain('[REDACTED:github_token:');
  });

  it('redacts JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
    const text = `Authorization: Bearer ${jwt}.signature`;
    const result = scanAndRedact(text);
    expect(result.redacted).toBe(true);
    expect(result.clean).toContain('[REDACTED:jwt:');
  });

  it('redacts PEM private keys', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAI...';
    const result = scanAndRedact(text);
    expect(result.redacted).toBe(true);
    expect(result.clean).toContain('[REDACTED:pem_private_key:');
  });

  it('redacts connection strings', () => {
    const text = 'DATABASE_URL=postgres://admin:password@db.example.com:5432/mydb';
    const result = scanAndRedact(text);
    expect(result.redacted).toBe(true);
    expect(result.clean).toContain('[REDACTED:connection_string:');
  });

  it('handles text with only whitespace', () => {
    const result = scanAndRedact('   \n\t  ');
    expect(result.redacted).toBe(false);
    expect(result.clean).toBe('   \n\t  ');
  });

  it('handles empty string', () => {
    const result = scanAndRedact('');
    expect(result.redacted).toBe(false);
    expect(result.clean).toBe('');
    expect(result.matches).toHaveLength(0);
  });
});
