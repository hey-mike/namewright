---
paths:
  - 'src/components/**/*.tsx'
  - 'src/app/**/*.tsx'
---

# Component Rules

## Client / Server boundary

- Server Component by default — add `'use client'` only when the component uses hooks or event handlers
- Never import `src/lib/kv`, `src/lib/stripe`, or `src/lib/anthropic` inside a client component
- If a server-only import is needed, create a separate server component and pass data as props

## Styling

- All colors via CSS custom property tokens (`var(--color-*)`) — never hardcode hex, rgb, or oklch literals inline
- Never use `background: 'white'` or `color: 'black'` — use `var(--color-input-bg)` and `var(--color-text-1)`
- Transitions: use `cubic-bezier(0.16, 1, 0.3, 1)` for UI interactions — not `ease`, `linear`, or `var(--ease-out)` for new code
- No `<style>` blocks except single-use `@keyframes` animations that cannot live in `globals.css`

## TypeScript

- Component props must have explicit named interfaces — never inline `{ prop: type }` in the function signature for non-trivial components
- Never use `any` — use proper SDK-exported types or `unknown` with narrowing
- Event handler types: `React.MouseEvent`, `React.ChangeEvent<HTMLInputElement>`, etc. — not `any`

## Patterns

- Keep components focused — if a component exceeds ~150 lines, consider splitting
- No logic in JSX — extract conditions and transforms to named variables above the return
- `aria-*` attributes required on all interactive elements that lack visible text labels
