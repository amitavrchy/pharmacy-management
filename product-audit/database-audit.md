# Pharmacy Management — Database Audit

Source: `backend/prisma/schema.prisma` (33 models) and three migrations. No live database; index findings are derived from schema plus queries in code.

## 1. Schema design

| Topic | Finding |
|---|---|
| Keys | `cuid()` text primary keys |
| Quantities | `Decimal(14,3)` — correct for fractional units |
| Money | `Int` paisa; validator caps single amounts at 100,000,000 (BDT 10 lakh); sale total capped at the same value (`sales.service.ts:148-151`) |
| Dates | Expiry as `@db.Date`; business day computed in Asia/Dhaka (`common/domain.ts:4-14`) |
| Enumerations | Only `Role` is an enum. Batch, PO, sale, return, shift, transfer, delivery, reminder statuses are strings |
| Audit | `AuditEntry` with `(shopId, createdAt)` index and an immutability trigger; `StockMovement` ledger per batch |
| Soft delete | None; medicines and customers have an `active` flag |
| Tenant column | Present on root tables; absent on child tables (listed in `tenant-isolation-review.md`) |

## 2. Constraints

| Constraint | Status |
|---|---|
| `Medicine.barcode` unique | **Wrong scope** — global; must be `(shopId, barcode)` (P-T1) |
| `StockBatch (shopId, medicineId, lotNumber, expiryDate, locationId)` unique | Good. The earlier four-column index is dropped by `20261104090000_advanced_operations/migration.sql:2` (verified), so the same lot can exist in two locations. Note: PostgreSQL treats NULL `locationId` as distinct, so two NULL-location rows for one lot are not prevented by this index |
| `Customer (shopId, phone)` unique | Good |
| `SupplierBill (shopId, supplierId, invoiceNumber)` unique | Good |
| `StockLocation (shopId, code)` unique | Good |
| `Sale.clientSaleId`, `Alert.key`, `*.reference` unique | Global; should include `shopId` |
| `qtyOnHand >= 0` | **No CHECK constraint.** Enforced only in application code |
| `receivedQty <= qty`, `paidMinor <= totalMinor`, `returnedQty <= qty` | No CHECK constraints |

Legacy batches created before locations existed have `locationId = NULL`; goods receipt now always assigns the `MAIN` location (`purchasing.controller.ts:162-178`), so new NULL rows should not appear. A backfill of old NULL rows to `MAIN` followed by `NOT NULL` would close the gap.

## 3. Referential integrity

Declared relations (with foreign keys): `User→Shop`, `Medicine→Shop/Generic`, `StockBatch→Shop/Medicine/StockLocation`, `Supplier→Shop`, `PurchaseOrder→Supplier`, PO lines and receipts, prescription and items, `Sale→Shop/Customer/RegisterShift/Prescription`, sale lines and batches, `SaleReturn→Sale`, `StockMovement→StockBatch`, `Alert→Shop`, `AuditEntry→Shop`, ledgers to parents, sensors and readings.

Missing foreign keys — **CONFIRMED ARCHITECTURAL WEAKNESS**: `PurchaseOrder.shopId`, `Sale.cashierId`, `Customer.shopId`, `RegisterShift.shopId/cashierId`, `Expense.shopId`, `SupplierBill.shopId/supplierId/poId`, `StockLocation.shopId`, `StockTransfer.shopId/batchId/destinationId/receivedBatchId`, `TemperatureSensor.shopId`, `Delivery.shopId/saleId`, `RefillReminder.shopId/customerId/prescriptionId`, `SyncReview.shopId`, and every `actorId`/`createdBy`/`verifiedBy`/`approvedBy`.

## 4. Indexes

Existing non-unique indexes: `Medicine(shopId, genericId)`, `StockBatch(shopId, medicineId, expiryDate)`, `PurchaseOrder(shopId, createdAt)`, `Prescription(shopId, capturedAt)`, `Sale(shopId, completedAt)`, `AuditEntry(shopId, createdAt)`, `Customer(shopId, name)`, `RegisterShift(shopId, status)`, `Expense(shopId, createdAt)`, `StockTransfer(shopId, status)`, `RefillReminder(shopId, dueDate)`.

Missing for current queries:

| Table | Index | Used by |
|---|---|---|
| `SaleLine` | `(saleId)`, `(medicineId)` | every sale read, reports, recall trace |
| `SaleLineBatch` | `(saleLineId)`, `(batchId)` | sale read, returns, recall trace |
| `StockMovement` | `(batchId, createdAt)` | movement history |
| `SaleReturn` | `(saleId)` | return checks |
| `PurchaseOrderLine`, `GoodsReceiptLine` | `(poId)` | order views, receiving |
| `PrescriptionItem` | `(prescriptionId)` | prescription reads |
| `CustomerLedger` | `(customerId, createdAt)` | statements |
| `CashMovement` | `(shiftId)` | shift totals |
| `Sale` | `(shiftId)`, `(customerId)` | shift close, statements |
| `Medicine` | `(shopId, active, brandName)` | catalogue list; add a trigram index for name search when search moves server-side |
| `Supplier`, `User` | `(shopId)` | lists |
| `Alert` | `(shopId, resolvedAt, createdAt)` | alert list, dashboard count |
| `SupplierBill` | `(shopId, status, dueDate)` | payables |
| `Delivery` | `(shopId, status)` | delivery board |
| `TemperatureReading` | `(sensorId, createdAt)` | sensor history |

## 5. Query performance

- Catalogue and inventory endpoints return whole tables per shop (P-B7). A realistic shop has several thousand SKUs and accumulates batch rows forever (zero-quantity batches are never archived).
- Dashboard recomputes from raw rows on every view.
- Sales report loads every sale with nested lines, medicines, generics and batches for the range.
- Maintenance loads all medicines with all batches per shop inside a Serializable transaction.

## 6. Transaction safety

| Operation | Assessment |
|---|---|
| Sale | Serializable, ordered `FOR UPDATE`, idempotent. Strong |
| Cycle count | Row lock + scoped read + movement + audit. Strong |
| Goods receipt | PO row lock, quantity guard, batch upsert, movement. Strong |
| Customer return | Return row lock; restock or waste per allocation. Correct for whole receipts; refund side incomplete (P-B2) |
| Purchase return | Batch lock and decrement only |
| Supplier payment, customer collection | Row locks and unique `reference` for idempotency |
| Lost updates on `Medicine.priceMinor` | Last write wins; acceptable |

Serializable isolation with retries is safe but costly under contention; long read-heavy transactions (maintenance) should not use it.

## 7. Migrations

Three forward migrations; no destructive statements in the parts inspected. Prisma 7 with `prisma.config.ts`; the image build passes a placeholder `DATABASE_URL` for `generate`. Deploy applies migrations after containers start (same ordering defect as the other products). No pre-migration backup.

## 8. Recommended changes

1. `Medicine`: drop global barcode unique; add `@@unique([shopId, barcode])`.
2. Backfill `StockBatch.locationId` for legacy rows and make it `NOT NULL`.
3. CHECK constraints: `qtyOnHand >= 0`, `receivedQty <= qty`, `returnedQty BETWEEN 0 AND qty`, `paidMinor BETWEEN 0 AND totalMinor`, amounts ≥ 0.
4. Index migration from §4.
5. Scope global unique keys by shop.
6. Foreign keys for the columns in §3 (validate after orphan check).
7. Status enums or CHECKs.
8. New entities: `Organization`, subscription tables, master catalogue tables (`medicine-database-research.md`), purchase invoice, batch MRP, return lines.
9. Move `Prescription.imageData` out of the table.

## 9. Verification

- Integration test: two shops insert the same barcode.
- `EXPLAIN (ANALYZE)` on sale read and recall trace shows index scans on `SaleLine`/`SaleLineBatch`.
- Attempted `UPDATE "StockBatch" SET "qtyOnHand" = -1` fails.
- No `StockBatch` row has a NULL `locationId` after the backfill.
