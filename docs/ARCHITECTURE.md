# Namewright — Solution Architecture

**Status:** Pre-launch (Phase 1 shipped)
**Last updated:** 2026-04-25
**Source of truth for:** system topology, request lifecycle, integration map, failure modes, deployment

This doc is descriptive (the system as it exists today). For _what_ we're building and _why_, see `docs/PRD.md`. For sequencing of upcoming work, see `docs/ROADMAP.md`. For coding conventions, see `CLAUDE.md` and `AGENTS.md`. For Anthropic-pipeline mechanics, see `docs/superpowers/specs/2026-04-22-agent-pipeline-design.md`.

---

## 1. System overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Browser (client)                              │
│                                                                          │
│   IntakeForm ──► /api/generate ──► FreePreview ──► Stripe Checkout       │
│                                                          │               │
│                                              success_url │               │
│                                                          ▼               │
│                              /api/auth ──► JWT cookie ──► /results       │
└──────────────┬──────────────────────────────────────────────┬───────────┘
               │                                              │
               ▼                                              ▼
┌──────────────────────────────────────┐   ┌─────────────────────────────┐
│       Vercel (Fluid Compute)         │   │      External services      │
│                                      │   │                             │
│   /api/generate  ────────────────────┼──►│  Anthropic (Claude)         │
│      ├─ inferNiceClass               │   │  Signa (USPTO+EUIPO+WIPO)   │
│      ├─ generateCandidates  (paral)  │   │  EUIPO direct (LD-flagged)  │
│      ├─ checkAllTrademarks  (paral)  │   │  DNS (Node) / RDAP / Whois  │
│      ├─ checkAllEuipoTrademarks      │   │  LaunchDarkly (1 flag)      │
│      ├─ checkAllDomains              │   │                             │
│      └─ synthesiseReport             │   │  Stripe (Checkout + WH)     │
│              └─ validateReportData   │   │  Resend (transactional mail)│
│                                      │   │  Vercel KV (Upstash Redis)  │
│   /api/checkout  ──► Stripe          │   │                             │
│   /api/webhook   ◄── Stripe          │   │  Sentry (errors, optional)  │
│   /api/auth      ──► KV nonce + JWT  │   │  Slack (alerts, optional)   │
│   /api/preview   ──► KV report       │   │                             │
│   /api/health    ──► KV ping + env   │   │                             │
│   /api/cron/...  ──► Stripe reconcile│   │                             │
│                                      │   │                             │
│   proxy.ts (rate limit on /generate) │   │                             │
└──────────────────────────────────────┘   └─────────────────────────────┘
```

## 2. Request lifecycle (happy path)

| Step          | Surface                      | What happens                                                                                                                                                                                                                                                                                      |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1             | Browser                      | User fills `IntakeForm.tsx` (description, personality, geography, constraints, TLDs) and submits                                                                                                                                                                                                  |
| 2             | `proxy.ts`                   | Per-IP rate limit on `/api/generate`                                                                                                                                                                                                                                                              |
| 3             | `/api/generate`              | Validates input against allowlists from `types.ts` (`PERSONALITY_VALUES`, `GEOGRAPHY_VALUES`, `SUPPORTED_TLDS`)                                                                                                                                                                                   |
| 4             | `lib/anthropic.ts`           | Pipeline runs in parallel where possible: `inferNiceClass` + `generateCandidates` (with homoglyph retry) → `checkAllTrademarks` (Signa) + `checkAllEuipoTrademarks` (LD flag + EU/Global geo) + `checkAllDomains` (DNS + RDAP + WhoisJSON, `Promise.allSettled`) → `synthesiseReport` (Anthropic) |
| 5             | `lib/anthropic.ts`           | `validateReportData` + `validateGroundedMarks` + `validateStyleDistribution` run; auto-fix violations silently (warn-log telemetry)                                                                                                                                                               |
| 6             | `lib/kv.ts`                  | `saveReport(reportId, data)` with 7d TTL                                                                                                                                                                                                                                                          |
| 7             | Browser                      | Renders `FreePreview.tsx` with 3 of N candidates; rest gated behind paywall                                                                                                                                                                                                                       |
| 8             | `/api/checkout`              | Creates Stripe Checkout session with `success_url` carrying `{session_id, report_id, nonce}`; nonce stored in KV with short TTL                                                                                                                                                                   |
| 9             | Stripe                       | User pays; redirects to `success_url`                                                                                                                                                                                                                                                             |
| 10            | `/api/auth`                  | `consumeAuthNonce` (atomic `kv.getdel`) + `stripe.checkout.sessions.retrieve` to verify paid; sets HttpOnly JWT cookie (`jose`, HS256, 7d); redirects to `/results`                                                                                                                               |
| 11            | `/results`                   | Reads JWT cookie → `getReport` from KV → renders `FullReport.tsx`; offers PDF + email                                                                                                                                                                                                             |
| 12 (parallel) | `/api/webhook`               | Stripe webhook fires asynchronously; verifies signature; **does not set cookies** (server-side, not browser); dispatches email-me-a-copy via Resend if requested at paywall                                                                                                                       |
| 13 (daily)    | `/api/cron/stripe-reconcile` | Detects paid Stripe sessions missing from KV (webhook-never-arrived failure mode); alerts Slack                                                                                                                                                                                                   |

## 3. Component breakdown

### 3.1 Frontend (`src/app/`, `src/components/`)

- **Server Components by default**, `'use client'` only where event handlers are needed (per `CLAUDE.md`)
- Tailwind v4 (`@import "tailwindcss"` — not the legacy `@tailwind base/components/utilities`)
- Key components: `IntakeForm`, `FreePreview`, `FullReport`, `CandidateRow`, `ReportPdf`
- Path alias `@/*` → `src/*`

### 3.2 API routes (`src/app/api/`)

| Route                        | Method       | Purpose                                                              |
| ---------------------------- | ------------ | -------------------------------------------------------------------- |
| `/api/generate`              | POST         | Run the full naming pipeline; returns `{reportId, preview, summary}` |
| `/api/preview/[id]`          | GET          | Re-fetch preview-tier candidates by reportId (KV-cached)             |
| `/api/checkout`              | POST         | Create Stripe Checkout session with nonce                            |
| `/api/auth`                  | GET          | Verify paid + consume nonce + set JWT cookie + redirect              |
| `/api/webhook`               | POST         | Stripe webhook — reconcile paid status, dispatch optional email      |
| `/api/cron/stripe-reconcile` | GET (Bearer) | Daily — detect orphaned paid sessions                                |
| `/api/health`                | GET          | Liveness — KV ping + missing-required-env check                      |

### 3.3 Library modules (`src/lib/`)

| File           | Responsibility                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic.ts` | Pipeline orchestration, prompts, validators, auto-fix, homoglyph retry, rate-limit retry                                                            |
| `signa.ts`     | USPTO + EUIPO + WIPO via Signa SDK; uses `signa.search.query` (not the sunsetted `trademarks.list`); per-call try/catch returns `risk: 'uncertain'` |
| `euipo.ts`     | EUIPO direct cross-check (sandbox by default); LaunchDarkly-flagged                                                                                 |
| `dns.ts`       | 3-layer domain checks: Node DNS → rdap.org → WhoisJSON                                                                                              |
| `kv.ts`        | Vercel KV / Upstash wrapper; `TTL_SECONDS = 604800` (7d); `NONCE_TTL_SECONDS = 86400` (24h, deliberately shorter — single-use)                      |
| `session.ts`   | jose v6 HS256 JWT, 7d expiry; `verifySession` returns null on any failure                                                                           |
| `stripe.ts`    | Lazy singleton factory (env read at call time); `apiVersion: '2026-03-25.dahlia'`                                                                   |
| `email.ts`     | Resend dispatch for email-me-a-copy                                                                                                                 |
| `alerts.ts`    | Slack webhook on actionable failures                                                                                                                |
| `cost.ts`      | Per-Anthropic-call cost telemetry                                                                                                                   |
| `flags.ts`     | LaunchDarkly wrapper; defaults safely when SDK key absent                                                                                           |
| `geography.ts` | Maps `Geography` enum → trademark jurisdictions                                                                                                     |
| `logger.ts`    | Pino structured logging                                                                                                                             |
| `env.ts`       | `validateEnv` — throws on missing required at runtime                                                                                               |
| `types.ts`     | Shared types — see `.claude/rules/contracts.md` for cross-boundary rules                                                                            |

## 4. Data model & lifetimes

| Item           | Storage            | Lifetime             | Notes                                                                                                                                                                                                        |
| -------------- | ------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Report payload | Vercel KV          | 7d TTL               | Sleep-on-it / share-with-cofounder before commit; storage cost negligible                                                                                                                                    |
| Auth nonce     | Vercel KV          | Short TTL            | Single-use; consumed atomically via `kv.getdel` to prevent replay                                                                                                                                            |
| Session JWT    | HttpOnly cookie    | 7d `Max-Age`         | HS256 via `jose v6`; `verifySession` non-throwing. Trade-off: longer hijack window in exchange for share/revisit UX — acceptable for a single-use $19 product with no chargeable resources behind the cookie |
| Stripe session | Stripe-side        | Stripe TTL           | Source of truth for paid status; KV is a derived cache                                                                                                                                                       |
| Cost telemetry | Pino logs (Vercel) | Vercel log retention | Aggregated per request                                                                                                                                                                                       |
| Sentry events  | Sentry             | Sentry retention     | Conditional on `SENTRY_DSN`                                                                                                                                                                                  |

**Critical invariant:** KV TTL, JWT expiry, and cookie `Max-Age` must all equal **604800 seconds (7d)**. Set in three places: `kv.ts:TTL_SECONDS`, `session.ts:setExpirationTime('7d')`, `app/api/auth/route.ts:maxAge`. Changing one requires changing all three. The auth nonce (`kv.ts:NONCE_TTL_SECONDS`) is deliberately shorter at 24h — single-use, only needs to survive the post-checkout redirect. (See `.claude/rules/contracts.md`.)

## 5. Integration map

| Service             | Purpose                                  | Auth                                          | Quota / Plan      | Failure mode                                                                              | Where alerted         |
| ------------------- | ---------------------------------------- | --------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- | --------------------- |
| Anthropic           | LLM pipeline (Claude)                    | `ANTHROPIC_API_KEY`                           | Paid, per-token   | 429 → single retry; credit exhaustion → Slack alert; 5xx → bubble to user as 502 (rare)   | Slack                 |
| Signa SDK           | USPTO + EUIPO + WIPO trademark search    | `SIGNA_API_KEY`                               | Plan-dependent    | Per-call try/catch → `risk: 'uncertain'` for that candidate                               | Logged; not paged     |
| EUIPO direct        | Cross-check (sandbox by default)         | OAuth client creds (`EUIPO_CLIENT_ID/SECRET`) | Sandbox unmetered | Token failure → Slack alert; per-call failure → "EUIPO check unavailable" surface text    | Slack                 |
| DNS (Node)          | Layer 1 domain availability              | None                                          | Unmetered         | Falls through to RDAP / WhoisJSON                                                         | Logged                |
| rdap.org            | Layer 2 domain availability              | None                                          | Unmetered, public | Falls through to WhoisJSON                                                                | Logged                |
| WhoisJSON           | Layer 3 domain availability              | `WHOISJSON_API_KEY`                           | 1000/month free   | When key absent → silent skip; quota → "uncertain" + cross-source note                    | Slack on auth failure |
| LaunchDarkly        | Single flag (`euipo-direct-cross-check`) | `LAUNCHDARKLY_SDK_KEY`                        | Free tier         | Defaults to flag-off when key absent                                                      | Not paged             |
| Stripe              | Checkout + webhook                       | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Standard fees     | Webhook signature failure → Slack alert + 401; missing webhook → reconciled by daily cron | Slack                 |
| Vercel KV (Upstash) | Report cache + nonce                     | `KV_REST_API_URL` + token                     | Plan-dependent    | KV save failure → Slack alert; user blocked from `/results`                               | Slack                 |
| Resend              | Transactional email                      | `RESEND_API_KEY`                              | Free 3000/mo      | Best-effort; logged failure but does not block paywall                                    | Logged                |
| Sentry              | Error tracking                           | `SENTRY_DSN` (optional)                       | Plan-dependent    | Optional — code degrades to console-only                                                  | N/A                   |
| Slack               | Outbound alerts                          | `SLACK_ALERT_WEBHOOK_URL` (optional)          | Free              | Optional — alerts no-op if webhook absent                                                 | N/A                   |

## 6. Failure modes & recovery

| Failure                                                       | User-visible                                        | Internal recovery                                       | Reference                                |
| ------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| Anthropic 429                                                 | None — auto-retry once                              | `callWithRateLimitRetry`                                | `anthropic.ts`                           |
| Anthropic credit exhausted                                    | 502 with generic error                              | Slack alert; manual top-up                              | `alerts.ts`                              |
| LLM returns valid-but-wrong-shape (ranking, prefix, topPicks) | None — silently corrected                           | `validateReportData` auto-fix; warn log                 | `anthropic.ts`                           |
| LLM hallucinates trademark citations                          | None (telemetry-only currently)                     | `validateGroundedMarks` warn log; future: strip + retry | `anthropic.ts`                           |
| LLM produces homoglyph names (Cyrillic, Greek, full-width)    | None — single retry with strict ASCII caveat        | `HOMOGLYPH_RE` rejection + retry                        | `anthropic.ts`                           |
| Signa down / quota                                            | "Trademark check unavailable" + `risk: 'uncertain'` | Per-call try/catch                                      | `signa.ts`                               |
| EUIPO token failure                                           | "EUIPO check unavailable" coverage note             | Slack alert + skip                                      | `euipo.ts`                               |
| WhoisJSON down                                                | Falls back to DNS + RDAP only                       | `Promise.allSettled`                                    | `dns.ts`                                 |
| Stripe webhook never arrives                                  | None at request time — backstopped by daily cron    | `/api/cron/stripe-reconcile` + Slack alert if found     | `app/api/cron/stripe-reconcile/route.ts` |
| KV save failure                                               | User cannot view `/results`                         | Slack alert; manual investigation                       | `alerts.ts`                              |
| User closes tab before reading report (7d TTL elapses)        | Report gone                                         | Email-me-a-copy at paywall preserves it                 | `email.ts`                               |
| Cross-origin checkout hijacking                               | Auth fails; user redirected                         | Single-use KV nonce, `getdel`-atomic                    | `app/api/auth/route.ts` (ADR-001)        |

## 7. Security model

- **Auth:** Stripe payment → atomic nonce consumption + Stripe session verification → HttpOnly JWT cookie. JWT (jose, HS256, 7d) carries `{reportId, paid, iat, exp}`. Webhook does NOT set cookies (server-to-server, not browser path). See `docs/adr/001-auth-cookie-via-browser-redirect.md`.
- **CSRF:** single-use KV nonce on the auth path prevents replay of old success URLs.
- **Rate limiting:** `proxy.ts` (Next.js 16 middleware) limits `/api/generate` per IP.
- **Input validation:** `/api/generate` validates against allowlists in `types.ts`; `IntakeForm.tsx` chip values are the source of truth (per `.claude/rules/contracts.md`).
- **No `as any`:** SDK-exported types only; `unknown` at trust boundaries with proper narrowing.
- **LLM output is untrusted:** `validateReportData` runs cross-cutting invariants; auto-fix over throw.
- **Secrets:** environment variables only, never committed; `validateEnv` throws on missing required at startup.
- **Refund / abuse:** manual via Stripe dashboard for now; no API surface for self-serve refund.

## 8. Deployment & operations

| Item           | How                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting        | Vercel (Fluid Compute) — Node.js runtime, no edge constraints                                                                            |
| Deploy         | `vercel --prod` (Git integration NOT wired; pushes do not auto-deploy)                                                                   |
| Health check   | `GET /api/health` → `{ status: "ok", kv: { ok: true }, env: { missingRequired: [] } }`                                                   |
| Cron           | `/api/cron/stripe-reconcile` daily, Bearer-auth via `CRON_SECRET` (Hobby plan caps cron at daily cadence)                                |
| Logs           | Pino structured → Vercel log drain                                                                                                       |
| Errors         | Sentry (when `SENTRY_DSN` set)                                                                                                           |
| Alerts         | Slack webhook on: webhook signature failure, KV save failure, Anthropic credit exhaustion, EUIPO token failure                           |
| Env management | `vercel env` CLI (per Vercel guidance); `.env.example` is the canonical list                                                             |
| Test scripts   | `scripts/accuracy-audit.mjs` (10-brief regression, ~$1.40/run, monthly), `scripts/e2e.mjs` (22-check Playwright smoke against localhost) |

## 9. Known weak points / future-proofing

Drawn from the 2026-04-24 audits captured in `README.md`:

- **`/api/cron/stripe-reconcile`** — daily reconciliation of currently zero paid sessions. Real value comes after volume; pre-launch, it's pure insurance.
- **`callWithRateLimitRetry`** — zero empirical 429s yet. Keep for safety, revisit at >100 reports/month.
- **`validateGroundedMarks` / `validateStyleDistribution`** — telemetry-only currently; no baseline hallucination rate measured. Revisit after 100 prod reports for cut-or-promote decision.
- **LaunchDarkly for one flag** — 5.3MB SDK cost. Could collapse to `process.env.EUIPO_ENABLED`. Cut pending validation.
- **`/api/health`** — built for an external uptime monitor not yet configured.
- **WhoisJSON quota at scale** — 1000/mo free covers ~33 reports/day. Phase 2a item: top-picks-only domain check (~70% reduction). Phase 2b: multi-provider stacking (Domainr, WhoisXML, IP2WHOIS).
- **Risk threshold calibration** — `bucketResult` cutoffs (50/80) are heuristic; need 500+ labeled reports to tune empirically.

## 10. References

- Product scope: `docs/PRD.md`
- Roadmap & sequencing: `docs/ROADMAP.md`
- Engineering conventions: `CLAUDE.md`, `AGENTS.md`
- Cross-boundary rules: `.claude/rules/contracts.md`, `.claude/rules/lib.md`
- Pipeline mechanics deep-dive: `docs/superpowers/specs/2026-04-22-agent-pipeline-design.md`
- Auth-flow rationale: `docs/adr/001-auth-cookie-via-browser-redirect.md`
- Audits & history: `README.md` "Internal audits"
