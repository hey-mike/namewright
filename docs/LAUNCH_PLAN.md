# Namewright — Day-1 Launch Plan

**Status:** Draft — pending public sample report dependency (see §4)
**Date:** 2026-04-25
**Owner:** Michael (solo founder)
**Closes:** PRD §10 Q3 ("First-traffic plan — launch gate")
**Scope:** First 7 days post-launch. Not a marketing strategy. Not a content calendar. Just enough to put the product in front of ~100 strangers on Day 1, measure what happens, and decide what to do on Day 2.

This plan is honest about uncertainty. The conversion ranges are taken straight from PRD §8 (cold SEO 1–3%, IndieHackers/PH 3–8%, warm 8–15%, intent search 5–12%) — they are illustrative, not benchmarks. Re-baseline after the first 100 visits per channel before declaring success or failure.

---

## 1. Day-1 target

Concrete numbers. If we miss these by >40% we run channel diagnosis (see §6); if we miss by <40% we treat it as noise and continue.

| Metric                            | Day-1 target                          | Day-7 target | Source               |
| --------------------------------- | ------------------------------------- | ------------ | -------------------- |
| Unique landing visitors           | **≥100**                              | ≥400         | Vercel Web Analytics |
| Free-preview generations          | **≥15** (15% of visitors)             | ≥60          | KV report count      |
| Paid conversions                  | **3–8** (3–8% of preview generations) | 12–30        | Stripe               |
| Email-me-a-copy opt-ins           | ~50% of paid                          | ~50% of paid | Resend logs          |
| Refund requests                   | 0                                     | ≤1           | Stripe               |
| Customer-reported missed-conflict | 0                                     | 0            | Email inbox          |

**Why these specifically:**

- 100 visitors is the smallest number where channel-conversion data starts being directional (not statistically significant — directional). Below 100 you're reading noise.
- 15% preview-conversion assumes the headline + sample report do their job; if it's <8% the landing copy or the sample is the problem, not the channels.
- 3–8 paid is the IndieHackers/Show-HN range applied to ~60 previews (i.e. 5–13% of previews convert). Honest range, not a single point estimate.
- Zero refunds and zero missed-conflict reports on Day 1 is the actually-load-bearing target. The disclaimer + sample report exist to keep both at zero. If either fires, stop scaling and triage.

**What "miss" means:**

- <60 visitors → channel rejection or post never landed. Diagnose before posting more.
- 60–100 visitors, 0 paid → conversion problem, not a traffic problem. Look at the funnel, not the channels.
- ≥100 visitors, 0 paid → product or pricing problem. Don't add channels; fix the funnel.

---

## 2. Channel plan

Four channels for Day 1. Product Hunt is deliberately Week 2 — the prep overhead (hunter, gallery assets, hunter coordination, scheduling for a US-AM slot from Australia) is real and premature when we don't yet have a single paying customer. PH off a cold start is also a high-variance bet; better to land it after Day-1 social proof exists.

### Channel 1 — Indie Hackers "Show IH" post

- **Why fit:** Direct ICP match. Indie Hackers is technical-solo-founder-by-default; the audience already pays for one-shot $19 SaaS tools and recognizes the 4-tab-shuffle pain firsthand. Permits self-promotion if framed as a build/launch story.
- **Effort:** 30 min to publish (draft already written below — §3.1).
- **Expected reach:** 200–600 unique landing visits over 48h if it lands on the milestones page; 50–150 if it doesn't. Honest range: I can't predict which.
- **Expected conversion:** 3–8% preview→paid (PRD §8 IH/PH range). On the low end of that range because IH skews toward "I'd build this myself" lurkers.
- **Risk:** Post buried in milestones feed within 6h of posting if the audience doesn't engage. Mitigation: post Tuesday or Wednesday US-morning (best engagement window), respond to every comment in the first 4h.

### Channel 2 — Hacker News "Show HN"

- **Why fit:** ICP overlap is partial — HN is broader than indie-hackers, includes a lot of FAANG engineers who don't start companies. But the _technical solo founders_ subset of HN is exactly our ICP, and a Show HN that gains traction (>30 points) puts us in front of 5K–20K technical readers.
- **Effort:** 20 min to publish. Title is load-bearing — see §3.2.
- **Expected reach:** Bimodal — either ≤200 visits (post drowns within an hour) or 2K–8K visits (lands on /show top-10 for a few hours). I have no signal to predict which. Plan for the low end; bank the high end as upside.
- **Expected conversion:** 1–3% (cold SEO range from PRD §8) — HN traffic is curiosity-driven, not intent-driven. Many readers click out of curiosity, never pay.
- **Risk:** HN audience is harsh on (a) hype words ("AI-powered", "revolutionary"), (b) products that overclaim, (c) products that underdeliver vs the title. Mitigation: title and post body are deliberately understated — see §3.2. Be ready for "why not just use ChatGPT" comments and answer with concrete pipeline detail (Signa + EUIPO + DNS + RDAP + WhoisJSON cross-checking, not just generation).

### Channel 3 — Twitter/X thread

- **Why fit:** Founder's existing follower graph (warm-ish — assumes ≥200 followers, mostly technical). Threads with a screenshot of a real artifact reliably outperform link-only tweets. The 4-tab shuffle pain is highly relatable to anyone who has ever picked a name.
- **Effort:** 45 min to draft + screenshot the sample report (1 hr total if sample report isn't live — see §4 dependency).
- **Expected reach:** 100–500 impressions if no virality, 2K–20K if a single mid-tier account quote-tweets. Plan for 100–500 visits worth ~30–80 click-throughs.
- **Expected conversion:** 8–15% (warm range, PRD §8) — followers trust the source. Caveat: a single low-trust quote-tweet from someone outside the network drops this back to cold rates fast.
- **Risk:** Twitter algorithm deprioritizes link-bearing threads. Mitigation: link only in the final tweet of the thread, screenshot in tweet 3 or 4, use plain text for hooks.

### Channel 4 — Reddit (r/SideProject only on Day 1)

- **Why fit:** r/SideProject is the one major naming-relevant subreddit with explicit pro-promotion norms. r/Entrepreneur and r/SaaS are anti-promotion or mod-strict; r/IndieHackers is low-volume and largely redirects to indiehackers.com itself. Restricting Day 1 to r/SideProject avoids the time-sink of crafting different posts for hostile subreddits.
- **Effort:** 15 min (reuse abridged IH post body).
- **Expected reach:** 50–300 visits over 48h.
- **Expected conversion:** 1–3% (cold SEO range — Reddit traffic is curiosity-heavy).
- **Risk:** Mod removes for "advertising" despite the sub's stated norms. Mitigation: framing as "I built this — here's what it does and what's hard, would love feedback" rather than a sales post.

### Channel 5 — Personal network (2 venues)

- **Why fit:** Highest conversion possible because it's warm, but smallest reach. Examples (founder fills in actual venues):
  - **Venue A:** A founder Slack or Discord the founder is already in (e.g. an indie-hackers Discord, an AI-builders Slack, an alumni founders group).
  - **Venue B:** A second venue of the same kind, or a personal email to ~20 founder friends.
- **Effort:** 30 min total — short personal note per venue, no copy-paste of the IH post (those communities are sensitive to broadcast).
- **Expected reach:** 20–80 visits, but high engagement quality.
- **Expected conversion:** 8–15% (warm range, PRD §8).
- **Risk:** Posting in a community where the founder hasn't recently contributed reads as opportunistic. Mitigation: only post in venues where the founder has been an active participant in the last 90 days. If neither qualifies, skip — better than burning relationships.

### Channel summary

| #   | Channel              | Effort (hr) | Reach (visits, low–high)        | Conv range | Day-1 paid (low–high) |
| --- | -------------------- | ----------- | ------------------------------- | ---------- | --------------------- |
| 1   | Indie Hackers        | 0.5         | 50–600                          | 3–8%       | 0–4                   |
| 2   | Hacker News Show HN  | 0.3         | 200–8000                        | 1–3%       | 0–24 (high tail)      |
| 3   | Twitter thread       | 0.75        | 30–500                          | 8–15%      | 0–7                   |
| 4   | Reddit r/SideProject | 0.25        | 50–300                          | 1–3%       | 0–2                   |
| 5   | Personal network ×2  | 0.5         | 20–80                           | 8–15%      | 0–2                   |
|     | **Total**            | **2.3 hr**  | **~350–9500 (modal: ~400–800)** |            | **3–8 (modal)**       |

The modal estimate (~400–800 visits, 3–8 paid) is what I'd actually bet on. The high tail is real but you can't plan for HN front-page; you treat it as upside. The low tail (~350 total visits, 0 paid) is the failure mode that triggers §6 diagnosis.

I'm guessing on most of these reach numbers. I have not personally posted on IH, HN, or r/SideProject before, so the variance is wide. Treat Day 1 as a calibration round.

---

## 3. Post drafts

These are real drafts, not outlines. Edit for voice before posting; do not edit for "more punchy" — the boring version is the safer version.

### 3.1 Indie Hackers "Show IH" post

**Title:** Namewright — preliminary trademark + domain screening for $19, before you incorporate

**Body:**

> Hi IH,
>
> Built this because I kept doing the same thing every time I picked a name for a side project: ChatGPT for ideas, Google to sanity-check, USPTO TESS for trademarks, WHOIS for domains across `.com` / `.io` / `.ai`. The output of each tab feeds the next. The whole shuffle takes 90 minutes and the data still disagrees with itself — ChatGPT invents trademarked names, USPTO misses phonetic conflicts, WHOIS results vary by registrar.
>
> So I built **Namewright** — submit a brief (description, personality, geography, TLD preferences), get 8–12 ranked name candidates with preliminary trademark screening (Signa for USPTO/EUIPO/WIPO, plus optional EUIPO direct cross-check) and domain availability cross-checked across DNS + RDAP + WhoisJSON. Three TLDs per candidate. Top 3 picks called out with reasoning. Under 90 seconds.
>
> Important caveat front and centre: this is **preliminary screening, not legal clearance**. A real trademark application still needs an attorney. Namewright shortens what you hand them — it doesn't replace them.
>
> What's in the report:
>
> - 8–12 candidates with style classification, rationale, and trademark notes
> - Per-TLD domain status with source-by-source attribution (so you know whether a "taken" answer is from one source or three)
> - Best / Safest / Boldest top-3 framing
> - 3–5 rejected names with one-line reasons (so you see what got filtered)
> - PDF export, email-me-a-copy at paywall (24h KV TTL, so the email is the durable artifact)
>
> Sample report (full paid-tier render with a fictional brief): **[link to /sample]**
>
> $19 launch price, one-shot, no account, no subscription. Stripe Checkout. Paying once because solo founders pre-incorporation are one-shot users — subscription assumes repeat use that doesn't happen at this scale.
>
> Stack: Next.js 16 (App Router), Anthropic for the naming + synthesis, Signa for the trademark layer, three-source DNS aggregation, Vercel KV, Resend. Deployed on Vercel.
>
> Would love feedback — especially on the report itself. The honest question I want to test: does this give you at least one name you'd seriously consider? If yes I'm on track; if no, I want to know why.
>
> [link to namewright.co]

(~340 words. Founder voice. No emoji. No "revolutionary". Discloses the limits of the tool in the second paragraph instead of burying them.)

### 3.2 Hacker News "Show HN" post

**Title (≤80 chars):**

> Show HN: Namewright – preliminary trademark + domain screening for $19

(74 chars. No "AI-powered". No "rethinking". No em dash — HN strips them visually anyway. The word "preliminary" is doing real work — it lowers expectations to where the product lives.)

**Body (2–3 sentences):**

> A naming tool for indie founders pre-incorporation. Submit a brief, get 8–12 ranked candidates with preliminary trademark screening (Signa for USPTO/EUIPO/WIPO + optional EUIPO direct) and domain availability cross-checked across DNS, RDAP, and WhoisJSON. Explicitly preliminary screening, not legal clearance — a real trademark application still needs an attorney. Sample report: [link to /sample]. Happy to answer questions about the pipeline, the cross-source aggregation, or why I'm charging $19 instead of running a subscription.

(80 words. Names the inputs and the outputs. States the limitation upfront. Offers technical detail proactively because the HN audience will ask about pipeline architecture either way.)

### 3.3 Twitter thread (6 tweets)

> **[1/6]** Picking a brand name as a solo founder means doing the same 4-tab shuffle every time:
>
> ChatGPT → Google → USPTO TESS → WHOIS across .com, .io, .ai
>
> Each tab feeds the next. 90 minutes per cycle. The data disagrees with itself.
>
> I got tired of it.

> **[2/6]** ChatGPT invents names that are already trademarked.
>
> USPTO TESS misses phonetic conflicts ("Klarity" vs "Clarity").
>
> WHOIS results disagree across registrars depending on whose cache you hit.
>
> The 4-tab shuffle is unreliable, and there's no way to tell which tab is wrong.

> **[3/6]** So I built Namewright.
>
> Submit a brief. Get 8–12 ranked name candidates with:
> – preliminary trademark screening (Signa: USPTO + EUIPO + WIPO)
> – domain availability cross-checked across 3 sources (DNS + RDAP + WhoisJSON)
> – per-TLD status, not just .com
> – under 90 seconds

> **[4/6]** [SCREENSHOT: sample report — Best/Safest/Boldest top-3 framing with cross-source domain status visible]
>
> Important: this is preliminary screening, not legal clearance. A real trademark application still needs an attorney. Namewright shortens what you hand them.

> **[5/6]** $19 one-shot. No account, no subscription.
>
> Solo founders pre-incorporation are usually one-shot users — subscription assumes repeat use that doesn't happen.
>
> Sample report (full paid-tier render): [link to /sample]

> **[6/6]** Live now: namewright.co
>
> The honest question I'd love your help testing: does the report give you at least one name you'd seriously consider for a real project?
>
> If yes I'm on track. If no, please tell me why — that's the signal I need.
>
> [link to namewright.co]

(All ≤280 chars. Hook is the pain (4-tab shuffle), middle reveals the product + sample, close asks for the killer-metric signal directly. Screenshot placeholder is in tweet 4.)

---

## 4. Pre-launch checklist

Verify before posting. Order is rough — the dependencies up top block the posts; the rest are landing-page hygiene.

| #   | Item                                                                                                                                                  | Status                                                 | Blocking?                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------ |
| 1   | **Public sample report at /sample (or /example)**                                                                                                     | **Not started** — separate work item, dependency       | **YES — blocks launch**  |
| 2   | Disclaimer ≥14px, above the fold or adjacent to primary CTA                                                                                           | Pending (PRD §8 launch gate, see §9)                   | **YES**                  |
| 3   | Stripe live mode keys in Vercel prod env                                                                                                              | Verify                                                 | **YES**                  |
| 4   | Stripe webhook endpoint registered for prod URL with prod signing secret                                                                              | Verify                                                 | **YES**                  |
| 5   | Refund policy linked from landing footer                                                                                                              | Depends on `docs/REFUND_POLICY.md` (PRD §10 Q2 — open) | **YES**                  |
| 6   | Plain-English contact email working: support@namewright.co                                                                                            | Verify mail forward + can-reply test                   | **YES**                  |
| 7   | Terms of Service + Privacy Policy linked from footer                                                                                                  | Verify                                                 | **YES**                  |
| 8   | Vercel Web Analytics on, events firing                                                                                                                | Verify on staging                                      | No (already shipped)     |
| 9   | `/api/health` returns `{ status: "ok", missingRequired: [] }`                                                                                         | Run before posting                                     | **YES**                  |
| 10  | Domain pointed at production (namewright.co A/CNAME → Vercel)                                                                                         | Verify with `dig`/`curl`                               | **YES**                  |
| 11  | Slack alert webhook configured (`SLACK_ALERT_WEBHOOK_URL`) so signature failures, KV save failures, Anthropic credit issues actually wake the founder | Verify alert fires on a forced failure                 | No, but recommended      |
| 12  | Sentry DSN set if using                                                                                                                               | Verify                                                 | No                       |
| 13  | Sample report screenshot saved as PNG ≤2MB for the Twitter thread                                                                                     | Pending — depends on #1                                | **YES for Twitter only** |

**Two true launch-blockers:**

- **Item #1 (public sample report)** — Twitter thread literally references a sample screenshot; IH/HN posts include the link in the body. Without /sample, the funnel is "trust the founder's writeup; pay $19 sight unseen", which converts dramatically worse than "see exactly what you're buying for $19". This is the single highest-leverage pre-launch task left.
- **Item #5 (refund policy + `docs/REFUND_POLICY.md`)** — the linked footer artifact has to exist. Stub may be acceptable if it states the criteria + handling SOP clearly; full polish can wait.

I'd estimate ~6–10 hr of work to clear both. Don't post until they're done.

---

## 5. Post-launch monitoring (first 48h)

What to watch for, in priority order. The list is short on purpose — the goal is to read signal, not drown in dashboards.

### 5.1 Per-channel conversion (re-baseline only)

For each channel that crosses 100 visits, compute: `paid / preview_generations` and `preview_generations / unique_visitors`. Compare to PRD §8 ranges. **Do not celebrate or panic until each channel has ≥100 visits — anything below that is noise.**

- IH visits, IH previews, IH paid
- HN visits, HN previews, HN paid
- Twitter visits, Twitter previews, Twitter paid
- Reddit visits, Reddit previews, Reddit paid
- Personal-network visits, previews, paid

Tracking: rely on Vercel Web Analytics referrer attribution for visits. For paid attribution, eyeball the timing — Stripe payments within 60 min of a channel's posting can be reasonably attributed to it for the first 48h (after that, attribution decays).

### 5.2 Refund rate

Target: **0 in first 48h, ≤1 in first week.** A single refund within 24h of launch is a strong signal — read the customer's reason carefully. Common reasons and their meanings:

- "I could have Googled this" → pricing/positioning gap (PRD §9 Assumption 3 falsifying)
- "Names weren't usable for my brief" → prompt or pipeline issue
- "I didn't realize this wasn't legal clearance" → disclaimer prominence failed despite the launch-gate work; emergency-elevate placement

### 5.3 Customer-reported missed-conflict (load-bearing risk)

Watch `support@namewright.co` and Stripe dispute notifications. **Even one missed-conflict report in week 1 is a red flag** — it's the falsifying signal for PRD §9 Risks bullet 3 ("missed conflict leading to a real trademark dispute"). Triage:

1. Verify the claim — does the trademark actually exist on USPTO/EUIPO?
2. If yes — refund immediately, log the failure mode, prioritize a prompt/pipeline fix above all else.
3. If no — respond with cited sources, no refund needed.

The disclaimer protects against the legal escalation. It does not protect against reputation damage. The single most important thing in the first 48h is to handle any missed-conflict claim within 4 hours.

### 5.4 Cost per paid report

Target from PRD §8: **<$0.50 (excl. Stripe), <$2.00 (incl.)**. `cost.ts` telemetry logs per Anthropic call; sum across paid sessions. If costs creep above $0.75 within first 20 reports, investigate prompt token bloat or pipeline retry storms before scaling traffic.

### 5.5 Decision-usefulness rate (the killer metric)

If the post-report survey is wired (PRD §8: _"Did this report give you at least one name you'd seriously consider?"_), this is the metric that decides whether the wedge actually works. Target ≥50% "yes". Below 30% means the report is generating names but not _useful_ names, which is a prompt/pipeline problem more important than any traffic problem.

If the survey is **not** wired by Day 1, ship it within Week 1. It's the one piece of telemetry that distinguishes "users came and didn't buy" from "users came, bought, but didn't get value" — the second is a much bigger problem and you cannot tell them apart without the survey.

---

## 6. Week-2 plan stub

Three forks based on Day-1 signal. Pick the relevant one on Day 2 morning.

**Fork A — Day 1 hits target (≥3 paid, ≥100 visits, 0 missed-conflict reports):**
Begin Product Hunt prep for a Week-2 launch. Estimated overhead: 6–10 hr (gallery assets, hunter outreach, scheduling for US-AM Tuesday or Wednesday, pre-launch teaser on X, "Coming Soon" page). Ride the IH/HN comments through the week; respond to every comment within 12 hours. Don't add new channels — depth on the channels that worked beats breadth across channels that haven't been tested. Roll the post-report decision-usefulness survey if it isn't already wired.

**Fork B — Day 1 misses target (<3 paid OR <60 visits):**
Run channel diagnosis before posting anywhere new. Specifically, look at: did the IH post get traction (votes/comments) but no clicks → headline/landing mismatch; did it get clicks but no previews → landing copy or sample report problem; did it get previews but no payments → pricing or paywall friction. Don't blame the channel until the funnel is ruled out. Re-post is generally a bad idea (rule-of-thumb: IH and HN don't reward repost attempts), so iterate on the landing/sample/pricing first, then attempt new channels (HN if not already, lobste.rs, a relevant subreddit other than r/SideProject). Defer Product Hunt by 2+ weeks.

**Fork C — A missed-conflict refund or dispute arrives (any volume):**
This is the load-bearing risk from PRD §9. Process per `docs/REFUND_POLICY.md` (**dependency: doc not yet written — flagged in §4 item #5**). Until that doc exists, the SOP is: refund within 4h, gather full detail of the claim (mark name, USPTO/EUIPO registration number, the exact candidate Namewright surfaced as clear), reproduce the report, identify whether Signa missed it or the synthesizer dropped it, file a Sentry/log issue, prioritize the fix above all roadmap work. Pause new channel posts until the failure mode is understood.

---

## 7. Open / honest uncertainties

Where I'm guessing and the reader should know it.

- **Reach numbers in §2** — I have not personally posted on IH, HN, or r/SideProject before. The high tail (HN front-page) and low tail (post buried within 1h) are both real and I have no signal to predict the distribution. Treat Day 1 as a calibration round more than a revenue event.
- **PH timing** — "Week 2" is opinionated, not optimal. Some founders argue same-day PH + IH gives a halo. I'm choosing to defer because PH prep is real overhead and I want one channel's signal at a time.
- **Personal network venues** — listed as placeholders. If the founder has no genuine venue where they've contributed in the last 90 days, drop Channel 5 entirely rather than burn a relationship.
- **Conversion ranges from PRD §8** — labelled "illustrative, not benchmarks" in the PRD itself. Treat the same way here. The point of Day 1 is to _replace_ these with real data.
- **Refund-policy SOP referenced in §6 Fork C** — `docs/REFUND_POLICY.md` does not exist yet. Drafting it is a separate pre-launch task; this plan flags the dependency but does not create the doc.

---

## 8. One-page summary (for the founder to glance at on launch morning)

- **Day-1 target:** ≥100 visits, ≥15 previews, 3–8 paid, 0 refunds, 0 missed-conflict reports.
- **Channels (in posting order):** IH "Show IH" → Twitter thread → HN "Show HN" → Reddit r/SideProject → personal network (2 venues). Stagger by 2–4 hours so each channel has air to breathe.
- **Posting day:** Tuesday or Wednesday US-morning (best engagement window).
- **Posts:** drafted in §3. Edit for voice; do not edit for hype.
- **Pre-launch blockers:** public sample report at /sample (§4 #1), refund policy linked from footer (§4 #5), disclaimer ≥14px on landing (§4 #2). Estimated 6–10 hr total.
- **Watch for in 48h, in priority order:** missed-conflict reports (any → emergency); refund rate (>1 → diagnose); per-channel funnel (only after each channel hits 100 visits); decision-usefulness rate (if survey wired); cost per paid report.
- **Day-2 fork:** Hits target → start PH prep. Misses target → channel/funnel diagnosis. Missed-conflict report → refund SOP, pause channels, fix.

End of plan.
