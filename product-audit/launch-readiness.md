# Pharmacy Management — Launch Readiness

## Scoring method

Judgement scores anchored to cited evidence (same bands as the other products: 0–20 absent, 21–40 major gaps, 41–60 workable with significant defects, 61–80 solid with known gaps, 81–100 production grade). NOT ASSESSED where no runtime evidence exists.

## Scores

| Category | Score | Evidence |
|---|---:|---|
| Code Quality | 62 | Tested pure domain core, one transaction helper, audit on mutations; logic-heavy controllers, large pages, inactive CI. Backend type-check could not be executed locally (BLOCKED), frontend type-check PASS |
| Backend Architecture | 62 | Services for the hardest logic; Serializable + locking design is correct; reads and jobs are weak (`backend-audit.md`) |
| Frontend Architecture | 50 | Cookie session, role navigation, offline queue; global refetch on any change, in-session-only offline, 700-line POS page (`frontend-audit.md`) |
| Database Design | 52 | Decimal quantities, good composite uniques, immutable audit trigger; global barcode unique, no CHECKs, missing child indexes and FKs (`database-audit.md`) |
| Security | 50 | Strong session/CSRF/role model, clean dependency audit; no rate limiting, PIN brute force, sync hashing, no reset, unresolved repo compromise (`security-audit.md`) |
| Functional Completeness | 50 | Deep store operations; no tenancy lifecycle, PO-only purchasing, whole-receipt returns, no VAT, alerts not running (`feature-inventory.md`) |
| UI/UX | 50 (static only) | Accessible shell and reusable components; 15-item menu, English only, no onboarding (`ui-ux-audit.md`). Rendering NOT VERIFIED |
| Performance | NOT ASSESSED | No load test. Static risk is high for reads (`performance-scalability.md`) |
| Scalability | 35 | Stateless enough to add instances; refetch/SSE/maintenance patterns will not scale as written |
| Reliability | 25 | Health check, restart policy, separate worker entry; no backups, monitoring, worker or Redis in production; untested auto-deploy |
| Testing Maturity | 50 | 28 backend tests targeting real risks plus Playwright specs exist; none run automatically; no tenant-isolation tests |
| Monetization Readiness | 5 | Nothing billable or enforceable |
| Production Readiness | 20 | Single seeded tenant; shared host; open incident |

## Classification

**NOT READY** as a multi-tenant commercial SaaS. **READY FOR INTERNAL TESTING**, and suitable for a **supervised single-pharmacy pilot** once the incident is closed, backups exist and the worker runs — because the billing and stock core is sound.

## Blockers

1. Repository/CI compromise not fully closed.
2. Global barcode uniqueness (second tenant cannot work).
3. No tenant onboarding, lifecycle or platform administration.
4. No subscription or billing.
5. No rate limiting; owner PIN brute force.
6. No backups/PITR or monitoring for a system of record.
7. Alerts/maintenance not running in production; job design will not scale.
8. Returns and purchase returns do not reconcile cash and supplier balances.
9. Unpaginated reads; old receipts unreachable.
10. Offline POS weaker than its label suggests.

## Path to next levels

| Level | Requirements |
|---|---|
| Supervised pilot (1–5 free shops, tenants created by script) | Blockers 1, 2, 5, 6, 7 closed; CI active; daily reconciliation with each shop |
| Controlled beta (20–30 shops) | + onboarding, admin console, pagination, purchase invoice entry, line-level returns, real offline, Bangla |
| Limited commercial launch | + subscription with manual payments and grace rules, legal pages, support process, restore drill passed, POS load test passed |
| Broader rollout | + master catalogue, multi-branch, gateway checkout, two-instance deployment |

## Effort estimate

Roadmap 1 in `product-roadmap.md` is roughly 14–18 engineer-weeks, excluding field onboarding, data sourcing for the medicine list and merchant-account lead time. Estimate only.
