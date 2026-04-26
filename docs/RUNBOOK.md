# Incident Runbook (Internal)

**Status:** Draft — founder-approved
**Owner:** Michael Luo (founder)
**Created:** 2026-04-25
**Last revised:** 2026-04-26

This is a 2am playbook for when a Slack alert fires. It optimizes for "do the next thing," not completeness. Read the section that matches the alert, run the steps, escalate or accept impact when the section says to. Strategy doc lives elsewhere — this is recovery.

For refunds and customer comms after recovery, also read `docs/REFUND_POLICY.md` §2.2 (technical-failure auto-refund).

> **Pipeline shape (2026-04 onwards).** Generation is event-driven. `/api/generate`
> dispatches a `report.generate` event to Inngest and returns `{ jobId, reportId }`;
> the browser polls `/api/status/[jobId]` (SSE, every 3s) until the Inngest job
> sets `completed` or `failed` in KV. The actual work runs in
> `src/inngest/functions.tsx::generateReportJob`. When triaging "report failed"
> reports, the Inngest dev/prod UI is your starting point — see §9.

---

## First 60 seconds

Open these tabs before reading further. If a step below references one of them, it's already loaded.

1. **Slack alerts channel** — `#namewright-alerts` <TBD: confirm channel name>. Read the alert. Note `requestId` from the message body.
2. **Vercel deployment logs** — `https://vercel.com/<team>/namewright/logs` <TBD: fill team slug>. Filter by `requestId` from the alert.
3. **Stripe dashboard** — `https://dashboard.stripe.com/` (live mode). Open Webhooks and Payments tabs.
4. **Upstash console** — `https://console.upstash.com/redis/<db-id>` <TBD: fill db id>. Watch the "Metrics" tab.
5. **Anthropic console** — `https://console.anthropic.com/`. Bookmark Billing → Credits and Usage.
6. **Sentry** — `https://sentry.io/organizations/<org>/issues/` <TBD: fill org or note "not wired yet">.
7. **Health endpoint** — `curl https://namewright.co/api/health`. Expect `{ status: "ok", kv: { ok: true }, env: { missingRequired: [] } }`.

If health is degraded or any of the dashboards above is itself unreachable, treat it as an outage of that dependency, not Namewright — skip to §6 (Decision tree).

---

## 1. Anthropic 5xx mid-pipeline

### 1.1 Alert shape

- **Title:** Slack does NOT alert on a single 5xx — only on credit exhaustion (§2). A 5xx surfaces as a 502 to the user, a `report generation failed` Pino log, and a Sentry breadcrumb.
- **You will see this when:** customer emails `support@namewright.co` saying "Generate failed," OR Sentry issue spike `report generation failed` in `src/app/api/generate/route.ts:143`.

### 1.2 First diagnostic

1. Anthropic status page — `https://status.anthropic.com`. If they're red, this is them, not you.
2. Vercel logs — search `report generation failed` in last 30min. Count the failures. If <5 in 30min and Anthropic is green, it's transient — stop here, no action.
3. Check the `stage` field on the log line. `getErrorStage` at `src/lib/anthropic.ts` tags which pipeline stage threw (`niceClass`, `candidates`, `synthesis`).
4. Pull the matching Inngest run via §9 to see whether the failure was inside the `generate-report` step (Anthropic) or downstream (R2 / KV).

### 1.3 Mitigation — transient (Anthropic green, low rate)

1. Do nothing. The Inngest job set `failed` status in KV, the SSE stream delivered "Report generation failed. Please try again." to the user (`src/inngest/functions.tsx`).
2. If a customer emails, refund per `docs/REFUND_POLICY.md` §2.2 (technical failure).

### 1.4 Mitigation — Anthropic outage (status page red, or >5 failures in 30min)

1. Post a holding message in `#namewright-alerts`: "Anthropic 5xx, customer impact: report generation surfaces failure to user via SSE, ETA: monitoring."
2. Pause new traffic if the rate is severe: take down the homepage CTA via Vercel — set env var `NEXT_PUBLIC_DOWN=1` <TBD: not yet wired, decide whether to add the gate or just leave it broken>.
3. Do NOT refund pre-emptively. Refund only customers who email.
4. When Anthropic is green, watch one fresh `/api/generate` call complete (Inngest run shows `set-completed-status` step succeeded) before unpausing.

### 1.5 Escalation / give-up

Anthropic outages last <2h historically. After 4h with no Anthropic status update, mass-email customers who hit a 502 in the window (grep Vercel logs for `report generation failed` + `requestId`, cross-ref Stripe charges by timestamp) using the template in §7. Refund them all.

---

## 2. Anthropic credit balance exhausted

### 2.1 Alert shape

- **Title:** `:rotating_light: *Anthropic credit balance exhausted*`
- **Sender:** Slack incoming webhook (`SLACK_ALERT_WEBHOOK_URL`)
- **Body excerpt:** `error: "Your credit balance is too low to access the Claude API..."`, `stage: "candidates" | "synthesis" | "niceClass"`, `requestId: <uuid>`, `jobId: <uuid>`
- **Source:** `src/inngest/functions.tsx` (the `generate-report` step's catch block)

### 2.2 First diagnostic

1. Anthropic console → Billing → Credits. Confirm balance is $0 or negative.
2. Check usage trend — has spend spiked unusually in the last 24h? If yes, suspect runaway loop or abuse. Investigate before topping up.

### 2.3 Mitigation — top up

1. Anthropic console → Billing → Add credits. Add $50 minimum (covers ~200 reports at current cost).
2. Confirm balance is positive.
3. Trigger one `/api/generate` from prod (use `DEV_MOCK_PIPELINE=0` explicit in dev tools panel, or just run a real free preview from the UI). Verify it returns 200.
4. Post in `#namewright-alerts`: "Anthropic credits topped up, service restored."
5. Customers hit during the outage: refund per `docs/REFUND_POLICY.md` §2.2. They paid $19, the report failed, refund without asking.

### 2.4 Mitigation — auto-reload (post-incident, do once)

1. Anthropic console → Billing → enable auto-reload at $20 trigger / $100 reload <TBD: confirm thresholds>.
2. This alert should never fire twice. If it does, the auto-reload is broken — fix it before topping up again.

### 2.5 Escalation / give-up

If Anthropic billing is rejecting your card (rare), there is no path to recovery in <30min. Email all in-flight customers via §7 and refund. Fix the card on file in business hours.

---

## 3. Stripe webhook signature failure spike

### 3.1 Alert shape

- **Title:** `:rotating_light: *Stripe webhook signature verification failed*`
- **Sender:** Slack incoming webhook
- **Body excerpt:** `error: "No signatures found matching the expected signature for payload..."` OR `error: "Missing stripe-signature header"`, `hasSignature: true|false`, `requestId: <uuid>`
- **Source:** `src/app/api/webhook/route.ts:30`

### 3.2 First diagnostic — differentiate misconfig vs attack

1. Stripe dashboard → Developers → Webhooks → click the prod endpoint → "Recent deliveries." If Stripe is showing `400 Invalid signature` on legitimate sessions, this is misconfig (your secret rotated, or env var got out of sync after a deploy).
2. Vercel logs → search `Stripe webhook signature verification failed`. Look at `hasSignature`:
   - `hasSignature: false` and Stripe dashboard shows no recent deliveries → external attacker hitting `/api/webhook` directly. Not urgent — Stripe deliveries still work; you're just being scanned.
   - `hasSignature: true` and frequency matches Stripe's delivery rate → secret mismatch. Misconfig. Urgent.

### 3.3 Mitigation — misconfig (real Stripe deliveries failing)

1. Stripe dashboard → Webhooks → prod endpoint → "Signing secret" → copy.
2. `vercel env ls production | grep STRIPE_WEBHOOK_SECRET` — confirm it differs.
3. `vercel env rm STRIPE_WEBHOOK_SECRET production` then `vercel env add STRIPE_WEBHOOK_SECRET production` paste new value.
4. Redeploy: `vercel --prod`.
5. In Stripe dashboard → Webhooks → "Send test webhook." Verify 200 response.
6. The daily reconciliation cron (`/api/cron/stripe-reconcile`) will catch any paid-but-unprocessed sessions in the next 24h. No manual customer recovery needed unless §3.5 fires.

### 3.4 Mitigation — attack (signatures absent, scanning)

1. Do nothing immediately — `proxy.ts` rate-limits `/api/generate` but `/api/webhook` is not rate-limited. Stripe deliveries still work, attacker is just noise.
2. If alert volume is drowning real signal: temporarily silence the alert in Slack (Slack channel → mute for 1h). Do NOT remove the alert from code.
3. Add IP allowlist for Stripe's webhook IPs (`https://stripe.com/docs/ips`) to `proxy.ts` <TBD: not currently implemented; queue as P2 task if attacks recur>.

### 3.5 Escalation / give-up

If misconfig persists >30min and you cannot get the secret rotated, downstream customers will be stuck (paid but report-email-not-sent — auth flow still works since it doesn't depend on webhook). Run the reconcile cron manually:

```
curl -H "Authorization: Bearer $CRON_SECRET" https://namewright.co/api/cron/stripe-reconcile
```

Per `src/app/api/cron/stripe-reconcile/route.ts`, it will Slack-alert the missing reportIds. Note: the cron currently does `kv.get('report:${reportId}')` (legacy from pre-R2 storage). After the R2 migration, KV no longer holds reports, so the cron will report 100% missing if it actually runs against fresh data. The "missing" list is still useful as a rough cross-reference of paid sessions in the lookback window, but treat the count as noise until the cron is rewritten to query R2 (`getReport`) or Postgres (`prisma.reportRecord`). Email-me-a-copy customers in that list will not have received their email — manually trigger via `sendReportEmail` from a one-shot script <TBD: script not yet written; for now, paste reportId into a dev session and call the function directly>.

---

## 4. EUIPO sandbox token failure

### 4.1 Alert shape

- **Title:** `:warning: *EUIPO OAuth token fetch failing*`
- **Sender:** Slack incoming webhook
- **Body excerpt:** `status: 403 | 401 | 500`, `error: "..."`. No `requestId` field — debounced at the integration level, not per-request.
- **Source:** `src/lib/euipo.ts:280`. Debounced at `TOKEN_ALERT_DEBOUNCE_MS` (alert fires at most once per debounce window).

### 4.2 First diagnostic

1. Is this sandbox or prod? Check `vercel env ls production | grep EUIPO_AUTH_BASE_URL`. Sandbox = `auth.sandbox.euipo.europa.eu` <TBD: confirm exact sandbox host>; prod = `auth.euipo.europa.eu`.
2. EUIPO sandbox 403s on tokens are common — it rotates credentials without notice and has unannounced maintenance. Prod 403s are real.
3. Check `LaunchDarkly` flag `euipo-direct-cross-check` — if it's already off, this alert is from a different code path. If it's on, candidates are getting "EUIPO check unavailable" notes but reports still ship (Signa is the primary source, EUIPO is cross-check).

### 4.3 Mitigation — sandbox (default, pre-launch)

1. **Customer impact: zero.** EUIPO direct is cross-check on top of Signa. Signa covers EUIPO via its own data path. Customers see "EUIPO direct check unavailable" in coverage notes — that is the documented graceful degradation.
2. Silence: turn the LD flag `euipo-direct-cross-check` off via `https://app.launchdarkly.com/`. Alerts stop firing because the integration is no longer called.
3. File a support ticket at `dev.euipo.europa.eu` <TBD: confirm support contact path>. Wait for them to respond. They run on EU business hours.
4. Re-enable the flag when sandbox is green again.

### 4.4 Mitigation — production (post-launch, after EUIPO prod approval)

1. Same diagnostic + flag silence as §4.3.
2. Customer impact still zero — Signa coverage means EU geographies still get a trademark answer, just without the direct-API cross-check.
3. Open a P1 ticket with EUIPO. Production tokens failing is on them, not us.

### 4.5 Escalation / give-up

EUIPO sandbox flakiness is expected. If alerts fire >3x/week, the right move is to disable the flag permanently until production credentials are approved. Do NOT add retries — the Slack alert is already debounced and the integration already falls back. See `docs/ARCHITECTURE.md` §11 ("LaunchDarkly for one flag — could collapse to env var") for the long-term cleanup.

---

## 5. Storage failures (R2 / KV / Postgres)

> **As of the 2026-04 R2 migration:** report JSON + PDF live in R2 (canonical,
> permanent). Postgres holds `User` + `ReportRecord` (permanent). KV is short-lived
> state only (auth nonces 24h, magic-link tokens 15min, job status 24h). Older
> guidance below assumed KV held the report — re-read with that in mind.

### 5.1 Alert shape

- **Title:** `:rotating_light: *R2 save failed for generated report*` OR `:rotating_light: *Email opt-in failed: report missing from KV*` OR `:rotating_light: *Stripe reconciliation: N paid session(s) missing from KV*`
- **Sender:** Slack incoming webhook
- **Body excerpt:** `reportId: <uuid>`, `error: "Connection timeout" | "ETIMEDOUT" | "503 Service Unavailable" | "AccessDenied"`, `requestId: <uuid>`
- **Source:** `src/inngest/functions.tsx` (R2 save failure), `src/app/api/webhook/route.ts` (webhook → email lookup), `src/app/api/cron/stripe-reconcile/route.ts` (cron)

### 5.2 First diagnostic

1. `curl https://namewright.co/api/health` — if `kv.ok: false`, KV is down for the app. If `kv.ok: true`, KV is fine; if R2-related, drill into R2 instead.
2. Cloudflare R2 dashboard → your bucket → "Metrics" / "Status." Health is binary.
3. Upstash console → your KV DB → "Status." If red, it's them. If green, the issue is auth/credentials.
4. Vercel logs → search `R2 save failed` or `KV save failed`. Count in last 15min. >3 = sustained, not transient.
5. Cross-reference with Inngest: in §9's UI, R2-step failures show up as `save-report` retries-then-failure. The Inngest run details surface the actual S3 error.

### 5.3 Mitigation — transient (1-2 failures, storage now green)

1. Refund the affected customers per `docs/REFUND_POLICY.md` §2.2. Use `requestId` to grep Vercel logs and find the Stripe sessionId; cross-ref Stripe to find customer email.
2. Close the alert. No service action needed.

### 5.4 Mitigation — sustained R2 outage

1. **Customer impact: severe.** New `/api/generate` jobs reach the `save-report` step and fail; KV gets `failed`; SSE delivers a generic error. In-flight customers who already have a report cookie see broken `/results` (R2 `getReport` returns null).
2. Disable the homepage CTA — `vercel env add NEXT_PUBLIC_DOWN 1 production` and redeploy <TBD: gate not currently wired in `IntakeForm.tsx`>.
3. Cloudflare R2 dashboard → check status. There is no failover.
4. Email all customers who paid in the last 24h via §7, even if their report still works for them. R2 outages have not historically caused durable data loss, but if they do, the input is not stored separately.
5. When R2 recovers, run `/api/cron/stripe-reconcile` (see §3.5 command) to identify orphan paid sessions.

### 5.5 Mitigation — sustained KV outage

1. **Customer impact: severe but bounded.** New jobs cannot record `pending` / `completed`, so the SSE stream errors out. Existing customers viewing `/results` continue to work — `/results` reads R2 directly. `/my-reports` continues to work — it reads Postgres. Magic-link sign-in fails (token storage in KV).
2. Disable the homepage CTA per §5.4 step 2. Sign-in flows degrade silently — magic-link emails still send, but the link 404s.
3. Upstash console → P1 ticket. No failover.
4. When KV recovers, the SSE polling resumes; no data backfill needed.

### 5.6 Mitigation — Postgres outage

1. **Customer impact: targeted.** New paid checkouts lose the `User` / `ReportRecord` upsert (webhook logs the error but does not 5xx — Stripe will not retry). `/my-reports` 5xx's. The 7-day Stripe-cookie path still works (no DB read in `/results` for that path).
2. Failed webhook DB upserts during the window need backfill once Postgres recovers — grep webhook logs for `Failed to map report to user in DB` and re-run upserts manually <TBD: write a one-shot script>.

### 5.7 Customer who paid + sees broken /results

1. Check Stripe dashboard for their charge → grab `sessionId` from metadata.
2. Search Vercel logs for `sessionId` → find `reportId` in the `paid session processed` log line.
3. Inspect R2: bucket → `reports/<reportId>.json`. If missing, the JSON save failed (cross-check Slack for `R2 save failed`).
4. There is no recovery for a lost report — the input is not stored separately. Refund per §2.2 and email the §7 template.

### 5.8 Escalation / give-up

If R2 is down >2h, every paying customer in that window is impacted. Mass-email everyone who paid in the last 24h via §7, refund all of them, then post a public note <TBD: status page not yet set up; for now use a Twitter/LinkedIn post from the founder account>. Do not retry the work — the input data is gone.

---

## 6. Decision tree

| Condition                                                | Action                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Single customer hit 5xx, system otherwise green          | Refund only on customer email. Do NOT roll back. Do NOT mass-email.                          |
| 3+ customers hit 5xx in 1h, system metrics show recovery | Refund proactively (grep logs by `requestId`, cross-ref Stripe). Do NOT roll back.           |
| Sustained 5xx >15min, green deploy in last 24h           | **Roll back.** `vercel rollback` to previous prod deployment. Then diagnose.                 |
| Sustained 5xx >15min, no recent deploy                   | External dependency. Diagnose per §1–§5. Do NOT roll back.                                   |
| R2 down >30min                                           | Mass-email §7 to last-24h customers + refund all. Wait for R2 recovery.                      |
| KV down >30min                                           | Disable homepage CTA. New jobs error in SSE; existing reports keep working. Wait.            |
| Postgres down >30min                                     | `/my-reports` 5xx's. New paid checkouts lose User/ReportRecord upsert. Backfill on recovery. |
| Anthropic credits exhausted, balance topped up           | Refund customers hit during outage. No mass-email needed.                                    |
| Webhook signature failures with `hasSignature: true`     | Rotate secret immediately (§3.3). No customer comms needed if reconcile cron runs.           |
| EUIPO sandbox/prod token failures                        | Disable LD flag. No customer impact. No comms.                                               |
| Sentry error spike but no Slack alert                    | Triage in business hours unless customer-reported. Slack alerts are the on-call signal.      |

**Rule of thumb on rollback:** if the last deploy was <24h ago and the alert started after it, roll back first, diagnose second. Time to recover wins.

---

## 7. Customer comms template

For mass-email after an outage (KV loss, Anthropic prolonged, webhook misconfig that broke email-me-a-copy). Send from `support@namewright.co`.

```
Subject: Namewright — your $19 has been refunded

Hi [name],

Earlier today Namewright had a [outage / technical issue / system failure] that affected
your report. I've refunded the $19 charge in full to your original payment method — it
should appear within 5–10 business days.

If you'd like to try again once we've fixed the root cause, the homepage will be back
to normal at [time / "shortly"]. No need to reply unless you have questions.

Sorry for the trouble.

— Michael
Founder, Namewright
```

Per `docs/REFUND_POLICY.md` §4.4 ("never admit fault" in writing): do NOT use phrases like "we got it wrong," "our tool failed," "we lost your report." "Outage," "technical issue," "system failure" are all fine. The refund is the remedy.

For one-off customer responses (single 5xx, single KV miss), use the `docs/REFUND_POLICY.md` §5.1 template directly — the §7 wording above is for batch comms only.

---

## 8. Tools dictionary

| Tool                    | URL pattern                                                                                    | Notes                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Vercel logs             | `https://vercel.com/<team>/namewright/logs?query=<requestId>`                                  | <TBD: fill team slug>. Default retention is 1d on Hobby, 7d on Pro.                   |
| Vercel deployments      | `https://vercel.com/<team>/namewright/deployments`                                             | For `vercel rollback` UI. CLI alternative: `vercel rollback <deployment-url>`.        |
| Stripe dashboard        | `https://dashboard.stripe.com/`                                                                | Live mode. Webhooks tab: `/webhooks`. Payments tab: `/payments`.                      |
| Stripe webhooks         | `https://dashboard.stripe.com/webhooks`                                                        | "Recent deliveries" shows signature failures from Stripe's side.                      |
| Anthropic console       | `https://console.anthropic.com/`                                                               | Billing → Credits. Usage → API.                                                       |
| Anthropic status        | `https://status.anthropic.com`                                                                 | Subscribe to email updates from this page.                                            |
| Upstash console         | `https://console.upstash.com/redis/<db-id>`                                                    | <TBD: fill db id>. Metrics tab. CLI access via `redis-cli` with REST URL.             |
| LaunchDarkly            | `https://app.launchdarkly.com/`                                                                | Project: namewright <TBD: confirm project name>. Flag: `euipo-direct-cross-check`.    |
| Sentry                  | `https://sentry.io/organizations/<org>/issues/`                                                | <TBD: not yet wired; document URL for when DSN is added>.                             |
| Slack alerts channel    | `#namewright-alerts`                                                                           | <TBD: confirm channel name>. Webhook env: `SLACK_ALERT_WEBHOOK_URL`.                  |
| Health endpoint         | `https://namewright.co/api/health`                                                             | Returns `{ status, kv, env }`. No auth required.                                      |
| Reconcile cron (manual) | `curl -H "Authorization: Bearer $CRON_SECRET" https://namewright.co/api/cron/stripe-reconcile` | Vercel auto-runs daily; this is the manual override.                                  |
| Vercel env CLI          | `vercel env ls production` / `vercel env add` / `vercel env rm`                                | All env mutations require redeploy via `vercel --prod`.                               |
| Upstash CLI             | `redis-cli -u $KV_URL`                                                                         | <TBD: confirm whether REST or TCP URL works with redis-cli; may need separate setup>. |
| Inngest dashboard       | `https://app.inngest.com/`                                                                     | <TBD: paste team URL>. Local dev UI on <http://localhost:8288>. See §9.               |
| Cloudflare R2 dashboard | `https://dash.cloudflare.com/<account>/r2/buckets/<bucket>`                                    | <TBD: fill account + bucket>. Bucket is private — access via signed S3 client only.   |
| Local MinIO console     | `http://localhost:9001`                                                                        | Login `test-account` / `test-secret`. Bucket `namewright-test`.                       |
| Prisma Studio (local)   | `npx prisma studio`                                                                            | Browse `User` / `ReportRecord` against local Postgres on :5434.                       |

---

## 9. Debugging a stuck or failed Inngest job

Generation runs in `generateReportJob` (`src/inngest/functions.tsx`) under
Inngest with `retries: 0`. When a customer reports "stuck on the loading
screen" or "got an error after submitting," start here.

### 10.1 Find the run

1. **Local dev:** Inngest dev UI at <http://localhost:8288>. The dev process
   is started by `npm run dev:inngest` (the combined `npm run dev` includes
   it). Open the "Functions" tab → `generate-report` → recent runs.
2. **Production:** Inngest cloud dashboard for the `namewright` app
   <TBD: paste the team URL>. Same view — recent runs, filterable by event id.
3. Match by `jobId`. Every Inngest step logs a Pino line tagged
   `route: 'inngest-generate'` and includes `jobId`, `requestId`, `runId`,
   `attempt`, and `eventId` (see `src/inngest/functions.tsx`).

### 10.2 Read the run

Inngest shows each `step.run` as a row with timing + result. The five steps,
in order:

1. `set-initial-status` — KV write of `pending`.
2. `generate-report` — the LLM + verification pipeline (~30–90s).
3. `save-report` — R2 PUT for the JSON.
4. `save-report-pdf` — R2 PUT for the PDF (non-fatal — see §10).
5. `set-completed-status` — KV write of `completed`.

If a step is in flight, you'll see it as the current row. If a step failed,
the error message is on the row; cross-reference Vercel logs by `jobId`.

### 10.3 Verify KV state directly

Sometimes the SSE never sees the `completed` write (network blip, browser
closed). The job may still have finished:

```
# local
redis-cli -p 6380 get "job:<jobId>"

# prod (via Upstash)
redis-cli -u $KV_URL get "job:<jobId>"
```

Returns the JSON-serialized `JobStatusPayload`. If `status: "completed"`,
the report is in R2 — point the customer at `/preview?report_id=<reportId>`.

### 10.4 Stuck on `pending` for >5 minutes

Either the Inngest function never fired, or it crashed in a way that didn't
update KV. Both are bugs:

1. Inngest dashboard — does the run exist at all? If no, Inngest never
   received the event. Check the `/api/inngest` handler (§11).
2. If the run exists and is "Running" past 5 minutes, kill it from the
   Inngest UI and refund the customer. Diagnose root cause separately.

---

## 10. PDF render/save failed

### 11.1 Alert shape

- **Title:** `:warning: *PDF render/save failed at generation time*`
- **Sender:** Slack incoming webhook
- **Body excerpt:** `reportId: <uuid>`, `error: "..."`, `requestId: <uuid>`
- **Source:** `src/inngest/functions.tsx` — the `save-report-pdf` step's catch.

### 11.2 What happened

The JSON was saved successfully (the user can view the report). The PDF
render or R2 PUT failed. **The Inngest job did NOT fail** — this step is
deliberately non-fatal.

### 11.3 What to do

1. **Nothing immediate.** `/api/report/[id]/pdf` renders the PDF on demand
   on first download and writes through to R2 (`saveReportPdf`). The customer
   experience is one slow PDF download instead of a fast one.
2. If the alert fires repeatedly across many reportIds, the renderer itself
   is broken. Check Sentry / Vercel logs for the actual error
   (likely a `@react-pdf/renderer` regression after a dependency bump). Roll
   back the offending deploy per §6 decision tree.

---

## 11. Inngest sync issues (`/api/inngest` 5xx or 4xx)

### 12.1 Symptoms

- `/api/generate` returns 200 but Inngest dashboard never receives the event.
- Inngest dashboard reports the function as "Out of sync."
- Local: `PUT http://localhost:3000/api/inngest` returns 500 on dev startup.
- Production: Inngest cloud reports the registration endpoint as unhealthy.

### 12.2 Local dev fix

`INNGEST_DEV=1` must be set in `.env.local` (the `dev:inngest` script and
the SDK rely on it). Without it, the SDK tries to authenticate against the
hosted broker and `serve` rejects unsigned PUTs.

```
grep INNGEST_DEV .env.local   # should print INNGEST_DEV=1
```

If missing, add it and restart `npm run dev`.

### 12.3 Production fix

`INNGEST_SIGNING_KEY` must be set on Vercel from the Inngest dashboard
(Settings → Keys → Signing Key). The PUT registration endpoint validates
this signature.

```
vercel env ls production | grep INNGEST_SIGNING_KEY
```

If absent or stale, copy from Inngest dashboard and `vercel env add`,
then `vercel --prod`.

### 12.4 Harmless startup noise

On boot, the Inngest SDK probes a few framework conventions (`/x/inngest`,
`/.netlify/functions/inngest`, `/.redwood/functions/inngest`). Those return
404 in our setup. **This is harmless** — the SDK falls through to our
configured `/api/inngest` handler. Don't chase the 404s.

---

## 12. Database (Prisma / Postgres)

### 13.1 Schema changes

`prisma/schema.prisma` is the source of truth. Models: `User`, `ReportRecord`.

- **Local:** create a migration with `npx prisma migrate dev --name <description>`.
  Prisma applies it to your local Postgres (`docker compose up postgres`) and
  regenerates the client. Commit the new `prisma/migrations/` directory.
- **Production:** deploys run `npx prisma migrate deploy` against the prod
  Postgres. There is no auto-rollback — destructive migrations need a manual
  recovery plan documented in the PR.

### 13.2 Local seed

`npm run seed` runs `prisma/seed.ts`, upserting two dev users:

- `test@example.com`
- `founder@namewright.co`

Either email can be used to test the magic-link flow against the dev
Resend account or by manually copying the magic link from logs.

### 13.3 Webhook DB-upsert failures

The Stripe webhook upserts `User` + `ReportRecord` after a paid checkout
(see `src/app/api/webhook/route.ts`). If the upsert fails, the webhook logs
`Failed to map report to user in DB` but **still returns 200** — Stripe
must not retry, or the customer ends up with duplicate report records or
duplicate emails.

Backfill: grep the webhook logs for that string, extract `reportId` +
`reportEmail`, run `prisma.user.upsert` manually <TBD: write a one-shot script>.

---

## 13. MinIO bucket missing (local dev)

### 14.1 Symptom

`npm run dev` starts, but `/api/generate` jobs fail at the `save-report`
step with `NoSuchBucket: The specified bucket does not exist`. This means
the local MinIO is up but the `namewright-test` bucket isn't there.

### 14.2 Fix

```
docker compose run --rm minio-createbucket
```

The sidecar runs `mc alias set` (current syntax) followed by
`mc mb --ignore-existing myminio/namewright-test`. The `&&` chain ensures
any failure surfaces a non-zero exit.

### 14.3 Historical bug (already fixed)

Older versions of `docker-compose.yml` used the deprecated `mc config host add`
form, which silently exited 0 on newer `minio/mc` images **without creating
the bucket**. The current file uses `mc alias set` and chains with `&&` so
failures don't masquerade as success. If you `git pull` someone else's
branch and the bucket goes missing, check whether their `docker-compose.yml`
reverted the alias-set fix.

---

## 14. Open items for founder

These TBDs are flagged inline above. Resolve them before treating this as the working runbook:

- Slack channel name (referenced in §1, §2, §8)
- Vercel team slug (§8)
- Upstash DB id (§8)
- Sentry org slug or "not wired" (§8, "First 60 seconds")
- EUIPO sandbox auth host exact value (§4.2)
- LaunchDarkly project name (§8)
- `NEXT_PUBLIC_DOWN` kill-switch — decide whether to wire this in `IntakeForm.tsx` and `proxy.ts` or accept user-facing 5xx during outages (§1.4, §5.4)
- Status page tooling — none currently set up (§5.8)
- Manual `sendReportEmail` recovery script — not yet written (§3.5, §12.3)
- Anthropic auto-reload thresholds (§2.4)
- EUIPO support contact path (§4.3)
- Inngest production team URL (§9.1)
- Rewrite `/api/cron/stripe-reconcile` to query R2 / Postgres instead of legacy KV `report:` keys (§3.5)

---

_This runbook is operational. When an alert fires and the steps don't match what actually worked, edit the section in the same hour you handled the incident — don't accumulate "should update runbook" as a backlog item. Bump "Last revised" on every change._
