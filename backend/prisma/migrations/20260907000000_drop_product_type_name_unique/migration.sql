-- The previous migration tried to remove this with DROP CONSTRAINT, but it
-- was created as a unique index, so that was a no-op. Product type names only
-- need to be unique within a category ("ProductType_categoryId_name_key").
DROP INDEX IF EXISTS "ProductType_name_key";
