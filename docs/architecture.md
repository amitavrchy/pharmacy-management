# Architecture and API

The browser calls same-origin `/api/*`. Next.js rewrites to NestJS at `API_URL` (default `http://127.0.0.1:4217`). Nest verifies an HTTP-only, SameSite=Strict JWT cookie, reloads the account’s active state/role and scopes operations to its shop. Mutations require `X-Pharmacy-Client: web` and a trusted Origin. Login has an in-process attempt limiter; distributed deployment needs a shared edge limiter.

Prisma 7 uses the PostgreSQL driver adapter. Quantity uses `Decimal(14,3)`; money uses integer poisha. FEFO locks rows in deterministic order within serializable transactions. Conflicts retry the entire transaction. Sale, allocations, movements, prescription quantities and audit all commit or roll back together. Unique `clientSaleId` prevents duplicate consumption.

Allocation blocks expiry dates **on or before today in Asia/Dhaka**, matching quarantine jobs. Batch expiry is a database date; sale timestamps are instants. Report periods use Dhaka midnight. Offline timestamps cannot authorize expired stock: the server rechecks at sync time.

PostgreSQL triggers reject audit UPDATE/DELETE. APIs expose no audit mutation. Superusers can alter triggers; use separate migration/runtime database privileges. Redis caches shop-scoped barcode-to-medicine IDs, with authoritative DB lookup. Stock heads always come from locked DB rows. BullMQ runs startup/hourly expiry/stock checks, daily Dhaka controlled snapshots and sync digests. SSE checks audit revisions every five seconds and refreshes active views.

## Routes

Routes except login/health require a session. Costs, verification and mutations have server role gates. UI visibility is supplementary.

| Route                                                                         | Purpose                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /health`                                                                 | Database health                                                    |
| `POST /auth/login`, `/auth/logout`, `/auth/password`; `GET /auth/me`          | Session/password lifecycle                                         |
| `GET/POST /catalog`; `PATCH /catalog/:id`                                     | List/create; price/reorder/active editing                          |
| `GET /catalog/generics`, `/catalog/barcode/:barcode`                          | Generic list / cached lookup                                       |
| `POST /catalog/import`                                                        | Atomic CSV `{csv}`, up to 500 rows                                 |
| `GET /inventory`, `/inventory/:id/movements`                                  | Lots/history                                                       |
| `POST /inventory/allocate-preview`                                            | FEFO dry run `{medicineId, qty}`                                   |
| `POST /inventory/:id/adjust`                                                  | Count/rack relocation with note                                    |
| `GET/POST /purchasing/suppliers`, `/purchasing/orders`                        | Supplier/order management                                          |
| `POST /purchasing/orders/:id/status`, `/receive`                              | Order/cancel; GRN `{lineId,qty,inPacks,lotNumber,expiryDate,rack}` |
| `POST /purchasing/returns`                                                    | `{batchId,qty,reason}`                                             |
| `GET/POST /prescriptions`                                                     | Capture/list; images excluded from lists                           |
| `POST /prescriptions/:id/verify`, `/cancel`, `/refill`                        | Verify/cancel/new refill review                                    |
| `GET /prescriptions/:id/image`                                                | Owner/pharmacist-only image                                        |
| `GET/POST /pos/sales`                                                         | History / atomic checkout                                          |
| `GET/POST /returns`; `POST /returns/:id/review`                               | Full-receipt return, review `{approve}`                            |
| `POST /recalls`; `GET /recalls/:id/customers`; `POST /recalls/:id/waste`      | Freeze/trace/dispose                                               |
| `GET /alerts`; `POST /alerts/:id/resolve`                                     | List/acknowledge                                                   |
| `GET /reports/dashboard`, `/expiry-ageing`, `/sales`, `/controlled`, `/audit` | Role-scoped reports; sales supports from/to                        |
| `POST /sync/push`; `GET /sync/reviews`                                        | Up to 50 sales / review queue                                      |
| `PATCH /settings`; `GET/POST /settings/users`; `PATCH /settings/users/:id`    | Owner policy/team                                                  |
| `GET /events`                                                                 | Authenticated revision SSE                                         |

## Checkout example

```json
{
  "clientSaleId": "eb189663-c338-4f91-b2c9-1280f0c19961",
  "lines": [{ "medicineId": "med-1", "qty": 2.5 }],
  "discountMinor": 0,
  "tenders": [{ "method": "CASH", "amountMinor": 300 }]
}
```

The server reads prices. Rx lines need `prescriptionItemId`, with sale-level `prescriptionId`. Substitution requires generic/strength/form/schedule match, consent and no DAW. Controlled dispensing requires owner/pharmacist. Required `scannedLot` must match every FEFO allocation on its line; split separate lots into separate lines. Owner PINs are scrypt-hashed and excluded from queue/audit payloads.

## Boundaries

Returns cover whole receipts. Refund records do not settle payments. Sync is explicit, not automatic background sync. Tax defaults to zero. Catalog data is fictional; import does not connect to DGDA. Images use DB rather than S3. HL7 is an interface, not a hospital connection. Shop provisioning is operator-managed. The workspace does not offer public registration or external email/SMS integrations.
