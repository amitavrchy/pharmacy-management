# Pharmacy Management — User Journeys

Paths are traced from source at commit `e5c9900`.

## 1. Owner: discover → sign up → first sale

**Today:** impossible without the vendor. There is no public page, sign-up or shop creation. An operator runs the seed (`prisma/seed.ts`) which creates one shop, five accounts and demo stock.

**Target**

1. Landing page in Bangla and English with price and a demo video.
2. Register with mobile number + OTP, shop name, district; 14–30 day trial starts.
3. "Add your medicines": search the master list and tick, or upload Excel, or request paid data entry.
4. Opening stock: quantity, expiry, purchase price, MRP per item (batch optional at first).
5. Add staff by mobile and role.
6. First sale with a guided overlay; print a test receipt.
7. Day 3 and day 10 check-in calls from support; trial-to-paid prompt with bKash/Nagad payment.

## 2. Cashier: a normal sale

**Today** (`pos/page.tsx`, `sales.service.ts`)

1. Open POS; (optionally) a shift is open.
2. Scan or type → item added; quantity edited.
3. For prescription items, link a verified prescription; controlled items need a pharmacist/owner.
4. Enter tenders (cash, bKash, Nagad, card, credit); total must match.
5. Submit → FEFO allocation, stock decrement, receipt.

**Friction:** whole-bill discount only; if margin falls below the shop minimum an owner PIN is required; no strip/box unit switch; item not in catalogue cannot be added on the fly by a cashier (role limit) — the sale stalls.

**Target:** keyboard-first flow; strip/box toggle; "quick add" request that lets the cashier sell an unknown item at an entered price and flags it for the owner; due sale by customer phone in two keystrokes.

## 3. Cashier: internet goes down

**Today:** if the POS tab is open, the sale is queued in IndexedDB and synced later. If the browser is closed or reloaded, the POS is unavailable. On sync, the server may reject a sale (stock gone, batch expired, older than 24 h); the item sits in review with no resolution action; sale time is replaced by sync time.

**Target:** installable app opens offline; local stock decrements; clear banner; on reconnect, sync with a summary ("12 synced, 1 needs attention") and a resolve screen (adjust stock, record as loss, or re-enter).

## 4. Store keeper: receiving a supplier delivery

**Today** (`purchasing.controller.ts`)

1. Create supplier (once).
2. Create purchase order with lines (medicine, quantity, cost).
3. Mark ordered.
4. For each line and each lot: receive (quantity, packs or units, lot, expiry, rack).
5. Owner records the supplier bill and payments in Finance.

**Friction:** real deliveries arrive with an invoice, not a prior order; costs differ from what was expected; bonus quantities are common; one request per lot is slow; price (MRP) changes are not captured.

**Target:** "New purchase" = supplier invoice entry with many rows (medicine, batch, expiry, quantity, bonus, purchase price, MRP, discount, VAT), which creates stock, the supplier bill and optional price updates in one transaction; PO remains optional.

## 5. Owner: end of day

**Today:** Reports → sales and margin by date range; Finance → close shift with counted cash and variance; dashboard shows today's revenue, low stock, near expiry (computed on demand).

**Friction:** offline sales may fall on the wrong day; next-day cash refunds do not appear in any shift; expenses are in a different module from the sales report; no single "day-end" summary; no VAT.

**Target:** one Day-end screen: sales by tender, returns/refunds, expenses, supplier payments, cash expected vs counted, dues given and collected, profit estimate; printable and sendable by WhatsApp.

## 6. Owner: customer dues ("baki")

**Today:** customers with credit limit and balance; credit tender at POS; statement and collection in Customers; ledger entries are idempotent by reference.

**Target:** dues list sorted by age and amount; SMS reminder; partial collection at POS; monthly statement PDF.

## 7. Pharmacist: prescription

**Today:** capture (doctor, patient, items, optional image) → verify → sell against items with partial dispensing and refill; dispense-as-written blocks substitution.

**Friction:** more process than most retail pharmacies follow; images are stored in the database.

**Target:** keep for shops that want it; make "require verified prescription" a per-shop policy (the flag exists: `requirePharmacistForRx`); store images in object storage with retention.

## 8. Customer return

**Today:** request by sale ID → pharmacist/owner approves → stock restocked or wasted by batch condition → sale marked `RETURNED`; cash movement only if the original shift is still open.

**Target:** find receipt → choose lines/quantities → choose refund method → movement recorded on the current shift (or as mobile/card refund) → partial returns reduce prescription dispensed quantities.

## 9. Owner with two shops

**Today:** two unrelated shops with different logins; no combined view; transfers only between locations of one shop.

**Target:** one organisation, two branches; branch switcher; combined sales, stock and dues; inter-branch transfer; per-branch staff.

## 10. Platform operator (you)

**Today:** no console; tenants via seed; no billing; no support tooling.

**Target:** tenant list with status, plan, last activity; impersonation with audit; payment review; suspend/reactivate; master catalogue review queue; health dashboard.

## 11. Priority

| Journey | Blocks revenue | Blocks daily use | Priority |
|---|---|---|---|
| 1 Onboarding + 10 operator console | Yes | — | P0 |
| Per-shop barcode (journey 1 step 3) | Yes | Yes | P0 |
| 4 Purchase invoice entry | Adoption | Yes | P1 |
| 3 Real offline | Trust | Yes | P1 |
| 8 Returns with refunds | — | Books | P1 |
| 5 Day-end | Retention | — | P1 |
| 2 POS speed features | — | Yes | P1 |
| 9 Multi-branch | Upsell | — | P2 |
| 6 Dues reminders | Upsell (SMS) | — | P2 |
