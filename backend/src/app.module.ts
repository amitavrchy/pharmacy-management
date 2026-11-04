import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { Db } from "./db/prisma.service";
import { AuthGuard, Public } from "./auth/auth";
import { AuthController } from "./auth/auth.controller";
import { InventoryService } from "./inventory/inventory.service";
import { InventoryController } from "./inventory/inventory.controller";
import { CatalogController } from "./catalog/catalog.controller";
import { PrescriptionsController } from "./prescriptions/prescriptions.controller";
import { SalesService } from "./sales/sales.service";
import { SalesController } from "./sales/sales.controller";
import { PurchasingController } from "./purchasing/purchasing.controller";
import { ReturnsController } from "./returns/returns.controller";
import { RecallsController } from "./recalls/recalls.controller";
import { AlertsController } from "./alerts/alerts.controller";
import { ReportsController } from "./reports/reports.controller";
import { SyncController } from "./sync/sync.controller";
import { SettingsController } from "./settings/settings.controller";
import { BarcodeCache } from "./catalog/barcode-cache.service";
import { EventsController } from "./events/events.controller";
@Controller("health")
class HealthController {
  constructor(private readonly db: Db) {}
  @Public() @Get() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: {
          expiresIn: "8h",
          issuer: "pharmacy-api",
          audience: "pharmacy-web",
        },
        verifyOptions: { issuer: "pharmacy-api", audience: "pharmacy-web" },
      }),
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    InventoryController,
    CatalogController,
    PrescriptionsController,
    SalesController,
    PurchasingController,
    ReturnsController,
    RecallsController,
    AlertsController,
    ReportsController,
    SyncController,
    SettingsController,
    EventsController,
  ],
  providers: [
    Db,
    InventoryService,
    SalesService,
    BarcodeCache,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
