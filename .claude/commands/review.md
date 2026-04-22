Review the files I've changed in this session (or the files listed after this command) against the project's documented rules. Do not fix anything — produce a gap report only.

For each file changed, check against the relevant rules from `.claude/rules/`:

- `api.md` applies to `src/app/api/**`
- `lib.md` applies to `src/lib/**`
- `contracts.md` applies to any cross-boundary interaction
- `components.md` applies to `src/components/**` and `src/app/**/*.tsx`
- `tests.md` applies to `src/__tests__/**`

Also check against `CLAUDE.md` global rules:

- No `as any`
- No workarounds (root causes fixed, not masked)
- No features beyond what was asked
- Surgical changes only (no unrelated edits)

Output format — one section per file:
**filename.ts**

- [PASS] rule or pattern checked
- [FAIL] specific violation with line reference
- [WARN] borderline case worth human judgement

End with a one-line summary: "N violations found" or "No violations found".
