# Medora · Pharmacy Management

A pharmacy workspace for Bangladesh, built from [Project_spec.md](Project_spec.md). Next.js App Router/PWA, NestJS, Prisma/PostgreSQL, Redis barcode lookup and BullMQ maintenance.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended), npm and a running Docker engine. The repository root contains only frontend/ and backend/ (plus Git metadata). Both apps install independently; PowerShell is supported.

```sh
cd backend
npm ci
npm run setup
npm run services
npm run db:generate
npm run db:migrate
npm run db:seed
cd ../frontend
npm ci
cd ../backend
npm run dev:all
```

Open **http://localhost:3217**. API health: **http://127.0.0.1:4217/health**. Ports avoid common 3000/4000 servers. Use localhost for the frontend so session cookies stay consistent. Run maintenance in a second terminal:

```sh
cd backend
npm run worker
```

The repeatable seed preserves existing records and creates 100 fictional medicine SKUs, 200 batches, three suppliers, one captured prescription and five accounts. This is development data, not a DGDA register or clinical reference.

| Account                   | Role         |
| ------------------------- | ------------ |
| owner@medora.local        | Owner        |
| pharmacist@medora.local   | Pharmacist   |
| cashier@medora.local      | Cashier      |
| store_keeper@medora.local | Store keeper |
| auditor@medora.local      | Auditor      |

All seed accounts use **SEED_PASSWORD in backend/.env**, generated locally and ignored by Git. Sign in as owner to configure the pharmacy license/address, owner PIN and team. Do not seed a live pharmacy with demo accounts.

## Daily workflows

- **Catalog:** search brands/generics/barcodes/manufacturers, add/edit/archive medicines, atomic CSV import/export. Unique barcodes identify sellable SKUs. Costs and prices are per unit; pack size converts receipts to units.
- **Inventory:** lots, racks, expiry/blocked states, counts, rack relocation, movement history, supplier returns, recall and disposal. Mandatory FEFO; negative stock always disabled.
- **Purchasing:** suppliers, draft/order/cancel, partial or full GRN and pack conversion.
- **POS:** barcode plus Enter, decimal quantities, discounts/margin PIN, cash/bKash/Nagad/card and split tender, customer contact, receipt printing and history. Tenders record payments; no payment gateway is connected.
- **Prescriptions:** patient/doctor/items/image capture, verification, partial fills, remaining quantities, equivalent substitution with consent and DAW protection. Select a verified prescription at POS. A fully dispensed prescription can start a new refill review, requiring fresh authorization and verification.
- **Returns/recalls:** full-receipt return review, original-batch restock or waste, refund accounting and frozen-lot buyer tracing. Issue actual refunds outside Medora.
- **Alerts/reports:** expiry/stock/recalls/sync review; sales, gross profit, top generics, expiry buckets, controlled register, immutable audit and CSV export. Tax is explicitly zero until jurisdiction-specific rules are implemented.
- **Settings/team:** policy, PIN, passwords, role-based accounts and deactivation.

All UI text is at least 14px, with self-hosted fonts, responsive navigation, keyboard focus, native modal focus handling, feedback states, animations and reduced-motion support.

## Offline behavior

An **already open, authenticated POS tab** can use its cached catalog to queue OTC sales in IndexedDB. Stock is not reserved offline. Reconnect, open Offline sync and press Sync now. The server rechecks stock, expiry, price, margin and timestamp; successful client IDs are idempotent. Rejected sales stay pending review without consuming stock. Keep browser storage intact until reconciliation.

Prescription/controlled and owner-override sales require a live connection in the UI. Sessions expire after eight hours. Fresh offline navigation shows instructions rather than caching private HTML. Queues are isolated by account; signing out clears the catalog cache and preserves unprocessed sales for that account.

## Verify

```sh
# From backend (after frontend dependencies are installed):
npm run verify
npm audit --omit=dev
# Browser prerequisites, from frontend:
npm run test:browser-install
```

API tests create isolated fixtures, clean mutable records, and retain immutable audit entries/empty test shops. Use a disposable test database. Browser tests deliberately create development sales, prescriptions and receipts. The automation template uses a fresh PostgreSQL service. With the strict two-folder layout it lives inside backend/automation/ and does not auto-run on GitHub. See [acceptance evidence](docs/acceptance.md).

## Deploy and operate

Build each app with npm run build from its own directory; supervise npm run start in each app and npm run worker from backend. Supply production PostgreSQL/Redis, HTTPS reverse proxy and backups. API binds loopback. Proxy /api/* to the API and preserve SSE streaming on /api/events. Frontend API_URL is configured at build time; PORT configures the API. Set NODE_ENV=production, exact HTTPS CORS_ORIGINS and a fresh random JWT_SECRET. Allow proxy read timeouts over 60 seconds for events.

Run migrations before new API versions. Separate a privileged migration account from a least-privilege runtime database account. Restore-test PostgreSQL/Redis backups. Docker compose down preserves volumes; down -v destroys local data.

Prescription images use access-controlled PostgreSQL storage (UI upload limit 1 MB). S3/SMTP/SMS/payment/HIS adapters are not connected. HL7 is an interface boundary only. Real catalog validation, tax configuration, payment settlement and regulatory certification remain deployment-specific.

See [architecture/API](docs/architecture.md), [acceptance evidence](docs/acceptance.md) and the original [spec](Project_spec.md).

## Advanced operations

- Customers: profiles, staff-recorded allergies/conditions, contact consent, credit limits, receipts, immutable-reference charges/collections, return credits, loyalty earning and CSV statements.
- Finance: cashier-owned register shifts, cash in/out, linked POS cash, collections, expenses, supplier invoice/payments, expected-vs-counted closing variance. External payments must be made before recording.
- Stock control: counter/warehouse/cold-room locations; draft, dispatch and receipt transfers; stock in transit is not sellable. Warehouse-only inventory is excluded from POS. Recalls freeze matching lots across locations.
- Cold chain: configurable monitor limits, manual readings, automatic excursion quarantine, location review and separate pharmacist batch disposition. No hardware sensor integration is claimed.
- Fulfillment: delivery state board, courier assignment, recipient proof and manual refill follow-up with recorded consent. No automatic SMS or route optimization is connected.
- Intelligence: transparent 30-day usage forecast, lead/target days, pack-rounded reorder drafts, ABC value classes, fast/slow/non-moving stock, receivables/payables, expense and expiry exposure summaries. Forecasts are planning estimates.

Start both servers from backend with npm run dev:all after installing both directories. Infrastructure lives in backend/infra; docs/specs/scripts live in backend; Playwright, browser tests and artifacts live in frontend. See [scope and research](docs/advanced-scope.md).
