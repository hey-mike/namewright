# Production Deploy SOP (Internal)

**Status:** Draft — founder-approved
**Owner:** Michael Luo (founder)
**Created:** 2026-04-25
**Last revised:** 2026-04-25

This is the procedure for shipping Namewright to production. It exists because Vercel git-integration is **not** wired — pushes to `main` do not auto-deploy. The founder runs `vercel --prod` by hand. Without git-integration there is no automatic gate that ensures CI passed before a deploy goes out, so the discipline lives here.

This SOP must be followed in order. Steps are gates, not suggestions. Each must pass before the next.

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
KV_URL
KV_REST_API_URL
KV_REST_API_TOKEN
KV_REST_API_READ_ONLY_TOKEN
SESSION_SECRET
NEXT_PUBLIC_APP_URL
```

`SESSION_SECRET` must be ≥32 chars. `NEXT_PUBLIC_APP_URL` must be the production URL (no trailing slash, no `localhost`).

Optional integrations (`SIGNA_API_KEY`, `WHOISJSON_API_KEY`, `LAUNCHDARKLY_SDK_KEY`, EUIPO/IPAU pairs, `SENTRY_DSN`, `SLACK_ALERT_WEBHOOK_URL`, `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `CRON_SECRET`) — set whichever the deploy depends on; each gracefully no-ops when unset.

`DEV_MOCK_PIPELINE` must **not** be present in Production scope. See §5.

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

Do all four. They take under 5 minutes total. Skipping any of them defeats the purpose of the SOP.

### 3.1 Health endpoint

```
curl https://<prod-url>/api/health
```

Expected:

```
{ "status": "ok", "kv": { "ok": true }, "env": { "missingRequired": [] } }
```

`missingRequired` must be empty. Any value there means a required env var is unset on Production — fix and redeploy.

### 3.2 Sample page

Open `https://<prod-url>/sample` in a browser. Page must render the canned report fixture without errors. Check the browser console for runtime errors.

### 3.3 Real pipeline end-to-end

Open `https://<prod-url>/` in a browser. Submit a test brief with a plausible description. Confirm:

- Preview renders (`FreePreview.tsx`) within ~90s
- Three candidates are shown
- "See full report" CTA goes to Stripe checkout

This exercises Anthropic + Signa + DNS + KV in production. `DEV_MOCK_PIPELINE` must NOT be set — this is the real pipeline. If pre-launch and you do not want to spend the ~$0.25, skip this step but note it in the deploy log.

### 3.4 Cron — wait 24h

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

---

## 5. What NOT to do

Hard rules. No exceptions without an explicit founder override documented in the deploy log.

- **Never** run `vercel --prod` from a branch other than `main`.
- **Never** deploy with uncommitted local changes. The deployed bundle includes them, but the git history doesn't — future-you cannot reconstruct what shipped.
- **Never** deploy if CI is yellow or red on `main`. Wait or fix.
- **Never** set `DEV_MOCK_PIPELINE=1` on the Vercel Production environment. Production code refuses the flag (NODE_ENV=production + VERCEL_ENV=production), but the var should not be there at all — its presence implies confusion about which environment this is.
- **Never** deploy on a Friday after 4pm local time. Standard rule. The cost of a bad weekend deploy is far higher than the cost of waiting until Monday morning.
- **Never** skip §3 smoke tests because "the diff was small." Small diffs cause production outages too.

---

## 6. Future-state note

This SOP exists because Vercel git-integration is deliberately not wired. When/if you wire it (Vercel project dashboard → Settings → Git → Connect Git Repository), the deploy command (§2), rollback (§4), and most of "what not to do" (§5) become obsolete — Vercel will auto-deploy on push to `main` and handle rollback via the dashboard.

The pre-flight gates (§1) and smoke test (§3) remain useful regardless. With git-integration, §1.5 (CI green on `main`) becomes the only deploy gate, enforced automatically by GitHub branch protection if you configure it.

Decision to wire git-integration is deferred until launch volume justifies the loss of manual control. Until then, this SOP is the gate.

---

_This SOP is a working document. Edit it directly when a deploy reveals a gap — don't accumulate "we should update the SOP" as a backlog item. Bump "Last revised" on every change._
