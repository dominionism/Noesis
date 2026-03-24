---
name: observability-patterns
description: Structured logging, metric design, alert creation, correlation IDs, and sensitive data protection in logs
category: operations
triggers:
  - logging
  - log level
  - monitoring
  - metrics
  - alerting
  - tracing
  - correlation ID
  - structured logging
  - what to log
chain_with:
  - error-handling-resilience
  - security-review
---

# Observability Patterns

## Purpose

Concrete patterns for logging, metrics, and alerting that make systems debuggable, monitorable, and secure. The goal is to answer operational questions within five minutes of asking them.

## When to Use

- When adding logging to new code
- When reviewing existing logging for quality
- When setting up monitoring and alerting for a service
- When an incident reveals gaps in observability

## Pattern: Structured Logging

### Format

Every log entry is a structured object, not a formatted string.

```typescript
// BAD: Unqueryable, unparseable, secrets may leak via string interpolation
console.log(`User ${user.email} logged in from ${req.ip} at ${new Date()}`);

// GOOD: Queryable, parseable, explicit field selection
logger.info('user_login', {
  user_id: user.id,          // Not email — PII minimization
  ip: req.ip,
  user_agent: req.headers['user-agent'],
  method: 'password',
});
```

### Event Naming Convention

Use `snake_case` event names that describe what happened, not what is about to happen:

```
GOOD: user_login, order_placed, payment_failed, cache_miss, migration_completed
BAD:  processing..., checking user, about to save, handleRequest, log
```

### Required Fields for Every Entry

```typescript
interface LogEntry {
  timestamp: string;      // ISO 8601 with timezone
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;        // Short event name (snake_case)
  service: string;        // Service name
  request_id: string;     // Correlation ID for request tracing
  environment: string;    // production, staging, development
  [key: string]: unknown; // Contextual fields
}
```

## Pattern: Sensitive Data Protection

### Allowlist Approach

Never dump entire objects. Explicitly select which fields to log.

```typescript
// DANGEROUS: req.body may contain password, credit card, SSN
logger.info('request_received', { body: req.body });

// SAFE: Explicitly select non-sensitive fields
logger.info('registration_attempt', {
  email: req.body.email,
  plan: req.body.plan,
  // password is never referenced — cannot accidentally appear
});
```

### Masking When Reference is Needed

```typescript
// Log that a token was used, not the token itself
logger.info('api_authenticated', {
  key_prefix: apiKey.substring(0, 8) + '...',
  key_id: keyRecord.id,
});

// Log card transaction, not the card number
logger.info('payment_charged', {
  card_last_four: card.number.slice(-4),
  card_brand: card.brand,
  amount_cents: charge.amount,
  currency: charge.currency,
});
```

### Sensitive Field Catalog

These field names must never appear in logs with their actual values:

| Category | Field names to block |
|---|---|
| **Authentication** | `password`, `passwd`, `secret`, `token`, `jwt`, `bearer`, `api_key`, `apikey`, `access_token`, `refresh_token`, `session_id`, `cookie` |
| **Financial** | `card_number`, `cvv`, `cvc`, `pan`, `account_number`, `routing_number`, `ssn`, `social_security` |
| **Personal** | `date_of_birth`, `drivers_license`, `passport_number`, `national_id` |
| **Infrastructure** | `connection_string`, `database_url`, `private_key`, `signing_key` |

## Pattern: Log Level Decision Tree

```
Is this an unrecoverable failure requiring human action?
  YES → ERROR (pages on-call if alerting is configured)
  NO  ↓

Is this a degraded condition that may become critical?
  YES → WARN (review during business hours)
  NO  ↓

Is this a significant business event or state transition?
  YES → INFO (audit trail, incident reconstruction)
  NO  ↓

Is this useful only when actively debugging?
  YES → DEBUG (off in production by default)
  NO  → Do not log it.
```

### Common Corrections

| Event | Wrong | Correct | Why |
|---|---|---|---|
| User enters invalid input | ERROR | DEBUG | Validation working correctly. Expected behavior. |
| Resource not found (404) | ERROR | DEBUG | Normal — the resource does not exist. |
| Rate limit applied to user | ERROR | WARN | System protecting itself. Worth trending. |
| External API returns 503 once | ERROR | WARN | Transient. Upgrade to ERROR if persistent/circuit-broken. |
| User login succeeded | DEBUG | INFO | Business event. Security audit trail. |
| Database query > 2 seconds | (not logged) | WARN | Performance degradation signal. |
| Background job completed | DEBUG | INFO | Operational visibility for job monitoring. |
| Cache hit | (not logged) | DEBUG | Useful for debugging cache behavior only. |

## Pattern: Correlation ID

### Implementation

```typescript
// Middleware: generate or propagate correlation ID
function correlationMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Make available to all downstream logging
  asyncLocalStorage.run({ requestId }, () => next());
}

// Logger: automatically include request ID
function createLogger(service: string) {
  return {
    info(message: string, context: Record<string, unknown> = {}) {
      const store = asyncLocalStorage.getStore();
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message,
        service,
        request_id: store?.requestId ?? 'no-request-context',
        ...context,
      }));
    },
    // ... warn, error, debug follow same pattern
  };
}
```

### Propagation to Downstream Services

```typescript
// When calling another service, pass the correlation ID
async function callPaymentService(orderId: string, amount: number) {
  const store = asyncLocalStorage.getStore();
  return fetch('https://payments.internal/charge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': store?.requestId ?? crypto.randomUUID(),
    },
    body: JSON.stringify({ orderId, amount }),
  });
}
```

### Correlation in Background Jobs

```typescript
// When enqueuing a job, include the originating request ID
await queue.add('process-order', {
  orderId: order.id,
  _requestId: req.requestId,  // Propagate correlation
});

// When processing, use it as the request ID for that job's logs
worker.on('process-order', async (job) => {
  const requestId = job.data._requestId ?? crypto.randomUUID();
  asyncLocalStorage.run({ requestId }, async () => {
    logger.info('order_processing_started', { order_id: job.data.orderId });
    // ... all logs in this job include the original request ID
  });
});
```

## Pattern: Metric Design

### Essential Metrics for Any Service

```
# Request rate and errors (RED metrics)
http_requests_total{method, endpoint, status_code}          # Counter
http_request_duration_seconds{method, endpoint}              # Histogram

# Dependency health
dependency_request_duration_seconds{dependency, operation}   # Histogram
dependency_errors_total{dependency, error_type}              # Counter

# Resource utilization
db_connection_pool_active{pool}                              # Gauge
db_connection_pool_idle{pool}                                # Gauge
cache_hit_total{cache}                                       # Counter
cache_miss_total{cache}                                      # Counter

# Business metrics (service-specific)
orders_placed_total                                          # Counter
payments_processed_total{status}                             # Counter
```

### Naming Rules

1. Use `snake_case` with `{namespace}_{subsystem}_{name}_{unit}` format
2. Include units in the name: `_seconds`, `_bytes`, `_total`
3. Use base units: seconds (not ms), bytes (not KB)
4. Counters end with `_total`
5. Use labels for dimensions, not separate metric names:
   ```
   GOOD: http_requests_total{status="200"}, http_requests_total{status="500"}
   BAD:  http_requests_200_total, http_requests_500_total
   ```

## Pattern: Alert Design

### Template

Every alert must specify:

```yaml
alert: HighErrorRate
description: "Error rate exceeds 5% for 5 minutes on {{ $labels.service }}"
condition: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
duration: 5m  # Must sustain for 5 minutes (not instantaneous spike)
severity: critical
owner: backend-team
runbook: |
  1. Check dashboard: <link>
  2. Check recent deployments: `git log --since="1 hour ago"`
  3. Check dependency health: <dependency dashboard link>
  4. If caused by a specific endpoint: check logs filtered by that endpoint
  5. If caused by a dependency: check if circuit breaker is open
  6. Escalation: page senior on-call if not resolved in 15 minutes
```

### Alert Anti-patterns

- **No duration filter.** Alert fires on every 1-second spike. Use `for: 5m` or equivalent.
- **No runbook.** Operator gets paged and does not know what to check first.
- **Alerting on metrics without context.** "Memory usage > 80%" — is this after a deployment? During a batch job? Is it growing or stable?
- **Too many alerts.** More than 2-3 actionable alerts per week per service means thresholds are wrong.
- **Alert on expected behavior.** Rate limit responses (429) are the system working correctly, not an error to alert on.

## Anti-patterns

- **Printf logging.** `log.info(f"Processing {item}")` — unparseable, unqueryable, may leak secrets.
- **Logging entire request/response objects.** Will eventually contain a secret you forgot to exclude.
- **ERROR level for expected conditions.** 404s, validation failures, rate limits are not errors.
- **No correlation ID.** Every request is an isolated log entry. Impossible to trace a request across services.
- **Metrics with high cardinality labels.** Using user_id or request_id as a metric label creates millions of time series. Use labels for bounded sets (status code, endpoint, service).
- **Alerts without owners.** Alert fires, nobody knows who should respond.
- **Logging in hot loops.** A log statement inside a loop that runs 10,000 times per request will overwhelm log storage and degrade performance. Log aggregates, not iterations.

## Verification

Observability review is complete when:
1. Every log entry is structured with required fields (timestamp, level, service, request_id, message)
2. No sensitive data appears in any log statement
3. Log levels match the decision tree (ERROR = action required, not "unexpected input")
4. Correlation IDs are generated at entry and propagated to all downstream calls
5. Every public endpoint has request duration and error rate metrics
6. Every external dependency has duration and error metrics
7. Every alert has an owner, runbook, and duration filter
8. No high-cardinality labels in metrics
