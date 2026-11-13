# Pharmacy Management — Security Audit

Static review at commit `e5c9900`. No penetration test was run.

## 1. Supply-chain compromise

This repository received the same malicious force-push as the other two on 2026-11-13 (tip `eb9a86e` amended; cleaned by `e5c9900`). The full description, verification performed and required actions are in `../event-wedding-management/security-audit.md` §1 and apply here unchanged. Repository-specific notes:

- `backend/Dockerfile` compiles with `npx tsc` directly, so the backend image build did **not** invoke the poisoned `npm run build`; `frontend/Dockerfile` does run `npm run build`.
- The attacker-added root `.gitignore` is still tracked.
- Whether the deploy workflow ran on the malicious commit is **REQUIRES FURTHER VERIFICATION**.

## 2. Findings

| ID | Severity | Class | Finding | Evidence |
|---|---|---|---|---|
| P-T1 | Critical | CONFIRMED BUG / tenancy | Globally unique medicine barcode blocks and leaks across tenants | `prisma/schema.prisma` `Medicine.barcode @unique`; details in `tenant-isolation-review.md` |
| P-S1 | High | CONFIRMED SECURITY ISSUE | No general rate limiting. Only login has an attempt counter, held in a process-local `Map` (8 tries per IP+email per 15 min) | `app.module.ts` (no throttler); `auth/auth.controller.ts:19`, `:39-57` |
| P-S2 | High | CONFIRMED SECURITY ISSUE | The owner PIN that authorises below-margin discounts can be brute-forced by any cashier: `POST pos/sales` accepts `ownerPin` with no attempt limit; PINs are 6–12 digits | `sales/sales.service.ts:152-165`, `settings/settings.controller.ts:23-26` |
| P-S3 | Medium | CONFIRMED ARCHITECTURAL WEAKNESS | Password and PIN hashing uses `scryptSync`, which blocks the Node event loop for every login, PIN check and user creation; one sale with an override runs it once per owner | `auth/password.ts:2-12`, `sales.service.ts:156-163` |
| P-S4 | Medium | CONFIRMED SECURITY ISSUE | Changing a password does not invalidate existing sessions; there is no password reset; an owner cannot reset a staff member's password (only create and deactivate); no MFA | `auth/auth.controller.ts:82-97`, `settings/settings.controller.ts:54-101` |
| P-S5 | Medium | CONFIRMED SECURITY ISSUE | Prescription images (patient health data) are stored as base64 text in the main table, unencrypted, with no retention rule; up to 1.5 MB each | `prescriptions/prescriptions.controller.ts` (`imageData` schema), `schema.prisma` `Prescription.imageData` |
| P-S6 | Medium | CONFIRMED SECURITY ISSUE | Frontend sends `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` but no Content-Security-Policy or HSTS | `frontend/next.config.ts:8` |
| P-S7 | Medium | CONFIRMED ARCHITECTURAL WEAKNESS | Shared EC2 host and Postgres container with the other two products | `deploy/README.md` |
| P-T4 | Medium | CONFIRMED SECURITY ISSUE | Cross-tenant visibility of generic names | `catalog/catalog.controller.ts:72-74` |
| P-S8 | Low | POTENTIAL RISK | Login lockout key includes the client IP; behind a proxy without `TRUST_PROXY` every user shares one IP, and with it an attacker rotating IPs is not slowed per account | `auth.controller.ts:40`, `main.ts:18` |
| P-S9 | Low | CONFIRMED SECURITY ISSUE | Demo accounts with a shared `SEED_PASSWORD` are the documented way to create the first production users | `deploy/.env.example` (Seed section) |
| P-S10 | Low | POTENTIAL RISK | The offline queue and cached catalogue live in IndexedDB on a shared shop computer; logout clears the catalogue but keeps queued sales (by design) | `frontend/src/lib/offline.ts:54-57` |

## 3. Controls that are in place (keep)

- Global guard with explicit `@Public()`; role checks via `@Roles()` on mutating routes; user re-read from the database on each request, so deactivation takes effect immediately.
- Session cookie: `httpOnly`, `SameSite=Strict`, `Secure` in production; JWT has issuer and audience.
- CSRF defence in depth: Origin allowlist plus a mandatory custom header on every state-changing request and on login.
- All input validated by zod; all SQL parameterised.
- Salted scrypt hashes with constant-time comparison.
- Cost prices are removed from responses for roles other than OWNER and AUDITOR (`sales.service.ts:254-265`, `inventory.controller.ts:18-23`, `catalog.controller.ts:60-70`).
- Audit trail on nearly every mutation, with a database trigger that rejects UPDATE/DELETE on `AuditEntry` (migration `20261104080000_immutable_audit`).
- CSV export escapes formula characters (`frontend/src/lib/api.ts:54-57`).
- `npm audit`: 0 known vulnerabilities in both lockfiles (executed).

## 4. Controls not present

Rate limiting; MFA; self-service password reset; session list/device management; platform-level admin access controls (no platform role exists); backup encryption; secrets rotation process; dependency scanning in an active CI pipeline; field-level encryption for health data; documented data-retention policy.

## 5. Regulatory note

Selling medicines in Bangladesh is regulated by the Directorate General of Drug Administration; the application records a drug licence number and has prescription/controlled-drug rules. Whether the specific record-keeping in the product (controlled register snapshot, prescription image retention) satisfies current DGDA requirements was **not verified** in this audit and should be checked with a licensed pharmacist or the DGDA before marketing it as compliant.

## 6. Remediation order

1. Incident response (shared).
2. P-T1 barcode uniqueness per shop.
3. P-S1 + P-S2: Redis-backed throttling for all routes; per-user and per-shop PIN attempt lock (for example 5 failures → 15-minute lock + alert to owner + audit entry).
4. P-S3: `crypto.scrypt` (async) or argon2 through a worker pool.
5. P-S4: `tokenVersion` on `User`; reset by owner for staff; reset by verified phone/email for owners.
6. P-S5: move images to private object storage with per-tenant prefixes and server-side encryption; store only the key; define retention.
7. P-S6: CSP and HSTS.

## 7. Verification steps

- Two tenants create the same barcode → both 201.
- 6th wrong PIN within 15 minutes → 423/429 and an audit entry `sale.pin_locked`.
- 100 concurrent logins do not raise p95 latency of `GET /health` above 200 ms (event loop not blocked).
- Session cookie issued before a password change is rejected afterwards.
- `Prescription.imageData` column empty for new rows; image served through a signed URL scoped to the shop.
