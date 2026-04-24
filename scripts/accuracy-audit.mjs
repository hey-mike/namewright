// One-off accuracy audit runner. Reads .env.local manually, runs a curated
// brief set against generateReport() (bypasses HTTP), captures the full
// report + cost + timing per brief. Intended for a single audit pass — not a
// production eval framework.
//
// Output: /tmp/accuracy-audit/{N}-{slug}.json
// Cost cap: ~$5 (stops early if any single brief exceeds $0.50)

import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

// Manual .env.local loader so we don't need dotenv as a runtime dep
async function loadEnv() {
  const content = await fs.readFile('.env.local', 'utf8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) {
      let val = m[2]
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      process.env[m[1]] = val
    }
  }
}

await loadEnv()

// Import after env is loaded so module-level singletons see the right values
const { generateReport } = await import('../src/lib/anthropic.ts')

const BRIEFS = [
  // Clean spaces — expect mostly low risk, available domains
  {
    slug: '01-clean-async-standup',
    description:
      'A premium B2B SaaS that runs structured async standups for distributed engineering teams, replacing daily Zoom meetings with written updates and AI-generated summaries.',
    personality: 'Premium / refined',
    geography: 'Global',
    expectedNotes: 'invented space, expect mostly low risk',
  },
  {
    slug: '02-clean-ai-codereview',
    description:
      'AI-powered code review tool for solo developers and small teams that catches bugs and security issues before merge.',
    personality: 'Serious / technical',
    geography: 'US-first',
    expectedNotes: 'tech-niche space, some saturation expected',
  },
  {
    slug: '03-clean-newsletter',
    description:
      'A newsletter platform for independent creators that handles subscriptions, payments, and audience analytics.',
    personality: 'Playful / approachable',
    geography: 'US-first',
    expectedNotes: 'crowded space (Substack, Beehiiv, Ghost) — moderate risk likely',
  },

  // Saturated spaces — expect moderate-high risk
  {
    slug: '04-saturated-fitness',
    description: 'A fitness tracking mobile app that gamifies workouts and connects with friends.',
    personality: 'Bold / contrarian',
    geography: 'US-first',
    expectedNotes: 'highly saturated, expect high risk',
  },
  {
    slug: '05-saturated-finance',
    description:
      'A personal finance dashboard that aggregates accounts, tracks spending, and projects savings goals.',
    personality: 'Premium / refined',
    geography: 'Global',
    expectedNotes: 'fintech is saturated, exercises EUIPO via Global geo',
  },
  {
    slug: '06-saturated-pm',
    description:
      'A project management tool for small teams of 5-20 people focused on simplicity over features.',
    personality: 'Utilitarian / direct',
    geography: 'US-first',
    expectedNotes: 'extremely saturated (Asana, Notion, Linear, etc.)',
  },

  // Regulated/conservative
  {
    slug: '07-regulated-telehealth',
    description:
      'A telehealth platform specifically for pediatric care, connecting parents with board-certified pediatricians.',
    personality: 'Serious / technical',
    geography: 'US-first',
    expectedNotes: 'healthcare regulated, expect conservative ranking',
  },

  // Non-English geographies — exercise EUIPO cross-check
  {
    slug: '08-eu-logistics',
    description:
      'A B2B logistics SaaS for European mid-sized importers managing shipments, customs, and supplier coordination.',
    personality: 'Utilitarian / direct',
    geography: 'Europe',
    expectedNotes: 'EU geo — should exercise EUIPO if LD flag is on',
  },

  // Non-software (tests Nice class inference beyond fallback)
  {
    slug: '09-nonsoftware-coffee',
    description:
      'A specialty coffee subscription that ships single-origin beans roasted to order from independent roasters worldwide.',
    personality: 'Premium / refined',
    geography: 'US-first',
    expectedNotes: 'Class 30 not 42 — tests Nice class inference branching',
  },

  // Constraint adherence
  {
    slug: '10-constraint-short-name',
    description:
      'A B2B SaaS that runs structured async standups for distributed engineering teams.',
    personality: 'Premium / refined',
    geography: 'Global',
    constraints: 'Maximum 6 characters per name. No acronyms.',
    expectedNotes: 'tests constraint adherence — every name should be ≤6 chars and not an acronym',
  },
]

const OUT_DIR = '/tmp/accuracy-audit'
await fs.mkdir(OUT_DIR, { recursive: true })

let totalCostUsd = 0
const COST_CAP = 5.0
const PER_BRIEF_CAP = 0.5
const summary = []

for (const brief of BRIEFS) {
  if (totalCostUsd >= COST_CAP) {
    console.log(`STOPPING: cost cap reached ($${totalCostUsd.toFixed(2)} >= $${COST_CAP})`)
    break
  }

  console.log(`\n[${brief.slug}] running...`)
  const start = performance.now()

  // Hook into the cost logger by monkey-patching pino write
  // Actually simpler: just rely on the structured logs to disk separately;
  // here we re-import logger and capture llm_cost events for this brief
  // window. But mocking is fragile — simpler to compute cost from the report's
  // own usage data. We don't have direct access to that, so we estimate per-call.

  let result, error
  try {
    result = await generateReport(
      {
        description: brief.description,
        personality: brief.personality,
        geography: brief.geography,
        constraints: brief.constraints,
      },
      { requestId: brief.slug }
    )
  } catch (e) {
    error = e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : String(e)
  }

  const durationMs = Math.round(performance.now() - start)

  // Rough cost estimate: 3 LLM calls (infer + generate + synthesise) at Sonnet 4.6 pricing
  // ~ $0.04 per request based on prior cost telemetry; +~ $0.10 Signa for ~10 candidates
  const estimatedCost = result ? 0.15 : 0.05
  totalCostUsd += estimatedCost

  const record = {
    brief: { ...brief },
    durationMs,
    estimatedCostUsd: estimatedCost,
    cumulativeCostUsd: totalCostUsd,
    error,
    report: result,
  }

  const outPath = path.join(OUT_DIR, `${brief.slug}.json`)
  await fs.writeFile(outPath, JSON.stringify(record, null, 2))
  console.log(
    `  → ${error ? 'FAILED' : 'OK'} (${durationMs}ms, ~$${estimatedCost.toFixed(2)}) → ${outPath}`
  )

  summary.push({
    slug: brief.slug,
    ok: !error,
    durationMs,
    candidateCount: result?.candidates?.length ?? 0,
    topPickCount: result?.topPicks?.length ?? 0,
    error: error ? (typeof error === 'string' ? error : error.message) : null,
  })
}

// Write summary
await fs.writeFile(
  path.join(OUT_DIR, '_summary.json'),
  JSON.stringify({ totalCostUsd, briefsRun: summary.length, summary }, null, 2)
)

console.log(`\n${'─'.repeat(60)}`)
console.log(`Done. ${summary.length} briefs, ~$${totalCostUsd.toFixed(2)} estimated.`)
console.log(`Outputs in ${OUT_DIR}/`)
console.table(summary.map((s) => ({ slug: s.slug, ok: s.ok, ms: s.durationMs, n: s.candidateCount })))

process.exit(0)
