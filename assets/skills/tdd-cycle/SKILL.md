---
name: tdd-cycle
description: Guide through Test-Driven Development red-green-refactor cycle. Use when implementing features, writing tests, or during development iterations.
---

# TDD Cycle (Red-Green-Refactor)

For each mini-task, follow this strict cycle:

---

## RED (Write Failing Test)

1. Write test for the expected behavior
2. Include coverage for:
   - Happy path
   - Edge cases
   - Error conditions
   - Boundary values
3. Run test → **MUST FAIL**
4. If test passes immediately, you're not testing new behavior

---

## GREEN (Minimal Implementation)

1. Write ONLY enough code to pass the test
2. No extra features
3. No premature optimization
4. No "nice to have" additions
5. Run test → **MUST PASS**

---

## REFACTOR (Improve Quality)

1. Simplify without changing behavior
2. Apply SOLID principles
3. Remove duplication (DRY)
4. Improve naming for clarity
5. Run tests → **MUST STILL PASS**

---

## Validation Checklist

After each cycle:
- [ ] Lint passes (zero warnings)
- [ ] All tests pass
- [ ] Code is readable and simple
- [ ] Mark task complete in TodoWrite

---

**Repeat this cycle for each mini-task until feature is complete.**
