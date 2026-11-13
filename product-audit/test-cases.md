# Pharmacy Management — Test Cases

Status: PASS / FAIL / BLOCKED / NOT RUN / NOT APPLICABLE. "(static)" = derived from source, not executed. Executed rows ran on an exported copy of `e5c9900`, Node v20.18.0, no database.

| ID | Module | Scenario | Preconditions | Steps | Expected | Actual | Status | Sev | Evidence | Fix |
|---|---|---|---|---|---|---|---|---|---|---|
| PHM-001 | Build | Frontend type-check | deps | `npx tsc --noEmit` | exit 0 | exit 0 | PASS | — | run log | — |
| PHM-002 | Build | Backend Prisma client generation | deps, Node 20.18 | `npx prisma generate` | client generated | `ERR_REQUIRE_ESM` | BLOCKED | — | run log; needs Node ≥ 20.19 | Declare `engines`; run on Node 22/24 |
| PHM-003 | Build | Backend type-check | generated client | `npx tsc --noEmit` | exit 0 | 254 errors from missing client | BLOCKED | — | run log | Same |
| PHM-004 | Deps | Vulnerabilities | lockfiles | `npm audit` ×2 | 0 high/critical | 0 | PASS | — | run log | — |
| PHM-005 | Domain | FEFO planner, money rounding, dates, scrypt | client | `tsx --test test/domain.test.ts` | 7 pass | not loadable | BLOCKED | High | run log | Run in CI |
| PHM-006 | CI | Tests on push | — | inspect workflows | CI active | file under `backend/automation/` | FAIL (static) | High | repo tree | Move to `.github/workflows` |
| PHM-010 | Sales | Concurrent sales cannot oversell | Postgres | `integration.test.ts` | one success | — | BLOCKED | Crit | test exists | CI |
| PHM-011 | Sales | Duplicate `clientSaleId` | Postgres | same | single decrement | — | BLOCKED | Crit | test exists | CI |
| PHM-012 | Sales | Below-margin discount rolls back | Postgres | same | no writes | — | BLOCKED | High | test exists | CI |
| PHM-013 | Sales | Offline sale keeps its sale time | — | push sale with `soldAt` = yesterday 23:50 | `completedAt` = soldAt | `completedAt` = now | FAIL (static) | High | `sales.service.ts:171-202` | Persist `soldAt` |
| PHM-014 | Sales | Owner PIN attempts limited | cashier | 20 sales with wrong PIN | lock after N | unlimited | FAIL (static) | High | `sales.service.ts:152-165` | Attempt lock |
| PHM-015 | Sales | Controlled drug by cashier | Postgres | integration | 400 | — | BLOCKED | High | test exists | CI |
| PHM-016 | Sales | Find a receipt older than the last 300 | 301+ sales | open sales list / return | searchable | not reachable | FAIL (static) | Med | `sales.controller.ts:19-28` | Search + paging |
| PHM-020 | Catalog | Two shops, same barcode | 2 shops | create medicine with same barcode in each | both 201 | second 409 | FAIL (static) | Crit | `schema.prisma` `barcode @unique` | Per-shop unique |
| PHM-021 | Catalog | Import 300 rows, one duplicate barcode | shop | POST import | row-level report, others imported | whole import fails after retries | FAIL (static) | High | `catalog.controller.ts:156-171`, `prisma.service.ts:36` | Row-level results |
| PHM-022 | Catalog | Correct a misspelt brand name | medicine | PATCH brandName | updated | field not accepted | FAIL (static) | Med | `catalog.controller.ts:101-108` | Extend PATCH |
| PHM-023 | Catalog | Generic list isolation | 2 shops | GET generics as shop B | own + platform | all tenants' generics | FAIL (static) | Med | `catalog.controller.ts:72-74` | Platform-owned generics |
| PHM-030 | Inventory | Adjustment > 100 units by store keeper | — | POST adjust | 400 | 400 | NOT RUN | Med | `inventory.service.ts:87-91` | — |
| PHM-031 | Inventory | Negative stock at DB level | — | raw update to −1 | rejected | allowed (no CHECK) | FAIL (static) | Med | schema | CHECK constraint |
| PHM-040 | Purchasing | Receive more than ordered | PO | POST receive | 400 | 400 | NOT RUN | High | `purchasing.controller.ts:152-155` | — |
| PHM-041 | Purchasing | Receive without a PO (supplier invoice) | — | — | supported | not possible | FAIL (static) | Med | routes | Direct purchase entry |
| PHM-042 | Purchasing | Purchase return creates supplier credit | batch | POST returns | credit note | stock only | FAIL (static) | Med | `purchasing.controller.ts:239-271` | Credit notes |
| PHM-050 | Returns | Cash return next day | shift closed | approve return | cash-out recorded on current shift | no cash movement | FAIL (static) | High | `returns.controller.ts:142-157` | Record against open shift |
| PHM-051 | Returns | Return one of three lines | sale | request | partial return | whole receipt only | FAIL (static) | Med | `returns.controller.ts:83-110` | Line-level returns |
| PHM-052 | Returns | Return outside window | old sale | request | 400 | 400 | NOT RUN | Low | `:39-42` | — |
| PHM-060 | Sync | Resolve a rejected offline sale | review exists | resolve | closed with reason | no endpoint | FAIL (static) | High | `sync.controller.ts` | Add resolve |
| PHM-061 | Offline | Reload POS while offline | PWA installed | reload | POS usable | static offline page | FAIL (static) | High | `public/sw.js` | Precache shell |
| PHM-062 | Offline | Sell last unit twice offline | 1 unit | queue 2 sales | warned locally | second rejected only at sync | FAIL (static) | Med | `lib/offline.ts` | Local stock decrement |
| PHM-070 | Alerts | Low-stock alert appears | production defaults | drop below reorder level | alert | none (worker off) | FAIL (static) | High | compose profile | Run worker |
| PHM-071 | Jobs | Maintenance on 5,000 SKUs | staging | run job | completes | — | NOT RUN | High | `maintenance.ts` | Set-based rewrite |
| PHM-080 | Auth | Unauthenticated request | — | GET inventory | 401 | — | BLOCKED | High | integration test | CI |
| PHM-081 | Auth | Session after password change | 2 sessions | change password in A | B rejected | B still valid | FAIL (static) | Med | `auth.controller.ts:82-97` | tokenVersion |
| PHM-082 | Auth | Forgot password | — | request reset | flow | absent | FAIL (static) | High | routes | Implement |
| PHM-083 | Auth | Cross-site POST | other origin | POST with cookie | 403 | 403 by Origin + header check | NOT RUN | High | `auth.ts:50-59` | — |
| PHM-090 | Tenancy | Read another shop's record by ID | 2 shops | each by-ID route with foreign ID | 404 | scoped in code read | NOT RUN | Crit | `tenant-isolation-review.md` | Automated matrix |
| PHM-091 | Tenancy | Create a new pharmacy from the UI | — | sign up | shop + owner | no route | FAIL (static) | Crit | `auth.controller.ts` | Onboarding |
| PHM-100 | Reports | Sales report for a year | 100k sales | GET reports/sales | paged/aggregated | all rows in memory and payload | NOT RUN | High | `reports.controller.ts:105-170` | Aggregate in SQL |
| PHM-101 | Reports | VAT on report | — | view | VAT amounts | zero | FAIL (static) | Med | `taxMinor: 0` | Tax config |
| PHM-110 | Load | 30 concurrent POS terminals | staging | k6 plan | p95 < 500 ms, 0 oversell | — | NOT RUN | High | plan | Execute |
| PHM-120 | UI | POS at 360 px | running app | sell | usable | — | NOT RUN | Med | — | Mobile project |
