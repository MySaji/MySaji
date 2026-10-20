CREATE TABLE "pos_mpesa_connections" (
  "id" TEXT NOT NULL PRIMARY KEY, "shopkeeperId" TEXT NOT NULL,
  "shortcode" TEXT NOT NULL, "environment" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL, "tokenCiphertext" TEXT NOT NULL,
  "registeredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "pos_mpesa_connections_shopkeeperId_key" ON "pos_mpesa_connections"("shopkeeperId");
CREATE UNIQUE INDEX "pos_mpesa_connections_tokenHash_key" ON "pos_mpesa_connections"("tokenHash");
CREATE TABLE "pos_mpesa_transactions" (
  "id" TEXT NOT NULL PRIMARY KEY, "shopkeeperId" TEXT NOT NULL, "shortcode" TEXT NOT NULL,
  "environment" TEXT NOT NULL, "source" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(14,2) NOT NULL, "phone" TEXT, "payerName" TEXT, "accountReference" TEXT,
  "checkoutId" TEXT, "receipt" TEXT, "callbackTokenHash" TEXT, "consumedSaleId" TEXT,
  "resultDescription" TEXT, "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "pos_mpesa_transactions_checkoutId_key" ON "pos_mpesa_transactions"("checkoutId");
CREATE UNIQUE INDEX "pos_mpesa_transactions_callbackTokenHash_key" ON "pos_mpesa_transactions"("callbackTokenHash");
CREATE UNIQUE INDEX "pos_mpesa_transactions_environment_shortcode_receipt_key" ON "pos_mpesa_transactions"("environment", "shortcode", "receipt");
CREATE INDEX "pos_mpesa_transactions_shopkeeperId_environment_status_createdAt_idx" ON "pos_mpesa_transactions"("shopkeeperId", "environment", "status", "createdAt");
CREATE INDEX "pos_mpesa_transactions_consumedSaleId_idx" ON "pos_mpesa_transactions"("consumedSaleId");
