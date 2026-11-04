import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { parse as csvParse } from "csv-parse/sync";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { id, minor, parse, text, z } from "../common/validation";
import { dateUTC, requireThat } from "../common/domain";
import { audit } from "../common/audit";
import { BarcodeCache } from "./barcode-cache.service";
const medicineSchema = z.object({
  brandName: text,
  genericName: text,
  therapeuticClass: z.string().max(100).optional(),
  manufacturer: text,
  strength: text,
  form: text,
  packSize: z.coerce.number().int().min(1).max(10000),
  barcode: z.string().trim().min(1).max(100).optional(),
  schedule: z.enum(["OTC", "RX", "CONTROLLED"]),
  priceMinor: minor,
  reorderLevel: z.coerce.number().min(0).max(100000),
  unitName: text.default("pcs"),
});
@Controller("catalog")
export class CatalogController {
  constructor(
    private readonly db: Db,
    private readonly barcode: BarcodeCache,
  ) {}
  @Get("barcode/:barcode") async lookup(
    @Req() r: any,
    @Param("barcode") code: string,
  ) {
    return this.barcode.lookup(r.user.shopId, code);
  }
  @Get() async list(@Req() r: any) {
    const rows = await this.db.medicine.findMany({
      where: { shopId: r.user.shopId },
      include: {
        generic: true,
        batches: {
          where: {
            status: "ACTIVE",
            recalled: false,
            expiryDate: { gt: dateUTC() },
            qtyOnHand: { gt: 0 },
          },
          orderBy: { expiryDate: "asc" },
        },
      },
      orderBy: { brandName: "asc" },
    });
    return rows.map((m) => ({
      ...m,
      stock: m.batches.reduce((s, b) => s + Number(b.qtyOnHand), 0),
      nextExpiry: m.batches[0]?.expiryDate,
      batches: m.batches.map((b) => ({
        ...b,
        costMinor: ["OWNER", "AUDITOR"].includes(r.user.role)
          ? b.costMinor
          : undefined,
      })),
    }));
  }
  @Get("generics") generics() {
    return this.db.generic.findMany({ orderBy: { name: "asc" } });
  }
  @Roles("OWNER", "PHARMACIST") @Post() async create(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const { genericName, therapeuticClass, ...data } = parse(
      medicineSchema,
      body,
    );
    return this.db.atomic(async (tx) => {
      const generic = await tx.generic.upsert({
        where: { name: genericName },
        create: { name: genericName, therapeuticClass },
        update: {},
      });
      const medicine = await tx.medicine.create({
        data: { ...data, shopId: r.user.shopId, genericId: generic.id },
      });
      await audit(tx, r.user, "catalog.created", medicine.id);
      return medicine;
    });
  }
  @Roles("OWNER", "PHARMACIST") @Patch(":id") async update(
    @Req() r: any,
    @Param("id") medicineId: string,
    @Body() body: unknown,
  ) {
    const v = parse(
      z.object({
        priceMinor: minor.optional(),
        reorderLevel: z.number().min(0).max(100000).optional(),
        active: z.boolean().optional(),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      requireThat(
        await tx.medicine.findFirst({
          where: { id: medicineId, shopId: r.user.shopId },
        }),
        "Medicine not found",
      );
      const m = await tx.medicine.update({
        where: { id: medicineId },
        data: v,
      });
      await audit(tx, r.user, "catalog.updated", m.id, v);
      return m;
    });
  }
  @Roles("OWNER") @Post("import") async import(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const { csv } = parse(
      z.object({ csv: z.string().min(1).max(1000000) }),
      body,
    );
    let rows: unknown[];
    try {
      rows = csvParse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
    } catch {
      requireThat(false, "Invalid CSV format");
    }
    requireThat(
      rows.length > 0 && rows.length <= 500,
      "Import requires 1–500 rows",
    );
    const data = rows.map((row) => {
      const v = row as any;
      return parse(medicineSchema, {
        ...v,
        priceMinor: Number(v.priceMinor),
        reorderLevel: Number(v.reorderLevel),
        barcode: v.barcode || undefined,
      });
    });
    return this.db.atomic(async (tx) => {
      for (const { genericName, therapeuticClass, ...m } of data) {
        const generic = await tx.generic.upsert({
          where: { name: genericName },
          create: { name: genericName, therapeuticClass },
          update: {},
        });
        await tx.medicine.create({
          data: { ...m, shopId: r.user.shopId, genericId: generic.id },
        });
      }
      await audit(tx, r.user, "catalog.imported", r.user.shopId, {
        count: data.length,
      });
      return { imported: data.length };
    });
  }
}
