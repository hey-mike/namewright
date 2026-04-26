# Namewright

A $19 brand-naming tool for solo founders pre-incorporation. Submit a brief, get 8–12 ranked name candidates with preliminary trademark screening (Signa + optional EUIPO) and domain availability (DNS + RDAP + WhoisJSON) across three TLDs. Cross-checked across selected sources, structured report in under 90 seconds.

**What it is:** structured naming + preliminary trademark/domain screening.
**What it isn't:** a brand strategy consultant, and not legal clearance. Positioning, messaging, visual identity, and competitive differentiation are out of scope. Trademark clearance requires a qualified attorney — we surface signals to inform that conversation, not replace it.

Landing copy: _"Name your brand. Before you commit."_

## Dev setup

```bash
npm install
cp .env.example .env.local  # fill in the keys — see .env.example for each var's purpose
npm run dev                 # starts Next.js + stripe listen concurrently on :3000
```

First-time Stripe CLI setup (required for the combined `npm run dev`):

```bash
brew install stripe/stripe-cli/stripe
stripe login               # one-time
# The webhook signing secret printed by `stripe listen` must match STRIPE_WEBHOOK_SECRET in .env.local
```

If you don't need webhook testing locally: `npm run dev:next` runs Next.js only.

### Local login (dev)

The "View my reports" flow needs a Postgres-backed user. Bring up the local stack and seed the two dev accounts:

```bash
docker compose up -d                # postgres, redis, kv-emulator, minio
npx prisma migrate dev              # apply schema to local postgres
npm run seed                        # creates seeded users
```

Seeded user accounts (`prisma/seed.ts`):

| Email                   | Purpose                    |
| ----------------------- | -------------------------- |
| `test@example.com`      | generic dev test account   |
| `founder@namewright.co` | founder-facing dev account |

Docker-compose service credentials (`docker-compose.yml`) — these match the values in `.env.local`:

| Service       | Host             | Credentials                                  | Used by                               |
| ------------- | ---------------- | -------------------------------------------- | ------------------------------------- |
| Postgres      | `localhost:5434` | `test-user` / `test-password` / `namewright` | Prisma (`DATABASE_URL`)               |
| Redis         | `localhost:6380` | (no auth)                                    | backs the KV emulator                 |
| KV emulator   | `localhost:8079` | token `test-token`                           | `KV_REST_API_URL/TOKEN`               |
| Minio (S3)    | `localhost:9000` | `test-account` / `test-secret`               | R2 (`R2_*`), bucket `namewright-test` |
| Minio console | `localhost:9001` | `test-account` / `test-secret`               | UI for inspecting R2 objects          |

To sign in, click "View my reports" → enter one of the emails above. `/api/auth/magic-link` only sends to addresses that already exist in the `User` table, so unseeded emails silently no-op (by design — prevents email enumeration).

Without `RESEND_API_KEY` set, no email goes out (and the URL is not logged). Either set `RESEND_API_KEY` in `.env.local`, or read the token directly from KV (`magic-link:*` keys map token → email) and visit `http://localhost:3000/api/auth/verify?token=<token>`.

**Skipping paid APIs during local debugging:** set `DEV_MOCK_PIPELINE=1` in `.env.local` to return a canned report fixture instead of calling Anthropic + Signa + EUIPO + WhoisJSON. Cuts each end-to-end test cycle from ~$0.25 and 90s to $0 and 200ms. The in-app toggle pill (top-right, dev-only) overrides per-request via the `x-dev-mock-pipeline` header. Guarded to refuse running in production even if set.

## Core scripts

| Command                           | Purpose                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Next.js + stripe-listen concurrently                                                                                             |
| `npm run dev:next`                | Next.js only                                                                                                                     |
| `npm run dev:stripe`              | stripe-listen only                                                                                                               |
| `npm run build`                   | production build                                                                                                                 |
| `npm run test`                    | Jest                                                                                                                             |
| `npx tsc --noEmit`                | type-check                                                                                                                       |
| `node scripts/accuracy-audit.mjs` | live 10-brief regression against the Anthropic + Signa + EUIPO + DNS pipeline (~$0.15/brief). Outputs to `/tmp/accuracy-audit/`. |
| `node scripts/e2e.mjs`            | 22-check Playwright smoke against localhost (full purchase journey)                                                              |

## Pipeline architecture

```
intake form (IntakeForm.tsx)
  └─► POST /api/generate
        ├─► inferNiceClass (Anthropic)  ─┐
        ├─► generateCandidates (Anthropic)─┤── parallel
        │                                  │
        │   (homoglyph retry on Cyrillic)  │
        ├─► checkAllTrademarks (Signa)  ───┤
        ├─► checkAllEuipoTrademarks (if LD flag on + geography EU/Global)
        ├─► checkAllDomains (DNS + RDAP + WhoisJSON 3-layer)
        └─► synthesiseReport (Anthropic)  ── single
              └─► validateReportData + validateGroundedMarks
                    └─► auto-fix ranking / prefix / topPicks violations
  └─► saveReport (KV, 7d TTL)
  └─► return { reportId, preview }

payment: Stripe Checkout ─► webhook → KV check + email dispatch (Resend)
access: /api/auth verifies Stripe session + one-time KV nonce → HttpOnly JWT cookie → /results
```

All upstream I/O uses `Promise.allSettled` with graceful degradation — any single source (Signa, EUIPO, WhoisJSON) failing produces `risk: uncertain` for affected candidates, not a pipeline failure.

## Folder layout

```
src/
  app/          ─ Next.js App Router (routes, pages, API handlers)
    api/        ─ generate, checkout, auth, webhook, preview, health, cron/stripe-reconcile
  components/   ─ IntakeForm, FreePreview, FullReport, CandidateRow, ReportPdf, etc.
  lib/          ─ anthropic (pipeline + prompts), signa, euipo, dns, kv, session, alerts, cost, flags
  __tests__/    ─ mirrors lib/ and app/api/ — 161 tests
  __mocks__/    ─ jose shim for Jest (ESM-only compat)
  proxy.ts      ─ Next.js 16 middleware (rate limiting on /api/generate)
```

## Key technical decisions

- **Next.js 16 App Router** — see `AGENTS.md`: API shapes differ from prior versions, check `node_modules/next/dist/docs/` before touching framework APIs
- **Server Components by default**, `'use client'` only where event handlers require it
- **No `as any`** — use SDK-exported types; `unknown` at trust boundaries with proper narrowing
- **Lazy singleton clients** — `client()` (Anthropic) and `stripe()` both read env at call time, not module-load, so cold-start doesn't fail before `validateEnv()` runs
- **LLM output is not trusted** — every JSON response passes `validateReportData` (field-level + cross-cutting invariants) before reaching the user
- **Auto-fix over throw** — when the LLM produces valid-but-not-quite-right output (unusable candidate missing the prefix, wrong ranking), we silently correct and emit a warn log rather than 502ing the user

## Product positioning

This product **is**: a structured naming tool + preliminary trademark and domain screening, delivered in 90 seconds for $19.

This product **is not**: a brand strategy consultant, and not legal clearance. We don't produce positioning statements, messaging pillars, target audience articulation, tone of voice, or visual identity — those are classically the strategist's domain (expect $5K+ human engagement). We don't certify a name as legally available — that requires a qualified trademark attorney; our role is to surface preliminary signals so the founder enters that conversation informed.

Customers who walk in with implicit strategy already (they know their category, audience, personality) and need defensible name candidates are served well. Customers who need strategic foundations should hire a consultant.

See `docs/ROADMAP.md` for the Tier 2 ("Brand Kit") expansion path that adds positioning + messaging on top of chosen names — post-launch only, gated on user signal.

## Auth flow

```
Stripe Checkout ─► success_url with {session_id, report_id, nonce}
  ─► GET /api/auth
      ├─► consumeAuthNonce(session_id, nonce)  (atomic via kv.getdel)
      ├─► stripe.checkout.sessions.retrieve(session_id) — verify paid
      └─► set HttpOnly JWT cookie → redirect to /results
```

Webhook (`/api/webhook`) exists for paid-session reconciliation and email-me-a-copy dispatch, but **does NOT set cookies** — Stripe webhooks hit our server, not the browser.

## Environment variables

See `.env.example` — every variable has an inline comment explaining its purpose and whether it's required or optional.

Required at runtime: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SESSION_SECRET` (≥32 chars), `NEXT_PUBLIC_APP_URL`.

Optional integrations (each gracefully no-ops when its key is absent): `SIGNA_API_KEY`, `WHOISJSON_API_KEY`, `LAUNCHDARKLY_SDK_KEY`, `EUIPO_CLIENT_ID/SECRET`, `SENTRY_DSN`, `SLACK_ALERT_WEBHOOK_URL`, `RESEND_API_KEY`, `CRON_SECRET`.

## Context7 — mandatory for library APIs

Before writing code against any third-party library (Next.js 16, Anthropic SDK, Stripe, jose, @vercel/kv, Tailwind v4, React 19), query Context7 first — this project uses versions with breaking changes from prior releases. Don't rely on training-data-era API shapes.

## Deployment

Vercel, via `vercel --prod` (Git integration not wired; pushes don't auto-deploy). Post-deploy, verify with `curl https://<url>/api/health` — expects `{ status: "ok", kv: { ok: true }, env: { missingRequired: [] } }`.

## Internal audits (snapshot)

This repo has been audited against:

- **Logging** (2026-04-23) — 12 P0/P1/P2 gaps closed
- **Principal-engineer code review** (2026-04-24) — 15 findings across 10 dimensions addressed
- **Accuracy** (2026-04-24) — 7 findings closed (homoglyph fix, WhoisJSON field bug, cross-source signal, validator auto-fix)
- **Product purpose** (2026-04-24) — positioning confirmed consistent with what the landing page claims
- **Complexity** (2026-04-24) — flagged ~380 LOC as premature for pre-launch volume; founder deferred cleanup pending prod validation

Audit scripts live at `scripts/accuracy-audit.mjs` (10-brief regression). Re-run monthly or after prompt changes.
