# Fixing Master Prompt — pharmacy-management ("Medora")

Paste into a coding-agent session at the repository root. Work stage by stage; each numbered task is one reviewable pull request.

---

## Context

**Medora** is a pharmacy management SaaS for Bangladesh: POS, batch/expiry inventory, purchasing, prescriptions, customer credit, cash registers. It must become a multi-tenant product sold by subscription to pharmacy owners.

**Stack (verified):**

- `backend/`: NestJS 11, Prisma 7 (`@prisma/adapter-pg`, `prisma.config.ts`), PostgreSQL, zod, `@nestjs/jwt` in an httpOnly `session` cookie, scrypt hashing, ioredis, bullmq worker (`src/jobs/worker.ts`), csv-parse. Tests: `npm test` = `tsc` then `node --test dist/test/*.test.js` (needs a database for integration files). **Requires Node ≥ 20.19 (use 22 or 24).**
- `frontend/`: Next.js App Router (standalone), React, plain CSS, `idb` offline queue (`src/lib/offline.ts`), service worker `public/sw.js`, Playwright in `e2e/`.
- `deploy/` + `.github/workflows/deploy.yml`: GHCR → EC2 Docker Compose (`backend`, `frontend`, `worker` under profile `worker`).

**Architecture:** `backend/src/app.module.ts` registers 19 controllers and services `Db`, `InventoryService`, `SalesService`, `FinanceService`, `BarcodeCache`; global `AuthGuard` (`src/auth/auth.ts`) with `@Public()` and `@Roles()`. Tenant = `Shop`; `req.user.shopId` comes from the user's database row. All stock/money mutations run inside `Db.atomic()` (Serializable + retry, `src/db/prisma.service.ts`). FEFO planning in `src/common/domain.ts`. Audit via `src/common/audit.ts` (table is immutable by trigger).

**Rules for every task**

1. Read the named files first. No rewrites outside the task.
2. Do not weaken: `Db.atomic` usage, `FOR UPDATE` ordering, FEFO filters, `clientSaleId` idempotency, role checks, shop scoping (every query on tenant data filters by `shopId` from `req.user`), cost masking for non-owner roles, audit calls.
3. Schema changes are Prisma migrations, safe on populated tables (nullable/default first, backfill, then constrain). Never edit an applied migration.
4. Every behavioural change gets a test in `backend/test` (integration against a real database) or Playwright. Add a negative tenant-isolation test for every new by-ID route.
5. After each task run and report: `npm --prefix backend run check`, `npm --prefix backend test`, `npm --prefix frontend run check`. Never state that a test passed without running it.
6. Money is integer paisa; quantities are `Decimal(14,3)`; business dates are Asia/Dhaka (`shopDate`).
7. No unrelated dependency upgrades or formatting churn.

---

## Stage 1 — Critical security and data integrity

1.1 **Repository hygiene.** Replace the root `.gitignore` (attacker remnant: `config.bat`, `node_modules`). Scan for `init` files, `eval(`, `atob(`, lines > 1,000 chars in source; report.

1.2 **CI.** Move `backend/automation/github/workflows/ci.yml` to `.github/workflows/ci.yml`; ensure Node 22/24, Postgres and Redis services; make `deploy.yml` depend on CI success. Add `"engines": {"node": ">=22"}` to both `package.json` files.

1.3 **Barcode scope.** `Medicine`: remove `@unique` on `barcode`, add `@@unique([shopId, barcode])`. Migration: drop `Medicine_barcode_key`, create the composite unique index. Update `BarcodeCache` (already keyed by shop). Test: two shops create the same barcode.

1.4 **Catalogue import.** In `catalog.controller.ts` `import`: validate all rows first and return `{ imported, errors: [{row, message}] }`; skip duplicates within the shop with a per-row error instead of failing the whole file; remove `P2002` from the retry list in `Db.atomic` (`prisma.service.ts:36`).

1.5 **Generics.** Stop tenant writes to the global `Generic` table: add `Generic.shopId String?` (null = platform). Tenant creates go to shop-scoped rows; `GET catalog/generics` returns platform rows plus the caller's. Backfill: existing rows become platform rows.

1.6 **Scope global keys.** Make `Sale.clientSaleId`, `SyncReview.clientSaleId`, `Alert.key`, and the `reference` columns unique per shop (add `shopId` where missing via parent backfill). In `sales.service.ts` look up the existing sale by `(shopId, clientSaleId)`; remove the "belongs to another shop" message.

1.7 **Rate limiting.** Add a Redis-backed throttle (fallback memory in dev): 300 req/min per user, 30/min per IP unauthenticated, and move the login attempt map to Redis keyed by email (not only IP+email).

1.8 **Owner PIN lock.** In `SalesService.complete`, count failed PIN checks per shop+actor in Redis; after 5 failures in 15 minutes reject further PIN attempts, write `audit(…, "sale.pin_locked")` and create an alert for the owner.

1.9 **Hashing.** Replace `scryptSync` with promisified `crypto.scrypt` in `auth/password.ts`; update all callers to `await`.

1.10 **Sessions and reset.** Add `User.tokenVersion`; include in JWT; guard rejects mismatches; bump on password change and deactivation. Add `POST settings/users/:id/password` (owner resets staff password, audited). Add owner self-reset by one-time code (delivery through the notification interface of Stage 6; console adapter in dev).

1.11 **DB guards.** Migration with CHECK constraints: `StockBatch.qtyOnHand >= 0`, `PurchaseOrderLine.receivedQty <= qty`, `SaleLineBatch.returnedQty BETWEEN 0 AND qty`, `SupplierBill.paidMinor BETWEEN 0 AND totalMinor`. Backfill `StockBatch.locationId` to the shop's `MAIN` location and set `NOT NULL`.

1.12 **Headers.** Add CSP and HSTS in `frontend/next.config.ts`.

Stage 1 acceptance: PHM-014, 020, 021, 023, 031, 081, 082 in `product-audit/pharmacy-management/test-cases.md` pass; CI green.

## Stage 2 — Broken functional workflows

2.1 **Offline sale time.** Store `soldAt` as `Sale.completedAt` when supplied and valid; add `Sale.syncedAt`. Reports use `completedAt`.
2.2 **Sync reviews.** `POST sync/reviews/:id/resolve` (`OWNER`, body: `{action: "DISCARD"|"RECORDED_MANUALLY", note}`), audited; client removes resolved items and stops re-pushing them.
2.3 **Returns.** New `SaleReturnLine` (saleLineBatchId, qty). Request selects lines/quantities; approval restocks or wastes per allocation, decrements `PrescriptionItem.qtyDispensed`, computes refund proportionally, records refund per tender: cash → `CashMovement` on the approver's **current open shift** (require one), mobile/card → refund record. Sale status becomes `PARTIALLY_RETURNED` or `RETURNED`.
2.4 **Purchase returns.** Link to supplier; create `SupplierCredit` reducing payable (or a negative bill line); reject for blocked batches unless reason is expiry/recall.
2.5 **Catalogue and supplier editing.** Extend `PATCH catalog/:id` to all descriptive fields with audit of old/new; add `PATCH purchasing/suppliers/:id`.
2.6 **Worker.** Remove the compose `profiles` gate; add Redis (or shared Valkey) to the stack; health endpoint includes last maintenance run time.
2.7 **Maintenance rewrite.** Per shop, outside Serializable: one `UPDATE … WHERE expiryDate <= today` for quarantine; one grouped query for low stock; one for expiry buckets; bulk upsert alerts (`INSERT … ON CONFLICT`). Stagger shops; cap runtime; log duration.
2.8 **Sales history.** `GET pos/sales` with `from`, `to`, `q` (receipt id, customer phone/name), `page`, `limit`.

## Stage 3 — Database and architecture

3.1 Index migration from `product-audit/pharmacy-management/database-audit.md` §4.
3.2 Foreign keys for columns listed in §3 of that file (orphan report first).
3.3 **Tenancy model.** Add `Organization` (name, status `TRIAL|ACTIVE|PAST_DUE|SUSPENDED|CLOSED`, createdAt); `Shop.organizationId`; `OrganizationMember` (userId, role `OWNER|ADMIN`); keep `User.shopId` for now and add `UserShopRole` for multi-branch later. Backfill one organisation per existing shop.
3.4 Add `shopId` to child tables (`SaleLine`, `SaleLineBatch`, `StockMovement`, `SaleReturn`, `PurchaseOrderLine`, `GoodsReceiptLine`, `CustomerLedger`, `CashMovement`, `SupplierPayment`, `PrescriptionItem`, `TemperatureReading`) with backfill; then add a Prisma client extension (or RLS policies with `SET LOCAL app.shop_id`) that refuses tenant-table queries without a shop filter.
3.5 Extract services from `operations/stock-control.controller.ts`, `purchasing.controller.ts`, `returns.controller.ts`. No behaviour change.
3.6 Two-tenant isolation test suite generated from the route list: every by-ID route called with a foreign ID must return 404.

## Stage 4 — Performance and reliability

4.1 Pagination + server search for `GET catalog` (compact POS index variant: id, names, barcode, price, stock, nextExpiry) and `GET inventory` (filters: expiring, low, zero hidden by default).
4.2 Dashboard and `reports/sales` computed with SQL aggregates; report returns totals and a paginated sale list; require a bounded date range (max 366 days).
4.3 Refresh events: SSE payload carries `{entity, id}` derived from the audit action; `use-resource` subscribes by entity; one poller per process shared by all subscribers of a shop (or `LISTEN/NOTIFY`).
4.4 Batch the sale transaction: load all cart medicines and all candidate batches in two queries; keep lock order.
4.5 `BarcodeCache`: circuit-break for 60 s after a Redis failure; no default URL when `REDIS_URL` is unset.
4.6 Deploy pipeline order and rollback; structured logs with request ID; error tracker behind env.

## Stage 5 — UI/UX

Follow the prompt at the end of `product-audit/pharmacy-management/ui-ux-audit.md`.

## Stage 6 — Missing commercial features

6.1 **Notification service** (console/SMS/email adapters, BullMQ, de-dupe key, per-organisation SMS credit ledger).
6.2 **Sign-up and onboarding**: public `POST onboarding/register` (rate-limited; phone OTP or email verification) creating organisation, shop, owner, `MAIN` location and trial subscription; onboarding wizard pages.
6.3 **Purchase invoice entry**: `POST purchasing/invoices` creating batches (with `mrpMinor`), movements, supplier bill and optional price updates in one `atomic` call; PO becomes optional.
6.4 **Real offline POS**: versioned precache of the shell and POS route in `public/sw.js`; local stock decrement in `lib/offline.ts`; offline banner; sync summary.
6.5 **Day-end summary and stock valuation** endpoints and pages.
6.6 **Master catalogue** tables and read-only API; "add from master"; tenant submissions queue (see `product-audit/pharmacy-management/medicine-database-research.md`). Do not import any third-party dataset without recorded permission.
6.7 **Prescription images** to private object storage with signed URLs.
6.8 **Bangla** UI and receipts; printer presets.

## Stage 7 — Monetization and subscription

7.1 Models: `Plan`, `Subscription` (organisationId unique, status, period, limits snapshot), `SubscriptionPayment` (method, reference unique per method, amountMinor, status, reviewer, note, collectedBy), `SubscriptionEvent`.
7.2 Guard: after authentication, load organisation + subscription (cache 60 s). Rules: `SUSPENDED` → block all but billing/export; expired beyond grace → back-office writes blocked, POS allowed for the configured extra days with a start-of-day warning, then blocked.
7.3 Entitlements: max users/branches (count inside a transaction with `FOR UPDATE` on the organisation), feature flags via a `@Feature()` decorator, exposed in `auth/me` for navigation.
7.4 Owner billing pages: plans, submit payment reference, history, receipt PDF.
7.5 Platform admin module (`platformAdmin` flag on `User`, separate guard): tenants, payments review (must enter the received amount), grant with idempotency key, suspend/reactivate, audited support access.
7.6 Jobs: reminders T-7/T-3/T-0, grace transitions.
7.7 Tests: duplicate reference, amount mismatch, double approval, limit enforcement under concurrency, suspended tenant behaviour.

(Design reference: `school-college-erp/backend/src/saas/` in the sibling repository.)

## Stage 8 — Production infrastructure

8.1 Managed PostgreSQL with PITR on its own instance; nightly logical dump to object storage; restore drill script.
8.2 Redis/Valkey; worker service; two API containers with health-based upstreams.
8.3 Staging environment with seeded demo tenant; production tenants are never created by the demo seed.
8.4 Monitoring and alerts: uptime, sale error rate, serialization retries, maintenance lag, DB connections, disk.
8.5 Runbooks in `deploy/`.

## Stage 9 — Final QA and regression

9.1 CI green: unit, integration, isolation matrix, Playwright (desktop + 360×800).
9.2 Run the POS scenarios in `product-audit/testing/load-testing-plan.md` on staging; record latency percentiles, error rate, retries, zero oversell.
9.3 Two-week pilot in at least one real pharmacy with daily stock and cash reconciliation; log discrepancies.
9.4 Re-run every row of `product-audit/pharmacy-management/test-cases.md` and update statuses.
9.5 Readiness note: passed / failed / not run.

## Global acceptance criteria

- A new pharmacy can sign up, add medicines (including barcodes another shop uses), enter opening stock, sell, receive a supplier invoice, process a partial return with a correct cash record, and close the day — without operator help.
- No request can read or lock another shop's data (isolation suite).
- Offline: POS opens after reload with no network; queued sales sync once with their original time; rejected ones can be resolved.
- Subscription state is enforced and never blocks an in-progress sale.
- Backups restore; deploys roll back on failure; alerts are generated by a running worker.
