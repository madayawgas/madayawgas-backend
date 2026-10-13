-- ============================================================
-- Migration 013: Plant and Vehicle Stock Permissions Refactoring
-- Separates master physical plant stock management from vehicle fleet stock management.
-- 1. Adds 'inventory.plant.manage' and 'inventory.vehicle.manage' permissions.
-- 2. Grants 'inventory.plant.manage' to Plant Supervisor, Admin, Super Admin.
-- 3. Grants 'inventory.vehicle.manage' to Sales Supervisor, Logistics Supervisor, Admin, Super Admin.
-- 4. Revokes 'inventory.manage' from Plant Supervisor and Sales Supervisor/Manager so product catalog CRUD is restricted to Admins.
-- ============================================================

-- 1. Insert new granular permissions
INSERT INTO "permissions" ("name", "description")
VALUES
    (
        'inventory.plant.manage',
        'Manage master plant physical stock, supplier restocks, and yard defect quarantines.'
    ),
    (
        'inventory.vehicle.manage',
        'Manage vehicle fleet stock, transfers between plant and trucks, and route reconciliations.'
    )
ON CONFLICT ("name") DO NOTHING;

-- 2. Assign permissions to Super Admin and Admin (receive all permissions)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT
    r.id,
    p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name IN ('Super Admin', 'Admin')
  AND p.name IN ('inventory.plant.manage', 'inventory.vehicle.manage')
ON CONFLICT DO NOTHING;

-- 3. Update Plant Supervisor permissions
-- Add inventory.plant.manage
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT
    r.id,
    p.id
FROM "roles" r
JOIN "permissions" p
    ON p.name = 'inventory.plant.manage'
WHERE r.name = 'Plant Supervisor'
ON CONFLICT DO NOTHING;

-- Remove broad inventory.manage from Plant Supervisor
DELETE FROM "role_permissions"
WHERE role_id IN (SELECT id FROM "roles" WHERE name = 'Plant Supervisor')
  AND permission_id IN (SELECT id FROM "permissions" WHERE name = 'inventory.manage');

-- 4. Update Sales Supervisor & Sales Manager permissions
-- Add inventory.vehicle.manage
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT
    r.id,
    p.id
FROM "roles" r
JOIN "permissions" p
    ON p.name = 'inventory.vehicle.manage'
WHERE r.name IN ('Sales Supervisor', 'Sales Manager')
ON CONFLICT DO NOTHING;

-- Remove broad inventory.manage from Sales Supervisor & Sales Manager
DELETE FROM "role_permissions"
WHERE role_id IN (SELECT id FROM "roles" WHERE name IN ('Sales Supervisor', 'Sales Manager'))
  AND permission_id IN (SELECT id FROM "permissions" WHERE name = 'inventory.manage');

-- 5. Update Logistics Supervisor & Fleet Manager permissions
-- Add inventory.vehicle.manage
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT
    r.id,
    p.id
FROM "roles" r
JOIN "permissions" p
    ON p.name = 'inventory.vehicle.manage'
WHERE r.name IN ('Logistics Supervisor', 'Fleet Manager')
ON CONFLICT DO NOTHING;
