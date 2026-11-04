import { Page, expect } from "@playwright/test";
/** Each checkout gets new stock; repeated browser runs never exhaust shared seed lots. */
export async function createOTC(page: Page) {
  const brandName = `Browser OTC ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const headers = { "X-Pharmacy-Client": "web" };
  async function post(path: string, data: unknown) {
    const response = await page.request.post(`/api/${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const medicine = await post("catalog", {
    brandName,
    genericName: "Paracetamol",
    manufacturer: "Browser fixture",
    strength: "500 mg",
    form: "Tablet",
    packSize: 10,
    schedule: "OTC",
    priceMinor: 120,
    reorderLevel: 0,
    unitName: "pcs",
  });
  const order = await post("purchasing/orders", {
    supplierId: "supplier-1",
    lines: [{ medicineId: medicine.id, qty: 100, costMinor: 84 }],
  });
  await post(`purchasing/orders/${order.id}/status`, { status: "ORDERED" });
  const response = await page.request.get("/api/purchasing/orders");
  const orders = await response.json();
  const line = orders.find((o: any) => o.id === order.id).lines[0];
  await post(`purchasing/orders/${order.id}/receive`, {
    lineId: line.id,
    qty: 100,
    lotNumber: `LOT-${medicine.id}`,
    expiryDate: new Date(Date.now() + 365 * 86400000)
      .toISOString()
      .slice(0, 10),
  });
  return { brandName, medicine };
}
