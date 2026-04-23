# Warm Premium Visual Redesign — Design Spec

## Goal

Redesign Namewright's visual identity from its current cool-toned minimal aesthetic to a **Warm Premium** direction: warm ivory backgrounds, amber gold accent, and a serif + sans-serif type pairing that signals expertise and trustworthiness without feeling cold or startup-generic.

## Design Direction

**Archetype:** Boutique branding consultancy — credible, warm, unhurried. Like a premium report you'd trust, not a SaaS landing page.

**Theme:** Light mode only. Warm ivory base.

---

## Color Tokens

Replace all current CSS custom properties in `src/app/globals.css`:

| Token                | Old value (approx) | New value                                       |
| -------------------- | ------------------ | ----------------------------------------------- |
| `--color-bg`         | cool white         | `oklch(0.993 0.008 80)` — warm ivory            |
| `--color-bg-2`       | light gray         | `oklch(0.988 0.010 80)` — slightly deeper ivory |
| `--color-text-1`     | near-black         | `oklch(0.180 0.028 55)` — deep warm brown       |
| `--color-text-2`     | dark gray          | `oklch(0.320 0.030 55)`                         |
| `--color-text-3`     | medium gray        | `oklch(0.500 0.030 60)`                         |
| `--color-text-4`     | muted gray         | `oklch(0.680 0.028 65)`                         |
| `--color-accent`     | teal/slate         | `oklch(0.580 0.110 55)` — amber gold            |
| `--color-accent-lt`  | teal tint          | `oklch(0.940 0.035 80)` — amber tint            |
| `--color-border`     | cool light         | `oklch(0.920 0.018 75)` — warm cream            |
| `--color-border-mid` | cool mid           | `oklch(0.880 0.022 70)`                         |
| `--color-input-bg`   | light              | `oklch(0.990 0.009 80)`                         |
| `--color-focus-ring` | teal tint          | `oklch(0.880 0.040 65)` — amber ring            |
| `--color-success`    | green              | `oklch(0.460 0.095 145)` — warm green           |
| `--color-warning`    | yellow             | `oklch(0.520 0.095 65)` — warm amber            |
| `--color-error`      | red                | `oklch(0.440 0.140 25)` — warm red              |

---

## Typography

Replace font imports in `src/app/layout.tsx`. Three-font system:

| Role                | Font               | Weights                                | Usage                                                                     |
| ------------------- | ------------------ | -------------------------------------- | ------------------------------------------------------------------------- |
| Display / headlines | **Source Serif 4** | 300, 400, 600, 700 (+ italic variants) | `h1`, `h2`, candidate names, brief text, top picks                        |
| Body / UI           | **Lato**           | 300, 400, 700                          | Body copy, form labels, buttons, chips, nav                               |
| Mono / labels       | **DM Mono**        | 400, 500                               | Section tags, field numbers, domain names, status labels, disclaimer text |

**Google Fonts import string:**

```
Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,300;1,8..60,400;1,8..60,600&family=Lato:wght@300;400;700&family=DM+Mono:wght@400;500
```

**CSS variable updates in `globals.css`:**

```css
--font-display: 'Source Serif 4', Georgia, serif;
--font-body: 'Lato', system-ui, sans-serif;
--font-mono: 'DM Mono', monospace;
```

**Key type rules:**

- `body`: `font-family: var(--font-body); font-weight: 300`
- `.display` class: `font-family: var(--font-display)`
- `.mono` class: `font-family: var(--font-mono)`
- Wordmark (`.wordmark`): Source Serif 4, italic, weight 600, `font-style: italic`
- Hero `h1`: weight 300, italic `em` children in weight 600 + amber color

---

## Component Changes

### Header / Nav

- Wordmark: change from Bricolage Grotesque bold to Source Serif 4 italic 600
- No other structural changes

### IntakeForm — homepage

- **Chips:** change from square-cornered to pill shape (`border-radius: 999px`)
- **Active chip:** amber background + white text (currently dark background)
- **Inputs:** `background: var(--color-input-bg)`, `border-radius: 6px`, warm border tokens
- **Submit button:** amber background (currently dark/teal)
- **Hero h1:** Source Serif 4 weight 300, with `<em>well.</em>` in italic weight 600 amber
- Hero subtitle: Lato weight 300, `color: var(--color-text-3)`

### Loading state (IntakeForm)

- No structural changes — inherits new color tokens automatically

### CandidateRow — both preview and full report

- **Candidate name:** Source Serif 4 weight 600, size `text-3xl md:text-4xl` (up from `text-2xl md:text-3xl`)
- **Body copy** (rationale, trademark notes): `font-size: 14px`, Lato weight 300, line-height 1.75
- **Domain names:** DM Mono `font-size: 13px`
- **Domain status labels:** DM Mono `font-size: 11px`
- **Section labels** ("Why it works", "Domains" etc): DM Mono `font-size: 10px`

### FreePreview — preview page

- **Brief text:** Source Serif 4, `font-size: 26px`, weight 400
- **Paywall subtext:** `font-size: 14px`, Lato weight 300
- **Price/disclaimer notes:** DM Mono `font-size: 11px`
- **Unlock button:** amber background (inherits from `btn-primary` token change)
- **Lock icon circle:** replace filled icon with bordered circle + stroke icon (softer)

### FullReport — results page

- **Top picks names:** Source Serif 4 weight 700
- **Top picks reasoning/nextSteps:** Lato weight 300, `font-size: 14px`
- **Recommendation block:** Source Serif 4 weight 400, size `text-xl`
- No structural layout changes

---

## What Does NOT Change

- Page layouts (split-column homepage, single-column preview/report)
- Component structure and data flow
- Loading/pipeline animation behaviour
- All functionality (chips, form validation, paywall, PDF export)
- Mobile breakpoints and responsive behaviour

---

## Scope

This is a **CSS and font** change only. No new components, no layout restructuring, no new functionality. Every changed line traces to: color token, font family/weight/size, or border-radius on chips.

Files touched:

- `src/app/globals.css` — color tokens, font variables, `.display`/`.mono` class updates
- `src/app/layout.tsx` — Google Fonts import string
- `src/components/IntakeForm.tsx` — chip border-radius, button color class, h1 markup (add `<em>`)
- `src/components/CandidateRow.tsx` — font sizes for name, body, domain labels
- `src/components/FreePreview.tsx` — brief font size, paywall copy size, lock icon markup
- `src/components/FullReport.tsx` — top picks and recommendation font sizes
