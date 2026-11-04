# Advanced operations scope

Root layout is strictly `frontend/` and `backend/` (plus Git's internal `.git/`). Both apps install independently. Infrastructure, specs, docs, automation and backend scripts live under `backend/`; browser tests, screenshots and Playwright live under `frontend/`.

The next release implements customer profiles, credit accounts and collections; loyalty earning; supplier bills and payments; cash drawer shifts and expenses; multi-location stock transfers with dispatch/receipt; demand-based replenishment; ABC/FSN stock analysis; cold-chain sensors and excursion quarantine; delivery tracking; refill reminders; and operational analytics. These are pharmacy business workflows, not automated clinical decisions.

Research references: [PioneerRx workflow and usage-based ordering](https://www.pioneerrx.com/pharmacy-software), [PioneerRx inventory and delivery apps](https://www.pioneerrx.com/pioneerrx-mobile-apps), [PharmaSync operational features](https://pharmasync.app/en/features/), [Liberty integration boundaries](https://libertysoftware.com/integrations/). Features are implemented locally; those vendor services are not connected.

Country-specific insurance adjudication, controlled e-prescribing networks, licensed drug-interaction databases, hardware robots, payment settlement and government reporting require vendor contracts and jurisdiction-specific configuration. They remain explicit integration boundaries, not simulated integrations.

GitHub automatically discovers workflows only in root `.github/workflows`. With the strict two-folder layout, its template is stored under `backend/automation/github/` and checks are runnable with `cd backend && npm run verify`; the template is not automatically triggered in this layout.
