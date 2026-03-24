---
name: error-handling-resilience
description: Error classification, recovery strategies, circuit breakers, retry patterns, and graceful degradation
category: reliability
triggers:
  - error handling
  - try catch
  - retry
  - circuit breaker
  - fallback
  - resilience
  - graceful degradation
  - timeout
chain_with:
  - api-integration-patterns
  - observability-patterns
---

# Error Handling and Resilience

## Purpose

Concrete patterns for handling errors intentionally — classifying them, choosing the right recovery strategy, and ensuring the system degrades gracefully instead of failing silently or cascading.

## When to Use

- When writing any code that calls external services or databases
- When designing error boundaries in an application
- When reviewing code with catch blocks
- When a system has silent failures or cascading outages

## Error Classification

Before writing a catch block, classify the error:

| Class | Retryable? | Example | Correct Response |
|---|---|---|---|
| **Transient** | Yes | Network timeout, 503, connection reset | Retry with backoff |
| **Rate-limited** | Yes, with delay | HTTP 429 | Wait for Retry-After, then retry |
| **Client error** | No | 400 validation, 404 not found | Return to caller as-is |
| **Server error** | Once | HTTP 500 (unknown) | Retry once, then fail |
| **Resource exhaustion** | No | OOM, disk full, pool empty | Alert, degrade |
| **Data integrity** | No | Constraint violation, checksum fail | Abort, alert |
| **Configuration** | No | Missing env var, bad config | Fail at startup, never at runtime |

**Decision rule:** If you cannot classify the error, it is a bug. Fix the classification, not the catch block.

## Pattern: Typed Error Hierarchy (TypeScript)

```typescript
// Base application error
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Specific error types
class ValidationError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', 400, false, cause);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`, 'NOT_FOUND', 404, false);
  }
}

class ExternalServiceError extends AppError {
  constructor(service: string, cause?: Error) {
    super(`${service} call failed`, 'EXTERNAL_SERVICE_ERROR', 502, true, cause);
  }
}

class RateLimitError extends AppError {
  constructor(public readonly retryAfter: number, cause?: Error) {
    super('Rate limited', 'RATE_LIMITED', 429, true, cause);
  }
}
```

**Why typed errors matter:** A catch block that checks `error instanceof ExternalServiceError` and retries is correct. A catch block that catches `Error` and retries everything will retry validation errors (wrong) and configuration errors (worse).

## Pattern: Retry with Exponential Backoff

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries: number;       // Default: 3
    baseDelay: number;        // Default: 100ms
    maxDelay: number;         // Default: 30000ms
    jitterMax: number;        // Default: 50ms
    isRetryable?: (error: Error) => boolean;  // Default: checks isRetryable property
  }
): Promise<T> {
  const { maxRetries = 3, baseDelay = 100, maxDelay = 30000, jitterMax = 50 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const retryable = options.isRetryable
        ? options.isRetryable(error as Error)
        : (error as any).isRetryable === true;

      if (!retryable || attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * jitterMax;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  throw new Error('Unreachable');
}
```

**Usage:**
```typescript
const user = await withRetry(
  () => externalApi.getUser(userId),
  { maxRetries: 3, baseDelay: 200, isRetryable: (e) => e instanceof ExternalServiceError }
);
```

## Pattern: Circuit Breaker

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeout: number = 30000,
  ) {}

  async execute<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
      } else {
        if (fallback) return fallback();
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback && this.state === 'open') return fallback();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

**Usage:**
```typescript
const stripeBreaker = new CircuitBreaker(5, 30000);

const charge = await stripeBreaker.execute(
  () => stripe.charges.create({ amount, currency }),
  () => ({ status: 'queued', message: 'Payment processing delayed' })
);
```

## Pattern: Graceful Degradation

```typescript
// Fallback hierarchy: try primary → try cache → try default → informative error
async function getRecommendations(userId: string): Promise<Recommendation[]> {
  // Level 1: Primary source
  try {
    return await recommendationService.getPersonalized(userId);
  } catch (error) {
    logger.warn('recommendation_service_failed', { user_id: userId, error: error.message });
  }

  // Level 2: Cached/stale data
  try {
    const cached = await cache.get(`recommendations:${userId}`);
    if (cached) {
      return { ...cached, stale: true };
    }
  } catch (cacheError) {
    logger.warn('recommendation_cache_failed', { user_id: userId });
  }

  // Level 3: Static default
  return getDefaultRecommendations();  // Pre-computed, always available
}
```

**Key:** Each level logs the degradation. The caller knows data may be stale. The user gets something useful instead of an error.

## Anti-patterns

### Empty Catch Block
```typescript
// NEVER: Error vanishes. System silently breaks.
try { await save(data); } catch (e) { }

// MINIMUM: Log, report, or return a meaningful failure
try {
  await save(data);
} catch (error) {
  logger.error('save_failed', { error: error.message, data_id: data.id });
  throw new AppError('Failed to save', 'SAVE_FAILED', 500, false, error);
}
```

### Catching Too Broadly
```typescript
// BAD: Retries everything, including validation errors and config errors
try { await processOrder(order); } catch (e) { await retry(processOrder, order); }

// GOOD: Only retry what is retryable
try {
  await processOrder(order);
} catch (error) {
  if (error instanceof ExternalServiceError) {
    return await withRetry(() => processOrder(order), { maxRetries: 2 });
  }
  throw error;  // Non-retryable errors propagate
}
```

### Swallowing Context
```typescript
// BAD: Original error lost
try { await db.query(sql); } catch (e) { throw new Error('Database error'); }

// GOOD: Chain the cause
try { await db.query(sql); } catch (e) { throw new AppError('Query failed', 'DB_ERROR', 500, true, e); }
```

### Retry Without Idempotency
```typescript
// DANGEROUS: If the first POST succeeded but the response was lost,
// retrying creates a duplicate order
await withRetry(() => api.post('/orders', orderData), { maxRetries: 3 });

// SAFE: Idempotency key ensures duplicates are detected server-side
const idempotencyKey = crypto.randomUUID();
await withRetry(
  () => api.post('/orders', orderData, { headers: { 'Idempotency-Key': idempotencyKey } }),
  { maxRetries: 3 }
);
```

## Verification

Error handling review is complete when:
1. Every catch block classifies the error before deciding what to do
2. No empty catch blocks exist
3. No catch-all blocks that retry everything
4. Every retried operation is idempotent or has an idempotency key
5. External calls have timeouts, retry policies, and circuit breakers
6. Graceful degradation exists for every non-critical dependency
7. Every error is logged with context (what failed, which request, what was attempted)
8. Error responses to users are informative but do not expose internals
