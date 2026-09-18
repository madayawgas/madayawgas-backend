-- ============================================================
-- Migration 007: Multi-Role Architecture & Org Chart Roles Alignment
-- 1. Creates 'user_roles' junction table for many-to-many user-role assignment.
-- 2. Backfills 'user_roles' from existing 'users.role_id'.
-- 3. Adds 'Plant Supervisor' role (permissions pending plant subsystem implementation).
-- 4. Aligns 'Fleet Manager' -> 'Logistics Supervisor' and 'Sales Manager' -> 'Sales Supervisor'.
-- ============================================================

-- 1. Create user_roles junction table
CREATE TABLE IF NOT EXISTS "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("user_id", "role_id"),

    CONSTRAINT "FK_user_roles_user_id"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
        ON DELETE CASCADE,

    CONSTRAINT "FK_user_roles_role_id"
        FOREIGN KEY ("role_id")
        REFERENCES "roles"("id")
        ON DELETE RESTRICT
);

-- Indexes for fast query lookup in authorization and session validation
CREATE INDEX IF NOT EXISTS "idx_user_roles_user_id" ON "user_roles" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_roles_role_id" ON "user_roles" ("role_id");

-- 2. Backfill user_roles using existing users.role_id
INSERT INTO "user_roles" ("user_id", "role_id", "is_primary")
SELECT "id", "role_id", TRUE
FROM "users"
WHERE "role_id" IS NOT NULL
ON CONFLICT ("user_id", "role_id") DO NOTHING;

-- 3. Insert Plant Supervisor role (no permissions assigned yet, placeholder for plant subsystem)
INSERT INTO "roles" ("name", "description")
VALUES (
    'Plant Supervisor',
    'Oversees plant operations, cylinder refilling, and plant inventory. Permissions pending plant subsystem implementation.'
)
ON CONFLICT ("name") DO NOTHING;

-- 4. Ensure Fleet Manager and Logistics Supervisor exist
INSERT INTO "roles" ("name", "description")
VALUES
    ('Logistics Supervisor', 'Manages logistics, fleet, route dispatch, and operational truck activities.'),
    ('Fleet Manager', 'Manages fleet, route dispatch, and operational activities.')
ON CONFLICT ("name") DO NOTHING;

-- 5. Ensure Sales Supervisor and Sales Manager exist
INSERT INTO "roles" ("name", "description")
VALUES
    ('Sales Supervisor', 'Oversees sales, customers, transactions, inventory products, and delivery fulfillment.'),
    ('Sales Manager', 'Oversees sales, customers, transactions, inventory products, and delivery fulfillment.')
ON CONFLICT ("name") DO NOTHING;

-- 6. Assign default permissions to Logistics Supervisor and Fleet Manager
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT
    r.id,
    p.id
FROM "roles" r
JOIN "permissions" p
    ON p.name IN (
        -- Dashboard
        'dashboard.view',

        -- Fleet & Maintenance
        'fleet.view',
        'fleet.manage',

        -- Route Dispatch
        'route.view',
        'route.manage',

        -- Deliveries
        'delivery.view',
        'delivery.update',

        -- History Logs
        'history.view'
    )
WHERE r.name IN ('Logistics Supervisor', 'Fleet Manager')
ON CONFLICT DO NOTHING;

-- 7. Assign default permissions to Sales Supervisor and Sales Manager
-- Delete any erroneous sales.create assigned during migration
DELETE FROM "role_permissions"
WHERE role_id IN (SELECT id FROM "roles" WHERE name IN ('Sales Manager', 'Sales Supervisor'))
  AND permission_id IN (SELECT id FROM "permissions" WHERE name = 'sales.create');

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT
    r.id,
    p.id
FROM "roles" r
JOIN "permissions" p
    ON p.name IN (
        -- Dashboard
        'dashboard.view',

        -- Inventory
        'inventory.view',
        'inventory.manage',

        -- Sales
        'sales.view',
        'sales.update',
        'sales.delete',

        -- Deliveries
        'delivery.view',
        'delivery.update',

        -- History Logs
        'history.view'
    )
WHERE r.name IN ('Sales Supervisor', 'Sales Manager')
ON CONFLICT DO NOTHING;
