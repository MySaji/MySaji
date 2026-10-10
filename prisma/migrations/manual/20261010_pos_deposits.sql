-- AlterEnum
ALTER TYPE "PosSaleStatus" ADD VALUE 'DEPOSIT';

-- AlterTable
ALTER TABLE "pos_sales" ADD COLUMN     "balanceDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "fulfilledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "madeToOrder" BOOLEAN NOT NULL DEFAULT false;

