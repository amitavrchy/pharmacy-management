# Pharmacy Management — Functional QA Report

## 1. Executed versus not executed

Environment: exported copy of `e5c9900`, macOS, Node v20.18.0, no Docker/PostgreSQL/Redis.

| Activity | Status | Evidence |
|---|---|---|
| `npm ci --ignore-scripts` backend, frontend | PASS | exit 0 (engine warnings: Prisma 7.10 requires Node ≥ 20.19) |
| `npm audit` backend, frontend | PASS | 0 vulnerabilities |
| Frontend `tsc --noEmit` | PASS | exit 0 |
| Backend `prisma generate` | **BLOCKED** | `ERR_REQUIRE_ESM` inside `@prisma/dev` on Node 20.18.0 — a local environment limit, not a product defect (the Docker image uses Node 24) |
| Backend `tsc --noEmit` | BLOCKED | 254 type errors, all caused by the missing generated Prisma client |
| Backend unit tests (`test/domain.test.ts`, 7 tests) | BLOCKED | Same cause |
| Backend integration tests (21 tests: oversell, idempotency, FEFO, Rx, recall, margin, shifts, credit, transfers, cold chain, delivery, roles) | BLOCKED | Need PostgreSQL |
| Playwright (`e2e/workspace.spec.ts`, `e2e/operations.spec.ts`) | NOT RUN | Need running stack |
| Load tests | NOT RUN | — |

Journey verdicts below are static traces through source.

## 2. Journeys

### SaaS onboarding: register → organisation → plan → payment → activation → setup → daily use

**FAIL at step 1.** No registration, plan or payment exists. A pharmacy can only be created by running the seed, which also inserts five demo users and demo stock (`deploy/.env.example`, Seed section).

### Authentication: login → dashboard → password change → logout

| Step | Verdict |
|---|---|
| Login with lockout after 8 failures | Present (`auth.controller.ts:24-71`) |
| Dashboard | Present |
| Change password | Present; other sessions stay valid (P-S4) |
| Forgot password | NOT IMPLEMENTED |
| Logout | Clears cookie |

Result: PARTIAL.

### Daily selling: open shift → scan → sell → receipt → close shift

Traces correctly: shift validation, FEFO allocation, tender check, receipt, shift expected balance and variance. Result: **PASS (static)**; integration tests exist (BLOCKED).

### Purchasing: supplier → order → receive (lot, expiry) → bill → pay

Traces correctly but forces order-before-receipt and one lot per request; a supplier invoice with a different unit cost than the order is rejected for an existing lot (`purchasing.controller.ts:179-185`). Result: PASS (static) with adoption risk.

### Return: request → approve → restock/waste → refund

Stock side correct. Refund side: cash movement only when the original shift is open; no record for mobile/card; whole receipt only. Result: **FAIL** for books reconciliation (P-B2, P-B3).

### Offline: lose connection → sell → reconnect → sync → review

Works only while the POS tab stays open; reload shows a static offline page (P-B9); rejected sales have no resolution path (P-B5); sale time lost (P-B1). Result: **PARTIAL**.

### Expiry prevention: near-expiry alert → action → expired stock blocked

Blocking at sale time is enforced in `planFefo`. Alerts depend on a worker that is not started in production (P-J1). The on-demand expiry-ageing report works. Result: PARTIAL.

### Roles: owner → pharmacist → cashier → store keeper → auditor

Role decorators on mutating routes; cashier cannot sell controlled drugs or see cost; auditor is read-only. Result: PASS (static); integration test "auditor and cashier cannot mutate…" exists (BLOCKED).

### Second tenant

Cannot be created through the product. If created by hand, catalogue import fails on shared barcodes (P-T1). Result: **FAIL**.

## 3. Edge cases (static)

| Case | Code behaviour | Verdict |
|---|---|---|
| Two terminals sell the last unit | One succeeds; the other gets "Insufficient…" after retry | PASS (static) |
| Double-click on Pay | Same `clientSaleId` returns the first sale | PASS (static) |
| Sale with expired batch only | Rejected | PASS (static) |
| Scan a later-expiring lot when an earlier one exists | Rejected with guidance | PASS (static) |
| Discount below minimum margin without PIN | Rejected; nothing written | PASS (static) |
| Wrong owner PIN repeatedly | Unlimited attempts | FAIL (P-S2) |
| Offline sale older than 24 h | Rejected to review | PASS (static) |
| Return after the return window | Rejected | PASS (static) |
| Receive more than ordered | Rejected | PASS (static) |
| Import CSV with one bad row | Whole import rejected with a zod path, no row number | PARTIAL |
| 10,000 medicines in catalogue | Full payload each load | NOT RUN (risk) |
| Session expires mid-sale | 401 on submit; cart state in memory | NOT RUN |
| Network drop mid-request | Sale queued if the fetch throws; possible duplicate avoided by `clientSaleId` | PASS (static) |

## 4. Before launch

1. Run the integration suite and Playwright in an active CI with Postgres and Redis on Node ≥ 22.
2. Add a two-tenant isolation suite.
3. Pilot in one real pharmacy for at least two weeks with a daily reconciliation of stock and cash against the system.
4. Execute the POS load scenario in `../testing/load-testing-plan.md`.
