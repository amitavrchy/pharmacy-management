import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { Db } from "../db/prisma.service";
import { Roles } from "../auth/auth";
import { parse, text, z } from "../common/validation";
import { dateUTC, requireThat } from "../common/domain";
import { audit } from "../common/audit";
import {
  locationSchema,
  transferSchema,
  sensorSchema,
  readingSchema,
} from "./operations.schemas";
@Controller("stock-control")
export class StockControlController {
  constructor(private readonly db: Db) {}
  @Get("locations") locations(@Req() r: any) {
    return this.db.stockLocation.findMany({
      where: { shopId: r.user.shopId },
      include: { _count: { select: { batches: true } } },
      orderBy: { name: "asc" },
    });
  }
  @Roles("OWNER", "STORE_KEEPER") @Post("locations") location(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(locationSchema, body);
    return this.db.atomic(async (tx) => {
      const loc = await tx.stockLocation.create({
        data: { ...v, shopId: r.user.shopId },
      });
      await audit(tx, r.user, "location.created", loc.id, v);
      return loc;
    });
  }
  @Get("transfers") async transfers(@Req() r: any) {
    const rows = await this.db.stockTransfer.findMany({
      where: { shopId: r.user.shopId },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const batches = await this.db.stockBatch.findMany({
        where: {
          id: { in: rows.map((t) => t.batchId) },
          shopId: r.user.shopId,
        },
        include: { medicine: true, location: true },
      }),
      locations = await this.db.stockLocation.findMany({
        where: { shopId: r.user.shopId },
      });
    return rows.map((t) => ({
      ...t,
      batch: batches.find((b) => b.id === t.batchId),
      destination: locations.find((l) => l.id === t.destinationId),
    }));
  }
  @Roles("OWNER", "STORE_KEEPER") @Post("transfers") transfer(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(transferSchema, body);
    return this.db.atomic(async (tx) => {
      const b = await tx.stockBatch.findFirst({
          where: { id: v.batchId, shopId: r.user.shopId },
          include: { medicine: true },
        }),
        loc = await tx.stockLocation.findFirst({
          where: {
            id: v.destinationId,
            shopId: r.user.shopId,
            active: true,
            quarantined: false,
          },
        });
      requireThat(
        b && loc && b.locationId !== loc.id,
        "Valid batch and different destination required",
      );
      requireThat(
        b.status === "ACTIVE" &&
          !b.recalled &&
          b.expiryDate > dateUTC() &&
          b.qtyOnHand.gte(v.qty),
        "Batch unavailable for transfer",
      );
      if (b.medicine.schedule === "CONTROLLED")
        requireThat(
          r.user.role === "OWNER",
          "Owner required for controlled stock transfers",
        );
      const t = await tx.stockTransfer.create({
        data: { ...v, shopId: r.user.shopId, createdBy: r.user.id },
      });
      await audit(tx, r.user, "transfer.created", t.id, {
        qty: v.qty,
        batchId: v.batchId,
        destinationId: v.destinationId,
      });
      return t;
    });
  }
  @Roles("OWNER", "STORE_KEEPER") @Post("transfers/:id/:action") transition(
    @Req() r: any,
    @Param("id") transferId: string,
    @Param("action") action: string,
  ) {
    requireThat(
      ["dispatch", "receive", "cancel"].includes(action),
      "Unknown transfer action",
    );
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StockTransfer" WHERE id=${transferId} FOR UPDATE`;
      const t = await tx.stockTransfer.findFirst({
        where: { id: transferId, shopId: r.user.shopId },
      });
      requireThat(t, "Transfer not found");
      const b = await tx.stockBatch.findFirst({
          where: { id: t.batchId, shopId: r.user.shopId },
          include: { medicine: true },
        }),
        loc = await tx.stockLocation.findFirst({
          where: { id: t.destinationId, shopId: r.user.shopId },
        });
      requireThat(b && loc, "Transfer endpoints unavailable");
      if (b.medicine.schedule === "CONTROLLED")
        requireThat(
          r.user.role === "OWNER",
          "Owner required for controlled transfers",
        );
      if (action === "cancel") {
        requireThat(
          t.status === "DRAFT",
          "Only undispatched transfers can be cancelled",
        );
        await audit(tx, r.user, "transfer.cancelled", t.id);
        return tx.stockTransfer.update({
          where: { id: t.id },
          data: { status: "CANCELLED" },
        });
      }
      if (action === "dispatch") {
        requireThat(
          t.status === "DRAFT" &&
            b.status === "ACTIVE" &&
            !b.recalled &&
            b.expiryDate > dateUTC() &&
            b.qtyOnHand.gte(t.qty),
          "Transfer cannot be dispatched",
        );
        requireThat(loc.active && !loc.quarantined, "Destination unavailable");
        await tx.stockBatch.update({
          where: { id: b.id },
          data: { qtyOnHand: { decrement: t.qty } },
        });
        await tx.stockMovement.create({
          data: {
            batchId: b.id,
            type: "TRANSFER_OUT",
            qty: t.qty.negated(),
            refId: t.id,
            refType: "TRANSFER",
            note: t.note,
          },
        });
        await audit(tx, r.user, "transfer.dispatched", t.id);
        return tx.stockTransfer.update({
          where: { id: t.id },
          data: { status: "DISPATCHED", dispatchedAt: new Date() },
        });
      }
      requireThat(
        t.status === "DISPATCHED",
        "Only dispatched stock can be received",
      );
      const blocked =
        b.recalled ||
        b.expiryDate <= dateUTC() ||
        loc.quarantined ||
        b.status !== "ACTIVE";
      const status = b.recalled
        ? "RECALLED"
        : blocked
          ? "QUARANTINED"
          : "ACTIVE";
      let dest = await tx.stockBatch.findFirst({
        where: {
          shopId: r.user.shopId,
          medicineId: b.medicineId,
          lotNumber: b.lotNumber,
          expiryDate: b.expiryDate,
          locationId: loc.id,
        },
      });
      if (dest) {
        requireThat(
          dest.costMinor === b.costMinor,
          "Destination lot has a different cost",
        );
        dest = await tx.stockBatch.update({
          where: { id: dest.id },
          data: {
            qtyOnHand: { increment: t.qty },
            ...(blocked ? { status, recalled: b.recalled } : {}),
          },
        });
      } else
        dest = await tx.stockBatch.create({
          data: {
            shopId: r.user.shopId,
            medicineId: b.medicineId,
            lotNumber: b.lotNumber,
            expiryDate: b.expiryDate,
            costMinor: b.costMinor,
            qtyOnHand: t.qty,
            locationId: loc.id,
            status,
            recalled: b.recalled,
            rack: loc.code,
          },
        });
      await tx.stockMovement.create({
        data: {
          batchId: dest.id,
          type: "TRANSFER_IN",
          qty: t.qty,
          refId: t.id,
          refType: "TRANSFER",
        },
      });
      await audit(tx, r.user, "transfer.received", t.id, {
        batchId: dest.id,
        status,
      });
      return tx.stockTransfer.update({
        where: { id: t.id },
        data: {
          status: "RECEIVED",
          receivedAt: new Date(),
          receivedBatchId: dest.id,
        },
      });
    });
  }
  @Roles("OWNER", "PHARMACIST", "STORE_KEEPER", "AUDITOR")
  @Get("sensors")
  sensors(@Req() r: any) {
    return this.db.temperatureSensor.findMany({
      where: { shopId: r.user.shopId },
      include: {
        location: true,
        readings: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
  }
  @Roles("OWNER", "PHARMACIST") @Post("sensors") sensor(
    @Req() r: any,
    @Body() body: unknown,
  ) {
    const v = parse(sensorSchema, body);
    return this.db.atomic(async (tx) => {
      requireThat(
        await tx.stockLocation.findFirst({
          where: { id: v.locationId, shopId: r.user.shopId, active: true },
        }),
        "Location not found",
      );
      const s = await tx.temperatureSensor.create({
        data: { ...v, shopId: r.user.shopId },
      });
      await audit(tx, r.user, "sensor.created", s.id);
      return s;
    });
  }
  @Roles("OWNER", "PHARMACIST", "STORE_KEEPER")
  @Post("sensors/:id/readings")
  reading(@Req() r: any, @Param("id") sensorId: string, @Body() body: unknown) {
    const v = parse(readingSchema, body);
    return this.db.atomic(async (tx) => {
      const s = await tx.temperatureSensor.findFirst({
        where: { id: sensorId, shopId: r.user.shopId },
      });
      requireThat(s, "Sensor not found");
      const excursion = v.valueC < Number(s.minC) || v.valueC > Number(s.maxC);
      await tx.temperatureSensor.update({
        where: { id: s.id },
        data: { latestC: v.valueC, excursion },
      });
      const reading = await tx.temperatureReading.create({
        data: { ...v, sensorId, excursion, actorId: r.user.id },
      });
      if (excursion) {
        await tx.stockLocation.update({
          where: { id: s.locationId },
          data: { quarantined: true },
        });
        await tx.stockBatch.updateMany({
          where: {
            shopId: r.user.shopId,
            locationId: s.locationId,
            status: "ACTIVE",
          },
          data: { status: "QUARANTINED" },
        });
        await tx.alert.upsert({
          where: { key: `temperature:${s.locationId}` },
          create: {
            shopId: r.user.shopId,
            type: "TEMPERATURE_EXCURSION",
            key: `temperature:${s.locationId}`,
            payload: {
              locationId: s.locationId,
              sensor: s.name,
              valueC: v.valueC,
            },
          },
          update: {
            resolvedAt: null,
            payload: {
              locationId: s.locationId,
              sensor: s.name,
              valueC: v.valueC,
            },
          },
        });
      }
      await audit(tx, r.user, "temperature.recorded", reading.id, {
        sensorId,
        excursion,
        valueC: v.valueC,
      });
      return reading;
    });
  }
  @Roles("OWNER", "PHARMACIST") @Post("locations/:id/release") release(
    @Req() r: any,
    @Param("id") locationId: string,
    @Body() body: unknown,
  ) {
    const { note } = parse(z.object({ note: text }), body);
    return this.db.atomic(async (tx) => {
      const loc = await tx.stockLocation.findFirst({
        where: { id: locationId, shopId: r.user.shopId },
        include: { sensors: true },
      });
      requireThat(loc?.quarantined, "Location is not quarantined");
      requireThat(
        loc.sensors.length &&
          loc.sensors.every((s) => s.latestC !== null && !s.excursion),
        "All sensors need an in-range reading before review",
      );
      await tx.stockLocation.update({
        where: { id: loc.id },
        data: { quarantined: false },
      });
      await tx.alert.updateMany({
        where: { key: `temperature:${loc.id}` },
        data: { resolvedAt: new Date() },
      });
      await audit(tx, r.user, "cold_chain.location_released", loc.id, { note });
      return {
        ok: true,
        note: "Location released. Individual batches remain quarantined until pharmacist disposition.",
      };
    });
  }
  @Roles("OWNER", "PHARMACIST") @Post("batches/:id/release") releaseBatch(
    @Req() r: any,
    @Param("id") batchId: string,
    @Body() body: unknown,
  ) {
    const { note } = parse(z.object({ note: text }), body);
    return this.db.atomic(async (tx) => {
      const b = await tx.stockBatch.findFirst({
        where: { id: batchId, shopId: r.user.shopId },
        include: { location: true },
      });
      requireThat(
        b &&
          b.status === "QUARANTINED" &&
          !b.recalled &&
          b.expiryDate > dateUTC() &&
          !b.location?.quarantined,
        "Batch is not eligible for pharmacist release",
      );
      await audit(tx, r.user, "batch.release_review", batchId, { note });
      return tx.stockBatch.update({
        where: { id: batchId },
        data: { status: "ACTIVE" },
      });
    });
  }
}
