-- Persist the external amount/currency at initiation so later configuration
-- changes cannot alter what counts as a valid gateway confirmation.
ALTER TABLE "payments" ADD COLUMN "gatewayAmount" DECIMAL(14,2);
ALTER TABLE "payments" ADD COLUMN "gatewayCurrency" TEXT;
