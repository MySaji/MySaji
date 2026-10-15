-- Existing completed entitlements must not be granted a second time.
ALTER TABLE "payments" ADD COLUMN "settledAt" TIMESTAMP(3);
UPDATE "payments" SET "settledAt" = COALESCE("paidAt", "createdAt")
WHERE "status" = 'COMPLETED';
