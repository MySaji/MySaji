-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('OPENING_BALANCE', 'PURCHASE', 'SALE', 'SALE_REVERSAL', 'ORDER_FULFILMENT', 'ORDER_RESTOCK', 'RETURN', 'COUNT_ADJUSTMENT', 'WASTAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'BULK_BREAK_IN', 'BULK_BREAK_OUT');

-- CreateEnum
CREATE TYPE "PosSaleStatus" AS ENUM ('COMPLETED', 'PARKED', 'VOIDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PosPaymentMethod" AS ENUM ('CASH', 'MPESA', 'CARD', 'BANK', 'CREDIT', 'SPLIT');

-- DropIndex
DROP INDEX "products_sku_key";

-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "stockOnHand" DECIMAL(14,3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "costPrice" DECIMAL(12,2),
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'piece';

-- AlterTable
ALTER TABLE "shopkeeper_profiles" ADD COLUMN     "listedOnMarketplace" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "posActivatedAt" TIMESTAMP(3),
ADD COLUMN     "posConfig" JSONB,
ADD COLUMN     "posEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "posProfileKey" TEXT,
ADD COLUMN     "posTraits" TEXT[];

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unitCost" DECIMAL(12,2),
    "balanceAfter" DECIMAL(14,3),
    "reason" TEXT,
    "posSaleId" TEXT,
    "orderId" TEXT,
    "wholesaleOrderId" TEXT,
    "actorUserId" TEXT,
    "idempotencyKey" TEXT,
    "deviceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sales" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "tillSessionId" TEXT,
    "cashierUserId" TEXT,
    "cashierName" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "changeGiven" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "PosSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "paymentMethod" "PosPaymentMethod" NOT NULL DEFAULT 'CASH',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerId" TEXT,
    "idempotencyKey" TEXT,
    "deviceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedByUserId" TEXT,

    CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "costAtSale" DECIMAL(12,2),
    "priceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "pos_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_payments" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PosPaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "till_sessions" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "cashierUserId" TEXT,
    "cashierName" TEXT,
    "deviceId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingFloat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(14,2),
    "countedCash" DECIMAL(14,2),
    "variance" DECIMAL(14,2),
    "note" TEXT,

    CONSTRAINT "till_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_devices" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'web',
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_cashiers" (
    "id" TEXT NOT NULL,
    "shopkeeperId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'cashier',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_cashiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_productId_occurredAt_idx" ON "stock_movements"("shopkeeperId", "productId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_occurredAt_idx" ON "stock_movements"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_shopkeeperId_kind_occurredAt_idx" ON "stock_movements"("shopkeeperId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_posSaleId_idx" ON "stock_movements"("posSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_shopkeeperId_idempotencyKey_key" ON "stock_movements"("shopkeeperId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "pos_sales_shopkeeperId_occurredAt_idx" ON "pos_sales"("shopkeeperId", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_sales_shopkeeperId_status_occurredAt_idx" ON "pos_sales"("shopkeeperId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "pos_sales_tillSessionId_idx" ON "pos_sales"("tillSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_shopkeeperId_saleNumber_key" ON "pos_sales"("shopkeeperId", "saleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_shopkeeperId_idempotencyKey_key" ON "pos_sales"("shopkeeperId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "pos_sale_items_saleId_idx" ON "pos_sale_items"("saleId");

-- CreateIndex
CREATE INDEX "pos_sale_items_productId_idx" ON "pos_sale_items"("productId");

-- CreateIndex
CREATE INDEX "pos_payments_saleId_idx" ON "pos_payments"("saleId");

-- CreateIndex
CREATE INDEX "till_sessions_shopkeeperId_openedAt_idx" ON "till_sessions"("shopkeeperId", "openedAt");

-- CreateIndex
CREATE INDEX "till_sessions_shopkeeperId_closedAt_idx" ON "till_sessions"("shopkeeperId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_tokenHash_key" ON "pos_devices"("tokenHash");

-- CreateIndex
CREATE INDEX "pos_devices_shopkeeperId_idx" ON "pos_devices"("shopkeeperId");

-- CreateIndex
CREATE INDEX "pos_cashiers_shopkeeperId_isActive_idx" ON "pos_cashiers"("shopkeeperId", "isActive");

-- CreateIndex
CREATE INDEX "products_shopkeeperId_barcode_idx" ON "products"("shopkeeperId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopkeeperId_sku_key" ON "products"("shopkeeperId", "sku");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_tillSessionId_fkey" FOREIGN KEY ("tillSessionId") REFERENCES "till_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "till_sessions" ADD CONSTRAINT "till_sessions_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_cashiers" ADD CONSTRAINT "pos_cashiers_shopkeeperId_fkey" FOREIGN KEY ("shopkeeperId") REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

