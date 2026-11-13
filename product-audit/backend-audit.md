# Pharmacy Management — Backend Engineering Audit

Static review of `backend/src` (≈ 3,500 lines) at commit `e5c9900`.

## 1. Architecture

| Aspect | Assessment |
|---|---|
| Structure | Folder per domain; four injectable services for the hardest logic (`SalesService`, `InventoryService`, `FinanceService`, `BarcodeCache`); the remaining 15 controllers contain their own logic |
| Transactions | `Db.atomic()` wraps work in a Serializable transaction with up to three retries on serialization failure (`db/prisma.service.ts:17-47`). Used consistently for every stock or money mutation |
| Domain core | `common/domain.ts` holds a pure FEFO planner (`planFefo`), decimal-safe money rounding and Dhaka-date helpers, all unit tested |
| Authorization | Global guard + role decorator; tenant from the user row |
| Coupling | `returns` and `sales` import `tenderAmount`/`validateShift` from `operations/finance.service.ts` as plain functions; acceptable |
| Typing | `r: any` for the request in every handler; `user: any` in places |

This is the strongest transactional core of the three products. The weaknesses are around it: reads, lifecycle features and jobs.

## 2. Business logic — verified strengths

| Rule | Evidence |
|---|---|
| Stock can never go negative under concurrency | Batches of the medicine are locked `FOR UPDATE` in a stable order; FEFO plan requires full quantity; Serializable isolation (`inventory.service.ts:18-58`, `sales.service.ts:61-117`) |
| Expired, recalled, quarantined or non-dispensing-location stock is never allocated | `domain.ts:53-60`, `inventory.service.ts:19-32` |
| Duplicate invoices prevented | `clientSaleId` unique + early return of the existing sale (`sales.service.ts:17-27`) |
| Tender total must equal payable; discount ≤ subtotal; credit within customer limit | `sales.service.ts:118-147` |
| Below-margin sale requires owner PIN and is audited | `sales.service.ts:152-170` |
| Prescription and controlled-drug rules, substitution rules | `sales.service.ts:70-104` |
| Goods receipt: cannot exceed ordered quantity, cannot receive expired stock, pack-to-unit conversion | `purchasing.controller.ts:135-155` |
| Cost prices hidden from non-owner roles | several controllers |

## 3. Defects and gaps

| ID | Class | Finding | Evidence |
|---|---|---|---|
| P-B1 | CONFIRMED BUG | Offline sale time is validated but discarded; `completedAt` is the sync time, so offline sales appear in the wrong day and shift | `sales/sales.service.ts:28-35` (check), `:171-202` (no `completedAt` in create), `sale.schema.ts:33` |
| P-B2 | CONFIRMED BUG | Approved cash returns create a `REFUND` cash movement only if the original shift is still open; later returns record no cash-out, and bKash/Nagad/card refunds are never recorded | `returns/returns.controller.ts:142-157` |
| P-B3 | MISSING FEATURE | Returns are whole-receipt only; no partial quantity or single line. Prescription `qtyDispensed` is not reversed | `returns.controller.ts:83-110` |
| P-B4 | CONFIRMED BUG | Purchase return only reduces stock; no supplier credit, no link to a bill or order, no batch-status check | `purchasing/purchasing.controller.ts:239-271` |
| P-B5 | CONFIRMED BUG | A rejected offline sale stays `PENDING_REVIEW` forever: there is no endpoint to resolve or dismiss it, and the client re-pushes it on every sync | `sync/sync.controller.ts:21-73`, `frontend/src/lib/offline.ts:35-49` |
| P-B6 | MISSING FEATURE | Medicines: only price, reorder level and active flag are editable; name, strength, barcode, manufacturer cannot be corrected. Suppliers cannot be edited | `catalog/catalog.controller.ts:96-123`, `purchasing.controller.ts:18-40` |
| P-B7 | CONFIRMED ARCHITECTURAL WEAKNESS | Unbounded reads: full catalogue with batches, all batches, 7 days of sales + all medicines + all batches for the dashboard, unbounded sales report that also returns every sale; sales list fixed at the latest 300 | `catalog.controller.ts:35-71`, `inventory.controller.ts:12-24`, `reports.controller.ts:9-60`, `:105-170`, `sales.controller.ts:19-28` |
| P-B8 | MISSING FEATURE | Tax is hard-coded to zero with a note to confirm rules | `reports.controller.ts` (`taxMinor: 0`) |
| P-B10 | CONFIRMED ARCHITECTURAL WEAKNESS | SSE issues one database query every 5 seconds per connected browser | `events/events.controller.ts:14-34` |
| P-B11 | POTENTIAL RISK | Barcode cache defaults to `redis://localhost:6386` when unset and swallows errors; with Redis absent each scan first waits for a failed Redis command | `catalog/barcode-cache.service.ts:6-18` |
| P-B12 | CONFIRMED BUG | `atomic()` retries unique-constraint violations (`P2002`) three times before failing; a duplicate barcode import does the whole import four times | `db/prisma.service.ts:36` |
| P-B14 | MISSING FEATURE | Purchasing requires a purchase order before stock can be received; unit cost is fixed at order time and a lot with a different cost is rejected; no free/bonus quantity, purchase discount or VAT | `purchasing.controller.ts:119-238` (`:176-185`) |
| P-B15 | MISSING FEATURE | One selling price per medicine; no batch-level MRP, no pack/strip pricing, no price history | `schema.prisma` `Medicine.priceMinor` |
| P-B16 | CONFIRMED ARCHITECTURAL WEAKNESS | No pagination or server-side search parameters on any list route | all controllers |

## 4. Jobs

| ID | Finding | Evidence |
|---|---|---|
| P-J1 | The maintenance worker is not started in the documented production stack (compose profile `worker`, Redis "not provisioned") — no low-stock, near-expiry, expired or sync-review alerts are generated, no batch is auto-quarantined, no controlled-drug snapshot is written | `deploy/docker-compose.prod.yml` (`profiles: ["worker"]`), `deploy/.env.example` |
| P-J2 | `maintenance()` processes each shop in one Serializable transaction (15 s timeout) that loads every medicine with every batch and upserts an alert per item; it will time out on real catalogues and contend with live sales | `jobs/maintenance.ts:3-151` |

Expired stock still cannot be sold when the job is down, because allocation filters on expiry date at sale time.

## 5. API quality

- Consistent error shape `{ message }` (`common/error.filter.ts`); `P2002` mapped to a single message "check barcode or email" regardless of entity.
- Business-rule failures use `requireThat` → 400 with clear text.
- No versioning or OpenAPI; `backend/docs/architecture.md` lists routes by hand.
- `PATCH settings` requires the full object rather than a partial.

## 6. Error handling and resilience

- Unknown errors are logged with stack; no request context, no tracker.
- No outbound HTTP calls exist, so no timeout policy is needed yet.
- Graceful shutdown hooks enabled; the worker handles SIGTERM.
- Serialization retries are immediate (no backoff) in `atomic()`.

## 7. Recommendations (ordered)

1. Tenancy and onboarding prerequisites (`tenant-isolation-review.md`).
2. P-B1: persist `soldAt` as `completedAt` for accepted offline sales and store `syncedAt` separately.
3. P-B2/P-B3/P-B4: a proper returns model — line-level quantities, refund method per tender, a cash movement against the **current** open shift, supplier credit notes.
4. P-B5: `POST sync/reviews/:id/resolve` with reason; client stops re-pushing resolved items.
5. P-B7/P-B16: pagination, search and date filters on catalogue, inventory, sales; aggregate reports in SQL.
6. P-J1/P-J2: run the worker; rewrite maintenance as set-based SQL per shop outside Serializable isolation.
7. P-B14/P-B15: direct purchase invoice entry with batch MRP, bonus quantity and discounts — this is how Bangladeshi pharmacies actually buy.
8. P-B10: one shared poll or Postgres `LISTEN/NOTIFY` fan-out instead of per-client polling.
