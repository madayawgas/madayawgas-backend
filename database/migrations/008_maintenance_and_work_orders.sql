-- ============================================================
-- FLEET & MAINTENANCE SUBSYSTEM MIGRATION (PART 1)
-- Migration 008: Maintenance & Work Orders Baseline
-- ============================================================

BEGIN;

-- ============================================================
-- 1. MODIFICATIONS TO EXISTING TRUCKS TABLE
-- ============================================================

ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "current_odometer" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "last_pm_odometer" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_trucks_current_odometer') THEN
        ALTER TABLE "trucks" ADD CONSTRAINT "CHK_trucks_current_odometer" CHECK ("current_odometer" >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_trucks_last_pm_odometer') THEN
        ALTER TABLE "trucks" ADD CONSTRAINT "CHK_trucks_last_pm_odometer" CHECK ("last_pm_odometer" >= 0);
    END IF;
END $$;


-- ============================================================
-- 2. LOOKUP & CLASSIFICATION TABLES
-- ============================================================

-- Defensive drops for legacy or draft tables in strict dependency order
DROP TABLE IF EXISTS "maintenance_logs" CASCADE;
DROP TABLE IF EXISTS "approval_requests" CASCADE;
DROP TABLE IF EXISTS "work_orders" CASCADE;
DROP TABLE IF EXISTS "incident_reports" CASCADE;
DROP TABLE IF EXISTS "vehicle_inspections" CASCADE;
DROP TABLE IF EXISTS "vehicle_odometer_logs" CASCADE;
DROP TABLE IF EXISTS "incident_types" CASCADE;
DROP TABLE IF EXISTS "maintenance_types" CASCADE;

CREATE TABLE "maintenance_types" (
    "id" SERIAL PRIMARY KEY,
    "type_name" VARCHAR(50) UNIQUE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "incident_types" (
    "id" SERIAL PRIMARY KEY,
    "type_name" VARCHAR(50) UNIQUE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 3. ODOMETER TRACKING
-- ============================================================

CREATE TABLE "vehicle_odometer_logs" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "truck_id" UUID NOT NULL REFERENCES "trucks"("id") ON DELETE CASCADE,
    "odometer_reading" INTEGER NOT NULL,
    "logged_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "source" VARCHAR(30) NOT NULL DEFAULT 'POST_DISPATCH_RETURN',
    "notes" TEXT,
    "logged_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CHK_odometer_logs_reading" CHECK ("odometer_reading" >= 0)
);

CREATE INDEX "IX_vehicle_odometer_logs_truck_id" ON "vehicle_odometer_logs" ("truck_id");
CREATE INDEX "IX_vehicle_odometer_logs_logged_at" ON "vehicle_odometer_logs" ("logged_at");


-- ============================================================
-- 4. VEHICLE INSPECTIONS (Reporting & Findings Only - No Checklist)
-- ============================================================

CREATE TABLE "vehicle_inspections" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "truck_id" UUID NOT NULL REFERENCES "trucks"("id") ON DELETE CASCADE,
    "inspector_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "result" VARCHAR(20) NOT NULL,
    "findings" TEXT NOT NULL,
    "issue_detected" BOOLEAN NOT NULL DEFAULT TRUE,
    "inspection_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CHK_vehicle_inspections_result" CHECK ("result" IN ('PASSED', 'NEEDS_ATTENTION', 'FAILED'))
);

CREATE INDEX "IX_vehicle_inspections_truck_id" ON "vehicle_inspections" ("truck_id");
CREATE INDEX "IX_vehicle_inspections_result" ON "vehicle_inspections" ("result");
CREATE INDEX "IX_vehicle_inspections_inspection_date" ON "vehicle_inspections" ("inspection_date");


-- ============================================================
-- 5. INCIDENT REPORTS
-- ============================================================

CREATE TABLE "incident_reports" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "truck_id" UUID NOT NULL REFERENCES "trucks"("id") ON DELETE CASCADE,
    "reporter_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "incident_type_id" INTEGER NOT NULL REFERENCES "incident_types"("id") ON DELETE RESTRICT,
    "severity" VARCHAR(20) NOT NULL,
    "incident_location" VARCHAR(255),
    "description" TEXT NOT NULL,
    "report_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CHK_incident_reports_severity" CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX "IX_incident_reports_truck_id" ON "incident_reports" ("truck_id");
CREATE INDEX "IX_incident_reports_severity" ON "incident_reports" ("severity");
CREATE INDEX "IX_incident_reports_report_date" ON "incident_reports" ("report_date");


-- ============================================================
-- 6. WORK ORDERS
-- ============================================================

CREATE TABLE "work_orders" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "truck_id" UUID NOT NULL REFERENCES "trucks"("id") ON DELETE CASCADE,
    "creator_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "maintenance_type_id" INTEGER NOT NULL REFERENCES "maintenance_types"("id") ON DELETE RESTRICT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "inspection_id" UUID REFERENCES "vehicle_inspections"("id") ON DELETE SET NULL,
    "incident_report_id" UUID REFERENCES "incident_reports"("id") ON DELETE SET NULL,
    "request_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_date" TIMESTAMPTZ,
    "shop_name" VARCHAR(150),
    "estimated_cost" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CHK_work_orders_status" CHECK ("status" IN ('PENDING', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT "CHK_work_orders_estimated_cost" CHECK ("estimated_cost" >= 0)
);

-- Trigger function to automatically update updated_at timestamp on work_orders
CREATE OR REPLACE FUNCTION update_work_orders_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_work_orders_updated_at ON "work_orders";
CREATE TRIGGER trigger_update_work_orders_updated_at
    BEFORE UPDATE ON "work_orders"
    FOR EACH ROW
    EXECUTE FUNCTION update_work_orders_updated_at_column();

CREATE INDEX "IX_work_orders_truck_id" ON "work_orders" ("truck_id");
CREATE INDEX "IX_work_orders_status" ON "work_orders" ("status");
CREATE INDEX "IX_work_orders_maintenance_type_id" ON "work_orders" ("maintenance_type_id");


-- ============================================================
-- 7. APPROVAL REQUESTS
-- ============================================================

CREATE TABLE "approval_requests" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "work_order_id" UUID NOT NULL UNIQUE REFERENCES "work_orders"("id") ON DELETE CASCADE,
    "decider_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "requested_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_date" TIMESTAMPTZ,
    "amount_requested" NUMERIC(12, 2) NOT NULL,
    "is_approved" BOOLEAN DEFAULT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UQ_approval_requests_work_order_id" UNIQUE ("work_order_id"),
    CONSTRAINT "CHK_approval_requests_amount_requested" CHECK ("amount_requested" >= 0)
);

CREATE INDEX "IX_approval_requests_work_order_id" ON "approval_requests" ("work_order_id");
CREATE INDEX "IX_approval_requests_is_approved" ON "approval_requests" ("is_approved");


-- ============================================================
-- 8. MAINTENANCE LOGS
-- ============================================================

CREATE TABLE "maintenance_logs" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "work_order_id" UUID NOT NULL UNIQUE REFERENCES "work_orders"("id") ON DELETE CASCADE,
    "maintenance_type_id" INTEGER NOT NULL REFERENCES "maintenance_types"("id") ON DELETE RESTRICT,
    "severity" VARCHAR(20) NOT NULL,
    "date_started" TIMESTAMPTZ NOT NULL,
    "date_resolved" TIMESTAMPTZ NOT NULL,
    "parts_cost" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "labor_cost" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "downtime_days" INTEGER NOT NULL DEFAULT 0,
    "odometer_at_service" INTEGER NOT NULL,
    "official_receipt_number" VARCHAR(100) UNIQUE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UQ_maintenance_logs_work_order_id" UNIQUE ("work_order_id"),
    CONSTRAINT "CHK_maintenance_logs_severity" CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT "CHK_maintenance_logs_parts_cost" CHECK ("parts_cost" >= 0),
    CONSTRAINT "CHK_maintenance_logs_labor_cost" CHECK ("labor_cost" >= 0),
    CONSTRAINT "CHK_maintenance_logs_downtime_days" CHECK ("downtime_days" >= 0),
    CONSTRAINT "CHK_maintenance_logs_odometer_at_service" CHECK ("odometer_at_service" >= 0)
);

CREATE INDEX "IX_maintenance_logs_work_order_id" ON "maintenance_logs" ("work_order_id");
CREATE INDEX "IX_maintenance_logs_official_receipt_number" ON "maintenance_logs" ("official_receipt_number");

COMMIT;
