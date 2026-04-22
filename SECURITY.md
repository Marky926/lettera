# Security policy

## Supported versions

Until 1.0.0 only the latest minor (`0.x`) receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Instead:

1. Email **security@lettera.dev** (replace with real inbox before launch)
   with a description, reproduction steps, and impact assessment.
2. You will receive an acknowledgement within 72 hours.
3. We aim to ship a fix within 14 days for high-severity issues, with a
   coordinated disclosure window agreed with the reporter.

## Scope

In scope:

- The renderer (`@lettera/renderer`): HTML/CSS injection, URL
  smuggling, expression sandbox escapes.
- The editor (`@lettera/editor`): XSS via paste/import, prototype
  pollution via document load.
- The reference API (`apps/api`): authentication, authorization,
  CSRF, rate-limit bypass.

Out of scope:

- Vulnerabilities in user-supplied custom block `exportRender`
  functions (the integrator's responsibility).
- Issues requiring a compromised local environment / browser extension.

## Hardening already in place

- HTML escaping + allow-listed URL schemes (`http`, `https`, `mailto`).
- `data:` and `javascript:` URLs rejected with linter warnings.
- CSS injection hardening via `cssEscape()` on node-id selectors.
- Sandboxed expression evaluator (no function calls, no property
  access on prototypes).
- API: CSRF origin guard, rate limits on auth, `httpOnly` +
  `sameSite=lax` session cookies, bcrypt cost factor 13, JWT in
  cookie only.

See `packages/renderer/test/security.test.ts` for the security
regression suite.
