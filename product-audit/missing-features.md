# Pharmacy Management — Missing Features

"Missing" = not found in source at `e5c9900`. P0 launch blocker, P1 core commercial, P2 retention/competitive, P3 future. Effort: S ≤ 3 days, M ≤ 2 weeks, L > 2 weeks.

## P0 — required before selling to a second pharmacy

| Feature | Why | Effort |
|---|---|---|
| Tenant onboarding: sign-up, shop creation, first owner, empty catalogue | No path exists (`auth.controller.ts`) | M |
| Per-shop barcode uniqueness; platform-owned generics | Global constraint breaks multi-tenancy (P-T1, P-T4) | S |
| Organisation and subscription model: plan, trial, status, limits, suspension | `Shop` has none | L |
| Subscription payment recording (manual review first), receipts, renewal reminders | Revenue | M |
| Platform admin console: tenants, payments, suspend, support access with audit | Operations | M |
| Password reset (owner by phone/email; staff by owner); session revocation | Account recovery | S–M |
| Rate limiting and PIN attempt lock | Security (P-S1, P-S2) | S |
| Worker + Redis in production; alert generation that scales | Alerts are a headline feature and do not run (P-J1, P-J2) | M |
| Backups with point-in-time recovery; monitoring; CI gate | A POS must not lose data | M |
| Pagination/search on catalogue, inventory, sales | Performance and reachability of old receipts | M |

## P1 — core commercial

| Feature | Notes | Effort |
|---|---|---|
| Purchase invoice entry (multi-batch, bonus, discount, VAT, MRP) without a PO | Matches real purchasing | M |
| Batch-level MRP and sale price rules; price history | Packs carry MRP; prices change by batch | M |
| Line-level returns with refund method and correct cash/ledger effect | P-B2, P-B3 | M |
| Supplier credit notes / expiry returns to supplier | P-B4; common trade practice | M |
| Real offline POS (precache, local stock, resolvable reviews, true sale time) | P-B1, P-B5, P-B9 | M |
| Full medicine editing; supplier editing | P-B6 | S |
| Master medicine catalogue with "add from master" | See `medicine-database-research.md` | M |
| Unit conversions for selling (piece/strip/box) with pricing | Core retail behaviour | M |
| Day-end summary; stock valuation; supplier and customer ledgers | Owner's daily questions | M |
| VAT configuration and VAT lines on receipts/reports | `taxMinor: 0` today; rules must be confirmed with an accountant | M |
| Bangla UI and receipts | Staff language | M |
| Receipt/printer settings (58/80 mm, header/footer/logo) | Hardware variety | S |
| Opening stock import with row-level errors | Onboarding speed | S |

## P2 — retention and competitive

| Feature | Notes | Effort |
|---|---|---|
| Multi-branch: organisation → branches, combined reports, inter-branch transfer | Upsell tier | L |
| SMS: due reminders, refill reminders, low-stock/expiry digest to owner | Paid add-on; needs provider | M |
| Owner mobile dashboard (PWA) | Sales, dues, alerts on the phone | M |
| Purchase optimisation: reorder suggestions by sales velocity (exists in `intelligence`), supplier price comparison | Extend existing | M |
| Loyalty redemption | Points accrue (`sales.service.ts:213`) but no redemption found | S |
| Data export for the owner (Excel/CSV bundle) | Trust; off-boarding | S |
| Per-line discounts and promotions | Today bill-level only | S |
| User-defined roles/permissions | Five fixed roles today | M |
| Barcode label printing for items without codes | Useful for loose items | S |

## P3 — future

Accounting export (Tally/Excel formats used by local accountants); distributor ordering integrations; e-prescription/hospital links (interface stub exists in `integrations/hl7.ts`); online ordering for customers; native Android POS; price-list feeds from manufacturers; bKash/Nagad merchant QR reconciliation.

## Features present that should be optional, not default

Cold-chain sensors and quarantine, stock transfers and locations, delivery tracking with proof, replenishment intelligence, register shifts. They are implemented, but showing them to a small shop on day one increases training time. Gate them by plan and an "advanced" switch.

## AI opportunities (evaluated)

| Idea | Problem | Data | Complexity / cost | Risks | Simpler alternative | Verdict |
|---|---|---|---|---|---|---|
| Read a supplier invoice photo into purchase rows | Purchase entry is the slowest daily task | Photos of invoices, the shop's catalogue | Medium; vision model per invoice | Misread quantities/expiry → wrong stock; must be reviewed row by row | Fast keyboard entry with last-price recall | Promising P2 experiment with mandatory human confirmation |
| Demand forecasting | Over/under-stock | 6–12 months of sales per shop | Low without ML: moving average + seasonality already in `intelligence` | False confidence | Rule-based reorder (exists) | No ML needed now |
| Drug-interaction or dosage advice | Patient safety | Clinical database | High; liability | Wrong medical advice | Licensed clinical reference only | Do not build |
| Prescription handwriting reading | Faster Rx capture | Images | High | Errors with medical consequences | Manual entry | Do not build |
| Natural-language report questions | Owners unfamiliar with reports | Shop data | Medium | Wrong numbers | Better fixed reports and a day-end screen | Later, if ever |

Privacy: prescription images and patient names are health data; they must not be sent to third-party model providers without explicit consent and a lawful basis.
