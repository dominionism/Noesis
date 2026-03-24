/**
 * Tests for Memory Write Pipeline (src/memory/write-pipeline.ts)
 *
 * Covers:
 * - Happy path: successful write through all pipeline stages
 * - Secret scanning in warn mode vs redact mode
 * - Dangerous pattern detection requiring confirmation
 * - Schema validation (missing type, title, content)
 * - Audit logging
 * - Event emission
 * - Content classification
 */

import { describe, it, expect, vi } from 'vitest';

import { executeWritePipeline } from '../../memory/write-pipeline.js';
import type { WritePipelineParams } from '../../memory/write-pipeline.js';
import type { Memory, MemoryInput, ScanResult, DangerousMatch } from '../../types.js';

function makeScanResult(overrides?: Partial<ScanResult>): ScanResult {
  return {
    clean: '',
    redacted: false,
    matches: [],
    ...overrides,
  };
}

function makeMemoryInput(overrides?: Partial<MemoryInput>): MemoryInput {
  return {
    type: 'task',
    title: 'Test Task',
    content: 'Test content',
    tags: ['test'],
    ...overrides,
  };
}

function makeMemory(input: MemoryInput & { signature: string }): Memory {
  return {
    id: 'test-id-001',
    type: input.type,
    title: input.title,
    content: input.content,
    tags: JSON.stringify(input.tags ?? []),
    project_id: input.project_id ?? null,
    scope: input.scope ?? 'global',
    sensitivity: input.sensitivity ?? 'INTERNAL',
    confidence: input.confidence ?? 0.5,
    outcome: input.outcome ?? null,
    source: input.source ?? 'agent',
    embedding: null,
    embedding_model: null,
    signature: input.signature,
    status: 'active',
    access_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
    expires_at: null,
    superseded_by: null,
    session_id: null,
  };
}

function makeDefaultParams(overrides?: Partial<WritePipelineParams>): WritePipelineParams {
  const createMemory = vi.fn((db: any, input: MemoryInput & { signature: string }) => makeMemory(input));
  return {
    db: {},
    input: { input: makeMemoryInput() },
    config: { secret_scan_mode: 'warn' },
    signMemory: vi.fn(() => 'sig-abc123'),
    scanAndRedact: vi.fn((text: string) => makeScanResult({ clean: text })),
    checkDangerousPatterns: vi.fn(() => []),
    createMemory,
    writeAuditLog: vi.fn(),
    emitEvent: vi.fn(),
    generateId: vi.fn(() => 'test-id-001'),
    ...overrides,
  };
}

describe('executeWritePipeline', () => {
  describe('happy path', () => {
    it('writes a memory successfully through all stages', async () => {
      const params = makeDefaultParams();
      const result = await executeWritePipeline(params);

      expect(result.success).toBe(true);
      expect(result.memory).toBeDefined();
      expect(result.memory!.id).toBe('test-id-001');
      expect(result.memory!.type).toBe('task');
      expect(result.memory!.title).toBe('Test Task');
    });

    it('calls signMemory with generated ID and input fields', async () => {
      const params = makeDefaultParams();
      await executeWritePipeline(params);

      expect(params.signMemory).toHaveBeenCalledWith({
        id: 'test-id-001',
        type: 'task',
        title: 'Test Task',
        content: 'Test content',
        project_id: null,
      });
    });

    it('calls createMemory with signature', async () => {
      const params = makeDefaultParams();
      await executeWritePipeline(params);

      expect(params.createMemory).toHaveBeenCalledTimes(1);
      const callArgs = (params.createMemory as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].signature).toBe('sig-abc123');
    });

    it('calls writeAuditLog with MEMORY_WRITE event', async () => {
      const params = makeDefaultParams();
      await executeWritePipeline(params);

      expect(params.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'MEMORY_WRITE',
          source: 'agent',
        }),
      );
    });

    it('emits memory_written event', async () => {
      const params = makeDefaultParams();
      await executeWritePipeline(params);

      expect(params.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory_written',
          payload: expect.objectContaining({
            id: 'test-id-001',
            type: 'task',
          }),
        }),
      );
    });

    it('does not emit event when emitEvent is not provided', async () => {
      const params = makeDefaultParams({ emitEvent: undefined });
      const result = await executeWritePipeline(params);
      expect(result.success).toBe(true);
      // No error thrown despite missing emitEvent
    });
  });

  describe('secret scanning', () => {
    it('redacts secrets when mode is "redact"', async () => {
      const params = makeDefaultParams({
        config: { secret_scan_mode: 'redact' },
        scanAndRedact: vi.fn((text: string) => {
          if (text.includes('API_KEY')) {
            return makeScanResult({
              clean: text.replace('API_KEY=secret123', 'API_KEY=***REDACTED***'),
              redacted: true,
              matches: [{ type: 'api_key', position: 0, length: 18, matched: 'API_KEY=secret123' }],
            });
          }
          return makeScanResult({ clean: text });
        }),
        input: { input: makeMemoryInput({ content: 'API_KEY=secret123' }) },
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(true);
      expect(result.secretsRedacted).toBe(true);
    });

    it('warns but does not redact when mode is "warn"', async () => {
      const params = makeDefaultParams({
        config: { secret_scan_mode: 'warn' },
        scanAndRedact: vi.fn(() => makeScanResult({
          redacted: true,
          clean: '***REDACTED***',
          matches: [{ type: 'api_key', position: 0, length: 5, matched: 'key' }],
        })),
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(true);
      // In warn mode, secretsRedacted is false (it warns but doesn't redact)
      expect(result.secretsRedacted).toBe(false);
      // Audit log should record the security event
      expect(params.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'SECURITY_EVENT',
          details: expect.objectContaining({
            action: 'secret_scan_warn',
          }),
        }),
      );
    });

    it('does not flag secretsRedacted when no secrets found', async () => {
      const params = makeDefaultParams();
      const result = await executeWritePipeline(params);
      expect(result.secretsRedacted).toBe(false);
    });
  });

  describe('dangerous pattern check', () => {
    it('requires confirmation when dangerous patterns detected', async () => {
      const dangerousMatches: DangerousMatch[] = [
        { pattern: 'disable.*security', position: 0, matched: 'disable security' },
      ];
      const params = makeDefaultParams({
        checkDangerousPatterns: vi.fn(() => dangerousMatches),
        input: { input: makeMemoryInput(), confirmed: false },
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(false);
      expect(result.confirmationRequired).toBe(true);
      expect(result.dangerousMatches).toEqual(dangerousMatches);
    });

    it('proceeds when dangerous patterns are confirmed', async () => {
      const dangerousMatches: DangerousMatch[] = [
        { pattern: 'disable.*security', position: 0, matched: 'disable security' },
      ];
      const params = makeDefaultParams({
        checkDangerousPatterns: vi.fn(() => dangerousMatches),
        input: { input: makeMemoryInput(), confirmed: true },
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(true);
    });

    it('does not require confirmation when no dangerous patterns', async () => {
      const params = makeDefaultParams();
      const result = await executeWritePipeline(params);
      expect(result.success).toBe(true);
      expect(result.confirmationRequired).toBeUndefined();
    });
  });

  describe('schema validation', () => {
    it('fails when type is missing', async () => {
      const params = makeDefaultParams({
        input: {
          input: makeMemoryInput({ type: '' as any }),
        },
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });

    it('fails when title is empty', async () => {
      const params = makeDefaultParams({
        input: {
          input: makeMemoryInput({ title: '' }),
        },
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    it('fails when content is null-ish', async () => {
      const params = makeDefaultParams({
        input: {
          input: makeMemoryInput({ content: null as any }),
        },
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain('content');
    });
  });

  describe('content classification', () => {
    it('uses provided sensitivity when set', async () => {
      const params = makeDefaultParams({
        input: {
          input: makeMemoryInput({ sensitivity: 'CONFIDENTIAL' }),
        },
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(true);
      // The createMemory is called with the sensitivity value
      const callArgs = (params.createMemory as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].sensitivity).toBe('CONFIDENTIAL');
    });

    it('defaults to INTERNAL when no sensitivity provided', async () => {
      const params = makeDefaultParams({
        input: {
          input: makeMemoryInput({ sensitivity: undefined }),
        },
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(true);
      const callArgs = (params.createMemory as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].sensitivity).toBe('INTERNAL');
    });
  });

  describe('error resilience', () => {
    it('succeeds even if audit log throws', async () => {
      const params = makeDefaultParams({
        writeAuditLog: vi.fn(() => { throw new Error('audit failure'); }),
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(true);
    });

    it('succeeds even if emitEvent throws', async () => {
      const params = makeDefaultParams({
        emitEvent: vi.fn(() => { throw new Error('emit failure'); }),
      });

      const result = await executeWritePipeline(params);
      expect(result.success).toBe(true);
    });
  });
});
