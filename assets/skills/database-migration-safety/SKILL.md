---
name: database-migration-safety
description: Safe database migration patterns including lock analysis, expand-contract, rollback planning, and zero-downtime deployment
category: data
triggers:
  - migration
  - schema change
  - ALTER TABLE
  - ADD COLUMN
  - DROP COLUMN
  - database deploy
  - zero downtime
  - expand contract
chain_with:
  - supabase-postgres-best-practices
---

# Database Migration Safety

## Purpose

Concrete patterns for writing database migrations that do not lock tables, lose data, or break live traffic. Every migration must be tested against production-sized data, have a rollback plan, and be safe to run during peak traffic.

## When to Use

- Before writing any migration that runs against a production database
- When reviewing migrations in a pull request
- When planning a schema change that affects tables with more than 10,000 rows
- When a migration needs to complete without downtime

## Rule 1: Know Your Locks

Every DDL statement acquires a lock. Know which lock and how long it is held.

### PostgreSQL Lock Classification

| Operation | Lock Type | Blocks Reads? | Blocks Writes? | Duration | Safe Under Traffic? |
|---|---|---|---|---|---|
| `ADD COLUMN` (nullable, no default) | AccessExclusiveLock | Briefly | Briefly | Instant (metadata only) | Yes |
| `ADD COLUMN DEFAULT value` (PG 11+) | AccessExclusiveLock | Briefly | Briefly | Instant (metadata only) | Yes |
| `ADD COLUMN DEFAULT value` (PG < 11) | AccessExclusiveLock | Yes | Yes | Full table rewrite | **No** |
| `DROP COLUMN` | AccessExclusiveLock | Briefly | Briefly | Instant (marks invisible) | Yes |
| `ALTER COLUMN TYPE` | AccessExclusiveLock | Yes | Yes | Full table rewrite | **No** |
| `ALTER COLUMN SET NOT NULL` | AccessExclusiveLock | Yes | Yes | Full table scan (validates) | **No** for large tables |
| `ADD CONSTRAINT CHECK` | AccessExclusiveLock | Yes | Yes | Full table scan | **No** |
| `ADD CONSTRAINT FK` | ShareRowExclusiveLock | No | Yes | Validates referenced rows | **No** for large tables |
| `CREATE INDEX` | ShareLock | No | Yes | Full table scan | **No** |
| `CREATE INDEX CONCURRENTLY` | ShareUpdateExclusiveLock | No | No | Full table scan (slower) | Yes |
| `DROP INDEX` | AccessExclusiveLock | Briefly | Briefly | Instant | Yes |
| `DROP INDEX CONCURRENTLY` | ShareUpdateExclusiveLock | No | No | Instant | Yes |
| `RENAME COLUMN` | AccessExclusiveLock | Briefly | Briefly | Instant | Yes (verify no code refs) |
| `DROP TABLE` | AccessExclusiveLock | Yes | Yes | Instant | Yes (if no FK refs) |

### MySQL Lock Notes

- `ADD COLUMN` in MySQL 8.0+ with `ALGORITHM=INSTANT` is metadata-only for appended columns.
- Most other ALTER TABLE operations create a temporary table and copy data (blocking).
- Use `pt-online-schema-change` or `gh-ost` for zero-downtime changes on large tables.

## Rule 2: Every Migration Has a Rollback

Before writing the UP migration, write the DOWN migration. If there is no safe rollback, document that explicitly and plan accordingly.

| UP Operation | DOWN Operation | Notes |
|---|---|---|
| ADD COLUMN | DROP COLUMN | Safe. Data in the column is lost. |
| DROP COLUMN | Cannot restore data | **Irreversible.** Back up the column data before dropping. |
| ALTER TYPE (varchar → int) | ALTER TYPE (int → varchar) | Reversible only if no data was lost in conversion. |
| ADD CONSTRAINT | DROP CONSTRAINT | Safe. |
| CREATE INDEX | DROP INDEX | Safe. |
| DROP TABLE | Cannot restore | **Irreversible.** Back up the table before dropping. |
| INSERT/UPDATE data | Reverse INSERT/UPDATE | Must store original values for rollback. |

**For irreversible operations:** Create a backup table or dump before executing. Document the backup location in the migration file.

## Rule 3: Test Against Production-Sized Data

A migration that takes 10ms on an empty database may take 10 minutes on 50 million rows.

### Testing Protocol

1. **Get the row counts.** Know how many rows are in each affected table in production.
2. **Generate test data.** Create a staging database with the same row count (data can be synthetic).
3. **Run the migration and measure:**
   - Duration (wall clock time)
   - Lock duration (how long writes are blocked)
   - Disk I/O (table rewrites are disk-intensive)
   - WAL generation (large migrations generate significant WAL)
4. **If lock duration > 5 seconds:** The migration is not safe for live traffic. Use expand-contract.
5. **If duration > 1 minute:** Consider running outside peak hours or using batched approach.

## Pattern: Expand-Contract

For changes that require table rewrites or breaking changes, split into three deployments:

### Phase 1: Expand (Add New Alongside Old)

```sql
-- Migration: Add new column (nullable, no rewrite)
ALTER TABLE users ADD COLUMN email_normalized TEXT;
```

Deploy application code that writes to BOTH old (`email`) and new (`email_normalized`).

### Phase 2: Backfill and Switch Reads

```sql
-- Backfill in batches (do not update all rows at once)
UPDATE users SET email_normalized = LOWER(TRIM(email))
WHERE email_normalized IS NULL
AND id >= $start AND id < $end;  -- batch by primary key
```

Deploy application code that reads from new column, writes to both.

### Phase 3: Contract (Remove Old)

```sql
-- Only after verifying all reads use new column
-- and backfill is complete with no NULLs
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users RENAME COLUMN email_normalized TO email;
```

**Each phase is a separate deployment with its own migration.** Never combine.

### When to Use Expand-Contract

- Changing column type (varchar → integer, text → jsonb)
- Splitting a column into multiple columns
- Merging multiple columns into one
- Renaming a column that is referenced in queries or indexes
- Any change where the old and new schema are incompatible

## Pattern: Safe Constraint Addition

Adding a CHECK or NOT NULL constraint validates all existing rows, which acquires a lock for the duration of the scan.

### Safe Approach (PostgreSQL)

```sql
-- Step 1: Add constraint as NOT VALID (instant, no scan)
ALTER TABLE orders ADD CONSTRAINT orders_amount_positive
  CHECK (amount >= 0) NOT VALID;

-- Step 2: Validate in a separate transaction (scans but does not block writes)
ALTER TABLE orders VALIDATE CONSTRAINT orders_amount_positive;
```

### Safe NOT NULL Addition

```sql
-- Step 1: Add a CHECK constraint instead (NOT VALID)
ALTER TABLE users ADD CONSTRAINT users_name_not_null
  CHECK (name IS NOT NULL) NOT VALID;

-- Step 2: Validate
ALTER TABLE users VALIDATE CONSTRAINT users_name_not_null;

-- Step 3: Then set NOT NULL (instant because CHECK already guarantees it in PG 12+)
ALTER TABLE users ALTER COLUMN name SET NOT NULL;

-- Step 4: Drop the CHECK (no longer needed)
ALTER TABLE users DROP CONSTRAINT users_name_not_null;
```

## Pattern: Safe Index Creation

```sql
-- NEVER: Blocks all writes for the duration of index build
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- ALWAYS: Does not block writes (takes longer but safe)
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);
```

**Note:** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. If your migration tool wraps everything in a transaction, you need to either disable that for this migration or use a separate script.

**If CONCURRENTLY fails:** It leaves an INVALID index. Check with:
```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'idx_orders_user_id';

-- If invalid, drop and recreate
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_user_id;
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);
```

## Pattern: Batched Data Migration

For UPDATE or DELETE operations on large tables, process in batches to avoid long-running transactions and excessive WAL generation.

```sql
-- BAD: Updates all 50M rows in one transaction (holds locks, generates massive WAL)
UPDATE orders SET status = 'archived' WHERE created_at < '2023-01-01';

-- GOOD: Batch by primary key
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE orders SET status = 'archived'
    WHERE id IN (
      SELECT id FROM orders
      WHERE created_at < '2023-01-01' AND status != 'archived'
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    COMMIT;
    PERFORM pg_sleep(0.1);  -- Brief pause to let other queries through
  END LOOP;
END $$;
```

## ORM-Specific Gotchas

### Prisma
- `prisma migrate deploy` runs pending migrations. Safe for production.
- `prisma db push` synchronizes schema without migrations. **Never use in production** — it can drop columns.
- Prisma wraps migrations in transactions by default. This prevents `CREATE INDEX CONCURRENTLY`. Use `-- CreateIndex` comment or a raw SQL migration.

### Drizzle
- `drizzle-kit push` directly modifies the schema. **Not safe for production.**
- `drizzle-kit generate` creates migration files. Review them before running.
- Drizzle does not support `CONCURRENTLY` in generated migrations. Use custom SQL for index creation.

### SQLAlchemy (Alembic)
- `alembic upgrade head` runs pending migrations. Safe for production.
- Alembic auto-generates migrations that may include destructive operations. Always review.
- Use `op.execute()` for raw SQL when the auto-generated DDL is not safe.

### Knex
- Knex wraps migrations in transactions by default. Disable for `CREATE INDEX CONCURRENTLY`.
- Knex does not generate migrations from schema diff. You write them manually (which is good for safety).

## Anti-patterns

- **Testing only against empty database.** Passes in CI, locks production for 10 minutes.
- **No rollback plan.** "We will figure it out" is not a plan.
- **ALTER TYPE on large table during traffic.** Use expand-contract.
- **CREATE INDEX without CONCURRENTLY.** Blocks all writes.
- **DROP COLUMN without verifying no code reads it.** Deploy removes the column, running code queries it, 500 errors.
- **ADD NOT NULL without default or backfill.** Fails on tables with existing rows.
- **Single migration combining expand and contract.** If the contract fails, the expand cannot be rolled back independently.
- **Backfill entire table in one UPDATE.** Locks the table, generates massive WAL, can cause replication lag.

## Verification

Migration review is complete when:
1. Lock classification is documented for every DDL statement
2. Every destructive operation has a backup or rollback plan
3. The migration has been tested against production-sized data
4. Index creation uses CONCURRENTLY (or equivalent)
5. Constraint addition uses NOT VALID + VALIDATE (or equivalent)
6. Data backfills are batched, not single-statement
7. No code references columns that are being dropped
8. Expand-contract is used for type changes and breaking schema changes
