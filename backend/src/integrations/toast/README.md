# Toast POS integration

This module is the **only** place in the codebase that talks to Toast's
API. Everything else in the application (sales, inventory ledger, recipes)
interacts with the POS-agnostic `NormalizedSale` shape produced here — so a
second POS could be added later by writing one new normalizer + sync
service, without touching inventory logic at all.

```
src/integrations/toast/
  config.ts        credential storage/decryption (never touches the frontend)
  auth.ts           OAuth2 client-credentials token exchange + caching
  client.ts         rate-limited, retried, authenticated HTTP client
  types.ts          raw Toast API response shapes
  menus.ts          GET /menus/v2/menus
  orders.ts         GET /orders/v2/orders (bulk + by GUID)
  normalizer.ts     Toast order JSON -> NormalizedSale
  mappingService.ts Toast menu item/modifier <-> internal recipe mapping
  syncService.ts    orchestrates menu sync + order import + idempotency + logging
  scheduler.ts       cron trigger for automatic sync
  webhook.ts         inbound webhook receiver (Partner-tier, see below)
```

## What this needs from you (real Toast account requirements)

**This integration is built against Toast's real, documented API surface —
not a mock.** To actually connect it to a restaurant you need credentials
Toast issues; the app cannot fabricate access on your behalf. As of this
build (verify against https://doc.toasttab.com before going live — Toast
does update its API over time):

1. **API access tier.** Toast offers three tiers:
   - *Standard API Access* — self-service, a restaurant operator can
     generate API credentials for their own restaurant from the Toast
     admin/back-office directly. This is the tier this integration targets
     by default and is enough for the receive-your-own-sales workflow this
     app implements.
   - *Analytics API Access* — requires the Restaurant Management Suites Pro
     add-on.
   - *Partner Integrations* — for a company productizing this for many
     Toast restaurants, not just one; requires going through Toast's
     partner application and certification process, and unlocks things
     Standard access may not, notably **webhooks** (real-time order/menu
     change notifications) and higher rate limits.
   If you plan to offer this to other restaurants (not just your own),
   you'll need to apply for Partner access — see
   https://pos.toasttab.com/partners or your Toast rep.

2. **Credentials.** Client ID + Client Secret, generated per-restaurant
   (or per restaurant-group) from Toast's admin portal under API access
   management. Treat the secret like a password — this app never sends it
   to the browser, encrypts it at rest (`config.ts`, AES-256-GCM using
   `CREDENTIAL_ENCRYPTION_KEY`), and only decrypts it server-side to make
   API calls.

3. **Restaurant GUID.** Every API call must be scoped with a
   `Toast-Restaurant-External-ID` header identifying which restaurant to
   query — get this from the Toast admin portal or the `/restaurants`
   endpoint if you hold a restaurant-group-level account.

4. **Authentication.** OAuth2 client-credentials flow:
   `POST https://{host}/authentication/v1/authentication/login` with
   `{ clientId, clientSecret, userAccessType: "TOAST_MACHINE_CLIENT" }`,
   returning a bearer token (`token.accessToken`, `token.expiresIn`
   seconds). The token is cached in-process and refreshed automatically
   (`auth.ts`). Sandbox host is typically `ws-api.eng.toasttab.com`;
   production is `ws-api.toasttab.com` — confirm current hostnames in the
   docs, they're configurable via `TOAST_API_HOSTNAME` / the environment
   selector on the Connect screen either way.

5. **Rate limits.** Toast enforces per-second request limits (documented
   in the tens of requests/second range for partner-tier access; Standard
   access may be lower). `client.ts` implements a token-bucket limiter
   (`TOAST_MAX_REQUESTS_PER_SECOND`, default 5 — conservative on purpose)
   plus exponential-backoff retry on 429/5xx.

6. **Webhooks are opt-in and gated.** Real-time order push notifications
   are a feature you must request/enable through Toast (typically
   Partner-tier); Standard access restaurants generally rely on polling.
   `webhook.ts` is fully wired up (signature verification via
   `TOAST_WEBHOOK_SECRET`, idempotent import through the same sync path)
   so it's ready the moment webhook access is granted and configured in
   Toast's partner portal — until then, use scheduled or manual sync.

## Configuring credentials

Set them either via environment variables (`.env`, see
`backend/.env.example`) for a headless/single-restaurant deployment, or
through the Toast Integration page in the app (`POST /api/toast/connect`),
which validates the credentials with a live test call before saving them
(encrypted) to the `ToastConnection` table. Environment variables are the
fallback the app reads when no `ToastConnection` row exists yet.

## Idempotency

Every Toast order becomes exactly one `Sale` row keyed on
`(source="TOAST", externalOrderId=<Toast order GUID>)`, enforced by a
database unique constraint. Re-syncing the same date range — via manual
sync, the scheduler, a webhook replay, or a historical import overlapping
an already-synced window — cannot create a duplicate: `recordSale()`
either inserts fresh or throws `DuplicateSaleError`, which the sync loop
counts as `ordersSkippedDuplicate` rather than treating as a failure.

## Unmapped items

Menu sync (`syncToastMenu`) upserts a `ToastMenuItemMapping` row for every
Toast menu item on every sync, so brand-new items always show up. Order
import silently skips (per-item, not per-order) any selection whose
`itemGuid` has no mapping yet, and the Toast Integration page surfaces the
unmapped count/list so you can assign a recipe — nothing is dropped
without being visible.
