# Incident Runbook (Internal)

**Status:** Draft — founder-approved
**Owner:** Michael Luo (founder)
**Created:** 2026-04-25
**Last revised:** 2026-04-25

This is a 2am playbook for when a Slack alert fires. It optimizes for "do the next thing," not completeness. Read the section that matches the alert, run the steps, escalate or accept impact when the section says to. Strategy doc lives elsewhere — this is recovery.

For refunds and customer comms after recovery, also read `docs/REFUND_POLICY.md` §2.2 (technical-failure auto-refund).

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

### 1.3 Mitigation — transient (Anthropic green, low rate)

1. Do nothing. The user already saw a 502 with "try again" copy (`src/app/api/generate/route.ts:128`).
2. If a customer emails, refund per `docs/REFUND_POLICY.md` §2.2 (technical failure).

### 1.4 Mitigation — Anthropic outage (status page red, or >5 failures in 30min)

1. Post a holding message in `#namewright-alerts`: "Anthropic 5xx, customer impact: report generation 502, ETA: monitoring."
2. Pause new traffic if the rate is severe: take down the homepage CTA via Vercel — set env var `NEXT_PUBLIC_DOWN=1` <TBD: not yet wired, decide whether to add the gate or just leave it broken>.
3. Do NOT refund pre-emptively. Refund only customers who email.
4. When Anthropic is green, watch one fresh `/api/generate` call succeed before unpausing.

### 1.5 Escalation / give-up

Anthropic outages last <2h historically. After 4h with no Anthropic status update, mass-email customers who hit a 502 in the window (grep Vercel logs for `report generation failed` + `requestId`, cross-ref Stripe charges by timestamp) using the template in §7. Refund them all.

---

## 2. Anthropic credit balance exhausted

### 2.1 Alert shape

- **Title:** `:rotating_light: *Anthropic credit balance exhausted*`
- **Sender:** Slack incoming webhook (`SLACK_ALERT_WEBHOOK_URL`)
- **Body excerpt:** `error: "Your credit balance is too low to access the Claude API..."`, `stage: "candidates" | "synthesis" | "niceClass"`, `requestId: <uuid>`
- **Source:** `src/app/api/generate/route.ts:135`

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

Per `src/app/api/cron/stripe-reconcile/route.ts:88`, it will Slack-alert the missing reportIds. Email-me-a-copy customers in that list will not have received their email — manually trigger via `sendReportEmail` from a one-shot script <TBD: script not yet written; for now, paste reportId into a dev session and call the function directly>.

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

EUIPO sandbox flakiness is expected. If alerts fire >3x/week, the right move is to disable the flag permanently until production credentials are approved. Do NOT add retries — the Slack alert is already debounced and the integration already falls back. See `docs/ARCHITECTURE.md` §9 ("LaunchDarkly for one flag — could collapse to env var") for the long-term cleanup.

---

## 5. KV save failure / KV cluster down

### 5.1 Alert shape

- **Title:** `:rotating_light: *KV save failed for generated report*` OR `:rotating_light: *Email opt-in failed: report missing from KV*` OR `:rotating_light: *Stripe reconciliation: N paid session(s) missing from KV*`
- **Sender:** Slack incoming webhook
- **Body excerpt:** `reportId: <uuid>`, `error: "Connection timeout" | "ETIMEDOUT" | "503 Service Unavailable"`, `requestId: <uuid>`
- **Source:** `src/app/api/generate/route.ts:160`, `src/app/api/webhook/route.ts:83`, `src/app/api/cron/stripe-reconcile/route.ts:88`

### 5.2 First diagnostic

1. `curl https://namewright.co/api/health` — if `kv.ok: false`, KV is down for the app. If `kv.ok: true`, this was a transient.
2. Upstash console → your DB → "Status." If red, it's them. If green, the issue is auth/credentials.
3. Vercel logs → search `KV save failed`. Count in last 15min. >3 = sustained, not transient.

### 5.3 Mitigation — transient (1-2 failures, KV now green)

1. Refund the affected customers per `docs/REFUND_POLICY.md` §2.2. Use `requestId` to grep Vercel logs and find the Stripe sessionId; cross-ref Stripe to find customer email.
2. Close the alert. No service action needed.

### 5.4 Mitigation — sustained (Upstash red, or >3 failures)

1. **Customer impact: severe.** New `/api/generate` calls 503. In-flight customers who paid see broken `/results` (the JWT validates but `getReport` returns null).
2. Disable the homepage CTA — `vercel env add NEXT_PUBLIC_DOWN 1 production` and redeploy <TBD: gate not currently wired in `IntakeForm.tsx`; for now, add a banner manually via a hot edit + redeploy or just accept user-facing 503s>.
3. Upstash console → check status. If they're down, file a P1 ticket and wait — there is no failover. KV is single-region.
4. Email all customers who paid in the last 7d (the KV TTL window) with the §7 template, even if their report still works for them. They might come back to a missing report at hour 24 if Upstash data is lost.
5. When Upstash recovers, run the reconcile cron manually (see §3.5 command) to identify which paid sessions lost their report. Refund all of them.

### 5.5 Customer who paid + sees broken /results

1. Check Stripe dashboard for their charge → grab `sessionId` from metadata.
2. Search Vercel logs for `sessionId` → find `reportId` in the `paid session processed` log line.
3. Try `redis-cli` against Upstash <TBD: confirm CLI access pattern> with `GET report:<reportId>`. If null, the report is gone.
4. There is no recovery for a lost report — the input is not stored separately. Refund per §2.2 and email the §7 template.

### 5.6 Escalation / give-up

If Upstash is down >2h, every paying customer in that window is impacted. Mass-email everyone who paid in the last 24h via §7, refund all of them, then post a public note <TBD: status page not yet set up; for now use a Twitter/LinkedIn post from the founder account>. Do not retry the work — the input data is gone.

---

## 6. Decision tree

| Condition                                                | Action                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Single customer hit 5xx, system otherwise green          | Refund only on customer email. Do NOT roll back. Do NOT mass-email.                     |
| 3+ customers hit 5xx in 1h, system metrics show recovery | Refund proactively (grep logs by `requestId`, cross-ref Stripe). Do NOT roll back.      |
| Sustained 5xx >15min, green deploy in last 24h           | **Roll back.** `vercel rollback` to previous prod deployment. Then diagnose.            |
| Sustained 5xx >15min, no recent deploy                   | External dependency. Diagnose per §1–§5. Do NOT roll back.                              |
| KV down >30min                                           | Mass-email §7 to last-24h customers + refund all. Wait for Upstash recovery.            |
| Anthropic credits exhausted, balance topped up           | Refund customers hit during outage. No mass-email needed.                               |
| Webhook signature failures with `hasSignature: true`     | Rotate secret immediately (§3.3). No customer comms needed if reconcile cron runs.      |
| EUIPO sandbox/prod token failures                        | Disable LD flag. No customer impact. No comms.                                          |
| Sentry error spike but no Slack alert                    | Triage in business hours unless customer-reported. Slack alerts are the on-call signal. |

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

---

## 9. Open items for founder

These TBDs are flagged inline above. Resolve them before treating this as the working runbook:

- Slack channel name (referenced in §1, §2, §8)
- Vercel team slug (§8)
- Upstash DB id (§8)
- Sentry org slug or "not wired" (§8, "First 60 seconds")
- EUIPO sandbox auth host exact value (§4.2)
- LaunchDarkly project name (§8)
- `NEXT_PUBLIC_DOWN` kill-switch — decide whether to wire this in `IntakeForm.tsx` and `proxy.ts` or accept user-facing 5xx during outages (§1.4, §5.4)
- Status page tooling — none currently set up (§5.6)
- Manual `sendReportEmail` recovery script — not yet written (§3.5)
- Anthropic auto-reload thresholds (§2.4)
- EUIPO support contact path (§4.3)

---

_This runbook is operational. When an alert fires and the steps don't match what actually worked, edit the section in the same hour you handled the incident — don't accumulate "should update runbook" as a backlog item. Bump "Last revised" on every change._
