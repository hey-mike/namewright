@AGENTS.md

# Namewright — Brand Name Research Tool

## Build & Dev
- `npm run dev` — start dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run test` — run Jest tests
- `npx tsc --noEmit` — type check only

## Stack
- Next.js 16 App Router (see AGENTS.md — breaking changes from prior versions)
- TypeScript strict mode
- Tailwind CSS v4 (`@import "tailwindcss"` — NOT `@tailwind base/components/utilities`)
- `@anthropic-ai/sdk` — singleton client at module level, reads `ANTHROPIC_API_KEY` automatically
- `stripe` v22 — lazy singleton via factory function in `src/lib/stripe.ts`
- `@vercel/kv` — Upstash Redis, 24h TTL for reports
- `jose` v6 — HS256 JWT, 24h expiry

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

## Environment Variables (all required at runtime)
`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`
