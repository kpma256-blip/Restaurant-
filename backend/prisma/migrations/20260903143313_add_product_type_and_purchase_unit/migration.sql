-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productTypeId" TEXT,
ADD COLUMN     "purchaseToInventoryFactor" DOUBLE PRECISION,
ADD COLUMN     "purchaseUnitCode" TEXT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProductType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_name_key" ON "ProductType"("name");

-- CreateIndex
CREATE INDEX "Product_productTypeId_idx" ON "Product"("productTypeId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_purchaseUnitCode_fkey" FOREIGN KEY ("purchaseUnitCode") REFERENCES "Unit"("code") ON DELETE SET NULL ON UPDATE CASCADE;
