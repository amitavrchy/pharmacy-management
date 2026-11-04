import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { parse, z, text } from "../common/validation";
import { dateUTC, requireThat } from "../common/domain";
import { audit } from "../common/audit";
import {
  deliverySchema,
  deliveryStatusSchema,
  reminderSchema,
} from "./operations.schemas";
@Controller("fulfillment")
export class FulfillmentController {
  constructor(private readonly db: Db) {}
  @Roles("OWNER", "PHARMACIST", "CASHIER", "AUDITOR")
  @Get("deliveries")
  deliveries(@Req() r: any) {
    return this.db.delivery.findMany({
      where: { shopId: r.user.shopId },
      orderBy: { createdAt: "desc" },
    });
  }
  @Roles("OWNER", "PHARMACIST", "CASHIER") @Post("deliveries") delivery(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(deliverySchema, body);
    return this.db.atomic(async (tx) => {
      requireThat(
        await tx.sale.findFirst({
          where: { id: v.saleId, shopId: r.user.shopId, status: "COMPLETED" },
        }),
        "Completed sale required",
      );
      const d = await tx.delivery.create({
        data: { ...v, shopId: r.user.shopId },
      });
      await audit(tx, r.user, "delivery.created", d.id, { saleId: v.saleId });
      return d;
    });
  }
  @Roles("OWNER", "PHARMACIST", "CASHIER")
  @Post("deliveries/:id/status")
  status(
    @Req() r: any,
    @Param("id") deliveryId: string,
    @Body() body: unknown,
  ) {
    const v = parse(deliveryStatusSchema, body);
    return this.db.atomic(async (tx) => {
      const d = await tx.delivery.findFirst({
        where: { id: deliveryId, shopId: r.user.shopId },
      });
      requireThat(d, "Delivery not found");
      const transitions: Record<string, string[]> = {
        QUEUED: ["ASSIGNED"],
        ASSIGNED: ["OUT_FOR_DELIVERY", "QUEUED"],
        OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
        FAILED: ["QUEUED"],
      };
      requireThat(
        transitions[d.status]?.includes(v.status),
        "Invalid delivery transition",
      );
      requireThat(
        await tx.sale.findFirst({
          where: { id: d.saleId, shopId: r.user.shopId, status: "COMPLETED" },
        }),
        "Receipt was returned; do not deliver",
      );
      if (v.status === "ASSIGNED") requireThat(v.courier, "Assign a courier");
      if (v.status === "DELIVERED")
        requireThat(v.proof, "Recipient name / delivery proof is required");
      await audit(tx, r.user, "delivery.status", d.id, {
        from: d.status,
        to: v.status,
        proof: v.proof || null,
      });
      return tx.delivery.update({ where: { id: d.id }, data: v });
    });
  }
  @Roles("OWNER", "PHARMACIST", "AUDITOR") @Get("reminders") async reminders(
    @Req() r: any,
  ) {
    const rows = await this.db.refillReminder.findMany({
      where: { shopId: r.user.shopId },
      orderBy: { dueDate: "asc" },
    });
    const customers = await this.db.customer.findMany({
      where: { shopId: r.user.shopId },
      select: { id: true, name: true, phone: true, contactConsent: true },
    });
    return rows.map((row) => ({
      ...row,
      customer: customers.find((c) => c.id === row.customerId),
      overdue: row.dueDate < dateUTC() && row.status === "SCHEDULED",
    }));
  }
  @Roles("OWNER", "PHARMACIST") @Post("reminders") reminder(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(reminderSchema, body);
    return this.db.atomic(async (tx) => {
      const c = await tx.customer.findFirst({
        where: { id: v.customerId, shopId: r.user.shopId, active: true },
      });
      requireThat(c?.contactConsent, "Customer contact consent is required");
      if (v.prescriptionId)
        requireThat(
          await tx.prescription.findFirst({
            where: {
              id: v.prescriptionId,
              shopId: r.user.shopId,
              status: { not: "CANCELLED" },
            },
          }),
          "Prescription not found",
        );
      const task = await tx.refillReminder.create({
        data: {
          ...v,
          dueDate: dateUTC(v.dueDate),
          shopId: r.user.shopId,
          createdBy: r.user.id,
        },
      });
      await audit(tx, r.user, "refill.reminder_created", task.id);
      return task;
    });
  }
  @Roles("OWNER", "PHARMACIST") @Post("reminders/:id/status") reminderStatus(
    @Req() r: any,
    @Param("id") taskId: string,
    @Body() body: unknown,
  ) {
    const v = parse(
      z.object({
        status: z.enum(["CONTACTED", "COMPLETED", "CANCELLED"]),
        note: text,
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      const task = await tx.refillReminder.findFirst({
        where: { id: taskId, shopId: r.user.shopId },
      });
      requireThat(
        task && ["SCHEDULED", "CONTACTED"].includes(task.status),
        "Reminder is closed or unavailable",
      );
      requireThat(v.status !== task.status, "Reminder already has this status");
      await audit(tx, r.user, "refill.reminder_status", taskId, v);
      return tx.refillReminder.update({ where: { id: taskId }, data: v });
    });
  }
}
