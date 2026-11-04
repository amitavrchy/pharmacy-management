import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { Db } from "../db/prisma.service";
@Injectable()
export class BarcodeCache implements OnModuleDestroy {
  private redis = new Redis(process.env.REDIS_URL || "redis://localhost:6386", {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  constructor(private readonly db: Db) {
    this.redis.on("error", () => {});
  }
  async lookup(shopId: string, barcode: string) {
    const key = `barcode:${shopId}:${barcode}`;
    let id: string | null = null;
    try {
      id = await this.redis.get(key);
    } catch {}
    const medicine = await this.db.medicine.findFirst({
      where: { shopId, active: true, ...(id ? { id } : { barcode }) },
      include: { generic: true },
    });
    if (medicine)
      try {
        await this.redis.set(key, medicine.id, "EX", 3600);
      } catch {}
    return medicine;
  }
  async onModuleDestroy() {
    this.redis.disconnect();
  }
}
