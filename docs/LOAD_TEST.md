# Load testing `/api/generate`

`scripts/load-test.js` is a [k6](https://k6.io/) script that drives the
generate pipeline at concurrent VUs and asserts the PRD §8 latency budget
(`p95 < 90s`) and an error-rate budget (`<5%`).

This doc covers what the script measures, how to run it locally without
burning Anthropic / Signa / WhoisJSON quota, what the baseline numbers from
a 2026-04-25 local run look like, and how to adapt it for staging/prod.

## What the script does

- Ramps to 25 concurrent VUs over 60s, holds for 2m, ramps down (~3m15s total)
- Each VU `POST`s `/api/generate` with one of four canned briefs, then sleeps 5s
- Records two custom metrics: `generate_latency_ms` (Trend) and `generate_errors` (Rate)
- Per-response checks: `status === 200`, body has `reportId` (string), body has `preview` (3-element array)
- Thresholds enforced at run end: `p(95)<90000ms`, `generate_errors<5%`, `http_req_failed<5%`

## What it does not measure

- **Cold-start latency** — k6 sustains traffic for 3+ minutes on warm Vercel
  instances; first-request cold-start cost is not isolated. To probe this,
  run the script after a deploy with concurrency=1 and a short duration.
- **Full payment flow** — only `/api/generate` is exercised. Stripe checkout,
  KV save, JWT issuance, and `/api/auth` are not load-tested.
- **End-user perceived latency** — server-timed only. Browser TTFB + render
  is not included.
- **Anthropic / Signa / WhoisJSON tail behavior under their rate limits** —
  in mock mode the upstreams aren't called; in real mode this is the dominant
  source of p95 variance and what you actually want to measure.

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

**Read this carefully — the latency number is meaningless and the error rate
is expected.**

- **Latency (155 ms p95) is unrealistic.** Mock mode short-circuits in
  `generateReport()` and returns the static fixture from
  `src/lib/__fixtures__/dev-report.ts`. It does not call Anthropic
  (~50–70s typical), Signa (~3–10s/candidate × 8 candidates), or DNS/RDAP/
  WhoisJSON. Real-mode p95 is dominated by the Anthropic web-search tool
  loop and the per-candidate trademark + domain enrichment fan-out — add
  on the order of **60–80 s** of network/inference time before drawing
  conclusions.
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

| Threshold                       | Source                                          | Hard / soft        |
| ------------------------------- | ----------------------------------------------- | ------------------ |
| `generate_latency_ms` p95 < 90s | PRD §8 "Time to report"                         | Hard — launch gate |
| `generate_errors` rate < 5%     | PRD §8 "Report completion rate >90%" (inverted) | Hard — launch gate |
| `http_req_failed` rate < 5%     | k6 default                                      | Hard               |

If p95 misses, throttle the front end (queue submissions) before launch.
Front-end throttling is cheaper than re-architecting the pipeline.

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
- **No assertion on `summary` or `totalCount`** — the per-response check
  validates only `reportId` and `preview.length === 3`. A pipeline that
  returns 3 candidates instead of 8 would pass.
- **The dev server is not representative of Vercel Functions runtime.**
  Cold-start, function timeout (default 10s for hobby, 60s pro, 300s pro
  with Fluid Compute), and concurrent-execution caps are all different.
  Local numbers under-represent cold-start and ignore Vercel concurrency
  limits entirely.
