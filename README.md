# Restaurant Inventory Management System

A complete, working inventory system for a restaurant: theoretical vs.
actual inventory tracking, recipe-driven ingredient consumption, waste
tracking, physical counts, cost/food-cost reporting, and a real Toast POS
integration architecture — built end-to-end, not a mockup.

## Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + TypeScript + Express | Simple, well-understood, fast to build a REST API on; TypeScript catches unit/schema mistakes that matter a lot when money and inventory math is involved. |
| Database/ORM | Prisma + PostgreSQL | Prisma gives real relational modeling, migrations, and type-safe queries; Postgres is a proper production-grade relational database (foreign keys, unique constraints, and transactions enforced by the database itself) — the same database locally (`docker-compose.yml`) and in production, so there's no dev/prod schema drift to debug. |
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

## Running it locally

```bash
# 1. Postgres — either Docker...
docker compose up -d
# ...or point DATABASE_URL at a Postgres instance you already have.

# 2. Backend
cd backend
cp .env.example .env            # generate a real CREDENTIAL_ENCRYPTION_KEY, see the comment in .env.example
npm install
npx prisma migrate dev          # creates the schema in Postgres
npm run seed                    # realistic categories/products/recipes/sales/waste/counts
npm run dev                     # http://localhost:4000

# 3. Frontend (separate terminal)
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

## Deploying it for real use (a public URL)

In production, the backend also serves the built frontend directly (see
`app.ts`) — one Node process, one URL, no separate static host and no
CORS to configure. `render.yaml` at the repo root is a
[Render](https://render.com) Blueprint that provisions exactly that: one
web service + one managed Postgres database, wired together automatically.

**Steps:**
1. Push this repo to GitHub if it isn't already (merge this branch to
   whichever branch you want to deploy from — Blueprints deploy the branch
   you select when you connect the repo).
2. In the Render dashboard: **New → Blueprint**, connect this repo. Render
   reads `render.yaml` and shows you the web service + database it's about
   to create.
3. Click **Apply**. First build takes a few minutes (installs both
   `frontend` and `backend`, builds both, then `prisma migrate deploy`
   creates the schema on the new database automatically).
4. Once it's live, run the seed script once against the production
   database if you want the sample data as a starting point — or skip it
   and start from empty by using the app's own screens (Receive,
   Recipes, etc.) to enter your real products, recipes, and stock. To run
   the seed remotely: copy the `DATABASE_URL` Render generated (Database →
   Connect) into a local `backend/.env`, then `cd backend && npm run seed`.
5. Your app is now live at `https://<your-service-name>.onrender.com`.

**Before you rely on this for real restaurant data**, upgrade both the
database and the web service off Render's free plan:
- The **free Postgres database expires 30 days after creation** (a 14-day
  grace period, then it's deleted) — fine for testing, not for your actual
  inventory. Upgrade it to a paid plan in the Render dashboard before that
  30 days is up.
- The **free web service spins down after 15 minutes idle** and takes
  30-60 seconds to wake back up on the next request — annoying at a busy
  register. A paid "Starter" instance stays warm.

Prefer a different host (Railway, Fly.io, a VPS)? The same two artifacts —
a Dockerized/`npm run build`-able Node service reading `DATABASE_URL`, and
a Postgres database — work anywhere; `render.yaml` is just the fastest
path since it's declarative and one-click. Whatever you choose, keep
`CREDENTIAL_ENCRYPTION_KEY` and `DATABASE_URL` as server-side secrets, and
set `CORS_ORIGIN` to your real domain once you have one instead of `*`.

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

## Receiving: quick entry and PDF invoice upload

The Receive Inventory screen (`/receive`) has two tabs, both ultimately
calling the same `services/inventory-receiving/inventoryReceiving.service.ts`
— the one place that turns a receiving session into a `Purchase` +
`PurchaseItem`s + ledger `PURCHASE` transactions, so there's exactly one
code path capable of creating a receiving record no matter how it started.

- **Quick Manual Entry** — a spreadsheet-style multi-row form
  (`components/receiving/QuickEntryTab.tsx`) with a searchable product
  picker (`components/SearchableSelect.tsx`) and an inline "create new
  product" shortcut, so a whole delivery is one save.
- **Upload Invoice** (`components/receiving/UploadInvoiceTab.tsx`) — upload
  a PDF, review the extracted line items, edit anything, then confirm.
  **Nothing touches inventory until you click "Save & Add to Inventory."**

PDF parsing is its own module, not tied to one supplier's layout:

```
src/services/ocr/               tesseract.js OCR, fully offline (see below)
src/services/invoice-parser/    text extraction + OCR fallback + line-item heuristics
src/services/productMatching.service.ts   alias memory + fuzzy product matching
```

`invoice-parser` first tries the PDF's embedded text (`pdf-parse`); if
there's too little text to be a real invoice (a scanned document), it
rasterizes each page and runs OCR instead. **OCR runs fully offline** — the
English trained-data is bundled as a normal npm dependency
(`@tesseract.js-data/eng`), not fetched from a CDN at request time, so it
works the same in an environment with no outbound internet as it does in
production. Line items are extracted with a generic regex/heuristic
parser (`lineParser.ts`) — deliberately not an exact parser, since real
invoices vary too much for that to ever be 100% right, which is exactly
why the review screen is mandatory rather than best-effort.

**Product matching + memory**: each invoice line is matched against your
products by fuzzy text similarity (`productMatching.service.ts`, a blended
Levenshtein/token-overlap score, no external API). Once you confirm (or
correct) a match, it's saved as a `SupplierProductAlias` keyed to that
supplier — the next invoice from them with that exact line text matches
instantly, no fuzzy guessing needed. This is genuinely learned per
restaurant, not a fixed lookup table.

**Duplicate prevention**: every uploaded file's SHA-256 hash is stored on
its `Purchase` (`invoiceFileHash`, unique). Uploading the same PDF twice is
flagged as a likely duplicate before you even review it, and is hard-blocked
at confirm time regardless — covered by an automated test
(`src/tests/receiving.test.ts`).

**Receiving history** (`/receiving`) lists every receiving with date,
supplier, invoice #, item count, total cost, and source (manual vs. PDF);
clicking one shows the full line-item breakdown and a link to view the
original stored PDF. Uploaded files live on local disk under
`backend/uploads/` by default (`UPLOADS_DIR` env var to relocate) — same
persistence caveat as the dev database: on an ephemeral host this needs a
persistent volume or object storage before relying on it in production.

## Settings, Suppliers, and Users

`/settings` is a real, wired-up settings screen, not cosmetic — the
variance-flagging threshold and food-cost target you set there are read
live by `variance.service.ts` and `alerts.service.ts` (cached briefly, see
`lib/settingsCache.ts`), and the notification toggles filter what
`alerts.service.ts` returns. `/suppliers` and `/users` are straightforward
CRUD over the `Supplier` and `User` tables that already existed in the
schema — `/users` manages the user *directory* (who shows up in "Acting
as" and gets attributed on ledger entries); there's still no
login/password, which stays a documented future item.

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
`NormalizedSale` contract), purchase orders (supplier management and
invoice/PDF receiving already exist — a PO would add an "expected, not yet
received" state ahead of what `inventory-receiving` does today), barcode
scanning (would feed the same `SearchableSelect` product picker on the
Quick Entry tab), multiple locations (add a `locationId` to
`Product`/`InventoryTransaction` and scope queries), real employee
permissions with sign-in (the `User.role` field, the user directory at
`/users`, and the `X-User-Id` plumbing are already there — a proper auth
layer replaces the header-based stub), and forecasting/auto-ordering (the
ledger already has everything a forecast model needs: full historical
consumption, purchases, and waste per product).
