// k6 load test for /api/generate.
//
// Usage:
//   brew install k6
//   k6 run scripts/load-test.js
//
// Override target with -e BASE_URL=https://your-preview.vercel.app
//
// What it tests:
//   - Vercel function concurrency (default plan caps you at ~30 concurrent)
//   - Anthropic rate limits (Sonnet 4.6 has per-org RPM and TPM limits)
//   - Signa rate limits (per your contracted tier)
//   - Cold-start vs warm-instance latency divergence
//
// Pre-launch budget: p95 < 90s, error rate < 5% under 25 concurrent users.
// If either misses, throttle the front-end (queue submissions) before launch.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

// Custom metrics for clearer post-run analysis.
const generateLatency = new Trend('generate_latency_ms', true)
const generateErrors = new Rate('generate_errors')

export const options = {
  // Ramps up to 25 concurrent VUs over 30s, holds for 2m, ramps down.
  // Each VU completes one generate call then sleeps 5s before retrying.
  stages: [
    { duration: '30s', target: 5 },
    { duration: '30s', target: 25 },
    { duration: '2m', target: 25 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    generate_latency_ms: ['p(95)<90000'], // 90s budget
    generate_errors: ['rate<0.05'], // <5% error rate
    http_req_failed: ['rate<0.05'],
  },
}

const BRIEFS = [
  {
    description:
      'A B2B SaaS product helping engineering managers run async standups across distributed teams. We replace daily Zoom meetings with structured async written updates and AI-generated summaries.',
    personality: 'Premium / refined',
    geography: 'Global',
  },
  {
    description:
      'A specialty coffee roaster in Brooklyn focused on single-origin beans from women-owned farms in East Africa.',
    personality: 'Playful / approachable',
    geography: 'US-first',
  },
  {
    description:
      'A boutique branding agency for early-stage healthtech startups in Europe. We do naming, identity, and pitch deck design.',
    personality: 'Serious / technical',
    geography: 'Europe',
  },
  {
    description:
      'A direct-to-consumer eyewear brand selling minimalist titanium frames with prescription lenses, shipped from Shenzhen.',
    personality: 'Premium / refined',
    geography: 'China / Asia',
  },
]

export default function () {
  const brief = BRIEFS[__VU % BRIEFS.length]
  const payload = JSON.stringify({
    description: brief.description,
    personality: brief.personality,
    constraints: '',
    geography: brief.geography,
    tlds: ['com', 'io', 'co'],
  })

  const start = Date.now()
  const res = http.post(`${BASE_URL}/api/generate`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '120s',
  })
  const latency = Date.now() - start

  generateLatency.add(latency)
  generateErrors.add(res.status !== 200)

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'has reportId': (r) => {
      try {
        return typeof r.json('reportId') === 'string'
      } catch {
        return false
      }
    },
    'has 3-candidate preview': (r) => {
      try {
        const preview = r.json('preview')
        return Array.isArray(preview) && preview.length === 3
      } catch {
        return false
      }
    },
  })

  if (!ok) {
    console.error(`VU ${__VU} iter ${__ITER}: status=${res.status} latency=${latency}ms body=${res.body?.slice(0, 200)}`)
  }

  sleep(5)
}
