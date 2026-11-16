-- ============================================================
-- Migration 025: Product Unit Price
-- Adds unit_price column to products table with non-negative
-- check constraint and backfills standard catalog prices.
-- ============================================================

BEGIN;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "unit_price" NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CHK_products_unit_price'
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "CHK_products_unit_price" CHECK ("unit_price" >= 0);
  END IF;
END $$;

UPDATE "products" SET "unit_price" = 95.00   WHERE "name" = 'Butane Canister 250g' AND "unit_price" = 0.00;
UPDATE "products" SET "unit_price" = 75.00   WHERE "name" = 'Butane Canister 170g' AND "unit_price" = 0.00;
UPDATE "products" SET "unit_price" = 980.00  WHERE "name" = '11kg LPG Cylinder'    AND "unit_price" = 0.00;
UPDATE "products" SET "unit_price" = 1950.00 WHERE "name" = '22kg LPG Cylinder'    AND "unit_price" = 0.00;
UPDATE "products" SET "unit_price" = 3950.00 WHERE "name" = '50kg LPG Cylinder'    AND "unit_price" = 0.00;

COMMIT;
