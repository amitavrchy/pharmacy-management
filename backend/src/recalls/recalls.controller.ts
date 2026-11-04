import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { id, parse, text, z } from "../common/validation";
import { requireThat } from "../common/domain";
import { audit } from "../common/audit";
@Controller("recalls")
export class RecallsController {
  constructor(private readonly db: Db) {}
  @Roles("OWNER", "PHARMACIST") @Post() async create(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(z.object({ batchId: id, reason: text }), body);
    return this.db.atomic(async (tx) => {
      const b = await tx.stockBatch.findFirst({
        where: { id: v.batchId, shopId: r.user.shopId },
      });
      requireThat(b && !b.recalled, "Batch is unavailable or already recalled");
      await tx.stockBatch.update({
        where: { id: b.id },
        data: { recalled: true, status: "RECALLED" },
      });
      await tx.alert.upsert({
        where: { key: `recall:${b.id}` },
        create: {
          shopId: r.user.shopId,
          type: "RECALL",
          key: `recall:${b.id}`,
          payload: { batchId: b.id, lot: b.lotNumber, reason: v.reason },
        },
        update: {},
      });
      await audit(tx, r.user, "batch.recalled", b.id, { reason: v.reason });
      return { ok: true };
    });
  }
  @Roles("OWNER", "PHARMACIST", "AUDITOR") @Get(":id/customers") customers(
    @Req() r: any,
    @Param("id") batchId: string,
  ) {
    return this.db.saleLineBatch.findMany({
      where: { batchId, batch: { shopId: r.user.shopId } },
      include: {
        saleLine: {
          include: {
            sale: {
              select: {
                id: true,
                completedAt: true,
                customerName: true,
                customerPhone: true,
                status: true,
              },
            },
            medicine: true,
          },
        },
      },
    });
  }
  @Roles("OWNER", "STORE_KEEPER") @Post(":id/waste") async waste(
    @Req() r: any,
    @Param("id") batchId: string,
    @Body() body: unknown,
  ) {
    const { note } = parse(z.object({ note: text }), body);
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StockBatch" WHERE id=${batchId} FOR UPDATE`;
      const b = await tx.stockBatch.findFirst({
        where: { id: batchId, shopId: r.user.shopId },
      });
      requireThat(
        b && ["QUARANTINED", "RECALLED"].includes(b.status),
        "Quarantine or recall the batch before disposal",
      );
      await tx.stockMovement.create({
        data: {
          batchId,
          type: "EXPIRED_WASTE",
          qty: b.qtyOnHand.negated(),
          note,
        },
      });
      await audit(tx, r.user, "batch.wasted", batchId, {
        qty: b.qtyOnHand.toString(),
        note,
      });
      return tx.stockBatch.update({
        where: { id: batchId },
        data: { status: "EXPIRED_WASTED", qtyOnHand: 0 },
      });
    });
  }
}
