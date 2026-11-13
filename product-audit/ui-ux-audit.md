# Pharmacy Management — UI/UX Audit

**Method and limits.** Based on source in `frontend/src` and `globals.css`; the app was not rendered. Visual quality, contrast, scanner ergonomics and thermal-receipt layout are NOT VERIFIED.

## 1. Summary

The interface is organised around a role-filtered sidebar with 15 destinations and reusable form/table/dialog components, an accessible shell (skip link, labels) and a POS that accepts scanner input in its search box. For a neighbourhood pharmacy in Bangladesh the main risks are scope and language: the product presents enterprise concepts (cold-chain sensors, transfers, register shifts, replenishment intelligence, delivery proof) in English to staff who mostly need to sell quickly, receive stock and see dues.

## 2. Navigation and information architecture

Current menu (`components/shell.tsx:33-72`): Overview, Point of sale, Medicine catalog, Inventory, Purchasing, Prescriptions, Returns & recalls, Alerts, Reports, Offline sync, Customers & accounts, Finance & registers, Stock control center, Delivery & follow-up, Business intelligence, plus Settings.

| Issue | Recommendation |
|---|---|
| 15 flat items; no grouping | Group: **Sell** (POS, Customers, Returns, Prescriptions) · **Stock** (Medicines, Stock & batches, Purchases, Suppliers) · **Money** (Cash register, Dues, Expenses, Supplier bills) · **Reports** · **More** (Transfers, Cold storage, Delivery, Recalls, Forecast) |
| Advanced modules visible to every shop | Hide "Stock control center", "Delivery & follow-up", "Business intelligence" behind plan entitlements and an "Advanced" switch; a Starter shop should see about eight items |
| "Offline sync" as a top-level page | Replace with a status chip in the header ("3 sales waiting to sync") that opens the queue |
| Cashier default landing is Overview | Role-based home: cashier → POS; store keeper → Stock; owner → Overview |
| "Medicine catalog" vs "Inventory" distinction is unclear to non-specialists | "Medicines" (what you sell, prices) and "Stock" (how many, which batch, expiry) |

## 3. Onboarding

There is none: a pharmacy cannot sign up, and the first shop is seeded with demo data. Target first-run flow:

1. Sign up with mobile number (OTP), shop name, district.
2. Pick medicines from a pre-loaded master list (search by brand; tick what you stock) — or skip and add while selling.
3. Enter opening stock quickly: brand → quantity → expiry → purchase price → MRP, with batch optional at first.
4. Add staff by mobile number and role.
5. Guided first sale with a test receipt.

The opening-stock step decides adoption. Offer: import from Excel with a downloadable template and row-level error report; "we do it for you" paid data entry.

## 4. Screen-by-screen

| Screen | Source | Observations | Recommendations |
|---|---|---|---|
| POS | `pos/page.tsx` (719) | Search/scan box, cart, Rx linkage, multi-tender, customer credit, shift, offline queue, owner PIN | Cursor always returns to the scan box; F-key shortcuts (F2 qty, F4 discount, F8 pay, F9 cash exact); large totals; show stock and nearest expiry per line; strip/box unit toggle; quick "due" (credit) sale by customer phone; reprint last receipt; Bangla labels |
| Catalogue | `catalog/page.tsx` (365) | Search, add, edit price/reorder/active, CSV import/export | Full edit; pick from master catalogue; show MRP vs purchase price; bulk price update |
| Inventory | `inventory/page.tsx` (366) | Batches with count, transfer, recall, disposal actions | Default to "what needs attention": expiring ≤ 90 days, out of stock, low stock; hide zero-quantity batches |
| Purchasing | `purchasing/page.tsx` (432) | Suppliers, PO, receive | "New purchase" form shaped like a supplier invoice: supplier, invoice no., date, then rows (medicine, batch, expiry, qty, bonus, purchase price, MRP, discount, VAT); PO optional |
| Returns & recalls | `returns/page.tsx` (267) | Request and approve | Find receipt by number/phone/date; choose lines and quantities; refund method |
| Reports | `reports/page.tsx` (285) | Sales, margin, expiry, controlled, audit | Lead with "Today": sales, cash in hand, dues collected, top items; then expiry and stock value; one-tap PDF/print |
| Finance | `finance/page.tsx` (489) | Shifts, movements, expenses, bills | Split into Cash register and Supplier dues; plain language ("Open counter", "Close counter", "Short/over") |
| Customers | `customers/page.tsx` (397) | Accounts, credit, statement | "Dues" list sorted by amount/age with a "remind by SMS" action |
| Alerts | `alerts/page.tsx` (138) | Categorised list | Works only when the worker runs; add badges in the menu |
| Sync | `sync/page.tsx` (165) | Queue and review | Resolve/discard with reason; explain rejected reasons in plain language |
| Settings | `settings/page.tsx` (284) | Shop, PIN, password, team | Receipt header/footer, logo, printer size, language, VAT settings, plan and billing |
| Login | `login/page.tsx` (133) | Email + password | Mobile number login, forgot password, "Register your pharmacy" |

## 5. Missing screens

Pharmacy registration and onboarding wizard; plan and billing; forgot/reset password; supplier ledger; customer dues reminder; stock valuation; purchase invoice entry; expiry return to supplier; day-end summary; receipt settings; data export; help and support contact.

## 6. Forms, tables, dialogs, states

- Reusable dialog/table/field components exist (`components/ui.tsx`).
- No pagination controls in source for long tables (all data is loaded).
- Irreversible actions (dispose batch, approve return, close shift, recall) need explicit confirmation showing the consequence; no `confirm` usage was found — check each when fixing.
- Server validation messages are raw (`lines.0.qty: Too small`); map to field-level messages.
- Empty and loading states: components exist; per-page coverage NOT VERIFIED.

## 7. Bangladesh-specific usability

| Need | Current | Recommendation |
|---|---|---|
| Bangla | English only | Bangla UI toggle; Bangla receipt option; search by Bangla or English brand names |
| Devices | Desktop-oriented layout; 7 media queries | Primary target: 1366×768 desktop with keyboard and scanner. Secondary: Android phone for the owner (dashboard, dues, alerts) |
| Low bandwidth | Whole-catalogue payloads; global refetch | Paginated data; offline-first POS |
| Low technical skill | Many concepts and pages | Starter mode; contextual help videos in Bangla |
| Units | Unit price × quantity | Strip/box/piece selling with automatic conversion |
| Credit ("baki") culture | Customer credit exists | Make it first-class at POS and in owner reports |
| Printers | Print CSS present | 58 mm/80 mm thermal presets and A5; test with common POS printers |
| Power/internet cuts | In-session offline only | Full offline POS |

## 8. Accessibility checklist

| Item | Status |
|---|---|
| Skip link, landmarks | Present (static) |
| Labels and `aria-label` on icon buttons | Present in shell (static) |
| Toast roles | Present |
| Keyboard-only POS | NOT VERIFIED |
| Focus management in dialogs | NOT VERIFIED |
| Contrast AA | NOT VERIFIED |
| Text size for long shifts (≥ 16 px body, large totals) | NOT VERIFIED |
| Reduced motion | Media query present |

## 9. Design system

Keep the existing token set and components; add: DataTable with server pagination, sort and search; ConfirmDialog with consequence text; NumberInput for money and quantities (Bangla/English digits); StatusChip; keyboard-shortcut hint component. Share tokens with the other two products where practical.

## 10. Implementation-ready UI/UX fixing prompt

```text
You are improving the Medora pharmacy frontend (frontend/src). Keep API contracts unless a task names a backend change. One task per PR; run `npx tsc --noEmit` and Playwright after each.

1. Navigation (components/shell.tsx): group items into Sell / Stock / Money / Reports / More; role-based landing page; hide advanced modules unless the shop has the entitlement (read from auth/me once the backend exposes it); replace the "Offline sync" item with a header chip showing queued count that opens /sync.
2. POS (app/(workspace)/pos/page.tsx): split into SearchBox, Cart, Payment, ReceiptPreview components. Keep focus in the scan box after every action. Add shortcuts F2 (quantity), F4 (discount), F8 (pay), F9 (exact cash), Esc (clear search). Show stock and nearest expiry per cart line. Add reprint of the last receipt.
3. Add ConfirmDialog (components/ui.tsx) and use it for: dispose/waste, recall, approve return, close shift, deactivate user.
4. DataTable with server pagination and search; apply to catalogue, inventory, sales history, customers (requires paginated endpoints).
5. Purchase entry screen shaped as a supplier invoice with multiple batch rows (requires backend purchase-invoice endpoint).
6. Returns: receipt search by number/phone/date; line and quantity selection; refund method (requires backend).
7. i18n: English + Bangla dictionaries; language switch in settings; Bangla receipt template; <html lang> follows locale.
8. Receipt settings: header, footer, logo, 58 mm / 80 mm / A5 presets with print CSS.
9. Friendly validation messages: map zod paths to field labels in lib/api.ts.
10. Onboarding wizard and plan/billing pages once backend routes exist.
Acceptance: a cashier can complete a three-item cash sale using only the keyboard and scanner in under 20 seconds; POS reload while offline still opens the POS; every destructive action shows a confirmation; all tables paginate; UI switches fully to Bangla.
```
