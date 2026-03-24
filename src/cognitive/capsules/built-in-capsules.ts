/**
 * Built-In Capsules — 7 task-class operating packs.
 *
 * Each capsule has 7 components:
 * - intent: What this capsule achieves
 * - assembly: How to structure the work
 * - examples: Exemplar patterns
 * - anti_patterns: What to avoid
 * - critic: Dimensions for critique
 * - grader: How to evaluate output
 * - memory_policy: What to remember after completion
 *
 * Capsules: api-workflow, creative-redesign, security-hardening,
 * performance-optimization, migration, testing-strategy, refactoring
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { DeepCapsuleInput, CapsuleComponentInput, CapsuleComponentType, SignFn } from '../types.js';
import { insertCapsule, insertComponent, getCapsuleByName } from './capsule-store.js';

// ---------------------------------------------------------------------------
// Capsule definitions
// ---------------------------------------------------------------------------

interface BuiltInCapsule {
  definition: DeepCapsuleInput;
  components: Record<CapsuleComponentType, string>;
}

const BUILT_IN_CAPSULES: BuiltInCapsule[] = [
  // -------------------------------------------------------------------------
  // 1. API Workflow
  // -------------------------------------------------------------------------
  {
    definition: {
      name: 'api-workflow',
      display_name: 'API Workflow',
      description: 'Structured approach for designing, implementing, and testing API endpoints with contract-first development.',
      trigger_patterns: [
        'api endpoint', 'rest api', 'graphql', 'api design',
        'endpoint implementation', 'api contract', 'openapi',
        'request handler', 'route handler', 'api integration',
      ],
    },
    components: {
      intent: `Design and implement API endpoints that are correct, secure, and well-documented.
Focus on contract-first development: define the interface before implementation.
Ensure every endpoint has validation, error handling, and appropriate status codes.`,

      assembly: `1. Define the API contract (request/response shapes, status codes, error formats)
2. Write input validation schemas
3. Implement the handler with proper error boundaries
4. Add authentication/authorization checks
5. Write integration tests covering happy path, edge cases, and error cases
6. Document the endpoint (OpenAPI or equivalent)`,

      examples: `Good: Define types first, then implement handler that maps cleanly to types.
Good: Return consistent error format across all endpoints.
Good: Use middleware for cross-cutting concerns (auth, logging, rate limiting).
Good: Version APIs from the start if external consumers exist.`,

      anti_patterns: `- Implementing before defining the contract
- Inconsistent error response formats across endpoints
- Missing input validation or relying solely on client-side validation
- Exposing internal error details in production responses
- Ignoring idempotency for mutating operations
- Hard-coding URLs or skipping proper status codes`,

      critic: `Evaluate against these dimensions:
1. Contract completeness: Are all request/response shapes defined?
2. Validation coverage: Is every input field validated?
3. Error handling: Are all failure modes handled with appropriate status codes?
4. Security: Auth checks, rate limiting, input sanitization?
5. Testability: Can the handler be tested in isolation?
6. Documentation: Is the API self-documenting?`,

      grader: `Grade on:
- Correctness: Does it implement the contract faithfully? (weight: 0.3)
- Security: Are OWASP API security guidelines followed? (weight: 0.25)
- Robustness: Error handling and edge cases? (weight: 0.2)
- Clarity: Is the code readable and maintainable? (weight: 0.15)
- Documentation: API docs and inline comments where needed? (weight: 0.1)`,

      memory_policy: `After completion, record:
- The API contract decisions made and why
- Any deviation from standard patterns and the rationale
- Edge cases discovered during implementation
- Performance characteristics if measured`,
    },
  },

  // -------------------------------------------------------------------------
  // 2. Creative Redesign
  // -------------------------------------------------------------------------
  {
    definition: {
      name: 'creative-redesign',
      display_name: 'Creative Redesign',
      description: 'Structured approach for UI/UX redesign work with design system compliance and accessibility.',
      trigger_patterns: [
        'redesign', 'ui redesign', 'ux improvement', 'visual refresh',
        'component redesign', 'layout redesign', 'design system',
        'user interface', 'user experience', 'frontend redesign',
      ],
    },
    components: {
      intent: `Execute a UI/UX redesign that improves usability, accessibility, and visual coherence.
Every design decision must be intentional and defensible. No decorative changes without purpose.
Output must be portfolio-quality and compliant with the project's design system.`,

      assembly: `1. Audit current state: identify pain points, accessibility issues, visual inconsistencies
2. Define design objectives: what specific problems are we solving?
3. Research: gather references, check design system constraints
4. Propose solution with mockup or detailed description
5. Implement component by component, testing each state
6. Verify: accessibility audit, responsive behavior, design system compliance`,

      examples: `Good: Replace a complex multi-step form with a progressive disclosure pattern, reducing cognitive load.
Good: Consolidate 5 inconsistent button styles into 3 design-system variants.
Good: Add proper loading/error/empty states to a data table that previously showed nothing.`,

      anti_patterns: `- Changing visuals without solving a real UX problem
- Breaking existing design system patterns without explicit approval
- Ignoring accessibility (contrast, keyboard nav, screen readers)
- Redesigning in isolation without considering adjacent components
- Adding animations or effects that serve no functional purpose
- Skipping responsive behavior or mobile considerations`,

      critic: `Evaluate against:
1. Problem-solution fit: Does the redesign solve the identified UX problem?
2. Design system compliance: Does it use existing tokens, spacing, typography?
3. Accessibility: WCAG AA compliance, keyboard navigation, focus management?
4. State coverage: Loading, error, empty, edge case states handled?
5. Responsive: Works across target breakpoints?
6. Performance: No unnecessary re-renders or layout thrashing?`,

      grader: `Grade on:
- UX improvement: Measurable improvement in usability? (weight: 0.3)
- Accessibility: WCAG AA compliance? (weight: 0.25)
- Design coherence: Consistent with design system? (weight: 0.2)
- Implementation quality: Clean, maintainable code? (weight: 0.15)
- State coverage: All UI states handled? (weight: 0.1)`,

      memory_policy: `After completion, record:
- Design decisions made and the UX rationale
- Accessibility improvements and any remaining gaps
- Design system deviations (if any) and why
- User feedback or testing observations`,
    },
  },

  // -------------------------------------------------------------------------
  // 3. Security Hardening
  // -------------------------------------------------------------------------
  {
    definition: {
      name: 'security-hardening',
      display_name: 'Security Hardening',
      description: 'Systematic security review and hardening following OWASP guidelines with defense-in-depth.',
      trigger_patterns: [
        'security review', 'security hardening', 'vulnerability fix',
        'owasp', 'penetration test', 'security audit',
        'authentication', 'authorization', 'input validation',
        'xss', 'csrf', 'injection', 'security vulnerability',
      ],
    },
    components: {
      intent: `Systematically identify and remediate security vulnerabilities.
Apply defense-in-depth: multiple layers of security controls.
Every fix must address a specific threat with a clear attack vector description.`,

      assembly: `1. Threat model: identify assets, trust boundaries, attack surfaces
2. Enumerate vulnerabilities against OWASP Top 10
3. Prioritize by severity and exploitability
4. Implement fixes with least-privilege principle
5. Add security tests (unit + integration)
6. Verify: no regressions, no new attack surfaces introduced`,

      examples: `Good: Replace string concatenation in SQL with parameterized queries.
Good: Add CSRF tokens to all state-changing endpoints.
Good: Implement rate limiting on authentication endpoints.
Good: Add Content-Security-Policy headers to prevent XSS.`,

      anti_patterns: `- Security through obscurity
- Client-side only validation
- Rolling custom cryptography
- Storing secrets in code or version control
- Overly permissive CORS configuration
- Ignoring security headers
- Logging sensitive data (passwords, tokens, PII)
- Disabling security features to make development easier`,

      critic: `Evaluate against OWASP Top 10:
1. A01 Broken Access Control: Least privilege enforced?
2. A02 Cryptographic Failures: Modern crypto, proper key management?
3. A03 Injection: All inputs parameterized/sanitized?
4. A04 Insecure Design: Defense-in-depth applied?
5. A05 Security Misconfiguration: Secure defaults?
6. A06 Vulnerable Components: Dependencies up to date?
7. A07 Auth Failures: Session handling secure?
8. A08 Integrity Failures: Signed/verified updates?
9. A09 Logging Failures: Security events logged, no sensitive data?
10. A10 SSRF: Outbound requests restricted?`,

      grader: `Grade on:
- Threat coverage: All identified threats addressed? (weight: 0.3)
- Implementation correctness: Fixes actually prevent the attack? (weight: 0.3)
- Defense depth: Multiple layers of protection? (weight: 0.2)
- Test coverage: Security tests for each fix? (weight: 0.1)
- Documentation: Threat model and decisions recorded? (weight: 0.1)`,

      memory_policy: `After completion, record:
- Vulnerabilities found and severity
- Fixes applied with OWASP category mapping
- Remaining risks and accepted trade-offs
- Security testing approach used`,
    },
  },

  // -------------------------------------------------------------------------
  // 4. Performance Optimization
  // -------------------------------------------------------------------------
  {
    definition: {
      name: 'performance-optimization',
      display_name: 'Performance Optimization',
      description: 'Data-driven performance optimization with measurement-first approach.',
      trigger_patterns: [
        'performance', 'optimization', 'slow', 'latency',
        'throughput', 'bottleneck', 'profiling', 'benchmark',
        'memory usage', 'cpu usage', 'load time', 'response time',
      ],
    },
    components: {
      intent: `Improve system performance through measurement-driven optimization.
Never optimize without profiling first. Every change must have before/after metrics.
Target the actual bottleneck, not assumed hot paths.`,

      assembly: `1. Define performance targets (latency, throughput, memory)
2. Profile: measure current state with production-representative load
3. Identify bottleneck: find the actual constraint, not the assumed one
4. Analyze: understand why the bottleneck exists
5. Implement targeted fix
6. Measure again: verify improvement with same profiling methodology
7. Check for regressions in other dimensions`,

      examples: `Good: Profile shows 80% of latency in N+1 queries; batch into single query, 10x improvement.
Good: Memory profiling reveals leak from unclosed event listeners; fix and verify heap stabilizes.
Good: Replace synchronous file reads in hot path with buffered async reads.`,

      anti_patterns: `- Optimizing without profiling first
- Premature optimization of non-bottleneck code
- Sacrificing readability for marginal gains
- Caching everything without measuring if it helps
- Optimizing for micro-benchmarks that do not reflect production load
- Adding complexity without proportional performance benefit`,

      critic: `Evaluate against:
1. Measurement methodology: Before/after metrics with same methodology?
2. Bottleneck identification: Is the actual bottleneck being addressed?
3. Trade-off analysis: What is gained vs what is lost (readability, complexity)?
4. Regression check: Other performance dimensions unaffected?
5. Sustainability: Will this optimization hold under growth?
6. Correctness: Functional behavior unchanged?`,

      grader: `Grade on:
- Measurable improvement: Quantified before/after metrics? (weight: 0.3)
- Correct targeting: Addressed actual bottleneck? (weight: 0.25)
- Code quality: Optimization does not degrade readability? (weight: 0.2)
- Methodology: Proper profiling and measurement? (weight: 0.15)
- Documentation: Performance characteristics recorded? (weight: 0.1)`,

      memory_policy: `After completion, record:
- Before/after performance metrics
- The actual bottleneck identified (vs initial assumption)
- Optimization technique used and why
- Any trade-offs accepted`,
    },
  },

  // -------------------------------------------------------------------------
  // 5. Migration
  // -------------------------------------------------------------------------
  {
    definition: {
      name: 'migration',
      display_name: 'Migration',
      description: 'Safe, incremental migration of data, schemas, APIs, or dependencies with rollback planning.',
      trigger_patterns: [
        'migration', 'database migration', 'schema migration',
        'data migration', 'api migration', 'version upgrade',
        'dependency upgrade', 'framework migration', 'legacy',
        'backward compatible', 'breaking change',
      ],
    },
    components: {
      intent: `Execute a safe migration with zero data loss and minimal downtime.
Every migration step must be reversible or have a documented rollback plan.
Incremental progress: each step should be independently deployable and verifiable.`,

      assembly: `1. Inventory: catalog everything that needs to change
2. Dependency analysis: map what depends on what is being migrated
3. Design migration strategy: big bang vs incremental vs strangler fig
4. Write rollback plan for each step
5. Implement migration scripts/code
6. Test in staging with production-representative data
7. Execute with monitoring and rollback readiness`,

      examples: `Good: Add new column with default, backfill, then switch reads, then drop old column.
Good: Implement adapter pattern to support both old and new API during transition.
Good: Use feature flags to gradually shift traffic to migrated path.`,

      anti_patterns: `- Big bang migrations with no rollback plan
- Skipping staging environment testing
- Migrating without a complete inventory of dependencies
- Assuming migration scripts work on first try
- Not monitoring after migration completes
- Ignoring backward compatibility during transition period
- Deleting old code/data before verifying new path works`,

      critic: `Evaluate against:
1. Rollback plan: Can every step be reversed?
2. Data safety: Zero data loss guaranteed?
3. Incremental: Each step independently deployable?
4. Dependency coverage: All consumers accounted for?
5. Testing: Tested with production-representative data?
6. Monitoring: Can we detect failures during and after migration?`,

      grader: `Grade on:
- Safety: Zero data loss, rollback plan exists? (weight: 0.3)
- Incrementality: Steps are independently deployable? (weight: 0.25)
- Completeness: All dependencies accounted for? (weight: 0.2)
- Testing: Migration tested with realistic data? (weight: 0.15)
- Documentation: Migration runbook and decision log? (weight: 0.1)`,

      memory_policy: `After completion, record:
- Migration strategy chosen and why
- Steps executed and any that required rollback
- Issues discovered during migration
- Post-migration verification results`,
    },
  },

  // -------------------------------------------------------------------------
  // 6. Testing Strategy
  // -------------------------------------------------------------------------
  {
    definition: {
      name: 'testing-strategy',
      display_name: 'Testing Strategy',
      description: 'Comprehensive test design covering unit, integration, and edge cases with TDD methodology.',
      trigger_patterns: [
        'testing', 'test strategy', 'test coverage', 'unit test',
        'integration test', 'e2e test', 'tdd', 'test driven',
        'test suite', 'test plan', 'coverage report',
      ],
    },
    components: {
      intent: `Design and implement a testing strategy that provides confidence in correctness.
Tests as documentation: each test should clearly communicate expected behavior.
Follow the testing pyramid: many unit tests, fewer integration, minimal e2e.`,

      assembly: `1. Identify behaviors to test (not implementation details)
2. Design test cases: happy path, edge cases, failure modes
3. Write tests first (TDD red-green-refactor)
4. Implement minimal code to pass
5. Refactor with test safety net
6. Review coverage gaps and add targeted tests`,

      examples: `Good: Test the public API contract, not internal helper methods.
Good: Each test has a single clear assertion about one behavior.
Good: Edge case tests for boundary values, empty inputs, concurrent access.
Good: Integration tests use real database, not mocks, for data layer.`,

      anti_patterns: `- Testing implementation details instead of behavior
- Tests that pass but do not actually verify anything meaningful
- Over-mocking that hides integration issues
- Flaky tests that are ignored instead of fixed
- Measuring coverage percentage without evaluating coverage quality
- Writing tests after implementation without considering edge cases
- Tests that depend on execution order`,

      critic: `Evaluate against:
1. Behavior focus: Tests verify behavior, not implementation?
2. Coverage quality: Critical paths and edge cases covered?
3. Isolation: Tests do not depend on each other?
4. Readability: Each test is self-documenting?
5. Reliability: No flaky tests?
6. Speed: Test suite runs in reasonable time?
7. Maintenance: Tests will not break on refactoring?`,

      grader: `Grade on:
- Behavior coverage: Critical behaviors tested? (weight: 0.3)
- Edge cases: Boundary and failure modes covered? (weight: 0.25)
- Test quality: Clear, isolated, reliable? (weight: 0.2)
- TDD adherence: Tests written before implementation? (weight: 0.15)
- Documentation value: Tests communicate intent? (weight: 0.1)`,

      memory_policy: `After completion, record:
- Testing strategy decisions and rationale
- Edge cases discovered during test design
- Coverage gaps known and accepted
- Testing patterns that worked well for this codebase`,
    },
  },

  // -------------------------------------------------------------------------
  // 7. Refactoring
  // -------------------------------------------------------------------------
  {
    definition: {
      name: 'refactoring',
      display_name: 'Refactoring',
      description: 'Disciplined code restructuring that improves internal quality without changing external behavior.',
      trigger_patterns: [
        'refactor', 'refactoring', 'code cleanup', 'technical debt',
        'code smell', 'extract method', 'rename', 'restructure',
        'simplify', 'decompose', 'consolidate', 'deduplicate',
      ],
    },
    components: {
      intent: `Improve code structure without changing external behavior.
Every refactoring must be motivated by a specific code quality problem.
The test suite must pass before and after every refactoring step.`,

      assembly: `1. Identify the specific code smell or structural problem
2. Ensure adequate test coverage exists (add tests if needed)
3. Apply the smallest refactoring that addresses the problem
4. Run tests after each step
5. Repeat until the structural issue is resolved
6. Verify: no behavioral changes, improved readability/maintainability`,

      examples: `Good: Extract a 200-line method into 4 focused functions with clear names.
Good: Replace a switch statement with polymorphism when new cases are being added frequently.
Good: Consolidate 3 near-identical implementations into a shared utility.`,

      anti_patterns: `- Refactoring without test coverage
- Changing behavior during a refactoring (mixing refactoring with feature work)
- Over-abstracting: creating helpers for one-time operations
- Refactoring code that is about to be deleted or replaced
- Making the code more "clever" instead of more readable
- Premature generalization based on hypothetical future requirements`,

      critic: `Evaluate against:
1. Motivation: Is there a clear code quality problem being solved?
2. Behavior preservation: External behavior unchanged?
3. Test safety: Tests pass before and after?
4. Incremental: Each step is small and verifiable?
5. Readability: Is the result actually easier to understand?
6. Scope discipline: No feature changes mixed in?`,

      grader: `Grade on:
- Structural improvement: Is the code objectively better structured? (weight: 0.3)
- Behavior preservation: External behavior unchanged? (weight: 0.25)
- Readability: Easier to understand? (weight: 0.2)
- Test discipline: Tests green at every step? (weight: 0.15)
- Scope: No scope creep or behavior changes? (weight: 0.1)`,

      memory_policy: `After completion, record:
- Code smells identified and addressed
- Refactoring patterns applied
- Lessons about this codebase's structure
- Any technical debt remaining and why`,
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed all built-in capsules into the database. Idempotent — skips
 * capsules that already exist by name.
 *
 * @returns The number of capsules newly created.
 */
export function seedBuiltInCapsules(
  db: DatabaseConnection,
  sign: SignFn,
): number {
  let created = 0;

  for (const builtin of BUILT_IN_CAPSULES) {
    // Skip if already seeded
    if (getCapsuleByName(db, builtin.definition.name)) continue;

    // Insert capsule
    const capsule = insertCapsule(db, builtin.definition, sign);

    // Insert all 7 components
    const componentTypes: CapsuleComponentType[] = [
      'intent', 'assembly', 'examples', 'anti_patterns',
      'critic', 'grader', 'memory_policy',
    ];

    for (const type of componentTypes) {
      const content = builtin.components[type];
      if (content) {
        const input: CapsuleComponentInput = {
          capsule_id: capsule.id,
          component_type: type,
          content,
        };
        insertComponent(db, input, sign);
      }
    }

    created++;
  }

  return created;
}

/**
 * Get all built-in capsule names.
 */
export function getBuiltInCapsuleNames(): string[] {
  return BUILT_IN_CAPSULES.map(c => c.definition.name);
}

/**
 * Get the count of built-in capsules.
 */
export function getBuiltInCapsuleCount(): number {
  return BUILT_IN_CAPSULES.length;
}
