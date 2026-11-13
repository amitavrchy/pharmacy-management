# Pharmacy Management — Tenant Isolation Review

Static review at commit `e5c9900`. No cross-tenant penetration test was executed; the integration suite that would exercise two shops could not run locally (no database).

## 1. Model

- Tenant = `Shop`. One PostgreSQL database, one schema, a `shopId` column on root entities.
- `User.shopId` binds each user to exactly one shop; `User.email` is globally unique.
- `AuthGuard` (`backend/src/auth/auth.ts:21-61`) verifies the session cookie, **reloads the user from the database on every request**, and sets `req.user.shopId` from that row. The client never supplies a tenant identifier.
- No PostgreSQL row-level security; isolation is enforced by application code only.

## 2. Query scoping — what was checked

Every controller listed below was read (fully or at each by-ID access) for a `shopId` condition:

| Module | Pattern observed | Result |
|---|---|---|
| Catalog | `where: { shopId }` on lists; `findFirst({ id, shopId })` before update | Scoped |
| Inventory | Lists by `shopId`; `findFirst({ id, shopId })` after row lock; movements `batch: { shopId }` | Scoped |
| Sales | Medicine, prescription, customer all read with `shopId`; sale created with actor's `shopId` | Scoped |
| Purchasing | Supplier, medicine, PO read with `shopId` | Scoped |
| Returns | `sale: { shopId }` | Scoped |
| Prescriptions | `findFirst({ id, shopId })` incl. image | Scoped |
| Customers, finance, fulfilment, sensors, transfers, alerts, settings, sync | Scoped lookup then update by ID | Scoped (spot-checked) |
| Reports | All aggregates filtered by `shopId` | Scoped |
| SSE | `auditEntry` latest by `shopId` | Scoped |
| Barcode cache | Redis key `barcode:<shopId>:<code>`; database read includes `shopId` | Scoped |

**No insecure direct object reference was found in the code that was read.** `operations/stock-control`, `fulfillment`, `intelligence` and `finance` were spot-checked rather than read line by line — REQUIRES FURTHER VERIFICATION by running a two-tenant test suite.

## 3. Confirmed isolation defects

| ID | Severity | Finding | Evidence | Impact |
|---|---|---|---|---|
| P-T1 | **Critical** | `Medicine.barcode` is unique across the whole database | `backend/prisma/schema.prisma` (`barcode String? @unique`); migration `20261104065910_initial_pharmacy/migration.sql:280` | The second pharmacy cannot register a product whose barcode another pharmacy already entered — and every pharmacy sells the same manufacturer barcodes. A whole CSV import fails with one generic 409 (`catalog.controller.ts:156-171`). It also discloses that some other tenant stocks that barcode |
| P-T4 | Medium | `Generic` is a global table that any tenant writes through `upsert`, and `GET catalog/generics` returns all rows | `catalog.controller.ts:72-74`, `:84-88`, `:158-162` | Tenants see each other's generic names, including typos; one tenant's mistake pollutes everyone's list |
| P-T5 | Low | Globally unique business keys: `Sale.clientSaleId`, `SyncReview.clientSaleId`, `Alert.key`, `CustomerLedger.reference`, `CashMovement.reference`, `Expense.reference`, `SupplierPayment.reference` | schema; `sales.service.ts:21-26` returns "Sale identifier belongs to another shop" | Existence disclosure; collision is unlikely with UUIDs but the constraint is at the wrong level |
| P-T6 | Low | Row locks are taken by ID without `shopId` before the scoped read | `sales.service.ts:40`, `:127`; `inventory.service.ts:68`; `purchasing.controller.ts:140`, `:248`; `returns.controller.ts:57`; `recalls.controller.ts:91`; `finance.service.ts:90`, `:185`; `stock-control.controller.ts:113` | A tenant who knew another tenant's row ID could hold a brief lock on it. IDs are unguessable CUIDs; low risk |

## 4. Structural gaps

| Gap | Evidence | Consequence |
|---|---|---|
| **No tenant creation path** | `auth.controller.ts` exposes login/me/logout/password only; shops and the first users are created by `prisma/seed.ts` | The product is effectively single-tenant per deployment today |
| No tenant lifecycle | `Shop` has no status, plan, trial or `createdAt` | Cannot suspend a non-paying shop, cannot enforce limits |
| No platform administrator | No role above OWNER | No way to support or manage tenants |
| No organisation → branch hierarchy | One `Shop`, many `StockLocation` | "Multi-branch" pricing cannot be sold; an owner with two pharmacies needs two unrelated accounts and cannot see combined reports |
| Child tables without `shopId` | `SaleLine`, `SaleLineBatch`, `SaleReturn`, `StockMovement`, `PurchaseOrderLine`, `GoodsReceiptLine`, `CustomerLedger`, `CashMovement`, `SupplierPayment`, `TemperatureReading`, `PrescriptionItem` | Correct today via parent joins; makes RLS, per-tenant export and deletion harder |
| Tenant-aware jobs | `maintenance.ts` iterates all shops and scopes each transaction by `shop.id` | Correct, but the worker is not running in production (see `reliability-review.md`) |
| Tenant file storage | Prescription images are base64 strings in `Prescription.imageData` | Stored per row, so scoped; but health data sits unencrypted in the main database |
| Tenant export / deletion / retention | None | Needed for off-boarding and data requests |
| Tenant-level configuration | `Shop` flags (`requirePharmacistForRx`, `saleWithoutBatchScan`, `minMarginBps`, `returnDays`) | Good; `NEAR_EXPIRY_DAYS` and `POS_OFFLINE_MAX_HOURS` are global env |

## 5. Recommended tenancy strategy

Keep **shared database, shared schema, `shopId` row scoping**. A database per tenant is not justified for thousands of small pharmacies: it multiplies migrations, connections and backups for no isolation benefit that the product needs.

Add, in this order:

1. `Organization` (the paying customer) → `Shop` (branch). Users gain an organisation membership and per-shop roles. Existing data migrates one organisation per shop.
2. Fix P-T1: `@@unique([shopId, barcode])`. Scope the other business keys by `shopId` (P-T5).
3. Master catalogue: turn `Generic` into platform-owned reference data (read-only for tenants) plus an optional tenant-level alias; see `medicine-database-research.md`.
4. Defence in depth: PostgreSQL row-level security on root tables keyed by a per-transaction `SET LOCAL app.shop_id`, **or** a Prisma client extension that injects `shopId` and refuses unscoped queries. RLS requires adding `shopId` to child tables first.
5. Tenant lifecycle: status (`TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`), plan, limits, created/closed dates; platform-admin role and console.
6. Per-tenant export (CSV/JSON bundle) and a retention/deletion procedure.

## 6. Tests to add (currently absent)

- Two shops, same barcode → both succeed.
- User of shop A requests each `GET/POST/PATCH` by ID with an ID from shop B → 404 for every route (generate this matrix from the route list).
- `catalog/generics` returns only platform data plus the caller's own.
- Suspended shop: writes rejected, reads allowed for a grace period.
- Maintenance job run with two shops produces alerts only in the right shop.

## 7. Verdict

Application-level scoping is consistent and carefully done in the transactional code. The product nevertheless **cannot operate as multi-tenant SaaS today** because of the global barcode constraint and the absence of any tenant onboarding, lifecycle or administration.
