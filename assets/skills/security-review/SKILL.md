---
name: security-review
description: Systematic security code review methodology beyond OWASP checklists
category: security
triggers:
  - security review
  - code audit
  - vulnerability check
  - threat assessment
  - penetration test prep
chain_with:
  - code-review-excellence
  - api-design-principles
---

# Security Review

## Purpose

Executable methodology for reviewing code security. Not a checklist — a structured workflow that identifies vulnerabilities by tracing data flow, evaluating trust boundaries, and checking language-specific attack vectors.

## When to Use

- Before merging code that handles authentication, authorization, or user input
- Before deploying endpoints that accept external data
- When integrating third-party APIs or processing webhooks
- During periodic security review of existing code
- When a dependency has a reported CVE

## Review Workflow

### Pass 1: Input Tracing (3 minutes per endpoint)

Trace every piece of external input from entry to final use:

1. **Identify all input sources.** URL params, query string, request body, headers, cookies, file uploads, webhook payloads.
2. **For each input, trace its path.** Where does it go? Is it stored? Is it rendered? Is it used in a query? Is it passed to another service?
3. **At each usage point, check the mitigation:**

| Usage | Required Mitigation | Failure Mode |
|---|---|---|
| SQL query | Parameterized query (prepared statement) | SQL injection |
| HTML rendering | Context-aware output encoding | XSS (Cross-Site Scripting) |
| Shell command | Array-form execution (no shell=true) | Command injection |
| File path construction | Base directory validation after path resolution | Path traversal |
| URL construction | URL encoding + allowlist for domains | SSRF, open redirect |
| Regex matching | Bounded input length OR RE2 library | ReDoS |
| Template rendering | Never construct templates from user input | SSTI |
| Deserialization | JSON only for untrusted data. Never pickle, yaml.load, or eval. | RCE |

### Pass 2: Authentication Verification (2 minutes per endpoint)

1. **Is authentication required?** If the endpoint serves data, modifies state, or reveals information — yes.
2. **Is the check in middleware, not duplicated per handler?** A missed handler means an unauthenticated endpoint.
3. **Token validation:**
   - JWT: Is the secret strong (>= 256 bits)? Is the algorithm specified server-side (not from token header)? Is expiry checked? Is the issuer verified?
   - Session: Is the session ID high-entropy? Is it regenerated after login (prevents fixation)? Is it HttpOnly + Secure + SameSite?
   - API key: Is it transmitted in a header (not URL)? Is it hashed in storage (not plaintext)?

### Pass 3: Authorization Verification (2 minutes per endpoint)

1. **Is authorization checked on this specific resource?** Not just "user is admin" but "user owns this resource" or "user has permission on this specific object."
2. **IDOR check:** Can user A access user B's resource by changing the ID in the URL? The handler must verify ownership.
3. **Mass assignment check:** Can the user set fields they should not? (role, is_admin, permissions, internal_status) The handler must use an allowlist of writable fields.
4. **Horizontal escalation:** Can a regular user access another regular user's data?
5. **Vertical escalation:** Can a regular user access admin functionality?

### Pass 4: Cryptographic Verification (1 minute per data type)

1. **Password hashing:** Argon2id (preferred), bcrypt (cost >= 12), or PBKDF2. Never SHA-256, SHA-1, or MD5 for passwords.
2. **Token generation:** crypto.randomBytes(32) or equivalent. Never Math.random(), Date.now(), or predictable values.
3. **Encryption at rest:** AES-256-GCM for sensitive data. Key stored in secret manager, not in code.
4. **TLS in transit:** All sensitive data over HTTPS. No HTTP fallback. HSTS header set.
5. **Signature verification:** Webhook HMAC uses timing-safe comparison (crypto.timingSafeEqual). Never === for signatures.

### Pass 5: Error and Information Disclosure (1 minute per handler)

1. **Production error responses:** No stack traces, no SQL errors, no file paths, no dependency versions.
2. **HTTP headers:** No X-Powered-By. Proper Content-Type. Security headers present (CSP, X-Frame-Options, X-Content-Type-Options).
3. **Debug endpoints:** Disabled in production. No /debug, /phpinfo, /actuator, /_debug, /graphiql without auth.
4. **Source maps:** Not deployed to production (reveals source code).

## Language-Specific Vulnerability Patterns

### JavaScript / TypeScript

**Prototype Pollution:**
```javascript
// VULNERABLE: User input merges into object prototype
function merge(target, source) {
  for (const key in source) {
    target[key] = source[key]; // __proto__ can be set
  }
}

// SAFE: Validate property names
function safeMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    target[key] = source[key];
  }
}
```

**ReDoS (Regular Expression Denial of Service):**
```javascript
// VULNERABLE: Nested quantifiers cause exponential backtracking
const emailRegex = /^([a-zA-Z0-9]+)+@/;  // (group+)+ is catastrophic
"aaaaaaaaaaaaaaaaaaaaa!".match(emailRegex); // hangs

// SAFE: Use possessive quantifiers or RE2
import RE2 from 're2';
const safeRegex = new RE2(/^[a-zA-Z0-9]+@/);
```

**Path Traversal:**
```javascript
// VULNERABLE: path.join does NOT prevent traversal
const filePath = path.join('/uploads', userInput); // '../../../etc/passwd' works

// SAFE: Resolve then verify containment
const resolved = path.resolve('/uploads', userInput);
if (!resolved.startsWith('/uploads/')) {
  throw new Error('Path traversal attempt');
}
```

### Python

**Command Injection:**
```python
# VULNERABLE: shell=True with user input
subprocess.run(f"convert {filename} output.png", shell=True)  # ; rm -rf / works

# SAFE: Array form, no shell
subprocess.run(["convert", filename, "output.png"])
```

**Unsafe Deserialization:**
```python
# VULNERABLE: pickle executes arbitrary code
data = pickle.loads(request.body)  # attacker sends crafted payload = RCE

# SAFE: Use JSON for untrusted data
data = json.loads(request.body)
```

**Template Injection:**
```python
# VULNERABLE: User input becomes template code
template = Template(user_input)  # {{ config.__class__.__init__.__globals__ }} = RCE

# SAFE: User input is data, never template
template = Template("Hello {{ name }}")
template.render(name=user_input)
```

## Dependency Audit

### When to Audit

- Before adding a new dependency
- When `npm audit` or `pip audit` reports vulnerabilities
- When a dependency has not been updated in > 12 months
- When a dependency has < 100 weekly downloads (npm) or equivalent low adoption

### Evaluation Criteria

| Factor | Green | Yellow | Red |
|---|---|---|---|
| **Maintenance** | Active commits in last 3 months | Commits in last 12 months | No commits in > 12 months |
| **CVEs** | No known unpatched CVEs | Known CVEs with patches available | Known unpatched CVEs |
| **Adoption** | > 10K weekly downloads, used by major projects | > 1K weekly downloads | < 100 weekly downloads or unknown |
| **Scope** | Minimal permissions, small API surface | Moderate scope | Requires broad filesystem, network, or native access |
| **Alternatives** | No actively maintained alternative | Alternatives exist with trade-offs | Better-maintained alternative exists |

### Actions

- **Green across all factors:** Add the dependency.
- **Any Yellow:** Document the risk in a code comment. Set a calendar reminder to re-evaluate.
- **Any Red:** Find an alternative or implement the functionality yourself if the scope is small.

## Anti-patterns

- **Security by obscurity.** Hiding the admin URL (/admin-secret-panel) instead of adding authentication. Obscurity is not a security control.
- **Client-side-only validation.** Checking input format in JavaScript but not on the server. The attacker bypasses the client entirely.
- **Rolling your own crypto.** Implementing custom encryption, hashing, or token generation. Use established libraries (crypto module, bcrypt, jose).
- **Catch-all CORS.** `Access-Control-Allow-Origin: *` on endpoints that serve sensitive data.
- **Logging secrets "temporarily for debugging."** Temporary logging becomes permanent. Secrets in logs get shipped to log aggregators, backed up, and retained for months.
- **Trusting internal network.** Assuming that because a service is internal, it does not need authentication. Internal services get compromised too.

## Verification

The review is complete when:
1. Every input has been traced from entry to final use
2. Every SQL query is parameterized
3. Every output is encoded for its context
4. Every endpoint has server-side auth checks
5. Every resource access verifies ownership
6. No secrets appear in code, logs, or error responses
7. Dependencies have no unpatched critical CVEs
8. Error responses reveal no internal details
