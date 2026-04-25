# Namewright — Security Posture

**Status:** Draft — founder-approved, not counsel-reviewed
**Last updated:** 2026-04-25
**Owner:** Michael (single-founder)

This document describes what Namewright defends against, what it deliberately
doesn't, the open-eyes risks the founder has accepted pre-launch, and how to
report a security issue. It is the companion to `docs/ARCHITECTURE.md` §7
(security model) — that section describes the controls; this one describes the
trade-offs and what was left on the table.

---

## 1. Threat model summary

### What we protect against

| Threat                                                          | Where addressed                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Replay of a Stripe `success_url` to mint a session cookie       | Single-use KV nonce, atomically consumed via `kv.getdel` in `/api/auth`           |
| CSRF on `/api/auth` (cross-origin checkout hijacking)           | Same nonce mechanism + Stripe session verification (`payment_status === 'paid'`)  |
| Anthropic-credit-burn via unauthenticated `/api/generate` abuse | Per-IP rate limit in `proxy.ts`; Slack alert on credit exhaustion (`alerts.ts`)   |
| Stripe-bombing (synthetic-card spam against `/api/checkout`)    | Stripe-side fraud controls + the same per-IP rate limit gating the upstream form  |
| Untrusted LLM output corrupting the report payload              | `validateReportData` + `validateGroundedMarks` + homoglyph regex (`anthropic.ts`) |
| Webhook signature forgery                                       | `stripe.webhooks.constructEvent` verification; failure → Slack alert + 401        |
| Secrets leaking into the repo                                   | `.env*` gitignored; `validateEnv` throws at startup if required keys are absent   |

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

The auth flow (Stripe payment → atomic nonce consumption + Stripe session
verification → HttpOnly JWT cookie → `/results`) is documented in
`docs/ARCHITECTURE.md` §7 and the rationale for setting the cookie in
`/api/auth` rather than the webhook is in
`docs/adr/001-auth-cookie-via-browser-redirect.md`. The cross-component
invariants (KV TTL, JWT expiry, cookie `Max-Age` all = 604800s) are pinned in
`.claude/rules/contracts.md`. This document does not duplicate those — see them
for the controls.

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

### 3.4 Cookie 7-day TTL hijack window

- **Risk.** A stolen JWT cookie remains valid for up to 7 days. The standard
  trade-off — short cookies cut the hijack window but force the user to re-pay
  to re-enter their report.
- **Why accepted.** No chargeable resources sit behind the cookie. The only
  payload is the user's already-purchased report — there is no account,
  subscription, payment method, or upload surface. A stolen cookie lets the
  attacker view one person's brand-name candidates. The UX win (sleep on it,
  share with a co-founder, revisit on another device) outweighs the bounded
  privacy cost. This is the explicit trade-off in `.claude/rules/contracts.md`
  and `docs/ARCHITECTURE.md` §4.
- **Revisit trigger.** Product changes that put a chargeable or sensitive
  resource behind the cookie (subscription tier, stored payment method,
  user-generated upload), OR first reported cookie-theft incident.
- **Mitigation if triggered.** Drop cookie `Max-Age` to 24h to match the
  KV report TTL — the natural floor — and surface a "view report" email link
  for re-entry. The three-place invariant (KV / JWT / cookie all 604800s) makes
  this a coordinated change, not a one-line fix.

### 3.5 Vercel deploy not gated on CI (manual `vercel --prod`)

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

- `docs/ARCHITECTURE.md` §7 — security controls (the _what_; this doc is the _why_)
- `docs/adr/001-auth-cookie-via-browser-redirect.md` — auth-flow rationale
- `.claude/rules/contracts.md` — cross-boundary invariants (TTL alignment, etc.)
- `.github/workflows/ci.yml` — CI gates including `npm audit --audit-level=high`
- `CLAUDE.md` — accuracy guardrails on LLM output (`validateReportData` et al.)
