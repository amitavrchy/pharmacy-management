# Medora frontend

Next.js App Router / React PWA. Root layout is intentionally just `frontend/` and `backend/`; each directory owns its own package manifest, lockfile, TypeScript config, dependencies and ignore rules.

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:3217. Start the API separately from `backend/` on port 4217. See [backend setup](../backend/README.md) for PostgreSQL/Redis, migrations, local secrets and demo accounts. `API_URL` defaults to `http://127.0.0.1:4217`; Next.js rewrites `/api/*` to the API.

```sh
npm run check
npm run build
npm run test:browser-install
npm run test:e2e
```

Playwright starts both production servers and uses `../backend/.env` for seed credentials unless `SEED_PASSWORD` is already in the environment. Build the backend before browser tests. Tests create development medicines, stock, customers, receipts, orders and monitoring records; use a disposable database. Failure traces go to `test-results/`, previews to `artifacts/`, both ignored by Git.

Advanced workspace routes: `/customers`, `/finance`, `/stock-control`, `/fulfillment`, `/intelligence`. Existing POS, catalog, inventory, purchasing, prescriptions, returns, alerts, reports, sync and settings remain connected. All text stays at least 14px, and animations respect reduced motion.
