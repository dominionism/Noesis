/**
 * Tests for noesis audit command registration
 *
 * Validates command registration and option parsing.
 * Audit log querying is tested separately in the security/audit tests.
 */

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerAuditCommand } from '../../cli/commands/audit.js';

describe('noesis audit command registration', () => {
  it('should register the audit command on the program', () => {
    const program = new Command();
    program.option('--verbose', 'verbose');
    program.option('--json', 'json');
    program.option('--project <id>', 'project');

    registerAuditCommand(program);

    const auditCmd = program.commands.find(c => c.name() === 'audit');
    expect(auditCmd).toBeDefined();
    expect(auditCmd!.description()).toBe('Query the security audit log');
  });

  it('should have --type option', () => {
    const program = new Command();
    program.option('--verbose', 'verbose');
    program.option('--json', 'json');
    program.option('--project <id>', 'project');

    registerAuditCommand(program);

    const auditCmd = program.commands.find(c => c.name() === 'audit');
    const optionNames = auditCmd!.options.map(o => o.long);
    expect(optionNames).toContain('--type');
  });

  it('should have --since option', () => {
    const program = new Command();
    program.option('--verbose', 'verbose');
    program.option('--json', 'json');
    program.option('--project <id>', 'project');

    registerAuditCommand(program);

    const auditCmd = program.commands.find(c => c.name() === 'audit');
    const optionNames = auditCmd!.options.map(o => o.long);
    expect(optionNames).toContain('--since');
  });

  it('should have --limit option', () => {
    const program = new Command();
    program.option('--verbose', 'verbose');
    program.option('--json', 'json');
    program.option('--project <id>', 'project');

    registerAuditCommand(program);

    const auditCmd = program.commands.find(c => c.name() === 'audit');
    const optionNames = auditCmd!.options.map(o => o.long);
    expect(optionNames).toContain('--limit');
  });
});
