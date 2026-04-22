Run the full quality suite and report results. Do not fix anything — just report.

Steps:

1. Run `npx tsc --noEmit` and capture output
2. Run `npx eslint src/` and capture output
3. Run `npm test -- --forceExit` and capture output
4. Run `npm audit --audit-level=high` and capture output

Report findings as a structured list:

- TypeScript: pass / N errors (list each)
- ESLint: pass / N errors (list each file and rule)
- Tests: pass / N failed (list failing test names)
- Security: pass / N high-severity advisories (list package names)

If everything passes, say so in one line. Do not suggest fixes unless asked.
