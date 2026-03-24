/**
 * Database Connection Management
 *
 * Wraps `better-sqlite3` with:
 * - Mandatory WAL-mode pragmas applied on every connection open
 * - Singleton pattern for the daemon (long-lived process, one connection)
 * - Factory pattern for CLI use (short-lived, disposable connections)
 * - First-run directory and file creation
 * - Schema application on first open
 *
 * Security considerations:
 * - Database file created with 0o600 permissions (owner rw only)
 * - Parent directory created with 0o700 permissions (owner rwx only)
 * - WAL mode ensures readers never block writers (no corruption on crashes)
 * - No user-controlled input reaches pragma or exec calls
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH, FILE_PERMISSIONS } from '../constants.js';
import { applySchema } from './schema.js';

import type BetterSqlite3 from 'better-sqlite3';

/**
 * SQLite pragmas applied to every connection.
 *
 * - journal_mode=WAL: Write-ahead logging for concurrent read/write
 * - synchronous=NORMAL: Safe with WAL; fsync on checkpoint only
 * - cache_size=-8000: 8 MB page cache (negative = KB)
 * - mmap_size=268435456: 256 MB memory-mapped I/O
 * - temp_store=MEMORY: Temp tables and indexes in RAM
 * - foreign_keys=ON: Enforce referential integrity
 */
const MANDATORY_PRAGMAS: ReadonlyArray<string> = [
  'PRAGMA journal_mode = WAL;',
  'PRAGMA synchronous = NORMAL;',
  'PRAGMA cache_size = -8000;',
  'PRAGMA mmap_size = 268435456;',
  'PRAGMA temp_store = MEMORY;',
  'PRAGMA foreign_keys = ON;',
];

/**
 * Safe pragmas for sandboxed/read-only connections.
 *
 * These avoid mutating database state while still enabling useful
 * retrieval performance and integrity checks.
 */
const READONLY_PRAGMAS: ReadonlyArray<string> = [
  'PRAGMA cache_size = -8000;',
  'PRAGMA mmap_size = 268435456;',
  'PRAGMA temp_store = MEMORY;',
  'PRAGMA foreign_keys = ON;',
];

interface DatabaseConnectionOptions {
  readonly?: boolean;
}

export class DatabaseConnection {
  private db: BetterSqlite3.Database;
  private readonly dbPath: string;
  private readonly readOnly: boolean;
  private closed: boolean = false;

  /**
   * Open a SQLite connection and apply mandatory pragmas.
   *
   * If the database file or its parent directory do not exist,
   * they are created with restricted permissions.
   *
   * @param dbPath - Filesystem path to the SQLite database.
   *                 Defaults to ~/.agents/noesis.db (from constants).
   */
  constructor(
    dbPath: string = DB_PATH,
    options: DatabaseConnectionOptions = {},
  ) {
    this.dbPath = dbPath;
    this.readOnly = options.readonly === true;

    if (!this.readOnly) {
      this.ensureDirectoryExists(dbPath);
    }
    const isFirstRun = !existsSync(dbPath);

    this.db = this.readOnly
      ? new Database(dbPath, { readonly: true, fileMustExist: true })
      : new Database(dbPath);
    this.applyPragmas();

    // Restrict file permissions after creation
    if (!this.readOnly && isFirstRun) {
      chmodSync(dbPath, FILE_PERMISSIONS['DB']);
    }

    // Apply schema (idempotent - checks version internally)
    if (!this.readOnly) {
      applySchema(this);
    }
  }

  // -------------------------------------------------------------------------
  // Singleton for daemon use
  // -------------------------------------------------------------------------

  private static instance: DatabaseConnection | null = null;

  /**
   * Retrieve the singleton DatabaseConnection.
   *
   * Intended for the long-lived daemon process where a single
   * persistent connection is shared across all request handlers.
   *
   * @param dbPath - Optional override for the database path.
   */
  static getInstance(dbPath?: string): DatabaseConnection {
    if (!DatabaseConnection.instance || DatabaseConnection.instance.closed) {
      DatabaseConnection.instance = new DatabaseConnection(dbPath);
    }
    return DatabaseConnection.instance;
  }

  /**
   * Destroy the singleton, closing the underlying connection.
   * Next call to getInstance() will create a fresh connection.
   */
  static resetInstance(): void {
    if (DatabaseConnection.instance) {
      DatabaseConnection.instance.close();
      DatabaseConnection.instance = null;
    }
  }

  // -------------------------------------------------------------------------
  // Factory for CLI use
  // -------------------------------------------------------------------------

  /**
   * Create a new, independent DatabaseConnection.
   *
   * Intended for short-lived CLI commands where the connection
   * is opened, used, and closed within a single invocation.
   *
   * @param dbPath - Optional override for the database path.
   */
  static create(dbPath?: string): DatabaseConnection {
    return new DatabaseConnection(dbPath);
  }

  /**
   * Create a new read-only DatabaseConnection.
   *
   * Intended for sandboxed retrieval and diagnostic flows that must not
   * attempt schema changes, WAL changes, or any other writes.
   *
   * @param dbPath - Optional override for the database path.
   */
  static createReadOnly(dbPath?: string): DatabaseConnection {
    return new DatabaseConnection(dbPath, { readonly: true });
  }

  // -------------------------------------------------------------------------
  // Public API wrappers
  // -------------------------------------------------------------------------

  /**
   * Execute one or more SQL statements that do not return data.
   * Suitable for DDL (CREATE TABLE, CREATE INDEX, etc.) and
   * multi-statement strings separated by semicolons.
   */
  exec(sql: string): this {
    this.assertOpen();
    this.db.exec(sql);
    return this;
  }

  /**
   * Prepare a parameterized SQL statement for repeated execution.
   *
   * All user-supplied values MUST be bound via parameters, never
   * interpolated into the SQL string. This prevents SQL injection.
   */
  prepare<BindParameters extends unknown[] = unknown[], Result = unknown>(
    sql: string,
  ): BetterSqlite3.Statement<BindParameters, Result> {
    this.assertOpen();
    return this.db.prepare(sql) as BetterSqlite3.Statement<BindParameters, Result>;
  }

  /**
   * Wrap a function in an IMMEDIATE transaction.
   *
   * better-sqlite3 transactions are synchronous and atomic.
   * If the function throws, the transaction is rolled back.
   */
  transaction<F extends (...args: any[]) => any>(fn: F): BetterSqlite3.Transaction<F> {
    this.assertOpen();
    return this.db.transaction(fn);
  }

  /**
   * Execute a PRAGMA and return its result.
   */
  pragma(source: string, options?: Database.PragmaOptions): unknown {
    this.assertOpen();
    return this.db.pragma(source, options);
  }

  /**
   * Check whether the underlying connection is still open.
   */
  get isOpen(): boolean {
    return !this.closed && this.db.open;
  }

  /**
   * The filesystem path of the database.
   */
  get path(): string {
    return this.dbPath;
  }

  /**
   * Close the database connection and release resources.
   *
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  close(): void {
    if (!this.closed && this.db.open) {
      this.db.close();
    }
    this.closed = true;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Apply all mandatory pragmas to the open connection.
   * These are hard-coded strings with no user input, so
   * exec() is safe here (no injection vector).
   */
  private applyPragmas(): void {
    const pragmas = this.readOnly ? READONLY_PRAGMAS : MANDATORY_PRAGMAS;

    for (const pragma of pragmas) {
      this.db.exec(pragma);
    }
  }

  /**
   * Ensure the parent directory of the database file exists.
   * Created with 0o700 (owner-only rwx).
   */
  private ensureDirectoryExists(dbPath: string): void {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: FILE_PERMISSIONS['DIR'] });
    }
  }

  /**
   * Guard against operations on a closed connection.
   */
  private assertOpen(): void {
    if (this.closed || !this.db.open) {
      throw new Error('Database connection is closed');
    }
  }
}
