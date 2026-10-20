CREATE TABLE "pos_business_websites" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "subdomain" TEXT NOT NULL,
  "draft" JSONB NOT NULL,
  "publishedContent" JSONB,
  "publishedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_business_websites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_business_websites_subdomain_format" CHECK ("subdomain" ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$')
);
CREATE UNIQUE INDEX "pos_business_websites_businessId_key" ON "pos_business_websites"("businessId");
CREATE UNIQUE INDEX "pos_business_websites_subdomain_key" ON "pos_business_websites"("subdomain");
ALTER TABLE "pos_business_websites" ADD CONSTRAINT "pos_business_websites_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "pos_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
