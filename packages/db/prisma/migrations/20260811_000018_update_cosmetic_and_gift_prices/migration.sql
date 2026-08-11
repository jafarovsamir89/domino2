-- Keep catalog prices consistent for existing rows and future gift records.
ALTER TABLE "GiftCatalog"
ALTER COLUMN "coinCost" SET DEFAULT 1000;

UPDATE "GiftCatalog"
SET "coinCost" = 1000;

UPDATE "CatalogPrice" AS price
SET
    "amountMinor" = 1500,
    "isActive" = true
FROM "CatalogProduct" AS product
WHERE price."productId" = product."id"
  AND price."currency" = 'COIN'
  AND product."key" IN (
      'table_skin_02',
      'table_skin_03',
      'table_skin_04',
      'table_skin_05',
      'table_skin_06',
      'table_skin_07',
      'table_skin_08',
      'table_skin_09'
  );
