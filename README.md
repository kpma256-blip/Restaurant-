# Restaurant Inventory Management System

A complete, working inventory system for a restaurant: theoretical vs.
actual inventory tracking, recipe-driven ingredient consumption, waste
tracking, physical counts, cost/food-cost reporting, and a real Toast POS
integration architecture — built end-to-end, not a mockup.

## Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + TypeScript + Express | Simple, well-understood, fast to build a REST API on; TypeScript catches unit/schema mistakes that matter a lot when money and inventory math is involved. |
| Database/ORM | Prisma + SQLite (dev), Postgres-ready | Prisma gives real relational modeling, migrations, and type-safe queries. **SQLite** is the default so the whole app runs with zero external services — but every query goes through Prisma Client, so switching to **Postgres** for production is a one-line `provider` change plus a `DATABASE_URL` (see `docker-compose.yml`). This is a real relational database either way: foreign keys, unique constraints, and transactions are enforced by the database, not just the app. |
| Frontend | React + TypeScript + Vite + Tailwind CSS | Fast dev loop, small bundle, and Tailwind makes it straightforward to build a clean, tablet/phone-friendly UI without a heavy component library. |
| Data fetching | TanStack Query | Caching, invalidation, and mutation states (loading/error) without hand-rolled state management. |
| Toast integration | A dedicated `backend/src/integrations/toast/` module | Isolates all POS-specific logic behind a normalized internal sales model, so the rest of the app — and a future second POS — never touches Toast's API shape directly. |

## Project layout

```
backend/
  prisma/schema.prisma       the data model (see "Architecture" below)
  prisma/seed.ts              realistic sample data + a clean scenario product
  src/
    lib/units.ts               unit-of-measure conversion engine
    services/
      inventoryLedger.service.ts   THE choke point for every stock movement
      sales.service.ts             recipe -> ingredient consumption, idempotent
      costing.service.ts           recipe cost, food cost %, inventory valuation
      variance.service.ts          theoretical vs. actual, the core feature
      alerts.service.ts            par/reorder/variance/waste/food-cost alerts
    routes/                        REST API (see "API" below)
    integrations/toast/            Toast POS integration (see its own README)
    tests/                         vitest unit + integration tests
frontend/
  src/pages/                       one file per screen (Dashboard, Products, Receive, …)
  src/api/client.ts                thin fetch wrapper
docker-compose.yml                 optional Postgres service for production
```

## Running it

```bash
# Backend
cd backend
cp .env.example .env            # generate a real CREDENTIAL_ENCRYPTION_KEY, see the comment in .env.example
npm install
npx prisma migrate dev          # creates backend/prisma/dev.db
npm run seed                    # realistic categories/products/recipes/sales/waste/counts
npm run dev                     # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173. A user switcher ("Acting as") in the sidebar
lets you try different roles (Admin/Manager/Staff) — every ledger entry,
waste record, sale, and count records who made it.

### Tests

```bash
cd backend
npm run seed   # tests read the seeded Unit table
npm test       # vitest: unit-conversion math + the full spec scenario, run live
```

## Architecture: the ledger is the source of truth

This is the single most important design decision in the system, so it's
worth stating plainly: **`InventoryTransaction` is authoritative. Nothing
else is.** `Product.currentQuantity`/`avgCost`/`lastCost` are cached
projections, written in the same database transaction as the ledger row
that produced them, by exactly one function:
`inventoryLedger.service.applyInventoryTransaction()`. No route or service
anywhere else writes to those fields directly. `reconcileProduct()`
recomputes a product's balance by summing its ledger and corrects the
cache if it ever drifts — call it any time via "Reconcile with ledger" on
a product's page, or `POST /api/products/:id/reconcile`.

Every stock movement — a purchase, a sale's ingredient deduction, waste, a
physical-count adjustment, a manual correction — creates one signed
`InventoryTransaction` row (`PURCHASE +20 lb`, `SALE -3 lb`, `WASTE -1 lb`,
`PHYSICAL_COUNT ±n`, …), normalized into the product's inventory unit, with
a `previousQuantity`/`newQuantity` snapshot, a reason, and a user. This
makes the whole system auditable: a product's page shows its complete
transaction history, and numbers cannot silently change.

### Unit conversion (`src/lib/units.ts`)

A `Unit` table holds `oz`, `lb`, `g`, `kg`, `ml`, `L`, `each`, `dozen`, and
`case`, each with a `toBaseFactor` into its dimension's base unit (grams,
milliliters, or each). `case` is deliberately not a fixed global factor —
a case size varies per product (a case of buns ≠ a case of napkins), so
each `Product` carries its own `caseSize`, and `convertForProduct()`
handles it specially. Every quantity — a recipe amount in `oz`, a purchase
in `lb`, a count in `each` — is converted through this engine before it
touches the ledger, so `1 lb` of chicken purchased and `16 oz` of chicken
in a recipe reconcile to the exact same inventory.

### Theoretical vs. actual (`src/services/variance.service.ts`)

For a product and a date range:

```
Beginning inventory                  (ledger balance strictly before periodStart —
                                       already reflects any prior physical count)
+ Purchases
+ Theoretical consumption from sales (already negative)
+ Recorded waste                     (already negative)
± Adjustments
= Theoretical ending inventory

Theoretical ending inventory
  vs. Physical ending inventory      (from the nearest completed count in range)
= Variance (qty and %)
```

If a physical count lands mid-period, the theoretical roll-forward is
capped at the count's date rather than the period's end — comparing a
count taken on Tuesday against a theoretical total computed through
Friday would compare two different moments in time. Variance beyond
±10% is flagged `requiresInvestigation` throughout the app (dashboard,
reports, alerts).

**This exact calculation was run against the project's test scenario**
(50 lb beginning, +30 lb purchase, 40 sandwiches × 6 oz sold, 2 lb waste,
29 lb physical count) via `backend/src/tests/scenario.test.ts` and via the
live API — both confirm theoretical ending = 63 lb, variance = -34 lb
(-54.0%), flagged for investigation. The seeded demo database has this
exact scenario already applied to its "Chicken Breast" product so you can
see it live on the Dashboard/product page/Reports immediately.

### Recipes, modifiers, and sales

A `MenuItem` has one `Recipe` (a list of `RecipeIngredient`s: product,
quantity, unit) and any number of `Modifier`s (each with its own
ingredient deltas — e.g. "Extra Cheese" on a Chicken Sandwich adds +1 oz
cheese on top of the base recipe). `sales.service.recordSale()` resolves a
sale line's full ingredient consumption (recipe × quantity, plus every
attached modifier × quantity), aggregates it per product across the sale,
and calls `applyInventoryTransaction()` once per product — one atomic DB
transaction per sale, whether it came from the manual Sales screen or a
Toast sync.

### Cost & food cost (`src/services/costing.service.ts`)

Every product tracks `lastCost` (most recent purchase, cost-unit-adjusted)
and `avgCost` (a running weighted average, updated on every purchase).
Recipe cost = Σ(ingredient qty, converted to the product's cost unit, ×
its effective unit cost). Food cost % = recipe cost / selling price.
Inventory valuation = Σ(on-hand qty × effective unit cost) across products.

## API

REST, JSON, under `/api`. Highlights (see `backend/src/routes/*.ts` for
the full surface): `categories`, `units`, `suppliers`, `products` (incl.
`/history` for the ledger and `/reconcile`), `menu-items` (incl.
`/:id/recipe` and `/:id/modifiers`), `sales`, `inventory/receive`,
`inventory/waste`, `inventory/counts` (create → patch physical quantities
→ `/complete`), `dashboard`, `reports/*` (all 10 required reports, filtered
by `from`/`to`/`categoryId`), `alerts`, and `toast/*` (see below).

## Toast POS integration

Fully covered in **`backend/src/integrations/toast/README.md`** — what
Toast API access tier you need, how to get credentials, the OAuth flow,
rate limits, and webhook requirements (verified via Toast's current
developer docs at the time of writing; always re-check
https://doc.toasttab.com before going live, Toast does version its API).

Summary of what's built:

- A dedicated `integrations/toast/` module: OAuth2 client-credentials auth
  with token caching (`auth.ts`), a rate-limited/retrying HTTP client
  (`client.ts`), menu & order fetchers (`menus.ts`, `orders.ts`), a
  normalizer that converts Toast's JSON into the same POS-agnostic
  `NormalizedSale` shape the rest of the app uses (`normalizer.ts`), and a
  sync orchestrator with logging (`syncService.ts`).
- **Idempotent by construction**: `Sale` has a unique constraint on
  `(source, externalOrderId)`. Re-syncing the same Toast order — via
  manual sync, the scheduler, a webhook, or an overlapping historical
  import — cannot double-deduct inventory; it's counted as a skipped
  duplicate. Covered by an automated test
  (`src/tests/scenario.test.ts` → "Toast-style sale idempotency").
- **Menu mapping UI** (`/toast/mapping`): every Toast menu item syncs into
  a `ToastMenuItemMapping` row; anything without an internal recipe shows
  up as unmapped (never silently dropped) with a one-click assign/ignore.
- **Toast Integration dashboard** (`/toast`): connection status, last
  sync, orders imported/failed, unmapped count, inventory transactions
  generated, estimated ingredient cost, and a full error log.
- **Historical import** with day-range presets (7/30/90/custom) and an
  explicit confirmation step before it touches inventory.
- **Scheduled + manual sync**: a cron check (`scheduler.ts`) runs
  automatic sync on a configurable interval, and "Sync Toast Now" runs the
  identical code path on demand.
- **Credentials are never sent to the browser.** They're validated with a
  live Toast call on connect, then encrypted at rest (AES-256-GCM) and
  only decrypted server-side.

This app was not connected to a live Toast account during development (no
real credentials were available in this environment) — the connection
screen will correctly show **DISCONNECTED** until you enter real Toast API
credentials. Everything upstream of "does Toast's server respond" — auth,
normalization, mapping, idempotency, ledger integration — is exercised by
the automated tests and is real, working code, not a mock.

## Sample data

`npm run seed` creates 13 categories, 9 units, 4 suppliers, 4 users, 27
ingredients, 11 menu items with full recipes (including a modifier), ~10
days of realistic sales/restocking/waste history, and one completed
physical count — enough to explore every screen immediately. It leaves one
product (Chicken Breast) untouched at a clean 50 lb specifically so you can
re-run the project's test scenario yourself from the Receive/Sales/Waste/
Counts screens (or re-run `backend/src/tests/scenario.test.ts`, which does
the same thing against a disposable test product every time).

## What's next (designed for, not yet built)

The schema and the Toast module's separation of concerns exist specifically
so these can be added without reworking what's here: additional POS
integrations (swap in a new `integrations/<pos>/` module, same
`NormalizedSale` contract), supplier management + purchase orders (the
`Supplier`/`Purchase` tables already exist), barcode/invoice scanning
(would populate the same `receive` endpoint), multiple locations (add a
`locationId` to `Product`/`InventoryTransaction` and scope queries),
real employee permissions (the `User.role` field and `X-User-Id` plumbing
are already there — a proper auth layer replaces the header-based stub),
and forecasting/auto-ordering (the ledger already has everything a
forecast model needs: full historical consumption, purchases, and waste
per product).
