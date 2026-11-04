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

Run the verification commands in README. Screenshots and failure traces go to ignored `artifacts/` and `test-results/`. GitHub Actions verifies builds, database tests, Chromium workflows and dependency auditing on a fresh database. Check remote run status after push; a local pass does not imply remote completion.

Before live use, configure the real license/catalog, staff credentials, HTTPS/origin, database privileges, tax rules, payment/refund procedures, backup/restore and supervised services. No healthcare, payment, SMS or email service is connected.

Local verification: 19 backend tests and 6 Chromium workflows passed; production build and strict TypeScript checks passed; npm audit --omit=dev reported zero vulnerabilities. BullMQ startup completed without failed jobs and registered one hourly scheduler.
