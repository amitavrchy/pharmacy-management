import "reflect-metadata";
import "dotenv/config";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { Db } from "../src/db/prisma.service";
import { ErrorFilter } from "../src/common/error.filter";
import { hashPassword } from "../src/auth/password";
import { dateUTC } from "../src/common/domain";
let app: any,
  db: Db,
  base: string,
  shopId: string,
  mainId: string,
  genericId: string;
const sessions: Record<string, string> = {};
async function call(
  path: string,
  body?: unknown,
  role = "OWNER",
  method = body ? "POST" : "GET",
) {
  const res = await fetch(`${base}/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Pharmacy-Client": "web",
      Cookie: sessions[role] || "",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: res.status,
    body: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
const expiry = () => new Date(dateUTC().getTime() + 365 * 86400000);
async function medicine(qty = 100, locationId = mainId) {
  const m = await db.medicine.create({
    data: {
      shopId,
      genericId,
      brandName: `Operations ${randomUUID().slice(0, 8)}`,
      manufacturer: "Test",
      strength: "10 mg",
      form: "Tablet",
      priceMinor: 2000,
      packSize: 10,
      reorderLevel: 20,
    },
  });
  const batch = await db.stockBatch.create({
    data: {
      shopId,
      medicineId: m.id,
      lotNumber: "OPS-LOT",
      expiryDate: expiry(),
      qtyOnHand: qty,
      costMinor: 1000,
      locationId,
    },
  });
  return { m, batch };
}
const checkout = (
  medId: string,
  qty = 1,
  extra: Record<string, unknown> = {},
) => ({
  clientSaleId: randomUUID(),
  lines: [{ medicineId: medId, qty }],
  tenders: [{ method: "CASH", amountMinor: qty * 2000 }],
  ...extra,
});
before(async () => {
  app = await NestFactory.create(AppModule, { logger: ["error"] });
  app.use(cookieParser());
  app.useGlobalFilters(new ErrorFilter());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Db);
  shopId = `ops-${randomUUID()}`;
  await db.shop.create({ data: { id: shopId, name: "Operations tests" } });
  genericId = (
    await db.generic.create({ data: { name: `Ops generic ${randomUUID()}` } })
  ).id;
  mainId = (
    await db.stockLocation.create({
      data: { shopId, code: "MAIN", name: "Test counter", canDispense: true },
    })
  ).id;
  for (const role of [
    "OWNER",
    "PHARMACIST",
    "CASHIER",
    "STORE_KEEPER",
    "AUDITOR",
  ] as const) {
    const email = `${role.toLowerCase()}-${shopId}@test.local`,
      password = "Operations-password-123";
    await db.user.create({
      data: {
        shopId,
        email,
        name: role,
        role,
        passwordHash: hashPassword(password),
      },
    });
    const response = await call("auth/login", { email, password });
    assert.equal(response.status, 201);
    sessions[role] = response.cookie!;
  }
});
after(async () => {
  if (db && shopId)
    await db.$transaction(async (tx) => {
      await tx.delivery.deleteMany({ where: { shopId } });
      await tx.refillReminder.deleteMany({ where: { shopId } });
      await tx.saleReturn.deleteMany({ where: { sale: { shopId } } });
      await tx.saleLineBatch.deleteMany({
        where: { saleLine: { sale: { shopId } } },
      });
      await tx.saleLine.deleteMany({ where: { sale: { shopId } } });
      await tx.sale.deleteMany({ where: { shopId } });
      await tx.customerLedger.deleteMany({ where: { customer: { shopId } } });
      await tx.customer.deleteMany({ where: { shopId } });
      await tx.cashMovement.deleteMany({ where: { shift: { shopId } } });
      await tx.registerShift.deleteMany({ where: { shopId } });
      await tx.expense.deleteMany({ where: { shopId } });
      await tx.supplierPayment.deleteMany({ where: { bill: { shopId } } });
      await tx.supplierBill.deleteMany({ where: { shopId } });
      await tx.temperatureReading.deleteMany({ where: { sensor: { shopId } } });
      await tx.temperatureSensor.deleteMany({ where: { shopId } });
      await tx.stockTransfer.deleteMany({ where: { shopId } });
      await tx.stockMovement.deleteMany({ where: { batch: { shopId } } });
      await tx.goodsReceiptLine.deleteMany({ where: { po: { shopId } } });
      await tx.purchaseOrderLine.deleteMany({ where: { po: { shopId } } });
      await tx.purchaseOrder.deleteMany({ where: { shopId } });
      await tx.stockBatch.deleteMany({ where: { shopId } });
      await tx.stockLocation.deleteMany({ where: { shopId } });
      await tx.medicine.deleteMany({ where: { shopId } });
      await tx.generic.delete({ where: { id: genericId } });
      await tx.supplier.deleteMany({ where: { shopId } });
      await tx.alert.deleteMany({ where: { shopId } });
      await tx.user.deleteMany({ where: { shopId } });
    });
  await app?.close();
});
test("credit checkout, collections and returns reconcile one customer ledger", async () => {
  const c = await call("customers", {
    name: "Credit Customer",
    creditLimitMinor: 5000,
  });
  assert.equal(c.status, 201);
  const { m } = await medicine();
  const saleInput = checkout(m.id, 2, {
    customerId: c.body.id,
    tenders: [{ method: "CREDIT", amountMinor: 4000 }],
  });
  const sold = await call("pos/sales", saleInput, "CASHIER");
  assert.equal(sold.status, 201, JSON.stringify(sold.body));
  assert.equal(
    (await call("pos/sales", saleInput, "CASHIER")).body.id,
    sold.body.id,
  );
  assert.equal(
    (await db.customer.findUniqueOrThrow({ where: { id: c.body.id } }))
      .balanceMinor,
    4000,
  );
  assert.equal(
    (
      await call(
        "pos/sales",
        checkout(m.id, 1, {
          customerId: c.body.id,
          tenders: [{ method: "CREDIT", amountMinor: 2000 }],
        }),
        "CASHIER",
      )
    ).status,
    400,
  );
  const payment = {
    amountMinor: 1000,
    method: "CASH",
    reference: randomUUID(),
    note: "Collected",
  };
  const collected = await call(
    `customers/${c.body.id}/payments`,
    payment,
    "CASHIER",
  );
  assert.equal(collected.status, 201);
  assert.equal(
    (await call(`customers/${c.body.id}/payments`, payment, "CASHIER")).body.id,
    collected.body.id,
  );
  assert.equal(
    (await db.customer.findUniqueOrThrow({ where: { id: c.body.id } }))
      .balanceMinor,
    3000,
  );
  assert.equal(
    (
      await call(
        `customers/${c.body.id}/payments`,
        { ...payment, amountMinor: 4000, reference: randomUUID() },
        "CASHIER",
      )
    ).status,
    400,
  );
  const ret = await call(
    "returns",
    { saleId: sold.body.id, reason: "Test return" },
    "CASHIER",
  );
  assert.equal(
    (
      await call(
        `returns/${ret.body.id}/review`,
        { approve: true },
        "PHARMACIST",
      )
    ).status,
    201,
  );
  const statement = await call(`customers/${c.body.id}/statement`);
  assert.equal(statement.body.balanceMinor, -1000);
  assert.equal(
    statement.body.ledger.reduce((s: number, l: any) => s + l.amountMinor, 0),
    -1000,
  );
});
test("cash shift expected balance includes sales movements expenses and variance", async () => {
  const shift = await call(
    "finance/shifts",
    { registerName: "Counter 1", openingMinor: 5000 },
    "CASHIER",
  );
  assert.equal(shift.status, 201);
  const { m } = await medicine();
  assert.equal(
    (
      await call(
        "pos/sales",
        checkout(m.id, 1, { shiftId: shift.body.id }),
        "CASHIER",
      )
    ).status,
    201,
  );
  for (const [kind, amount] of [
    ["CASH_IN", 1000],
    ["CASH_OUT", 500],
  ] as const)
    assert.equal(
      (
        await call(
          `finance/shifts/${shift.body.id}/movements`,
          {
            kind,
            amountMinor: amount,
            reference: randomUUID(),
            note: "Test movement",
          },
          "CASHIER",
        )
      ).status,
      201,
    );
  const current = (
    await call("finance/shifts", undefined, "CASHIER")
  ).body.find((s: any) => s.id === shift.body.id);
  assert.equal(current.expected, 7500);
  const closed = await call(
    `finance/shifts/${shift.body.id}/close`,
    { countedMinor: 7400, note: "Count verified; short 100" },
    "CASHIER",
  );
  assert.equal(closed.body.varianceMinor, -100);
  assert.equal(
    (
      await call(
        "pos/sales",
        checkout(m.id, 1, { shiftId: shift.body.id }),
        "CASHIER",
      )
    ).status,
    400,
  );
});
test("supplier invoices and payments reject double-payment and overpayment", async () => {
  const supplier = await call("purchasing/suppliers", {
    name: "Operations vendor",
  });
  const bill = await call("finance/bills", {
    supplierId: supplier.body.id,
    invoiceNumber: "INV-001",
    totalMinor: 10000,
    dueDate: dateUTC().toISOString().slice(0, 10),
  });
  assert.equal(bill.status, 201);
  const payment = {
    amountMinor: 4000,
    method: "BANK",
    reference: randomUUID(),
    note: "Bank reference 123",
  };
  const p = await call(`finance/bills/${bill.body.id}/payments`, payment);
  assert.equal(p.status, 201);
  assert.equal(
    (await call(`finance/bills/${bill.body.id}/payments`, payment)).body.id,
    p.body.id,
  );
  assert.equal(
    (
      await call(`finance/bills/${bill.body.id}/payments`, {
        ...payment,
        amountMinor: 7000,
        reference: randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    (await db.supplierBill.findUniqueOrThrow({ where: { id: bill.body.id } }))
      .paidMinor,
    4000,
  );
});
test("transfer dispatch and receipt preserve quantity and exclude warehouse from POS", async () => {
  const warehouse = await call(
    "stock-control/locations",
    { name: "Warehouse", code: "WH", kind: "WAREHOUSE", canDispense: false },
    "STORE_KEEPER",
  );
  const { m, batch } = await medicine(10);
  const transfer = await call(
    "stock-control/transfers",
    {
      batchId: batch.id,
      destinationId: warehouse.body.id,
      qty: 10,
      note: "Rebalance stock",
    },
    "STORE_KEEPER",
  );
  assert.equal(transfer.status, 201);
  assert.equal(
    (
      await call(
        `stock-control/transfers/${transfer.body.id}/dispatch`,
        {},
        "STORE_KEEPER",
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await db.stockBatch.findUniqueOrThrow({ where: { id: batch.id } })
    ).qtyOnHand.toString(),
    "0",
  );
  assert.equal(
    (
      await call(
        `stock-control/transfers/${transfer.body.id}/receive`,
        {},
        "STORE_KEEPER",
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        `stock-control/transfers/${transfer.body.id}/receive`,
        {},
        "STORE_KEEPER",
      )
    ).status,
    400,
  );
  assert.equal(
    (await call("pos/sales", checkout(m.id), "CASHIER")).status,
    400,
  );
  const stock = await db.stockBatch.findMany({ where: { medicineId: m.id } });
  assert.equal(
    stock.reduce((s, b) => s + Number(b.qtyOnHand), 0),
    10,
  );
});
test("cold-chain excursion requires location review and separate batch disposition", async () => {
  const loc = await call("stock-control/locations", {
    name: "Fridge",
    code: "FRIDGE",
    kind: "COLD_ROOM",
    canDispense: true,
  });
  const { m, batch } = await medicine(5, loc.body.id);
  const sensor = await call(
    "stock-control/sensors",
    { locationId: loc.body.id, name: "Test logger", minC: 2, maxC: 8 },
    "PHARMACIST",
  );
  assert.equal(sensor.status, 201);
  assert.equal(
    (
      await call(
        `stock-control/sensors/${sensor.body.id}/readings`,
        { valueC: 12, note: "Measured excursion" },
        "STORE_KEEPER",
      )
    ).status,
    201,
  );
  assert.equal(
    (await db.stockBatch.findUniqueOrThrow({ where: { id: batch.id } })).status,
    "QUARANTINED",
  );
  assert.equal(
    (await call("pos/sales", checkout(m.id), "CASHIER")).status,
    400,
  );
  assert.equal(
    (
      await call(
        `stock-control/locations/${loc.body.id}/release`,
        { note: "Too early" },
        "PHARMACIST",
      )
    ).status,
    400,
  );
  await call(
    `stock-control/sensors/${sensor.body.id}/readings`,
    { valueC: 5, note: "Normal reading" },
    "STORE_KEEPER",
  );
  assert.equal(
    (
      await call(
        `stock-control/batches/${batch.id}/release`,
        { note: "Location still held" },
        "PHARMACIST",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `stock-control/locations/${loc.body.id}/release`,
        { note: "Logger and storage reviewed" },
        "PHARMACIST",
      )
    ).status,
    201,
  );
  assert.equal(
    (await db.stockBatch.findUniqueOrThrow({ where: { id: batch.id } })).status,
    "QUARANTINED",
  );
  assert.equal(
    (
      await call(
        `stock-control/batches/${batch.id}/release`,
        { note: "Product stability disposition reference" },
        "PHARMACIST",
      )
    ).status,
    201,
  );
  assert.equal(
    (await call("pos/sales", checkout(m.id), "CASHIER")).status,
    201,
  );
});
test("delivery state machine requires assignment and recipient proof", async () => {
  const { m } = await medicine();
  const sold = await call("pos/sales", checkout(m.id), "CASHIER");
  const d = await call(
    "fulfillment/deliveries",
    {
      saleId: sold.body.id,
      recipient: "Recipient",
      phone: "01712345678",
      address: "Test street Dhaka",
    },
    "CASHIER",
  );
  assert.equal(d.status, 201);
  assert.equal(
    (
      await call(
        `fulfillment/deliveries/${d.body.id}/status`,
        { status: "DELIVERED", proof: "Skipped" },
        "CASHIER",
      )
    ).status,
    400,
  );
  await call(
    `fulfillment/deliveries/${d.body.id}/status`,
    { status: "ASSIGNED", courier: "Courier" },
    "CASHIER",
  );
  await call(
    `fulfillment/deliveries/${d.body.id}/status`,
    { status: "OUT_FOR_DELIVERY" },
    "CASHIER",
  );
  assert.equal(
    (
      await call(
        `fulfillment/deliveries/${d.body.id}/status`,
        { status: "DELIVERED" },
        "CASHIER",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `fulfillment/deliveries/${d.body.id}/status`,
        { status: "DELIVERED", proof: "Recipient signed manifest 123" },
        "CASHIER",
      )
    ).status,
    201,
  );
});
test("refill follow-ups require contact consent and pharmacist role", async () => {
  const c = await call("customers", { name: "No consent" });
  const payload = {
    customerId: c.body.id,
    dueDate: dateUTC().toISOString().slice(0, 10),
    note: "Refill authorization follow-up",
  };
  assert.equal(
    (await call("fulfillment/reminders", payload, "PHARMACIST")).status,
    400,
  );
  await call(
    `customers/${c.body.id}`,
    { contactConsent: true },
    "PHARMACIST",
    "PATCH",
  );
  const reminder = await call("fulfillment/reminders", payload, "PHARMACIST");
  assert.equal(reminder.status, 201);
  assert.equal(
    (
      await call(
        `fulfillment/reminders/${reminder.body.id}/status`,
        { status: "CONTACTED", note: "Called" },
        "CASHIER",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `fulfillment/reminders/${reminder.body.id}/status`,
        { status: "CONTACTED", note: "Called with consent" },
        "PHARMACIST",
      )
    ).status,
    201,
  );
});
test("replenishment recommendations round to packs and generate actual draft orders", async () => {
  const { m } = await medicine(0);
  const supplier = await call("purchasing/suppliers", {
    name: "Forecast supplier",
  });
  const forecast = await call(
    "intelligence/replenishment?targetDays=30&leadDays=7",
    undefined,
    "STORE_KEEPER",
  );
  assert.equal(forecast.status, 200);
  const row = forecast.body.find((r: any) => r.medicineId === m.id);
  assert.equal(row.suggestedQty, 20);
  assert.equal(row.suggestedQty % m.packSize, 0);
  const draft = await call(
    "intelligence/replenishment/orders",
    {
      supplierId: supplier.body.id,
      medicineIds: [m.id],
      targetDays: 30,
      leadDays: 7,
    },
    "STORE_KEEPER",
  );
  assert.equal(draft.status, 201);
  assert.equal(draft.body.status, "DRAFT");
  assert.equal(
    (
      await db.purchaseOrderLine.findFirstOrThrow({
        where: { poId: draft.body.id },
      })
    ).qty.toString(),
    "20",
  );
});
test("recall traces and freezes every copy of a lot across dispensing locations", async () => {
  const { m, batch } = await medicine(20);
  const counter = await call("stock-control/locations", {
    name: "Second counter",
    code: "COUNTER2",
    kind: "COUNTER",
    canDispense: true,
  });
  const transfer = await call("stock-control/transfers", {
    batchId: batch.id,
    destinationId: counter.body.id,
    qty: 5,
    note: "Second counter stock",
  });
  await call(`stock-control/transfers/${transfer.body.id}/dispatch`, {});
  await call(`stock-control/transfers/${transfer.body.id}/receive`, {});
  const sold = await call(
    "pos/sales",
    checkout(m.id, 17, { customerName: "Trace customer" }),
    "CASHIER",
  );
  assert.equal(sold.status, 201);
  assert.equal(
    (
      await call(
        "recalls",
        { batchId: batch.id, reason: "Lot-wide test recall" },
        "PHARMACIST",
      )
    ).status,
    201,
  );
  const batches = await db.stockBatch.findMany({ where: { medicineId: m.id } });
  assert.equal(batches.length, 2);
  assert.ok(batches.every((b) => b.recalled && b.status === "RECALLED"));
  const buyers = await call(
    `recalls/${batch.id}/customers`,
    undefined,
    "PHARMACIST",
  );
  assert.equal(buyers.body.length, 2);
  assert.equal(
    buyers.body.reduce((sum: number, b: any) => sum + Number(b.qty), 0),
    17,
  );
});
test("auditor and cashier cannot mutate finance, storage policy or care notes", async () => {
  assert.equal(
    (
      await call(
        "finance/expenses",
        {
          category: "OTHER",
          amountMinor: 100,
          method: "CASH",
          reference: randomUUID(),
          note: "Not permitted",
        },
        "AUDITOR",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "stock-control/locations",
        { name: "Not allowed", code: "NO", kind: "WAREHOUSE" },
        "CASHIER",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "customers",
        { name: "Clinical data", allergies: ["Test allergy"] },
        "CASHIER",
      )
    ).status,
    400,
  );
});
