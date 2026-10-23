-- CreateTable
CREATE TABLE "pos_salon_services" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "commissionBps" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_salon_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_salon_appointments" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "stylistId" TEXT NOT NULL,
    "stylistName" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "notes" TEXT NOT NULL DEFAULT '',
    "commissionBps" INTEGER NOT NULL DEFAULT 0,
    "quotedPrice" DECIMAL(14,2) NOT NULL,
    "commissionBase" DECIMAL(14,2),
    "saleItemId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_salon_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_salon_services_productId_key" ON "pos_salon_services"("productId");

-- CreateIndex
CREATE INDEX "pos_salon_services_shopkeeperId_idx" ON "pos_salon_services"("shopkeeperId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_salon_appointments_saleItemId_key" ON "pos_salon_appointments"("saleItemId");

-- CreateIndex
CREATE INDEX "pos_salon_appointments_shopkeeperId_startsAt_idx" ON "pos_salon_appointments"("shopkeeperId", "startsAt");

-- CreateIndex
CREATE INDEX "pos_salon_appointments_stylistId_startsAt_endsAt_idx" ON "pos_salon_appointments"("stylistId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "pos_salon_services" ADD CONSTRAINT "pos_salon_services_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_salon_services" ADD CONSTRAINT "pos_salon_services_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_salon_appointments" ADD CONSTRAINT "pos_salon_appointments_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_salon_appointments" ADD CONSTRAINT "pos_salon_appointments_stylistId_fkey" FOREIGN KEY ("stylistId") REFERENCES "pos_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_salon_appointments" ADD CONSTRAINT "pos_salon_appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_salon_appointments" ADD CONSTRAINT "pos_salon_appointments_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "pos_sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_salon_services" ADD CONSTRAINT "pos_salon_service_rules" CHECK ("durationMinutes" BETWEEN 5 AND 720 AND "commissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "pos_salon_appointments" ADD CONSTRAINT "pos_salon_appointment_rules" CHECK (
  "endsAt" > "startsAt" AND "commissionBps" BETWEEN 0 AND 10000 AND "quotedPrice" >= 0 AND ("commissionBase" IS NULL OR "commissionBase" >= 0) AND "version" > 0
  AND "status" IN ('BOOKED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
);
