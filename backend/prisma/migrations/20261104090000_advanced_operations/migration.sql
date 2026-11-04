-- DropIndex
DROP INDEX "StockBatch_shopId_medicineId_lotNumber_expiryDate_key";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "shiftId" TEXT;

-- AlterTable
ALTER TABLE "StockBatch" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactConsent" BOOLEAN NOT NULL DEFAULT false,
    "creditLimitMinor" INTEGER NOT NULL DEFAULT 0,
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLedger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT,
    "reference" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegisterShift" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "registerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingMinor" INTEGER NOT NULL,
    "countedMinor" INTEGER,
    "expectedMinor" INTEGER,
    "varianceMinor" INTEGER,
    "closingNote" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "RegisterShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBill" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "poId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COUNTER',
    "canDispense" BOOLEAN NOT NULL DEFAULT true,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "receivedBatchId" TEXT,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemperatureSensor" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minC" DECIMAL(6,2) NOT NULL,
    "maxC" DECIMAL(6,2) NOT NULL,
    "latestC" DECIMAL(6,2),
    "excursion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TemperatureSensor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemperatureReading" (
    "id" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "valueC" DECIMAL(6,2) NOT NULL,
    "excursion" BOOLEAN NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemperatureReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "courier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "note" TEXT NOT NULL DEFAULT '',
    "proof" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefillReminder" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefillReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_shopId_name_idx" ON "Customer"("shopId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_shopId_phone_key" ON "Customer"("shopId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedger_reference_key" ON "CustomerLedger"("reference");

-- CreateIndex
CREATE INDEX "RegisterShift_shopId_status_idx" ON "RegisterShift"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_reference_key" ON "CashMovement"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reference_key" ON "Expense"("reference");

-- CreateIndex
CREATE INDEX "Expense_shopId_createdAt_idx" ON "Expense"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierBill_shopId_supplierId_invoiceNumber_key" ON "SupplierBill"("shopId", "supplierId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_reference_key" ON "SupplierPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_shopId_code_key" ON "StockLocation"("shopId", "code");

-- CreateIndex
CREATE INDEX "StockTransfer_shopId_status_idx" ON "StockTransfer"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_saleId_key" ON "Delivery"("saleId");

-- CreateIndex
CREATE INDEX "RefillReminder_shopId_dueDate_idx" ON "RefillReminder"("shopId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_shopId_medicineId_lotNumber_expiryDate_locationI_key" ON "StockBatch"("shopId", "medicineId", "lotNumber", "expiryDate", "locationId");

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "RegisterShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "RegisterShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SupplierBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemperatureSensor" ADD CONSTRAINT "TemperatureSensor_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemperatureReading" ADD CONSTRAINT "TemperatureReading_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "TemperatureSensor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing stock in a dispensing location.
INSERT INTO "StockLocation" ("id","shopId","name","code","kind","canDispense","quarantined","active") SELECT 'main-'||"id", "id", 'Main counter', 'MAIN', 'COUNTER', true, false, true FROM "Shop";
UPDATE "StockBatch" SET "locationId"='main-'||"shopId" WHERE "locationId" IS NULL;
