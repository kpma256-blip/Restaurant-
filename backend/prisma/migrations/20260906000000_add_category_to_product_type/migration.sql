-- AlterTable
ALTER TABLE "ProductType" DROP CONSTRAINT IF EXISTS "ProductType_name_key";
ALTER TABLE "ProductType" ADD COLUMN "categoryId" TEXT NOT NULL DEFAULT 'placeholder';

-- AddForeignKey
ALTER TABLE "ProductType" ADD CONSTRAINT "ProductType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_categoryId_name_key" ON "ProductType"("categoryId", "name");
CREATE INDEX "ProductType_categoryId_idx" ON "ProductType"("categoryId");

-- Update: Set all existing ProductTypes to the first category (they'll be reassigned in seed)
UPDATE "ProductType" SET "categoryId" = (SELECT id FROM "Category" LIMIT 1);

-- AlterTable: Make categoryId non-null (now that it's set)
ALTER TABLE "ProductType" ALTER COLUMN "categoryId" DROP DEFAULT;
