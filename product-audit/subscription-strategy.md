# Pharmacy Management — Subscription Strategy

Prices are **hypotheses in BDT** for validation with real pharmacy owners.

## 1. Current state

No subscription code exists: no plan, trial, status or limit on `Shop`; no billing routes; no entitlement checks; no platform admin. The sibling ERP repository contains a working pattern (organisation, plan, trial, manual payment review, quotas, feature gates in `school-college-erp/backend/src/saas/`) that should be the design reference.

## 2. Market signals gathered in this session (unverified third-party pages)

- A general POS product with a pharmacy tier lists monthly plans of BDT 999 / 2,499 / 5,999 with branch and user limits rising by tier.
- Marketplace listings show one-time pharmacy POS software from about BDT 3,000 to 15,000 and general POS guidance "from BDT 12,000" for small businesses.
- No reliable published per-month price for pharmacy-specific SaaS was found.

Sources: [Shayan POS plans](https://shayan-pos.lovable.app/), [BDStall POS software listings](https://www.bdstall.com/pos-software/), [SoftwareSuggest: pharmacy software in Bangladesh](https://www.softwaresuggest.com/pharmacy-software/bangladesh).

Implication: owners are used to **one-time purchases of desktop software**. A subscription must be justified by things a one-time product does not give: cloud backup, phone access for the owner, updates, support, medicine master data.

## 3. Plan hypotheses

| Plan | Monthly | Annual (2 months free) | Limits | Features |
|---|---:|---:|---|---|
| Starter | 500 | 5,000 | 1 branch, 2 users | POS, medicines, stock & expiry, purchases, dues, basic reports, daily backup |
| Professional | 1,200 | 12,000 | 1 branch, 6 users | + returns to supplier, day-end, stock valuation, prescription module, alerts digest, Excel export, offline POS, priority support |
| Multi-branch | 1,000 per branch (min 2) | 10,000 per branch | Up to 10 branches, 6 users per branch | + organisation dashboard, inter-branch transfer, combined reports |
| Enterprise | Custom (from 8,000) | Custom | Chains, warehouses | + cold-chain, delivery, replenishment intelligence, API/accounting export, dedicated onboarding |

Add-ons and services:

| Item | Hypothesis |
|---|---|
| SMS bundle (due/refill reminders) | Sold at a margin over provider cost; public vendor price lists seen in this session range roughly BDT 0.15–0.60 per SMS by type and volume — confirm with a contracted provider |
| Onboarding and training (on-site or remote) | BDT 2,000–5,000 one-time |
| Opening-stock data entry | BDT 3,000–8,000 depending on SKU count |
| Data migration from another system | Quoted per case |
| Extra users | BDT 100 per user per month |
| Hardware bundle (scanner, thermal printer) via a partner | Referral margin |

What to validate first: whether owners prefer annual prepayment (common for software locally) over monthly; sensitivity between BDT 500 and 1,000 at the entry tier; whether "pay after the trial month only if you used it daily" increases conversion.

## 4. Subscription lifecycle

| Stage | Rule |
|---|---|
| Trial | 30 days, full Professional features, no card; a POS trial needs time for stock entry |
| Activation | Payment recorded (manual reference review at first) → status `ACTIVE`, period set |
| Renewal | Reminders in-app and by SMS at T-7, T-3, T-0 |
| Grace | 7 days after expiry with a banner; **billing a customer at the counter must never be blocked abruptly** |
| Past due | After grace: read-only for back-office features; POS keeps working for a further limited period (for example 7 days) with a blocking reminder at start of day; then POS locked, data export still available |
| Suspension | Manual by platform admin with reason |
| Upgrade | Immediate; charge the prorated difference for the remaining period |
| Downgrade | At period end; must fit limits (users, branches) |
| Cancellation | Stops renewal; data retained 90 days; export available |
| Refunds | Policy: prorated within 7 days of payment; recorded as negative payment with reason |

## 5. Entitlements to implement

| Entitlement | Enforced at |
|---|---|
| Max branches, users | Creation routes (transactional count with row lock on the organisation) |
| Feature flags (prescriptions, transfers, cold chain, delivery, intelligence, export, offline) | Route decorator + navigation |
| SMS credits | Notification service |
| Data retention / report history depth | Report queries |

## 6. Payment collection

- **Launch:** manual. Owner pays to the company's merchant bKash/Nagad number or bank account and submits the transaction ID in the app; platform admin confirms the exact amount; activation is idempotent; receipt PDF. This is how the ERP already works.
- **Next:** hosted checkout via an aggregator for one-off period purchases (third-party pages in this session quote roughly 2–2.5 % per transaction; get a written rate card).
- **Later, if confirmed in a merchant agreement:** agreement-based repeat charges through a mobile wallet. Public third-party documentation describes such a capability for bKash tokenized checkout; it was not confirmed from official documentation here. Do not design the product to depend on auto-debit.
- Field collection: many owners will pay cash to a sales agent; support "collected by agent" with agent ID and receipt number.

## 7. Billing data model

`Organization` (owner of the subscription) · `Plan` · `Subscription` (status, period, limits snapshot) · `SubscriptionPayment` (method, reference unique per method, amount, status, reviewer, note, collectedBy) · `SubscriptionEvent` (audit) · `SmsCreditLedger`.

Rules: unique `(method, reference)`; approval requires entering the amount received; idempotency key on grants; every state change writes an event; invoices/receipts numbered sequentially per fiscal year.

## 8. Metrics

Trial starts → activated shops (≥ 20 sales in first 14 days) → paid conversion; monthly logo churn; ARPA; share on annual plans; support contacts per shop per month; days from sign-up to first real sale (the key onboarding metric).
