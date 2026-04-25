# Refund Standard Operating Procedure (Internal)

**Status:** Draft — founder-approved, not counsel-reviewed
**Owner:** Michael Luo (founder)
**Created:** 2026-04-25
**Last revised:** 2026-04-25

This is the operational playbook for handling refund requests on Namewright's $19 single-use brand-naming report. It is internal. The customer-facing one-liner ("7-day refund — email support@namewright.co") is shipped in `src/components/FreePreview.tsx` and is the only public commitment we make.

This SOP is written for a founder + small team handling refunds manually via the Stripe dashboard at expected pre-launch volume (<50 paid reports/month). It is not litigation-defensive. It optimizes for low-friction handling and for capturing the data we need to improve the product.

---

## 1. Policy summary

A customer can request a refund within 7 days of purchase for any reason. We default to refunding without argument. The dollar value ($19) is below the cost of disputing in good faith — the right business move is to refund, log the case, and learn from it. We refuse only when the request is outside the window or shows a clear abuse pattern.

The load-bearing case we are designed for: a customer paid $19, picked a name we marked low-risk, and later discovered a real-world trademark conflict that our sources didn't surface. We refund unconditionally, document the case, and feed it into prompt and source-coverage tuning.

---

## 2. Refund criteria

Four categories. Default to the first one that matches.

### 2.1 Auto-refund — any reason (within 7 days)

**Trigger:** customer emails within 7 days of the Stripe charge timestamp asking for a refund. Reason can be "didn't like the names," "found something better elsewhere," "changed direction," or anything else — including no reason given.

**Action:** Refund in full. Reply with the acknowledgment template (§5.1). Log per §6.

**Do not:** ask why, ask them to justify, suggest alternatives, or try to save the sale. The economics don't support it and the friction damages reputation.

### 2.2 Auto-refund — technical failure

**Trigger:** any of the following, regardless of timing:

- Report failed to render (500, hung generation, blank `/results` page)
- KV TTL expired before the customer accessed the report (24h window elapsed before they clicked through)
- Stripe charged but no report was generated (webhook race, auth flow bug)
- Report was generated but content is structurally broken (missing candidates, malformed JSON we caught in logs, etc.)

**Action:** Refund in full. Reply with the acknowledgment template (§5.1) plus a one-line apology for the technical issue. Log per §6 with `category=technical` and the report ID + relevant logs / Sentry link. Investigate the underlying cause within 48 hours — technical failures are bugs, not policy events.

**Do not:** apply the 7-day window here. If we charged and didn't deliver, the customer gets refunded whenever they notice.

### 2.3 Investigated — missed-conflict claim

**Trigger:** customer claims a name we marked low-risk conflicts with a real-world mark they later discovered. This is the load-bearing scenario from PRD §9. See §4 below for the full procedure.

**Action:** Refund in full immediately. Investigate after, not before. Send the investigation-request template (§5.2) asking for the conflicting mark and jurisdiction so we can capture the case for tuning.

### 2.4 Refused

**Trigger:** any of the following:

- Request is more than 7 days after the Stripe charge timestamp, AND it is not a technical failure (§2.2), AND it is not a missed-conflict claim (§2.3 — those we honor regardless of timing)
- Customer has previously had a paid report refunded in full and is requesting a refund on a second purchase made after the first refund (abuse pattern: serial refund-to-extract-free-reports)
- Same customer email or payment method has 3+ refunds across any number of purchases
- Customer is hostile, threatening, or otherwise making the interaction unsafe — refuse, do not engage further, escalate if needed

**Action:** Reply with the refusal template (§5.3). Log per §6 with `category=refused` and the reason. Do not refund.

**Note:** "outside the 7-day window" is the only routine refusal. The abuse patterns above are rare; expect <1% of requests in the first year. If in doubt, refund and log it — the case data is worth more than $19.

---

## 3. Decision flow

When a refund email arrives in `support@namewright.co`:

1. **Find the Stripe charge.** Search Stripe dashboard by customer email. Note the charge timestamp and report ID (in checkout session metadata).
2. **Check the window.** Is the request within 7 days of the charge timestamp? If yes → continue to step 3. If no → check if it's a technical failure (§2.2) or missed-conflict claim (§2.3); if neither, go to refusal (step 6).
3. **Check for abuse patterns.** Search the refund log for prior refunds on this email or payment method. If 3+ prior refunds or a serial-refund pattern → refusal (step 6). Otherwise continue.
4. **Categorize.** Is this a missed-conflict claim? → §4. Is this a technical failure? → §2.2. Otherwise → §2.1 (any-reason refund).
5. **Refund.** In Stripe dashboard, find the charge → "Refund" → full amount → reason "requested by customer." Reply with the matching template (§5.1 or §5.2). Log per §6.
6. **Refuse.** Reply with the refusal template (§5.3). Log per §6.

**Default rule:** when in doubt, refund. The cost of a wrong refusal (a public complaint, a chargeback, a damaged reputation) is much higher than the cost of a wrong refund ($19). Refunds are recoverable; trust is not.

---

## 4. The missed-conflict scenario

This is the case the SOP exists for. From PRD §9: a customer paid $19, the report flagged a candidate as low-risk, the customer registered or invested in that name, and later discovered a real-world trademark conflict our sources missed.

### 4.1 Refund unconditionally

Refund in full, immediately, on first contact. Do not argue the merits. Do not reference the disclaimer ("preliminary screening, not legal clearance" — `FullReport.tsx` lines 140–151). Do not ask for proof before refunding. The disclaimer protects us at the policy level; arguing it case-by-case to a $19 customer creates exposure and reputational damage with zero upside.

### 4.2 Document the case

After refunding, send the investigation-request template (§5.2). We want, in this order of priority:

1. The conflicting mark text and registration number (USPTO, EUIPO, WIPO, or other registry)
2. The jurisdiction the customer is concerned about
3. The candidate name from our report and what risk level we assigned
4. How the customer found the conflict (Google, lawyer, opposition letter, registry search)

Capture this in the refund log (§6) with `category=missed_conflict`. If the customer doesn't respond, that's fine — we still refunded, and the case is logged with whatever we have.

### 4.3 Pattern threshold

If we accumulate **more than 3 missed-conflict cases in any rolling quarter**:

1. Audit the cases for a common cause (specific TLD class, specific industry, specific source we don't query, specific risk threshold that's too lenient)
2. Revisit disclaimer prominence in `FullReport.tsx` and `FreePreview.tsx` — the PRD §9 launch gate is "disclaimer prominence," and pattern data is the trigger for tightening it
3. Consider raising source coverage (e.g., adding a registry, lowering the low-risk threshold, expanding USPTO class coverage)
4. If the pattern points at a specific guardrail in `src/lib/anthropic.ts`, add a regression test in `src/__tests__/lib/anthropic.test.ts`

The threshold is deliberately concrete. Below it, individual cases are noise; above it, they are signal.

### 4.4 Correspondence rules

In writing — email, social, anywhere a screenshot survives — never admit fault. Specifically:

- Use: "the report didn't catch this conflict," "our sources didn't include this mark," "preliminary screening has limits"
- Avoid: "we made a mistake," "we got it wrong," "our tool failed," "you were right to expect more," "we missed it" (subject ambiguity)

This is not about denying responsibility. It is about not creating a written admission that could be used in a small-claims or chargeback context. The refund itself is the remedy. The phrasing protects against escalation.

---

## 5. Communication templates

Keep these short. Edit lightly per case but do not rewrite.

### 5.1 Acknowledgment + refund (any-reason or technical)

```
Subject: Re: refund — Namewright

Hi [name],

Refunded in full to the original payment method. It should appear on your statement within 5–10 business days, depending on your bank.

[Optional one line for technical failures: "Sorry about the [issue] — we've logged it and are looking into it."]

Thanks for trying Namewright.

— Michael
```

### 5.2 Acknowledgment + investigation request (missed-conflict)

```
Subject: Re: refund — Namewright

Hi [name],

Refunded in full. It should appear on your statement within 5–10 business days.

To help us tune the report for future customers, would you mind sharing:

1. The conflicting mark (text + registration number if you have it)
2. The jurisdiction (US, EU, UK, AU, etc.)
3. How you found the conflict — Google, attorney, registry search, opposition letter, something else

The report does preliminary screening, not legal clearance, but cases the report didn't catch are exactly what we use to improve coverage. No pressure to reply — the refund stands either way.

Thanks,
Michael
```

### 5.3 Refusal (out-of-window or abuse)

```
Subject: Re: refund — Namewright

Hi [name],

Our refund window is 7 days from purchase, per the policy linked from the paywall and stated in the report disclaimer. Your purchase was on [date], which puts this request outside the window, so I'm not able to process a refund here.

If the report had a technical issue (failed to load, missing content) or if you've found a real trademark conflict the report didn't catch, let me know — those cases are handled separately.

Thanks,
Michael
```

For abuse-pattern refusals, replace the middle paragraph with:

```
We've issued multiple refunds on prior purchases under this email, so we're not able to process additional refund requests on this account.
```

Keep the tone polite and brief. Do not link to a "TOS" page unless one exists at the time of writing. (As of 2026-04-25, there is no separate TOS page — the disclaimer in `FullReport.tsx` and the paywall copy are the customer-facing terms. Founder TBD whether to publish a standalone TOS before launch.)

---

## 6. Internal logging

Every refund request — granted or refused — gets one row in the refund log. A Notion database or a Google Sheet is fine. Do not build a CRM.

### 6.1 Required columns

| Column             | Notes                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `date`             | Date the request arrived (not the refund date)                                                                                                                        |
| `customer_email`   | The address that emailed support                                                                                                                                      |
| `report_id`        | KV report ID from the Stripe checkout session metadata                                                                                                                |
| `stripe_charge_id` | `ch_...` — for reconciling against Stripe later                                                                                                                       |
| `category`         | `any_reason`, `technical`, `missed_conflict`, `refused_window`, `refused_abuse`                                                                                       |
| `outcome`          | `refunded` or `refused`                                                                                                                                               |
| `notes`            | Free text — for `missed_conflict`, capture the conflict mark, jurisdiction, and how the customer found it. For `technical`, capture the symptom + Sentry link if any. |

### 6.2 Cadence

Log immediately when handling the request — do not batch. The whole point is that future-self can answer "have we seen this email before?" in under 30 seconds.

### 6.3 Privacy

Do not log payment-method details, full names beyond what was provided, or any content from the customer's email beyond what's needed for the columns above. The log is operational, not a customer database.

---

## 7. Triggers to revisit this SOP

Concrete numbers, not vibes. Revisit when any of these fire:

- **Refund rate >5%** in any rolling 4-week window (refunds / paid reports). Above 5% means either pricing, expectations, or product quality is off — the SOP is not the fix, but it's a signal that the policy assumptions need revisiting.
- **Missed-conflict cases >3** in any rolling quarter. See §4.3 — this is the trigger for tightening disclaimer prominence and/or expanding source coverage.
- **Total refunds >$200/month.** ~10 refunds at $19. Below this, manual handling is fine. Above this, consider partial automation (canned-response macros, refund log tooling) before SOP changes.
- **Any chargeback.** A chargeback (vs. a refund) is a different beast — Stripe will deduct the disputed amount plus a fee, and we have to respond with evidence. If one arrives, escalate to founder immediately and document separately. We have not seen one yet (as of 2026-04-25).
- **Counsel engagement decision changes.** Per PRD §10 Q1, formal counsel review is currently deferred. If that changes, this SOP must be reviewed against whatever framework counsel produces — specifically §4.4 ("never admit fault") and §5 (templates) are the most likely to need rewrites.

---

## 8. Open items for founder review

These are decisions baked into this draft that the founder should explicitly accept or override before treating this as the working SOP:

- **TBD: standalone TOS page.** §5.3 references "our terms" but no standalone TOS page exists. Either publish a TOS before launch (preferred) or rewrite §5.3 to reference the in-product disclaimer and paywall copy directly.
- **TBD: refund log location.** §6 says "Notion or Sheet" without picking one. Pick one and link it here once chosen.
- **TBD: chargeback playbook.** §7 mentions chargebacks but does not document a response procedure. Defer until the first one arrives — drafting a chargeback playbook in advance is over-engineering at current volume.
- **Decision to confirm: 7-day window starts from charge timestamp, not from report-access timestamp.** Charge timestamp is simpler and matches the public copy. Some customers may not access the report until day 8+ if they forgot — they would still be inside the window per Stripe but outside per access. This SOP uses charge timestamp; if that produces unfair outcomes, switch to "later of charge or first access" and update the public copy.
- **Decision to confirm: no minimum-engagement requirement.** A customer who never opened the report and emails on day 6 still gets the auto-refund. Not gating on engagement keeps the policy simple and avoids creating a perverse incentive for us to under-deliver in the report itself.

---

_This SOP is a working document. Edit it directly when handling cases reveals gaps — don't accumulate "we should update the SOP" as a backlog item. Bump "Last revised" on every change._
