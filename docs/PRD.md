# Namewright — Product Requirements Document

**Status:** Pre-launch (Phase 1 shipped, Phase 2a in progress)
**Last updated:** 2026-04-25
**Owner:** Michael (solo founder)
**Source of truth for:** product scope, target user, success criteria, what we will and won't build

This PRD is descriptive (what Namewright is now) plus near-term direction. For implementation sequencing, see `docs/ROADMAP.md`. For system internals, see `docs/ARCHITECTURE.md`. For engineering conventions, see `CLAUDE.md` and `AGENTS.md`.

---

## 1. One-liner

A $19 brand-naming tool for solo founders pre-incorporation. Submit a brief, get 8–12 ranked name candidates with preliminary trademark screening (Signa + optional EUIPO) and domain availability (DNS + RDAP + WhoisJSON) across three TLDs, in under 90 seconds. **Preliminary screening — not legal clearance.**

**Landing copy / tagline (shipped):** _"Name your brand. Before you commit."_

The earlier marketing tagline _"Name your brand well. Own it defensibly."_ was retired 2026-04-25 — "defensibly" implied trademark defensibility we don't certify. The H1 above does the work without overclaim.

## 2. Problem

Solo founders picking a name before incorporation currently do a manual "4-tab shuffle" — ChatGPT for ideas → Google to sanity check → USPTO TESS for trademark conflicts → WHOIS / Namecheap for domain availability. The output of each tab feeds the next. The whole loop is slow, repetitive, and unreliable: ChatGPT invents trademarked names, USPTO returns false negatives on phonetic conflicts, WHOIS results disagree across registrars.

The cost of getting it wrong is asymmetric — a name picked in haste with an undetected trademark conflict gets rebranded after launch (~$10K+ for a small startup) or sued (much more). But agencies and IP attorneys cost $5K+ and take weeks, which is incompatible with a founder iterating on 5–10 name options before committing.

Namewright collapses the 4-tab loop into a single 90-second flow: structured brief in, ranked report out, preliminary trademark + domain screening baked in (not bolted on), priced for one-shot use. We don't replace the trademark attorney; we shorten what they have to start from.

## 3. Target user

**Primary:** Solo founders and indie hackers picking a brand name **before incorporation**, where the name is still unfixed and the cost of switching is zero.

**Initial ICP (sharper than "all solo founders"):** technical solo founders, indie hackers, and micro-SaaS / AI-tool / developer-tool builders naming a software product or digital service before incorporation or public launch. Reasons this group converts first:

- Already comfortable paying for one-shot SaaS tools at the $19 tier
- Understand domains and TLD nuance (`.io`, `.ai`, `.dev`) — matches the form's TLD set
- Trust structured AI output if grounded in real data
- Move fast, want validation in minutes not weeks
- Less likely to need human brand-strategy guidance (vs. consumer/retail/clinic founders)

Broader founders (consumer products, restaurants, clinics, education) may need more strategic and local-legal guidance than $19 can deliver — defer to Phase 3+.

**Profile:**

- Impatient — wants an answer in <2 minutes, not an agency engagement
- Cost-sensitive but not cheap — will pay $19 for cross-checked data, won't pay $99
- Has implicit strategy already (knows the category, audience, personality) — needs candidate names + risk signals, not strategic foundations
- Multi-product launchers (serial founders, indie-hacker portfolios) get repeat value; one-shot first-time founders get single-use value
- Trusts AI output if it looks authoritative (cited sources, structured report, transparent failure modes)

**Not targeting:**

- Founders who haven't decided on a category, audience, or positioning yet — they need a strategist or self-discovery, not a naming tool
- Agencies and IP law firms — different price point, different feature set
- Enterprise / legal teams — out of scope
- Anyone post-incorporation who needs a _name change_ (different problem: existing brand equity, customer migration, contract amendments)

## 4. Job to be done

> _When I'm picking a name for my new product/company, I want a small set of candidate names with cross-checked trademark and domain signals, so I can commit to one with informed confidence and move on to building — knowing that final legal clearance still requires an attorney._

**Done looks like:** founder reads the report, picks a top-3 candidate, registers the domain, and proceeds to incorporation/build. The report is the artifact they keep for 7 days; the _decision_ is the actual deliverable.

**Anti-jobs (we are not these):**

- Help me figure out what to build
- Help me articulate my positioning or target customer
- Generate my logo, brand identity, or messaging
- Tell me whether to incorporate as LLC vs C-Corp
- File my trademark for me

## 5. Functional scope (what we ship)

Customer-facing surface area, current state:

| Surface             | Behaviour                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intake form**     | Description (free-text), personality (5 chips), geography (5 chips), constraints (free-text), TLD selection                                                                                                      |
| **Free preview**    | 3 candidates, no trademark notes, no domain status — designed for trust + FOMO before paywall                                                                                                                    |
| **Paid report**     | 8–12 candidates with: name, style, rationale, trademark risk + notes (cross-checked across selected sources), per-TLD domain status, alternates. Top 3 picks with reasoning + next steps. Recommendation summary |
| **PDF export**      | Client-side render of the full report via `@react-pdf/renderer`                                                                                                                                                  |
| **Email-me-a-copy** | Optional at paywall — full report HTML emailed via Resend, prevents TTL-expiry data loss for users who lose the browser link                                                                                     |
| **Pricing**         | $19 one-shot, no account, no subscription. Stripe Checkout, JWT-cookie auth post-payment, KV-stored report (7d TTL)                                                                                              |

**Quality guardrails on LLM output (see CLAUDE.md "Accuracy guardrails"):**

- `validateReportData` — field-level shape + cross-cutting invariants
- Auto-fix ranking / prefix / topPicks violations (warn-log telemetry, no user-visible 502)
- `validateGroundedMarks` — detects LLM citing trademark conflicts not in input
- Homoglyph rejection (Cyrillic / Greek / full-width) with single retry
- Cross-source coverage notes when a check is unavailable

## 6. Non-goals (out of scope by design, not deferred)

These would turn Namewright into a brand-strategy consultant and dilute the wedge. **Will not ship at $19, $49, or as a "Brand Kit."** If user signal demands them, ship a separate product, not a feature expansion. From `docs/ROADMAP.md` "Out of scope":

- Brand positioning statement generation
- Target audience persona creation
- Messaging pillars / tone-of-voice framework
- Taglines / slogans / copywriting (own tagline excepted)
- Visual identity (colors, typography, logo)
- Go-to-market strategy
- Competitive differentiation analysis (beyond optional "names to avoid" intake field, planned)
- Logo design
- Brand guidelines PDF

The wedge is **pre-incorporation screening** (preliminary trademark + domain + name quality signals), not **post-incorporation brand building**, and not legal clearance.

## 7. Pricing

| Tier                          | Price | Status                     | Includes                                                                                                |
| ----------------------------- | ----- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Free preview                  | $0    | Shipped                    | 3 candidates, no risk/domain detail                                                                     |
| Standard                      | $19   | Shipped                    | 8–12 candidates, full trademark + domain screening, PDF, email copy                                     |
| Tier 2 "Deeper Due Diligence" | $49   | Gated on signal (Phase 2a) | Standard + IP Australia / UK IPO / WIPO Madrid + GitHub/Reddit/Bluesky handle checks + launch checklist |

Tier 2 ships only if **≥30% of paid customers** ask for extensions to the $19 report at week 4 post-launch. Default action without signal: do not build it.

**No subscription.** Solo founders pre-incorporation are largely one-shot users; subscription assumes repeat use that doesn't happen at this scale. Pro/agency tier deferred to Phase 3 if volume justifies.

## 8. Success metrics

**Launch criteria (binary go/no-go):**

- All Phase 1 items shipped ✓
- Stripe live mode wired
- Production env vars set (see `.env.example`)
- Legal pages (TOS, privacy, refund policy, "not legal advice" disclaimer)
- **Self-drafted disclaimer audit** (decision 2026-04-25 not to engage counsel — see §10 Q1) — language explicitly says "preliminary screening, not legal clearance" with symmetric concessions; protection comes from clarity + placement, not formal sign-off
- **"Not legal advice" disclaimer prominent on landing page** (≥14px, above the fold or adjacent to the primary CTA — currently 11px monospace below submit, which is buried). _This is the load-bearing launch gate now that counsel review is off the list._
- **Public sample report published** — pre-purchase trust artifact; lets prospective customers see report depth before paying
- **First-traffic plan committed** — Day-1 channels documented with expected reach (see §10 Q3)
- Domain pointed at production
- `/api/health` returns `{ status: "ok", missingRequired: [] }` on prod

**Phase 2a launch trigger:** completion of items #2–#6 from `docs/ROADMAP.md` (or explicit decision to cut and ship), realistic effort 17–25 hr. Recommended minimum cut: #2 + #3 + #6 (~12–16 hr).

**Post-launch metrics (first 4 weeks):**

| Metric                                           | Target                                                                               | Measurement                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Decision-usefulness rate** (the killer metric) | ≥50% answer "yes"                                                                    | One-click post-report question: _"Did this report give you at least one name you'd seriously consider?"_ (Yes / Maybe / No) |
| Free → paid conversion                           | >5% (varies by channel — see channel-conversion note below)                          | Stripe vs total free preview generations                                                                                    |
| Report completion rate                           | >90%                                                                                 | Pipeline didn't 502 / fall back to "uncertain"                                                                              |
| Time to report                                   | <90s p95                                                                             | Server-timed                                                                                                                |
| Customer-reported missed-conflict                | <2%                                                                                  | Email feedback / refund requests                                                                                            |
| Tier 2 signal                                    | ≥30 paid reports AND (≥30% want deeper checks OR ≥5 explicit $49 willingness-to-pay) | Post-purchase survey + smoke-test buy button                                                                                |
| Refund rate                                      | <5%                                                                                  | Stripe                                                                                                                      |
| Cost per paid report (excl. Stripe fees)         | <$0.50                                                                               | `cost.ts` telemetry                                                                                                         |
| Total variable cost (incl. Stripe fees)          | <$2.00                                                                               | Stripe invoice + cost.ts                                                                                                    |
| Gross margin after fees                          | >80%                                                                                 | derived                                                                                                                     |

**Channel-conversion note:** the >5% conversion target is uncalibrated. Re-baseline by channel after first 100 visits. Illustrative ranges (not benchmarks): cold SEO 1–3%, IndieHackers/PH 3–8%, warm-audience launch 8–15%, intent search 5–12%. Do not declare success or failure on conversion until you know which channel the visits came from.

If Tier 2 trigger fails at week 4: do not build, defer indefinitely.

## 9. Risks & assumptions

**Assumptions (testable post-launch):**

1. Solo founders pre-incorporation will pay $19 once. _Falsified if conversion <2%._
2. The 90-second turnaround is a meaningful differentiator over agencies, not just nice-to-have. _Falsified if customers ask for "more thorough" over "more options."_
3. Cross-checked trademark + domain data justifies the price over free generators (Namelix, ChatGPT). _Falsified if customers churn to free alternatives or request refunds citing "I could've Googled this."_
4. The wedge holds without expanding into positioning/messaging. _Falsified if a meaningful share of paid customers ask "what's next" → consulting territory._

**Risks:**

- **Anthropic credit exhaustion / cost spike** — mitigated by `cost.ts` telemetry + Slack alerts; falls back to "uncertain" rather than 502
- **Signa / EUIPO / WhoisJSON quota exhaustion** — graceful degradation per source; cross-source coverage notes surface "check unavailable" rather than hide it
- **⚠ Customer-claimed missed conflict leading to a real trademark dispute (load-bearing pre-launch risk)** — mitigated by self-drafted "preliminary screening, not legal clearance" disclaimer with symmetric concessions, cross-source coverage notes, refund policy. _Disclaimer prominence upgrade (≥14px on landing) + refund SOP are launch gates_ (counsel engagement deliberately deferred — see §10 Q1). Revisit posture if volume scales past 500 paid reports/month.
- **Webhook race / payment received without report access** — mitigated by `/api/cron/stripe-reconcile` daily backstop + email-me-a-copy at paywall
- **Wedge dilution under competitive pressure** — explicitly captured in `docs/ROADMAP.md` "Out of scope" section as a self-binding rule; future founder-self should re-read before approving expansion

## 10. Open questions (block launch if unanswered)

1. ~~**Counsel review of disclaimer + refund SOP + PRD language.**~~ **Resolved 2026-04-25: not engaging counsel.** Rationale: $19 single-use tool with prominent "preliminary screening, not legal clearance" disclaimer + symmetric concession language is appropriately protected for the realistic exposure tier (refund-tier complaints, not litigation). The protection comes from clarity + placement. _Revisit if volume exceeds 500 paid reports/month or if the first refund/dispute pattern reveals language gaps._
2. **Refund SOP** — _open_. Manual via Stripe dashboard, or automated? What triggers a refund (any complaint, or specific criteria like "missed obvious conflict")? Document the wording and the decision tree before launch so handling is consistent.
3. **First-traffic plan** — _open, launch gate_. Day-1 channels with expected reach. Default proposal: IndieHackers post + tweet thread + 2 personal-network channels. Without this, "launch" is a deploy that nobody sees.
4. ~~**Tagline decision.**~~ **Resolved 2026-04-25: option (a) — retire "Own it defensibly" entirely.** Use only the H1 _"Name your brand. Before you commit."_ as the marketing line.
5. ~~**Report TTL.**~~ **Resolved 2026-04-25: extended KV TTL + JWT + cookie to 7 days.** Storage cost negligible; security trade-off (longer cookie-hijack window) acceptable for a single-use $19 product with no chargeable resources behind the cookie. Auth nonce stays at 24h (single-use). See `.claude/rules/contracts.md`.
6. **Tier 2 decision deadline** — _open_. Week 4 sharp, or extended if volume is low? Pre-commit a rule (e.g. "extend to week 6 only if <20 paid reports at week 4").

## 10a. Public sample report (launch requirement)

A pre-purchase example report at `/sample` (or similar). Builds trust before payment, especially for a tool customers can't preview-test on their own brief. Should include all paid-tier sections rendered with a believable fictional brief. Anonymize / fictionalize trademark notes to avoid implying we cleared a real-world mark.

## 11. Out of scope for this PRD

- Implementation sequencing → `docs/ROADMAP.md`
- System architecture → `docs/ARCHITECTURE.md`
- Engineering conventions → `CLAUDE.md`
- Specific past audits (logging, accuracy, complexity) → `README.md` "Internal audits"
- Detailed pipeline mechanics → `docs/superpowers/specs/2026-04-22-agent-pipeline-design.md`
