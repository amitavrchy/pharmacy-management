import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import {
  date,
  id,
  minor,
  parse,
  quantity,
  text,
  z,
} from "../common/validation";
import { D, dateUTC, requireThat } from "../common/domain";
import { audit } from "../common/audit";
@Controller("purchasing")
export class PurchasingController {
  constructor(private readonly db: Db) {}
  @Roles("OWNER", "STORE_KEEPER", "AUDITOR") @Get("suppliers") suppliers(
    @Req() r: any,
  ) {
    return this.db.supplier.findMany({
      where: { shopId: r.user.shopId },
      orderBy: { name: "asc" },
    });
  }
  @Roles("OWNER", "STORE_KEEPER") @Post("suppliers") supplier(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(
      z.object({
        name: text,
        phone: z.string().max(30).optional(),
        email: z.email().optional(),
        address: z.string().max(300).optional(),
      }),
      body,
    );
    return this.db.supplier.create({ data: { ...v, shopId: r.user.shopId } });
  }
  @Roles("OWNER", "STORE_KEEPER", "AUDITOR") @Get("orders") orders(
    @Req() r: any,
  ) {
    return this.db.purchaseOrder.findMany({
      where: { shopId: r.user.shopId },
      include: {
        supplier: true,
        lines: { include: { medicine: true } },
        receipts: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
  @Roles("OWNER", "STORE_KEEPER") @Post("orders") async order(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(
      z.object({
        supplierId: id,
        notes: z.string().max(1000).default(""),
        lines: z
          .array(z.object({ medicineId: id, qty: quantity, costMinor: minor }))
          .min(1)
          .max(100),
      }),
      body,
    );
    requireThat(
      new Set(v.lines.map((l) => l.medicineId)).size === v.lines.length,
      "Combine duplicate medicine lines",
    );
    return this.db.atomic(async (tx) => {
      requireThat(
        await tx.supplier.findFirst({
          where: { id: v.supplierId, shopId: r.user.shopId },
        }),
        "Supplier not found",
      );
      for (const l of v.lines)
        requireThat(
          await tx.medicine.findFirst({
            where: { id: l.medicineId, shopId: r.user.shopId, active: true },
          }),
          "Medicine not found",
        );
      const po = await tx.purchaseOrder.create({
        data: { ...v, shopId: r.user.shopId, lines: { create: v.lines } },
      });
      await audit(tx, r.user, "purchase.created", po.id);
      return po;
    });
  }
  @Roles("OWNER", "STORE_KEEPER") @Post("orders/:id/status") async status(
    @Req() r: any,
    @Param("id") poId: string,
    @Body() body: unknown,
  ) {
    const { status } = parse(
      z.object({ status: z.enum(["ORDERED", "CANCELLED"]) }),
      body,
    );
    return this.db.atomic(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: poId, shopId: r.user.shopId },
      });
      requireThat(
        po &&
          (status === "ORDERED"
            ? po.status === "DRAFT"
            : ["DRAFT", "ORDERED"].includes(po.status)),
        "Invalid purchase order transition",
      );
      await audit(tx, r.user, `purchase.${status.toLowerCase()}`, poId);
      return tx.purchaseOrder.update({ where: { id: poId }, data: { status } });
    });
  }
  @Roles("OWNER", "STORE_KEEPER") @Post("orders/:id/receive") async receive(
    @Req() r: any,
    @Param("id") poId: string,
    @Body() body: unknown,
  ) {
    const v = parse(
      z.object({
        lineId: id,
        qty: quantity,
        inPacks: z.boolean().default(false),
        lotNumber: text,
        expiryDate: date,
        rack: z.string().max(80).default(""),
      }),
      body,
    );
    requireThat(
      dateUTC(v.expiryDate) > dateUTC(),
      "Cannot receive expired medicine",
    );
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id=${poId} FOR UPDATE`;
      const po = await tx.purchaseOrder.findFirst({
        where: { id: poId, shopId: r.user.shopId },
        include: { lines: { include: { medicine: true } } },
      });
      requireThat(
        po && ["ORDERED", "PARTIAL"].includes(po.status),
        "Only ordered or partially received orders can receive stock",
      );
      const line = po.lines.find((l) => l.id === v.lineId);
      requireThat(line, "Order line not found");
      const qty = D(v.qty).mul(v.inPacks ? line.medicine.packSize : 1);
      requireThat(
        qty.add(line.receivedQty).lte(line.qty),
        "Receipt exceeds outstanding units",
      );
      const key = {
        shopId: r.user.shopId,
        medicineId: line.medicineId,
        lotNumber: v.lotNumber,
        expiryDate: dateUTC(v.expiryDate),
      };
      const main = await tx.stockLocation.upsert({
        where: { shopId_code: { shopId: r.user.shopId, code: "MAIN" } },
        create: {
          shopId: r.user.shopId,
          code: "MAIN",
          name: "Main counter",
          canDispense: true,
        },
        update: {},
      });
      requireThat(
        main.active && !main.quarantined,
        "Main receiving location is quarantined or inactive",
      );
      const previous = await tx.stockBatch.findFirst({
        where: { ...key, locationId: main.id },
      });
      if (previous)
        requireThat(
          previous.status === "ACTIVE" &&
            !previous.recalled &&
            previous.costMinor === line.costMinor,
          "Existing lot is blocked or has a different unit cost",
        );
      const batch = previous
        ? await tx.stockBatch.update({
            where: { id: previous.id },
            data: { qtyOnHand: { increment: qty }, rack: v.rack },
          })
        : await tx.stockBatch.create({
            data: {
              ...key,
              locationId: main.id,
              qtyOnHand: qty,
              costMinor: line.costMinor,
              rack: v.rack,
            },
          });
      const receipt = await tx.goodsReceiptLine.create({
        data: {
          poId,
          medicineId: line.medicineId,
          lotNumber: v.lotNumber,
          expiryDate: dateUTC(v.expiryDate),
          qty,
          costMinor: line.costMinor,
          batchId: batch.id,
        },
      });
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQty: { increment: qty } },
      });
      const lines = await tx.purchaseOrderLine.findMany({ where: { poId } });
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: lines.every((l) => l.receivedQty.gte(l.qty))
            ? "RECEIVED"
            : "PARTIAL",
        },
      });
      await tx.stockMovement.create({
        data: {
          batchId: batch.id,
          type: "GRN",
          qty,
          refType: "PURCHASE",
          refId: poId,
        },
      });
      await audit(tx, r.user, "purchase.received", poId, {
        receiptId: receipt.id,
      });
      return receipt;
    });
  }
  @Roles("OWNER", "STORE_KEEPER") @Post("returns") async purchaseReturn(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(
      z.object({ batchId: id, qty: quantity, reason: text }),
      body,
    );
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StockBatch" WHERE id=${v.batchId} FOR UPDATE`;
      const b = await tx.stockBatch.findFirst({
        where: { id: v.batchId, shopId: r.user.shopId },
      });
      requireThat(b && b.qtyOnHand.gte(v.qty), "Insufficient batch stock");
      await tx.stockBatch.update({
        where: { id: b.id },
        data: { qtyOnHand: { decrement: v.qty } },
      });
      await tx.stockMovement.create({
        data: {
          batchId: b.id,
          type: "PURCHASE_RETURN",
          qty: D(v.qty).negated(),
          note: v.reason,
        },
      });
      await audit(tx, r.user, "purchase.returned", b.id, {
        qty: v.qty,
        reason: v.reason,
      });
      return { ok: true };
    });
  }
}
