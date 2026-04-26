# Architecture Decision Records

This directory captures the significant architectural decisions made on Namewright. Each ADR is a self-contained document recording one decision: the context that forced the choice, the alternatives considered, the decision itself, and the consequences we accepted by choosing it.

## Why ADRs

Code shows _what_ the system does. Git history shows _when_ each line changed. Neither shows _why_ a particular shape was chosen over the alternatives that were considered and rejected. Without that record, future engineers (and future-you) re-derive the same trade-offs from scratch every six months — sometimes correctly, often not, occasionally landing on the wrong answer because the original constraints aren't visible anymore.

ADRs are short, append-only memory of those trade-offs. We follow the lightweight template popularized by Michael Nygard ([_Documenting Architecture Decisions_](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions), 2011), which has become the de-facto standard format used at engineering orgs that take docs seriously.

## Index

| #   | Title                                                                                           | Status   | Date       | Tags         |
| --- | ----------------------------------------------------------------------------------------------- | -------- | ---------- | ------------ |
| 001 | [Session Cookie Set via Browser Redirect, Not Webhook](001-auth-cookie-via-browser-redirect.md) | Accepted | 2026-04-22 | auth, stripe |
| 002 | [Persist PDF Alongside JSON in R2](002-persist-pdf-alongside-json.md)                           | Accepted | 2026-04-26 | storage, pdf |

## Format

Each ADR follows this structure:

| Section          | Purpose                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Title**        | `ADR NNN: <one-line decision summary>` — short enough to fit in a code-review comment                                          |
| **Status**       | `Proposed`, `Accepted`, `Superseded by ADR-NNN`, or `Deprecated`                                                               |
| **Date**         | The date the decision was accepted                                                                                             |
| **Context**      | The forces at play — technical, business, organizational. _What problem are we trying to solve, and what made it hard?_        |
| **Decision**     | The chosen direction, stated plainly. _What we are going to do._                                                               |
| **Rationale**    | Why this option won over the alternatives. Explicit comparison of the choices considered, not just a defense of the chosen one |
| **Consequences** | What follows from this decision — positive, negative, and compatibility/migration notes. The "we accepted these costs" record  |
| **References**   | Code paths, commit hashes, related ADRs, external links                                                                        |

The Nygard template doesn't include _Rationale_ as a separate section — it's optional, but we use it because the comparison-of-alternatives is the most useful part of an ADR for future readers and we want it clearly labelled.

## Status lifecycle

```
Proposed ──► Accepted ──► (lives forever)
                  │
                  └──► Superseded by ADR-NNN
                  │
                  └──► Deprecated
```

ADRs are **append-only**. A bad decision doesn't get rewritten — a new ADR supersedes it, and both stay in the directory. The history of why we changed our minds is itself useful information.

## Writing a new ADR

1. Copy [`template.md`](template.md) to `NNN-kebab-case-title.md` where `NNN` is the next number (zero-padded).
2. Fill in each section. Keep it short — a long ADR is usually one that hasn't decided yet.
3. Set `Status: Proposed` while it's under discussion. Move to `Accepted` after merge.
4. Add an entry to the index table above in the same PR.
5. If this ADR replaces an existing one, set the old one's status to `Superseded by ADR-NNN` and link in both directions.

## What deserves an ADR

- Anything that took more than 30 minutes of design conversation to settle
- Cross-cutting decisions: auth model, storage layout, deployment topology, dependency choice between viable alternatives
- Trade-offs where the rejected alternative is plausible enough that someone will ask "why not X?" later

What does **not** deserve an ADR:

- Implementation details that the code already makes clear
- Library-internal choices ("which date helper to use")
- Reversible defaults you can change without breaking anything
