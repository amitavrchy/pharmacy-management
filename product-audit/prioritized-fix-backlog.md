# Pharmacy Management — Prioritized Fix Backlog

IDs match the audit files. Effort: S ≤ 3 days, M ≤ 2 weeks, L > 2 weeks.

## P0 — launch blockers

| # | ID | Item | Files | Effort | Verify |
|---|---|---|---|---|---|
| 1 | SEC-INC | Close the repository compromise; remove root `.gitignore` remnant; protect `main` | repo settings, `.gitignore` | S | Written record |
| 2 | P-C2 | Activate CI (Node 22/24, Postgres, Redis); gate deploy; declare `engines` | `backend/automation/github/workflows/ci.yml` → `.github/workflows/`, `deploy.yml`, `backend/package.json` | S | Failing test blocks deploy |
| 3 | P-T1 | `@@unique([shopId, barcode])`; import reports per-row results | `backend/prisma/schema.prisma`, new migration, `catalog/catalog.controller.ts` | S | PHM-020, PHM-021 |
| 4 | P-T4 / P-T5 | Platform-owned generics; scope `clientSaleId`, alert keys and references by shop | schema, `catalog.controller.ts`, `sales.service.ts`, `maintenance.ts` | S–M | PHM-023 |
| 5 | P-S1 / P-S2 | Global throttling (Redis store); owner-PIN attempt lock with audit | `app.module.ts`, `main.ts`, `sales/sales.service.ts` | S | PHM-014 |
| 6 | P-S3 / P-S4 | Async hashing; `tokenVersion`; staff reset by owner; owner reset by OTP | `auth/password.ts`, `auth/auth.ts`, `auth.controller.ts`, `settings.controller.ts` | M | PHM-081, PHM-082 |
| 7 | P-R1 | Managed Postgres with PITR + nightly dump; restore drill | infra | M | Restore succeeds |
| 8 | P-J1 / P-J2 | Deploy worker + Redis; rewrite maintenance set-based, outside Serializable | `deploy/docker-compose.prod.yml`, `jobs/maintenance.ts`, `jobs/worker.ts` | M | PHM-070, PHM-071 |
| 9 | P-B7 | Pagination/search/date filters; SQL aggregates for dashboard and reports | `catalog`, `inventory`, `sales`, `reports` controllers + pages | M | PHM-016, PHM-100 |
| 10 | TEN | Organisation, tenant status, sign-up, platform admin | new modules | L | PHM-091 |
| 11 | BILL | Plans, subscription, manual payments, grace rules, entitlements | new modules | L | Activation idempotent |
| 12 | P-R3 | Deploy order (backup → migrate → up → health → rollback) | `.github/workflows/deploy.yml` | S | Failed health rolls back |

## P1 — high priority

| ID | Item | Files | Effort |
|---|---|---|---|
| P-B1 | Persist `soldAt`; add `syncedAt` | `sales.service.ts`, schema | S |
| P-B5 | Review resolution endpoint + UI | `sync/sync.controller.ts`, `frontend/src/app/(workspace)/sync/page.tsx`, `lib/offline.ts` | S |
| P-B9 | Precache app shell; local stock decrement; offline banner | `frontend/public/sw.js`, `lib/offline.ts`, `pos/page.tsx` | M |
| P-B2 / P-B3 | Line-level returns; refund per tender; cash movement on current shift; Rx reversal | `returns/returns.controller.ts`, schema, returns page | M |
| P-B4 | Supplier credit notes; purchase return linked to supplier/bill | `purchasing.controller.ts`, `finance.service.ts` | M |
| P-B14 / P-B15 | Purchase invoice entry; batch MRP; price history | new routes, schema, purchasing page | M |
| P-B6 | Full medicine and supplier edit | `catalog.controller.ts`, `purchasing.controller.ts` | S |
| P-B10 / P-F1 | Typed refresh events; single poller or LISTEN/NOTIFY | `events/events.controller.ts`, `components/providers.tsx`, `lib/use-resource.ts` | M |
| P-S5 | Prescription images to private object storage | `prescriptions.controller.ts`, schema | M |
| P-S6 | CSP + HSTS | `frontend/next.config.ts` | S |
| DB | Index migration; CHECK constraints; key FKs | `backend/prisma` | S–M |
| UX | Navigation grouping, role landing, confirmations, friendly errors | `components/shell.tsx`, `components/ui.tsx` | M |
| I18N | Bangla UI and receipt | frontend | M |
| OPS | Monitoring, error tracking, staging | infra | S–M |
| TEST | Two-tenant isolation matrix | `backend/test` | S |

## P2 — medium

| ID | Item | Effort |
|---|---|---|
| P-B8 | VAT configuration and lines | M |
| P-B11 | Short-circuit Redis cache when unavailable | S |
| P-B12 | Do not retry `P2002`; backoff on serialization retry | S |
| P-C1 / P-C9 | Extract services from large controllers; split POS page | M |
| P-C4 / P-C7 | Shared cost-masking mapper; entity-specific conflict messages | S |
| MASTER | Master catalogue + review queue | M |
| BRANCH | Multi-branch | L |
| DAY | Day-end summary, stock valuation, ledgers | M |
| UNITS | Strip/box selling; per-line discounts | M |
| EXPORT | Owner data export | S |
| SMS | Notification service + credits | M |

## P3 — later

Distributor integrations; accounting export; native Android POS; partitioning; invoice-photo capture experiment.

## Dependencies

- 2 first, so every later change is tested.
- 3–4 before any second tenant.
- 10 before 11; 11 before commercial launch.
- 9 before P-B9 (offline index relies on paginated/compact catalogue API).
- Notification provider before owner password reset by OTP and SMS add-ons.
