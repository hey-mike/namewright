// Minimal probe for the Signa trademark API — bypasses lib/signa.ts so we can
// see the raw error without any wrapping or degrade-to-uncertain fallback.
//
// Usage:  node scripts/probe-signa.mjs [query]
// Example: node scripts/probe-signa.mjs Quorient
//
// Exits 0 on success, 1 on failure. Prints timing + full response shape OR
// the raw error + its stack so we can diagnose.

import fs from 'node:fs'
import path from 'node:path'

// Load .env.local manually (don't rely on Next.js env loading)
const envPath = path.resolve(process.cwd(), '.env.local')
if (!fs.existsSync(envPath)) {
  console.error(`✗ .env.local not found at ${envPath}`)
  process.exit(1)
}
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const key = process.env.SIGNA_API_KEY
if (!key) {
  console.error('✗ SIGNA_API_KEY is not set in .env.local')
  process.exit(1)
}
console.log(`✓ SIGNA_API_KEY loaded (first 6: ${key.slice(0, 6)}…, length: ${key.length})`)

// Import the SDK
let SignaMod
try {
  SignaMod = await import('@signa-so/sdk')
  console.log('✓ @signa-so/sdk imported')
  console.log(`  Default export: ${typeof SignaMod.default}`)
} catch (err) {
  console.error('✗ Failed to import @signa-so/sdk:', err.message)
  process.exit(1)
}

const Signa = SignaMod.default
const client = new Signa({ api_key: key })
console.log('✓ Signa client constructed')

const query = process.argv[2] || 'Quorient'
const niceClass = 42
console.log(`\n→ search.query({ query: "${query}", nice_classes: [${niceClass}] })`)

const start = Date.now()
try {
  const results = await client.search.query({
    query,
    strategies: ['exact', 'phonetic', 'fuzzy'],
    filters: {
      offices: ['uspto', 'euipo'],
      nice_classes: [niceClass],
    },
    limit: 10,
  })
  const elapsed = Date.now() - start

  console.log(`\n✓ Request succeeded in ${elapsed}ms`)
  console.log(`\nResponse shape:`)
  console.log(`  object: ${results.object ?? '(missing)'}`)
  console.log(`  data: ${Array.isArray(results.data) ? `Array(${results.data.length})` : typeof results.data}`)
  console.log(`  has_more: ${results.has_more}`)
  console.log(`  pagination: ${JSON.stringify(results.pagination)}`)

  if (Array.isArray(results.data) && results.data.length > 0) {
    console.log(`\nFirst hit:`)
    const first = results.data[0]
    console.log(`  id: ${first.id}`)
    console.log(`  mark_text: ${first.mark_text}`)
    console.log(`  office_code: ${first.office_code}`)
    console.log(`  jurisdiction_code: ${first.jurisdiction_code}`)
    console.log(`  status.primary: ${first.status?.primary}`)
    console.log(`  nice_classes: ${JSON.stringify(first.nice_classes)}`)
    console.log(`  relevance_score: ${first.relevance_score}`)
  }

  process.exit(0)
} catch (err) {
  const elapsed = Date.now() - start
  console.error(`\n✗ Request FAILED after ${elapsed}ms`)
  console.error(`\nError details:`)
  console.error(`  message: ${err.message}`)
  console.error(`  name: ${err.name}`)
  if (err.status) console.error(`  status: ${err.status}`)
  if (err.code) console.error(`  code: ${err.code}`)
  if (err.cause) console.error(`  cause: ${err.cause?.message ?? err.cause}`)
  console.error(`\nStack (top 5 frames):`)
  const stack = (err.stack ?? '').split('\n').slice(0, 6).join('\n')
  console.error(stack)
  process.exit(1)
}
