---
paths:
  - 'src/__tests__/**/*.ts'
  - 'src/__tests__/**/*.tsx'
---

# Test Rules

## Structure

- Test file path must mirror source path: `src/__tests__/lib/foo.test.ts` tests `src/lib/foo.ts`
- Group related assertions in `describe` blocks matching the function or module under test
- Each `it`/`test` name must read as a specification: "returns null when token is expired" not "test null case"

## Mocking

- `jest.mock(...)` calls go at module level before all imports — never inside `beforeEach` or `it`
- Anthropic SDK mock: use the module-level `let mockCreate: jest.Mock` closure pattern (see `src/__tests__/lib/anthropic.test.ts`)
- Never mock what you don't own — mock at the boundary (SDK client), not internal helpers
- Restore mocks in `afterEach` if they mutate module-level state

## Coverage

- Test the happy path, at least one error path, and at least one edge case (empty input, boundary values) per function
- For parsers and validators: test malformed input explicitly — these are the highest-risk paths in AI-generated logic
- Do not test implementation details (internal function calls, private state) — test observable outputs

## Quality

- No `console.log` in test files — use Jest assertion messages (`expect(x).toBe(y, 'reason')`) or fix the test
- No `any` casts in test assertions — if the type is wrong, fix the source type
- `expect.assertions(n)` in async tests that must reach a catch block
