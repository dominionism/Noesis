import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from '../../core/database.js';

function makeTempDb(): { dbPath: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'noesis-test-'));
  return { dbPath: join(dir, 'test.db'), dir };
}

describe('DatabaseConnection', () => {
  const cleanups: string[] = [];

  afterEach(() => {
    DatabaseConnection.resetInstance();
    for (const dir of cleanups) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
  });

  describe('constructor / create', () => {
    it('creates the database file and parent directory', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      expect(existsSync(dbPath)).toBe(true);
      db.close();
    });

    it('applies WAL journal mode', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      const mode = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
      expect(mode[0].journal_mode).toBe('wal');
      db.close();
    });

    it('enables foreign keys', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      const fk = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
      expect(fk[0].foreign_keys).toBe(1);
      db.close();
    });

    it('applies schema on first open', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      const tables = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      ).all();
      const names = tables.map(t => t.name);
      expect(names).toContain('memories');
      expect(names).toContain('metadata');
      expect(names).toContain('memory_edges');
      expect(names).toContain('projects');
      db.close();
    });
  });

  describe('singleton pattern', () => {
    it('returns the same instance on repeated calls', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const a = DatabaseConnection.getInstance(dbPath);
      const b = DatabaseConnection.getInstance(dbPath);
      expect(a).toBe(b);
      a.close();
    });

    it('creates a new instance after resetInstance', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const a = DatabaseConnection.getInstance(dbPath);
      DatabaseConnection.resetInstance();
      const b = DatabaseConnection.getInstance(dbPath);
      expect(a).not.toBe(b);
      expect(a.isOpen).toBe(false);
      b.close();
    });
  });

  describe('public API', () => {
    it('exec runs DDL without error', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      expect(() => db.exec('CREATE TABLE test_exec (id TEXT PRIMARY KEY)')).not.toThrow();
      db.close();
    });

    it('prepare and run insert + select', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      db.exec('CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT)');
      db.prepare<[string, string]>('INSERT INTO kv (k, v) VALUES (?, ?)').run('a', 'b');
      const row = db.prepare<[string], { k: string; v: string }>('SELECT * FROM kv WHERE k = ?').get('a');
      expect(row).toEqual({ k: 'a', v: 'b' });
      db.close();
    });

    it('transaction rolls back on error', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      db.exec('CREATE TABLE txn_test (id INTEGER PRIMARY KEY)');
      const txn = db.transaction(() => {
        db.prepare('INSERT INTO txn_test (id) VALUES (?)').run(1);
        throw new Error('rollback');
      });
      expect(() => txn()).toThrow('rollback');
      const count = db.prepare<[], { c: number }>('SELECT COUNT(*) as c FROM txn_test').get();
      expect(count!.c).toBe(0);
      db.close();
    });

    it('isOpen returns true for open connection, false after close', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      expect(db.isOpen).toBe(true);
      db.close();
      expect(db.isOpen).toBe(false);
    });

    it('path returns the database file path', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      expect(db.path).toBe(dbPath);
      db.close();
    });

    it('close is idempotent', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      db.close();
      expect(() => db.close()).not.toThrow();
    });

    it('throws on operations after close', () => {
      const { dbPath, dir } = makeTempDb();
      cleanups.push(dir);
      const db = DatabaseConnection.create(dbPath);
      db.close();
      expect(() => db.exec('SELECT 1')).toThrow('Database connection is closed');
    });
  });
});
