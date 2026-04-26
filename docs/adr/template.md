# ADR NNN: <one-line decision summary>

<!--
  - NNN is the next zero-padded number (003, 004, …)
  - Title fits in a single line; use the form "<verb> <object> <qualifier>"
    e.g. "Switch from KV to R2 for canonical report storage"
  - Save this file as `NNN-kebab-case-title.md`
  - Add an entry to README.md's index table in the same PR
-->

## Status

Proposed

<!--
  Lifecycle: Proposed → Accepted → (Superseded by ADR-NNN | Deprecated)
  ADRs are append-only. A reversed decision becomes a new ADR that supersedes
  this one; this file's status changes to "Superseded by ADR-NNN" and the new
  ADR links back here. Do not delete or rewrite ADRs.
-->

## Date

YYYY-MM-DD

<!-- The date the decision was accepted (not the date drafting started). -->

## Context

<!--
  The forces at play that made this a real decision. Cover:
  - The problem we're trying to solve (one paragraph)
  - The constraints — technical, business, organizational, time
  - Why the obvious answer doesn't work, OR why "do nothing" isn't an option
  - Any prior decisions or ADRs that this one depends on

  This section should make it clear to a future reader why this needed a
  decision at all. If the answer is obvious in hindsight, state what made
  it non-obvious at the time.
-->

## Decision

<!--
  The chosen direction, stated plainly and concretely. What we are going
  to do. Use "We will…" / "The system will…" — not "We should…".

  Be specific enough that someone implementing this later doesn't have to
  re-decide anything. If you're vague here, you're punting the decision.
-->

## Rationale

<!--
  Why this option won over the alternatives. The most useful part of an
  ADR for future readers — they want to know what was considered and
  rejected, not just a defense of the chosen path.

  Recommended structure:
  - List the 2–4 real alternatives (including "do nothing")
  - Compare them across the dimensions that mattered (a small table works
    well for this — see ADR-002 for an example)
  - Explain the asymmetry that made one alternative win

  Skip alternatives that were obviously wrong. Include alternatives that
  were plausible but lost on a specific trade-off.
-->

## Consequences

<!--
  What follows from this decision. Be honest about the costs you're
  accepting; future-you will thank present-you.

  Group as:
  - Positive: what this decision enables or improves
  - Negative: what it costs (latency, complexity, lock-in, dependency surface)
  - Compatibility / migration: what existing code or data does as a result
    (often overlooked; the failure mode is "we shipped a great new pattern
    and forgot the migration plan")

  If you can't think of any negative consequences, you haven't thought about
  it enough. Every decision has trade-offs.
-->

## References

<!--
  Concrete pointers so a reader can verify or trace the decision:
  - Code paths affected (`src/lib/foo.ts`, `src/app/api/bar/route.ts`)
  - The commit that implemented the decision
  - Other ADRs this depends on or relates to
  - External resources (RFCs, blog posts, framework docs)
-->
