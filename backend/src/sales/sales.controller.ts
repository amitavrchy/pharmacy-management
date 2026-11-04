import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { Roles } from "../auth/auth";
import { parse } from "../common/validation";
import { Db } from "../db/prisma.service";
import { saleSchema } from "./sale.schema";
import { SalesService } from "./sales.service";
@Controller("pos/sales")
export class SalesController {
  constructor(
    private readonly db: Db,
    private readonly sales: SalesService,
  ) {}
  @Roles("OWNER", "PHARMACIST", "CASHIER") @Post() create(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    return this.sales.complete(r.user, parse(saleSchema, body));
  }
  @Get() async list(@Req() r: any) {
    const rows = await this.db.sale.findMany({
      where: { shopId: r.user.shopId },
      include: {
        lines: { include: { medicine: true, batches: true } },
        returns: true,
      },
      orderBy: { completedAt: "desc" },
      take: 300,
    });
    return rows.map((s) => ({
      ...s,
      lines: s.lines.map((l) => ({
        ...l,
        batches: l.batches.map((b) => ({
          ...b,
          costMinor: ["OWNER", "AUDITOR"].includes(r.user.role)
            ? b.costMinor
            : undefined,
        })),
      })),
    }));
  }
}
