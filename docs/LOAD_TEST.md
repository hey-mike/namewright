# Load testing the generate pipeline

`scripts/load-test.js` is a [k6](https://k6.io/) script that drives the
generate pipeline at concurrent VUs.

This doc covers what the script measures, how to run it locally without
burning Anthropic / Signa / WhoisJSON quota, what the baseline numbers from
a 2026-04-25 local run look like, and how to adapt it for staging/prod.

> **Pipeline shape changed.** `/api/generate` is now async — it returns 202
> with `{ jobId, reportId }` after dispatching `report.generate` to Inngest,
> and the actual ~90s pipeline runs out-of-band (`generateReport` →
> `saveReport` to R2 → `saveReportPdf` to R2 → `setJobStatus completed` in
> KV). User-perceived latency is the SSE poll loop on `/api/status/[jobId]`
> until status is `completed`, **not** the HTTP request to `/api/generate`.
>
> Any threshold tied to `/api/generate` p95 < 90s now measures dispatch
> throughput, not pipeline latency. Treat the existing script as a
> dispatch-throughput probe and add an end-to-end scenario (§"End-to-end
> latency") to measure the actual user experience.

## Load-bearing components under load

In rough order of how likely each is to be the bottleneck:

- **Anthropic** — dominant latency contributor in real mode (web-search loop
  in `generateReport`). Per-request rate limits and account-level token
  spend caps both apply.
- **Inngest** — every paid generate is one dispatched event. Throughput is
  bounded by your Inngest plan's concurrency limit on `generate-report`. Free/
  early-tier plans cap concurrent function executions; if 100 users submit
  at once and concurrency is 25, the 26th waits in queue. Configure
  `concurrency` in `src/inngest/functions.tsx` if specific limits are needed.
- **R2 (Cloudflare or S3-compatible)** — two writes per generate
  (`reports/{id}.json` + `reports/{id}.pdf`), then reads on `/results`
  render and `/api/report/[id]/pdf` download. Cloudflare R2 has generous
  per-bucket rate limits (Class A operations: thousands/sec) so this is
  rarely the bottleneck in practice — but worth watching tail latency.
- **Postgres (Prisma)** — the Stripe webhook upserts a `User` + `ReportRecord`
  on every paid checkout. The `/results` page also queries
  `prisma.reportRecord.findUnique` for the userId-cookie auth path. Prisma
  uses a connection pool (`pg.Pool`); under burst load, exhausting the pool
  shows up as queued queries, not failures. Tune `DATABASE_URL` connection
  limits if pool starvation appears in logs.
- **KV (Upstash via Vercel KV REST)** — used for SSE status handles
  (`setJobStatus`/`getJobStatus`), auth nonces, and the Stripe-webhook
  reconcile path. The SSE handler polls KV every 3s per active connection
  for the duration of the generate. 100 concurrent SSE clients × 30 reads
  per 90s pipeline = 3000 KV reads per pipeline window. Fits Upstash free
  tier comfortably; worth modelling at higher volumes.
- **Signa / WhoisJSON / EUIPO / IP Australia** — per-candidate fan-out
  inside `generateReport`. Each candidate triggers trademark + domain
  checks; under burst load the per-source rate limits matter more than the
  per-request latency.

## What the script does (current state — measures dispatch only)

- Ramps to 25 concurrent VUs over 60s, holds for 2m, ramps down (~3m15s total)
- Each VU `POST`s `/api/generate` with one of four canned briefs, then sleeps 5s
- Records two custom metrics: `generate_latency_ms` (Trend) and `generate_errors` (Rate)
- Per-response checks: `status === 200`, body has `reportId` (string), body has `preview` (3-element array)
- Thresholds enforced at run end: `p(95)<90000ms`, `generate_errors<5%`, `http_req_failed<5%`

> **Stale assertion**: the `preview` 3-element check assumes the synchronous
> response shape that no longer exists. The current `/api/generate` returns
> `{ jobId, reportId }` only — the preview is delivered via the
> `/api/status/[jobId]` SSE stream once the Inngest job completes. Update
> `scripts/load-test.js` to assert on `jobId` + `reportId` for the dispatch
> probe, and add a separate scenario (below) that drives the SSE stream to
> measure end-to-end latency. The script's `p(95)<90000ms` threshold against
> `/api/generate` HTTP latency is no longer the PRD §8 budget — it's just a
> dispatch latency check (should be <1s in healthy state).

## What it does not measure

- **Cold-start latency** — k6 sustains traffic for 3+ minutes on warm Vercel
  instances; first-request cold-start cost is not isolated. To probe this,
  run the script after a deploy with concurrency=1 and a short duration.
- **Full payment flow** — only `/api/generate` is exercised. Stripe checkout,
  Postgres upsert via webhook, R2 read on `/results`, JWT issuance, and
  `/api/auth` are not load-tested.
- **End-user perceived latency** — server-timed and dispatch-only. Without
  SSE polling the script doesn't observe the 60–90s actual wait. See the
  end-to-end scenario below.
- **Inngest queue depth and concurrency limits** — bursts past Inngest's
  configured concurrency queue silently in Inngest's dashboard, not in the
  HTTP response. Watch the dashboard during a real-mode run.
- **Anthropic / Signa / WhoisJSON tail behavior under their rate limits** —
  in mock mode the upstreams aren't called; in real mode this is the dominant
  source of p95 variance and what you actually want to measure.

## End-to-end latency scenario (recommended addition)

To measure the metric the user actually feels, add a k6 scenario that:

1. POSTs `/api/generate`, captures `jobId`.
2. Connects to `/api/status/[jobId]` (k6 supports SSE via the `k6/experimental/streams` module or via repeat-poll on the SSE endpoint).
3. Stops the per-VU stopwatch when the stream emits a message with `status: "completed"`.
4. Records that as `e2e_latency_ms` (Trend) — this is the number to compare to PRD §8's 90s p95 budget.
5. Optionally fans out to `/results` and `/api/report/[id]/pdf` with the test session cookie to measure the post-completion read path.

For 100 concurrent users, a reasonable test target is:

- Dispatch p95 (`/api/generate`): <500ms
- End-to-end p95 (job → completed): <90s (PRD §8)
- End-to-end success rate: >95% (no failed Inngest jobs, no R2/KV write errors)
- Postgres webhook upsert latency p95: <500ms (test separately by simulating Stripe webhook events at sustained rate)

## Run it locally (DEV_MOCK_PIPELINE — no API costs)

Install k6 (one-time):

```sh
brew install k6
```

In `.env.local`:

```
DEV_MOCK_PIPELINE=1
```

In one terminal, start the Next.js dev server (Stripe forwarder not needed):

```sh
npm run dev:next
```

Note the port — Next picks the next free one if 3000 is taken (e.g. 3002).

In another terminal, run k6 against that port:

```sh
k6 run -e BASE_URL=http://localhost:3002 scripts/load-test.js
```

`BASE_URL` defaults to `http://localhost:3000` if omitted.

## Baseline (local, 2026-04-25, DEV_MOCK_PIPELINE=1)

Single-IP run from localhost against `npm run dev:next` on a 2024 MacBook
(M-series), Next.js 16.2.4 / Turbopack:

| Metric                       | Value         | PRD target |
| ---------------------------- | ------------- | ---------- |
| `generate_latency_ms` p95    | **155 ms**    | <90 s      |
| `generate_latency_ms` p90    | 123 ms        | —          |
| `generate_latency_ms` median | 59 ms         | —          |
| `generate_latency_ms` max    | 340 ms        | —          |
| Successful checks            | 20 / 740 (3%) | —          |
| `generate_errors` rate       | **97%**       | <5%        |
| Total iterations             | 740           | —          |

**Read this carefully — the latency number is meaningless, the error rate
is expected, and these numbers were measured against the previous
synchronous `/api/generate` shape.**

> **Note on baseline staleness**: the 2026-04-25 baseline was captured before
> the Inngest async migration. With the new pipeline, `/api/generate` p95
> should be <500ms regardless of mock-mode (it's just a dispatch +
> validation handler now). The 155ms p95 below predates that change and
> mostly reflects the old synchronous handler running against a fixture.
> Re-baseline after updating the script for the dispatch + SSE shape.

- **Latency (155 ms p95) is unrealistic.** Mock mode short-circuits in
  `generateReport()` and returns the static fixture from
  `src/lib/__fixtures__/dev-report.ts`. It does not call Anthropic
  (~50–70s typical), Signa (~3–10s/candidate × 8 candidates), or DNS/RDAP/
  WhoisJSON. Real-mode end-to-end p95 (dispatch → SSE completed) is
  dominated by the Anthropic web-search tool loop and the per-candidate
  trademark + domain enrichment fan-out inside the Inngest job — add on the
  order of **60–80 s** of network/inference time before drawing
  conclusions. Note that this latency now happens inside Inngest, not in
  the HTTP request to `/api/generate`.
- **97% error rate is the in-app rate limiter, not a pipeline failure.**
  `src/proxy.ts` caps `/api/generate` at **5 requests / 60s / IP**. From a
  single localhost IP at 25 concurrent VUs, the 6th request inside any 60s
  window returns `429 Too Many Requests`. Approximately the first 20
  requests succeeded (4 windows × 5 requests, give or take counter-expiry
  timing); the rest were correctly throttled.

The local run thus confirms three things: **(1)** the script runs end-to-end
against a Namewright dev server and produces parseable thresholds output,
**(2)** the mock pipeline returns the production-shape response (preview is
a 3-element array, `reportId` is a string), and **(3)** the rate limiter is
active. It does **not** validate the PRD §8 latency budget — that requires
a real-mode run (see below).

## Run it against staging or production

The default config (25 VUs, single source IP) is **incompatible with the
production rate limit** of 5 req/60s/IP. Either:

**Option A — measure rate-limit-respecting throughput.** Reduce concurrency
to match the limit:

```js
// scripts/load-test.js — for a rate-limit-respecting run
stages: [
  { duration: '30s', target: 1 },
  { duration: '5m',  target: 4 },  // 4 VUs × (1 req per ~60s sleep) ≈ 4/min
  { duration: '15s', target: 0 },
],
// And bump the per-VU sleep at the bottom of the file from 5s to 15s.
```

This gives you real p95 under sequential load.

**Option B — bypass the rate limit at the edge.** For a true concurrency
test, run k6 from multiple source IPs (e.g. distributed via k6 Cloud or
GitHub Actions matrix) or temporarily disable `proxy.ts` rate limiting in a
staging deploy. **Do not do this against production.**

**Cost ceiling for real-mode runs.** Each `/api/generate` call in real mode
costs roughly **$0.05–$0.10** (Anthropic Sonnet web-search loop dominates;
Signa is contracted, WhoisJSON is on a free tier). The script as written
fires up to ~720 iterations over 3m15s. Worst case: **~$70 per full run.**
Cap iterations explicitly before running for real:

```js
// Add to options:
iterations: 50,  // hard cap regardless of duration
```

Or shorten duration and concurrency. **Never run the unmodified script
against a real-mode endpoint.**

## When to run

- **Before launch** — once, in real mode, against a staging deploy with the
  rate limit relaxed and an explicit iteration cap. Establish the production
  p95 baseline.
- **After major prompt changes** — the Anthropic web-search loop is the
  dominant latency contributor; prompt edits that change tool-use depth can
  swing p95 by 20–40 s.
- **After Anthropic model swaps** — sonnet → opus, version bumps.
- **Monthly** in real mode against a low-iteration staging run, to catch
  silent regressions in upstream provider latency.

## What "good" looks like (PRD §8)

| Threshold                                  | Source                                        | Hard / soft        |
| ------------------------------------------ | --------------------------------------------- | ------------------ |
| `e2e_latency_ms` p95 < 90s (job completed) | PRD §8 "Time to report"                       | Hard — launch gate |
| End-to-end success rate > 95%              | PRD §8 "Report completion rate >90%"          | Hard — launch gate |
| `http_req_failed` rate < 5%                | k6 default                                    | Hard               |
| Dispatch latency p95 < 500ms               | Async dispatch handler should be near-trivial | Soft               |

The PRD §8 budget is on **end-to-end** time (submit → report ready), which
is now the SSE-poll loop, not the `/api/generate` HTTP latency. Measure it
with the end-to-end scenario above; the dispatch-only script answers a
different question.

If end-to-end p95 misses, the lever is Inngest concurrency + Anthropic
account quota, not the front-end. Front-end queueing helps only if dispatch
itself is the bottleneck, which it shouldn't be.

## Known limitations

- **Single source IP from localhost** trips the in-app rate limiter, even at
  modest concurrency. The default 25-VU config is incompatible with
  unmodified `src/proxy.ts` from a single client.
- **Mock-mode latency is not representative** of production by 2–3 orders
  of magnitude. Use only to validate the script wiring, not the SLO.
- **Briefs are static** (4 hardcoded examples, round-robin by VU index).
  Real-world brief diversity is much higher; tail-latency outliers driven by
  brief content (e.g. complex multilingual constraints triggering longer
  Anthropic loops) are not exercised.
- **Dispatch-only checks miss the real failure modes.** A successful 202
  from `/api/generate` says nothing about whether the Inngest job ran, the
  R2 writes succeeded, or the Postgres webhook upsert worked. End-to-end
  measurement is required to catch any of these.
- **The dev server is not representative of Vercel Functions runtime.**
  Cold-start, function timeout (default 10s for hobby, 60s pro, 300s pro
  with Fluid Compute), and concurrent-execution caps are all different.
  Local numbers under-represent cold-start and ignore Vercel concurrency
  limits entirely. Inngest execution is also separate from Vercel's
  function quota, so the pipeline is not bound by Vercel `maxDuration`
  settings — Inngest runs the function on its own infrastructure.
- **Local `dev:inngest` uses the Inngest dev server**, not Inngest cloud —
  concurrency and retry semantics may differ. Validate against a staging
  deploy with the real Inngest cloud connection before drawing conclusions
  about production throughput.
