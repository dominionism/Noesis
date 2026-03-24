---
name: api-workflow
description: Context assembly for API design, API integration, and schema/contract-heavy backend tasks
triggers:
  - API design
  - API integration
  - REST
  - GraphQL
  - schema
  - contract
  - endpoint
---

# API Workflow Capsule

## Intent

Activate when the task involves designing, building, or integrating APIs. This includes REST endpoint design, GraphQL schema work, third-party API integration, and any contract-heavy backend task where the interface specification drives the implementation.

## Assembly

When this capsule is activated, assemble the following context:

1. **Existing API patterns.** Search the codebase for existing endpoint definitions, response formats, error handling patterns, and authentication middleware. New APIs must be consistent with existing ones.
2. **Interface definitions.** Gather relevant type definitions, schemas, or contract specifications (OpenAPI, GraphQL SDL, Protobuf).
3. **Failure patterns.** Load known API-related failures from failure-patterns or lessons-learned (e.g., past issues with pagination, rate limits, error mapping).
4. **Verification expectations.** Determine how API changes are tested in this project (integration tests, contract tests, manual testing).

### Required Inputs Before Starting

| Input | Why Required |
|---|---|
| **Contract target** | What the API should accept and return (request/response shapes) |
| **Edge cases** | Empty results, invalid input, unauthorized access, rate limits, timeout |
| **Error behavior** | How each error class is communicated to the caller |
| **Verification plan** | How the implementation will be tested |

## Anti-patterns

Reject output that exhibits:

- **Vague contracts.** "Returns user data" without specifying the shape, required fields, or nullable fields
- **Missing edge-case behavior.** Happy path only — no specification for empty results, validation errors, or service failures
- **Implementation without verification.** Code without tests or a testing plan
- **Ignoring existing patterns.** Introducing a new response format or error structure when the codebase already has an established convention
- **Leaking internals.** Exposing database IDs, internal error messages, or implementation details in API responses

## Quality Criteria

API work passes the quality gate when:

1. **Contract clarity.** Every endpoint has defined request shape, response shape, status codes, and error format
2. **Edge coverage.** Empty results, validation errors, auth failures, and service unavailability are all specified
3. **Test adequacy.** Integration tests cover happy path, error paths, and at least one edge case per endpoint
4. **Pattern consistency.** New endpoints follow established codebase conventions for routing, validation, error handling, and response format
5. **Security.** Input validation, authentication, authorization, and rate limiting are addressed
