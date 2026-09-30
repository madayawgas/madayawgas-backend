-- ============================================================
-- SCHEDULE & TRIP SUBSYSTEM MIGRATION
-- Migration 010: Service Zones, Schedule Templates, Truck Schedules,
-- Trips, Multi-Load Stock Transfers, and Stock Reconciliations
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_status') THEN
        CREATE TYPE schedule_status AS ENUM ('SCHEDULED', 'DISPATCHED', 'CANCELLED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_status') THEN
        CREATE TYPE trip_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_type') THEN
        CREATE TYPE transfer_type AS ENUM ('DISPATCH_LOAD', 'RETURN_UNLOAD');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_condition') THEN
        CREATE TYPE stock_condition AS ENUM ('FILLED', 'EMPTY_GOOD', 'DEFECTIVE');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_status') THEN
        CREATE TYPE reconciliation_status AS ENUM ('AWAITING_SYNC', 'SETTLED', 'FLAGGED_VARIANCE');
    END IF;
END $$;


-- ============================================================
-- 2. SERVICE ZONES
-- ============================================================

CREATE TABLE IF NOT EXISTS "service_zones" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "code" VARCHAR(50) NOT NULL UNIQUE,
    "name" VARCHAR(100) NOT NULL UNIQUE,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IX_service_zones_code" ON "service_zones" ("code");
CREATE INDEX IF NOT EXISTS "IX_service_zones_is_active" ON "service_zones" ("is_active");


-- ============================================================
-- 3. SCHEDULE TEMPLATES (WEEKLY ROUTE MASTER TEMPLATES)
-- ============================================================

CREATE TABLE IF NOT EXISTS "schedule_templates" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "truck_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
    "zone_id" UUID NOT NULL REFERENCES "service_zones"("id") ON DELETE RESTRICT,
    "day_of_week" INT NOT NULL CHECK ("day_of_week" BETWEEN 1 AND 7),
    "default_sales_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UQ_schedule_templates_truck_day" UNIQUE ("truck_id", "day_of_week")
);

CREATE INDEX IF NOT EXISTS "IX_schedule_templates_truck_id" ON "schedule_templates" ("truck_id");
CREATE INDEX IF NOT EXISTS "IX_schedule_templates_zone_id" ON "schedule_templates" ("zone_id");
CREATE INDEX IF NOT EXISTS "IX_schedule_templates_day_of_week" ON "schedule_templates" ("day_of_week");
CREATE INDEX IF NOT EXISTS "IX_schedule_templates_is_active" ON "schedule_templates" ("is_active");


-- ============================================================
-- 4. TRUCK SCHEDULES (OPERATIONAL DATE-STAMPED ASSIGNMENTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS "truck_schedules" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "scheduled_date" DATE NOT NULL,
    "truck_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
    "sales_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "zone_id" UUID NOT NULL REFERENCES "service_zones"("id") ON DELETE RESTRICT,
    "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "status" schedule_status NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UQ_truck_schedules_truck_date" UNIQUE ("truck_id", "scheduled_date")
);

CREATE INDEX IF NOT EXISTS "IX_truck_schedules_scheduled_date" ON "truck_schedules" ("scheduled_date");
CREATE INDEX IF NOT EXISTS "IX_truck_schedules_truck_id" ON "truck_schedules" ("truck_id");
CREATE INDEX IF NOT EXISTS "IX_truck_schedules_sales_user_id" ON "truck_schedules" ("sales_user_id");
CREATE INDEX IF NOT EXISTS "IX_truck_schedules_zone_id" ON "truck_schedules" ("zone_id");
CREATE INDEX IF NOT EXISTS "IX_truck_schedules_status" ON "truck_schedules" ("status");


-- ============================================================
-- 5. TRIPS (EXECUTION LIFECYCLE & FROZEN CREW SNAPSHOTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS "trips" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "schedule_id" UUID REFERENCES "truck_schedules"("id") ON DELETE SET NULL,
    "truck_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
    "driver_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "sales_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "zone_id" UUID NOT NULL REFERENCES "service_zones"("id") ON DELETE RESTRICT,
    "dispatched_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "return_odometer_log_id" UUID UNIQUE REFERENCES "vehicle_odometer_logs"("id") ON DELETE SET NULL,
    "trip_number" VARCHAR(50) NOT NULL UNIQUE,
    "status" trip_status NOT NULL DEFAULT 'IN_PROGRESS',
    "departure_time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "return_time" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_trips_schedule_id" ON "trips" ("schedule_id") WHERE "schedule_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IX_trips_truck_id" ON "trips" ("truck_id");
CREATE INDEX IF NOT EXISTS "IX_trips_driver_id" ON "trips" ("driver_id");
CREATE INDEX IF NOT EXISTS "IX_trips_sales_user_id" ON "trips" ("sales_user_id");
CREATE INDEX IF NOT EXISTS "IX_trips_zone_id" ON "trips" ("zone_id");
CREATE INDEX IF NOT EXISTS "IX_trips_status" ON "trips" ("status");
CREATE INDEX IF NOT EXISTS "IX_trips_departure_time" ON "trips" ("departure_time");


-- ============================================================
-- 6. TRIP LOADS (MULTI-LOAD STOCK TRANSFER SLIPS)
-- ============================================================

CREATE TABLE IF NOT EXISTS "trip_loads" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "trip_id" UUID NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
    "transfer_type" transfer_type NOT NULL,
    "slip_number" VARCHAR(50) NOT NULL UNIQUE,
    "recorded_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT
);

CREATE INDEX IF NOT EXISTS "IX_trip_loads_trip_id" ON "trip_loads" ("trip_id");
CREATE INDEX IF NOT EXISTS "IX_trip_loads_transfer_type" ON "trip_loads" ("transfer_type");
CREATE INDEX IF NOT EXISTS "IX_trip_loads_slip_number" ON "trip_loads" ("slip_number");


-- ============================================================
-- 7. TRIP LOAD ITEMS (CANONICAL PACKAGING LINE ITEMS)
-- ============================================================

CREATE TABLE IF NOT EXISTS "trip_load_items" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "load_id" UUID NOT NULL REFERENCES "trip_loads"("id") ON DELETE CASCADE,
    "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
    "condition" stock_condition NOT NULL,
    "quantity_units" INT NOT NULL CHECK ("quantity_units" >= 0)
);

CREATE INDEX IF NOT EXISTS "IX_trip_load_items_load_id" ON "trip_load_items" ("load_id");
CREATE INDEX IF NOT EXISTS "IX_trip_load_items_product_id" ON "trip_load_items" ("product_id");
CREATE INDEX IF NOT EXISTS "IX_trip_load_items_condition" ON "trip_load_items" ("condition");


-- ============================================================
-- 8. TRIP STOCK RECONCILIATIONS (POST-TRIP SETTLEMENT & DISCREPANCY)
-- ============================================================

CREATE TABLE IF NOT EXISTS "trip_stock_reconciliations" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "trip_id" UUID NOT NULL UNIQUE REFERENCES "trips"("id") ON DELETE CASCADE,
    "verified_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "total_loaded_full" INT NOT NULL DEFAULT 0 CHECK ("total_loaded_full" >= 0),
    "total_sold_full" INT NOT NULL DEFAULT 0 CHECK ("total_sold_full" >= 0),
    "total_returned_full" INT NOT NULL DEFAULT 0 CHECK ("total_returned_full" >= 0),
    "total_returned_empty_good" INT NOT NULL DEFAULT 0 CHECK ("total_returned_empty_good" >= 0),
    "total_returned_defective" INT NOT NULL DEFAULT 0 CHECK ("total_returned_defective" >= 0),
    "net_customer_debt_created" INT NOT NULL DEFAULT 0,
    "status" reconciliation_status NOT NULL DEFAULT 'AWAITING_SYNC',
    "supervisor_notes" TEXT,
    "reconciled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IX_trip_stock_reconciliations_trip_id" ON "trip_stock_reconciliations" ("trip_id");
CREATE INDEX IF NOT EXISTS "IX_trip_stock_reconciliations_status" ON "trip_stock_reconciliations" ("status");


-- ============================================================
-- 9. UPDATED_AT TRIGGER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_service_zones_updated_at ON "service_zones";
CREATE TRIGGER trigger_update_service_zones_updated_at
    BEFORE UPDATE ON "service_zones"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_update_schedule_templates_updated_at ON "schedule_templates";
CREATE TRIGGER trigger_update_schedule_templates_updated_at
    BEFORE UPDATE ON "schedule_templates"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_update_truck_schedules_updated_at ON "truck_schedules";
CREATE TRIGGER trigger_update_truck_schedules_updated_at
    BEFORE UPDATE ON "truck_schedules"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_update_trips_updated_at ON "trips";
CREATE TRIGGER trigger_update_trips_updated_at
    BEFORE UPDATE ON "trips"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_update_trip_stock_reconciliations_updated_at ON "trip_stock_reconciliations";
CREATE TRIGGER trigger_update_trip_stock_reconciliations_updated_at
    BEFORE UPDATE ON "trip_stock_reconciliations"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

COMMIT;
