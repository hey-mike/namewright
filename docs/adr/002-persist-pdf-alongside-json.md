# ADR 002: Persist PDF Alongside JSON in R2

## Status

Accepted

## Context

The customer-facing artifact for a paid Namewright report is a PDF. Until this
change, the PDF existed only in the user's browser at click-time: `PdfExportButton`
dynamically imported `@react-pdf/renderer` and `PDFDownloadLink` rendered the
document client-side from the JSON.

The JSON itself was stored in R2 from day one (`reports/{reportId}.json`,
permanent), but no rendered PDF was ever persisted. Three problems followed:

1. **No immutability.** If we redesigned the PDF template, every historical
   report's "downloaded PDF" silently changed. A customer pulling up a six-month-old
   report got a PDF that didn't match the one they originally received. For a
   paid artifact, that's a weak posture in any future dispute (refund, IP claim,
   "what did the report say at time of purchase").
2. **Per-download render cost on the client.** Loading and running
   `@react-pdf/renderer` in the browser added ~200 KB to the bundle and 1–3 s of
   render time on every download. Most paying customers download once; that work
   was paid for repeatedly anyway because the dynamic import re-fired per page
   visit.
3. **No backend observability of PDF generation.** Render failures only surfaced
   in the user's browser. We had no signal that PDFs were even being produced
   correctly until a customer reported a broken download.

A second option considered was **store only the PDF and discard the JSON**.
Rejected — see _Rationale_.

## Decision

Render the PDF server-side at generation time and store it alongside the JSON
in R2. Both artifacts live in the same bucket: `reports/{reportId}.json` and
`reports/{reportId}.pdf`. The Inngest `generateReportJob` adds a
`save-report-pdf` step after `save-report` that runs `renderToBuffer()`
(`@react-pdf/renderer`'s server-side API) and writes via `saveReportPdf`.

The download path becomes a plain `<a href download>` against
`GET /api/report/[id]/pdf`, an auth-gated route that:

1. Verifies the session cookie (same gate as `/results`)
2. Tries `getReportPdf(reportId)` — fast path
3. Falls back to render-on-demand-and-write-through-cache if no PDF is stored
   (covers reports generated before this change shipped, and any case where
   `save-report-pdf` failed)

The Inngest PDF step is **non-fatal**: if rendering or saving fails, the JSON
has already been persisted in the prior step, and the on-demand render in
`/api/report/[id]/pdf` will produce + cache the PDF on first download. The
failure pages Slack with severity `warning`, not `critical`.

## Rationale

**Why store both, not PDF-only.**

JSON remains canonical. The PDF is a derivative view. Three asymmetries make
PDF-only a poor swap:

| Concern        | JSON-canonical (chosen)                                                                                    | PDF-canonical                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Multi-render   | Same JSON renders web `/results`, the PDF, the email body, future API consumers                            | PDF locks one format. Re-rendering for any other surface requires parsing the PDF         |
| Storage cost   | ~10–50 KB per report                                                                                       | ~200 KB – 2 MB per report (5–40× more on R2 egress + storage)                             |
| Design changes | Update `ReportPdfDocument.tsx` once → all reports re-render with the new design via the on-demand fallback | Old PDFs frozen with the old design. Re-render every historical report or live with drift |
| Validation     | `validateReportData` runs on the canonical bytes before save                                               | Validation runs in memory then is discarded — opaque PDF blob is hard to audit later      |
| Bug fixes      | Disclaimer typo? Fix template, all old reports show the fix on next download                               | Each historical PDF is frozen with the typo                                               |

The thing PDF-canonical _would_ give us — perfect immutability of the
exact bytes the customer originally received — we get instead by storing
the PDF as a permanent artifact while keeping the JSON canonical. The
in-flight render at generation time is the customer's exact PDF; the
on-demand fallback is for the (rare) case where it didn't happen.

**Why server-side render, not "render at first download".**

Either approach gives us the artifact. Server-side at generation time:

- Fails loudly _at generation_ if the PDF template breaks, instead of silently
  the first time a customer tries to download
- Produces a single bytes-on-disk artifact that's the canonical "what the
  customer got" — even if the customer never downloads
- Keeps download latency to a few hundred ms (R2 fetch) instead of ~1 s (render
  - R2 write + serve)

The on-demand path is preserved as a fallback so that a transient render
failure doesn't cause customer-visible 500s — the JSON is the user's
proof-of-purchase, and the PDF can always be re-derived from it.

**Why non-fatal at generation time.**

The JSON save (step 3) is fatal because without it the user has no report at
all. The PDF save (step 4) is non-fatal because the JSON is already canonical
and the PDF is recoverable. Pretending the PDF step is critical would mean
showing the user "report generation failed" when they actually have a complete
report — false negative. Accepting the non-fatal posture means a small slice
of reports (when render breaks) get the PDF lazily on first download, with a
Slack `warning` so we know to investigate.

## Consequences

**Positive.**

- Customers get an immutable PDF artifact tied to their purchase. The bytes
  on disk on day 1 are still on disk on day 365.
- Download is instant: anchor + bytes from R2, no client-side render.
- Server-side render failures page Slack at generation time. Visible failure
  mode instead of silent.
- The doc component (`ReportPdfDocument`) is a single source of truth for both
  server-side and client-side renders (`PDFDownloadLink` still imports it from
  the same file, so the legacy client-render path remains valid as a fallback).
- Storage cost is negligible at expected volume — a 10 KB PDF + a 6 KB JSON per
  report fits well within R2 free-tier writes (<1 KB/sec average).

**Negative.**

- The Inngest job is ~200–800 ms slower per report (server-side render time).
  Acceptable because it's async and the user sees no latency hit.
- `@react-pdf/renderer` is now imported in both the Inngest function and the
  PDF API route. Two cold-start surfaces eat the dependency cost. Mitigated
  because both run in Node (Fluid Compute), and `@react-pdf/renderer` works in
  Node out of the box.
- The on-demand fallback path in `/api/report/[id]/pdf` is a second code path
  for the same job. We accept this complexity because it covers two real cases
  (pre-feature reports, plus any future render failures), and the cost is one
  extra `if (!buffer)` branch.
- `ReportPdf.tsx` (the legacy client-render component) is unused after this
  change but kept for now. Will revisit deletion once the feature has
  validated in production.

**Compatibility.**

- Reports generated before this change have no `.pdf` in R2. The on-demand
  render path covers them transparently — the user's first download writes
  through the cache, and subsequent downloads hit the stored copy.
- No migration needed. No existing customer's experience changes; new reports
  get the artifact eagerly, old reports get it lazily.

## References

- Implementation commit: `efb4103`
- Server-side rendering API: `@react-pdf/renderer` `renderToBuffer`
- Auth-gated download route: `src/app/api/report/[id]/pdf/route.tsx`
- Inngest step: `save-report-pdf` in `src/inngest/functions.tsx`
- Storage layer: `saveReportPdf` / `getReportPdf` in `src/lib/r2.ts`
