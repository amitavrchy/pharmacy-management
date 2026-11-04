import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { parse, text, z } from "../common/validation";
import { hashPassword } from "../auth/password";
import { requireThat } from "../common/domain";
import { audit } from "../common/audit";
@Roles("OWNER")
@Controller("settings")
export class SettingsController {
  constructor(private readonly db: Db) {}
  @Patch() update(@Req() r: any, @Body() body: unknown) {
    const { ownerPin, ...v } = parse(
      z.object({
        name: text,
        drugLicenseNo: z.string().max(100),
        address: z.string().max(300),
        phone: z.string().max(30),
        requirePharmacistForRx: z.boolean(),
        saleWithoutBatchScan: z.boolean(),
        minMarginBps: z.number().int().min(0).max(9000),
        returnDays: z.number().int().min(0).max(30),
        ownerPin: z
          .string()
          .regex(/^\d{6,12}$/)
          .optional(),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      if (ownerPin)
        await tx.user.update({
          where: { id: r.user.id },
          data: { pinHash: hashPassword(ownerPin) },
        });
      await audit(tx, r.user, "settings.updated", r.user.shopId, v);
      return tx.shop.update({ where: { id: r.user.shopId }, data: v });
    });
  }
  @Get("users") users(@Req() r: any) {
    return this.db.user.findMany({
      where: { shopId: r.user.shopId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
  }
  @Post("users") async create(@Req() r: any, @Body() body: unknown) {
    const { password, ...v } = parse(
      z.object({
        name: text,
        email: z.email().transform((v) => v.toLowerCase()),
        role: z.enum([
          "OWNER",
          "PHARMACIST",
          "CASHIER",
          "STORE_KEEPER",
          "AUDITOR",
        ]),
        password: z.string().min(12).max(200),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      const user = await tx.user.create({
        data: {
          ...v,
          shopId: r.user.shopId,
          passwordHash: hashPassword(password),
        },
        select: { id: true, name: true, email: true, role: true },
      });
      await audit(tx, r.user, "user.created", user.id);
      return user;
    });
  }
  @Patch("users/:id") async status(
    @Req() r: any,
    @Param("id") userId: string,
    @Body() body: unknown,
  ) {
    const v = parse(z.object({ active: z.boolean() }), body);
    requireThat(userId !== r.user.id, "Cannot disable your own account");
    return this.db.atomic(async (tx) => {
      requireThat(
        await tx.user.findFirst({
          where: { id: userId, shopId: r.user.shopId },
        }),
        "User not found",
      );
      await tx.user.update({ where: { id: userId }, data: v });
      await audit(tx, r.user, "user.status", userId, v);
      return { ok: true };
    });
  }
}
