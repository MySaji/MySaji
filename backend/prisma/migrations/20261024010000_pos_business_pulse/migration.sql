CREATE TABLE "pos_business_pulse" (
  "shopkeeperId" TEXT NOT NULL PRIMARY KEY REFERENCES "shopkeeper_profiles"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "settings" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "pos_stock_counts" ADD COLUMN "assignedStaffId" TEXT;
ALTER TABLE "pos_stock_counts" ADD COLUMN "assignedStaffName" TEXT;
