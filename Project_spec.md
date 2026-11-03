# Pharmacy Management System — Project Spec

> Stack: **Next.js (PWA POS) + NestJS + Prisma + PostgreSQL + Redis/BullMQ**  
> Retail/hospital pharmacy for Bangladesh: FEFO batch/expiry, supplier purchasing, POS, prescription-wise sales, generic/brand (DGDA-style) catalog, returns.

---

## 1. Overview & Goals

### Product
Manage medicine inventory with strict expiry control, sell via barcode POS (OTC + prescription), purchase from suppliers, track controlled drugs lightly, and support returns/recalls.

### Engineering goals
- **FEFO allocation** mandatory for outbound stock.
- Prescription sale linkage (doctor, patient optional, Rx image/number).
- Generic ↔ brand mapping (DGDA-inspired; importable CSV).
- Near-expiry alerts and quarantine.
- Offline-capable POS sync for shop counter.

### Non-goals
- Full hospital HIS integration (HL7 adapter interface only).
- Manufacturing / compounding MRP.

---

## 2. User Roles & Permissions (RBAC)

| Role | Permissions |
|------|-------------|
| `OWNER` | All settings, costs, suppliers, users, reports |
| `PHARMACIST` | Verify Rx, dispense, controlled log, returns approve |
| `CASHIER` | POS sell OTC; Rx sale if pharmacist verified flag |
| `STORE_KEEPER` | GRN, stock adjust (limited), transfers |
| `AUDITOR` | Read-only stock & sales |

Flags: `requirePharmacistForRx`, `allowNegativeStock`, `saleWithoutBatchScan`.

---

## 3. Feature Modules

1. Catalog — generic, brand, strength, form, pack size, barcode, schedule (OTC/Rx/controlled).
2. Inventory — batches, FEFO, rack locations, adjustments, cycle count.
3. Purchasing — suppliers, PO, GRN, purchase returns.
4. POS — cart, barcode, Rx attachment, discounts, multi-tender.
5. Prescriptions — capture, verify, partial fill, refill.
6. Returns & recalls — customer return within policy; batch recall freeze.
7. Alerts — expiry, low stock, controlled variance.
8. Reports — sales, GP%, expiry ageing, top generics, tax.
9. Offline sync.

---

## 4. Advanced Business Logic

### 4.1 FEFO sale allocation
Same as supermarket FEFO: lock batches `FOR UPDATE`, sort `expiryDate ASC`, allocate, write `SaleLineBatch`. Reject if would sell expired (`expiryDate < today` in shop TZ).

### 4.2 Prescription-wise sale
```
Rx status: CAPTURED → VERIFIED → PARTIALLY_DISPENSED → DISPENSED | CANCELLED
On dispense line: link SaleLine.prescriptionItemId; decrement remainingQty
Partial fill allowed; controlled items require PHARMACIST role + witness optional
```

### 4.3 Generic substitution
- Suggest cheaper brands with same `genericId` + strength + form if `allowSubstitution` and customer consents (flag on sale).
- Never substitute if `dispenseAsWritten` on Rx item.

### 4.4 Expiry & recall
- Nightly job: move batches with `expiryDate <= today` to `QUARANTINED`; block POS.
- Recall: mark `batch.recalled=true` → cannot sell; list customers who bought (traceability via SaleLineBatch).

### 4.5 Margin protection
- Block discount below `minMarginBps` unless OWNER override PIN.

### 4.6 Edge cases
- Split packs / loose tablets: qty Decimal; pack-to-unit conversion on purchase.
- Same barcode different packs → enforce unique barcode per sellable SKU.
- Customer return: restock to original batch if unexpired else waste bin.
- Clock skew offline: reject sync lines that sold expired relative to server date.
- Controlled drug: daily register report; variance requires OWNER note.

---

## 5. State Machines

**PurchaseOrder**: `DRAFT → ORDERED → PARTIAL → RECEIVED | CANCELLED`  
**Batch**: `ACTIVE → QUARANTINED → EXPIRED_WASTED | RECALLED`  
**Prescription**: `CAPTURED → VERIFIED → PARTIALLY_DISPENSED → DISPENSED | CANCELLED`  
**Sale**: `OPEN → COMPLETED | VOID` (+ sync states)  
**Return**: `REQUESTED → APPROVED → RESTOCKED | REJECTED`

---

## 6. Prisma Schema Draft

```prisma
model Shop {
  id String @id @default(cuid())
  name String
  drugLicenseNo String?
  timezone String @default("Asia/Dhaka")
  currency String @default("BDT")
}
model User {
  id String @id @default(cuid())
  shopId String
  name String
  role String
  pinHash String?
  passwordHash String?
}
model Generic {
  id String @id @default(cuid())
  name String @unique
  therapeuticClass String?
}
model Medicine {
  id String @id @default(cuid())
  shopId String?
  genericId String
  brandName String
  strength String
  form String // tablet syrup injection
  packSize Int @default(1)
  barcode String?
  schedule String @default("OTC") // OTC RX CONTROLLED
  unitName String @default("pcs")
  @@index([genericId])
  @@unique([barcode])
}
model StockBatch {
  id String @id @default(cuid())
  shopId String
  medicineId String
  lotNumber String
  expiryDate DateTime @db.Date
  qtyOnHand Decimal @db.Decimal(14,3)
  costMinor Int
  status String @default("ACTIVE")
  recalled Boolean @default(false)
  @@index([shopId, medicineId, expiryDate])
  @@unique([shopId, medicineId, lotNumber, expiryDate])
}
model Supplier { id String @id @default(cuid()) shopId String name String phone String? }
model PurchaseOrder {
  id String @id @default(cuid())
  shopId String
  supplierId String
  status String
}
model GoodsReceiptLine {
  id String @id @default(cuid())
  poId String?
  medicineId String
  lotNumber String
  expiryDate DateTime @db.Date
  qty Decimal @db.Decimal(14,3)
  costMinor Int
  batchId String?
}
model Prescription {
  id String @id @default(cuid())
  shopId String
  rxNumber String?
  doctorName String?
  patientName String?
  patientPhone String?
  imageUrl String?
  status String
  verifiedBy String?
  capturedAt DateTime @default(now())
}
model PrescriptionItem {
  id String @id @default(cuid())
  prescriptionId String
  medicineId String?
  genericId String?
  freeText String?
  qtyPrescribed Decimal @db.Decimal(14,3)
  qtyDispensed Decimal @db.Decimal(14,3) @default(0)
  dispenseAsWritten Boolean @default(false)
}
model Sale {
  id String @id @default(cuid())
  shopId String
  cashierId String
  clientSaleId String @unique
  prescriptionId String?
  status String
  totalMinor Int
  discountMinor Int @default(0)
  completedAt DateTime?
}
model SaleLine {
  id String @id @default(cuid())
  saleId String
  medicineId String
  qty Decimal @db.Decimal(14,3)
  unitPriceMinor Int
  prescriptionItemId String?
}
model SaleLineBatch {
  id String @id @default(cuid())
  saleLineId String
  batchId String
  qty Decimal @db.Decimal(14,3)
  costMinor Int
}
model SaleReturn {
  id String @id @default(cuid())
  saleId String
  status String
  reason String?
}
model StockMovement {
  id String @id @default(cuid())
  batchId String
  type String
  qty Decimal @db.Decimal(14,3)
  refType String?
  refId String?
  createdAt DateTime @default(now())
}
model Alert {
  id String @id @default(cuid())
  shopId String
  type String
  payload Json
  resolvedAt DateTime?
}
```

---

## 7. REST API

- Catalog CRUD + CSV import generics/brands  
- `POST /pos/sales` idempotent  
- `POST /prescriptions`, `POST /prescriptions/:id/verify`, dispense endpoints  
- `POST /inventory/allocate-preview` (FEFO dry-run)  
- Purchasing PO/GRN  
- `POST /returns`  
- `POST /recalls`  
- `GET /reports/expiry-ageing`  
- `POST /sync/push`

---

## 8. Real-time

- Owner dashboard: `sale.completed`, `stock.low`, `batch.quarantined`.

---

## 9. Jobs

- Expiry quarantine nightly  
- Near-expiry (30/60/90 days) alerts  
- Controlled drug daily register snapshot  
- Sync PENDING_REVIEW digest  

---

## 10. Security

- Rx images access-controlled.  
- Controlled sales audit trail immutable.  
- Role gates on verify/dispense.  
- Override PIN hashed.

---

## 11. Caching

- Barcode → medicine Redis map.  
- Active FEFO heads cache invalidated on GRN/sale.

---

## 12. Testing

- Cannot sell expired batch.  
- FEFO order with mixed expiries.  
- Partial Rx dispense remaining qty.  
- Substitution blocked when DAW.  
- Recall prevents sale and lists prior buyers.  
- Duplicate clientSaleId.

---

## 13. Folder Structure

```
pharmacy-management/
  Project_spec.md
  frontend/   # POS PWA + admin
  backend/
```

---

## 14. Env vars (names only)

`DATABASE_URL`, `REDIS_URL`, `JWT_*`, `APP_URL`, `CORS_ORIGINS`, `S3_*`, `SMTP_URL`, `SMS_*`, `POS_OFFLINE_MAX_HOURS`, `NEAR_EXPIRY_DAYS`, `MIN_MARGIN_BPS`, `REQUIRE_PHARMACIST_FOR_RX`

---

## 15. Milestones

1. Catalog + batches + FEFO  
2. Online POS OTC  
3. Purchasing/GRN  
4. Prescription capture/verify/dispense  
5. Returns/recalls/alerts  
6. Offline sync  
7. Reports + DGDA CSV import  

---

## 16. Acceptance Criteria

- [ ] Expired medicine cannot be sold.
- [ ] FEFO picks earliest expiry first.
- [ ] Rx partial fill tracks remaining quantities.
- [ ] Recall freezes batch and is auditable.
- [ ] Cashier without pharmacist cannot complete Rx when flag on.
- [ ] Expiry ageing report buckets correct in Asia/Dhaka.
- [ ] Seed includes generics/brands typical to BD market.

---

## 17. Agent Notes

- Reuse integer money + Decimal qty patterns.
- `InventoryService.allocateFeFo` single chokepoint.
- Fake DGDA dataset seed (~100 SKUs).
