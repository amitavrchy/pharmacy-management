# Pharmacy Management — Code Quality Audit

Commit `e5c9900`.

## 1. Size and shape

| Area | Files | Lines | Notes |
|---|---:|---:|---|
| `backend/src` | 36 | ≈ 3,500 | Largest: `operations/stock-control.controller.ts` 393, `purchasing.controller.ts` 272, `sales.service.ts` 267, `operations/finance.service.ts` 231 |
| `backend/test` | 3 | 1,366 | `operations.test.ts` 702, `integration.test.ts` 582, `domain.test.ts` 82 |
| `backend/prisma` | schema 490, seed 223, migrations ≈ 680 | | |
| `frontend/src` | 32 | ≈ 6,500 TS/TSX + 2,086 CSS | `pos/page.tsx` 719, `finance/page.tsx` 489, `stock-control/page.tsx` 479 |

72 commits between 2026-11-03 and 2026-11-04, plus the deploy and malware-cleanup commits.

## 2. Findings

| ID | Class | Finding | Evidence |
|---|---|---|---|
| P-C1 | CONFIRMED ARCHITECTURAL WEAKNESS | Fifteen controllers hold business logic directly; the largest (`stock-control`, 393 lines) combines locations, transfers, sensors and quarantine release in one class | `backend/src/operations/stock-control.controller.ts` |
| P-C2 | CONFIRMED BUG | CI workflow stored where GitHub does not execute it | `backend/automation/github/workflows/ci.yml` |
| P-C3 | Low | `backend/package.json` declares no `engines`, yet Prisma 7.10 needs Node `^20.19 || ^22.12 || >=24`. On Node 20.18 `prisma generate` fails with `ERR_REQUIRE_ESM` (observed during this audit) | run log, `backend/package.json` |
| P-C4 | Low | The cost-masking mapper for batches is repeated in four places | `sales.service.ts:254-265`, `sales.controller.ts:29-40`, `inventory.controller.ts:18-23`, `:33-38`, `catalog.controller.ts:60-70` |
| P-C5 | Low | Magic numbers: 100-unit adjustment limit (`inventory.service.ts:87-91`), 1 loyalty point per BDT 100 (`sales.service.ts:213`), 300/200 row caps, 5 s SSE interval, 90/60/30-day expiry buckets (`maintenance.ts:76`) | as cited |
| P-C6 | Low | `r: any` on handlers; `Actor` type exists in `common/domain.ts` but is not applied to the request | all controllers |
| P-C7 | Low | One error message for every unique violation: "This record already exists (check barcode or email)" | `common/error.filter.ts:18-21` |
| P-C8 | Medium | `maintenance()` is a single 150-line function with nested loops and per-row upserts | `jobs/maintenance.ts` |
| P-C9 | Medium | Frontend pages are large single components (POS 719 lines) mixing cart state, payment, offline queue and rendering | `frontend/src/app/(workspace)/pos/page.tsx` |
| P-C10 | Low | Frontend API responses are untyped (`api<T = any>`, `user: any`) | `frontend/src/lib/api.ts:9`, `components/providers.tsx:14` |
| P-C11 | Low | `next.config.ts` is written on single dense lines (headers array inline) | `frontend/next.config.ts:7-8` |

## 3. What is good

- A pure, tested domain core (`planFefo`, `money`, `shopDate`, `daysUntil`).
- A single transaction helper used everywhere stock or money changes.
- Audit call beside almost every mutation.
- Integration tests that target the real risks: concurrent oversell, duplicate sale ID, FEFO order, margin override rollback, recall trace, role restrictions.
- Small dependency surface; `npm audit` clean.

## 4. Technical debt register

| Debt | Cost if left | Effort |
|---|---|---|
| No tenant lifecycle or organisation model | Cannot sell as SaaS | L |
| Unbounded list endpoints | POS and dashboard slow down as data grows | M |
| Whole-receipt returns, stock-only purchase returns | Books do not reconcile | M |
| PO-only purchasing | Mismatch with how shops buy; adoption risk | M |
| Maintenance job design | Alerts unreliable at scale | M |
| Sync scrypt | Latency spikes under concurrent logins | S |
| Large page components | Slower UI iteration | M |
| Inactive CI | Regressions | S |

## 5. Verification performed

Executed on an exported copy (Node v20.18.0): `npm ci --ignore-scripts` PASS (both apps); `npm audit` 0 vulnerabilities (both apps); frontend `tsc --noEmit` PASS; backend `prisma generate`, `tsc` and unit tests **BLOCKED** by the local Node version. See `../testing/execution-results.md`.
