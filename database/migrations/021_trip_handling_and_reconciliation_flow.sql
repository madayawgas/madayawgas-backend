-- ============================================================
-- REVISED TRIP HANDLING & RECONCILIATION FLOW MIGRATION
-- Migration 021: Driver 'ended_by' attribution, partial unique index,
-- and 'route.end_own' permission
-- ============================================================

-- 1. Add 'ended_by' column to trips table for 3NF crew attribution
ALTER TABLE "trips" 
    ADD COLUMN IF NOT EXISTS "ended_by" UUID REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "IX_trips_ended_by" ON "trips" ("ended_by");

-- 2. Update partial unique index on truck_id to include 'RETURNED'
-- Guarantees a truck cannot be dispatched on a new trip until its returned cylinders
-- have been physically counted and reconciled (status = 'COMPLETED')
DROP INDEX IF EXISTS "UQ_trips_active_truck";
CREATE UNIQUE INDEX "UQ_trips_active_truck" 
    ON "trips" ("truck_id") 
    WHERE "status" IN ('PENDING', 'IN_PROGRESS', 'RETURNED');

-- 3. Register 'route.end_own' permission in permissions catalog
INSERT INTO "permissions" ("name", "description")
VALUES (
    'route.end_own',
    'End an active delivery trip and record final vehicle return odometer reading (Driver).'
)
ON CONFLICT ("name") DO NOTHING;

-- 4. Assign 'route.end_own' to Driver, Logistics Supervisor, Admin, and Super Admin
-- (Strictly excluded from Sales Person per operational role design)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.name = 'route.end_own'
WHERE r.name IN ('Driver', 'Logistics Supervisor', 'Admin', 'Super Admin')
ON CONFLICT DO NOTHING;
