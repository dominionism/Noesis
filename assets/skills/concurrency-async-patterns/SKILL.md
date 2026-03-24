---
name: concurrency-async-patterns
description: Race condition prevention, async error handling, cancellation, resource cleanup, and parallel execution patterns
category: engineering
triggers:
  - async
  - concurrent
  - race condition
  - Promise
  - parallel
  - deadlock
  - cancellation
  - AbortController
  - worker
  - mutex
chain_with:
  - error-handling-resilience
  - javascript-testing-patterns
---

# Concurrency and Async Patterns

## Purpose

Patterns for writing correct concurrent and asynchronous code. Focuses on preventing race conditions, handling errors in async contexts, cancelling operations cleanly, and choosing the right parallel execution strategy.

## When to Use

- When writing code that makes multiple async operations
- When debugging intermittent failures (often race conditions)
- When operations need cancellation support
- When parallelizing work for performance
- When shared state is accessed from async contexts

## Pattern: Promise.allSettled for Fault Tolerance

Use `Promise.allSettled` when multiple operations are independent and partial failure is acceptable.

```typescript
// BAD: One failure aborts all operations
const [users, orders, analytics] = await Promise.all([
  fetchUsers(),       // If this throws...
  fetchOrders(),      // ...these results are lost
  fetchAnalytics(),
]);

// GOOD: All operations complete, failures are handled individually
const [usersResult, ordersResult, analyticsResult] = await Promise.allSettled([
  fetchUsers(),
  fetchOrders(),
  fetchAnalytics(),
]);

const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
const analytics = analyticsResult.status === 'fulfilled'
  ? analyticsResult.value
  : { error: analyticsResult.reason.message };
```

**Decision:**
- `Promise.all` — All must succeed. Use when operations are dependent (need all results to proceed).
- `Promise.allSettled` — Partial failure OK. Use when operations are independent (page can render without analytics).
- `Promise.race` — Need fastest result. Use for timeouts or redundant calls.
- `Promise.any` — Need first success. Use when multiple sources can provide the same data.

## Pattern: Timeout with AbortController

```typescript
async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);  // Always clean up, even on success
  }
}
```

**Key:** Always clear the timeout in `finally`. If the fetch succeeds before the timeout, the timer would otherwise fire later and throw an unhandled abort error.

## Pattern: Cancellation Propagation

When a parent operation is cancelled, all child operations must also cancel.

```typescript
async function processOrder(orderId: string, signal: AbortSignal): Promise<OrderResult> {
  // Check before each expensive operation
  signal.throwIfAborted();

  const order = await db.orders.findById(orderId);
  signal.throwIfAborted();

  // Propagate signal to child operations
  const payment = await paymentClient.charge(order.total, { signal });
  signal.throwIfAborted();

  const confirmation = await emailClient.send(order.email, { signal });

  return { order, payment, confirmation };
}

// Usage: Cancel if user navigates away or request times out
const controller = new AbortController();
req.on('close', () => controller.abort());  // Client disconnected

try {
  const result = await processOrder(orderId, controller.signal);
} catch (error) {
  if (error.name === 'AbortError') {
    logger.info('order_processing_cancelled', { order_id: orderId });
    return; // Clean exit, not an error
  }
  throw error;
}
```

## Pattern: Resource Cleanup with try/finally

Every acquired resource must have a guaranteed cleanup path, even when errors or cancellations occur.

```typescript
// BAD: Connection leaks on error
async function queryDatabase(sql: string) {
  const conn = await pool.acquire();
  const result = await conn.query(sql);  // If this throws, conn is never released
  pool.release(conn);
  return result;
}

// GOOD: finally guarantees cleanup
async function queryDatabase(sql: string) {
  const conn = await pool.acquire();
  try {
    return await conn.query(sql);
  } finally {
    pool.release(conn);  // Always runs, even on throw or abort
  }
}
```

### Using Symbol.dispose (TC39 Explicit Resource Management)

```typescript
// With the using declaration (when available)
async function queryDatabase(sql: string) {
  await using conn = await pool.acquire();  // Automatically disposed at block end
  return conn.query(sql);
}
```

## Pattern: Preventing Race Conditions

### Shared Mutable State

The most common async race condition: two async operations read-modify-write the same state.

```typescript
// RACE CONDITION: Two concurrent requests both read balance, both write
let balance = 100;

async function withdraw(amount: number) {
  const current = balance;       // Both read 100
  await validateFunds(current);  // Both pass validation
  balance = current - amount;    // Both write 50 (should be 0)
}

// Called concurrently:
await Promise.all([withdraw(50), withdraw(50)]);
// balance is 50, not 0!
```

**Fix: Use a mutex or serialize operations.**

```typescript
class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise(resolve => {
      this.queue.push(() => resolve(() => this.release()));
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

const balanceMutex = new AsyncMutex();

async function withdraw(amount: number) {
  const release = await balanceMutex.acquire();
  try {
    const current = balance;
    await validateFunds(current);
    balance = current - amount;
  } finally {
    release();
  }
}
```

### Database-Level Protection

For database operations, use transactions with appropriate isolation instead of application-level locks:

```sql
-- Use SELECT ... FOR UPDATE to lock the row during the transaction
BEGIN;
SELECT balance FROM accounts WHERE id = $1 FOR UPDATE;
-- No other transaction can read this row with FOR UPDATE until we commit
UPDATE accounts SET balance = balance - $2 WHERE id = $1;
COMMIT;
```

## Pattern: Debounce vs. Throttle

### Debounce

Delays execution until input stops changing. Resets the timer on each new input.

```typescript
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Use for: search-as-you-type, window resize, form auto-save
const debouncedSearch = debounce(search, 300);
```

### Throttle

Executes at most once per interval. Does not delay — fires immediately, then ignores calls until the interval passes.

```typescript
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= interval) {
      lastCall = now;
      fn(...args);
    }
  };
}

// Use for: scroll handlers, mouse move handlers, API polling
const throttledScroll = throttle(handleScroll, 100);
```

**Decision:**
- **Debounce** when you want the FINAL value after activity stops (search input, resize)
- **Throttle** when you want regular updates DURING activity (scroll position, mouse tracking)

## Pattern: Batching Concurrent Operations

When processing a large number of items concurrently, limit parallelism to prevent resource exhaustion.

```typescript
async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const promise = processor(item).then(result => {
      results.push(result);
      executing.delete(promise);
    });
    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// Process 100 items, 5 at a time
const results = await batchProcess(items, processItem, 5);
```

## Anti-patterns

- **Fire-and-forget promises.** `someAsyncOperation()` without `await` or `.catch()`. If it fails, the error is unhandled and may crash the process.
- **await in a loop when operations are independent.** `for (const item of items) { await process(item); }` runs sequentially. Use `Promise.all` or batched processing for independent operations.
- **Shared mutable state across async boundaries.** Any variable read and written by multiple concurrent async operations without a mutex or transaction is a race condition.
- **Missing AbortController cleanup.** Creating an AbortController timeout without clearing it on success leaks timers and causes spurious aborts.
- **Unhandled promise rejections.** Node.js will terminate the process on unhandled rejections in future versions. Every promise chain must have a `.catch()` or be inside a try/catch with `await`.
- **Mixing callbacks and promises.** Choose one. Convert callbacks to promises with `util.promisify` or manual wrapping. Never nest callbacks inside promise chains.

## Verification

Concurrency review is complete when:
1. Every promise is either awaited or has a `.catch()` handler
2. No shared mutable state is accessed from concurrent async operations without synchronization
3. Every acquired resource has a `finally` cleanup path
4. Cancellation is supported via AbortSignal for long-running operations
5. Independent operations use `Promise.all` or `Promise.allSettled`, not sequential `await`
6. Large batch operations limit concurrency to prevent resource exhaustion
7. Timeouts use AbortController with cleanup (clearTimeout in finally)
