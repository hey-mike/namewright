---
paths:
  - 'src/**/*.ts'
  - 'src/**/*.tsx'
---

# Cross-Boundary Contract Rules

## Client ↔ Server field contracts

`IntakeForm` sends `personality` and `geography` as the exact string values from its button chips:

```ts
// src/components/IntakeForm.tsx
const PERSONALITIES = [
  'Serious / technical',
  'Playful / approachable',
  'Premium / refined',
  'Utilitarian / direct',
  'Bold / contrarian',
]
const GEOGRAPHIES = ['US-first', 'Global', 'Australia / APAC', 'Europe', 'China / Asia']
```

**Before adding server-side validation for these fields:**

- Read `src/components/IntakeForm.tsx` to confirm the exact string values the client sends
- If adding an allowlist, it must use those exact strings — not invented values
- If changing the form values, update the server validation in the same diff

## Shared types

`src/lib/types.ts` is imported by API routes, lib functions, and components. Before modifying any interface:

- Search for all imports of the changed interface: `grep -r "GenerateRequest\|ReportData\|Candidate" src/`
- Verify every consumer is updated in the same change

## API response shape

The shape returned by `/api/generate` is consumed directly by `IntakeForm` (`data.reportId`, `data.preview`, `data.summary`). Before changing the response shape, check the client consumer.

## TTL consistency

KV TTL, JWT expiry, and cookie `Max-Age` must all be 86400 (24h). They are currently set in three places:

- `src/lib/kv.ts` — `TTL_SECONDS`
- `src/lib/session.ts` — `setExpirationTime('24h')`
- `src/app/api/auth/route.ts` — `maxAge: 86400`

Changing one requires changing all three.
