# Namewright Roadmap

## Shipped — Phase 1 (MVP, pre-launch)

- **Agent pipeline** — inferNiceClass + generateCandidates (parallel), checkAllTrademarks + checkAllEuipoTrademarks + checkAllDomains (parallel), synthesiseReport
- **Trademark coverage** — Signa (USPTO + EUIPO + WIPO) + optional EUIPO direct cross-check (LD flag, EU/Global geos)
- **Domain coverage** — 3-layer: DNS (Node), RDAP (rdap.org), WhoisJSON (1000/mo free tier)
- **Nice class inference** — LLM-inferred per brief, falls back to Class 42 (software) on failure
- **Personality-driven filtering** — 5 personality chips weight name styles (Premium → invented+compound, Bold → invented+metaphorical, etc.)
- **Constraint adherence** — user can specify hard rules ("max 6 chars", "no acronyms"); prompt treats as hard requirements
- **Auto-fix validator** — silently corrects LLM ranking rule violations (unusable prefix, bottom-rank, topPicks integrity) with warn-log telemetry
- **Homoglyph retry** — catches Cyrillic/Greek/full-width Latin slip-ups and retries once with strict ASCII caveat
- **Cross-source coverage notes** — report transparently surfaces "EUIPO check unavailable" / "Signa-only" / "Cross-verified clear" prefixes
- **Grounding validator** — detects LLM citing marks not in input conflicts (telemetry-only; upgrade to strip/retry when prod data supports)
- **Style-distribution validator** — warns when LLM ignores personality weighting (telemetry-only)
- **Accuracy audit infrastructure** — `scripts/accuracy-audit.mjs` runs 10 curated briefs, ~$1.40/run
- **CSRF nonce flow** — single-use KV-stored nonce at `/api/auth` to prevent cross-origin checkout hijacking
- **Stripe reconcile cron** — daily detection of paid sessions missing from KV (webhook-never-arrived failure mode)
- **PDF export** — `@react-pdf/renderer`, client-side dynamic import
- **Email-me-a-copy** — optional at paywall, dispatched via Resend, prevents TTL-expiry data loss for users who lose the browser link
- **Observability** — Pino structured logs, Sentry (conditional on DSN), Slack alerts on actionable failures, cost telemetry per Anthropic call

## Phase 2a (post-launch, next 3 months)

### Product upgrades from competitive review (2026-04-24)

Prioritized from external review against NameCheck's Brand Spark Kit ($29). Runway is ~16–20 hr of focused work.

1. **Landing reposition — "before you commit" wedge** ✓ (2026-04-24) — H1 + subline reframed around pre-incorporation shortlist vs NameCheck's single-name validation. Differentiates without crossing into consulting scope.
2. **Domain confidence matrix** — expose RDAP / DNS / WhoisJSON per-source in the report (currently collapsed to single status). Leverages signals we already compute; concrete honesty beats NameCheck's all-"Unknown" screenshot. ~2-3 hr.
3. **6-dimension candidate breakdown** (replaces the composite "Name Score" originally planned) — per-candidate bands across name quality / strategic fit / trademark signal / domain signal / differentiation / expansion potential. Explainable over false-precision numbers. ~4-6 hr.
4. **Best / Safest / Boldest triad** replaces single "Top 3 overall" — re-rank same candidate set with different weightings. ~2 hr.
5. **Rejected-names section** — surface 3–5 filtered candidates with one-line reasons. Signals "we did real work" + educates about trademark strength. ~2 hr.
6. **Intake refinements** — company-vs-product-name checkbox (materially changes risk framing) + style-strength tooltip (educates on descriptive-vs-distinctive). ~1.5 hr.

### Other Phase 2a

- **Tier 2 "Deeper Due Diligence" report at $49** — extends the $19 due-diligence wedge with: additional trademark jurisdictions (IP Australia, UK IPO direct, WIPO Madrid direct), deeper phonetic/compound fuzzy scan, verifiable social handle coverage (GitHub / Reddit / Bluesky — see "Out of scope" for why the commercially-relevant ones aren't feasible), and a founder launch checklist (domain register → USPTO ITU filing → incorporation). **Explicitly does NOT include positioning statements, messaging pillars, taglines, or brand identity** — those remain permanently out of scope (see below). Gated on week-4 signal: only build if ≥30% of paid customers ask for extensions to the $19 report.
- **Competitor input field (optional)** — intake form adds "names you want to distinguish from"; flows into generateCandidates as negative constraints. Grounds generation in user's competitive set without requiring Namewright to do positioning analysis.
- **Tighter rationale prompt** — require each candidate's rationale to connect explicitly to (a) personality, (b) a phonetic/linguistic mechanism, (c) why the category benefits from a name like this. Closes the "arbitrary feel" gap identified in the product review.
- **TopPicks-only domain check** — reduce `checkAllDomains` calls from 30/report to ~9/report (top 3 candidates × 3 TLDs). 70% WhoisJSON usage reduction. Keeps free tier viable through ~100 reports/month. **Do this before launch if quota becomes blocking.**
- **Regression eval pipeline** — productionize `scripts/accuracy-audit.mjs` as a weekly cron + Jest-snapshot-style comparison to detect prompt drift

## Phase 2b (volume-driven, month 3+)

- **Multi-provider domain stacking** — add Domainr (10K/mo free) + WhoisXML API (500/mo) + IP2WHOIS (500/mo) as fallbacks; quota-aware routing. Triggered by hitting >200 reports/month on a single provider.
- **WIPO Madrid direct integration** — adds international coverage beyond Signa's aggregation. Only if customers report missed EU/Asia conflicts.
- **Confidence-scored domain aggregation** — surface "available (3/3 sources agree)" vs "available (1/3, verify manually)" to users. Requires 4th domain source to be meaningful.
- **USPTO TESS direct** — phonetic/fuzzy coverage beyond Signa's. Requires scraping (no official API); defer until complaints justify effort + legal review.
- **Risk threshold calibration** — empirically re-tune `bucketResult` thresholds (currently 50/80 relevance-score cutoffs) against a labeled dataset. Needs 500+ real reports to be meaningful.

## Phase 3 (opportunistic, when signal justifies)

- **Pronunciation field** — add `pronunciation: string` to candidate schema for invented/compound names
- **Social handle note** — add Instagram / X / LinkedIn handle availability to `topPicks.nextSteps`
- **Streaming results** — candidates appear progressively as pipeline completes each step (reduces perceived latency)
- **Feedback loops** — thumbs up/down per candidate, "which name did you actually pick" signal capture post-purchase
- **Regenerate flow** — refine brief and regenerate without paying again (free re-spin within 24h)
- **User accounts** — persistent report history across sessions (only if retention data justifies; solo founders pre-incorporation are typically one-shot customers)

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
