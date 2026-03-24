---
name: api-integration-patterns
description: Patterns for safely consuming external APIs including retry, circuit breaking, timeout budgeting, idempotency, and error mapping
category: integration
triggers:
  - API integration
  - external service
  - third party
  - webhook
  - retry
  - idempotency
  - rate limit
  - SDK
  - API client
chain_with:
  - error-handling-resilience
  - security-review
---

# API Integration Patterns

## Purpose

Concrete patterns for consuming external APIs safely. Not designing your own API — integrating with someone else's. Covers retry, circuit breaking, timeout budgeting, idempotency, webhook verification, rate limit handling, and error mapping.

## When to Use

- When integrating with any third-party API (Stripe, Twilio, SendGrid, etc.)
- When building service-to-service communication in a microservice architecture
- When consuming webhooks from external providers
- When wrapping an API client with resilience patterns

## Pattern: API Client Structure

Wrap every external API behind a dedicated client module. Never call `fetch` directly from business logic.

```typescript
// BAD: fetch scattered through business logic
async function createUser(data: UserInput) {
  const emailResult = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SENDGRID_KEY}` },
    body: JSON.stringify({ to: data.email, ... }),
  });
  // Error handling mixed with business logic
}

// GOOD: Dedicated client with resilience built in
class EmailClient {
  private breaker = new CircuitBreaker(5, 30000);

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    await this.breaker.execute(
      () => withRetry(
        () => this.send({ to, subject: 'Welcome', template: 'welcome', data: { name } }),
        { maxRetries: 2, isRetryable: (e) => e instanceof TransientError }
      ),
      () => { /* fallback: queue for later */ }
    );
  }

  private async send(params: EmailParams): Promise<void> {
    const response = await fetch(this.baseUrl + '/v3/mail/send', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(5000),  // 5s timeout
    });
    if (!response.ok) throw this.mapError(response);
  }
}
```

**Benefits:** Retry, circuit breaking, timeout, and error mapping are implemented once. Business logic calls `emailClient.sendWelcomeEmail()` without knowing about resilience.

## Pattern: Error Mapping

Never expose third-party error structures to your callers. Map external errors to your domain.

```typescript
private mapError(response: Response): AppError {
  switch (response.status) {
    case 400: return new ValidationError(`Email API rejected request: ${response.statusText}`);
    case 401: return new ConfigurationError('Email API key is invalid');
    case 403: return new ConfigurationError('Email API key lacks required permissions');
    case 429: {
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10);
      return new RateLimitError(retryAfter);
    }
    case 500:
    case 502:
    case 503:
      return new TransientError(`Email API returned ${response.status}`);
    default:
      return new ExternalServiceError('email-api', `Unexpected status: ${response.status}`);
  }
}
```

**Why:** Your business logic should handle `RateLimitError` and `TransientError`, not `{ status: 429, message: "Too Many Requests", errors: [...] }`. The external format can change; your error types should not.

## Pattern: Timeout Budgeting

When a user request calls multiple external services, budget the total timeout across all calls.

```typescript
async function processCheckout(order: Order): Promise<CheckoutResult> {
  const totalBudget = 8000; // 8 seconds total for the user request
  const start = Date.now();

  // Step 1: Validate inventory (budget: 2s)
  const inventory = await inventoryClient.check(order.items, {
    timeout: Math.min(2000, totalBudget - (Date.now() - start)),
  });

  // Step 2: Charge payment (budget: 3s)
  const remaining = totalBudget - (Date.now() - start);
  if (remaining < 500) throw new TimeoutError('Insufficient time budget for payment');
  const payment = await paymentClient.charge(order.total, {
    timeout: Math.min(3000, remaining),
  });

  // Step 3: Send confirmation (budget: 2s, non-critical — use circuit breaker fallback)
  const remaining2 = totalBudget - (Date.now() - start);
  await emailClient.sendConfirmation(order, {
    timeout: Math.min(2000, remaining2),
  }).catch(() => { /* queue for later — non-critical */ });

  return { orderId: order.id, paymentId: payment.id };
}
```

**Key rule:** Each step gets the MINIMUM of its allocated budget and the remaining total budget. If an early step takes longer than expected, later steps get less time — they do not extend the total.

## Pattern: Idempotency Keys

For non-idempotent operations (creating a charge, sending an email, placing an order), use idempotency keys to prevent duplicates on retry.

```typescript
async function chargeCustomer(orderId: string, amount: number): Promise<Charge> {
  // Generate a deterministic idempotency key from the operation's identity
  const idempotencyKey = `charge-${orderId}`;  // Same order always uses same key

  return withRetry(
    () => stripe.charges.create(
      { amount, currency: 'usd', customer: customerId },
      { idempotencyKey }  // Stripe deduplicates by this key
    ),
    { maxRetries: 3, isRetryable: (e) => e instanceof TransientError }
  );
}
```

**Key generation rules:**
- Deterministic from the operation identity (order ID, user ID + action), not random
- Same key for same logical operation, even across process restarts
- Different key for different operations (do not reuse keys)
- Store the key if you need to correlate the retry with the original attempt

## Pattern: Webhook Verification

Always verify webhook signatures before processing. Never trust the payload without verification.

```typescript
function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  tolerance: number = 300  // 5 minutes
): boolean {
  // Step 1: Parse the signature header
  const [timestamp, hash] = parseSignatureHeader(signature);

  // Step 2: Check timestamp tolerance (prevent replay attacks)
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (age > tolerance) {
    throw new Error('Webhook timestamp outside tolerance window');
  }

  // Step 3: Compute expected signature
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  // Step 4: Timing-safe comparison (prevent timing attacks)
  const isValid = crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(expected, 'hex')
  );

  if (!isValid) throw new Error('Webhook signature verification failed');
  return true;
}
```

**Critical rules:**
- Use `crypto.timingSafeEqual`, never `===` for signature comparison (timing attack prevention)
- Always check timestamp to prevent replay attacks
- Use the raw body (Buffer), not parsed JSON, for signature computation
- Store the webhook secret in a secret manager, not in code

## Pattern: Rate Limit Handling

```typescript
async function withRateLimitHandling<T>(
  operation: () => Promise<T>,
  options: { maxWait: number }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RateLimitError) {
      const waitTime = Math.min(error.retryAfter * 1000, options.maxWait);
      if (waitTime > options.maxWait) {
        throw new Error(`Rate limited. Retry after ${error.retryAfter}s exceeds max wait.`);
      }
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return operation();  // One retry after waiting
    }
    throw error;
  }
}
```

**Rules:**
1. Always respect `Retry-After` headers when present
2. Set a maximum wait time — do not wait indefinitely
3. If the wait exceeds the caller's budget, fail immediately with a clear message
4. Log rate limit events as WARN — they indicate you may need to optimize call patterns or request a higher limit

## SDK vs. Raw HTTP Decision

| Factor | Use SDK | Use Raw HTTP |
|---|---|---|
| **Official, maintained SDK exists** | Yes | — |
| **SDK is unmaintained (> 12 months no update)** | — | Yes |
| **You need only 1-2 endpoints** | — | Probably (SDK adds a dependency for minimal use) |
| **You need automatic retry/pagination** | Yes (if SDK provides it) | Build it yourself |
| **SDK has CVEs** | — | Yes, until patched |
| **You need precise control over headers/timeouts** | — | Yes (SDKs may hide these) |
| **Team is familiar with the SDK** | Yes | — |

**Default:** Use the official SDK if it exists and is maintained. Wrap it in your own client class so you can swap implementations later.

## Anti-patterns

- **Calling fetch directly from business logic.** No retry, no circuit breaking, no timeout, no error mapping. Every call site reinvents resilience badly.
- **Exposing third-party error formats to callers.** Your code becomes coupled to the external API's error schema.
- **Retrying non-idempotent operations without idempotency keys.** Duplicate charges, duplicate emails, duplicate records.
- **No timeout on external calls.** A hung external API blocks your entire request, then your connection pool, then your service.
- **Processing webhooks without signature verification.** Anyone can POST to your webhook URL and inject fake events.
- **Hard-coding API URLs.** Use configuration. Environments (staging, production) have different URLs.
- **Logging API keys or tokens in request/response logs.** Mask sensitive headers.

## Verification

API integration review is complete when:
1. Every external call is wrapped in a dedicated client module
2. Every client has timeout, retry (for idempotent ops), and circuit breaker
3. External errors are mapped to internal domain errors
4. Non-idempotent operations use idempotency keys for retry safety
5. Webhook endpoints verify signatures with timing-safe comparison
6. Rate limit responses are handled (respect Retry-After, log as WARN)
7. API keys and tokens are not logged or exposed in error messages
8. Timeout budgets are allocated across sequential external calls
