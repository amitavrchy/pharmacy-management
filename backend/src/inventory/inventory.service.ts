import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../db/prisma.service";
import { Actor, D, dateUTC, planFefo, requireThat } from "../common/domain";
import { audit } from "../common/audit";
@Injectable()
export class InventoryService {
  constructor(private readonly db: Db) {}
  async allocateFeFo(
    tx: Prisma.TransactionClient,
    actor: Actor,
    medicineId: string,
    qty: number,
    commit = true,
    refId?: string,
    scannedLot?: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "StockBatch" WHERE "shopId"=${actor.shopId} AND "medicineId"=${medicineId} ORDER BY "expiryDate", id FOR UPDATE`;
    const batches = await tx.stockBatch.findMany({
      where: { shopId: actor.shopId, medicineId },
    });
    const plan = planFefo(batches, qty);
    if (scannedLot)
      requireThat(
        plan.every(
          (p) =>
            batches.find((b) => b.id === p.batchId)?.lotNumber === scannedLot,
        ),
        "Scan the earliest-expiring batch; split this line if multiple lots are needed",
      );
    if (commit)
      for (const p of plan) {
        await tx.stockBatch.update({
          where: { id: p.batchId },
          data: { qtyOnHand: { decrement: p.qty } },
        });
        await tx.stockMovement.create({
          data: {
            batchId: p.batchId,
            type: "SALE",
            qty: p.qty.negated(),
            refType: "SALE",
            refId,
          },
        });
      }
    return plan;
  }
  async adjust(
    actor: Actor,
    batchId: string,
    quantity: number,
    note: string,
    rack?: string,
  ) {
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StockBatch" WHERE id=${batchId} FOR UPDATE`;
      const batch = await tx.stockBatch.findFirst({
        where: { id: batchId, shopId: actor.shopId },
        include: { medicine: true },
      });
      requireThat(batch, "Batch not found");
      requireThat(
        batch.status === "ACTIVE" &&
          !batch.recalled &&
          batch.expiryDate > dateUTC(),
        "Batch is blocked",
      );
      requireThat(D(quantity).gte(0), "Count cannot be negative");
      const difference = D(quantity).sub(batch.qtyOnHand);
      if (batch.medicine.schedule === "CONTROLLED" && !difference.eq(0))
        requireThat(
          actor.role === "OWNER",
          "Controlled stock variance requires an owner note",
        );
      if (actor.role !== "OWNER")
        requireThat(
          difference.abs().lte(100),
          "Owner required for adjustments over 100 units",
        );
      const updated = await tx.stockBatch.update({
        where: { id: batchId },
        data: { qtyOnHand: quantity, ...(rack !== undefined ? { rack } : {}) },
      });
      await tx.stockMovement.create({
        data: { batchId, type: "CYCLE_COUNT", qty: difference, note },
      });
      await audit(tx, actor, "stock.adjusted", batchId, {
        before: batch.qtyOnHand.toString(),
        after: quantity,
        note,
      });
      return updated;
    });
  }
}
