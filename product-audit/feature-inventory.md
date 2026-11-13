# Pharmacy Management — Feature Inventory

Status: COMPLETE, PARTIALLY IMPLEMENTED, BROKEN, FRONTEND ONLY, BACKEND ONLY, NOT IMPLEMENTED, NOT VERIFIED. "COMPLETE" means the code path exists end to end; nothing was exercised in a running system in this audit. Tests: U unit, I database integration (`backend/test`), E Playwright — all present in the repository but only runnable with a database/browser (BLOCKED locally).

## Platform and tenancy

| Feature | Status | Evidence / issue |
|---|---|---|
| Pharmacy self-registration | **NOT IMPLEMENTED** | No route; shop created by `prisma/seed.ts` |
| Organisation setup | PARTIALLY IMPLEMENTED | Shop name, licence, address, phone, policy flags via `PATCH settings` |
| Branch management | **NOT IMPLEMENTED** | No branch entity; `StockLocation` is in-shop only |
| Multi-branch analytics | NOT IMPLEMENTED | — |
| Employee management | PARTIALLY IMPLEMENTED | Create + activate/deactivate (`settings.controller.ts:40-101`); no role change, reset, delete |
| Role-based permissions | COMPLETE | 5 fixed roles, `@Roles` on routes; tests I |
| Subscription billing | **NOT IMPLEMENTED** | No models, routes, UI |
| Platform administration | NOT IMPLEMENTED | — |
| Audit logs | COMPLETE | Immutable `AuditEntry`; `reports/audit` |

## Catalogue and inventory

| Feature | Page | Endpoint | Status | Issues |
|---|---|---|---|---|
| Medicine catalogue | `/catalog` | `catalog*` | PARTIALLY IMPLEMENTED | Limited edit (P-B6); global barcode (P-T1); no master data |
| CSV import / export | `/catalog` | `catalog/import` | BROKEN for a second tenant | All-or-nothing, 500 rows, fails on any barcode another shop has |
| Barcode lookup | `/pos` | `catalog/barcode/:code` | COMPLETE | Redis optional |
| Batch & expiry tracking | `/inventory` | `inventory*` | COMPLETE | Unpaginated (P-B7) |
| FEFO allocation | POS | `inventory/allocate-preview`, sales | COMPLETE | U, I |
| Stock adjustment (cycle count) | `/inventory` | `inventory/:id/adjust` | COMPLETE | Blocked batches cannot be counted |
| Locations, transfers | `/stock-control` | `stock-control/*` | COMPLETE (spot-checked) | I |
| Cold-chain sensors (manual readings) | `/stock-control` | `…/sensors*` | COMPLETE (spot-checked) | No device integration |
| Recall, buyer trace, waste | `/returns` | `recalls*` | COMPLETE | I |
| Low-stock alerts | `/alerts` | `alerts` | **BROKEN in documented production setup** | Worker not started (P-J1) |
| Expiry alerts | `/alerts` | `alerts` | **BROKEN in documented production setup** | Same |
| Expiry ageing report | `/reports` | `reports/expiry-ageing` | COMPLETE | On-demand, does not need the worker |

## Sales

| Feature | Page | Endpoint | Status | Issues |
|---|---|---|---|---|
| POS checkout | `/pos` | `POST pos/sales` | COMPLETE | I |
| Barcode scanning | `/pos` | client match / lookup | COMPLETE | Scanner behaviour NOT VERIFIED |
| Discounts | `/pos` | sale `discountMinor` | PARTIALLY IMPLEMENTED | Whole-bill only; margin guard with owner PIN |
| Multi-tender (cash, bKash, Nagad, card, credit) | `/pos` | sale `tenders` | COMPLETE | Labels only; no gateway |
| Invoice / receipt | `/pos` | `components/receipt.tsx` | COMPLETE | Thermal layout NOT VERIFIED; no VAT lines |
| Offline sales + sync | `/pos`, `/sync` | `sync/push` | PARTIALLY IMPLEMENTED | P-B1, P-B5, P-B9 |
| Sales history | `/reports`, returns | `GET pos/sales` | PARTIALLY IMPLEMENTED | Latest 300 only |
| Sales returns | `/returns` | `returns*` | PARTIALLY IMPLEMENTED | Whole receipt; refund bookkeeping gaps (P-B2, P-B3) |
| Prescriptions (capture, verify, partial dispense, refill, image) | `/prescriptions` | `prescriptions*` | COMPLETE | Images in DB (P-S5) |
| Controlled-drug rules + register | POS, `/reports` | sales, `reports/controlled` | COMPLETE | Daily snapshot needs worker |
| Customer accounts, credit, loyalty | `/customers` | `customers*` | COMPLETE | No loyalty redemption found |
| Home delivery tracking | `/fulfillment` | `fulfillment/deliveries*` | COMPLETE (spot-checked) | No courier integration |
| Refill reminders | `/fulfillment` | `fulfillment/reminders*` | PARTIALLY IMPLEMENTED | A task list; no SMS |

## Purchasing and finance

| Feature | Page | Endpoint | Status | Issues |
|---|---|---|---|---|
| Suppliers | `/purchasing` | `purchasing/suppliers` | PARTIALLY IMPLEMENTED | Create and list only |
| Purchase orders + goods receipt | `/purchasing` | `purchasing/orders*` | COMPLETE | PO required; fixed cost; one lot per call (P-B14) |
| Purchase returns | `/purchasing` | `purchasing/returns` | PARTIALLY IMPLEMENTED | Stock only (P-B4) |
| Supplier bills and payments | `/finance` | `finance/bills*` | COMPLETE | I |
| Register shifts, cash movements | `/finance` | `finance/shifts*` | COMPLETE | I |
| Expenses | `/finance` | `finance/expenses` | COMPLETE | — |
| Daily sales report, margin | `/reports` | `reports/sales` | COMPLETE | Unbounded (P-B7); offline dates wrong (P-B1) |
| Profit and loss (with expenses) | `/intelligence` | `intelligence/summary` | NOT VERIFIED | Not read in full |
| Cash flow | — | — | NOT VERIFIED | Shift totals exist |
| Replenishment suggestions → draft PO | `/intelligence` | `intelligence/replenishment*` | COMPLETE (spot-checked) | I |
| VAT / tax | — | — | NOT IMPLEMENTED | `taxMinor: 0` |

## Cross-cutting

| Capability | Status |
|---|---|
| Central medicine master catalogue | NOT IMPLEMENTED |
| SMS / email / WhatsApp | NOT IMPLEMENTED |
| Bangla interface and receipts | NOT IMPLEMENTED |
| Data export (beyond CSV buttons) / backup for the owner | NOT IMPLEMENTED |
| Password reset | NOT IMPLEMENTED |
| Installable PWA | PARTIALLY IMPLEMENTED (manifest + limited service worker) |
