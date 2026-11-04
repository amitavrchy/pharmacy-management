import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { parse, z } from "../common/validation";
import { requireThat } from "../common/domain";
import { audit } from "../common/audit";
import { customerSchema, collectionSchema } from "./operations.schemas";
import { FinanceService } from "./finance.service";
@Roles("OWNER", "PHARMACIST", "CASHIER", "AUDITOR")
@Controller("customers")
export class CustomersController {
  constructor(
    private readonly db: Db,
    private readonly finance: FinanceService,
  ) {}
  @Get() async list(@Req() r: any) {
    const rows = await this.db.customer.findMany({
      where: { shopId: r.user.shopId },
      orderBy: { name: "asc" },
    });
    return rows.map((c) => ({
      ...c,
      allergies: ["OWNER", "PHARMACIST"].includes(r.user.role)
        ? c.allergies
        : undefined,
      conditions: ["OWNER", "PHARMACIST"].includes(r.user.role)
        ? c.conditions
        : undefined,
    }));
  }
  @Roles("OWNER", "PHARMACIST", "CASHIER") @Post() create(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(customerSchema, body);
    if (v.creditLimitMinor > 0)
      requireThat(
        r.user.role === "OWNER",
        "Owner required to assign customer credit",
      );
    if (r.user.role === "CASHIER")
      requireThat(
        v.creditLimitMinor === 0 && !v.allergies.length && !v.conditions.length,
        "Owner/pharmacist required for credit and care details",
      );
    return this.db.atomic(async (tx) => {
      const c = await tx.customer.create({
        data: { ...v, shopId: r.user.shopId },
      });
      await audit(tx, r.user, "customer.created", c.id);
      return c;
    });
  }
  @Roles("OWNER", "PHARMACIST") @Patch(":id") update(
    @Req() r: any,
    @Param("id") customerId: string,
    @Body() body: unknown,
  ) {
    const v = parse(customerSchema.partial(), body);
    for (const key of Object.keys(v) as (keyof typeof v)[])
      if (!Object.prototype.hasOwnProperty.call(body, key)) delete v[key];
    if (v.creditLimitMinor !== undefined)
      requireThat(
        r.user.role === "OWNER",
        "Owner required to change credit limits",
      );
    return this.db.atomic(async (tx) => {
      const c = await tx.customer.findFirst({
        where: { id: customerId, shopId: r.user.shopId },
      });
      requireThat(c, "Customer not found");
      await audit(tx, r.user, "customer.updated", customerId, {
        fields: Object.keys(v),
      });
      return tx.customer.update({ where: { id: customerId }, data: v });
    });
  }
  @Get(":id/statement") async statement(
    @Req() r: any,
    @Param("id") customerId: string,
  ) {
    const c = await this.db.customer.findFirst({
      where: { id: customerId, shopId: r.user.shopId },
      select: {
        id: true,
        name: true,
        balanceMinor: true,
        creditLimitMinor: true,
        loyaltyPoints: true,
        ledger: { orderBy: { createdAt: "asc" } },
        sales: {
          include: { lines: { include: { medicine: true } } },
          orderBy: { completedAt: "desc" },
        },
      },
    });
    requireThat(c, "Customer not found");
    return c;
  }
  @Roles("OWNER", "CASHIER") @Post(":id/payments") collect(
    @Req() r: any,
    @Param("id") customerId: string,
    @Body() body: unknown,
  ) {
    return this.finance.collect(
      r.user,
      customerId,
      parse(collectionSchema, body),
    );
  }
}
