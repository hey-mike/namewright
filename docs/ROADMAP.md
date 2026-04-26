# Namewright Roadmap

## Shipped — Phase 1 (MVP) & Phase 2a (Intelligence & Evidence)

- **Agent pipeline** — inferNiceClass + generateCandidates (parallel), checkAllTrademarks + checkAllEuipoTrademarks + checkAllDomains (parallel), synthesiseReport
- **"Warm Premium" UI Redesign** ✓ (2026-04-25) — Newsreader/Geist typography, bone/charcoal palette, high-contrast matrix visuals.
- **Wait-time UX (Split View)** ✓ (2026-04-25) — Immersive terminal log paired with editorial branding tips.
- **Decision Triad (Safe/Bold/Best)** ✓ (2026-04-25) — Explicit decision framework for top picks.
- **6-dimension candidate breakdown** ✓ (2026-04-25) — Per-candidate scoring across name quality, fit, trademark, domain, differentiation, and expansion.
- **Domain confidence matrix** ✓ (2026-04-25) — Exposing RDAP / DNS / Registrar signals per TLD for radical transparency.
- **Filtered Candidates (Proof of Work)** ✓ (2026-04-25) — Surfacing rejected names with reasons to prove agentic rigor.
- **Phonetic Mechanisms** ✓ (2026-04-25) — Rationales explicitly explain the linguistic mechanics of the mark.
- **Trademark coverage** — Signa (USPTO + EUIPO + WIPO) + optional EUIPO direct cross-check (LD flag, EU/Global geos)
- **Domain coverage** — 3-layer: DNS (Node), RDAP (rdap.org), WhoisJSON (1000/mo free tier)
- **Nice class inference** — LLM-inferred per brief, falls back to Class 42 (software) on failure
- **Personality-driven filtering** — 5 personality chips weight name styles
- **Constraint adherence** — user can specify hard rules ("max 6 chars", "no acronyms")
- **Intake refinements** ✓ (2026-04-25) — Company vs Product context checkbox + style strength info.
- **Auto-fix validator** — corrects LLM ranking rule violations
- **Homoglyph retry** — catches non-ASCII slip-ups
- **PDF export** — auth-gated download via `@react-pdf/renderer`
- **Email-me-a-copy** — Resend integration
- **Inngest async pipeline** — ~90s resilient background processing
- **Magic-link sign-in** — durable per-user report history
- **R2 storage** — permanent JSON/PDF storage

## Phase 2 (post-launch, next 3 months)

- **Multi-provider domain stacking** — add Domainr (10K/mo free) + WhoisXML API (500/mo) + IP2WHOIS (500/mo) as fallbacks; quota-aware routing. Triggered by hitting >200 reports/month on a single provider.
- **WIPO Madrid direct integration** — adds international coverage beyond Signa's aggregation. Only if customers report missed EU/Asia conflicts.
- **Confidence-scored domain aggregation** — surface "available (3/3 sources agree)" vs "available (1/3, verify manually)" to users. Requires 4th domain source to be meaningful.
- **USPTO TESS direct** — phonetic/fuzzy coverage beyond Signa's. Requires scraping (no official API); defer until complaints justify effort + legal review.
- **Risk threshold calibration** — empirically re-tune `bucketResult` thresholds (currently 50/80 relevance-score cutoffs) against a labeled dataset. Needs 500+ real reports to be meaningful.

## Phase 3 (opportunistic, when signal justifies)

- **Pronunciation field** — add `pronunciation: string` to candidate schema for invented/compound names
- **Social handle note** — add Instagram / X / LinkedIn handle availability to `topPicks.nextSteps`
- **Streaming results** — candidates appear progressively as pipeline completes each step (reduces perceived latency). Phase 1 SSE wiring (`/api/status/[jobId]`) is in place via the Inngest migration; this item is the per-candidate streaming layer on top.
- **Feedback loops** — thumbs up/down per candidate, "which name did you actually pick" signal capture post-purchase
- **Regenerate flow** — refine brief and regenerate without paying again (free re-spin within 24h)

## Complexity cleanup (pending validation)

Items from the 2026-04-24 complexity audit that were flagged as PREMATURE but shipped anyway as "telemetry-for-later". Revisit after 100+ prod reports:

- **LaunchDarkly integration** — single flag could be a `process.env.EUIPO_ENABLED` var; 5.3MB SDK cost for one boolean
- **`validateGroundedMarks` + `extractCitedMarks`** — shipped but no baseline hallucination rate measured yet
- **`validateStyleDistribution`** — fires 0× in current telemetry; may be a dead validator
- **`tagStage` error-wrapping** — volume optimization at pre-volume stage
- **`callWithRateLimitRetry`** — zero empirical 429s at current volume
- **`/api/health` endpoint** — built for external uptime monitor not yet configured
- **`/api/cron/stripe-reconcile`** — daily reconciliation of 0 paid sessions

Decision per item on cleanup: KEEP if firing meaningful telemetry in prod, CUT if still zero-signal after 3 months.

## Out of scope (by design, not deferred)

These would turn Namewright into a brand-strategy consultant and dilute the core wedge. Do NOT build them under the Namewright brand — not at $19, not at $49, not as a "Brand Kit." If you feel tempted after a customer request or a competitive review, re-read this section first:

- Brand positioning statement generation
- Target audience persona creation
- Messaging pillars / tone-of-voice framework
- Taglines / slogans / copywriting
- Visual identity direction (colors, typography, logo)
- Go-to-market strategy
- Competitive differentiation analysis (beyond the "names to avoid" input above)
- Logo design
- Brand guidelines PDF

The wedge is **pre-incorporation screening** (preliminary trademark + domain + name quality signals), not **post-incorporation brand building** (positioning + messaging + identity), and not legal clearance. Competitors who blend the two are NameCheck's Brand Spark Kit — directly copying their surface area cedes our differentiation.

If customer signal overwhelms, build a **separate product** with its own positioning, not a feature expansion. Deferring the decision to "a future Brand Kit" is how this rule gets eroded.

### Social handle checks — feasibility note

Included in Tier 2 but only for platforms with free, reliable, official APIs: **GitHub, Reddit, Bluesky**. The commercially essential ones are deliberately excluded:

- **X** — Basic API tier $200/mo minimum, no free availability endpoint
- **Instagram / Threads** — Graph API needs app review + business verification; no availability endpoint even then
- **TikTok** — Developer portal requires approval; no availability endpoint
- **LinkedIn** — completely locked down
- **Profile-URL HEAD probes** — Vercel IPs reliably blocked by Cloudflare/bot-detection on these platforms; ToS gray area; fragile

Shipping unreliable probes as "verified handle availability" would erode the core "cross-checked data" positioning. Better to ship narrow + honest than broad + flaky.
