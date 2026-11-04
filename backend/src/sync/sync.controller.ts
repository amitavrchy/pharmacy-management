import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  HttpException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { SalesService } from "../sales/sales.service";
import { saleSchema } from "../sales/sale.schema";
import { parse, z } from "../common/validation";
@Controller("sync")
export class SyncController {
  constructor(
    private readonly db: Db,
    private readonly sales: SalesService,
  ) {}
  @Roles("OWNER", "PHARMACIST", "CASHIER") @Post("push") async push(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const { sales } = parse(
        z.object({ sales: z.array(saleSchema).min(1).max(50) }),
        body,
      ),
      results = [];
    for (const sale of sales) {
      try {
        const completed = await this.sales.complete(r.user, sale);
        await this.db.syncReview.deleteMany({
          where: { clientSaleId: sale.clientSaleId, shopId: r.user.shopId },
        });
        results.push({
          clientSaleId: sale.clientSaleId,
          status: "COMPLETED",
          sale: completed,
        });
      } catch (e) {
        const reason =
          e instanceof HttpException
            ? e.message
            : "Temporary service failure; retry synchronization";
        const { ownerPin, ...safe } = sale;
        await this.db.syncReview.upsert({
          where: { clientSaleId: sale.clientSaleId },
          create: {
            clientSaleId: sale.clientSaleId,
            shopId: r.user.shopId,
            actorId: r.user.id,
            payload: safe as Prisma.InputJsonValue,
            reason,
          },
          update: { reason },
        });
        results.push({
          clientSaleId: sale.clientSaleId,
          status: "PENDING_REVIEW",
          reason,
        });
      }
    }
    return results;
  }
  @Roles("OWNER", "AUDITOR") @Get("reviews") reviews(@Req() r: any) {
    return this.db.syncReview.findMany({
      where: { shopId: r.user.shopId },
      orderBy: { createdAt: "desc" },
    });
  }
}
