-- ============================================================
-- Migration 022: Finalize Canonical Roles & RBAC Permissions Matrix
-- 1. Ensures all 36 canonical permissions exist.
-- 2. Ensures the 7 canonical roles exist with updated descriptions.
-- 3. Migrates any user/user_roles references from legacy alias roles
--    ('Fleet Manager' -> 'Logistics Supervisor', 'Sales Manager' -> 'Sales Supervisor')
--    and removes the legacy alias roles.
-- 4. Reconciles exact role_permissions mappings for all 7 canonical roles.
-- ============================================================

BEGIN;

-- 1. Ensure all 36 canonical permissions exist
INSERT INTO "permissions" ("name", "description")
VALUES
    ('dashboard.view', 'View the main operational dashboard.'),
    ('fleet.view', 'View fleet and maintenance overview and vehicle profiles.'),
    ('fleet.view_own', 'View details and maintenance records for own assigned vehicle.'),
    ('fleet.manage', 'Register vehicles, update info, set condition, assign drivers, and manage maintenance.'),
    ('route.view', 'View all route dispatch schedules and trip logs.'),
    ('route.view_own', 'View routes and trip schedules assigned to the current user.'),
    ('route.end_own', 'End an active delivery trip and record final vehicle return odometer reading.'),
    ('route.manage', 'Create, update, assign, and dispatch delivery routes.'),
    ('inventory.view', 'View inventory product catalog and stock levels.'),
    ('inventory.manage', 'Register, update, and deactivate product catalog items.'),
    ('inventory.plant.manage', 'Manage master plant physical stock, supplier restocks, and yard defect quarantines.'),
    ('inventory.vehicle.manage', 'Manage vehicle fleet stock, transfers between plant and trucks, and route reconciliations.'),
    ('sales.view', 'View all sales and customer profiles across the organization.'),
    ('sales.view_own', 'View customer profiles and sales created by the current user.'),
    ('sales.create', 'Register new sales customers and create frontline sales orders.'),
    ('sales.update', 'Update sales customer profiles and sales orders.'),
    ('sales.delete', 'Delete, cancel, or void sales records.'),
    ('delivery.view', 'View all delivery fulfillment transactions.'),
    ('delivery.view_own', 'View delivery fulfillment assigned to the current user.'),
    ('delivery.update', 'Update delivery statuses and completion records.'),
    ('delivery.update_own', 'Update delivery progress assigned to the current user.'),
    ('apprehensions.view', 'View all roadside traffic apprehension records.'),
    ('apprehensions.view_own', 'View roadside apprehensions involving own vehicle or trip.'),
    ('apprehensions.create', 'Record road traffic apprehension with mandatory ticket proof.'),
    ('apprehensions.manage', 'Update, settle, or dispute road apprehension tickets.'),
    ('fuel.view', 'View all vehicle fuel intake records and consumption summaries.'),
    ('fuel.view_own', 'View fuel intake logs for assigned vehicle only.'),
    ('fuel.create', 'Record vehicle fuel intake, cost, and odometer reading.'),
    ('fuel.manage', 'Edit or delete vehicle fuel log records.'),
    ('alerts.view', 'View organizational driver emergency alerts feed.'),
    ('alerts.view_own', 'View own submitted driver emergency alerts.'),
    ('alerts.trigger', 'Single-action mobile emergency alert SOS dispatch.'),
    ('alerts.manage', 'Acknowledge and resolve driver emergency alerts.'),
    ('users.view', 'View employee profiles and user lists.'),
    ('users.manage', 'Create accounts, reset credentials, deactivate, and manage roles & permissions.'),
    ('history.view', 'View system event historical audit logs.')
ON CONFLICT ("name") DO NOTHING;

-- 2. Ensure the 7 canonical roles exist with updated descriptions
INSERT INTO "roles" ("name", "description")
VALUES
    (
        'Super Admin',
        'System owner with unrestricted access. This role cannot be deleted.'
    ),
    (
        'Admin',
        'Administrator with unrestricted access to the system.'
    ),
    (
        'Plant Supervisor',
        'Oversees plant operations, product catalog, cylinder refilling, and master plant inventory.'
    ),
    (
        'Logistics Supervisor',
        'Manages logistics, fleet, route dispatch, vehicle inventory transfers, and operational truck activities.'
    ),
    (
        'Sales Supervisor',
        'Oversees sales, customers, transactions, vehicle stock reconciliation, and delivery fulfillment.'
    ),
    (
        'Sales Person',
        'Handles frontline customer accounts, sales transactions, and deliveries assigned to the user.'
    ),
    (
        'Driver',
        'Vehicle driver assigned to fleet trucks with mobile access for trips, fuel logs, apprehensions, and SOS alerts.'
    )
ON CONFLICT ("name") DO UPDATE SET
    "description" = EXCLUDED."description";

-- 3. Migrate references from legacy alias roles to canonical roles and remove aliases
UPDATE "users"
SET "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'Logistics Supervisor')
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Fleet Manager');

UPDATE "users"
SET "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'Sales Supervisor')
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Sales Manager');

INSERT INTO "user_roles" ("user_id", "role_id", "is_primary", "assigned_at")
SELECT ur."user_id", target_r."id", ur."is_primary", ur."assigned_at"
FROM "user_roles" ur
JOIN "roles" old_r ON ur."role_id" = old_r."id"
JOIN "roles" target_r ON target_r."name" = 'Logistics Supervisor'
WHERE old_r."name" = 'Fleet Manager'
ON CONFLICT ("user_id", "role_id") DO UPDATE SET
    "is_primary" = ("user_roles"."is_primary" OR EXCLUDED."is_primary");

INSERT INTO "user_roles" ("user_id", "role_id", "is_primary", "assigned_at")
SELECT ur."user_id", target_r."id", ur."is_primary", ur."assigned_at"
FROM "user_roles" ur
JOIN "roles" old_r ON ur."role_id" = old_r."id"
JOIN "roles" target_r ON target_r."name" = 'Sales Supervisor'
WHERE old_r."name" = 'Sales Manager'
ON CONFLICT ("user_id", "role_id") DO UPDATE SET
    "is_primary" = ("user_roles"."is_primary" OR EXCLUDED."is_primary");

DELETE FROM "user_roles"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" IN ('Fleet Manager', 'Sales Manager'));

DELETE FROM "role_permissions"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" IN ('Fleet Manager', 'Sales Manager'));

DELETE FROM "roles"
WHERE "name" IN ('Fleet Manager', 'Sales Manager');

-- 4. Reset and re-apply exact finalized role_permissions for all 7 canonical roles
DELETE FROM "role_permissions"
WHERE "role_id" IN (
    SELECT "id" FROM "roles"
    WHERE "name" IN (
        'Super Admin',
        'Admin',
        'Plant Supervisor',
        'Logistics Supervisor',
        'Sales Supervisor',
        'Sales Person',
        'Driver'
    )
);

-- 4.1 Super Admin (all permissions)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'Super Admin'
ON CONFLICT DO NOTHING;

-- 4.2 Admin (all permissions)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'Admin'
ON CONFLICT DO NOTHING;

-- 4.3 Plant Supervisor
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN (
    'dashboard.view',
    'inventory.view',
    'inventory.manage',
    'inventory.plant.manage',
    'route.view',
    'history.view'
)
WHERE r."name" = 'Plant Supervisor'
ON CONFLICT DO NOTHING;

-- 4.4 Logistics Supervisor
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN (
    'dashboard.view',
    'fleet.view',
    'fleet.view_own',
    'fleet.manage',
    'route.view',
    'route.end_own',
    'route.manage',
    'inventory.view',
    'inventory.vehicle.manage',
    'delivery.view',
    'delivery.update',
    'apprehensions.view',
    'apprehensions.view_own',
    'apprehensions.create',
    'apprehensions.manage',
    'fuel.view',
    'fuel.view_own',
    'fuel.create',
    'fuel.manage',
    'alerts.view',
    'alerts.view_own',
    'alerts.trigger',
    'alerts.manage',
    'history.view'
)
WHERE r."name" = 'Logistics Supervisor'
ON CONFLICT DO NOTHING;

-- 4.5 Sales Supervisor
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN (
    'dashboard.view',
    'route.view',
    'inventory.view',
    'inventory.vehicle.manage',
    'sales.view',
    'sales.create',
    'sales.update',
    'sales.delete',
    'delivery.view',
    'delivery.update',
    'history.view'
)
WHERE r."name" = 'Sales Supervisor'
ON CONFLICT DO NOTHING;

-- 4.6 Sales Person
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN (
    'dashboard.view',
    'route.view_own',
    'sales.view_own',
    'sales.create',
    'sales.update',
    'delivery.view_own',
    'delivery.update_own'
)
WHERE r."name" = 'Sales Person'
ON CONFLICT DO NOTHING;

-- 4.7 Driver
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN (
    'fleet.view_own',
    'route.view_own',
    'route.end_own',
    'apprehensions.create',
    'apprehensions.view_own',
    'fuel.create',
    'fuel.view_own',
    'alerts.trigger',
    'alerts.view_own'
)
WHERE r."name" = 'Driver'
ON CONFLICT DO NOTHING;

COMMIT;
