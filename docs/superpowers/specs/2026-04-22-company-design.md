# Brand Strategy Agent — Company Design & Roadmap

**Date:** 2026-04-22  
**Status:** Draft — pending user approval  
**Working product name:** Namewright *(working title)*

---

## 1. Product Vision & Positioning

**One-liner:** The brand name research tool for solo founders — AI-generated candidates with real trademark risk and domain signals, in under a minute.

**What it is:** A research-heavy, judgment-heavy naming tool that collapses what founders currently do manually across 4 tabs (USPTO, WHOIS, Google, ChatGPT) into one authoritative ranked report.

**What it is not:**
- Not a logo generator (stay out of Looka/Canva territory)
- Not a full brand identity suite (stay out of 99designs territory)
- Not a generic AI name generator (stay out of Namelix territory)

**Tagline:** *"Name it well. Own it defensibly."* (already in the UI — keep it)

**Core differentiator:** Trademark research baked in, not bolted on. Every competitor either ignores trademark risk or does it shallowly:
- Namelix: generates names, no trademark research, domain availability requires click-through to Namecheap (not inline)
- ChatGPT (base): no trademark research, no domain checking
- ChatGPT GPTs (naming-focused): some do domain checking, none do trademark research
- USPTO / IP attorneys: authoritative but slow, expensive, terrible UX

The unclaimed position: **deep trademark + domain research, at instant and affordable scale, shown inline.**

---

## 2. Target Customer

**Primary:** Solo founders and indie hackers building their first product and picking a name before launch.

**Profile:**
- Impatient — want an answer in under 2 minutes
- Cost-sensitive — won't pay agency rates, will pay for a clear value exchange
- Trust AI if output looks authoritative
- Do the "4-tab shuffle" today (ChatGPT → Google → USPTO → WHOIS)

**Not targeting (yet):**
- Agencies (Phase 3 Pro tier)
- Enterprise / legal teams (out of scope)

---

## 3. Business Model

**Model:** Pay-per-report with freemium hook.

**Free tier:** Run the full AI + web search, return 3 candidates (no top picks, no trademark notes detail). Costs ~$0.04 in API per run. Designed to show quality and create FOMO on the rest.

**Paid tier:** $19 one-time. Unlocks full report — 8–12 candidates, top 3 picks, full trademark notes, domain status for all candidates, PDF export. No account required. Stripe session token proves payment.

**No subscription for v1.** Subscription assumes repeat use that won't happen for solo founders. Introduce a Pro tier ($49/mo, 10 reports) in Phase 3 for agencies and accelerators.

### Unit Economics

| Item | Cost estimate |
|---|---|
| Input tokens (~2,000) | ~$0.006 |
| Output tokens (~2,000) | ~$0.030 |
| Web search tool calls (~5–8) | ~$0.035 |
| **Total per full report** | **~$0.07–0.12** |

At $19/report, gross margin is ~99.4%. Even at 10× cost, margin is 93%. Do not compromise on model quality to save $0.05/report — the model IS the product.

### Adjacent Revenue (affiliate links, no integration needed)

| Partner | Placement | Est. per conversion |
|---|---|---|
| Namecheap / Porkbun | Domain rows in results | $5–15 |
| Trademark Engine | "File this trademark" CTA | $20–50 |
| Clerky / Stripe Atlas | "Ready to incorporate?" footer CTA | $30–75 |

Add these as contextual affiliate links in Phase 1. Low effort, compounds with volume.

---

## 4. Competitive Landscape

The white space is **deep research + affordable + fast**. No competitor owns this.

| Competitor | Domain checking | Trademark research | Price | Speed |
|---|---|---|---|---|
| **Namewright (us)** | Inline (inferred → live WHOIS in P2) | Yes — web search | $19/report | <1 min |
| Namelix | Click-through to Namecheap only | None | Free | Fast |
| ChatGPT (base) | None | None | Free | Fast |
| ChatGPT GPTs (naming) | Some | None | Free | Fast |
| Squadhelp | Via registrar links | Partial | $299+ | Days |
| USPTO + IP attorney | WHOIS separately | Authoritative | $500+/hr | Days–weeks |

**Key verified finding:** Namelix does NOT show domain availability inline. Users must click "register" and are redirected to Namecheap to check. Our inline domain status (even inferred) is a better UX. Live WHOIS in Phase 2 makes this a definitive advantage.

---

## 5. Technical Architecture

### Current state (prototype — NOT shippable for paid)

```
Browser (React JSX)
  ↓ direct fetch — API KEY EXPOSED
api.anthropic.com (Claude Sonnet + web_search)
```

**Problems:** API key in browser = anyone can extract and use your quota. No payments, no auth, no usage limits, no free tier enforcement.

### Launch-ready architecture

```
Browser (Next.js App Router)
  Intake form → free preview (3 candidates)
  → Stripe Checkout ($19)
  → session token → full results page
       ↓ HTTPS (no key exposed)
Next.js API Route (Edge Function)
  - Rate limiting (Cloudflare Turnstile for free tier abuse)
  - Free tier enforcement (3 candidates server-side)
  - Stripe webhook handler (confirms payment, issues session token)
       ↓
Anthropic API (Claude Sonnet + web_search)
  API key stays server-side
       ↓ (Phase 2)
WHOIS API (live domain availability)
```

**Recommended stack:** Next.js (App Router) on Vercel. No database needed for v1 — session token proves payment. Free Vercel tier handles early traffic. Add Cloudflare Turnstile (free) for bot protection on the free tier.

---

## 6. Legal & Liability

**Reliance risk:** Founder acts on trademark assessment, gets dispute, blames product.  
**Mitigation:** Prominent disclaimer on every report — *"This report is AI-assisted research, not legal advice. Verify with a qualified IP attorney before filing or committing to a name."* Not buried in footer.

**Accuracy risk:** Web search can return stale or hallucinated trademark data.  
**Mitigation:** Add datestamp to report — *"Trademark notes based on web research as of [date]. USPTO TESS is authoritative."*

Neither is a product problem — both are ToS and copy decisions.

---

## 7. Distribution Strategy

**Phase 1 (Month 1–2): Launch spike**  
Coordinated same-week launch: Product Hunt + Show HN + r/startups + r/indiehackers.  
Goal: 20–50 paying customers, 5–10 testimonials, qualitative feedback on what resonates.

**Phase 2a (Month 3): USPTO TESS integration**  
Ship real trademark registry search before investing in content. The SEO articles only credibly claim "real trademark research" once the USPTO integration is live.

**Phase 2b (Month 4–6): SEO content engine**  
Write 15–20 articles targeting high-intent founder searches:
- "how to name a startup"
- "startup trademark search guide"
- "best domain alternatives when .com is taken"
- "how to check if a business name is trademarked"

Tool embedded in each article. Free tier as the SEO hook → paid conversion. Target 500+ monthly organic visitors by end of Phase 2.

**Why not partnerships first:** Partners have leverage. If a newsletter drops you, distribution disappears overnight. Too fragile as a foundation.

---

## 8. Risk Factors

| Risk | Likelihood | Mitigation |
|---|---|---|
| Anthropic pricing doubles | Medium | Margin so high (~99%) it barely matters at early scale |
| OpenAI ships a naming GPT | High | Compete on UX quality and SEO moat — they ship generic, you're specialized |
| Google algorithm hits SEO | Medium | Diversify across Reddit, HN, newsletter appearances |
| Trademark data wrong, user gets sued | Low | Clear ToS disclaimer + "not legal advice" framing |
| Free tier bot abuse | Medium | Cloudflare Turnstile (free) + server-side cap enforcement |
| Namelix adds trademark research | Low–Medium | Maintain content moat; deepen data quality (live USPTO API) |

---

## 9. North Star Metric

**Reports generated per week.** Everything else (revenue, SEO rank, conversion rate, affiliate clicks) is downstream of this number.

---

## 10. Phased Roadmap

### Phase 1 · Month 1–2 · Make it shippable

| Task | Purpose |
|---|---|
| Move Anthropic call to Next.js API route | Key stays server-side |
| Freemium gate | Show 3 candidates free, blur the rest |
| Stripe Checkout ($19 one-time) | No account required, session token unlocks |
| PDF export | Founders share reports with co-founders |
| Affiliate links (Namecheap, Trademark Engine, Stripe Atlas) | Low-effort adjacent revenue |
| ToS + disclaimer copy | Liability framing |
| Cloudflare Turnstile | Bot protection on free tier |

**Launch:** Product Hunt + Show HN + r/startups same week.  
**Goal:** 20–50 paying customers, 5–10 testimonials.

---

### Phase 2 · Month 3–6 · Make it credible + findable

Trademark registry integration ships first — before any SEO investment. The content engine's credibility depends on the product being able to claim "real trademark database search," not just web inference.

**2a — Trademark depth (Month 3, priority)**

**Primary:** Signa API — single integration covering USPTO, EUIPO, and WIPO Madrid (130+ countries). Supports exact, phonetic, and fuzzy matching out of the box.

**Contingency fallbacks (build alongside Signa from day one):**

| Registry | Fallback endpoint | Cost |
|---|---|---|
| USPTO | developer.uspto.gov | Free |
| EUIPO | dev.euipo.europa.eu | Free (1–2 week approval) |
| UKIPO | api.ipo.gov.uk | Free (Signa doesn't cover UK yet) |
| WIPO | None — ToS prohibits direct querying | Degrade gracefully in report |
| IP Australia | IP Australia direct API | Free |

**Architecture: Parallel fan-out (Option B)**

Query Signa AND direct registry APIs simultaneously per candidate. Merge results with conflict-first priority: if any source flags a conflict, the candidate is flagged regardless of what other sources say. Disagreements between sources surface as "uncertain" rather than silently resolving to "clear."

```
Per candidate trademark search:
  ┌─ Signa (USPTO + EUIPO + WIPO, exact + phonetic + fuzzy)
  ├─ USPTO direct (developer.uspto.gov)          ← parallel
  ├─ EUIPO direct (dev.euipo.europa.eu)          ← parallel
  └─ UKIPO direct (api.ipo.gov.uk)              ← parallel (Signa doesn't cover UK yet)

Merge logic:
  - Any source returns conflict → trademarkRisk = conflict source's severity
  - All sources clear → trademarkRisk = "low" (cross-verified)
  - Source fails/times out → exclude from merge, note in trademarkNotes
  - Signa + direct agree → high confidence label
  - Signa + direct disagree → trademarkRisk = "uncertain", flag both findings

Result label: "Cross-verified across Signa, USPTO, EUIPO, UKIPO as of [date]"
```

**Why parallel fan-out over sequential or primary-only:**
- Extra latency hidden by parallelism — all queries fire simultaneously
- Extra API cost trivial at $0.10/report margin
- "Cross-verified" is a defensible, marketable claim no competitor makes
- Conflict-first merge is conservative — protects founders from false "clear" signals

| Task | Purpose |
|---|---|
| Signa API integration | Covers USPTO + EUIPO + WIPO with phonetic + fuzzy matching |
| Direct registry integrations (USPTO, EUIPO, UKIPO, IP Australia) | Parallel cross-verification + fallback if Signa is down |
| Parallel fan-out orchestration | Fire all queries simultaneously, merge with conflict-first logic |
| Nice Classification selector | Ask user product category to scope search to correct trademark class |
| Confidence scoring | "Cross-verified clear" vs "Conflict found: [mark], Class [N], Source: USPTO + Signa" |
| Geography → registry routing | User's market selection determines which offices are included in the fan-out |

**What this changes:** `trademarkRisk` goes from "brand conflict probability inferred from web search" to "cross-verified multi-registry status with phonetic + fuzzy matching per Nice class, confirmed by independent sources." No competitor at this price point does this.

**2b — Distribution (Month 4–6)**

| Task | Purpose |
|---|---|
| SEO content engine (15–20 articles) | Organic traffic — now credible to claim "real trademark research" |
| Live WHOIS integration | Replace "inferred" domain status with confirmed |
| Shareable report links (public URL) | Founders share → backlinks → SEO |
| Email capture on results page | "Notify me if domain becomes available" |
| Testimonial wall on landing page | Social proof for conversion |

**Goal:** Signa + fallbacks live by end of Month 3. 500+ monthly organic visitors, 25+ reports/month, first affiliate revenue by Month 6.

---

### Phase 3 · Month 7–12 · Make it a platform

| Task | Purpose |
|---|---|
| Signa coverage expansion (UK, China, Japan, Canada) | As Signa rolls out new offices, activate them — no new integration work needed |
| Trademark filing partner integration | In-product filing via Trademark Engine / Corsearch |
| Agency / Pro tier ($49/mo, 10 reports) | Targets consultants and accelerators |
| Brand brief export | Voice, competitor landscape, naming rationale |
| API access | B2B integrations, developer use cases |

**Goal:** $2k–5k monthly revenue, first recurring subscription customers, one partnership signed.

---

## 11. 12-Month Revenue Model

Assumptions: 2% conversion free → paid, $19/report, growing traffic.

| Month | Monthly visitors | Reports sold | Monthly revenue |
|---|---|---|---|
| 1–2 (launch) | 200–500 | 5–15 | ~$285 |
| 3–6 (SEO ramp) | 500–2,000 | 15–60 | ~$855 |
| 7–12 (compound) | 2,000–5,000 | 60–150 | ~$2,850 |

This is conservative. A single HN front-page moment or viral tweet can 10× a month. Affiliate revenue adds 20–40% on top at scale.
