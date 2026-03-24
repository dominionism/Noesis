/**
 * Tests for noesis project command
 *
 * Tests project management operations against a real temporary database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';
import { createProject, listProjects, getProject } from '../../core/memory-crud.js';

let tempDir: string;
let dbPath: string;
let db: DatabaseConnection;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'noesis-project-test-'));
  dbPath = join(tempDir, 'test.db');
  db = DatabaseConnection.create(dbPath);
});

afterEach(() => {
  db.close();
  DatabaseConnection.resetInstance();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('noesis project operations', () => {
  it('should create a project with default settings', () => {
    const project = createProject(db, {
      name: 'test-project',
      path: '/tmp/test-project',
    });

    expect(project.id).toBeTruthy();
    expect(project.name).toBe('test-project');
    expect(project.path).toBe('/tmp/test-project');
    expect(project.sensitivity).toBe('INTERNAL');
    expect(project.isolation_mode).toBe(false);
  });

  it('should create a project with custom sensitivity', () => {
    const project = createProject(db, {
      name: 'secret-project',
      path: '/tmp/secret',
      sensitivity: 'CONFIDENTIAL',
      isolation_mode: true,
    });

    expect(project.sensitivity).toBe('CONFIDENTIAL');
    expect(project.isolation_mode).toBe(true);
  });

  it('should list all projects', () => {
    createProject(db, { name: 'project-a', path: '/tmp/a' });
    createProject(db, { name: 'project-b', path: '/tmp/b' });
    createProject(db, { name: 'project-c', path: '/tmp/c' });

    const projects = listProjects(db);
    expect(projects.length).toBe(3);

    const names = projects.map(p => p.name);
    expect(names).toContain('project-a');
    expect(names).toContain('project-b');
    expect(names).toContain('project-c');
  });

  it('should retrieve a project by ID', () => {
    const created = createProject(db, {
      name: 'findable',
      path: '/tmp/findable',
    });

    const found = getProject(db, created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('findable');
    expect(found!.path).toBe('/tmp/findable');
  });

  it('should return null for non-existent project', () => {
    const found = getProject(db, 'non-existent-id');
    expect(found).toBeNull();
  });

  it('should remove a project by ID', () => {
    const project = createProject(db, {
      name: 'to-remove',
      path: '/tmp/remove',
    });

    db.prepare<[string]>('DELETE FROM projects WHERE id = ?').run(project.id);

    const found = getProject(db, project.id);
    expect(found).toBeNull();
  });

  it('should list empty when no projects exist', () => {
    const projects = listProjects(db);
    expect(projects.length).toBe(0);
  });
});
