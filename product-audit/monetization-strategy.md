# Pharmacy Management — Monetization Strategy

All figures are hypotheses or illustrative arithmetic, not forecasts. Plan details are in `subscription-strategy.md`.

## 1. Revenue architecture

| Line | Mechanism | Priority |
|---|---|---|
| Subscriptions | Starter / Professional / Multi-branch / Enterprise, monthly or annual | Primary |
| Branch add-ons | Per additional branch | With multi-branch |
| Onboarding, training, opening-stock entry, migration | One-time service fees | From day one — owners expect setup help and are used to paying once |
| SMS packages | Prepaid credits for due and refill reminders | After notification service |
| Premium analytics / advanced inventory | Included in higher tiers rather than separate SKUs | — |
| Hardware referral | Scanner/printer bundles via a partner | Opportunistic |

Avoid at launch: per-transaction fees (owners will resist), advertising, selling aggregated sales data (trust and legal risk).

## 2. Target customer and willingness to pay

- **Primary:** independent retail pharmacies with one counter, 1–4 staff, owner-operated. Decision maker is the owner; the buying trigger is usually stock loss from expiry, credit leakage, or a relative recommending software.
- **Secondary:** small chains (2–10 branches) and "model pharmacies" with stricter record-keeping.
- Evidence on price levels is thin (see `subscription-strategy.md` §2). Treat BDT 500–1,200 per month as the range to test and expect many owners to ask for a one-time price; an annual plan is the natural answer.

## 3. Competition and positioning (assessment limits)

Alternatives observed in search results are general POS/pharmacy packages sold one-time or by subscription through local vendors and marketplaces. Named competitor feature sets were not evaluated — NOT ASSESSED. Differentiation that the code can credibly support once the P0/P1 items are done:

1. Batch- and expiry-accurate stock that cannot go negative under concurrent billing.
2. Fast barcode billing that keeps working through internet cuts.
3. Dues ("baki") control with reminders.
4. Owner's phone view and automatic cloud backup.
5. Pre-loaded medicine list (subject to a legitimate data source).

## 4. Revenue scenarios (illustrative)

Blend assumption: 70 % Starter-equivalent, 25 % Professional, 5 % branch add-ons; one-time setup fee collected from half of new shops.

| Scenario | Paying shops | ARPA / month (BDT) | MRR | ARR | New shops / month | One-time fees / month | Assumed monthly churn |
|---|---:|---:|---:|---:|---:|---:|---:|
| Conservative | 40 | 650 | 26,000 | 312,000 | 5 | 7,500 | 4 % |
| Base | 250 | 750 | 187,500 | 2,250,000 | 20 | 30,000 | 3 % |
| Optimistic | 1,000 | 850 | 850,000 | 10,200,000 | 60 | 90,000 | 2.5 % |

Cost side (estimates): infrastructure BDT 8,000–60,000 per month by stage (`../04-infrastructure-cost-analysis.md`); payment fees ~2–2.5 % if a gateway is used, zero for manual transfers besides wallet cash-out charges; SMS at cost plus margin; **support and field onboarding are the dominant cost** — assume one support/onboarding person per 150–250 shops (BDT 25,000–35,000 per month each) and travel for on-site setup.

## 5. Unit economics to measure

| Metric | How |
|---|---|
| CAC | Sales/agent commission + travel + marketing ÷ new paying shops |
| Onboarding cost per shop | Hours × rate (track in a simple log) |
| Gross margin | Revenue − hosting − SMS − gateway |
| Churn | Shops not renewing ÷ shops due |
| Payback | (CAC + onboarding cost) ÷ monthly gross profit per shop |
| Activation | Shops with ≥ 20 sales/day by day 14 |

Expect payback of several months at these prices; annual prepayment and setup fees are what keep cash flow positive.

## 6. Go-to-market

1. **Pilot (free, 3–5 shops, 4–6 weeks):** shops near you, visited weekly; reconcile stock and cash against the system; collect every complaint. Do not charge until the P0 list is closed.
2. **Paid beta (20–30 shops):** early-adopter price locked for a year; on-site onboarding; WhatsApp support group per shop.
3. **Channels:** pharmaceutical company medical representatives and distributor salesmen who visit every pharmacy weekly (referral commission); local computer/POS hardware shops; pharmacy owners' associations; Facebook groups for pharmacy owners.
4. **Offer:** 30-day trial, opening-stock help, "we visit your shop" setup.
5. **Retention:** monthly owner report by SMS/WhatsApp (sales, expiry saved, dues collected); renewal call a week before expiry.
6. **Referral:** one free month for each referred shop that pays.

## 7. Regulatory and compliance considerations (to verify)

- Pharmacy licensing and record-keeping are regulated by DGDA; do not claim regulatory compliance in marketing until a pharmacist/regulatory adviser has reviewed the controlled-drug and prescription features.
- VAT treatment of medicines and of your SaaS fees should be confirmed with an accountant; the product currently reports zero tax.
- Patient data (prescriptions, phone numbers) needs a privacy notice and access controls; see `security-audit.md`.

## 8. Readiness

Monetization readiness today: **very low** — nothing can be charged or enforced in the product. The first billable version requires the P0 items in `missing-features.md`.
