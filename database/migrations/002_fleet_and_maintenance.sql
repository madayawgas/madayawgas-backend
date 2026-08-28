-- ============================================================
-- FLEET AND MAINTENANCE SUBSYSTEM MIGRATION
-- ============================================================


-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'truck_status') THEN
        CREATE TYPE truck_status AS ENUM (
            'ACTIVE',
            'INACTIVE',
            'UNDER_MAINTENANCE',
            'RETIRED'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_severity') THEN
        CREATE TYPE maintenance_severity AS ENUM (
            'LOW',
            'MEDIUM',
            'HIGH',
            'CRITICAL'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_order_status') THEN
        CREATE TYPE work_order_status AS ENUM (
            'PENDING',
            'APPROVED',
            'SCHEDULED',
            'IN_PROGRESS',
            'COMPLETED',
            'CANCELLED'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_result') THEN
        CREATE TYPE inspection_result AS ENUM (
            'PASSED',
            'FAILED',
            'NEEDS_ATTENTION'
        );
    END IF;
END $$;


-- ============================================================
-- 2. LOOKUP / DOMAIN TABLES
-- ============================================================

CREATE TABLE "maintenance_types" (
    "id" UUID DEFAULT gen_random_uuid(),
    "type_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),
    CONSTRAINT "UQ_maintenance_types_type_name" UNIQUE ("type_name")
);

CREATE TABLE "incident_types" (
    "id" UUID DEFAULT gen_random_uuid(),
    "type_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),
    CONSTRAINT "UQ_incident_types_type_name" UNIQUE ("type_name")
);


-- ============================================================
-- 3. TRUCKS
-- ============================================================

CREATE TABLE "trucks" (
    "id" UUID DEFAULT gen_random_uuid(),
    "driver_id" UUID,
    "plate_number" VARCHAR(20) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "year_model" INT NOT NULL,
    "current_odometer" INT NOT NULL DEFAULT 0,
    "last_pm_odometer" INT NOT NULL DEFAULT 0,
    "status" truck_status NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),
    CONSTRAINT "UQ_trucks_driver_id" UNIQUE ("driver_id"),
    CONSTRAINT "UQ_trucks_plate_number" UNIQUE ("plate_number"),
    CONSTRAINT "CHK_trucks_current_odometer" CHECK ("current_odometer" >= 0),
    CONSTRAINT "CHK_trucks_last_pm_odometer" CHECK ("last_pm_odometer" >= 0),

    CONSTRAINT "FK_trucks_driver_id"
        FOREIGN KEY ("driver_id")
        REFERENCES "users"("id")
        ON DELETE SET NULL
);

-- Trigger function to automatically update updated_at timestamp on trucks
CREATE OR REPLACE FUNCTION update_trucks_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_trucks_updated_at ON "trucks";
CREATE TRIGGER trigger_update_trucks_updated_at
    BEFORE UPDATE ON "trucks"
    FOR EACH ROW
    EXECUTE FUNCTION update_trucks_updated_at_column();


-- ============================================================
-- 4. VEHICLE INSPECTIONS
-- ============================================================

CREATE TABLE "vehicle_inspections" (
    "id" UUID DEFAULT gen_random_uuid(),
    "truck_id" UUID NOT NULL,
    "inspector_id" UUID NOT NULL,
    "result" inspection_result NOT NULL,
    "inspection_date" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "findings" TEXT,
    "issue_detected" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),

    CONSTRAINT "FK_vehicle_inspections_truck_id"
        FOREIGN KEY ("truck_id")
        REFERENCES "trucks"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "FK_vehicle_inspections_inspector_id"
        FOREIGN KEY ("inspector_id")
        REFERENCES "users"("id")
        ON DELETE RESTRICT
);


-- ============================================================
-- 5. INCIDENT REPORTS
-- ============================================================

CREATE TABLE "incident_reports" (
    "id" UUID DEFAULT gen_random_uuid(),
    "truck_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "incident_type_id" UUID NOT NULL,
    "severity" maintenance_severity NOT NULL,
    "report_date" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "incident_location" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),

    CONSTRAINT "FK_incident_reports_truck_id"
        FOREIGN KEY ("truck_id")
        REFERENCES "trucks"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "FK_incident_reports_reporter_id"
        FOREIGN KEY ("reporter_id")
        REFERENCES "users"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "FK_incident_reports_incident_type_id"
        FOREIGN KEY ("incident_type_id")
        REFERENCES "incident_types"("id")
        ON DELETE RESTRICT
);


-- ============================================================
-- 6. WORK ORDERS
-- ============================================================

CREATE TABLE "work_orders" (
    "id" UUID DEFAULT gen_random_uuid(),
    "truck_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "status" work_order_status NOT NULL DEFAULT 'PENDING',
    "maintenance_type_id" UUID NOT NULL,
    "inspection_id" UUID,
    "incident_report_id" UUID,
    "request_date" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "scheduled_date" TIMESTAMPTZ,
    "shop_name" VARCHAR(150),
    "estimated_cost" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),

    CONSTRAINT "FK_work_orders_truck_id"
        FOREIGN KEY ("truck_id")
        REFERENCES "trucks"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "FK_work_orders_creator_id"
        FOREIGN KEY ("creator_id")
        REFERENCES "users"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "FK_work_orders_maintenance_type_id"
        FOREIGN KEY ("maintenance_type_id")
        REFERENCES "maintenance_types"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "FK_work_orders_inspection_id"
        FOREIGN KEY ("inspection_id")
        REFERENCES "vehicle_inspections"("id")
        ON DELETE SET NULL,

    CONSTRAINT "FK_work_orders_incident_report_id"
        FOREIGN KEY ("incident_report_id")
        REFERENCES "incident_reports"("id")
        ON DELETE SET NULL,

    CONSTRAINT "CHK_work_orders_estimated_cost" CHECK ("estimated_cost" >= 0)
);


-- ============================================================
-- 7. APPROVAL REQUESTS
-- ============================================================

CREATE TABLE "approval_requests" (
    "id" UUID DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "decider_id" UUID,
    "requested_date" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "decided_date" TIMESTAMPTZ,
    "amount_requested" DECIMAL(12, 2) NOT NULL,
    "is_approved" BOOLEAN DEFAULT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),
    CONSTRAINT "UQ_approval_requests_work_order_id" UNIQUE ("work_order_id"),

    CONSTRAINT "FK_approval_requests_work_order_id"
        FOREIGN KEY ("work_order_id")
        REFERENCES "work_orders"("id")
        ON DELETE CASCADE,

    CONSTRAINT "FK_approval_requests_decider_id"
        FOREIGN KEY ("decider_id")
        REFERENCES "users"("id")
        ON DELETE SET NULL,

    CONSTRAINT "CHK_approval_requests_amount_requested" CHECK ("amount_requested" >= 0)
);


-- ============================================================
-- 8. MAINTENANCE LOGS
-- ============================================================

CREATE TABLE "maintenance_logs" (
    "id" UUID DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "maintenance_type_id" UUID NOT NULL,
    "severity" maintenance_severity NOT NULL,
    "date_started" TIMESTAMPTZ NOT NULL,
    "date_resolved" TIMESTAMPTZ,
    "parts_cost" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "labor_cost" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "downtime_days" INT NOT NULL DEFAULT 0,
    "odometer_at_service" INT NOT NULL,
    "official_receipt_number" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),
    CONSTRAINT "UQ_maintenance_logs_work_order_id" UNIQUE ("work_order_id"),
    CONSTRAINT "UQ_maintenance_logs_official_receipt_number" UNIQUE ("official_receipt_number"),

    CONSTRAINT "FK_maintenance_logs_work_order_id"
        FOREIGN KEY ("work_order_id")
        REFERENCES "work_orders"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "FK_maintenance_logs_maintenance_type_id"
        FOREIGN KEY ("maintenance_type_id")
        REFERENCES "maintenance_types"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "CHK_maintenance_logs_parts_cost" CHECK ("parts_cost" >= 0),
    CONSTRAINT "CHK_maintenance_logs_labor_cost" CHECK ("labor_cost" >= 0),
    CONSTRAINT "CHK_maintenance_logs_downtime_days" CHECK ("downtime_days" >= 0),
    CONSTRAINT "CHK_maintenance_logs_odometer_at_service" CHECK ("odometer_at_service" >= 0)
);


-- ============================================================
-- 9. PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX "IX_trucks_driver_id" ON "trucks" ("driver_id");

CREATE INDEX "IX_vehicle_inspections_truck_id" ON "vehicle_inspections" ("truck_id");
CREATE INDEX "IX_vehicle_inspections_inspector_id" ON "vehicle_inspections" ("inspector_id");

CREATE INDEX "IX_incident_reports_truck_id" ON "incident_reports" ("truck_id");
CREATE INDEX "IX_incident_reports_reporter_id" ON "incident_reports" ("reporter_id");
CREATE INDEX "IX_incident_reports_incident_type_id" ON "incident_reports" ("incident_type_id");

CREATE INDEX "IX_work_orders_truck_id" ON "work_orders" ("truck_id");
CREATE INDEX "IX_work_orders_creator_id" ON "work_orders" ("creator_id");
CREATE INDEX "IX_work_orders_maintenance_type_id" ON "work_orders" ("maintenance_type_id");
CREATE INDEX "IX_work_orders_status" ON "work_orders" ("status");

CREATE INDEX "IX_approval_requests_work_order_id" ON "approval_requests" ("work_order_id");
CREATE INDEX "IX_approval_requests_decider_id" ON "approval_requests" ("decider_id");

CREATE INDEX "IX_maintenance_logs_work_order_id" ON "maintenance_logs" ("work_order_id");
CREATE INDEX "IX_maintenance_logs_maintenance_type_id" ON "maintenance_logs" ("maintenance_type_id");
