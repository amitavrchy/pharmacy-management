import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { createOTC } from "./fixtures";
import { randomUUID } from "node:crypto";
const password =
  process.env.SEED_PASSWORD ||
  readFileSync("../backend/.env", "utf8").match(/^SEED_PASSWORD=(.+)$/m)?.[1];
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("owner@medora.local");
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
});
test("cashier register links a POS sale and closes with zero cash variance", async ({
  page,
}) => {
  const { brandName } = await createOTC(page);
  const email = `cashier-${randomUUID()}@browser.local`,
    password = `Browser-${randomUUID()}`;
  const created = await page.request.post("/api/settings/users", {
    headers: { "X-Pharmacy-Client": "web" },
    data: { name: "Browser Cashier", email, password, role: "CASHIER" },
  });
  expect(created.ok()).toBe(true);
  const login = await page.request.post("/api/auth/login", {
    headers: { "X-Pharmacy-Client": "web" },
    data: { email, password },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/finance");
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Register name")
    .fill(`Browser register ${Date.now()}`);
  await dialog.getByLabel("Opening cash float (৳)").fill("100");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/pos");
  await page
    .getByPlaceholder("Scan barcode or search medicine…")
    .fill(brandName);
  await page.locator(".medicine-card").filter({ hasText: brandName }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(
    page.getByRole("heading", { name: "Sale completed", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/finance");
  await page.getByRole("button", { name: "Close shift", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Counted cash (৳)").fill("101.20");
  await dialog
    .getByLabel("Closing note / variance explanation")
    .fill("Counted and balanced");
  await dialog.getByRole("button", { name: "Reconcile & close" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".shift-card .panel-header .badge")).toHaveText(
    "CLOSED",
  );
  await expect(page.getByText("Counted and balanced")).toBeVisible();
});
test("supplier payable and operating expense forms save with correct accounting amounts", async ({
  page,
}) => {
  const invoice = `Browser bill ${Date.now()}`;
  await page.goto("/finance");
  await page
    .getByRole("button", { name: "Supplier payables", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Supplier invoice", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Supplier", { exact: true })
    .selectOption("supplier-1");
  await dialog.getByLabel("Supplier invoice number").fill(invoice);
  await dialog.getByLabel("Invoice total (৳)").fill("10");
  await dialog
    .getByLabel("Payment due date")
    .fill(new Date().toISOString().slice(0, 10));
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: invoice });
  await row.getByRole("button", { name: "Record payment" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (৳)").fill("4");
  await dialog
    .getByLabel("Payment method", { exact: true })
    .selectOption("BANK");
  await dialog
    .getByLabel("Payment reference / note")
    .fill("Browser bank payment");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByText("PARTIAL", { exact: true })).toBeVisible();
  await expect(row.getByText("৳6.00", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Operating expenses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record expense", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Category").selectOption("OTHER");
  await dialog.getByLabel("Amount (৳)").fill("2");
  await dialog
    .getByLabel("Payment method", { exact: true })
    .selectOption("CASH");
  await dialog.getByLabel("Expense description").fill(`Expense ${invoice}`);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: `Expense ${invoice}` }),
  ).toBeVisible();
});
test("customer credit checkout and collection reconcile through the UI", async ({
  page,
}) => {
  const name = `Account E2E ${Date.now()}`;
  const { brandName } = await createOTC(page);
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add customer" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill(name);
  await dialog.getByLabel("Credit limit (৳)").fill("100");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/pos");
  await page
    .getByLabel("Registered customer account")
    .selectOption({ label: `${name} · Balance ৳0.00 · Limit ৳100.00` });
  await page
    .getByPlaceholder("Scan barcode or search medicine…")
    .fill(brandName);
  await page
    .locator(".medicine-card")
    .filter({ hasText: brandName })
    .first()
    .click();
  await page
    .getByLabel("Payment method", { exact: true })
    .selectOption("CREDIT");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(
    page.getByRole("heading", { name: "Sale completed", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/customers");
  await page.getByPlaceholder("Search name, phone or email…").fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("button", { name: "Collect", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (৳)").fill("1.20");
  await dialog.getByLabel("Received through").selectOption("CASH");
  await dialog
    .getByLabel("Payment note / receipt reference")
    .fill("Browser collection");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await row.getByRole("button", { name: "Statement" }).click();
  await expect(
    page.getByRole("dialog").getByText("PAYMENT", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("CHARGE", { exact: true }),
  ).toBeVisible();
});
test("cold-chain UI holds an excursion until explicit location review", async ({
  page,
}) => {
  const code = `E2E${Date.now()}`,
    location = `Cold room ${code}`,
    monitor = `Logger ${code}`;
  await page.goto("/stock-control");
  await page.getByRole("button", { name: "New location" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Location name").fill(location);
  await dialog.getByLabel("Location code (A–Z, 0–9, underscore)").fill(code);
  await dialog.getByLabel("Location type").selectOption("COLD_ROOM");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Cold-chain monitors", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Temperature monitor", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Monitored location")
    .selectOption({ label: location });
  await dialog.getByLabel("Monitor name / device identifier").fill(monitor);
  await dialog.getByLabel("Approved minimum (°C)").fill("2");
  await dialog.getByLabel("Approved maximum (°C)").fill("8");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const card = page.locator(".sensor-card").filter({ hasText: monitor });
  await card.getByRole("button", { name: "Record reading" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Measured temperature (°C)").fill("12");
  await dialog
    .getByLabel("Measurement note / source")
    .fill("Out-of-range test");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.locator(".panel-header .badge")).toHaveText("EXCURSION");
  await card.getByRole("button", { name: "Record reading" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Measured temperature (°C)").fill("5");
  await dialog.getByLabel("Measurement note / source").fill("Normal recheck");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.locator(".panel-header .badge")).toHaveText("IN RANGE");
  await page
    .getByRole("button", { name: "Locations & release", exact: true })
    .click();
  const loc = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: location, exact: true }) })
    .first();
  await expect(loc.getByText("QUARANTINED", { exact: true })).toBeVisible();
  await loc.getByRole("button", { name: "Review location release" }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Pharmacist review and release justification")
    .fill("Storage reviewed. No products exposed in this test.");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(loc.getByText("COLD ROOM", { exact: true })).toBeVisible();
});
test("demand planning creates a real purchase draft and new screens stay responsive", async ({
  page,
}) => {
  await page.goto("/intelligence");
  await expect(
    page.getByRole("heading", { name: "Business intelligence", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select all recommendations" })
    .click();
  await page.getByRole("button", { name: "Create purchase draft" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Supplier").selectOption("supplier-1");
  await dialog.getByRole("button", { name: "Create draft for review" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/purchasing");
  await expect(
    page
      .locator(".orders-card")
      .filter({ hasText: "Demand forecast: 30-day usage" })
      .first(),
  ).toBeVisible();
  mkdirSync("artifacts", { recursive: true });
  await page.goto("/intelligence");
  await page
    .getByRole("button", { name: "Management pulse", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ABC value distribution" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/intelligence-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/customers",
    "/finance",
    "/stock-control",
    "/fulfillment",
    "/intelligence",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator(".error-state,.inline-error")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await page.goto("/stock-control");
  await page
    .getByRole("button", { name: "Cold-chain monitors", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/cold-chain-mobile.png",
    fullPage: true,
  });
});
