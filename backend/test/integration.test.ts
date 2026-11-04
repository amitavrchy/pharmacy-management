import "reflect-metadata";
import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { ErrorFilter } from "../src/common/error.filter";
import { Db } from "../src/db/prisma.service";
import { hashPassword } from "../src/auth/password";
import { dateUTC } from "../src/common/domain";
let app: any,
  base: string,
  db: Db,
  shopId: string,
  medId: string,
  rxMedId: string,
  controlId: string,
  firstId: string,
  laterId: string,
  cashier: string,
  pharmacist: string,
  owner: string;
const password = "Test-password-1234";
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
) {
  const res = await fetch(`${base}/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Pharmacy-Client": "web",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: res.status,
    body: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
const sale = (
  medicineId: string,
  qty = 1,
  extra: Record<string, unknown> = {},
) => ({
  clientSaleId: randomUUID(),
  lines: [{ medicineId, qty }],
  tenders: [{ method: "CASH", amountMinor: 1000 * qty }],
  ...extra,
});
before(async () => {
  app = await NestFactory.create(AppModule, { logger: ["error"] });
  app.use(cookieParser());
  app.useGlobalFilters(new ErrorFilter());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Db);
  const suffix = randomUUID();
  shopId = `test-${suffix}`;
  await db.shop.create({
    data: { id: shopId, name: "Integration test pharmacy" },
  });
  for (const role of ["OWNER", "PHARMACIST", "CASHIER"] as const) {
    const email = `${role.toLowerCase()}-${suffix}@test.local`;
    await db.user.create({
      data: {
        shopId,
        email,
        name: role,
        role,
        passwordHash: hashPassword(password),
      },
    });
    const login = await request("auth/login", "POST", { email, password });
    assert.equal(login.status, 201);
    if (role === "OWNER") owner = login.cookie!;
    if (role === "PHARMACIST") pharmacist = login.cookie!;
    if (role === "CASHIER") cashier = login.cookie!;
  }
  const generic = await db.generic.create({
    data: { name: `Generic-${suffix}` },
  });
  for (const [i, schedule] of ["OTC", "RX", "CONTROLLED"].entries()) {
    const m = await db.medicine.create({
      data: {
        shopId,
        genericId: generic.id,
        brandName: `Test ${schedule}`,
        manufacturer: "Test",
        strength: "10 mg",
        form: "Tablet",
        schedule,
        priceMinor: 1000,
      },
    });
    if (i === 0) medId = m.id;
    if (i === 1) rxMedId = m.id;
    if (i === 2) controlId = m.id;
    const tomorrow = new Date(dateUTC().getTime() + 86400000),
      later = new Date(dateUTC().getTime() + 30 * 86400000);
    const b = await db.stockBatch.create({
      data: {
        shopId,
        medicineId: m.id,
        lotNumber: "EARLY",
        expiryDate: tomorrow,
        qtyOnHand: 5,
        costMinor: 500,
      },
    });
    const l = await db.stockBatch.create({
      data: {
        shopId,
        medicineId: m.id,
        lotNumber: "LATER",
        expiryDate: later,
        qtyOnHand: 100,
        costMinor: 500,
      },
    });
    if (i === 0) {
      firstId = b.id;
      laterId = l.id;
    }
  }
});
after(async () => {
  if (db && shopId) {
    await db.$transaction(async (tx) => {
      await tx.saleReturn.deleteMany({ where: { sale: { shopId } } });
      await tx.saleLineBatch.deleteMany({
        where: { saleLine: { sale: { shopId } } },
      });
      await tx.saleLine.deleteMany({ where: { sale: { shopId } } });
      await tx.sale.deleteMany({ where: { shopId } });
      await tx.prescriptionItem.deleteMany({
        where: { prescription: { shopId } },
      });
      await tx.prescription.deleteMany({ where: { shopId } });
      await tx.stockMovement.deleteMany({ where: { batch: { shopId } } });
      await tx.goodsReceiptLine.deleteMany({ where: { batch: { shopId } } });
      await tx.purchaseOrderLine.deleteMany({ where: { po: { shopId } } });
      await tx.purchaseOrder.deleteMany({ where: { shopId } });
      await tx.stockBatch.deleteMany({ where: { shopId } });
      const mids = await tx.medicine.findMany({
        where: { shopId },
        select: { genericId: true },
      });
      await tx.medicine.deleteMany({ where: { shopId } });
      await tx.generic.deleteMany({
        where: { id: { in: mids.map((m) => m.genericId) } },
      });
      await tx.supplier.deleteMany({ where: { shopId } });
      await tx.alert.deleteMany({ where: { shopId } });
      await tx.syncReview.deleteMany({ where: { shopId } });
      await tx.user.deleteMany({
        where: { shopId },
      }); /* Audit deliberately retained; test shop is archived rather than deleted. */
    });
  }
  await app?.close();
});
test("expiry ageing buckets use Dhaka dates at every boundary", async () => {
  const med = await db.medicine.findUniqueOrThrow({ where: { id: medId } });
  const m = await db.medicine.create({
    data: {
      shopId,
      genericId: med.genericId,
      brandName: "Ageing boundary",
      manufacturer: "Test",
      strength: "10 mg",
      form: "Tablet",
      priceMinor: 1000,
    },
  });
  const expected = new Map([
    [0, "Expired"],
    [30, "0–30 days"],
    [31, "31–60 days"],
    [60, "31–60 days"],
    [61, "61–90 days"],
    [90, "61–90 days"],
    [91, "90+ days"],
  ]);
  for (const days of expected.keys())
    await db.stockBatch.create({
      data: {
        shopId,
        medicineId: m.id,
        lotNumber: `BOUNDARY-${days}`,
        expiryDate: new Date(dateUTC().getTime() + days * 86400000),
        qtyOnHand: 1,
        costMinor: 500,
      },
    });
  const response = await request(
    "reports/expiry-ageing",
    "GET",
    undefined,
    owner,
  );
  assert.equal(response.status, 200);
  for (const row of response.body.filter((r: any) => r.medicineId === m.id))
    assert.equal(row.bucket, expected.get(row.days));
});
test("database rejects mutations of immutable audit entries", async () => {
  const entry = await db.auditEntry.create({
    data: {
      shopId,
      actorId: "SYSTEM",
      action: "test.immutable",
      entityId: shopId,
      details: {},
    },
  });
  await assert.rejects(() =>
    db.auditEntry.update({
      where: { id: entry.id },
      data: { action: "tampered" },
    }),
  );
  assert.equal(
    (await db.auditEntry.findUniqueOrThrow({ where: { id: entry.id } })).action,
    "test.immutable",
  );
});
test("unauthenticated requests and cashier verification are rejected", async () => {
  assert.equal((await request("inventory")).status, 401);
  assert.equal(
    (await request("prescriptions/missing/verify", "POST", {}, cashier)).status,
    403,
  );
  assert.equal(
    (await request("settings/users", "GET", undefined, cashier)).status,
    403,
  );
});
test("sale allocates FEFO and duplicate clientSaleId does not decrement twice", async () => {
  const input = sale(medId, 6);
  const first = await request("pos/sales", "POST", input, cashier);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(
    first.body.lines[0].batches.find((b: any) => b.batchId === firstId).qty,
    "5",
  );
  assert.equal(
    first.body.lines[0].batches.find((b: any) => b.batchId === laterId).qty,
    "1",
  );
  const duplicate = await request("pos/sales", "POST", input, cashier);
  assert.equal(duplicate.body.id, first.body.id);
  assert.equal(
    (
      await db.stockBatch.findUniqueOrThrow({ where: { id: laterId } })
    ).qtyOnHand.toString(),
    "99",
  );
});
test("concurrent sales cannot oversell a batch", async () => {
  const before = (
    await db.stockBatch.findUniqueOrThrow({ where: { id: laterId } })
  ).qtyOnHand;
  const results = await Promise.all([
    request("pos/sales", "POST", sale(medId, 60), cashier),
    request("pos/sales", "POST", sale(medId, 60), cashier),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
  assert.equal(
    (
      await db.stockBatch.findUniqueOrThrow({ where: { id: laterId } })
    ).qtyOnHand.toString(),
    before.sub(60).toString(),
  );
});
test("Rx needs verification, partial fill tracks remaining and rejects overfill", async () => {
  const captured = await request(
    "prescriptions",
    "POST",
    {
      rxNumber: "TEST-RX",
      patientName: "Test Patient",
      doctorName: "Test Doctor",
      items: [{ medicineId: rxMedId, qtyPrescribed: 10 }],
    },
    cashier,
  );
  assert.equal(captured.status, 201);
  const rx = await db.prescription.findUniqueOrThrow({
    where: { id: captured.body.id },
    include: { items: true },
  });
  const payload = sale(rxMedId, 3, {
    prescriptionId: rx.id,
    lines: [
      { medicineId: rxMedId, qty: 3, prescriptionItemId: rx.items[0].id },
    ],
  });
  assert.equal(
    (await request("pos/sales", "POST", payload, cashier)).status,
    400,
  );
  assert.equal(
    (await request(`prescriptions/${rx.id}/verify`, "POST", {}, pharmacist))
      .status,
    201,
  );
  assert.equal(
    (await request("pos/sales", "POST", payload, cashier)).status,
    201,
  );
  const updated = await db.prescription.findUniqueOrThrow({
    where: { id: rx.id },
    include: { items: true },
  });
  assert.equal(updated.status, "PARTIALLY_DISPENSED");
  assert.equal(updated.items[0].qtyDispensed.toString(), "3");
  const over = sale(rxMedId, 8, {
    prescriptionId: rx.id,
    lines: [
      { medicineId: rxMedId, qty: 8, prescriptionItemId: rx.items[0].id },
    ],
  });
  assert.equal((await request("pos/sales", "POST", over, cashier)).status, 400);
});
test("recall freezes the lot and traces buyers", async () => {
  assert.equal(
    (
      await request(
        "recalls",
        "POST",
        { batchId: laterId, reason: "Test recall" },
        pharmacist,
      )
    ).status,
    201,
  );
  const buyers = await request(
    `recalls/${laterId}/customers`,
    "GET",
    undefined,
    pharmacist,
  );
  assert.ok(buyers.body.length >= 2);
  assert.equal(
    (await request("pos/sales", "POST", sale(medId), cashier)).status,
    400,
  );
});
test("controlled drugs cannot be sold by a cashier", async () => {
  const res = await request("pos/sales", "POST", sale(controlId), cashier);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /pharmacist/);
});
test("below-margin discount rolls back stock and sale writes", async () => {
  const med = await db.medicine.findUniqueOrThrow({ where: { id: medId } });
  const marginMed = await db.medicine.create({
    data: {
      shopId,
      genericId: med.genericId,
      brandName: "Margin test",
      manufacturer: "Test",
      strength: "10 mg",
      form: "Tablet",
      priceMinor: 1000,
    },
  });
  const marginBatch = await db.stockBatch.create({
    data: {
      shopId,
      medicineId: marginMed.id,
      lotNumber: "MARGIN",
      expiryDate: new Date(dateUTC().getTime() + 86400000),
      qtyOnHand: 10,
      costMinor: 500,
    },
  });
  const before = (
    await db.stockBatch.findFirstOrThrow({
      where: { id: marginBatch.id },
    })
  ).qtyOnHand.toString();
  const res = await request(
    "pos/sales",
    "POST",
    sale(marginMed.id, 1, {
      discountMinor: 900,
      tenders: [{ method: "CASH", amountMinor: 100 }],
    }),
    owner,
  );
  assert.equal(res.status, 400);
  assert.match(res.body.message, /owner PIN/);
  assert.equal(
    (
      await db.stockBatch.findFirstOrThrow({
        where: { id: marginBatch.id },
      })
    ).qtyOnHand.toString(),
    before,
  );
});
test("expired inventory fails checkout and offline sync goes to review", async () => {
  const med = await db.medicine.findUniqueOrThrow({ where: { id: medId } });
  const expired = await db.medicine.create({
    data: {
      shopId,
      genericId: med.genericId,
      brandName: "Expired test",
      manufacturer: "Test",
      strength: "10 mg",
      form: "Tablet",
      priceMinor: 1000,
    },
  });
  await db.stockBatch.create({
    data: {
      shopId,
      medicineId: expired.id,
      lotNumber: "EXPIRED",
      expiryDate: dateUTC(),
      qtyOnHand: 100,
      costMinor: 500,
    },
  });
  const input = sale(expired.id);
  assert.equal(
    (await request("pos/sales", "POST", input, cashier)).status,
    400,
  );
  const result = await request(
    "sync/push",
    "POST",
    { sales: [{ ...input, soldAt: new Date().toISOString() }] },
    cashier,
  );
  assert.equal(result.body[0].status, "PENDING_REVIEW");
  assert.equal(
    await db.sale.count({ where: { clientSaleId: input.clientSaleId } }),
    0,
  );
});
test("dispense-as-written blocks generic substitution", async () => {
  const med = await db.medicine.findUniqueOrThrow({ where: { id: rxMedId } });
  const substitute = await db.medicine.create({
    data: {
      shopId,
      genericId: med.genericId,
      brandName: "Substitute test",
      manufacturer: "Test",
      strength: med.strength,
      form: med.form,
      schedule: "RX",
      priceMinor: 1000,
    },
  });
  const captured = await request(
    "prescriptions",
    "POST",
    {
      rxNumber: "DAW-TEST",
      doctorName: "Doctor",
      patientName: "Patient",
      items: [
        { medicineId: rxMedId, qtyPrescribed: 10, dispenseAsWritten: true },
      ],
    },
    pharmacist,
  );
  await request(
    `prescriptions/${captured.body.id}/verify`,
    "POST",
    {},
    pharmacist,
  );
  const item = await db.prescriptionItem.findFirstOrThrow({
    where: { prescriptionId: captured.body.id },
  });
  const result = await request(
    "pos/sales",
    "POST",
    sale(substitute.id, 1, {
      prescriptionId: captured.body.id,
      substitutionConsent: true,
      lines: [
        { medicineId: substitute.id, qty: 1, prescriptionItemId: item.id },
      ],
    }),
    pharmacist,
  );
  assert.equal(result.status, 400);
  assert.match(result.body.message, /dispense-as-written/);
});
test("goods receipt converts packs and approved return restores original batch", async () => {
  const med = await db.medicine.findUniqueOrThrow({ where: { id: medId } });
  const supplier = await request(
    "purchasing/suppliers",
    "POST",
    { name: "Integration supplier" },
    owner,
  );
  const ordered = await request(
    "purchasing/orders",
    "POST",
    {
      supplierId: supplier.body.id,
      lines: [{ medicineId: medId, qty: 10, costMinor: 500 }],
    },
    owner,
  );
  assert.equal(ordered.status, 201);
  await request(
    `purchasing/orders/${ordered.body.id}/status`,
    "POST",
    { status: "ORDERED" },
    owner,
  );
  const po = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: ordered.body.id },
    include: { lines: true },
  });
  const expiry = new Date(dateUTC().getTime() + 60 * 86400000)
    .toISOString()
    .slice(0, 10);
  const receipt = await request(
    `purchasing/orders/${po.id}/receive`,
    "POST",
    {
      lineId: po.lines[0].id,
      qty: 10 / med.packSize,
      inPacks: true,
      lotNumber: "RECEIPT-TEST",
      expiryDate: expiry,
    },
    owner,
  );
  assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
  assert.equal(receipt.body.qty, "10");
  const completed = await request("pos/sales", "POST", sale(medId, 2), cashier);
  assert.equal(completed.status, 201);
  const batch = await db.stockBatch.findUniqueOrThrow({
    where: { id: receipt.body.batchId },
  });
  assert.equal(batch.qtyOnHand.toString(), "8");
  const requested = await request(
    "returns",
    "POST",
    { saleId: completed.body.id, reason: "Test customer return" },
    cashier,
  );
  assert.equal(requested.status, 201);
  const reviewed = await request(
    `returns/${requested.body.id}/review`,
    "POST",
    { approve: true },
    pharmacist,
  );
  assert.equal(reviewed.status, 201);
  assert.equal(reviewed.body.refundMinor, 2000);
  assert.equal(
    (
      await db.stockBatch.findUniqueOrThrow({ where: { id: batch.id } })
    ).qtyOnHand.toString(),
    "10",
  );
  assert.equal(
    (
      await request(
        `returns/${requested.body.id}/review`,
        "POST",
        { approve: true },
        pharmacist,
      )
    ).status,
    400,
  );
});
