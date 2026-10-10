-- AlterTable
ALTER TABLE "products" ADD COLUMN     "controlled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "controlled_sale_records" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "posSaleItemId" TEXT,
    "posSaleId" TEXT,
    "productName" TEXT NOT NULL,
    "variantLabel" TEXT,
    "batchNumber" TEXT,
    "serials" TEXT[],
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "buyerName" TEXT NOT NULL,
    "buyerIdNumber" TEXT,
    "buyerPhone" TEXT,
    "prescriberName" TEXT,
    "prescriptionRef" TEXT,
    "recordedByUserId" TEXT,
    "recordedByName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "controlled_sale_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controlled_sale_records_shopkeeperId_occurredAt_idx" ON "controlled_sale_records"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "controlled_sale_records_shopkeeperId_productName_idx" ON "controlled_sale_records"("shopkeeperId", "productName");

-- CreateIndex
CREATE INDEX "controlled_sale_records_posSaleId_idx" ON "controlled_sale_records"("posSaleId");

-- AddForeignKey
ALTER TABLE "controlled_sale_records" ADD CONSTRAINT "controlled_sale_records_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

