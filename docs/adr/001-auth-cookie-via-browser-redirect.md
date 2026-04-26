# ADR 001: Session Cookie Set via Browser Redirect, Not Webhook

## Status

Accepted

## Date

2026-04-22

## Context

After a successful Stripe payment, we need to grant the user access to their paid report by setting a session cookie. There are two points in the Stripe flow where we learn a payment succeeded:

1. **The webhook** (`POST /api/webhook`) — Stripe calls this server-to-server after payment confirmation
2. **The success redirect** — Stripe redirects the user's browser to our `success_url` after checkout

The naive implementation is to set the cookie in the webhook handler, since that's where we first confirm payment.

## Decision

The session cookie is set exclusively in `GET /api/auth`, a browser-facing route that the user's browser hits as the Stripe success redirect. The webhook handler never sets cookies.

The `success_url` in `/api/checkout` is:

```
/api/auth?report_id={reportId}&session_id={CHECKOUT_SESSION_ID}
```

`/api/auth` retrieves the Stripe session, verifies `payment_status === 'paid'` and that the `reportId` in metadata matches the query param, then sets the cookie and redirects to `/results`.

## Rationale

**Cookies set in webhook responses never reach the browser.**

The webhook is called by Stripe's servers, not the user's browser. Any `Set-Cookie` header on the webhook response is received by Stripe's infrastructure and discarded — it is not forwarded to the user's browser. There is no mechanism in HTTP for a server-to-server call to set cookies in a third-party browser session.

The only way to set a cookie in the user's browser is to respond to a request _from_ that browser.

## Consequences

- `/api/auth` must re-verify the Stripe session on every access to prevent `session_id` spoofing
- The webhook remains useful for reliability (server-side record-keeping, future fulfillment logic) but must never contain cookie-setting code
- Any future developer adding "set cookie on payment confirmation" logic must add it to `/api/auth`, not the webhook
- Tests for the webhook must assert that `set-cookie` is absent from the response

## References

- Implementation: `src/app/api/auth/route.ts`, `src/app/api/checkout/route.ts`, `src/app/api/webhook/route.ts`
- CSRF guard: `consumeAuthNonce` in `src/lib/kv.ts` (atomic `kv.getdel`)
- Cookie issuance: `signSession` in `src/lib/session.ts` (HS256 JWT, 7-day expiry)
- Architecture context: `docs/ARCHITECTURE.md` §5 _Auth model_, §5.1 _Stripe-redirect auth flow_
