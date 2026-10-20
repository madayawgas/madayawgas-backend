-- ============================================================
-- OPERATIONAL LOGGING SUBSYSTEMS MIGRATION
-- Migration 016: Duty Attendance, Driver Apprehensions,
-- Vehicle Fuel Logging, and Driver Emergency Alerts
-- ============================================================

BEGIN;

-- Helper updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. DUTY ATTENDANCE (CLOCK-IN & CLOCK-OUT RECORDS)
-- ============================================================

CREATE TABLE IF NOT EXISTS "duty_attendance" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "clock_in_time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clock_out_time" TIMESTAMPTZ,
    "clock_in_recorded_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "clock_out_recorded_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "clock_in_notes" TEXT,
    "clock_out_notes" TEXT,
    "duration_minutes" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'COMPLETED', 'VOIDED')),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Invariant: User cannot initiate a new clock-in if they already have an open active duty cycle
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_duty_attendance_active_user" 
    ON "duty_attendance" ("user_id") 
    WHERE "clock_out_time" IS NULL AND "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "idx_duty_attendance_user_id" ON "duty_attendance" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_duty_attendance_clock_in_time" ON "duty_attendance" ("clock_in_time" DESC);
CREATE INDEX IF NOT EXISTS "idx_duty_attendance_status" ON "duty_attendance" ("status");

DROP TRIGGER IF EXISTS trigger_update_duty_attendance_updated_at ON "duty_attendance";
CREATE TRIGGER trigger_update_duty_attendance_updated_at
    BEFORE UPDATE ON "duty_attendance"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();


-- ============================================================
-- 2. DRIVER ROAD APPREHENSIONS (CITATIONS & REGULATORY TICKETS)
-- ============================================================

CREATE TABLE IF NOT EXISTS "driver_apprehensions" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "vehicle_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
    "driver_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "trip_id" UUID REFERENCES "trips"("id") ON DELETE SET NULL,
    "recorded_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "citation_ticket_no" VARCHAR(100),
    "violation_type" VARCHAR(100) NOT NULL,
    "apprehending_agency" VARCHAR(100) NOT NULL,
    "incident_time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" VARCHAR(255),
    "penalty_amount" NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK ("penalty_amount" >= 0),
    "ticket_media_key" VARCHAR(255) NOT NULL,
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'RECORDED' CHECK ("status" IN ('RECORDED', 'SETTLED', 'DISPUTED', 'CANCELLED')),
    "settled_at" TIMESTAMPTZ,
    "settled_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_driver_apprehensions_vehicle_id" ON "driver_apprehensions" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_driver_apprehensions_driver_id" ON "driver_apprehensions" ("driver_id");
CREATE INDEX IF NOT EXISTS "idx_driver_apprehensions_trip_id" ON "driver_apprehensions" ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_driver_apprehensions_incident_time" ON "driver_apprehensions" ("incident_time" DESC);
CREATE INDEX IF NOT EXISTS "idx_driver_apprehensions_status" ON "driver_apprehensions" ("status");

DROP TRIGGER IF EXISTS trigger_update_driver_apprehensions_updated_at ON "driver_apprehensions";
CREATE TRIGGER trigger_update_driver_apprehensions_updated_at
    BEFORE UPDATE ON "driver_apprehensions"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();


-- ============================================================
-- 3. VEHICLE FUEL LOGGING (TELEMETRY & DIRECT EXPENDITURES)
-- ============================================================

CREATE TABLE IF NOT EXISTS "vehicle_fuel_logs" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "vehicle_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
    "driver_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "trip_id" UUID REFERENCES "trips"("id") ON DELETE SET NULL,
    "recorded_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "liters_pumped" NUMERIC(8, 2) NOT NULL CHECK ("liters_pumped" > 0),
    "total_cost" NUMERIC(10, 2) NOT NULL CHECK ("total_cost" >= 0),
    "price_per_liter" NUMERIC(8, 2) NOT NULL CHECK ("price_per_liter" >= 0),
    "fuel_station" VARCHAR(150),
    "fuel_type" VARCHAR(50) NOT NULL DEFAULT 'DIESEL' CHECK ("fuel_type" IN ('DIESEL', 'GASOLINE', 'AUTO_LPG', 'OTHER')),
    "odometer_reading" INTEGER CHECK ("odometer_reading" IS NULL OR "odometer_reading" >= 0),
    "receipt_media_key" VARCHAR(255),
    "fueled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_vehicle_fuel_logs_vehicle_id" ON "vehicle_fuel_logs" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_vehicle_fuel_logs_driver_id" ON "vehicle_fuel_logs" ("driver_id");
CREATE INDEX IF NOT EXISTS "idx_vehicle_fuel_logs_trip_id" ON "vehicle_fuel_logs" ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_vehicle_fuel_logs_fueled_at" ON "vehicle_fuel_logs" ("fueled_at" DESC);

DROP TRIGGER IF EXISTS trigger_update_vehicle_fuel_logs_updated_at ON "vehicle_fuel_logs";
CREATE TRIGGER trigger_update_vehicle_fuel_logs_updated_at
    BEFORE UPDATE ON "vehicle_fuel_logs"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();


-- ============================================================
-- 4. DRIVER EMERGENCY ALERTS (ONE-ACTION SOS DISPATCH & TRIAGE)
-- ============================================================

CREATE TABLE IF NOT EXISTS "emergency_alerts" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "driver_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "vehicle_id" UUID REFERENCES "vehicles"("id") ON DELETE SET NULL,
    "trip_id" UUID REFERENCES "trips"("id") ON DELETE SET NULL,
    "latitude" NUMERIC(10, 7) CHECK ("latitude" IS NULL OR ("latitude" >= -90.0 AND "latitude" <= 90.0)),
    "longitude" NUMERIC(10, 7) CHECK ("longitude" IS NULL OR ("longitude" >= -180.0 AND "longitude" <= 180.0)),
    "emergency_type" VARCHAR(50) NOT NULL DEFAULT 'GENERAL' CHECK ("emergency_type" IN ('GENERAL', 'ACCIDENT', 'VEHICLE_BREAKDOWN', 'MEDICAL', 'SECURITY', 'OTHER')),
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_ALARM')),
    "acknowledged_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "acknowledged_at" TIMESTAMPTZ,
    "resolved_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "resolved_at" TIMESTAMPTZ,
    "resolution_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_emergency_alerts_driver_id" ON "emergency_alerts" ("driver_id");
CREATE INDEX IF NOT EXISTS "idx_emergency_alerts_vehicle_id" ON "emergency_alerts" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_emergency_alerts_trip_id" ON "emergency_alerts" ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_emergency_alerts_status" ON "emergency_alerts" ("status");
CREATE INDEX IF NOT EXISTS "idx_emergency_alerts_created_at" ON "emergency_alerts" ("created_at" DESC);

DROP TRIGGER IF EXISTS trigger_update_emergency_alerts_updated_at ON "emergency_alerts";
CREATE TRIGGER trigger_update_emergency_alerts_updated_at
    BEFORE UPDATE ON "emergency_alerts"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();


-- ============================================================
-- 5. RBAC PERMISSIONS EXPANSION & SEED ASSIGNMENTS
-- ============================================================

-- Insert new permissions
INSERT INTO "permissions" ("name", "description")
VALUES
    -- Fleet Scoped
    ('fleet.view_own', 'View details and maintenance records for own assigned vehicle.'),

    -- Route Scoped
    ('route.view_own', 'View routes and trip schedules assigned to the current user.'),

    -- Attendance
    ('attendance.view', 'View attendance logs across all personnel.'),
    ('attendance.view_own', 'View own duty shift attendance records.'),
    ('attendance.record', 'Clock in and clock out of active duty shifts.'),
    ('attendance.manage', 'Clock in/out on behalf of personnel, void/manage attendance records.'),

    -- Apprehensions
    ('apprehensions.view', 'View all roadside traffic apprehension records.'),
    ('apprehensions.view_own', 'View roadside apprehensions involving own vehicle or trip.'),
    ('apprehensions.create', 'Record road traffic apprehension with mandatory ticket proof.'),
    ('apprehensions.manage', 'Update, settle, or dispute road apprehension tickets.'),

    -- Fuel
    ('fuel.view', 'View all vehicle fuel intake records and consumption summaries.'),
    ('fuel.view_own', 'View fuel intake logs for assigned vehicle only.'),
    ('fuel.create', 'Record vehicle fuel intake, cost, and odometer reading.'),
    ('fuel.manage', 'Edit or delete vehicle fuel log records.'),

    -- Emergency Alerts
    ('alerts.view', 'View organizational driver emergency alerts feed.'),
    ('alerts.view_own', 'View own submitted driver emergency alerts.'),
    ('alerts.trigger', 'Single-action mobile emergency alert SOS dispatch.'),
    ('alerts.manage', 'Acknowledge and resolve driver emergency alerts.')
ON CONFLICT ("name") DO NOTHING;

-- Grant Super Admin and Admin all permissions
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name IN ('Super Admin', 'Admin')
ON CONFLICT DO NOTHING;

-- Grant Logistics Supervisor / Fleet Manager full operational permissions
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.name IN (
    'fleet.view_own',
    'attendance.view', 'attendance.view_own', 'attendance.record', 'attendance.manage',
    'apprehensions.view', 'apprehensions.view_own', 'apprehensions.create', 'apprehensions.manage',
    'fuel.view', 'fuel.view_own', 'fuel.create', 'fuel.manage',
    'alerts.view', 'alerts.view_own', 'alerts.trigger', 'alerts.manage'
)
WHERE r.name IN ('Logistics Supervisor', 'Fleet Manager')
ON CONFLICT DO NOTHING;

-- Grant Sales Supervisor attendance and alert management
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.name IN (
    'attendance.view', 'attendance.view_own', 'attendance.record', 'attendance.manage',
    'alerts.view', 'alerts.view_own', 'alerts.manage'
)
WHERE r.name IN ('Sales Supervisor', 'Sales Manager')
ON CONFLICT DO NOTHING;

-- Grant Sales Person attendance, own alerts, and road apprehension reporting
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.name IN (
    'attendance.record', 'attendance.view_own',
    'apprehensions.create', 'apprehensions.view_own',
    'alerts.trigger', 'alerts.view_own'
)
WHERE r.name = 'Sales Person'
ON CONFLICT DO NOTHING;

-- Grant Driver full frontline field capabilities & assigned truck scoping
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.name IN (
    'attendance.record', 'attendance.view_own',
    'apprehensions.create', 'apprehensions.view_own',
    'fuel.create', 'fuel.view_own',
    'alerts.trigger', 'alerts.view_own',
    'route.view_own',
    'fleet.view_own'
)
WHERE r.name = 'Driver'
ON CONFLICT DO NOTHING;

COMMIT;
