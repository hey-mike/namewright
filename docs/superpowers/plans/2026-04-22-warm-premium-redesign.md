# Warm Premium Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retheme Namewright from cool-toned minimal to Warm Premium — ivory backgrounds, amber accent, Source Serif 4 display font, Lato body, DM Mono labels.

**Architecture:** Pure CSS and markup changes across 6 files. No logic, no new components, no layout restructuring. Color tokens flow from `globals.css` to all consumers automatically; font sizes and markup changes are applied per-component.

**Tech Stack:** Next.js App Router, Tailwind CSS v4, inline React styles, Google Fonts

---

## File Map

| File                              | What changes                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `src/app/globals.css`             | All color tokens, `.display` / `.mono` / `.chip-active` / `.btn-primary` styles |
| `src/app/layout.tsx`              | Google Fonts link, body inline styles                                           |
| `src/app/page.tsx`                | Wordmark italic style                                                           |
| `src/app/preview/page.tsx`        | Wordmark italic style                                                           |
| `src/app/results/page.tsx`        | Wordmark italic style                                                           |
| `src/components/IntakeForm.tsx`   | h1 markup, chip border-radius                                                   |
| `src/components/CandidateRow.tsx` | Font sizes for name, body, domain labels                                        |
| `src/components/FreePreview.tsx`  | Brief font size, lock icon, paywall copy sizes                                  |
| `src/components/FullReport.tsx`   | Top picks and recommendation font sizes                                         |

---

## Task 1: Color tokens and font classes in globals.css

**Files:**

- Modify: `src/app/globals.css`

This is a pure find-and-replace of token values plus class definitions. No logic, no tests. Verify by opening `http://localhost:3000` and confirming warm ivory background and amber accent throughout.

- [ ] **Step 1: Replace the `:root` block**

In `src/app/globals.css`, replace the entire `:root { ... }` block (lines 6–27) with:

```css
:root {
  --color-bg: oklch(0.993 0.008 80);
  --color-surface: oklch(0.988 0.01 80);
  --color-border: oklch(0.92 0.018 75);
  --color-border-mid: oklch(0.88 0.022 70);
  --color-border-str: oklch(0.84 0.025 68);
  --color-text-1: oklch(0.18 0.028 55);
  --color-text-2: oklch(0.32 0.03 55);
  --color-text-3: oklch(0.5 0.03 60);
  --color-text-4: oklch(0.68 0.028 65);
  --color-accent: oklch(0.58 0.11 55);
  --color-accent-h: oklch(0.52 0.12 55);
  --color-accent-a: oklch(0.47 0.125 55);
  --color-accent-lt: oklch(0.94 0.035 80);
  --color-accent-txt: oklch(0.993 0.004 80);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --color-input-bg: oklch(0.99 0.009 80);
  --color-focus-ring: oklch(0.58 0.11 55 / 0.2);
  --color-success: oklch(0.46 0.095 145);
  --color-warning: oklch(0.52 0.095 65);
  --color-error: oklch(0.44 0.14 25);
}
```

- [ ] **Step 2: Update `.display` class**

Replace:

```css
.display {
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
  font-optical-sizing: auto;
  font-feature-settings: 'ss01';
}
```

With:

```css
.display {
  font-family: 'Source Serif 4', Georgia, serif;
  font-optical-sizing: auto;
}
```

- [ ] **Step 3: Update `.mono` class**

Replace:

```css
.mono {
  font-family: 'Geist', system-ui, sans-serif;
  letter-spacing: 0.02em;
}
```

With:

```css
.mono {
  font-family: 'DM Mono', monospace;
  letter-spacing: 0.02em;
}
```

- [ ] **Step 4: Update `.chip-active` to use amber**

Replace:

```css
.chip-active {
  background-color: var(--color-text-1);
  color: var(--color-bg);
  border-color: var(--color-text-1);
}
```

With:

```css
.chip-active {
  background-color: var(--color-accent);
  color: var(--color-accent-txt);
  border-color: var(--color-accent);
}
```

- [ ] **Step 5: Update `.btn-primary` hover box-shadow to amber**

Replace:

```css
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-accent-h);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px oklch(0.34 0.18 215 / 0.3);
}
```

With:

```css
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-accent-h);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px oklch(0.58 0.11 55 / 0.3);
}
```

- [ ] **Step 6: Verify in browser**

Run: `npm run dev` (already running on port 3000)
Open `http://localhost:3000` — confirm:

- Background is warm ivory (not cool white)
- Accent dot in header is amber gold
- All borders are warm cream tones
- Text reads as warm dark brown, not blue-black

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css
git commit -m "style: warm premium color tokens and font classes"
```

---

## Task 2: Font imports and body baseline in layout.tsx

**Files:**

- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace the Google Fonts `<link>` href**

In `src/app/layout.tsx`, replace the `href` value of the stylesheet link:

Replace:

```tsx
href =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Geist:wght@300;400;500;600&display=swap'
```

With:

```tsx
href =
  'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,300;1,8..60,400;1,8..60,600&family=Lato:wght@300;400;700&family=DM+Mono:wght@400;500&display=swap'
```

- [ ] **Step 2: Update body inline styles**

Replace the `<body>` style prop:

```tsx
style={{
  backgroundColor: 'oklch(0.983 0.004 228)',
  color: 'oklch(0.260 0.012 265)',
  fontFamily: "'Geist', system-ui, sans-serif",
}}
```

With:

```tsx
style={{
  backgroundColor: 'oklch(0.993 0.008 80)',
  color: 'oklch(0.180 0.028 55)',
  fontFamily: "'Lato', system-ui, sans-serif",
  fontWeight: 300,
}}
```

- [ ] **Step 3: Verify fonts load**

Open `http://localhost:3000` — confirm:

- Headlines use a serif font (Source Serif 4), not a sans-serif
- Body text uses Lato (lighter, more humanist than Geist)
- Mono labels (field numbers, tags) use DM Mono

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "style: swap to Source Serif 4 + Lato + DM Mono font stack"
```

---

## Task 3: Wordmark italic styling across page headers

**Files:**

- Modify: `src/app/page.tsx`
- Modify: `src/app/preview/page.tsx`
- Modify: `src/app/results/page.tsx`

The wordmark "Namewright" uses `className="display text-sm font-bold"`. With `.display` now pointing to Source Serif 4, we add `fontStyle: 'italic'` to the inline style. Same change in all three page headers.

- [ ] **Step 1: Update wordmark in `src/app/page.tsx`**

Replace:

```tsx
<span
  className="display text-sm font-bold"
  style={{ letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}
>
  Namewright
</span>
```

With:

```tsx
<span
  className="display text-sm font-semibold"
  style={{ letterSpacing: '-0.01em', color: 'var(--color-text-1)', fontStyle: 'italic' }}
>
  Namewright
</span>
```

- [ ] **Step 2: Update wordmark in `src/app/preview/page.tsx`**

Replace:

```tsx
<span
  className="display text-sm font-bold"
  style={{ letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}
>
  Namewright
</span>
```

With:

```tsx
<span
  className="display text-sm font-semibold"
  style={{ letterSpacing: '-0.01em', color: 'var(--color-text-1)', fontStyle: 'italic' }}
>
  Namewright
</span>
```

- [ ] **Step 3: Update wordmark in `src/app/results/page.tsx`**

Find the same `<span className="display text-sm font-bold" ...>Namewright</span>` pattern and apply the same change as Steps 1 and 2.

- [ ] **Step 4: Verify**

Navigate to `http://localhost:3000`, `/preview`, and `/results` — confirm the wordmark is italic serif on all three pages.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/preview/page.tsx src/app/results/page.tsx
git commit -m "style: italic serif wordmark across all page headers"
```

---

## Task 4: IntakeForm — h1 markup and pill chips

**Files:**

- Modify: `src/components/IntakeForm.tsx`

Two changes: (1) the hero h1 copy gains italic amber "well." (2) all chip buttons change from `rounded` to `rounded-full` for pill shape.

- [ ] **Step 1: Update hero h1 in `src/components/IntakeForm.tsx`**

Replace:

```tsx
<h1
  className="display font-bold mb-5"
  style={{
    fontSize: 'clamp(1.9rem, 3.6vw, 2.9rem)',
    letterSpacing: '-0.03em',
    color: 'var(--color-text-1)',
    lineHeight: 1.06,
  }}
>
  Name your brand
  <br />
  defensibly.
</h1>
```

With:

```tsx
<h1
  className="display font-light mb-5"
  style={{
    fontSize: 'clamp(1.9rem, 3.6vw, 2.9rem)',
    letterSpacing: '-0.025em',
    color: 'var(--color-text-1)',
    lineHeight: 1.08,
  }}
>
  Name your brand{' '}
  <em style={{ fontStyle: 'italic', fontWeight: 600, color: 'var(--color-accent)' }}>well.</em>
  <br />
  Own it defensibly.
</h1>
```

- [ ] **Step 2: Change personality chips from `rounded` to `rounded-full`**

In the personality chip buttons, replace `rounded border` with `rounded-full border`:

Replace (personality chips):

```tsx
className={`chip px-4 py-2 text-xs font-medium rounded border ${form.personality === p ? 'chip-active' : ''}`}
```

With:

```tsx
className={`chip px-4 py-2 text-xs font-medium rounded-full border ${form.personality === p ? 'chip-active' : ''}`}
```

- [ ] **Step 3: Change geography chips from `rounded` to `rounded-full`**

Replace (geography chips):

```tsx
className={`chip px-4 py-2 text-xs font-medium rounded border ${form.geography === g ? 'chip-active' : ''}`}
```

With:

```tsx
className={`chip px-4 py-2 text-xs font-medium rounded-full border ${form.geography === g ? 'chip-active' : ''}`}
```

- [ ] **Step 4: Change TLD chips from `rounded` to `rounded-full`**

Replace (TLD chips):

```tsx
className={`chip px-3 py-1.5 text-xs font-medium rounded border mono ${selected ? 'chip-active' : ''}`}
```

With:

```tsx
className={`chip px-3 py-1.5 text-xs font-medium rounded-full border mono ${selected ? 'chip-active' : ''}`}
```

- [ ] **Step 5: Verify**

Open `http://localhost:3000` — confirm:

- Hero reads "Name your brand _well._ / Own it defensibly." with "well." in italic amber
- All chips (personality, geography, TLD) are pill-shaped
- Selected chips show amber background

- [ ] **Step 6: Commit**

```bash
git add src/components/IntakeForm.tsx
git commit -m "style: warm premium h1 copy and pill-shaped chips"
```

---

## Task 5: CandidateRow — font sizes

**Files:**

- Modify: `src/components/CandidateRow.tsx`

Larger candidate names, readable body text, legible domain labels.

- [ ] **Step 1: Increase candidate name size**

Replace:

```tsx
<h3
  className="display text-2xl md:text-3xl font-semibold truncate"
  style={{ letterSpacing: '-0.025em' }}
>
```

With:

```tsx
<h3
  className="display text-3xl md:text-4xl font-semibold truncate"
  style={{ letterSpacing: '-0.025em' }}
>
```

- [ ] **Step 2: Increase rationale body text size**

Replace:

```tsx
<p className="text-sm leading-relaxed mb-4 ink-soft">{c.rationale}</p>
```

With:

```tsx
<p
  className="leading-relaxed mb-4 ink-soft"
  style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.75 }}
>
  {c.rationale}
</p>
```

- [ ] **Step 3: Increase trademark notes body text size**

Replace:

```tsx
<p className="text-sm leading-relaxed ink-soft">{c.trademarkNotes}</p>
```

With:

```tsx
<p className="leading-relaxed ink-soft" style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.75 }}>
  {c.trademarkNotes}
</p>
```

- [ ] **Step 4: Increase domain name size**

Replace:

```tsx
<span className="mono text-xs">
  {c.name.toLowerCase()}.{tld}
</span>
```

With:

```tsx
<span className="mono" style={{ fontSize: 13 }}>
  {c.name.toLowerCase()}.{tld}
</span>
```

- [ ] **Step 5: Increase domain status label size**

Replace:

```tsx
<span className="mono text-[10px] tracking-wider" style={{ color: s.color }}>
  {s.label}
</span>
```

With:

```tsx
<span className="mono tracking-wider" style={{ fontSize: 11, color: s.color }}>
  {s.label}
</span>
```

- [ ] **Step 6: Verify**

Open the results page (`http://localhost:3000/results` — or run a generation) and expand a candidate row. Confirm:

- Candidate name is noticeably larger
- Rationale and trademark notes are 14px, lighter weight
- Domain names and status labels are readable without squinting

- [ ] **Step 7: Commit**

```bash
git add src/components/CandidateRow.tsx
git commit -m "style: larger candidate name and more readable domain/body type"
```

---

## Task 6: FreePreview — brief text, lock icon, paywall copy

**Files:**

- Modify: `src/components/FreePreview.tsx`

- [ ] **Step 1: Increase brief text size**

Replace:

```tsx
<p
  className="display text-xl md:text-2xl font-medium leading-snug"
  style={{ letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}
>
  {summary}
</p>
```

With:

```tsx
<p
  className="display font-normal leading-snug"
  style={{ fontSize: 26, letterSpacing: '-0.015em', color: 'var(--color-text-1)' }}
>
  {summary}
</p>
```

- [ ] **Step 2: Replace lock icon with softer bordered circle**

Replace the entire lock SVG block:

```tsx
<svg
  className="mx-auto mb-4"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true"
>
  <rect x="5" y="11" width="14" height="10" rx="2" stroke="var(--color-text-4)" strokeWidth="1.5" />
  <path
    d="M8 11V7a4 4 0 0 1 8 0v4"
    stroke="var(--color-text-4)"
    strokeWidth="1.5"
    strokeLinecap="round"
  />
</svg>
```

With:

```tsx
<div
  className="mx-auto mb-4"
  style={{
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '1px solid var(--color-border-mid)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}
  aria-hidden="true"
>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect
      x="5"
      y="11"
      width="14"
      height="10"
      rx="2"
      stroke="var(--color-text-4)"
      strokeWidth="1.5"
    />
    <path
      d="M8 11V7a4 4 0 0 1 8 0v4"
      stroke="var(--color-text-4)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
</div>
```

- [ ] **Step 3: Increase paywall subtext size**

Replace:

```tsx
<p className="text-sm ink-soft mb-6 max-w-xs mx-auto leading-relaxed">
  Full report includes top 3 picks with next steps, detailed trademark notes, and all domain
  alternatives.
</p>
```

With:

```tsx
<p
  className="ink-soft mb-6 max-w-xs mx-auto leading-relaxed"
  style={{ fontSize: 14, fontWeight: 300 }}
>
  Full report includes top 3 picks with next steps, detailed trademark notes, and all domain
  alternatives.
</p>
```

- [ ] **Step 4: Increase price/disclaimer note sizes**

Replace:

```tsx
<p className="mono text-[11px] mt-3 ink-softer">One-time payment · No subscription</p>
```

With:

```tsx
<p className="mono mt-3 ink-softer" style={{ fontSize: 11 }}>
  One-time payment · No subscription
</p>
```

Replace:

```tsx
<p className="mono text-[11px] mt-2 ink-softer">
  Report accessible for 24 hours · download to keep
</p>
```

With:

```tsx
<p className="mono mt-2 ink-softer" style={{ fontSize: 11 }}>
  Report accessible for 24 hours · download to keep
</p>
```

Replace:

```tsx
<p className="mono text-[11px] mt-3 ink-softer">
  Domain and trademark data as of{' '}
  {new Date().toLocaleDateString(...)}
  . Not legal advice.
</p>
```

With:

```tsx
<p className="mono mt-3 ink-softer" style={{ fontSize: 11 }}>
  Domain and trademark data as of{' '}
  {new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}
  . Not legal advice.
</p>
```

- [ ] **Step 5: Verify**

Navigate to a preview URL (run a generation or use a cached report_id in sessionStorage). Confirm:

- Summary text is larger and more impactful
- Lock icon is a soft bordered circle rather than a bare SVG
- Paywall copy and disclaimer text is readable

- [ ] **Step 6: Commit**

```bash
git add src/components/FreePreview.tsx
git commit -m "style: larger brief text, softer lock icon, readable paywall copy"
```

---

## Task 7: FullReport — top picks and recommendation font sizes

**Files:**

- Modify: `src/components/FullReport.tsx`

- [ ] **Step 1: Increase top picks name weight**

Replace:

```tsx
<h3
  className="display text-2xl font-bold mb-2"
  style={{ letterSpacing: '-0.025em', color: 'var(--color-text-1)' }}
>
  {pick.name}
</h3>
```

With:

```tsx
<h3
  className="display text-2xl mb-2"
  style={{ letterSpacing: '-0.025em', color: 'var(--color-text-1)', fontWeight: 700 }}
>
  {pick.name}
</h3>
```

- [ ] **Step 2: Increase top picks body text size**

Replace:

```tsx
<p className="text-sm ink-soft leading-relaxed mb-3">{pick.reasoning}</p>
```

With:

```tsx
<p className="ink-soft leading-relaxed mb-3" style={{ fontSize: 14, fontWeight: 300 }}>
  {pick.reasoning}
</p>
```

Replace:

```tsx
<p className="text-sm ink-soft leading-relaxed">{pick.nextSteps}</p>
```

With:

```tsx
<p className="ink-soft leading-relaxed" style={{ fontSize: 14, fontWeight: 300 }}>
  {pick.nextSteps}
</p>
```

- [ ] **Step 3: Increase recommendation text size**

Replace:

```tsx
<p
  className="display text-lg font-medium leading-snug"
  style={{ color: 'var(--color-text-1)', letterSpacing: '-0.02em' }}
>
  {report.recommendation}
</p>
```

With:

```tsx
<p
  className="display text-xl font-normal leading-snug"
  style={{ color: 'var(--color-text-1)', letterSpacing: '-0.015em' }}
>
  {report.recommendation}
</p>
```

- [ ] **Step 4: Verify**

Navigate to a results page. Confirm:

- Top pick names are visibly heavier
- Reasoning and next steps text is 14px, lighter weight — comfortable to read
- Recommendation paragraph is slightly larger and uses the serif display font

- [ ] **Step 5: Run tests to confirm no regressions**

```bash
npm test
```

Expected: all 59 tests pass (no logic was changed).

- [ ] **Step 6: Commit**

```bash
git add src/components/FullReport.tsx
git commit -m "style: larger top picks and recommendation text in full report"
```
