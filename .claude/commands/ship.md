Prepare this change for shipping. Run in order, stop and report if any step fails.

1. **Quality gate** — run `npx tsc --noEmit && npx eslint src/ && npm test -- --forceExit`
   - If any fails: list failures, stop, do not proceed
2. **Security** — run `npm audit --audit-level=high`
   - If high-severity advisories exist: list them, ask whether to proceed
3. **Self-review** — read the diff of staged/changed files and check against `.claude/rules/` and `CLAUDE.md`
   - List any rule violations found
4. **Commit message** — draft a commit message following the project style:
   - One imperative line under 72 chars
   - No "Claude generated" or AI attribution in the message
   - Reference the actual change, not the tool used
5. **Summary** — report: tests passed, lint clean, security clean, N rule violations (list), proposed commit message

Do not commit. Do not push. Stop after the summary.
