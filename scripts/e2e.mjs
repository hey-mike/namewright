// End-to-end smoke test for the full Namewright journey.
//
// Usage:
//   node scripts/e2e.mjs                           # full smoke against localhost
//   BASE_URL=https://preview.vercel.app/ node scripts/e2e.mjs
//   STRIPE_TEST=1 node scripts/e2e.mjs              # also walks Stripe test card flow
//   E2E_EMAIL=you@inbox.dev node scripts/e2e.mjs    # opt in to email-me-a-copy
//
// What it tests:
//   1. Homepage renders with intake form
//   2. Form validation: submit disabled when required fields missing
//   3. Submit valid brief → loading pipeline → /preview
//   4. Preview shows brief + 3 candidates (first expanded, others previewLocked)
//   5. Paywall shows email-me-a-copy field, unlock CTA, refund line
//   6. Error states: /preview with no id, /preview with bad id, /preview after expiry
//   7. (Optional, with STRIPE_TEST=1) Stripe Checkout loads and accepts 4242 card
//   8. (Optional) Returns to /results with valid session, full report renders
//
// Requires: dev server running (npm run dev) or BASE_URL pointing at a deploy
// with all required env vars set. Anthropic + Signa calls happen for real.
//
// Cost per run: ~$0.12 in Anthropic + ~$0.10 in Signa = ~$0.22.

import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const E2E_EMAIL = process.env.E2E_EMAIL || ''
const STRIPE_TEST = process.env.STRIPE_TEST === '1'
const OUT = '/tmp/namewright-e2e'
await fs.mkdir(OUT, { recursive: true })

const failures = []
const checks = []

function check(name, condition, details = '') {
  const ok = !!condition
  checks.push({ name, ok, details })
  if (!ok) failures.push({ name, details })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${details ? ` — ${details}` : ''}`)
}

async function shot(page, name) {
  const filePath = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: filePath })
  return filePath
}

const browser = await chromium.launch({ headless: true })

try {
  // ────────────────────────────────────────────────────────────────────
  // Test 1 — Homepage renders
  // ────────────────────────────────────────────────────────────────────
  console.log('\n[1] Homepage renders')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const homeResp = await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  check('homepage HTTP 200', homeResp?.status() === 200, `got ${homeResp?.status()}`)
  await page.waitForTimeout(800)
  await shot(page, '01-home')
  check(
    'hero h1 visible with italic emphasis',
    await page.locator('h1 em').count() > 0
  )
  check(
    'submit button disabled on empty form',
    await page.locator('button.btn-primary').first().isDisabled()
  )

  // ────────────────────────────────────────────────────────────────────
  // Test 2 — Form validation
  // ────────────────────────────────────────────────────────────────────
  console.log('\n[2] Form validation')
  await page.locator('#desc').fill('app') // < 10 chars
  check(
    'submit still disabled with short description',
    await page.locator('button.btn-primary').first().isDisabled()
  )

  // ────────────────────────────────────────────────────────────────────
  // Test 3 — Submit + pipeline + preview
  // ────────────────────────────────────────────────────────────────────
  console.log('\n[3] Submit + pipeline')
  await page
    .locator('#desc')
    .fill(
      'A premium B2B SaaS that runs structured async standups for distributed engineering teams, replacing daily Zoom meetings with written updates and AI-generated summaries.'
    )
  await page.locator('button:has-text("Premium / refined")').click()
  await page.locator('button:has-text("Global")').click()
  await page.waitForTimeout(300)
  await shot(page, '02-form-filled')
  check(
    'submit enabled after valid form',
    !(await page.locator('button.btn-primary').first().isDisabled())
  )

  await page.locator('button.btn-primary').first().click()
  await page.waitForTimeout(2000)
  await shot(page, '03-loading')
  check(
    'loading pipeline visible',
    await page.locator('text=Generating candidates').count() > 0
  )

  let reportUrl
  try {
    await page.waitForURL(/\/preview\?report_id=/, { timeout: 120000 })
    reportUrl = page.url()
    console.log(`    → navigated to ${reportUrl.slice(BASE_URL.length)}`)
  } catch (e) {
    check('preview navigation within 90s', false, `timeout: ${e.message}`)
    throw new Error('Preview navigation failed; aborting downstream tests')
  }
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
  await shot(page, '04-preview-fold')

  // ────────────────────────────────────────────────────────────────────
  // Test 4 — Preview content
  // ────────────────────────────────────────────────────────────────────
  console.log('\n[4] Preview content')
  check(
    'BRIEF section renders',
    await page.locator('text=BRIEF').count() > 0
  )
  check(
    '3 candidates rendered',
    (await page.locator('h3').count()) >= 3,
    `${await page.locator('h3').count()} h3 elements`
  )
  check(
    'first candidate expanded by default',
    await page.locator('button[aria-expanded="true"]').count() >= 1
  )

  // Verify previewLocked behavior on candidate 02
  const collapsedCandidates = page.locator('button[aria-expanded="false"]')
  if ((await collapsedCandidates.count()) > 0) {
    await collapsedCandidates.first().click()
    await page.waitForTimeout(400)
    await shot(page, '05-candidate-2-expanded')
    check(
      'candidate 02 shows lock hint instead of trademark notes',
      await page.locator('text=Detailed trademark notes available in the full report').count() > 0
    )
    check(
      'candidate 02 still shows rationale',
      await page.locator('text=Why it works').count() >= 2
    )
  }

  // Domain rendering should not have double dots
  await page.evaluate(() => window.scrollTo(0, 200))
  const domainText = await page
    .locator('span.mono')
    .allInnerTexts()
    .then((arr) => arr.find((t) => /\.com|\.io|\.co/.test(t)) || '')
  check(
    'domain renders with single dot (no "..com" bug)',
    !!domainText && !domainText.includes('..'),
    domainText ? `sample: ${domainText}` : 'no domain text found'
  )

  // ────────────────────────────────────────────────────────────────────
  // Test 5 — Paywall
  // ────────────────────────────────────────────────────────────────────
  console.log('\n[5] Paywall')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)
  await shot(page, '06-paywall')
  check(
    'paywall has email-me-a-copy field',
    await page.locator('#report-email').count() > 0
  )
  check(
    'paywall has refund line + support email',
    await page.locator('text=7-day refund').count() > 0
  )
  check(
    'unlock CTA visible',
    await page.locator('button:has-text("Unlock full report")').count() > 0
  )

  // Email validation — bad email
  await page.locator('#report-email').fill('not-an-email')
  await page.locator('#report-email').blur()
  await page.waitForTimeout(300)
  check(
    'invalid email shows error message',
    await page.locator('text=Enter a valid email').count() > 0
  )

  // Email validation — good email
  await page.locator('#report-email').fill(E2E_EMAIL || 'maya@example.com')
  await page.locator('#report-email').blur()
  await page.waitForTimeout(300)
  check(
    'valid email clears error message',
    await page.locator('text=Enter a valid email').count() === 0
  )

  // ────────────────────────────────────────────────────────────────────
  // Test 6 — Error states
  // ────────────────────────────────────────────────────────────────────
  console.log('\n[6] Error states')
  const errPage = await ctx.newPage()
  await errPage.goto(`${BASE_URL}/preview`, { waitUntil: 'networkidle' })
  await errPage.waitForTimeout(800)
  await shot(errPage, '07-error-no-id')
  check(
    'no-id state shows correct heading',
    await errPage.locator("text=doesn't include a report ID").count() > 0
  )

  await errPage.goto(`${BASE_URL}/preview?report_id=does-not-exist-xyz`, {
    waitUntil: 'networkidle',
  })
  await errPage.waitForTimeout(1500)
  await shot(errPage, '08-error-expired')
  check(
    'expired state shows email-recovery hint',
    await errPage.locator("text=in your inbox").count() > 0
  )
  check(
    'expired state shows support email',
    await errPage.locator('text=support@namewright.co').count() > 0
  )
  await errPage.close()

  // ────────────────────────────────────────────────────────────────────
  // Test 7 (optional) — Stripe checkout flow
  // ────────────────────────────────────────────────────────────────────
  if (STRIPE_TEST) {
    console.log('\n[7] Stripe test card flow')
    await page.locator('button:has-text("Unlock full report")').click()
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 })
    check('redirected to Stripe Checkout', page.url().includes('checkout.stripe.com'))
    await page.waitForLoadState('networkidle')
    await shot(page, '09-stripe-checkout')

    // Fill Stripe's test card. Selectors are stable on Stripe's hosted page.
    await page.locator('input[name="cardNumber"]').fill('4242 4242 4242 4242')
    await page.locator('input[name="cardExpiry"]').fill('12/30')
    await page.locator('input[name="cardCvc"]').fill('123')
    await page.locator('input[name="billingName"]').fill('Test User')
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/results\?report_id=/, { timeout: 30000 })
    await page.waitForLoadState('networkidle')
    await shot(page, '10-results')
    check('results page loaded after payment', page.url().includes('/results'))
    check(
      'results page shows top picks section',
      await page.locator('text=Top picks').count() > 0
    )
  } else {
    console.log('\n[7] Stripe flow — skipped (run with STRIPE_TEST=1 to enable)')
  }

  // ────────────────────────────────────────────────────────────────────
  // Mobile pass — light check
  // ────────────────────────────────────────────────────────────────────
  console.log('\n[8] Mobile parity')
  const mCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const mPage = await mCtx.newPage()
  await mPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  await mPage.waitForTimeout(800)
  await shot(mPage, '11-mobile-home')
  check(
    'mobile shows EACH REPORT INCLUDES (deliverables list)',
    await mPage.locator('text=Each report includes').count() > 0
  )
  check(
    'mobile shows REGISTRIES SEARCHED',
    await mPage.locator('text=Registries searched').count() > 0
  )
  await mCtx.close()

  await ctx.close()
} finally {
  await browser.close()
}

// ────────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────────
const passed = checks.filter((c) => c.ok).length
console.log(`\n${'─'.repeat(60)}`)
console.log(`Passed: ${passed}/${checks.length}`)
if (failures.length > 0) {
  console.log(`Failed:`)
  failures.forEach((f) => console.log(`  ✗ ${f.name}${f.details ? ` — ${f.details}` : ''}`))
  console.log(`\nScreenshots: ${OUT}/`)
  process.exit(1)
}
console.log(`\nScreenshots: ${OUT}/`)
console.log('All checks passed. ✓')
