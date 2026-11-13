# Pharmacy Management — Reliability & Operations Review

Sources: Dockerfiles, `deploy/*`, `.github/workflows/deploy.yml`, `backend/infra/docker-compose.yml`, `backend/docs/*`. The EC2 host was not inspected.

A pharmacy POS is an operational system: if it is down, the shop cannot bill. Reliability expectations are therefore higher than for the other two products.

## 1. Current state

| Area | Finding | Evidence |
|---|---|---|
| Images | Multi-stage, non-root, production deps; API `HEALTHCHECK` on `/health` | `backend/Dockerfile` |
| Compose | `backend`, `frontend`, and `worker` under profile `worker`; memory limits 448/384/256 MB; `restart: unless-stopped`; log rotation | `deploy/docker-compose.prod.yml` |
| Worker | **Not started by the deploy** (`docker compose up -d` without `--profile worker`) | `deploy.yml`, compose |
| Redis | "Not provisioned on this host" | `deploy/.env.example` |
| CI/CD | Deploy on push to `main`; no tests; CI definition inactive | `.github/workflows/deploy.yml`, `backend/automation/…/ci.yml` |
| Migrations | After `up -d` | `deploy.yml` |
| Backups | None found | — |
| Monitoring, alerting, error tracking | None found | — |
| First tenant | Created by seed with demo data and five shared-password accounts | `deploy/.env.example` |
| Shared infra | One EC2 host and one Postgres container for three products | `deploy/README.md` |
| Domain | `medora.13.203.3.1.sslip.io` | env template |

## 2. Risks

| ID | Class | Risk | Impact |
|---|---|---|---|
| P-R1 | CONFIRMED ARCHITECTURAL WEAKNESS | No backups | Loss of a pharmacy's stock ledger, credit balances and controlled-drug records |
| P-R2 | CONFIRMED BUG | Worker and Redis absent in production | Alerts, auto-quarantine status and controlled snapshots silently do not happen |
| P-R3 | CONFIRMED BUG | Untested auto-deploy; migrate-after-start | Mid-day deploys can break billing; malicious commits deploy themselves |
| P-R4 | CONFIRMED ARCHITECTURAL WEAKNESS | Single small host shared by three products; 320 MB Node heap | One runaway report can restart the API during trading hours |
| P-R5 | CONFIRMED ARCHITECTURAL WEAKNESS | Offline mode only works in an already-open tab | Internet outage + browser restart = no billing |
| P-R6 | CONFIRMED ARCHITECTURAL WEAKNESS | No monitoring | Outages found by shop staff |
| P-R7 | POTENTIAL RISK | Deploys during business hours with no maintenance window | Sales in flight fail; clients must retry (idempotent IDs help) |

## 3. Targets

| Objective | Launch target | Rationale |
|---|---|---|
| Availability (API) | 99.9 % during 08:00–24:00 Dhaka | Billing dependency |
| RPO | ≤ 5 minutes | Financial and stock ledger; requires managed Postgres with point-in-time recovery or WAL archiving |
| RTO | ≤ 1 hour | Shops can run on the offline queue meanwhile, once offline is real |
| Deploy window | 02:00–06:00 Dhaka, or zero-downtime rolling with two instances | — |

## 4. Required work

1. **Database:** managed PostgreSQL with automated backups and PITR, separate from the other products; nightly logical dump to a second location; quarterly restore drill.
2. **Worker and Redis:** provision Redis (or managed Valkey); run the worker as a normal service; alert if the last successful maintenance run is older than 2 hours.
3. **Pipeline:** active CI with the integration suite; staging; approval before production; migrate before start; health-gated rollout; rollback by image tag.
4. **Zero-downtime deploys:** two API containers behind Nginx with health-based upstreams; graceful shutdown already enabled.
5. **Monitoring:** uptime checks; error tracking; metrics for sale latency, failed sales, serialization retries, queue lag, DB connections; disk alerts.
6. **Offline resilience:** complete the offline POS (see `frontend-audit.md`).
7. **Tenant bootstrap:** replace the seed with an onboarding flow that creates an empty shop.
8. **Data safety for customers:** owner-triggered export of stock, sales and ledgers.
9. **Runbooks:** restore, rollback, Redis loss, stuck sync reviews, shop suspended/reactivated, end-of-day reconciliation support.

## 5. Failure-mode review

| Failure | Current behaviour | Desired |
|---|---|---|
| API down | Open POS tabs queue sales; others cannot start | Any installed PWA can sell offline |
| Postgres down | `/health` fails; container marked unhealthy; no automatic failover | Managed failover or fast restore; offline selling continues |
| Redis down | Barcode cache falls back to Postgres (with a per-call failed attempt); worker stops | Short-circuit the cache after first failure; alert |
| Bad deploy | Serves errors until someone notices | Automatic rollback |
| Disk full on shared host | All three products fail | Separate hosts or strict quotas + alerts |
| Operator error (wrong `DELETE`) | Unrecoverable | PITR |

## 6. Verification

- Restore yesterday's backup to a scratch instance; run the integration suite against it.
- Kill the API during a k6 POS run; confirm no duplicate or lost sales after recovery (idempotency).
- Disable the network on a POS device, reload, complete five sales, reconnect: all five appear once with the correct sale time.
