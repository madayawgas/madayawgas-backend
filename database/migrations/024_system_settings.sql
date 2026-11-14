-- ============================================================
-- Migration 024: Business System Settings & Dynamic PM Threshold
-- 1. Creates system_settings table and seeds 6 core business variables.
-- 2. Adds settings.view and settings.manage permissions (Admin & Super Admin only).
-- 3. Drops static generated column pm_due_flag from vehicles so PM due status
--    is evaluated dynamically against fleet.pm_odometer_threshold_km.
-- ============================================================

BEGIN;

-- 1. Create system_settings table
CREATE TABLE IF NOT EXISTS "system_settings" (
    "key" VARCHAR(100) PRIMARY KEY,
    "value" TEXT NOT NULL,
    "value_type" VARCHAR(20) NOT NULL CHECK ("value_type" IN ('INTEGER', 'NUMBER', 'BOOLEAN', 'STRING')),
    "category" VARCHAR(50) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "unit" VARCHAR(30),
    "min_value" NUMERIC,
    "max_value" NUMERIC,
    "updated_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Seed core business operations variables
INSERT INTO "system_settings" (
    "key", "value", "value_type", "category", "label", "description", "unit", "min_value", "max_value"
)
VALUES
    (
        'fleet.pm_odometer_threshold_km',
        '5000',
        'INTEGER',
        'FLEET',
        'PM Odometer Threshold',
        'Distance traveled since last preventive maintenance (PM) at which a vehicle is flagged as due for PM.',
        'km',
        500,
        50000
    ),
    (
        'fleet.work_order_approval_threshold',
        '5000',
        'NUMBER',
        'FLEET',
        'Work Order Approval Threshold',
        'Estimated repair cost at or above which a maintenance work order automatically requires financial approval.',
        'PHP',
        0,
        NULL
    ),
    (
        'operations.fuel_efficiency_variance_percent',
        '5',
        'NUMBER',
        'OPERATIONS',
        'Fuel Efficiency Variance Threshold',
        'Percentage variance from fleet average km/L used to classify vehicle fuel efficiency as ABOVE_AVERAGE or BELOW_AVERAGE.',
        '%',
        1,
        50
    ),
    (
        'operations.sos_dedup_window_seconds',
        '60',
        'INTEGER',
        'OPERATIONS',
        'SOS Alert Deduplication Window',
        'Time window in seconds during which repeated SOS emergency alerts from the same driver are deduplicated.',
        'seconds',
        5,
        3600
    ),
    (
        'inventory.canisters_per_crate',
        '24',
        'INTEGER',
        'INVENTORY',
        'Canisters per Crate',
        'Number of canister units per crate used to compute crate counts in inventory summaries.',
        'units',
        1,
        100
    ),
    (
        'schedules.max_generation_days',
        '31',
        'INTEGER',
        'SCHEDULES',
        'Max Schedule Generation Days',
        'Maximum date range in days allowed when bulk-generating daily truck schedules from weekly templates.',
        'days',
        1,
        365
    )
ON CONFLICT ("key") DO NOTHING;

-- 3. Add Admin-only RBAC permissions
INSERT INTO "permissions" ("name", "description")
VALUES
    ('settings.view', 'View organization business system settings and variable configurations.'),
    ('settings.manage', 'Update organization business system settings and variable configurations.')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN ('settings.view', 'settings.manage')
WHERE r."name" IN ('Super Admin', 'Admin')
ON CONFLICT DO NOTHING;

-- 4. Drop static generated column pm_due_flag from vehicles
ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "pm_due_flag";

COMMIT;
