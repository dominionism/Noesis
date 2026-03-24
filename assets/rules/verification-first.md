---
name: verification-first
description: Derive verification strategy from the actual repository's capabilities — detect available test runners, linters, and type checkers before verifying
triggers:
  - testing
  - verification
  - validation
  - check
  - lint
  - type check
priority: medium
---

# Verification First

## Rule

Before verifying any change, detect what verification tools are actually available in the repository. Do not assume a test runner exists. Do not run commands that are not configured. Derive the verification plan from the project's actual capabilities.

## Detection Order

1. **Package manager.** Check for `bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json` (in that order). Fall back to inspecting `package.json#packageManager`.
2. **Available scripts.** Read `package.json#scripts` (or `Makefile`, `pyproject.toml#scripts`, `Cargo.toml`). List what commands are configured.
3. **Test framework.** Check for test configuration files: `jest.config.*`, `vitest.config.*`, `pytest.ini`, `.mocharc.*`, `playwright.config.*`, etc.
4. **Linter.** Check for `.eslintrc.*`, `eslint.config.*`, `ruff.toml`, `.golangci.yml`, etc.
5. **Type checker.** Check for `tsconfig.json`, `mypy.ini`, `pyright`, etc.
6. **CI configuration.** Check `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile` for the canonical verification pipeline.

## Verification Priority Order

Run verification in this order (stop if something fails — fix before continuing):

| Priority | Check | Why First |
|---|---|---|
| 1 | **Type checking** | Catches structural errors cheaply. Fast. |
| 2 | **Linting** | Catches style and common mistakes. Fast. |
| 3 | **Unit tests** | Verifies logic correctness. Medium speed. |
| 4 | **Integration tests** | Verifies component interaction. Slower. |
| 5 | **E2E tests** | Verifies full system behavior. Slowest. |
| 6 | **Build** | Verifies the artifact can be produced. |

**If an aggregate command exists** (e.g., `npm test` that runs lint + type check + tests), prefer it. It represents the project's canonical verification.

## Targeted Verification

When a change is small and focused, full suite verification may be wasteful:

| Change Scope | Verification Scope |
|---|---|
| Single function | Run tests for that module. Type check the file. |
| Single component | Run tests for that component. Lint changed files. |
| API endpoint | Run integration tests for that endpoint. Type check. |
| Database migration | Run migration up AND down. Run affected integration tests. |
| Configuration change | Run full suite (config affects everything). |
| Cross-cutting change | Run full suite. |

## Anti-patterns

- **Assuming verification exists.** Running `npm test` without checking if tests are configured. The command may not exist, may run zero tests, or may run unrelated tests.
- **Skipping verification.** "It compiles, ship it." Compilation is necessary but not sufficient.
- **Running only the new tests.** New tests verify new behavior. Existing tests verify you did not break anything. Run both.
- **Ignoring failing tests.** "That test was already failing." Either fix it or explicitly document that it is a known failure. Do not normalize red tests.
