---
name: refactoring-patterns
description: Named refactoring patterns with trigger conditions, step-by-step execution, and before/after examples
category: engineering
triggers:
  - refactor
  - clean up
  - extract
  - decompose
  - simplify
  - code smell
  - too long
  - too complex
chain_with:
  - code-review-excellence
  - tdd-cycle
---

# Refactoring Patterns

## Purpose

Named, specific refactoring patterns with trigger conditions that tell you WHEN to apply them, step-by-step instructions for HOW, and before/after examples. Not "clean up the code" — specific transformations with explicit criteria.

## When to Use

- When a function, class, or module has grown beyond its original scope
- When code review identifies complexity or duplication
- When adding a feature to existing code is harder than it should be
- When tests are brittle because they depend on implementation details

## Rule: Tests First

Before any refactoring:
1. Ensure the code under refactoring has passing tests that cover its current behavior.
2. If tests do not exist, write characterization tests first (tests that lock in current behavior, even if that behavior is wrong).
3. Run tests after every refactoring step. If tests fail, undo and investigate.

Refactoring changes structure, not behavior. If behavior changes, it is not refactoring — it is a bug fix or feature change.

## Pattern: Extract Function

**Trigger:** A function does two or more conceptually distinct things. Or a block of code inside a function has a comment explaining what it does (the comment is a sign that the block should be its own named function).

**Symptoms:**
- Function is longer than 20-30 lines
- You can draw a horizontal line in the function separating two distinct concerns
- A comment says "// Step 2: Validate the input" — that block should be `validateInput()`

**Steps:**
1. Identify the block of code to extract.
2. Identify all variables used by the block: which are inputs (read) and which are outputs (written/returned).
3. Create a new function with a name that describes WHAT the block does, not HOW.
4. Pass inputs as parameters. Return outputs.
5. Replace the original block with a call to the new function.
6. Run tests.

**Example:**
```typescript
// BEFORE: One function doing validation + transformation + persistence
function processOrder(order: RawOrder): SavedOrder {
  // Validate
  if (!order.items || order.items.length === 0) throw new Error('No items');
  if (order.items.some(i => i.quantity <= 0)) throw new Error('Invalid quantity');
  if (!order.customerId) throw new Error('No customer');

  // Calculate totals
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  // Save
  const saved = db.orders.create({ ...order, subtotal, tax, total });
  return saved;
}

// AFTER: Each concern is a named function
function processOrder(order: RawOrder): SavedOrder {
  validateOrder(order);
  const totals = calculateTotals(order.items);
  return db.orders.create({ ...order, ...totals });
}

function validateOrder(order: RawOrder): void {
  if (!order.items || order.items.length === 0) throw new Error('No items');
  if (order.items.some(i => i.quantity <= 0)) throw new Error('Invalid quantity');
  if (!order.customerId) throw new Error('No customer');
}

function calculateTotals(items: OrderItem[]): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tax = subtotal * 0.08;
  return { subtotal, tax, total: subtotal + tax };
}
```

## Pattern: Replace Conditional with Polymorphism

**Trigger:** A switch statement or if/else chain with more than 3 branches that dispatch on a type or status field. Especially when the same switch appears in multiple places.

**Symptoms:**
- `switch (type) { case 'A': ... case 'B': ... case 'C': ... }`
- Same type-based dispatch appears in 2+ functions
- Adding a new type requires changing multiple switch statements

**Steps:**
1. Create an interface that defines the varying behavior.
2. Create one implementation per case/branch.
3. Replace the switch with a registry or factory that returns the right implementation.
4. The calling code works with the interface, not the switch.
5. Run tests.

**When NOT to apply:** If the switch appears only once and has 2-3 simple branches, the switch is more readable than a class hierarchy. Do not over-engineer.

## Pattern: Introduce Parameter Object

**Trigger:** A function takes more than 3 parameters that logically belong together. Or the same group of parameters is passed through multiple function calls.

**Symptoms:**
- `function createUser(name, email, role, department, startDate, managerId)`
- Several functions accept the same 4+ parameters
- You keep adding parameters to an existing function

**Steps:**
1. Identify the group of parameters that travel together.
2. Create a type/interface for the group.
3. Replace the parameter list with a single object parameter.
4. Update all call sites.
5. Run tests.

**Example:**
```typescript
// BEFORE: 6 parameters, hard to remember order
function createUser(name: string, email: string, role: string,
                    department: string, startDate: Date, managerId: string) { ... }

// AFTER: Single object, self-documenting at call site
interface CreateUserInput {
  name: string;
  email: string;
  role: string;
  department: string;
  startDate: Date;
  managerId: string;
}

function createUser(input: CreateUserInput) { ... }

// Call site is now self-documenting:
createUser({ name: 'Alice', email: 'alice@co.com', role: 'engineer', ... });
```

## Pattern: Replace Magic Values with Named Constants

**Trigger:** A literal value appears in code that is not self-documenting. Any number that is not 0 or 1. Any string that represents a status, code, or configuration value.

**Symptoms:**
- `if (retries > 3)` — why 3?
- `setTimeout(fn, 86400000)` — what is that number?
- `if (status === 'XR-7')` — what does XR-7 mean?

**Steps:**
1. Identify the literal value.
2. Name it for what it MEANS, not what it IS.
3. Define it as a constant at module scope.
4. Replace all occurrences.
5. Run tests.

```typescript
// BEFORE
if (retries > 3) { ... }
setTimeout(cleanup, 86400000);

// AFTER
const MAX_RETRIES = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

if (retries > MAX_RETRIES) { ... }
setTimeout(cleanup, ONE_DAY_MS);
```

## Pattern: Decompose Conditional

**Trigger:** An if condition has more than 2 clauses joined by AND/OR, making it hard to understand what the overall condition means.

**Steps:**
1. Extract the condition into a function or variable with a descriptive name.
2. The name should describe the BUSINESS meaning, not the technical check.

```typescript
// BEFORE: What does this mean?
if (user.role === 'admin' || (user.role === 'editor' && user.department === post.department)) {
  allowEdit();
}

// AFTER: Clear intent
const canEditPost = user.role === 'admin' ||
  (user.role === 'editor' && user.department === post.department);

if (canEditPost) {
  allowEdit();
}

// EVEN BETTER: Extracted function (reusable, testable)
function canUserEditPost(user: User, post: Post): boolean {
  if (user.role === 'admin') return true;
  return user.role === 'editor' && user.department === post.department;
}
```

## Pattern: Move Function/Method

**Trigger:** A function uses more data from another module than from its own module. The function is in the wrong place.

**Symptoms:**
- Function in module A imports 4 things from module B but only 1 from module A
- Function reaches into another object's internals repeatedly (`order.customer.address.city`)
- Adding the function to module B would eliminate several imports/parameters

**Steps:**
1. Identify which module the function belongs to based on data affinity.
2. Move the function to that module.
3. Update imports at all call sites.
4. Run tests.

## Pattern: Replace Nested Conditionals with Guard Clauses

**Trigger:** Deeply nested if/else blocks where the main logic is buried inside multiple layers of conditions.

**Steps:**
1. Identify conditions that represent edge cases or error conditions.
2. Convert them to early returns (guard clauses) at the top of the function.
3. The remaining code is the main logic, at the top indentation level.

```typescript
// BEFORE: Main logic buried in nesting
function processPayment(order: Order): PaymentResult {
  if (order) {
    if (order.items.length > 0) {
      if (order.paymentMethod) {
        if (order.total > 0) {
          // actual logic here, 4 levels deep
          return chargeCard(order);
        } else {
          throw new Error('Invalid total');
        }
      } else {
        throw new Error('No payment method');
      }
    } else {
      throw new Error('No items');
    }
  } else {
    throw new Error('No order');
  }
}

// AFTER: Guard clauses, then main logic
function processPayment(order: Order): PaymentResult {
  if (!order) throw new Error('No order');
  if (order.items.length === 0) throw new Error('No items');
  if (!order.paymentMethod) throw new Error('No payment method');
  if (order.total <= 0) throw new Error('Invalid total');

  return chargeCard(order);
}
```

## When NOT to Refactor

- **No tests exist and you cannot write them.** Refactoring without tests is guessing. Write tests first.
- **The code is scheduled for deletion.** Do not polish code that will be removed.
- **Under time pressure for an unrelated deliverable.** Refactoring scope creep derails deadlines. Note it, come back later.
- **The improvement is aesthetic, not structural.** Renaming a variable from `x` to `data` when the function is 3 lines long adds churn without value.
- **Rule of Three not met.** If a pattern appears only twice, duplication may be acceptable. Wait for the third occurrence before extracting an abstraction.

## Verification

Refactoring is complete when:
1. All tests pass (same tests as before, same behavior)
2. Each extracted function has a name that describes its purpose
3. No function does more than one conceptual thing
4. No magic values remain unexplained
5. No conditional is longer than what fits on one readable line (or is extracted)
6. The change is purely structural — no behavior change mixed in
