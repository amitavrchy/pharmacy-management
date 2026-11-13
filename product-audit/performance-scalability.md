# Pharmacy Management — Performance & Scalability

**Capacity is NOT VERIFIED.** No load test was run (no database, Docker or k6 locally; production is out of bounds). This is a static assessment and a workload model. The k6 plan is in `../testing/load-testing-plan.md`.

## 1. Usage model (assumptions)

"10,000 registered users" for a pharmacy system means staff accounts. With 3–5 staff per shop that is roughly **2,000–3,000 pharmacies**. Pharmacies work long hours with an evening peak; a busy counter rings up a sale every one to three minutes.

| Stage | Users | Shops (assumed 4 users/shop) | Peak concurrent users (assumed 40 %) | Peak sales/min (assumed 0.4 per open terminal) | Peak API req/s (assumed ~8 requests per sale incl. lookups + SSE refetches) |
|---|---:|---:|---:|---:|---:|
| Early | 100 | 25 | 40 | 10 | ~2–4 |
| Traction | 1,000 | 250 | 400 | 100 | ~15–30 |
| Growth | 5,000 | 1,250 | 2,000 | 500 | ~70–150 |
| Target | 10,000 | 2,500 | 4,000 | 1,000 | ~150–300 |

Write share is high for a business app (≈ 30–40 %): every sale writes the sale, lines, batch allocations, stock movements, batch updates and audit entries.

Data growth (assumed 150 sales/day/shop, 3 lines each): ~450 sale lines + ~500 movement rows + audit per shop per day. At 2,500 shops ≈ 3–4 million rows/day across the sale-related tables; **tens of GB per year**. Prescription images in-row would add far more — move them out first.

## 2. Static bottlenecks (ranked)

| # | Bottleneck | Evidence | Effect |
|---|---|---|---|
| 1 | Global refetch: every audit entry in a shop triggers every open page in that shop to refetch full, unpaginated datasets (catalogue with batches, inventory, sales 300 with lines) | `components/providers.tsx:42-48`, `use-resource.ts`, P-B7 | After each sale, N terminals × several large queries. Dominant load |
| 2 | SSE polling: one `auditEntry` query every 5 s per connected browser | `events.controller.ts:14-34` | 4,000 clients → 800 queries/s doing nothing useful |
| 3 | Serializable sale transaction with per-line sequential queries (medicine read, batch lock, batch read, updates, movement inserts) | `sales.service.ts`, `inventory.service.ts` | ~8–15 queries per line; fine per shop, CPU-bound in aggregate; retries under contention within a shop |
| 4 | Dashboard and sales report compute in application memory from raw rows | `reports.controller.ts` | Large payloads, memory pressure in a 320 MB heap |
| 5 | `scryptSync` on login/PIN | `auth/password.ts` | Blocks the event loop ~50–100 ms each; morning login burst stalls all requests |
| 6 | Auth guard loads the user on every request | `auth/auth.ts:36` | +1 query per request (acceptable; cacheable for 30–60 s) |
| 7 | Maintenance job per shop in one Serializable transaction | `maintenance.ts` | Timeouts and sale retries at scale |
| 8 | Missing indexes on sale and movement child tables | `database-audit.md` §4 | Slower reads as tables reach millions of rows |
| 9 | 320 MB heap limit with whole-table responses | compose `NODE_OPTIONS` | OOM restarts on large shops |

## 3. Scaling readiness

| Requirement | Status |
|---|---|
| Stateless API | Mostly: session is a cookie JWT. Login-attempt counters are in memory (per instance) |
| Horizontal scaling | Possible after moving attempt counters to Redis; SSE works per instance since it polls the database |
| Connection pooling | `PrismaPg` adapter default pool; no explicit size; shared Postgres container |
| Background jobs | Separate worker entry exists (good); not deployed |
| Caching | Barcode cache only |
| Graceful shutdown | Enabled |
| Health check | Database only |

## 4. What 10,000 users needs

The stage table shows this product has the heaviest real-time write load of the three. A single small instance will not carry the target stage with the current read patterns, but the fixes are ordinary:

1. Stop global refetching; send typed events and refetch only affected, **paginated** resources.
2. Replace per-client SSE polling with one poller per process (or `LISTEN/NOTIFY`) fanning out to subscribers.
3. Server-side search and pagination for catalogue, inventory, sales; a compact POS index for offline use.
4. SQL aggregation for dashboard and reports; cache dashboard per shop for 30–60 s.
5. Async password hashing.
6. Batch the per-line work in the sale transaction (load all medicines and batches for the cart in two queries).
7. Indexes from `database-audit.md`.
8. Set-based maintenance outside Serializable isolation, staggered across shops.
9. Two API instances behind the proxy from the Growth stage, managed Postgres sized for write load, PgBouncer/pooler, Redis for cache, counters and jobs.
10. Partition or archive `StockMovement`, `AuditEntry` and old sales by month once tables exceed tens of millions of rows.

No microservices, Kafka or Kubernetes are needed. A modular monolith with two to four stateless instances and one well-tuned Postgres is appropriate at the target stage.

## 5. Targets to verify

| Scenario | Target |
|---|---|
| Sale checkout (3 lines) | p50 < 150 ms, p95 < 500 ms, p99 < 1.2 s |
| Barcode lookup | p95 < 100 ms |
| Catalogue search (server-side) | p95 < 200 ms |
| 30 concurrent terminals on one shop selling the same 20 SKUs | zero oversell, < 1 % retries exhausted |
| Mixed load at the Growth stage | error rate < 0.5 %, API CPU < 70 %, DB connections < 70 % of pool |
| Daily sales report for one shop | p95 < 1 s |

Workload mix for k6: POS sale 35 %, inventory/barcode lookup 30 %, catalogue search 15 %, purchase receipt 5 %, reports 5 %, stock adjustments/transfers 5 %, multi-location reads 5 %.

## 6. Offline as a scalability and reliability feature

For pharmacies with unstable connectivity, a working offline POS reduces peak dependence on the server. Today it is in-session only (`frontend-audit.md` §3). Finishing it (precached shell, compact local index, local stock decrement, resolvable review queue) is worth more than any server optimisation for customer-perceived reliability.
