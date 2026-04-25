@AGENTS.md

# Namewright — Brand Name Research Tool

## Build & Dev

- `npm run dev` — start Next.js dev server + Stripe webhook forwarder (http://localhost:3000)
- `npm run dev:next` — Next.js only (if Stripe CLI isn't installed or not needed)
- `npm run dev:stripe` — Stripe webhook forwarder only (separate terminal)
- `npm run build` — production build
- `npm run test` — run Jest tests
- `npx tsc --noEmit` — type check only

### First-time Stripe CLI setup

The combined `dev` command depends on Stripe CLI (`brew install stripe/stripe-cli/stripe`).
After install, run `stripe login` once to authenticate. The webhook signing secret
printed by `stripe listen` must match `STRIPE_WEBHOOK_SECRET` in `.env.local` — the
CLI reuses the same secret for your device, so you set it once and it works thereafter.

## Stack

- Next.js 16 App Router (see AGENTS.md — breaking changes from prior versions)
- TypeScript strict mode
- Tailwind CSS v4 (`@import "tailwindcss"` — NOT `@tailwind base/components/utilities`)
- `@anthropic-ai/sdk` — lazy singleton via factory function `client()` in `src/lib/anthropic.ts`, reads `ANTHROPIC_API_KEY` at call time (matches `stripe()` pattern so cold-start doesn't fail before `validateEnv()` runs)
- `stripe` v22 — lazy singleton via factory function in `src/lib/stripe.ts`
- `@vercel/kv` — Upstash Redis, 7d TTL for reports
- `jose` v6 — HS256 JWT, 7d expiry

## Folder Structure

```
src/
  app/          — routes, pages, API handlers (Next.js App Router)
  components/   — shared React components
  lib/          — business logic and external API clients
  __tests__/    — mirrors lib/ and app/api/
  __mocks__/    — jose shim for Jest (ESM-only compat)
  proxy.ts      — Next.js 16 rate limiting (file: proxy.ts, export: proxy)
```

## Context7 — Mandatory for Library APIs

Before writing any code that uses a library or framework API, you MUST query Context7 first:

1. `mcp__plugin_context7-plugin_context7__resolve-library-id` — resolve the library name
2. `mcp__plugin_context7-plugin_context7__query-docs` — fetch current docs for the specific API

This applies to: Next.js, Anthropic SDK, Stripe, jose, @vercel/kv, Tailwind CSS, Signa SDK, React — any third-party package. Never rely on training data for API shapes, method signatures, or constructor options. Libraries in this project have breaking changes from prior versions.

## Key Conventions

- Server Components by default; `'use client'` only where event handlers needed
- `@/*` path alias resolves to `src/*`
- No `as any` — use proper SDK-exported types
- No workarounds — fix root causes

## Auth Flow

Stripe payment → `/api/auth` GET → sets HttpOnly cookie → redirect to `/results`
Webhook exists for reliability but does NOT set cookies (goes to Stripe's server, not browser)

## Product positioning

Namewright is a **naming tool + preliminary trademark/domain screening**, not a brand strategy consultant and not legal clearance. Positioning statements, messaging pillars, target audience articulation, tone-of-voice, and visual identity are explicitly out of scope. Customers bring implicit strategy (via description + personality + geography inputs); we consume it, we don't derive it. Keep this distinction when writing prompts, copy, or new features — reaching upward into consulting scope devalues the core wedge.

See `README.md` ("Product positioning") and `docs/ROADMAP.md` (Tier 2 "Brand Kit" expansion) for the full framing.

## Environment Variables

**Required at runtime** (validateEnv throws if missing):
`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SESSION_SECRET` (≥32 chars),
`NEXT_PUBLIC_APP_URL`

**Optional integrations** (each gracefully no-ops when unset):

- `SIGNA_API_KEY` — trademark search; without it, risk defaults to uncertain
- `WHOISJSON_API_KEY` — third domain-availability source (1000/month free tier)
- `LAUNCHDARKLY_SDK_KEY` — gates the `euipo-direct-cross-check` flag; defaults to false when unset
- `EUIPO_CLIENT_ID`, `EUIPO_CLIENT_SECRET`, `EUIPO_AUTH_BASE_URL`, `EUIPO_API_BASE_URL` — EUIPO direct cross-check (sandbox by default)
- `SENTRY_DSN` — error tracking
- `SLACK_ALERT_WEBHOOK_URL` — on-call alerts for webhook sig failures, KV save failures, Anthropic credit exhaustion, EUIPO token failures
- `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` — email-me-a-copy at paywall
- `CRON_SECRET` — Bearer token for `/api/cron/stripe-reconcile`

**Dev-only flags** (refused in production even if set):

- `DEV_MOCK_PIPELINE=1` — returns canned `ReportData` fixture from `src/lib/__fixtures__/dev-report.ts` instead of calling paid APIs. Per-request override via `x-dev-mock-pipeline: 1|0` header (UI toggle in `IntakeForm.tsx`, dev builds only).

See `.env.example` for inline comments on each.

## Accuracy guardrails (anthropic.ts)

LLM output is untrusted. Every response passes `validateReportData` which:

- Validates field-level shape (style enum, risk enum, domain status enum, TLD normalization)
- Enforces cross-cutting invariants (topPicks name references a real candidate, unusable candidates have UNUSABLE_PREFIX + bottom-rank + not in topPicks)
- Auto-fixes violations silently with matching `auto_fix_*` warn logs rather than 502ing the user
- Detects hallucinated mark citations (`validateGroundedMarks`) and style-distribution drift (`validateStyleDistribution`) as telemetry-only warnings
- Blocks Cyrillic/Greek/emoji homoglyphs in names (`HOMOGLYPH_RE`) — retries once with explicit ASCII instruction before failing
- Retries once on Anthropic 429 rate-limit errors (`callWithRateLimitRetry`)

Don't bypass or loosen these without updating the audit log. Each one closes a measured failure mode; see `docs/ROADMAP.md` for the rationale per guardrail.
