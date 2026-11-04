import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { parse } from "../common/validation";
import { dateUTC, requireThat } from "../common/domain";
import { audit } from "../common/audit";
import { FinanceService, shiftTotals, validateShift } from "./finance.service";
import {
  shiftOpenSchema,
  shiftCloseSchema,
  cashSchema,
  expenseSchema,
  billSchema,
  billPaymentSchema,
} from "./operations.schemas";
@Controller("finance")
export class FinanceController {
  constructor(
    private readonly db: Db,
    private readonly finance: FinanceService,
  ) {}
  @Roles("OWNER", "CASHIER", "AUDITOR") @Get("shifts") async shifts(
    @Req() r: any,
  ) {
    const shifts = await this.db.registerShift.findMany({
      where: {
        shopId: r.user.shopId,
        ...(r.user.role === "CASHIER" ? { cashierId: r.user.id } : {}),
      },
      orderBy: { openedAt: "desc" },
      take: 100,
    });
    return Promise.all(shifts.map((s) => shiftTotals(this.db, s.id)));
  }
  @Roles("OWNER", "CASHIER") @Post("shifts") open(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(shiftOpenSchema, body);
    return this.db.atomic(async (tx) => {
      requireThat(
        !(await tx.registerShift.findFirst({
          where: {
            shopId: r.user.shopId,
            OR: [
              { cashierId: r.user.id, status: "OPEN" },
              { registerName: v.registerName, status: "OPEN" },
            ],
          },
        })),
        "Cashier or register already has an open shift",
      );
      const shift = await tx.registerShift.create({
        data: { ...v, shopId: r.user.shopId, cashierId: r.user.id },
      });
      await audit(tx, r.user, "shift.opened", shift.id, v);
      return shift;
    });
  }
  @Roles("OWNER", "CASHIER") @Post("shifts/:id/close") close(
    @Req() r: any,
    @Param("id") shiftId: string,
    @Body() body: unknown,
  ) {
    const v = parse(shiftCloseSchema, body);
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RegisterShift" WHERE id=${shiftId} FOR UPDATE`;
      await validateShift(tx, r.user, shiftId);
      const totals = await shiftTotals(tx, shiftId);
      await audit(tx, r.user, "shift.closed", shiftId, {
        expected: totals.expected,
        counted: v.countedMinor,
        variance: v.countedMinor - totals.expected,
        note: v.note,
      });
      return tx.registerShift.update({
        where: { id: shiftId },
        data: {
          status: "CLOSED",
          countedMinor: v.countedMinor,
          expectedMinor: totals.expected,
          varianceMinor: v.countedMinor - totals.expected,
          closingNote: v.note,
          closedAt: new Date(),
        },
      });
    });
  }
  @Roles("OWNER", "CASHIER") @Post("shifts/:id/movements") movement(
    @Req() r: any,
    @Param("id") shiftId: string,
    @Body() body: unknown,
  ) {
    const v = parse(cashSchema, body);
    return this.db.atomic(async (tx) => {
      await validateShift(tx, r.user, shiftId);
      const old = await tx.cashMovement.findUnique({
        where: { reference: v.reference },
      });
      if (old) {
        requireThat(old.shiftId === shiftId, "Reference already used");
        return old;
      }
      const m = await tx.cashMovement.create({
        data: { ...v, shiftId, actorId: r.user.id },
      });
      await audit(tx, r.user, "cash.movement", m.id, {
        kind: v.kind,
        amountMinor: v.amountMinor,
      });
      return m;
    });
  }
  @Roles("OWNER", "AUDITOR") @Get("expenses") expenses(@Req() r: any) {
    return this.db.expense.findMany({
      where: { shopId: r.user.shopId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }
  @Roles("OWNER") @Post("expenses") expense(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    return this.finance.expense(r.user, parse(expenseSchema, body));
  }
  @Roles("OWNER", "AUDITOR", "STORE_KEEPER") @Get("bills") async bills(
    @Req() r: any,
  ) {
    const bills = await this.db.supplierBill.findMany({
      where: { shopId: r.user.shopId },
      include: { payments: true },
      orderBy: { dueDate: "asc" },
    });
    const suppliers = await this.db.supplier.findMany({
      where: { shopId: r.user.shopId },
    });
    return bills.map((b) => ({
      ...b,
      supplier: suppliers.find((s) => s.id === b.supplierId),
      outstandingMinor: b.totalMinor - b.paidMinor,
      overdue: b.status !== "PAID" && b.dueDate < dateUTC(),
    }));
  }
  @Roles("OWNER") @Post("bills") bill(@Req() r: any, @Body() body: unknown) {
    const v = parse(billSchema, body);
    return this.db.atomic(async (tx) => {
      requireThat(
        await tx.supplier.findFirst({
          where: { id: v.supplierId, shopId: r.user.shopId },
        }),
        "Supplier not found",
      );
      if (v.poId)
        requireThat(
          await tx.purchaseOrder.findFirst({
            where: {
              id: v.poId,
              shopId: r.user.shopId,
              supplierId: v.supplierId,
              status: { in: ["PARTIAL", "RECEIVED"] },
            },
          }),
          "Received order from this supplier required",
        );
      const bill = await tx.supplierBill.create({
        data: { ...v, shopId: r.user.shopId, dueDate: dateUTC(v.dueDate) },
      });
      await audit(tx, r.user, "supplier.bill_created", bill.id, {
        totalMinor: v.totalMinor,
      });
      return bill;
    });
  }
  @Roles("OWNER") @Post("bills/:id/payments") pay(
    @Req() r: any,
    @Param("id") billId: string,
    @Body() body: unknown,
  ) {
    return this.finance.payBill(r.user, billId, parse(billPaymentSchema, body));
  }
}
