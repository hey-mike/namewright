---
paths:
  - "src/lib/**/*.ts"
---

# Lib Rules

## anthropic.ts
- Client is a module-level singleton — do not instantiate inside functions
- Use `WebSearchTool20250305` type from `@anthropic-ai/sdk/resources/messages/messages` — no `as any`
- Catch and re-throw with typed `Anthropic.RateLimitError` / `Anthropic.AuthenticationError` / `Anthropic.APIError`
- Guard for empty text block: model can end on a tool call with no text output

## stripe.ts
- Lazy factory function — export `default function stripe(): Stripe`, not a pre-initialized instance
- Required: `apiVersion: '2026-03-25.dahlia'`

## session.ts
- HS256 JWT, 24h expiry — must match KV TTL and cookie Max-Age
- `verifySession` returns null on any failure — never throws

## kv.ts
- TTL is 24h (86400s) — long enough for full checkout flow
- `getReport` returns null if expired — callers must handle

## signa.ts (Phase 2a — not yet wired in)
- Use `signa.search.query()` with `SearchV2Body` — not `signa.trademarks.list()`
- Conflict detection: use `mark_text` field, not `name`
- Wrap each call in try/catch returning `risk: 'uncertain'` on failure
