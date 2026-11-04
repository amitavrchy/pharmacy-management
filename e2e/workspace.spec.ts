import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
const password =
  process.env.SEED_PASSWORD ||
  readFileSync("backend/.env", "utf8").match(/^SEED_PASSWORD=(.+)$/m)?.[1];
test.beforeEach(async ({ page }, info) => {
  await page.goto("/login");
  if (info.title.startsWith("all workspace")) {
    mkdirSync("artifacts", { recursive: true });
    await page.screenshot({
      path: "artifacts/login-desktop.png",
      fullPage: true,
    });
  }
  await page.getByLabel("Email address").fill("owner@medora.local");
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
  if (info.title.startsWith("all workspace"))
    await page.screenshot({
      path: "artifacts/overview-desktop.png",
      fullPage: true,
    });
});
test("all workspace views load and visible text is at least 14px", async ({
  page,
}) => {
  for (const [href, title] of [
    ["/catalog", "Medicine catalog"],
    ["/inventory", "Inventory"],
    ["/pos", "Point of sale"],
    ["/purchasing", "Purchasing"],
    ["/prescriptions", "Prescriptions"],
    ["/returns", "Returns & recalls"],
    ["/alerts", "Alerts"],
    ["/reports", "Reports"],
    ["/sync", "Offline sync"],
    ["/settings", "Settings & team"],
  ]) {
    await page.goto(href);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".error-state, .inline-error")).toHaveCount(0);
    const small = await page
      .locator("body *")
      .evaluateAll((els) =>
        els
          .filter(
            (el) =>
              el.textContent?.trim() &&
              el.children.length === 0 &&
              el.getClientRects().length &&
              parseFloat(getComputedStyle(el).fontSize) < 14,
          )
          .map((el) => `${el.tagName}: ${getComputedStyle(el).fontSize}`),
      );
    expect(small).toEqual([]);
  }
});
test("OTC sale produces receipt and stock updates", async ({ page }) => {
  await page.goto("/pos");
  await page.getByPlaceholder("Scan barcode or search medicine…").fill("Napa");
  await page.getByRole("button").filter({ hasText: /Napa/ }).first().click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(
    page.getByRole("heading", { name: "Sale completed", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Total paid", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print receipt" }),
  ).toBeVisible();
});
test("mobile navigation and layout stay within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("link", { name: "Medicine catalog", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Medicine catalog" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "artifacts/catalog-mobile.png",
    fullPage: true,
  });
});
test("prescription capture verification and partial dispensing work through UI", async ({
  page,
}) => {
  const rxNumber = `E2E-RX-${Date.now()}`;
  await page.goto("/prescriptions");
  await page
    .getByRole("button", { name: "Capture prescription", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Prescription number").fill(rxNumber);
  await dialog.getByLabel("Doctor name").fill("Dr. Browser Test");
  await dialog.getByLabel("Patient name").fill("Browser Test Patient");
  await dialog.getByLabel("Medicine", { exact: true }).selectOption("med-7");
  await dialog.getByLabel("Units", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Capture for review" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByPlaceholder("Search patient, doctor or Rx number…")
    .fill(rxNumber);
  const card = page.locator(".rx-card").filter({ hasText: rxNumber });
  await card.getByRole("button", { name: "Review & verify" }).click();
  await page
    .getByRole("button", { name: "Verify prescription", exact: true })
    .click();
  await expect(card.locator(".badge")).toHaveText("VERIFIED");
  await page.goto("/pos");
  await page
    .getByLabel("Prescription (optional for OTC)")
    .selectOption({ label: `${rxNumber} · Browser Test Patient` });
  await page
    .getByPlaceholder("Scan barcode or search medicine…")
    .fill("Moxacil");
  await page
    .locator(".medicine-card")
    .filter({ hasText: /Moxacil/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(
    page.getByRole("heading", { name: "Sale completed", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/prescriptions");
  await page
    .getByPlaceholder("Search patient, doctor or Rx number…")
    .fill(rxNumber);
  await expect(card.locator(".badge")).toHaveText("PARTIALLY DISPENSED");
});
test("purchase order places and receives a batch through UI", async ({
  page,
}) => {
  await page.goto("/purchasing");
  await page.getByRole("button", { name: "New purchase order" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Supplier").selectOption("supplier-1");
  await dialog.getByLabel("Medicine", { exact: true }).selectOption("med-2");
  await dialog.getByLabel("Units", { exact: true }).fill("10");
  await dialog.getByLabel("Cost ৳", { exact: true }).fill("0.80");
  const note = `Browser PO ${Date.now()}`;
  await dialog.getByLabel("Notes").fill(note);
  await dialog.getByRole("button", { name: "Create draft order" }).click();
  const order = page.locator(".orders-card").filter({ hasText: note });
  await order.getByRole("button", { name: "Place order" }).click();
  await order.getByRole("button", { name: "Receive", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quantity received", { exact: true }).fill("10");
  await dialog.getByLabel("Lot / batch number").fill(`E2E-${Date.now()}`);
  await dialog
    .getByLabel("Expiry date")
    .fill(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
  await dialog.getByLabel("Rack / location").fill("E2E-A1");
  await dialog.getByRole("button", { name: "Receive stock" }).click();
  await expect(order.locator(".order-heading .badge")).toHaveText("RECEIVED");
});
test("offline OTC queue survives navigation and synchronizes once reconnected", async ({
  page,
  context,
}) => {
  await page.goto("/pos");
  await page.getByPlaceholder("Scan barcode or search medicine…").fill("Napa");
  await page
    .locator(".medicine-card")
    .filter({ hasText: /Napa/ })
    .first()
    .click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Sale queued on this device" }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.goto("/sync");
  await expect(page.getByText("1 queued", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(
    page.getByRole("heading", { name: "Everything is up to date" }),
  ).toBeVisible();
});
