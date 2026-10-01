-- ============================================================
-- INVENTORY & ROUTE RECONCILIATION SUBSYSTEM MIGRATION
-- Migration 011: Plant Bulk Inventory, Plant Stock Adjustments,
-- Trip Stock Reconciliation Enhancements, Compatibility Views,
-- and Plant Supervisor RBAC Permissions
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ENUMS & TYPES
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plant_adjustment_type') THEN
        CREATE TYPE plant_adjustment_type AS ENUM ('SUPPLIER_PURCHASE', 'DEFECT_ADJUSTMENT', 'PHYSICAL_COUNT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_transfer_type') THEN
        CREATE TYPE inventory_transfer_type AS ENUM ('DISPATCH_LOAD', 'RETURN_UNLOAD', 'SUPPLIER_PURCHASE', 'DEFECT_ADJUSTMENT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_condition') THEN
        CREATE TYPE stock_condition AS ENUM ('FILLED', 'EMPTY_GOOD', 'DEFECTIVE');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_status') THEN
        CREATE TYPE reconciliation_status AS ENUM ('AWAITING_SYNC', 'SETTLED', 'FLAGGED_VARIANCE');
    END IF;
END $$;


-- ============================================================
-- 2. PLANT INVENTORY (MASTER PHYSICAL BULK STOCK AT YARD)
-- ============================================================

CREATE TABLE IF NOT EXISTS "plant_inventory" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "product_id" UUID NOT NULL UNIQUE REFERENCES "products"("id") ON DELETE CASCADE,
    "quantity_filled" INT NOT NULL DEFAULT 0 CHECK ("quantity_filled" >= 0),
    "quantity_empty_good" INT NOT NULL DEFAULT 0 CHECK ("quantity_empty_good" >= 0),
    "quantity_defective" INT NOT NULL DEFAULT 0 CHECK ("quantity_defective" >= 0),
    "last_counted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IX_plant_inventory_product_id" ON "plant_inventory" ("product_id");

DROP TRIGGER IF EXISTS trigger_update_plant_inventory_updated_at ON "plant_inventory";
CREATE TRIGGER trigger_update_plant_inventory_updated_at
    BEFORE UPDATE ON "plant_inventory"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();


-- ============================================================
-- 3. PLANT STOCK ADJUSTMENTS (SUPPLIER RESTOCK & DEFECT QUARANTINE)
-- ============================================================

CREATE TABLE IF NOT EXISTS "plant_stock_adjustments" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,

    "recorded_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "adjustment_type" plant_adjustment_type NOT NULL,
    "target_condition" stock_condition NOT NULL,
    "delta_quantity" INT NOT NULL,
    "source_condition" stock_condition,
    "supplier_invoice_number" VARCHAR(100),
    "reason" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IX_plant_stock_adjustments_product_id" ON "plant_stock_adjustments" ("product_id");
CREATE INDEX IF NOT EXISTS "IX_plant_stock_adjustments_recorded_by" ON "plant_stock_adjustments" ("recorded_by");
CREATE INDEX IF NOT EXISTS "IX_plant_stock_adjustments_adjustment_type" ON "plant_stock_adjustments" ("adjustment_type");
CREATE INDEX IF NOT EXISTS "IX_plant_stock_adjustments_recorded_at" ON "plant_stock_adjustments" ("recorded_at");


-- ============================================================
-- 4. TRIP STOCK RECONCILIATIONS (SCHEMA ENHANCEMENT)
-- Add per-product structured breakdown and explicit discrepancy metrics
-- ============================================================

ALTER TABLE "trip_stock_reconciliations"
    ADD COLUMN IF NOT EXISTS "full_discrepancy" INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "empty_discrepancy" INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "reconciliation_data" JSONB NOT NULL DEFAULT '[]'::jsonb;


-- ============================================================
-- 5. COMPATIBILITY VIEWS
-- Bridges trip_loads / trip_load_items with trip_stock_transfers nomenclature
-- ============================================================

CREATE OR REPLACE VIEW trip_stock_transfers AS 
SELECT 
    id,
    trip_id,
    transfer_type,
    slip_number,
    recorded_by,
    recorded_at,
    remarks
FROM trip_loads;

CREATE OR REPLACE VIEW trip_stock_transfer_items AS 
SELECT 
    id,
    load_id,
    load_id AS transfer_id,
    product_id,
    condition,
    quantity_units
FROM trip_load_items;


-- ============================================================
-- 6. RBAC PERMISSIONS FOR PLANT SUPERVISOR
-- Grants inventory management and route viewing capabilities
-- ============================================================

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT
    r.id,
    p.id
FROM "roles" r
JOIN "permissions" p
    ON p.name IN (
        'dashboard.view',
        'inventory.view',
        'inventory.manage',
        'route.view',
        'history.view'
    )
WHERE r.name = 'Plant Supervisor'
ON CONFLICT DO NOTHING;


COMMIT;
