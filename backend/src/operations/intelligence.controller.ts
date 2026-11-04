import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { parse, z, id } from "../common/validation";
import { dateUTC, daysUntil, money, requireThat } from "../common/domain";
import { audit } from "../common/audit";
import { forecastSchema } from "./operations.schemas";
@Roles("OWNER", "STORE_KEEPER", "AUDITOR")
@Controller("intelligence")
export class IntelligenceController {
  constructor(private readonly db: Db) {}
  async forecast(shopId: string, targetDays = 30, leadDays = 7) {
    const since = new Date(Date.now() - 90 * 86400000),
      recent = new Date(Date.now() - 30 * 86400000);
    const meds = await this.db.medicine.findMany({
      where: { shopId, active: true },
      include: {
        generic: true,
        batches: { include: { location: true } },
        saleLines: {
          where: { sale: { status: "COMPLETED", completedAt: { gte: since } } },
          include: { sale: { select: { completedAt: true } } },
        },
      },
    });
    const rows = meds
      .map((m) => {
        const eligible = m.batches.filter(
          (b) =>
            b.status === "ACTIVE" &&
            !b.recalled &&
            b.expiryDate > dateUTC() &&
            (!b.location || (b.location.active && !b.location.quarantined)),
        );
        const stock = eligible.reduce((s, b) => s + Number(b.qtyOnHand), 0);
        const units30 = m.saleLines
            .filter((l) => l.sale.completedAt >= recent)
            .reduce((s, l) => s + Number(l.qty), 0),
          daily = units30 / 30;
        const desired = Math.max(
          Number(m.reorderLevel),
          daily * (targetDays + leadDays),
        );
        const suggested = Math.max(
          0,
          Math.ceil((desired - stock) / m.packSize) * m.packSize,
        );
        const revenue = m.saleLines.reduce(
          (s, l) => s + money(l.qty, l.unitPriceMinor),
          0,
        );
        const last = m.saleLines.reduce<Date | null>(
          (s, l) => (!s || l.sale.completedAt > s ? l.sale.completedAt : s),
          null,
        );
        const lastDays = last
          ? Math.floor((Date.now() - last.getTime()) / 86400000)
          : null;
        const cost = m.batches[0]?.costMinor || 0;
        return {
          medicineId: m.id,
          brandName: m.brandName,
          generic: m.generic.name,
          packSize: m.packSize,
          stock,
          units30,
          dailyUsage: daily,
          daysCover: daily ? stock / daily : null,
          targetUnits: Math.ceil(desired),
          suggestedQty: suggested,
          unitCostMinor: cost,
          estimatedCostMinor: money(suggested, cost),
          revenue90: revenue,
          lastSale: last,
          fsn:
            lastDays === null ? "NON_MOVING" : lastDays <= 30 ? "FAST" : "SLOW",
          expiryAtRiskMinor: m.batches
            .filter(
              (b) => Number(b.qtyOnHand) > 0 && daysUntil(b.expiryDate) <= 90,
            )
            .reduce((s, b) => s + money(b.qtyOnHand, b.costMinor), 0),
        };
      })
      .sort((a, b) => b.revenue90 - a.revenue90);
    const total = rows.reduce((s, r) => s + r.revenue90, 0);
    let cumulative = 0;
    return rows.map((r) => {
      const before = cumulative;
      cumulative += r.revenue90;
      return {
        ...r,
        abc:
          total === 0
            ? "C"
            : before / total < 0.8
              ? "A"
              : before / total < 0.95
                ? "B"
                : "C",
      };
    });
  }
  @Get("replenishment") forecastRoute(@Req() r: any, @Query() query: unknown) {
    const v = parse(forecastSchema, query);
    return this.forecast(r.user.shopId, v.targetDays, v.leadDays);
  }
  @Roles("OWNER", "STORE_KEEPER") @Post("replenishment/orders") order(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(
      forecastSchema.extend({
        supplierId: id,
        medicineIds: z.array(id).min(1).max(100),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      requireThat(
        await tx.supplier.findFirst({
          where: { id: v.supplierId, shopId: r.user.shopId },
        }),
        "Supplier not found",
      );
      const rows = (
        await this.forecast(r.user.shopId, v.targetDays, v.leadDays)
      ).filter(
        (row) => v.medicineIds.includes(row.medicineId) && row.suggestedQty > 0,
      );
      requireThat(rows.length, "No selected medicine needs replenishment");
      const po = await tx.purchaseOrder.create({
        data: {
          shopId: r.user.shopId,
          supplierId: v.supplierId,
          notes: `Demand forecast: 30-day usage, target ${v.targetDays} days + ${v.leadDays} lead days. Review before ordering.`,
          lines: {
            create: rows.map((row) => ({
              medicineId: row.medicineId,
              qty: row.suggestedQty,
              costMinor: row.unitCostMinor,
            })),
          },
        },
      });
      await audit(tx, r.user, "purchase.forecast_draft", po.id, {
        lines: rows.length,
      });
      return po;
    });
  }
  @Roles("OWNER", "AUDITOR") @Get("summary") async summary(@Req() r: any) {
    const shopId = r.user.shopId;
    const [rows, customers, bills, expenses, deliveries, transfers, shifts] =
      await Promise.all([
        this.forecast(shopId),
        this.db.customer.findMany({ where: { shopId } }),
        this.db.supplierBill.findMany({ where: { shopId } }),
        this.db.expense.findMany({
          where: {
            shopId,
            createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
          },
        }),
        this.db.delivery.groupBy({
          by: ["status"],
          where: { shopId },
          _count: true,
        }),
        this.db.stockTransfer.count({
          where: { shopId, status: "DISPATCHED" },
        }),
        this.db.registerShift.findMany({
          where: { shopId, status: "CLOSED" },
          orderBy: { closedAt: "desc" },
          take: 30,
        }),
      ]);
    return {
      receivableMinor: customers.reduce(
        (s, c) => s + Math.max(0, c.balanceMinor),
        0,
      ),
      payableMinor: bills.reduce((s, b) => s + b.totalMinor - b.paidMinor, 0),
      overduePayableMinor: bills
        .filter((b) => b.dueDate < dateUTC())
        .reduce((s, b) => s + b.totalMinor - b.paidMinor, 0),
      expenses30Minor: expenses.reduce((s, e) => s + e.amountMinor, 0),
      deadStockCount: rows.filter((r) => r.fsn === "NON_MOVING" && r.stock > 0)
        .length,
      atRiskMinor: rows.reduce((s, r) => s + r.expiryAtRiskMinor, 0),
      suggestedPurchaseMinor: rows.reduce(
        (s, r) => s + r.estimatedCostMinor,
        0,
      ),
      transfersInTransit: transfers,
      deliveryStatuses: deliveries,
      shiftVarianceMinor: shifts.reduce(
        (s, sh) => s + (sh.varianceMinor || 0),
        0,
      ),
      abc: ["A", "B", "C"].map((c) => ({
        class: c,
        count: rows.filter((r) => r.abc === c).length,
        revenue: rows
          .filter((r) => r.abc === c)
          .reduce((s, r) => s + r.revenue90, 0),
      })),
    };
  }
}
