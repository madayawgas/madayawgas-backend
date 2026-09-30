-- ============================================================
-- FLEET & MAINTENANCE SUBSYSTEM MIGRATION (PART 2)
-- Migration 009: Generalize TRUCKS to VEHICLES, Add Receipts & Refactor Work Orders
-- ============================================================

BEGIN;

-- ============================================================
-- 1. RENAME TRUCKS TO VEHICLES & EXTEND SPECIFICATIONS
-- ============================================================

ALTER TABLE "trucks" RENAME TO "vehicles";

-- Add vehicle_type classification
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "vehicle_type" VARCHAR(30) NOT NULL DEFAULT 'DELIVERY_TRUCK';

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_vehicles_vehicle_type') THEN
        ALTER TABLE "vehicles" ADD CONSTRAINT "CHK_vehicles_vehicle_type" 
            CHECK ("vehicle_type" IN ('DELIVERY_TRUCK', 'SERVICE_PICKUP', 'MOTORCYCLE', 'UTILITY_VAN'));
    END IF;
END $$;

-- Add automated PM due flag as a stored generated column
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "pm_due_flag" BOOLEAN 
    GENERATED ALWAYS AS (("current_odometer" - "last_pm_odometer") >= 5000) STORED;

-- Rebind updated_at trigger for vehicles
DROP TRIGGER IF EXISTS trigger_update_trucks_updated_at ON "vehicles";

CREATE OR REPLACE FUNCTION update_vehicles_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_vehicles_updated_at ON "vehicles";
CREATE TRIGGER trigger_update_vehicles_updated_at
    BEFORE UPDATE ON "vehicles"
    FOR EACH ROW
    EXECUTE FUNCTION update_vehicles_updated_at_column();

-- Rename vehicle index if exists
ALTER INDEX IF EXISTS "IX_trucks_driver_id" RENAME TO "IX_vehicles_driver_id";


-- ============================================================
-- 2. UPDATE FOREIGN KEYS IN TELEMETRY & WORKFLOW TABLES
-- ============================================================

-- vehicle_odometer_logs
ALTER TABLE "vehicle_odometer_logs" RENAME COLUMN "truck_id" TO "vehicle_id";
ALTER INDEX IF EXISTS "IX_vehicle_odometer_logs_truck_id" RENAME TO "IX_vehicle_odometer_logs_vehicle_id";

-- vehicle_inspections: rename truck_id and add allow_dispatch discretion flag
ALTER TABLE "vehicle_inspections" RENAME COLUMN "truck_id" TO "vehicle_id";
ALTER TABLE "vehicle_inspections" ADD COLUMN IF NOT EXISTS "allow_dispatch" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER INDEX IF EXISTS "IX_vehicle_inspections_truck_id" RENAME TO "IX_vehicle_inspections_vehicle_id";

-- incident_reports
ALTER TABLE "incident_reports" RENAME COLUMN "truck_id" TO "vehicle_id";
ALTER INDEX IF EXISTS "IX_incident_reports_truck_id" RENAME TO "IX_incident_reports_vehicle_id";

-- work_orders
ALTER TABLE "work_orders" RENAME COLUMN "truck_id" TO "vehicle_id";
ALTER INDEX IF EXISTS "IX_work_orders_truck_id" RENAME TO "IX_work_orders_vehicle_id";


-- ============================================================
-- 3. APPROVAL REQUESTS: 1:N MULTI-REQUEST WITH PENDING GUARD
-- ============================================================

-- Drop 1:1 unique constraint on work_order_id to allow revisions after rejection
ALTER TABLE "approval_requests" DROP CONSTRAINT IF EXISTS "UQ_approval_requests_work_order_id";

-- Enforce at most ONE pending approval request per work order
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_approval_requests_pending" 
    ON "approval_requests" ("work_order_id") 
    WHERE "is_approved" IS NULL;


-- ============================================================
-- 4. MAINTENANCE LOGS: DECOUPLE OR & COMPUTE TOTAL COST
-- ============================================================

-- Drop unique receipt constraint, index, and column
ALTER TABLE "maintenance_logs" DROP CONSTRAINT IF EXISTS "maintenance_logs_official_receipt_number_key";
DROP INDEX IF EXISTS "IX_maintenance_logs_official_receipt_number";
ALTER TABLE "maintenance_logs" DROP COLUMN IF EXISTS "official_receipt_number";

-- Add stored generated total_cost (parts_cost + labor_cost)
ALTER TABLE "maintenance_logs" ADD COLUMN IF NOT EXISTS "total_cost" NUMERIC(12, 2) 
    GENERATED ALWAYS AS ("parts_cost" + "labor_cost") STORED;


-- ============================================================
-- 5. WORK ORDER RECEIPTS TABLE (0..N PER WORK ORDER)
-- ============================================================

CREATE TABLE IF NOT EXISTS "work_order_receipts" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "work_order_id" UUID NOT NULL REFERENCES "work_orders"("id") ON DELETE CASCADE,
    "uploaded_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "file_url" TEXT NOT NULL,
    "receipt_number" VARCHAR(100),
    "vendor_name" VARCHAR(150),
    "amount" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "receipt_type" VARCHAR(30) NOT NULL DEFAULT 'PARTS',
    "receipt_date" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CHK_work_order_receipts_receipt_type" CHECK ("receipt_type" IN ('PARTS', 'LABOR', 'MISC')),
    CONSTRAINT "CHK_work_order_receipts_amount" CHECK ("amount" >= 0)
);

CREATE INDEX IF NOT EXISTS "IX_work_order_receipts_work_order_id" ON "work_order_receipts" ("work_order_id");
CREATE INDEX IF NOT EXISTS "IX_work_order_receipts_receipt_type" ON "work_order_receipts" ("receipt_type");

COMMIT;
