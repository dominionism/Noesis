/**
 * Built-In Skills — 17 core executable skills.
 *
 * Categories:
 * - Workflow (5): create-plan, implement-plan, iterate-plan, validate-plan, tdd-cycle
 * - Quality (3): code-review, rpi-critique, code-analysis
 * - Research (2): research-codebase, prompt-handoff-optimizer
 * - Testing (3): javascript-testing-patterns, python-testing-patterns, e2e-testing-patterns
 * - Design (2): frontend-design, superdesign
 * - Backend (2): api-design-principles, supabase-postgres-best-practices
 *
 * Each skill encodes a proven workflow with trigger conditions,
 * anti-patterns, behavioral rules, and chain_with references.
 */

import type { DatabaseConnection } from '../../core/database.js';
import type { ExecutableSkillInput, SignFn } from '../types.js';
import { insertSkill, getSkillByName } from './skill-store.js';

// ---------------------------------------------------------------------------
// Skill definitions
// ---------------------------------------------------------------------------

const BUILT_IN_SKILLS: ExecutableSkillInput[] = [
  // -----------------------------------------------------------------------
  // Workflow Skills (5)
  // -----------------------------------------------------------------------
  {
    name: 'create-plan',
    description: 'Create a structured implementation plan from task requirements. Produces a phased plan with dependencies, verification steps, and risk assessment.',
    category: 'workflow',
    trigger_conditions: [
      'create plan', 'make a plan', 'implementation plan',
      'design approach', 'plan the work', 'break down task',
    ],
    anti_patterns: [
      'Plans without verification steps',
      'Monolithic plans that cannot be executed incrementally',
      'Plans that skip dependency analysis',
      'Over-planning simple tasks',
    ],
    rules: [
      'Every plan must include verification criteria for each phase',
      'Plans must identify dependencies between phases',
      'Plans must include risk assessment for non-trivial tasks',
    ],
    chain_with: ['validate-plan', 'implement-plan'],
    content: `# Create Plan Skill

## Initial Response
When invoked, gather all relevant context before planning:
1. Read any provided spec/brief files FULLY — never partially
2. Load prior decisions and constraints from memory
3. Discover project skills and conventions
4. Classify the discovery depth needed (shallow/moderate/deep)

## Step 1: Context Gathering & Initial Analysis
1. Read all mentioned files immediately and FULLY
2. Research the codebase to understand current implementation:
   - Find all files related to the task
   - Trace data flow and key functions
   - Identify existing patterns to follow
3. Analyze and verify understanding:
   - Cross-reference requirements with actual code
   - Identify discrepancies or misunderstandings
   - Note assumptions that need verification
4. Present informed understanding with focused questions:
   - Current implementation details with file references
   - Relevant patterns or constraints discovered
   - Only ask questions that research could not answer

## Step 2: Research & Discovery
1. If the user corrects any misunderstanding, verify the correction yourself
2. Research different aspects of the task concurrently
3. Present findings and design options with pros/cons
4. Get alignment on approach before proceeding

## Step 3: Plan Structure Development
1. Create initial plan outline with phases and deliverables
2. Get feedback on structure before writing details
3. Iterate on phasing and granularity

## Step 4: Detailed Plan Writing
Write the plan with this structure:
- **Overview**: Brief description of what and why
- **Current State Analysis**: What exists now, what is missing
- **Desired End State**: Specification of the end state and verification
- **Implementation Phases**: Each phase with tasks, dependencies, verification
- **Risk Assessment**: What can go wrong and mitigation strategies

## Rules
- Every phase must include verification criteria
- Dependencies between phases must be explicit
- No phase should have more than 5 tasks
- Plans must include a premortem: "if this fails, why?"`,
  },

  {
    name: 'implement-plan',
    description: 'Execute an implementation plan phase by phase, with verification at each step and deviation handling.',
    category: 'workflow',
    trigger_conditions: [
      'implement plan', 'execute plan', 'follow plan',
      'carry out plan', 'work the plan', 'start implementation',
    ],
    anti_patterns: [
      'Skipping verification between phases',
      'Deviating from plan without documenting why',
      'Implementing multiple phases simultaneously',
      'Ignoring blocked phases instead of resolving blockers',
    ],
    rules: [
      'Execute one phase at a time',
      'Verify each phase before starting the next',
      'Document any deviations from the plan',
      'Stop and reassess if a phase fails verification',
    ],
    chain_with: ['validate-plan', 'tdd-cycle'],
    content: `# Implement Plan Skill

## Before Starting
1. Load the plan and verify it has been validated
2. Discover project context: read project skills, rules, and conventions
3. Load relevant decisions from memory
4. Identify the current phase and task

## Execution Process
1. **Read the active phase**: Understand deliverables, dependencies, and verification criteria
2. **Check prerequisites**: Verify all dependencies are satisfied before starting
3. **Execute one task at a time**: Never batch multiple tasks
4. **Run verification after each task**: Use the plan's verification criteria
5. **Handle failures**: If verification fails, diagnose the root cause before retrying
6. **Log deviations**: Document any deviation from the plan with rationale
7. **Checkpoint progress**: Record completion before moving to the next task

## Deviation Handling
- **Minor** (naming, ordering, formatting): Auto-fix, log, and continue
- **Moderate** (different approach, unexpected dependency): Document rationale, continue with caution
- **Major** (blocked, scope change, fundamental issue): STOP execution. Trigger plan iteration.

## Integration with Other Skills
- After completing a phase, chain to **validate-plan** to verify the full plan still holds
- If tests are needed, chain to **tdd-cycle** for test-first implementation
- If code quality review is needed, chain to **code-review**

## Rules
- Execute ONE phase at a time
- NEVER skip verification between phases
- Document every deviation with rationale
- Stop and reassess if any phase fails verification twice`,
  },

  {
    name: 'iterate-plan',
    description: 'Revise an existing plan based on new information, failed verifications, or changed requirements.',
    category: 'workflow',
    trigger_conditions: [
      'revise plan', 'update plan', 'iterate plan',
      'plan needs changes', 'adjust approach', 'replan',
    ],
    anti_patterns: [
      'Rewriting the entire plan instead of targeted updates',
      'Losing track of what changed and why',
      'Iterating without root cause analysis of why the plan failed',
    ],
    rules: [
      'Identify what specific part of the plan needs revision',
      'Document the reason for each change',
      'Preserve working phases when possible',
    ],
    chain_with: ['validate-plan'],
    content: `# Iterate Plan Skill

## Process
1. Identify what triggered the iteration (failure, new info, scope change)
2. Analyze which phases are affected
3. Preserve unaffected phases
4. Revise affected phases with updated constraints
5. Re-validate the full plan for consistency
6. Document changes with rationale`,
  },

  {
    name: 'validate-plan',
    description: 'Adversarial validation of a plan against codebase reality, dependencies, edge cases, and scope realism.',
    category: 'workflow',
    trigger_conditions: [
      'validate plan', 'review plan', 'check plan',
      'critique plan', 'plan review', 'is this plan sound',
    ],
    anti_patterns: [
      'Rubber-stamping plans without critical analysis',
      'Validating against assumptions instead of codebase reality',
      'Missing dependency analysis',
    ],
    rules: [
      'Check every phase against actual codebase state',
      'Verify dependency ordering is correct',
      'Flag unrealistic scope estimates',
      'Check for missing edge cases',
    ],
    chain_with: ['iterate-plan'],
    content: `# Validate Plan Skill

## Validation Dimensions
1. Codebase reality: Do the files and structures referenced actually exist?
2. Dependencies: Are phase dependencies correctly ordered?
3. Edge cases: Are boundary conditions and failure modes addressed?
4. Approach validity: Is the technical approach sound?
5. Premortem: What could go wrong?
6. Scope realism: Is each phase achievable in a single iteration?
7. Memory compliance: Does the plan align with learned lessons?`,
  },

  {
    name: 'tdd-cycle',
    description: 'Test-driven development cycle: red-green-refactor with behavior-focused test design.',
    category: 'workflow',
    trigger_conditions: [
      'tdd', 'test driven', 'red green refactor',
      'write tests first', 'test-first', 'behavior driven',
    ],
    anti_patterns: [
      'Writing implementation before tests',
      'Testing implementation details instead of behavior',
      'Skipping the refactor step',
      'Writing tests that always pass',
    ],
    rules: [
      'Write a failing test first (Red)',
      'Write minimal code to make it pass (Green)',
      'Refactor with confidence from the test suite (Refactor)',
      'Each cycle should take minutes, not hours',
    ],
    chain_with: ['code-review'],
    content: `# TDD Cycle Skill

## The Red-Green-Refactor Loop
### RED: Write a Failing Test
1. Write a test that describes the desired behavior
2. Run the test — it MUST fail (if it passes, the test is wrong)
3. The failure message should clearly describe what is missing

### GREEN: Make It Pass
1. Write the MINIMUM code to make the test pass
2. Do not optimize, do not refactor, do not add features
3. The only goal is a green test

### REFACTOR: Clean Up
1. With a green test suite, refactor the implementation
2. Remove duplication, improve naming, extract abstractions
3. Run tests after every change — they must stay green
4. Each refactoring step should be small and safe

## Test Design Principles
- **Test behavior, not implementation**: Test what the code does, not how
- **One logical assertion per test**: Each test verifies one behavior
- **Descriptive test names**: "should return empty array when no items match"
- **Arrange-Act-Assert**: Clear structure in every test
- **Edge cases first**: Empty, null, boundary, error, concurrent

## When to Use TDD
- New features with clear requirements
- Bug fixes (write the failing test that reproduces the bug first)
- Refactoring (write characterization tests before changing code)

## When NOT to Use TDD
- Exploratory spikes (write tests after, then refactor)
- Pure UI layout (use visual testing instead)
- One-off scripts with no reuse expectation`,
  },

  // -----------------------------------------------------------------------
  // Quality Skills (3)
  // -----------------------------------------------------------------------
  {
    name: 'code-review',
    description: 'Structured code review covering correctness, security, readability, and maintainability.',
    category: 'quality',
    trigger_conditions: [
      'code review', 'review code', 'review changes',
      'review pull request', 'check code quality', 'review diff',
    ],
    anti_patterns: [
      'Style-only reviews that miss logic bugs',
      'Rubber-stamping without reading the code',
      'Reviewing individual lines without understanding the change as a whole',
    ],
    rules: [
      'Understand the intent of the change before reviewing details',
      'Check for correctness, security, readability in that order',
      'Flag issues with severity: blocking, warning, nit',
      'Suggest specific fixes, not just problems',
    ],
    chain_with: [],
    content: `# Code Review Skill

## Before Reviewing
1. Understand the full scope of the change — read all modified files
2. Understand the INTENT before reviewing details
3. Check if the change aligns with project conventions and patterns

## Review Dimensions (in priority order)
1. **Correctness**: Does the code do what it claims to do? Are edge cases handled?
2. **Security**: Input validation, auth checks, injection prevention, secret exposure?
3. **Architecture**: Does the change fit the existing patterns? Is responsibility clear?
4. **Error Handling**: Are errors caught, logged, and reported appropriately?
5. **Testing**: Are critical paths covered? Do tests verify behavior, not implementation?
6. **Readability**: Can a new team member understand this without explanation?
7. **Performance**: Any obvious inefficiencies (N+1 queries, unbounded loops, missing indexes)?

## Finding Classification
- **Blocking**: Must be fixed before merge (bugs, security issues, broken tests)
- **Warning**: Should be fixed but not blocking (code smells, missing edge cases)
- **Nit**: Style or preference (naming, formatting, minor improvements)

## Review Output Format
For each finding:
- **Location**: file:line reference
- **Severity**: blocking / warning / nit
- **Issue**: What is wrong
- **Suggestion**: Specific fix, not just "this is wrong"

## Rules
- Always suggest specific fixes, never just flag problems
- Review the change as a whole, not line by line in isolation
- Check for missing tests before checking test quality
- Flag security issues as blocking regardless of context`,
  },

  {
    name: 'rpi-critique',
    description: 'Research-Plan-Implement critique using adversarial analysis dimensions.',
    category: 'quality',
    trigger_conditions: [
      'critique', 'adversarial review', 'challenge assumptions',
      'find weaknesses', 'stress test', 'rpi critique',
    ],
    anti_patterns: [
      'Confirmation bias in critique',
      'Critiquing without offering alternatives',
      'Surface-level critique that misses structural issues',
    ],
    rules: [
      'Challenge assumptions with evidence',
      'Provide specific counter-examples',
      'Rate each finding by severity',
      'Offer constructive alternatives for every criticism',
    ],
    chain_with: [],
    content: `# RPI Critique Skill

## Research Critique Dimensions
- Assumptions: What is being taken for granted?
- Evidence level: How well-supported are the claims?
- Counterevidence: What contradicts the conclusions?
- Gaps: What has not been investigated?

## Plan Critique Dimensions
- Codebase reality: Does the plan match the actual code?
- Dependencies: Are ordering constraints correct?
- Edge cases: What can break?
- Premortem: If this fails, why?`,
  },

  {
    name: 'code-analysis',
    description: 'Deep static analysis of code for patterns, complexity, coupling, and structural issues.',
    category: 'quality',
    trigger_conditions: [
      'analyze code', 'code analysis', 'code complexity',
      'code smells', 'coupling analysis', 'code structure',
    ],
    anti_patterns: [
      'Reporting metrics without actionable recommendations',
      'Focusing on style over substance',
      'Missing cross-module coupling issues',
    ],
    rules: [
      'Measure before judging',
      'Focus on actionable findings',
      'Distinguish between necessary and accidental complexity',
    ],
    chain_with: ['code-review'],
    content: `# Code Analysis Skill

## Analysis Dimensions
1. Complexity: Cyclomatic complexity, cognitive complexity
2. Coupling: Module dependencies, interface surface area
3. Cohesion: Single responsibility adherence
4. Duplication: Copy-paste patterns, near-duplicates
5. Dead code: Unreachable paths, unused exports
6. Error handling: Consistency, completeness`,
  },

  // -----------------------------------------------------------------------
  // Research Skills (2)
  // -----------------------------------------------------------------------
  {
    name: 'research-codebase',
    description: 'Systematic codebase research: architecture mapping, dependency analysis, and pattern discovery.',
    category: 'research',
    trigger_conditions: [
      'research codebase', 'understand codebase', 'codebase analysis',
      'how does this work', 'find pattern', 'architecture',
    ],
    anti_patterns: [
      'Reading files randomly without a research plan',
      'Stopping after finding the first match',
      'Ignoring test files as documentation',
    ],
    rules: [
      'Start with entry points and work outward',
      'Read test files to understand intended behavior',
      'Map dependencies before diving into implementation',
      'Document findings as you go',
    ],
    chain_with: [],
    content: `# Research Codebase Skill

## Before Researching
1. Define the specific question you need to answer
2. Set a scope boundary — what is in/out of this research
3. Check memory for prior research on this topic

## Research Process
1. **Entry Points**: Find main, index, config files to understand the top-level structure
2. **Directory Mapping**: Map high-level structure — what does each directory contain?
3. **Dependency Tracing**: Follow imports/requires to understand module relationships
4. **Data Flow**: Trace the specific data flow relevant to your question
5. **Test Files**: Read tests as behavioral documentation — they show intended usage
6. **Pattern Recognition**: Identify conventions used (naming, error handling, structure)
7. **Integration Points**: Find where modules connect and exchange data

## Research Output Format
Present findings with specific file:line references:
- **Current State**: What exists and how it works
- **Patterns Found**: Conventions and patterns to follow
- **Dependencies**: What depends on what
- **Gaps**: What is missing or unclear
- **Recommendations**: Informed next steps

## Rules
- Always read test files — they are the best documentation
- Never stop after finding the first match — search for alternatives
- Map dependencies before diving into implementation details
- Document findings as you go — do not rely on memory alone
- Include file:line references for every claim`,
  },

  {
    name: 'prompt-handoff-optimizer',
    description: 'Optimize session handoff by structuring context for continuity across sessions.',
    category: 'research',
    trigger_conditions: [
      'handoff', 'session continuity', 'context transfer',
      'save progress', 'continue later', 'session summary',
    ],
    anti_patterns: [
      'Dumping raw conversation as handoff notes',
      'Omitting decision rationale in handoff',
      'Losing track of open questions',
    ],
    rules: [
      'Structure handoff around decisions, not activities',
      'Include open questions and unresolved items',
      'Reference specific files and line numbers',
    ],
    chain_with: [],
    content: `# Prompt Handoff Optimizer Skill

## Handoff Structure
1. Current state: What has been done?
2. Decisions made: What was decided and why?
3. Open items: What is unresolved?
4. Next steps: What should happen next?
5. Context: Key files, patterns, and constraints`,
  },

  // -----------------------------------------------------------------------
  // Testing Skills (3)
  // -----------------------------------------------------------------------
  {
    name: 'javascript-testing-patterns',
    description: 'JavaScript/TypeScript testing patterns for Vitest, Jest, and Node.js test infrastructure.',
    category: 'testing',
    trigger_conditions: [
      'javascript test', 'typescript test', 'vitest', 'jest',
      'node test', 'js testing', 'ts testing', 'mocha',
    ],
    anti_patterns: [
      'Testing implementation with excessive mocking',
      'Snapshot tests for dynamic content',
      'Mixing unit and integration test concerns',
    ],
    rules: [
      'Use describe/it blocks with descriptive names',
      'Prefer integration tests over heavily mocked unit tests',
      'Use beforeEach/afterEach for proper cleanup',
      'Test async code with proper await/promise handling',
    ],
    chain_with: ['tdd-cycle'],
    content: `# JavaScript Testing Patterns

## Structure
- describe: group related tests
- it/test: single behavior assertion
- beforeEach/afterEach: setup/teardown

## Patterns
- Factory functions for test data
- In-memory databases for data layer tests
- Proper async/await in test assertions
- Cleanup resources in afterEach`,
  },

  {
    name: 'python-testing-patterns',
    description: 'Python testing patterns for pytest, unittest, and Python test infrastructure.',
    category: 'testing',
    trigger_conditions: [
      'python test', 'pytest', 'unittest', 'py test',
      'python testing', 'conftest', 'fixtures',
    ],
    anti_patterns: [
      'Monolithic test functions testing multiple behaviors',
      'Fixtures with broad scope when narrow scope suffices',
      'Testing with real external services without mocking',
    ],
    rules: [
      'Use pytest fixtures for reusable setup',
      'Parametrize tests for multiple input variations',
      'Use conftest.py for shared fixtures',
      'Mark slow tests with pytest.mark.slow',
    ],
    chain_with: ['tdd-cycle'],
    content: `# Python Testing Patterns

## Structure
- test_ prefix for discovery
- conftest.py for shared fixtures
- pytest.mark for categorization

## Patterns
- @pytest.fixture for setup/teardown
- @pytest.mark.parametrize for data-driven tests
- tmp_path fixture for filesystem tests
- monkeypatch for environment isolation`,
  },

  {
    name: 'e2e-testing-patterns',
    description: 'End-to-end testing patterns for Playwright, Cypress, and browser automation.',
    category: 'testing',
    trigger_conditions: [
      'e2e test', 'end to end', 'playwright', 'cypress',
      'browser test', 'integration test', 'acceptance test',
    ],
    anti_patterns: [
      'Testing implementation details through the UI',
      'Flaky selectors based on CSS classes',
      'Tests that depend on specific data state',
    ],
    rules: [
      'Use data-testid attributes for reliable selectors',
      'Reset state before each test',
      'Test user workflows, not individual components',
      'Keep e2e tests focused on critical paths',
    ],
    chain_with: [],
    content: `# E2E Testing Patterns

## Principles
- Test user journeys, not implementation
- Reliable selectors (data-testid)
- Independent test state
- Fast feedback through targeted tests

## Patterns
- Page Object Model for reusable selectors
- API seeding for test data
- Visual regression for layout stability
- Parallel execution for speed`,
  },

  // -----------------------------------------------------------------------
  // Design Skills (2)
  // -----------------------------------------------------------------------
  {
    name: 'frontend-design',
    description: 'Frontend implementation patterns for component architecture, state management, and accessibility.',
    category: 'design',
    trigger_conditions: [
      'frontend', 'component design', 'react', 'vue', 'svelte',
      'state management', 'ui component', 'css architecture',
    ],
    anti_patterns: [
      'God components that do everything',
      'Prop drilling through many layers',
      'Inline styles for reusable patterns',
      'Ignoring keyboard navigation',
    ],
    rules: [
      'Single responsibility per component',
      'Accessible by default (semantic HTML, ARIA)',
      'Handle all UI states (loading, error, empty)',
      'Extract shared logic into custom hooks',
    ],
    chain_with: ['superdesign'],
    content: `# Frontend Design Skill

## Component Architecture
- Container/Presentational split
- Composition over inheritance
- Props for configuration, hooks for behavior

## Accessibility
- Semantic HTML elements
- ARIA attributes where needed
- Keyboard navigation support
- Focus management for modals/dialogs`,
  },

  {
    name: 'superdesign',
    description: 'Portfolio-quality UI/UX design with intentional visual decisions and design system compliance.',
    category: 'design',
    trigger_conditions: [
      'design', 'ui design', 'ux design', 'visual design',
      'design system', 'portfolio quality', 'pixel perfect',
    ],
    anti_patterns: [
      'Generic Bootstrap/Material defaults',
      'Decorative elements without functional purpose',
      'Inconsistent spacing and typography',
      'Dark patterns or manipulative UX',
    ],
    rules: [
      'Every visual choice must be intentional',
      'Design system compliance is non-negotiable',
      'Accessibility is a design constraint, not an afterthought',
      'Test with real content, not lorem ipsum',
    ],
    chain_with: ['frontend-design'],
    content: `# Superdesign Skill

## Principles
- Intentional: every element serves a purpose
- Consistent: follows design system tokens
- Accessible: WCAG AA minimum
- Responsive: mobile-first approach

## Process
1. Define the design objective
2. Audit existing patterns
3. Design within system constraints
4. Implement with state coverage
5. Verify accessibility and responsiveness`,
  },

  // -----------------------------------------------------------------------
  // Backend Skills (2)
  // -----------------------------------------------------------------------
  {
    name: 'api-design-principles',
    description: 'API design principles for REST, GraphQL, and RPC with contract-first methodology.',
    category: 'backend',
    trigger_conditions: [
      'api design', 'rest api', 'graphql api', 'rpc api',
      'api contract', 'endpoint design', 'api architecture',
    ],
    anti_patterns: [
      'Designing API around database schema instead of use cases',
      'Inconsistent naming conventions across endpoints',
      'Missing pagination for list endpoints',
      'Exposing internal IDs or implementation details',
    ],
    rules: [
      'Contract-first: define the interface before implementation',
      'Consistent error format across all endpoints',
      'Proper HTTP methods and status codes',
      'Version from the start if external consumers exist',
    ],
    chain_with: [],
    content: `# API Design Principles

## Contract-First Methodology
1. Define the interface before writing any implementation
2. Specify request/response types with validation schemas
3. Define error formats consistently across all endpoints
4. Document authentication and authorization requirements
5. Implement handlers against the defined contract

## REST Conventions
- **Resources**: Use nouns, plural naming (GET /users, POST /users)
- **HTTP Methods**: GET (read), POST (create), PUT (replace), PATCH (update), DELETE (remove)
- **Status Codes**: 200 (ok), 201 (created), 204 (no content), 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 409 (conflict), 422 (unprocessable), 500 (server error)
- **Pagination**: Always paginate list endpoints. Use cursor-based for large datasets.
- **Filtering**: Query parameters for filtering, sorting, and field selection
- **Versioning**: URL-based (/v1/users) or header-based from the start

## Error Response Format
Every error response must include: status code, error type, human-readable message, and request ID for tracing.

## Security Checklist
- Authentication on every endpoint (except public ones, explicitly marked)
- Authorization checks for resource ownership
- Input validation at the boundary
- Rate limiting on write and auth endpoints
- No internal IDs or implementation details in responses

## GraphQL Considerations
- Schema-first design with SDL
- Use DataLoader for N+1 prevention
- Implement query complexity limits
- Separate queries and mutations clearly`,
  },

  {
    name: 'supabase-postgres-best-practices',
    description: 'Best practices for Supabase and PostgreSQL: RLS, migrations, indexing, and query optimization.',
    category: 'backend',
    trigger_conditions: [
      'supabase', 'postgres', 'postgresql', 'database design',
      'rls', 'row level security', 'database migration',
    ],
    anti_patterns: [
      'Disabling RLS for convenience',
      'N+1 queries from ORM misuse',
      'Missing indexes on filtered columns',
      'Storing denormalized data without update triggers',
    ],
    rules: [
      'RLS policies on every user-facing table',
      'Migrations must be reversible',
      'Index columns used in WHERE, JOIN, and ORDER BY',
      'Use connection pooling in production',
    ],
    chain_with: ['api-design-principles'],
    content: `# Supabase/PostgreSQL Best Practices

## Row Level Security
- Enable RLS on all tables
- auth.uid() for user-scoped access
- Service role only for admin operations

## Performance
- EXPLAIN ANALYZE for slow queries
- Composite indexes for multi-column filters
- Partial indexes for common filter patterns
- Connection pooling via pgBouncer`,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed all built-in skills into the database. Idempotent — skips
 * skills that already exist by name.
 *
 * @returns The number of skills newly created.
 */
export function seedBuiltInSkills(
  db: DatabaseConnection,
  sign: SignFn,
): number {
  let created = 0;

  for (const skillInput of BUILT_IN_SKILLS) {
    if (getSkillByName(db, skillInput.name)) continue;
    insertSkill(db, skillInput, sign);
    created++;
  }

  return created;
}

/**
 * Get all built-in skill names.
 */
export function getBuiltInSkillNames(): string[] {
  return BUILT_IN_SKILLS.map(s => s.name);
}

/**
 * Get the count of built-in skills.
 */
export function getBuiltInSkillCount(): number {
  return BUILT_IN_SKILLS.length;
}
