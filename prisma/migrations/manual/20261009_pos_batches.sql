-- AlterTable
ALTER TABLE "pos_sale_items" ADD COLUMN     "batchExpiry" TIMESTAMP(3),
ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "batchNumber" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tracksBatches" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "product_batches" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "shopkeeperId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "stockOnHand" DECIMAL(14,3),
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(12,2),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_batches_shopkeeperId_productId_expiryDate_idx" ON "product_batches"("shopkeeperId", "productId", "expiryDate");

-- CreateIndex
CREATE INDEX "product_batches_shopkeeperId_expiryDate_idx" ON "product_batches"("shopkeeperId", "expiryDate");

-- CreateIndex
CREATE INDEX "product_batches_variantId_idx" ON "product_batches"("variantId");

-- CreateIndex
CREATE INDEX "pos_sale_items_batchId_idx" ON "pos_sale_items"("batchId");

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_batchId_occurredAt_idx" ON "stock_movements"("shopkeeperId", "batchId", "occurredAt");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "product_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "product_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

