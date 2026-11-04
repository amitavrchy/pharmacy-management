import { Controller, Get, Query, Req } from "@nestjs/common";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { D, dateUTC, daysUntil, money, shopDate } from "../common/domain";
import { parse, z, date } from "../common/validation";
@Controller("reports")
export class ReportsController {
  constructor(private readonly db: Db) {}
  @Get("dashboard") async dashboard(@Req() r: any) {
    const start = new Date(`${shopDate()}T00:00:00+06:00`),
      since = new Date(start.getTime() - 6 * 86400000);
    const [sales, medicines, batches, rx, alerts, recent] = await Promise.all([
      this.db.sale.findMany({
        where: {
          shopId: r.user.shopId,
          completedAt: { gte: since },
          status: "COMPLETED",
        },
        include: { lines: true },
      }),
      this.db.medicine.findMany({
        where: { shopId: r.user.shopId, active: true },
        include: {
          batches: {
            where: {
              status: "ACTIVE",
              recalled: false,
              expiryDate: { gt: dateUTC() },
            },
          },
        },
      }),
      this.db.stockBatch.findMany({
        where: { shopId: r.user.shopId, qtyOnHand: { gt: 0 } },
      }),
      this.db.prescription.count({
        where: { shopId: r.user.shopId, status: "CAPTURED" },
      }),
      this.db.alert.count({
        where: { shopId: r.user.shopId, resolvedAt: null },
      }),
      this.db.sale.findMany({
        where: { shopId: r.user.shopId },
        include: { lines: { include: { medicine: true } } },
        orderBy: { completedAt: "desc" },
        take: 5,
      }),
    ]);
    const today = sales.filter((s) => s.completedAt >= start);
    return {
      todayRevenue: today.reduce((s, x) => s + x.totalMinor, 0),
      todaySales: today.length,
      activeMedicines: medicines.length,
      lowStock: medicines.filter((m) =>
        D(m.batches.reduce((s, b) => s + Number(b.qtyOnHand), 0)).lte(
          m.reorderLevel,
        ),
      ).length,
      nearExpiry: batches.filter(
        (b) => daysUntil(b.expiryDate) > 0 && daysUntil(b.expiryDate) <= 90,
      ).length,
      pendingRx: rx,
      alerts,
      recent,
      week: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(since.getTime() + i * 86400000),
          key = shopDate(d);
        return {
          day: new Intl.DateTimeFormat("en", {
            weekday: "short",
            timeZone: "Asia/Dhaka",
          }).format(d),
          revenue:
            sales
              .filter((s) => shopDate(s.completedAt) === key)
              .reduce((s, x) => s + x.totalMinor, 0) / 100,
        };
      }),
    };
  }
  @Get("expiry-ageing") async expiry(@Req() r: any) {
    const batches = await this.db.stockBatch.findMany({
      where: { shopId: r.user.shopId, qtyOnHand: { gt: 0 } },
      include: { medicine: true },
      orderBy: { expiryDate: "asc" },
    });
    return batches.map((b) => ({
      ...b,
      costMinor: ["OWNER", "AUDITOR"].includes(r.user.role)
        ? b.costMinor
        : undefined,
      days: daysUntil(b.expiryDate),
      bucket:
        daysUntil(b.expiryDate) <= 0
          ? "Expired"
          : daysUntil(b.expiryDate) <= 30
            ? "0–30 days"
            : daysUntil(b.expiryDate) <= 60
              ? "31–60 days"
              : daysUntil(b.expiryDate) <= 90
                ? "61–90 days"
                : "90+ days",
    }));
  }
  @Roles("OWNER", "AUDITOR") @Get("sales") async sales(
    @Req() r: any,
    @Query() query: unknown,
  ) {
    const q = parse(
      z.object({ from: date.optional(), to: date.optional() }),
      query,
    );
    const sales = await this.db.sale.findMany({
      where: {
        shopId: r.user.shopId,
        status: "COMPLETED",
        completedAt: {
          ...(q.from ? { gte: new Date(`${q.from}T00:00:00+06:00`) } : {}),
          ...(q.to
            ? {
                lt: new Date(
                  new Date(`${q.to}T00:00:00+06:00`).getTime() + 86400000,
                ),
              }
            : {}),
        },
      },
      include: {
        lines: {
          include: { medicine: { include: { generic: true } }, batches: true },
        },
      },
      orderBy: { completedAt: "desc" },
    });
    const revenue = sales.reduce((s, x) => s + x.totalMinor, 0),
      cost = sales.reduce(
        (s, x) =>
          s +
          x.lines.reduce(
            (a, l) =>
              a + l.batches.reduce((v, b) => v + money(b.qty, b.costMinor), 0),
            0,
          ),
        0,
      );
    const top = new Map<
      string,
      { generic: string; qty: number; revenue: number }
    >();
    for (const s of sales)
      for (const l of s.lines) {
        const name = l.medicine.generic.name;
        const item = top.get(name) || { generic: name, qty: 0, revenue: 0 };
        item.qty += Number(l.qty);
        item.revenue += money(l.qty, l.unitPriceMinor);
        top.set(name, item);
      }
    return {
      revenue,
      cost,
      grossProfit: revenue - cost,
      margin: revenue ? ((revenue - cost) / revenue) * 100 : 0,
      count: sales.length,
      sales,
      topGenerics: [...top.values()].sort((a, b) => b.revenue - a.revenue),
      taxMinor: 0,
      taxPolicy:
        "No tax configured. Confirm applicable shop tax rules before production.",
    };
  }
  @Roles("OWNER", "PHARMACIST", "AUDITOR") @Get("controlled") controlled(
    @Req() r: any,
  ) {
    return this.db.saleLine.findMany({
      where: {
        sale: { shopId: r.user.shopId },
        medicine: { schedule: "CONTROLLED" },
      },
      include: { medicine: true, sale: true, batches: true },
      orderBy: { sale: { completedAt: "desc" } },
      take: 500,
    });
  }
  @Roles("OWNER", "AUDITOR") @Get("audit") audit(@Req() r: any) {
    return this.db.auditEntry.findMany({
      where: { shopId: r.user.shopId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }
}
