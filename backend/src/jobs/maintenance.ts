import { Db } from "../db/prisma.service";
import { D, dateUTC, daysUntil, shopDate } from "../common/domain";
export async function maintenance(db: Db) {
  const shops = await db.shop.findMany();
  for (const shop of shops)
    await db.atomic(async (tx) => {
      const expired = await tx.stockBatch.findMany({
        where: {
          shopId: shop.id,
          status: "ACTIVE",
          expiryDate: { lte: dateUTC() },
        },
      });
      for (const batch of expired) {
        await tx.stockBatch.update({
          where: { id: batch.id },
          data: { status: "QUARANTINED" },
        });
        await tx.auditEntry.create({
          data: {
            shopId: shop.id,
            actorId: "SYSTEM",
            action: "batch.quarantined",
            entityId: batch.id,
            details: { lot: batch.lotNumber },
          },
        });
      }
      const meds = await tx.medicine.findMany({
        where: { shopId: shop.id, active: true },
        include: { batches: true },
      });
      for (const m of meds) {
        const active = m.batches.filter(
          (b) =>
            b.status === "ACTIVE" && !b.recalled && b.expiryDate > dateUTC(),
        );
        const stock = active.reduce((s, b) => s.add(b.qtyOnHand), D(0));
        const lowKey = `low:${m.id}`;
        if (stock.lte(m.reorderLevel))
          await tx.alert.upsert({
            where: { key: lowKey },
            create: {
              shopId: shop.id,
              type: "LOW_STOCK",
              key: lowKey,
              payload: {
                medicineId: m.id,
                brand: m.brandName,
                stock: stock.toString(),
              },
            },
            update: {
              resolvedAt: null,
              payload: {
                medicineId: m.id,
                brand: m.brandName,
                stock: stock.toString(),
              },
            },
          });
        else
          await tx.alert.updateMany({
            where: { key: lowKey, resolvedAt: null },
            data: { resolvedAt: new Date() },
          });
        for (const batch of m.batches) {
          const days = daysUntil(batch.expiryDate);
          if (
            days > Number(process.env.NEAR_EXPIRY_DAYS || 90) ||
            batch.qtyOnHand.lte(0) ||
            batch.status === "EXPIRED_WASTED"
          )
            continue;
          const type = days <= 0 ? "EXPIRED" : "NEAR_EXPIRY",
            key = `expiry:${batch.id}:${days <= 0 ? "expired" : days <= 30 ? "30" : days <= 60 ? "60" : "90"}`;
          await tx.alert.upsert({
            where: { key },
            create: {
              shopId: shop.id,
              type,
              key,
              payload: {
                medicineId: m.id,
                brand: m.brandName,
                lot: batch.lotNumber,
                days,
                batchId: batch.id,
              },
            },
            update: {
              payload: {
                medicineId: m.id,
                brand: m.brandName,
                lot: batch.lotNumber,
                days,
                batchId: batch.id,
              },
            },
          });
        }
      }
      const day = shopDate(),
        snapshotKey = `register:${shop.id}:${day}`;
      const existing = await tx.auditEntry.findFirst({
        where: {
          shopId: shop.id,
          action: "controlled.daily_snapshot",
          entityId: snapshotKey,
        },
      });
      if (!existing) {
        const stock = meds
          .filter((m) => m.schedule === "CONTROLLED")
          .map((m) => ({
            medicineId: m.id,
            brand: m.brandName,
            qty: m.batches
              .reduce((s, b) => s.add(b.qtyOnHand), D(0))
              .toString(),
          }));
        await tx.auditEntry.create({
          data: {
            shopId: shop.id,
            actorId: "SYSTEM",
            action: "controlled.daily_snapshot",
            entityId: snapshotKey,
            details: { day, stock },
          },
        });
      }
      const pending = await tx.syncReview.count({
        where: { shopId: shop.id, status: "PENDING_REVIEW" },
      });
      if (pending)
        await tx.alert.upsert({
          where: { key: `sync:${shop.id}` },
          create: {
            shopId: shop.id,
            type: "SYNC_REVIEW",
            key: `sync:${shop.id}`,
            payload: { count: pending },
          },
          update: { resolvedAt: null, payload: { count: pending } },
        });
      else
        await tx.alert.updateMany({
          where: { key: `sync:${shop.id}` },
          data: { resolvedAt: new Date() },
        });
    });
}
