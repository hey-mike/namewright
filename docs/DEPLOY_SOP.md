# Production Deploy SOP (Internal)

**Status:** Draft — founder-approved
**Owner:** Michael Luo (founder)
**Created:** 2026-04-25
**Last revised:** 2026-04-25

This is the procedure for shipping Namewright to production. It exists because Vercel git-integration is **not** wired — pushes to `main` do not auto-deploy. The founder runs `vercel --prod` by hand. Without git-integration there is no automatic gate that ensures CI passed before a deploy goes out, so the discipline lives here.

This SOP must be followed in order. Steps are gates, not suggestions. Each must pass before the next.

---

## 0. One-time infrastructure prerequisites

Before the first production deploy, the following external services must be provisioned. These are one-time steps — once set up, subsequent deploys skip §0 and go straight to §1.

### 0.1 Postgres (permanent storage for User + ReportRecord)

The app uses Prisma against a managed Postgres. Recommended path is the Vercel Marketplace integration — Neon or Supabase will inject `DATABASE_URL` into the project automatically.

1. Vercel project dashboard → Storage → Browse Marketplace → pick a Postgres provider (Neon recommended for serverless-friendly cold starts).
2. Connect to the project. Confirm `DATABASE_URL` appears under Settings → Environment Variables (Production scope).
3. After the first deploy that needs schema, apply migrations against production:
   ```
   DATABASE_URL=<prod-url> npx prisma migrate deploy
   ```
   Run this from a machine with the prod DATABASE_URL exported (do **not** commit it). `migrate deploy` is idempotent — safe to re-run.

If schema is empty after deploy, the webhook upserts on first paid checkout will fail. Verify with §3 below.

### 0.2 Cloudflare R2 (permanent JSON + PDF report storage)

R2 holds `reports/{id}.json` and `reports/{id}.pdf` indefinitely. KV no longer holds report bodies — only the SSE status handle (24h scope) and the auth nonce.

1. Cloudflare dashboard → R2 → Create bucket (e.g. `namewright-reports-prod`). Region: pick closest to Vercel function region.
2. R2 → Manage API tokens → Create API token with Object Read & Write on this bucket. Copy `Access Key ID` and `Secret Access Key`.
3. Account ID: visible at Cloudflare dashboard top-right.
4. CORS: not required for current flows (no direct browser uploads). Document for future awareness — if presigned upload URLs are added later, configure CORS on the bucket then.

Any S3-compatible store works (set `R2_ENDPOINT_URL` to override), but R2 is the production target.

### 0.3 Inngest (event-driven async pipeline)

`/api/generate` returns 202 immediately and dispatches `report.generate`. The actual pipeline (`generate-report` → `save-report` → `save-report-pdf` → `set-completed-status`) runs in Inngest. Without Inngest, no report is ever produced.

1. Sign up at app.inngest.com. Create a new app for Namewright (production environment).
2. Inngest dashboard → Manage → Signing keys → copy the production signing key. Set as `INNGEST_SIGNING_KEY` in Vercel Production env.
3. After §2 deploy, register the app: Inngest dashboard → Apps → Sync new app → URL `https://<prod-url>/api/inngest`. Inngest will PUT to that endpoint and discover the registered functions (currently `generate-report`).
4. Verify in dashboard: the `generate-report` function shows up under Functions, status "Ready". Trigger a test event from the dashboard or do a real generate (§3.3) to confirm the function runs end-to-end.

`INNGEST_DEV=1` must **not** be present in Production env — that's a local-only flag (§5).

---

## 1. Pre-flight gates

Run these in order. Stop at the first failure. Do not deploy until every gate is green.

### 1.1 Local — type check

```
npx tsc --noEmit
```

Must exit 0 with no output. Any error fails the gate.

### 1.2 Local — tests

```
npm test
```

Must report 167+ tests passing, zero failing, zero hanging. If a test is flaky, fix it — do not re-run until green.

### 1.3 Local — security audit

```
npm audit --omit=dev --audit-level=high
```

Must report 0 high or critical vulnerabilities in production deps. Dev-only vulnerabilities do not block; production ones do. Patch or pin before continuing.

### 1.4 Local — clean working tree

```
git status
git rev-parse --abbrev-ref HEAD
```

Branch must be `main`. Working tree must be clean (no modified, no untracked that should be committed). Stash or commit before continuing.

### 1.5 Remote — CI green on `main`

Open the GitHub Actions tab and confirm the latest commit on `main` (the one HEAD points at locally) has a green CI run.

- URL: `<TBD: https://github.com/<org>/<repo>/actions?query=branch%3Amain>`
- The run must be the workflow defined in `.github/workflows/ci.yml` (audit + tsc + eslint + jest).
- A yellow (in-progress) or red (failed) run blocks the deploy. Wait for green; if red, fix and re-push.

If `git rev-parse HEAD` does not match the SHA at the top of the Actions list, you have local commits that haven't been pushed. Push first, wait for CI, then continue.

### 1.6 Stripe — mode confirmation

Open the Stripe dashboard and confirm:

- **Pre-launch:** test mode keys in Vercel project env (`sk_test_…`, `whsec_…` from `stripe listen` or test webhook endpoint). The Vercel env should match the test-mode dashboard.
- **First live deploy:** Stripe account is activated, live mode keys (`sk_live_…`, live webhook signing secret) are in Vercel production env, and the live webhook endpoint is registered at `https://<prod-url>/api/webhook`.

If switching test→live for the first time, double-check `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is also the live publishable key. A test publishable key + live secret key fails silently in confusing ways.

### 1.7 Vercel — production env vars present

Open the Vercel project dashboard → Settings → Environment Variables → Production scope.

- URL: `<TBD: https://vercel.com/<team>/<project>/settings/environment-variables>`

Confirm every required var from `.env.example` is set on the **Production** environment:

```
ANTHROPIC_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
KV_REST_API_URL
KV_REST_API_TOKEN
KV_REST_API_READ_ONLY_TOKEN
SESSION_SECRET
NEXT_PUBLIC_APP_URL
DATABASE_URL
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
INNGEST_SIGNING_KEY
```

`SESSION_SECRET` must be ≥32 chars. `NEXT_PUBLIC_APP_URL` must be the production URL (no trailing slash, no `localhost`). `DATABASE_URL` should be the Postgres URL from §0.1 — if the Marketplace integration injected it, confirm the value isn't pointing at a preview/branch DB.

Optional integrations (`SIGNA_API_KEY`, `WHOISJSON_API_KEY`, `LAUNCHDARKLY_SDK_KEY`, EUIPO/IPAU pairs, `SENTRY_DSN`, `SLACK_ALERT_WEBHOOK_URL`, `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `CRON_SECRET`, `R2_ENDPOINT_URL`) — set whichever the deploy depends on; each gracefully no-ops when unset. `R2_ENDPOINT_URL` is for non-Cloudflare S3-compatible stores or local Minio — leave unset for production R2.

`DEV_MOCK_PIPELINE` and `INNGEST_DEV` must **not** be present in Production scope. See §5.

---

## 2. Deploy

From the project root, on `main`, with all gates green:

```
vercel --prod
```

Expected output:

- "Linked to <team>/<project>" (or prompts to link if first run from this machine — link to the existing project, do not create a new one)
- A build log streaming Next.js compile output
- Final line: `✅  Production: https://<prod-url> [<duration>]`

The deploy URL printed at the end is the production URL. Copy it for the smoke test.

If the build fails, do not retry blindly. Read the error. If it is environmental (missing env var, KV unreachable), fix in the Vercel dashboard and re-run. If it is a code error that CI didn't catch, that is a CI gap — file an issue, fix the code, push, wait for CI, redeploy.

---

## 3. Post-deploy smoke test

Do all five. They take under 10 minutes total. Skipping any of them defeats the purpose of the SOP.

### 3.1 Health endpoint

```
curl https://<prod-url>/api/health
```

Expected:

```
{ "status": "ok", "kv": { "ok": true }, "env": { "missingRequired": [] } }
```

`missingRequired` must be empty. Any value there means a required env var is unset on Production — fix and redeploy.

### 3.2 Inngest sync registered

Inngest dashboard → Apps → confirm the production app is listed and the most recent sync timestamp matches the deploy. The `generate-report` function should be visible under Functions with status "Ready". If the sync didn't fire, click "Sync new app" and point it at `https://<prod-url>/api/inngest`. A missing sync means `/api/generate` will accept jobs and never run them.

### 3.3 Sample page

Open `https://<prod-url>/sample` in a browser. Page must render the canned report fixture without errors. Check the browser console for runtime errors.

### 3.4 Real pipeline end-to-end (exercises Postgres + R2 + Inngest)

Open `https://<prod-url>/` in a browser. Submit a test brief with a plausible description. Confirm:

- `/api/generate` returns 202 fast (<1s) with `{ jobId, reportId }`
- Frontend connects to `/api/status/<jobId>` SSE and displays progress
- Status reaches `completed` within ~90s
- Preview renders (`FreePreview.tsx`) with three candidates
- "See full report" CTA goes to Stripe checkout
- Complete a test purchase (use a real card if Stripe is in live mode and refund afterwards, or test mode if pre-launch)
- Webhook fires → Postgres gets a `User` + `ReportRecord` upsert (verify by querying the DB or checking the Inngest run log)
- `/results` renders the full report (R2 read of `reports/{id}.json`)
- Click PDF download → exercises `/api/report/[id]/pdf`, expect the R2-stored PDF (or render-on-demand fallback)

This exercises Anthropic + Signa + DNS + KV + Inngest + R2 (JSON + PDF) + Postgres in production. `DEV_MOCK_PIPELINE` must NOT be set — this is the real pipeline. If pre-launch and you do not want to spend the ~$0.25 on the LLM call, skip this step but note it in the deploy log; you cannot validate the new infra (Inngest dispatch, R2 PDF write, DB upsert) without it.

Verify R2 directly if anything looks off: Cloudflare R2 dashboard → bucket → confirm `reports/<reportId>.json` and `reports/<reportId>.pdf` both exist after the run.

### 3.5 Cron — wait 24h

The daily `stripe-reconcile` cron runs once per 24h on Vercel Hobby plan. The morning after the deploy:

- Open Vercel project dashboard → Logs → filter by `/api/cron/stripe-reconcile`
- Confirm a 200 response in the last 24h
- If no run shows, check that `CRON_SECRET` is set on Production and `vercel.json` cron config is intact

A missing cron run is not a rollback trigger but is a follow-up bug.

---

## 4. Rollback

If smoke tests fail, or a real-user error report lands shortly after deploy, roll back. Investigate after, not before.

### 4.1 Standard rollback (Vercel UI)

1. Vercel project dashboard → Deployments
2. Find the previous deployment with green status (the one before the broken one)
3. Click the `…` menu → "Promote to Production"
4. Confirm. Production aliases re-point in <30s.
5. Re-run §3.1 (health check) against the rolled-back URL to confirm.

### 4.2 If standard rollback fails

If the previous deployment is also broken, or the dashboard rollback fails, deploy from a known-good tag locally:

```
git checkout <last-known-good-sha>
vercel --prod
git checkout main
```

Then debug `main` separately. Do not cherry-pick fixes onto a release tag — fix forward on `main`, run the full SOP, and redeploy.

### 4.3 If Vercel itself is degraded

Check `https://www.vercel-status.com`. If Vercel is the issue, there is no rollback that helps — wait for upstream recovery, then verify §3.1 once Vercel is green.

### 4.4 What rollback does and does not affect

- **Code** — Vercel rollback re-points production at a previous deployment; that's the only thing it changes.
- **Postgres schema** — rolling back code does NOT roll back migrations. If the bad deploy applied a migration, you must roll the schema back separately (`npx prisma migrate resolve` or a manual down-migration). Schema-coupled deploys should be reviewed before §2 with this in mind.
- **R2 (reports + PDFs)** — permanent storage, untouched by rollback. Past reports remain accessible after rollback. The only way to lose them is to delete the bucket.
- **Inngest** — the registered functions belong to the previous deploy URL once you roll back. After rolling back, re-sync the app in the Inngest dashboard so it points at the now-current deployment URL; otherwise in-flight events may target the broken deploy.
- **KV** — auth nonces and SSE status handles auto-expire (24h / per-job). Nothing to clean up.

---

## 5. What NOT to do

Hard rules. No exceptions without an explicit founder override documented in the deploy log.

- **Never** run `vercel --prod` from a branch other than `main`.
- **Never** deploy with uncommitted local changes. The deployed bundle includes them, but the git history doesn't — future-you cannot reconstruct what shipped.
- **Never** deploy if CI is yellow or red on `main`. Wait or fix.
- **Never** set `DEV_MOCK_PIPELINE=1` on the Vercel Production environment. Production code refuses the flag (NODE_ENV=production + VERCEL_ENV=production), but the var should not be there at all — its presence implies confusion about which environment this is.
- **Never** set `INNGEST_DEV=1` on Production. That flag puts the Inngest SDK in local-dev mode and prevents it from talking to Inngest cloud — `/api/generate` will return 202 and no job will ever run.
- **Never** drop or recreate the production Postgres without a backup. Customer `User` + `ReportRecord` rows are the durable record of who paid for what; losing them means refund ambiguity.
- **Never** delete the R2 bucket without first confirming there are zero customers within the 7-day post-purchase support window who might still need their report.
- **Never** deploy on a Friday after 4pm local time. Standard rule. The cost of a bad weekend deploy is far higher than the cost of waiting until Monday morning.
- **Never** skip §3 smoke tests because "the diff was small." Small diffs cause production outages too.

---

## 6. Future-state note

This SOP exists because Vercel git-integration is deliberately not wired. When/if you wire it (Vercel project dashboard → Settings → Git → Connect Git Repository), the deploy command (§2), rollback (§4), and most of "what not to do" (§5) become obsolete — Vercel will auto-deploy on push to `main` and handle rollback via the dashboard.

The pre-flight gates (§1) and smoke test (§3) remain useful regardless. With git-integration, §1.5 (CI green on `main`) becomes the only deploy gate, enforced automatically by GitHub branch protection if you configure it.

Decision to wire git-integration is deferred until launch volume justifies the loss of manual control. Until then, this SOP is the gate.

---

_This SOP is a working document. Edit it directly when a deploy reveals a gap — don't accumulate "we should update the SOP" as a backlog item. Bump "Last revised" on every change._
