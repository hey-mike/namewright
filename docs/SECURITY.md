# Namewright — Security Posture

**Status:** Draft — founder-approved, not counsel-reviewed
**Last updated:** 2026-04-26
**Owner:** Michael (single-founder)

This document describes what Namewright defends against, what it deliberately
doesn't, the open-eyes risks the founder has accepted pre-launch, and how to
report a security issue. It is the companion to `docs/ARCHITECTURE.md` §9
(security model) — that section describes the controls; this one describes the
trade-offs and what was left on the table.

---

## 1. Threat model summary

### What we protect against

| Threat                                                          | Where addressed                                                                                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay of a Stripe `success_url` to mint a session cookie       | Single-use KV nonce, atomically consumed via `kv.getdel` in `/api/auth`                                                                                          |
| CSRF on `/api/auth` (cross-origin checkout hijacking)           | Same nonce mechanism + Stripe session verification (`payment_status === 'paid'`)                                                                                 |
| Magic-link token replay or theft                                | 15-min single-use KV token consumed via `consumeMagicLink` (read + delete) in `/api/auth/verify`                                                                 |
| Email-enumeration via the magic-link endpoint                   | `/api/auth/magic-link` always returns 200; sends mail only when a Postgres `User` exists                                                                         |
| Cross-user PDF download                                         | `/api/report/[id]/pdf` requires `paid` cookie + ownership check (Prisma `ReportRecord` for userId, or `session.reportId === reportId` for single-report cookies) |
| Anthropic-credit-burn via unauthenticated `/api/generate` abuse | Per-IP rate limit in `proxy.ts`; Slack alert on credit exhaustion (`alerts.ts`)                                                                                  |
| Stripe-bombing (synthetic-card spam against `/api/checkout`)    | Stripe-side fraud controls + the same per-IP rate limit gating the upstream form                                                                                 |
| Untrusted LLM output corrupting the report payload              | `validateReportData` + `validateGroundedMarks` + homoglyph regex (`anthropic.ts`)                                                                                |
| SQL injection / unsafe DB queries                               | Prisma parameterised queries only; no raw SQL anywhere in the codebase                                                                                           |
| Direct R2 object access by unauthenticated callers              | R2 bucket is private; only the app's signed S3 client (`R2_ACCESS_KEY_ID/SECRET`) can read or write                                                              |
| Webhook signature forgery                                       | `stripe.webhooks.constructEvent` verification; failure → Slack alert + 400                                                                                       |
| Secrets leaking into the repo                                   | `.env*` gitignored; `validateEnv` throws at startup if required keys are absent                                                                                  |

### What we deliberately don't

| Out-of-scope threat                                | Reason                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Volumetric DDoS                                    | Vercel's edge absorbs the L3/L4 layer; we don't operate our own perimeter    |
| Sophisticated targeted attacks (nation-state, APT) | Single-founder bootstrap; not a credible target at this stage                |
| Insider threat                                     | One person; the threat model is "trust the founder"                          |
| Supply-chain compromise of a transitive npm dep    | We pin `package-lock.json` and run `npm audit` in CI, but do not vendor      |
| Browser-side XSS via user-controlled content       | No user-generated content is rendered to other users; reports are private    |
| Long-tail crypto attacks on HS256 JWTs             | `SESSION_SECRET` is ≥32 bytes, rotated on compromise; not a high-value token |

The Namewright threat model is shaped by three facts: (1) reports are private to
the buyer, (2) the only chargeable resource (Anthropic tokens) is gated behind a
rate-limited form, and (3) the cookie protects access to a $19 single-use
artifact, not an account or financial primitive.

---

## 2. Auth surface

There are **two cookies**, both stored in the same HttpOnly `session` cookie
slot. Both are HS256 JWTs minted with `jose`, set with `httpOnly: true`,
`secure: true`, `sameSite: 'lax'`, and `path: '/'`. `verifySession` accepts
either by tolerating `reportId` or `userId` being absent on the payload.

| Cookie kind                  | Issued by                          | Lifetime | Payload                       | Purpose                                                             |
| ---------------------------- | ---------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------- |
| `signSession(reportId, ...)` | `/api/auth` (Stripe-redirect path) | 7 days   | `{ reportId, paid, userId? }` | Single-report viewer for paying customers; preserves prior `userId` |
| `signUserSession(userId)`    | `/api/auth/verify` (magic link)    | 30 days  | `{ userId, paid: true }`      | Multi-report dashboard at `/my-reports`; cross-report access via DB |

### 2.1 Stripe-redirect path

Stripe payment → `/api/auth?session_id=…&report_id=…&nonce=…`. Validation:

1. **Nonce required.** Without it, SameSite=Lax would let a top-level GET
   set the victim's session cookie to a Stripe session of the attacker's
   choosing. Server-side `consumeAuthNonce` is atomic via `kv.getdel`.
2. **Stripe verifies paid.** `stripe.checkout.sessions.retrieve` confirms
   `payment_status === 'paid'` and `metadata.reportId` matches.
3. **Report must exist in R2.** `getReport(reportId)` — if missing, redirect home.
4. **Cookie issued.** `signSession(reportId, true, existingSession?.userId)` —
   if the user was already signed in via magic link, their `userId` carries
   over so they don't lose `/my-reports` access.

The webhook does **not** set cookies. See `docs/adr/001-auth-cookie-via-browser-redirect.md`.

### 2.2 Magic-link path

Sign-in flow for users who want to revisit multiple reports across devices:

1. **`POST /api/auth/magic-link`** with `{ email }`. Server normalizes the
   email and looks up a Postgres `User`. If the user exists, a `randomUUID`
   token is stored in KV (`magic_link:<token>`, 15-minute TTL) and an email
   with the verify URL is sent via Resend. **The endpoint always returns
   200**, regardless of whether the user exists — this is anti-enumeration.
2. **`GET /api/auth/verify?token=…`**. `consumeMagicLink(token)` does
   `kv.get` + `kv.del` (single-use). The matching `User` is fetched from
   Postgres; a 30-day `signUserSession(user.id)` cookie is issued.
3. **`POST /api/auth/logout`** clears the `session` cookie.

A leaked magic-link URL is single-use and expires in 15 minutes. A leaked
session cookie remains valid for up to 30 days — see §3.4 for the
hijack-window trade-off.

### 2.3 PDF download gate

`/api/report/[id]/pdf` enforces the same gate as `/results`:

- A `session` cookie must be present and `paid: true`.
- If the cookie carries `userId`, the requested `reportId` must belong to
  that user — verified via `prisma.reportRecord.findUnique({ where: { id: reportId } })`.
- Otherwise, the cookie must carry `reportId` matching the requested id
  (single-report path).

PDFs render on demand and write through to R2 if the immutable copy is
missing (handles old reports + cases where the Inngest `save-report-pdf`
step failed).

### 2.4 Cross-component invariants

The KV TTL, JWT expiry, and cookie `Max-Age` for the **paid (Stripe)**
cookie all equal 604800s (7d). This three-way pin is in
`.claude/rules/contracts.md`. Note: the report itself is now in R2 (no
TTL); the 7d figure refers only to the cookie / JWT lifetime, not to
report retention.

The magic-link cookie is independently 30 days. Magic-link tokens in KV
are 15 minutes. These do not need to align with the paid-cookie window.

---

## 3. Accepted risks register

Each row is an open-eyes decision the founder has made. Format: **risk → why
accepted → revisit trigger → mitigation if triggered**.

### 3.1 Seven moderate `npm audit` findings in the prod dep chain

- **Risk.** `npm audit` reports 7 moderate-severity advisories rooted at
  `uuid <14`, propagated through `svix` → `resend`, with secondary surfaces in
  `next` and `@vercel/analytics`. The fix requires a major-version bump of
  `resend` (breaking).
- **Why accepted.** CI runs `npm audit --audit-level=high`, which is the
  threshold the founder is willing to block builds on. The advisories are
  moderate, none are exploitable in our usage path (the affected `uuid` code
  paths are not reachable from our handler code), and a `resend` major bump on
  launch week introduces more risk than the vulnerabilities themselves. A
  forced upgrade right before launch is the larger production-incident risk.
- **Revisit trigger.** Any of: (a) one of the 7 advisories is upgraded to High
  or Critical; (b) `resend` ships a non-breaking patch path; (c) the next
  scheduled quarterly review (see §5); (d) we cross 500 paid reports/month and
  the supply-chain blast radius grows.
- **Mitigation if triggered.** Bump `resend` on a feature branch, run the full
  test suite + `scripts/e2e.mjs`, deploy to a preview environment, then promote.
  If only one transitive needs an override, evaluate `npm-force-resolutions`
  before the major bump.

### 3.2 No external bot detection (Vercel BotID not wired)

- **Risk.** `/api/generate` is reachable by automated clients. A motivated
  scraper could spend our Anthropic credits to harvest naming output.
- **Why accepted.** Per-IP rate limit in `proxy.ts` is the first line of
  defense. Anthropic credit-exhaustion alert (`alerts.ts` → Slack) is the
  second. Adding Vercel BotID before any observed abuse would be premature
  optimization with a non-trivial UX cost (challenge friction on legitimate
  users). At zero traffic, the cost-benefit is upside-down.
- **Revisit trigger.** First Anthropic credit-exhaustion alert from non-organic
  traffic, OR sustained per-IP rate-limit hits in logs, OR >500 reports/month.
- **Mitigation if triggered.** Wire Vercel BotID on `/api/generate` only;
  configure invisible challenge so legitimate users see no friction.

### 3.3 No external uptime monitor

- **Risk.** Production outages are observed only when a user reports them or
  when the founder happens to check.
- **Why accepted.** `/api/health` is built and shipping (KV ping + missing-env
  check), but the external poller is not configured. Pre-launch, with a single
  founder who actively dogfoods the product, an outage is detected within
  minutes anyway. The first-major-outage cost is bounded — we issue refunds via
  Stripe dashboard.
- **Revisit trigger.** First production outage longer than 15 minutes, OR
  first paid customer report of unavailability, OR first scheduled quarterly
  review after launch.
- **Mitigation if triggered.** Wire BetterUptime / UptimeRobot to
  `GET /api/health`; route the page to the founder's phone; set the threshold
  at 2 consecutive failures (30s interval).

### 3.4 Cookie 7-day TTL hijack window (paid-session cookie)

- **Risk.** A stolen 7-day JWT cookie remains valid for up to a week. The
  standard trade-off — short cookies cut the hijack window but force the user
  to re-pay to re-enter their report.
- **Why accepted.** No chargeable resources sit behind the cookie. The only
  payload is the user's already-purchased report — there is no account,
  subscription, payment method, or upload surface. A stolen cookie lets the
  attacker view one person's brand-name candidates. The UX win (sleep on it,
  share with a co-founder, revisit on another device) outweighs the bounded
  privacy cost. This is the explicit trade-off in `.claude/rules/contracts.md`
  and `docs/ARCHITECTURE.md` §6.
- **Revisit trigger.** Product changes that put a chargeable or sensitive
  resource behind the cookie (subscription tier, stored payment method,
  user-generated upload), OR first reported cookie-theft incident.
- **Mitigation if triggered.** Drop cookie `Max-Age` to 24h and surface a
  "view report" email link for re-entry. The three-place invariant
  (KV / JWT / cookie all 604800s) makes this a coordinated change, not a
  one-line fix.

### 3.5 Magic-link cookie 30-day window

- **Risk.** A stolen 30-day userId-bearing cookie grants access to **every**
  report owned by that user (`/my-reports`, plus PDF downloads gated by
  `ReportRecord` ownership). The blast radius is wider than the single-report
  cookie above, and the lifetime is longer.
- **Why accepted.** Magic-link auth is the multi-report UX, and short cookies
  (24h) would force email re-verification too often given the access pattern
  (return weeks later to revisit a name). No payment method, subscription,
  or upload surface sits behind the cookie — the attacker can read reports,
  not bill the victim or upload to the bucket. R2 access requires server-side
  S3 credentials regardless of cookie state.
- **Revisit trigger.** Same as §3.4 plus: report contents become commercially
  sensitive (e.g. trademark counsel-grade), OR the magic-link flow is reused
  for any chargeable feature.
- **Mitigation if triggered.** Drop the userId cookie `Max-Age` to 7 days
  (matching the paid-session cookie); add `iat`-based session re-verification
  for sensitive routes; consider rotating session secrets on suspicion.

### 3.6 New attack surfaces from the R2 + Postgres + Inngest stack

- **Risk.** The 2026-04 migration replaced "report in KV" with three new
  systems: R2 for canonical storage, Postgres for user/report records, and
  Inngest for the background pipeline. Each has its own auth surface,
  credentials, and (for local dev) misconfiguration potential.
- **Why accepted.** The trade-off is documented per system:
  - **R2.** Bucket is private. Reads/writes require signed S3 credentials
    (`R2_ACCESS_KEY_ID/SECRET`). No public link, no presigned URL surface.
    All app-facing access goes through `/api/preview`, `/results`, or
    `/api/report/[id]/pdf`, each of which enforces its own auth gate.
  - **Postgres.** All access via Prisma — parameterised queries only,
    no raw SQL. The DB is reachable only from Vercel's egress with the
    `DATABASE_URL` connection string.
  - **Inngest.** Production handler at `/api/inngest` is signature-verified
    via `INNGEST_SIGNING_KEY`; only the Inngest broker can invoke
    `generateReportJob`. Unsigned `POST` to the route 401s.
  - **Local stack.** MinIO + the kv-emulator + dockerised Postgres use
    well-known test credentials (`test-account`/`test-secret`,
    `test-token`, `test-user`/`test-password`). These must never be
    promoted to production env vars. The `.env.example` carries placeholder
    R2 / DATABASE_URL values, and `validateEnv` does not currently
    distinguish prod-grade creds from dev placeholders — operator
    discipline only.
- **Revisit trigger.** First production R2 / Postgres / Inngest incident,
  OR a credential-leak scare, OR scaling beyond a single Vercel project.
- **Mitigation if triggered.** Rotate the leaked credential set, add
  Sentry/Slack alerts on auth failures from R2 + Postgres connections,
  consider IAM-style scoping on R2 (read-only vs write paths) and
  separate connection users in Postgres.

### 3.7 Vercel deploy not gated on CI (manual `vercel --prod`)

- **Risk.** A push that passes CI on `main` is not automatically deployed; a
  push that _fails_ CI could in principle still be deployed by hand. The Git
  integration is not wired.
- **Why accepted.** Solo founder, single deployer, full discretion over what
  ships. Manual `vercel --prod` is the founder's last review gate — running CI
  - `npm test` + a quick smoke is part of the personal pre-deploy routine.
    Auto-deploy on `main` would remove that gate without adding a second pair of
    eyes (because there isn't one).
- **Revisit trigger.** Second engineer joins, OR first incident traced to a
  manually-deployed change that CI would have caught.
- **Mitigation if triggered.** Enable Vercel Git integration on `main`; require
  CI green before promote-to-production.

---

## 4. Responsible disclosure

If you find a security issue in Namewright, please email
**`support@namewright.co`** with details. Please do **not** open a public
issue, post to social media, or share publicly until we've had a chance to
respond.

- **Response time.** We aim to acknowledge within 5 business days. We are a
  one-person team, so response may be slower than a larger company's.
- **Bug bounty.** We do not run a bug bounty program at this time. We are not
  in a position to pay for findings.
- **Acknowledgement.** Good-faith reporters who follow this process and allow
  us reasonable time to fix the issue will be thanked publicly in §6 of this
  document, with their name and a link of their choosing.
- **Scope.** Issues on the Namewright production domain
  (`namewright.co` and subdomains) and the prod npm dependency tree. Out of
  scope: third-party services (Stripe, Vercel, Anthropic, Resend) — please
  report those upstream.
- **Safe harbor.** We will not pursue legal action against researchers who act
  in good faith, do not exfiltrate data beyond what's needed to demonstrate the
  issue, and give us a reasonable disclosure window.

---

## 5. Revisit cadence

The accepted risks in §3 are reviewed:

- **Quarterly**, on a calendar reminder (next review: 2026-07-25).
- **Triggered**, on any of:
  - Production volume crosses 500 paid reports/month.
  - First production incident (any severity).
  - First reported security issue (whether valid or not — the report itself
    is signal that someone is looking).
  - Any of the per-row revisit triggers in §3.

Each review either re-accepts the risk (with a new revisit date), upgrades the
mitigation, or removes the entry. Decisions are appended below the table —
historical entries are not deleted.

---

## 6. Hall of fame

No external reports yet. This section will list good-faith reporters by name
(with their permission) once the first one comes in.

---

## 7. References

- `docs/ARCHITECTURE.md` §9 — security controls (the _what_; this doc is the _why_); §4–§5 — storage layers and the two-cookie auth model
- `docs/adr/001-auth-cookie-via-browser-redirect.md` — auth-flow rationale
- `.claude/rules/contracts.md` — cross-boundary invariants (TTL alignment, etc.)
- `.github/workflows/ci.yml` — CI gates including `npm audit --audit-level=high`
- `CLAUDE.md` — accuracy guardrails on LLM output (`validateReportData` et al.)
