-- AlterTable
ALTER TABLE "pos_sales" ADD COLUMN     "ageVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "ageRestricted" BOOLEAN NOT NULL DEFAULT false;

