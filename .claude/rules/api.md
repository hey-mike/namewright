---
paths:
  - "src/app/api/**/*.ts"
---

# API Route Rules

- Every route handler must have try/catch with typed error responses
- Use `Anthropic.APIError` / `Anthropic.RateLimitError` for Anthropic errors — never generic catch-all
- Validate all user input at the boundary — length caps, allowlists for enum fields
- Never expose internal error details to the client — log server-side, return generic message
- `validateEnv()` must be called inside the handler body, not at module scope (build-time env not available)
- Stripe client: always call `stripe()` as a function (lazy singleton), never import the instance directly
- Webhook handler: cookie must NOT be set here — Stripe calls this, not the browser
- `/api/auth` is the only route that sets the session cookie (browser-facing redirect)
