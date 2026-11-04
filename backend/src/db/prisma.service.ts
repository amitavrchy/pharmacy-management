import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  async atomic<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.$transaction(work, {
          isolationLevel: "Serializable",
          timeout: 15000,
        });
      } catch (e) {
        const adapter = (
          e as {
            meta?: {
              driverAdapterError?: { cause?: { originalCode?: string } };
            };
          }
        ).meta?.driverAdapterError;
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          (["P2034", "P2002"].includes(e.code) ||
            (e.code === "P2010" &&
              ["40001", "40P01"].includes(
                String(e.meta?.code || adapter?.cause?.originalCode),
              ))) &&
          attempt < 3
        )
          continue;
        throw e;
      }
    }
  }
}
