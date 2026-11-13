# Pharmacy Management — Frontend Engineering Audit

Static review of `frontend/` at commit `e5c9900`. Not rendered in a browser; runtime and visual behaviour NOT VERIFIED. Type-check executed: `tsc --noEmit` PASS.

## 1. Structure

- Next.js App Router, standalone output. Routes: `/login`, and a `(workspace)` group with 15 pages: overview, POS, catalog, inventory, purchasing, prescriptions, returns (& recalls), alerts, reports, sync, customers, finance, stock-control, fulfillment, intelligence, plus settings.
- Shared: `lib/api.ts` (fetch + formatters + CSV export), `lib/offline.ts` (IndexedDB queue and catalogue cache), `lib/use-resource.ts`, `components/providers.tsx` (session, toast, SSE, service worker registration), `components/shell.tsx` (role-filtered navigation), `components/ui.tsx`, `components/receipt.tsx`, `components/sales-chart.tsx`, `components/operations.tsx`.
- All pages are client components calling same-origin `/api/*`, rewritten to the API by `next.config.ts`.

## 2. Session and security in the client

| Finding | Evidence |
|---|---|
| Cookie session; no token in JavaScript storage — good | `lib/api.ts:13-22` (`credentials: "include"`) |
| Custom header sent on every request to satisfy the CSRF check | `lib/api.ts:18` |
| Session restored by `GET auth/me` on load | `components/providers.tsx:28-36` |
| Logout clears the cached catalogue but keeps the offline queue | `providers.tsx:59-64`, `lib/offline.ts:54-57` |
| Navigation filtered by role; pages still rely on the API for enforcement — correct layering | `components/shell.tsx:33-72`, `:134` |
| No CSP header | `next.config.ts:8` |

## 3. Offline POS — how it really works

| Aspect | Behaviour | Evidence |
|---|---|---|
| Catalogue | Full catalogue fetched online and saved to IndexedDB per user; read back when the fetch fails | `pos/page.tsx:67`, `:83`; `lib/offline.ts:10-15` |
| Sale while offline | Payload (without the owner PIN) is queued with a client UUID and `soldAt` | `pos/page.tsx:165-183`; `lib/offline.ts:16-27` |
| Sync | All queued sales pushed to `sync/push`; completed ones removed, rejected ones kept with a reason | `lib/offline.ts:35-53` |
| Service worker | Caches only `/offline.html`, `/icon.svg` and `/_next/static/*` on demand. Navigation is network-first and falls back to the static offline page | `public/sw.js` |

**P-B9 — CONFIRMED BUG (expectation gap).** The application shell is not cached, so reloading or opening the POS while offline shows `offline.html`, not the POS. Offline selling works only in a tab that was already open. Other limits:

- Local stock is not decremented when a sale is queued, so the same last strip can be sold twice offline; the server will reject the second on sync and it lands in review (with no way to resolve it — P-B5).
- Below-margin sales cannot be made offline (PIN is stripped).
- Rejected sales are re-sent on every sync.
- The server stores the sync time, not `soldAt` (P-B1).

## 4. Data fetching

- `use-resource.ts` fetches on mount and on a `pharmacy:refresh` window event; SSE (`/api/events`) raises that event whenever any audit entry is written in the shop, so **every open page refetches its full dataset after any mutation by anyone** — `components/providers.tsx:42-48`.
- Catalogue, inventory and sales endpoints return whole collections; search and filters run in the browser (`pos/page.tsx:214` builds a string from brand, generic and barcode and filters client-side).
- No request de-duplication or caching layer.

**P-F1 — CONFIRMED ARCHITECTURAL WEAKNESS:** global refetch + unbounded payloads will make the POS sluggish on a low-end shop PC as the catalogue grows.

## 5. POS ergonomics (from source)

- Search field doubles as barcode input: on Enter an exact barcode match adds the item (`pos/page.tsx:254-271`).
- Multi-tender payment, customer credit, prescription linkage, shift selection, printable receipt (`components/receipt.tsx`, print media query in CSS).
- NOT VERIFIED: keyboard-only flow (quantity edit, tender shortcuts, F-keys), focus return to the search field after each add, scanner speed handling, receipt layout on 58/80 mm thermal paper.

## 6. Forms, states, accessibility

- `components/ui.tsx` (329 lines) provides dialogs, tables, fields and feedback; skip link and ARIA labels present in the shell.
- Toasts last 5.5 s, dismissible, with `role`.
- No `confirm(` usage found; destructive or irreversible actions (dispose batch, recall, close shift, approve return) should be checked for an explicit confirmation step — NOT VERIFIED per page.
- `lang="en"` fixed; no Bangla.
- Seven media queries (760, 980, 1200, 1600 px, print, reduced motion). Phone-width POS layout NOT VERIFIED.

## 7. Frontend ↔ backend mismatches

| UI | Issue |
|---|---|
| Sync page | Shows queue and review items but cannot resolve a server-side review (no endpoint) |
| Catalogue "edit" | Only price, reorder level, active can change |
| Returns | Whole receipt only |
| Alerts | Empty in production while the worker is not running |
| Settings → Team | Create and deactivate; no role change, no password reset |
| Login | No "forgot password"; no sign-up for a new pharmacy |

## 8. Recommendations

1. Precache the app shell and POS route (Workbox or a hand-written cache-first strategy for navigations with a versioned cache), and show a clear "Offline — sales will sync" banner.
2. Decrement local stock on queued sales; warn when selling beyond cached stock.
3. Server-side search and pagination for catalogue, inventory, sales; keep a compact offline index (id, name, barcode, price, stock) instead of the full payload.
4. Make SSE events carry the entity type so only affected views refetch.
5. Break the POS page into cart, search, payment and receipt modules with unit tests for cart maths.
6. Bangla UI and receipts; keyboard shortcut map printed in the UI.
7. Add CSP and HSTS.
8. Add sign-up, plan and billing screens once the backend supports them.
