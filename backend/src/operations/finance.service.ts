import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../db/prisma.service";
import { Actor, requireThat } from "../common/domain";
import { audit } from "../common/audit";
import { z } from "../common/validation";
import {
  collectionSchema,
  expenseSchema,
  billPaymentSchema,
} from "./operations.schemas";
export function tenderAmount(tenders: Prisma.JsonValue, method: string) {
  return (Array.isArray(tenders) ? tenders : []).reduce<number>(
    (sum, t: any) =>
      sum + (t?.method === method ? Number(t.amountMinor) || 0 : 0),
    0,
  );
}
export async function shiftTotals(
  tx: Prisma.TransactionClient,
  shiftId: string,
) {
  const shift = await tx.registerShift.findUniqueOrThrow({
    where: { id: shiftId },
    include: {
      movements: true,
      sales: { select: { tenders: true, totalMinor: true, status: true } },
    },
  });
  const cashSales = shift.sales.reduce(
    (s, sale) => s + tenderAmount(sale.tenders, "CASH"),
    0,
  );
  const cashIn = shift.movements
    .filter((m) => ["CASH_IN", "COLLECTION"].includes(m.kind))
    .reduce((s, m) => s + m.amountMinor, 0);
  const cashOut = shift.movements
    .filter((m) =>
      ["CASH_OUT", "EXPENSE", "REFUND", "SUPPLIER_PAYMENT"].includes(m.kind),
    )
    .reduce((s, m) => s + m.amountMinor, 0);
  return {
    ...shift,
    cashSales,
    cashIn,
    cashOut,
    expected: shift.openingMinor + cashSales + cashIn - cashOut,
  };
}
export async function validateShift(
  tx: Prisma.TransactionClient,
  actor: Actor,
  shiftId: string,
) {
  const shift = await tx.registerShift.findFirst({
    where: { id: shiftId, shopId: actor.shopId, status: "OPEN" },
  });
  requireThat(shift, "Open register shift not found");
  requireThat(
    actor.role === "OWNER" || shift.cashierId === actor.id,
    "Use your own open register shift",
  );
  return shift;
}
@Injectable()
export class FinanceService {
  constructor(private readonly db: Db) {}
  async collect(
    actor: Actor,
    customerId: string,
    input: z.infer<typeof collectionSchema>,
  ) {
    return this.db.atomic(async (tx) => {
      const existing = await tx.customerLedger.findUnique({
        where: { reference: input.reference },
      });
      if (existing) {
        requireThat(
          existing.customerId === customerId && existing.kind === "PAYMENT",
          "Reference already used",
        );
        requireThat(
          await tx.customer.findFirst({
            where: { id: customerId, shopId: actor.shopId },
          }),
          "Customer not found",
        );
        return existing;
      }
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${customerId} FOR UPDATE`;
      const customer = await tx.customer.findFirst({
        where: { id: customerId, shopId: actor.shopId },
      });
      requireThat(customer, "Customer not found");
      requireThat(
        input.amountMinor <= customer.balanceMinor,
        "Payment exceeds outstanding balance",
      );
      if (input.shiftId) await validateShift(tx, actor, input.shiftId);
      await tx.customer.update({
        where: { id: customerId },
        data: { balanceMinor: { decrement: input.amountMinor } },
      });
      const entry = await tx.customerLedger.create({
        data: {
          customerId,
          kind: "PAYMENT",
          amountMinor: -input.amountMinor,
          method: input.method,
          reference: input.reference,
          note: input.note,
          actorId: actor.id,
        },
      });
      if (input.method === "CASH" && input.shiftId)
        await tx.cashMovement.create({
          data: {
            shiftId: input.shiftId,
            kind: "COLLECTION",
            amountMinor: input.amountMinor,
            reference: `collection:${input.reference}`,
            note: input.note,
            actorId: actor.id,
          },
        });
      await audit(tx, actor, "customer.payment", customerId, {
        amountMinor: input.amountMinor,
        method: input.method,
        reference: input.reference,
      });
      return entry;
    });
  }
  async expense(actor: Actor, input: z.infer<typeof expenseSchema>) {
    return this.db.atomic(async (tx) => {
      const old = await tx.expense.findUnique({
        where: { reference: input.reference },
      });
      if (old) {
        requireThat(old.shopId === actor.shopId, "Reference already used");
        return old;
      }
      if (input.shiftId) await validateShift(tx, actor, input.shiftId);
      const { shiftId, ...data } = input;
      const expense = await tx.expense.create({
        data: { ...data, shopId: actor.shopId, actorId: actor.id },
      });
      if (shiftId && input.method === "CASH")
        await tx.cashMovement.create({
          data: {
            shiftId,
            kind: "EXPENSE",
            amountMinor: input.amountMinor,
            reference: `expense:${input.reference}`,
            note: input.note,
            actorId: actor.id,
          },
        });
      await audit(tx, actor, "expense.recorded", expense.id, {
        amountMinor: input.amountMinor,
        category: input.category,
      });
      return expense;
    });
  }
  async payBill(
    actor: Actor,
    billId: string,
    input: z.infer<typeof billPaymentSchema>,
  ) {
    return this.db.atomic(async (tx) => {
      const old = await tx.supplierPayment.findUnique({
        where: { reference: input.reference },
      });
      if (old) {
        requireThat(old.billId === billId, "Reference already used");
        requireThat(
          await tx.supplierBill.findFirst({
            where: { id: billId, shopId: actor.shopId },
          }),
          "Bill not found",
        );
        return old;
      }
      await tx.$queryRaw`SELECT id FROM "SupplierBill" WHERE id=${billId} FOR UPDATE`;
      const bill = await tx.supplierBill.findFirst({
        where: { id: billId, shopId: actor.shopId },
      });
      requireThat(bill, "Bill not found");
      requireThat(
        input.amountMinor <= bill.totalMinor - bill.paidMinor,
        "Payment exceeds outstanding invoice",
      );
      const paid = bill.paidMinor + input.amountMinor;
      if (input.shiftId) await validateShift(tx, actor, input.shiftId);
      await tx.supplierBill.update({
        where: { id: billId },
        data: {
          paidMinor: paid,
          status: paid === bill.totalMinor ? "PAID" : "PARTIAL",
        },
      });
      const payment = await tx.supplierPayment.create({
        data: {
          amountMinor: input.amountMinor,
          method: input.method,
          reference: input.reference,
          note: input.note,
          billId,
          actorId: actor.id,
        },
      });
      if (input.shiftId && input.method === "CASH")
        await tx.cashMovement.create({
          data: {
            shiftId: input.shiftId,
            kind: "SUPPLIER_PAYMENT",
            amountMinor: input.amountMinor,
            reference: `supplier:${input.reference}`,
            note: input.note,
            actorId: actor.id,
          },
        });
      await audit(tx, actor, "supplier.payment", billId, {
        amountMinor: input.amountMinor,
        reference: input.reference,
      });
      return payment;
    });
  }
}
