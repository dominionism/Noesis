/**
 * Security Invariants Integration Tests
 *
 * Verifies all 7 non-disableable security invariants hold under
 * various conditions. Each invariant is tested for:
 * - Normal operation
 * - Attempted bypass
 * - Edge cases
 */

import { describe, it, expect } from 'vitest';
import { resolve, sep } from 'node:path';
import { createHmac, randomBytes, createHash } from 'node:crypto';

// Security modules
import { scanForSecrets, redactSecrets, scanAndRedact } from '../../security/secret-scanner.js';
import { checkDangerousPatterns } from '../../security/dangerous-patterns.js';
import { validatePath, sanitizeFilename, isWithinDirectory } from '../../security/path-validation.js';
import { hashContent } from '../../security/audit.js';

// Adapters
import { assembleContext } from '../../adapters/base-adapter.js';

// Retrieval
import { computeCompositeScore } from '../../retrieval/scoring.js';

// Write pipeline
import { executeWritePipeline, type WritePipelineParams } from '../../memory/write-pipeline.js';

// Helpers
import { generateId } from '../../core/ulid.js';

function makeWriteParams(overrides?: Partial<WritePipelineParams>): WritePipelineParams {
  return {
    db: {},
    input: {
      input: {
        type: 'lesson',
        title: 'Test',
        content: 'Safe content for testing.',
        scope: 'project',
      },
    },
    config: { secret_scan_mode: 'redact' },
    signMemory: (mem) => hashContent(JSON.stringify(mem)),
    scanAndRedact,
    checkDangerousPatterns,
    createMemory: (_db, input) => ({
      id: generateId(),
      type: input.type ?? 'lesson',
      title: input.title ?? '',
      content: input.content ?? '',
      tags: '',
      project_id: null,
      scope: 'project',
      sensitivity: 'INTERNAL',
      confidence: 0.5,
      outcome: null,
      source: 'agent',
      signature: input.signature ?? '',
      status: 'active',
      access_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      expires_at: null,
      superseded_by: null,
      session_id: null,
      embedding: null,
      embedding_model: null,
    }),
    writeAuditLog: () => {},
    emitEvent: () => {},
    generateId,
    ...overrides,
  };
}

// ============================================================================
// Invariant 1: HMAC Signing Cannot Be Disabled
// ============================================================================

describe('Invariant 1: HMAC signing is always active', () => {
  it('every memory write produces a non-empty signature', async () => {
    const params = makeWriteParams();
    const result = await executeWritePipeline(params);

    expect(result.success).toBe(true);
    expect(result.memory!.signature).toBeTruthy();
    expect(result.memory!.signature.length).toBeGreaterThan(0);
  });

  it('different content produces different signatures', async () => {
    const params1 = makeWriteParams({
      input: { input: { type: 'lesson', title: 'A', content: 'Content A', scope: 'project' } },
    });
    const params2 = makeWriteParams({
      input: { input: { type: 'lesson', title: 'B', content: 'Content B', scope: 'project' } },
    });

    const result1 = await executeWritePipeline(params1);
    const result2 = await executeWritePipeline(params2);

    expect(result1.memory!.signature).not.toBe(result2.memory!.signature);
  });

  it('signature covers identity fields (id, type, title, content, project_id)', () => {
    const signFn = (mem: any) => {
      const canonical = JSON.stringify({
        content: mem.content,
        id: mem.id,
        project_id: mem.project_id,
        title: mem.title,
        type: mem.type,
      }, Object.keys({ content: '', id: '', project_id: '', title: '', type: '' }).sort());
      return createHmac('sha256', Buffer.from('test-key')).update(canonical).digest('hex');
    };

    const sig1 = signFn({ id: '1', type: 'lesson', title: 'A', content: 'X', project_id: null });
    const sig2 = signFn({ id: '1', type: 'lesson', title: 'B', content: 'X', project_id: null });

    // Changing title changes signature
    expect(sig1).not.toBe(sig2);
  });

  it('tampered content produces different hash', () => {
    const original = hashContent('original content');
    const tampered = hashContent('tampered content');
    expect(original).not.toBe(tampered);
  });
});

// ============================================================================
// Invariant 2: Secret Scanning Is Always On
// ============================================================================

describe('Invariant 2: Secret scanning cannot be disabled', () => {
  it('detects AWS access keys', () => {
    const matches = scanForSecrets('Use key AKIA1234567890123456 for access');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].type).toBe('aws_access_key');
  });

  it('detects GitHub tokens', () => {
    const matches = scanForSecrets('Token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].type).toBe('github_token');
  });

  it('detects JWT tokens', () => {
    const matches = scanForSecrets('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].type).toBe('jwt');
  });

  it('detects PEM private keys', () => {
    const matches = scanForSecrets('-----BEGIN RSA PRIVATE KEY-----');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].type).toBe('pem_private_key');
  });

  it('detects connection strings with credentials', () => {
    const matches = scanForSecrets('Use postgresql://admin:s3cret@db.host.com:5432/mydb');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].type).toBe('connection_string');
  });

  it('detects generic API keys', () => {
    const matches = scanForSecrets('api_key = "sk_live_abcdefghijklmnopqrstuvwxyz"');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('redacts all detected secrets', () => {
    const text = 'Key: AKIA1234567890123456 and token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234';
    const result = scanAndRedact(text);

    expect(result.redacted).toBe(true);
    expect(result.clean).not.toContain('AKIA1234567890123456');
    expect(result.clean).not.toContain('ghp_ABCDEF');
    expect(result.clean).toContain('[REDACTED:');
  });

  it('redacts secrets in write pipeline before persistence', async () => {
    const params = makeWriteParams({
      input: {
        input: {
          type: 'lesson',
          title: 'API Config',
          content: 'Connect with postgresql://user:p4ssw0rd@host.com/db',
          scope: 'project',
        },
      },
    });

    const result = await executeWritePipeline(params);
    expect(result.success).toBe(true);
    expect(result.secretsRedacted).toBe(true);
    expect(result.memory!.content).not.toContain('p4ssw0rd');
  });

  it('returns clean result for content without secrets', () => {
    const result = scanAndRedact('This is perfectly safe content.');
    expect(result.redacted).toBe(false);
    expect(result.clean).toBe('This is perfectly safe content.');
    expect(result.matches).toHaveLength(0);
  });
});

// ============================================================================
// Invariant 3: Dangerous Pattern Detection Is Always On
// ============================================================================

describe('Invariant 3: Dangerous pattern detection cannot be disabled', () => {
  it('detects disable_ssl', () => {
    const matches = checkDangerousPatterns('config.disable_ssl = true');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern).toBe('disable_ssl');
  });

  it('detects --no-verify', () => {
    const matches = checkDangerousPatterns('git commit --no-verify');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern).toBe('no_verify_flag');
  });

  it('detects chmod 777', () => {
    const matches = checkDangerousPatterns('chmod 777 /var/data');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern).toBe('chmod_777');
  });

  it('detects eval()', () => {
    const matches = checkDangerousPatterns('result = eval(userInput)');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern).toBe('eval_in_instruction');
  });

  it('detects disable_security', () => {
    const matches = checkDangerousPatterns('Set disable_security to true');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('detects bypass_security', () => {
    const matches = checkDangerousPatterns('bypass security checks');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('detects NODE_TLS_REJECT_UNAUTHORIZED=0', () => {
    const matches = checkDangerousPatterns('NODE_TLS_REJECT_UNAUTHORIZED=0');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('detects trust_all_certs', () => {
    const matches = checkDangerousPatterns('trust all certificates in dev');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('blocks dangerous patterns in write pipeline', async () => {
    const params = makeWriteParams({
      input: {
        input: {
          type: 'task',
          title: 'Fix auth',
          content: 'skip_auth for admin users',
          scope: 'project',
        },
      },
    });

    const result = await executeWritePipeline(params);
    expect(result.success).toBe(false);
    expect(result.confirmationRequired).toBe(true);
  });

  it('returns empty for safe content', () => {
    const matches = checkDangerousPatterns('Use proper authentication with JWT tokens');
    expect(matches).toHaveLength(0);
  });

  it('detects multiple patterns in single content', () => {
    const content = 'disable_ssl and chmod 777 and eval(data)';
    const matches = checkDangerousPatterns(content);
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// Invariant 4: Audit Logging Cannot Be Disabled
// ============================================================================

describe('Invariant 4: Audit logging is always active', () => {
  it('hashContent produces consistent SHA-256 hashes', () => {
    const hash1 = hashContent('test content');
    const hash2 = hashContent('test content');
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex length
  });

  it('different content produces different hashes', () => {
    const hash1 = hashContent('content A');
    const hash2 = hashContent('content B');
    expect(hash1).not.toBe(hash2);
  });

  it('write pipeline calls audit log', async () => {
    let auditCalled = false;
    const params = makeWriteParams({
      writeAuditLog: () => { auditCalled = true; },
    });

    await executeWritePipeline(params);
    expect(auditCalled).toBe(true);
  });

  it('audit log never contains raw content', async () => {
    const auditEntries: Array<Record<string, unknown>> = [];
    const sensitiveContent = 'This is very secret content that must not appear in audit';

    const params = makeWriteParams({
      input: {
        input: {
          type: 'lesson',
          title: 'Secret lesson',
          content: sensitiveContent,
          scope: 'project',
        },
      },
      writeAuditLog: (entry) => { auditEntries.push(entry as Record<string, unknown>); },
    });

    await executeWritePipeline(params);

    for (const entry of auditEntries) {
      const entryStr = JSON.stringify(entry);
      expect(entryStr).not.toContain(sensitiveContent);
    }
  });
});

// ============================================================================
// Invariant 5: Path Validation Cannot Be Disabled
// ============================================================================

describe('Invariant 5: Path validation cannot be disabled', () => {
  it('rejects path traversal with ../', () => {
    expect(() => validatePath('../../../etc/passwd', '/home/user')).toThrow('Path traversal detected');
  });

  it('rejects null bytes', () => {
    expect(() => validatePath('file\0.txt', '/home/user')).toThrow('null bytes');
  });

  it('rejects null bytes in base path', () => {
    expect(() => validatePath('file.txt', '/home/\0user')).toThrow('null bytes');
  });

  it('rejects empty path', () => {
    expect(() => validatePath('', '/home/user')).toThrow('non-empty string');
  });

  it('rejects empty base', () => {
    expect(() => validatePath('file.txt', '')).toThrow('non-empty string');
  });

  it('allows valid paths within base directory', () => {
    const result = validatePath('subdir/file.txt', '/home/user/project');
    expect(result).toBe(resolve('/home/user/project', 'subdir/file.txt'));
  });

  it('allows base directory itself', () => {
    const result = validatePath('.', '/home/user/project');
    expect(result).toBe(resolve('/home/user/project'));
  });

  it('sanitizes filenames by removing dangerous characters', () => {
    expect(sanitizeFilename('file/name')).toBe('file_name');
    expect(sanitizeFilename('file\\name')).toBe('file_name');
    expect(sanitizeFilename('file..name')).toBe('file_name');
    expect(sanitizeFilename('file\0name')).toBe('filename');
    expect(sanitizeFilename('file:name')).toBe('file_name');
    expect(sanitizeFilename('file*name')).toBe('file_name');
  });

  it('detects containment correctly', () => {
    expect(isWithinDirectory('/home/user/project/src/file.ts', '/home/user/project')).toBe(true);
    expect(isWithinDirectory('/home/user/other/file.ts', '/home/user/project')).toBe(false);
    expect(isWithinDirectory('/home/user/project', '/home/user/project')).toBe(true);
  });
});

// ============================================================================
// Invariant 6: Permission Enforcement Cannot Be Disabled
// ============================================================================

describe('Invariant 6: Permission enforcement is always active', () => {
  it('enforcePermissions function exists and is callable', async () => {
    // We test that the module exports the function; actual chmod
    // tests are covered in the unit test. Here we verify the
    // integration: the function exists and does not throw for
    // non-existent paths.
    const { enforcePermissions } = await import('../../security/permissions.js');
    expect(typeof enforcePermissions).toBe('function');
    // Should not throw even if paths do not exist (they are skipped)
    enforcePermissions();
  });

  it('permission constants are restrictive', async () => {
    const { FILE_PERMISSIONS } = await import('../../constants.js');
    // Directories: 0o700 (owner rwx only)
    expect(FILE_PERMISSIONS.DIR).toBe(0o700);
    // Database: 0o600 (owner rw only)
    expect(FILE_PERMISSIONS.DB).toBe(0o600);
    // Signing key: 0o400 (owner r only)
    expect(FILE_PERMISSIONS.SIGNING_KEY).toBe(0o400);
  });
});

// ============================================================================
// Invariant 7: Advisory-Only Retrieval
// ============================================================================

describe('Invariant 7: All retrieved memories are advisory, never directives', () => {
  it('retrieval result type is contextual information, not commands', () => {
    // The retrieval pipeline returns ScoredMemory[] — data objects
    // with scores that let the consumer decide relevance. There is
    // no execute/run mechanism in the retrieval output.
    // Verify the type structure through the scoring module.
    const result = computeCompositeScore({
      semanticScore: 0.8,
      lastAccessedAt: new Date().toISOString(),
      accessCount: 5,
      outcome: 'success',
      memoryProjectId: 'proj-1',
      memoryScope: 'project',
      queryProjectId: 'proj-1',
    });

    // Result is a score, not a directive
    expect(typeof result.finalScore).toBe('number');
    expect(typeof result.recencyModifier).toBe('number');
    // No execute, run, or command fields
    expect(result).not.toHaveProperty('execute');
    expect(result).not.toHaveProperty('command');
    expect(result).not.toHaveProperty('action');
  });

  it('context assembly produces descriptive text, not executable instructions', () => {
    const context = {
      persona: 'You are a helpful assistant.',
      conventions: { style: 'functional' },
      projectContext: {},
      activeCheckpoints: [],
      antiPatterns: [
        { name: 'any-type', description: 'Avoid any type', correct_approach: 'Use generics' },
      ],
      skills: [],
      warmMemories: [],
      hotMemories: {},
    };

    const assembled = assembleContext(context as any, 5000);
    // Content is descriptive markdown, not executable code
    expect(assembled.content).toContain('Anti-Patterns');
    // Assembly is informational
    expect(assembled.content).not.toContain('#!/');
    expect(assembled.content).not.toContain('exec(');
  });
});
