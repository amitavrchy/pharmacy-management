# Pharmacy Management — Product Roadmap

Complexity: S ≤ 3 days, M ≤ 2 weeks, L > 2 weeks (one experienced engineer). Effort, not calendar.

## Positioning

- **Customer:** owner-operated retail pharmacies in Bangladesh; later small chains.
- **Problems:** expired stock written off, stock that does not match the shelf, uncontrolled credit, slow billing at peak, no visibility for an owner who is not at the counter, data lost when a PC dies.
- **Alternatives:** paper khata, Excel, one-time desktop POS packages from local vendors.
- **Proposition:** fast, batch-accurate billing that survives internet cuts, with cloud backup and the owner's view on a phone.
- **Protect:** the transactional core (`sales.service.ts`, `inventory.service.ts`, `common/domain.ts`) and its integration tests.

## Roadmap 1 — Minimum lovable commercial launch

Goal: several independent pharmacies running daily, paying, without engineering intervention.

| # | Item | Complexity | Depends on | Value |
|---|---|---|---|---|
| 1 | Incident response; active CI on Node 22/24 with Postgres + Redis; deploy gate | S | — | Safety |
| 2 | Per-shop barcode unique; platform-owned generics; scope other global keys | S | — | Multi-tenancy works |
| 3 | `Organization` + subscription tables; tenant status and limits; guard checks | L | 2 | SaaS foundation |
| 4 | Sign-up and onboarding wizard (empty shop, owner, staff) | M | 3 | Self-service tenants |
| 5 | Platform admin console (tenants, payment review, suspend, audited support access) | M | 3 | Operations |
| 6 | Manual subscription payments, receipts, reminders, grace rules | M | 3, 5 | Revenue |
| 7 | Rate limiting, PIN lock, async hashing, session revocation, password reset | M | SMS/email provider for owner reset | Security |
| 8 | Pagination + server search (catalogue, inventory, sales); typed refresh events; SQL reports | M | — | Speed; old receipts reachable |
| 9 | Worker + Redis deployed; set-based maintenance | M | — | Alerts work |
| 10 | Purchase invoice entry with batch MRP, bonus, discount | M | — | Daily purchasing fits reality |
| 11 | Line-level returns with refund bookkeeping; supplier credit notes | M | — | Books reconcile |
| 12 | Real offline POS; persist `soldAt`; review resolution | M | 8 | Trust during outages |
| 13 | Full medicine/supplier editing; opening-stock import with row errors | S | — | Onboarding speed |
| 14 | Day-end summary; stock valuation | S–M | 8 | Owner value |
| 15 | Bangla UI + receipt; printer presets | M | — | Usability |
| 16 | Managed Postgres with PITR, monitoring, staging, deploy order | M | — | Reliability |
| 17 | DB hardening: indexes, CHECKs, key FKs | S–M | — | Integrity |

## Roadmap 2 — Competitive SaaS product

| Item | Complexity | Depends on | Value |
|---|---|---|---|
| Master medicine catalogue with "add from master" and review queue | M | Licensed/curated data, admin console | Fast onboarding |
| Multi-branch: branches under an organisation, combined reports, inter-branch transfers | L | Organisation model | Upsell |
| Unit conversion selling (piece/strip/box) and per-line discounts | M | — | Counter speed |
| VAT configuration and reporting | M | Accountant input | Compliance |
| SMS add-on: dues, refills, owner digest; credit ledger | M | Provider contract | Add-on revenue |
| Owner mobile dashboard (PWA) | M | 8 | Retention |
| Hosted checkout for subscription payments | M | Merchant account | Less manual review |
| Entitlement-gated advanced modules (cold chain, delivery, intelligence) | S | Entitlements | Simpler Starter |
| Owner data export; loyalty redemption; custom roles | S–M | — | Trust, flexibility |
| Invoice-photo-to-purchase experiment | M | Purchase entry | Speed (with human review) |

## Roadmap 3 — Long-term expansion

| Item | Complexity | Precondition |
|---|---|---|
| Distributor ordering integration and price-list feeds | L | Partner agreements |
| Accounting exports/integrations | M | Customer demand |
| Android-native POS with local database | L | Offline limits of PWA proven insufficient |
| Chain features: central purchasing, warehouse, pricing zones | L | Enterprise customers |
| Table partitioning/archival, read replica for reports | M | Data volume |
| Clinics/diagnostic add-ons | L | Strategy decision |

## Sequencing notes

- Items 2–6 turn a single-shop system into a sellable SaaS; nothing else should start before item 2 and CI.
- A free pilot in 3–5 shops can begin after items 1, 2, 7 (minimum), 9, 13 and 16 even before billing exists — create pilot tenants by script.
- Do not extend cold chain, delivery or intelligence until Roadmap 1 is complete.
