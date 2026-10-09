-- AlterTable
ALTER TABLE "pos_sale_items" ADD COLUMN     "variantId" TEXT,
ADD COLUMN     "variantLabel" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "hasVariants" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "variantId" TEXT;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "options" JSONB,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(12,2),
    "costPrice" DECIMAL(12,2),
    "stockOnHand" DECIMAL(14,3),
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_productId_position_idx" ON "product_variants"("productId", "position");

-- CreateIndex
CREATE INDEX "product_variants_shopkeeperId_barcode_idx" ON "product_variants"("shopkeeperId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_shopkeeperId_sku_key" ON "product_variants"("shopkeeperId", "sku");

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_variantId_occurredAt_idx" ON "stock_movements"("shopkeeperId", "variantId", "occurredAt");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

