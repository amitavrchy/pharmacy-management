# Acceptance evidence

The original spec is preserved. Checks describe implemented behavior, not clinical or regulatory certification.

| Requirement                            | Evidence                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Expired medicine blocked               | FEFO unit tests plus checkout/offline rejection integration test           |
| Strict FEFO / decimal split            | Mixed-date unit test and real allocation integration test                  |
| No overselling / duplicate consumption | Concurrent checkout and duplicate client ID tests                          |
| Rx verification / partial / overfill   | API integration and browser prescription workflow                          |
| DAW substitution protection            | Server validation and integration test                                     |
| Recall freezes and traces              | Recall and prior allocation integration test                               |
| Cashier role limits                    | Verification and controlled-drug rejection tests                           |
| Dhaka expiry dates                     | Business date boundary unit test                                           |
| BD-inspired seed                       | 100 fictional SKUs, 200 batches                                            |
| GRN / returns                          | Pack conversion, original-lot restock, refund and duplicate approval tests |
| Immutable audit                        | PostgreSQL UPDATE/DELETE rejection trigger                                 |
| Minimum 14px text                      | Browser computed-style checks across all workspace screens                 |
| Responsive navigation                  | 390px navigation and document overflow checks                              |
| POS / receipts                         | Browser checkout and print action assertions                               |
| Prescription / purchase UI             | Capture/verify/partial dispense and draft/place/receive workflows          |
| Offline queue                          | Browser connection loss, IndexedDB queue and reconnect sync                |

Run the verification commands in README. Screenshots and failure traces go to ignored `artifacts/` and `test-results/`. The automation template verifies builds, database tests, Chromium workflows and dependency auditing on a fresh database. It is stored under backend/automation because the root must contain only two folders; GitHub does not auto-run it there. Run npm run verify from backend.

Before live use, configure the real license/catalog, staff credentials, HTTPS/origin, database privileges, tax rules, payment/refund procedures, backup/restore and supervised services. No healthcare, payment, SMS or email service is connected.

Previous release verification: 19 backend tests and 6 Chromium workflows passed; production build and strict TypeScript checks passed; npm audit --omit=dev reported zero vulnerabilities. BullMQ startup completed without failed jobs and registered one hourly scheduler.

Advanced release verification covers credit limits/collections/refunds, cash shift variance, supplier invoice payment idempotency, warehouse transfer conservation, cold-chain holds and separate release, delivery transitions/proof, consent-gated refill tasks and pack-rounded forecast orders. Browser checks include all 15 workspace views at a minimum 14px text size and responsive layouts.

Current release: 29 backend tests and 11 Chromium workflow tests passed locally. Both independent application production builds and TypeScript checks passed, and each dependency audit reported zero vulnerabilities. Root directory verification allows only frontend/, backend/, and Git internal metadata.
