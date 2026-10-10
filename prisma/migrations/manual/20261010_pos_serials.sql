-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'WRITTEN_OFF');

-- AlterTable
ALTER TABLE "pos_sale_items" ADD COLUMN     "serials" TEXT[];

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tracksSerials" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_serials" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "shopkeeperId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" "SerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "posSaleItemId" TEXT,
    "soldAt" TIMESTAMP(3),
    "costPrice" DECIMAL(12,2),
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_serials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_serials_shopkeeperId_productId_status_idx" ON "product_serials"("shopkeeperId", "productId", "status");

-- CreateIndex
CREATE INDEX "product_serials_posSaleItemId_idx" ON "product_serials"("posSaleItemId");

-- CreateIndex
CREATE UNIQUE INDEX "product_serials_shopkeeperId_serial_key" ON "product_serials"("shopkeeperId", "serial");

-- AddForeignKey
ALTER TABLE "product_serials" ADD CONSTRAINT "product_serials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_serials" ADD CONSTRAINT "product_serials_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

