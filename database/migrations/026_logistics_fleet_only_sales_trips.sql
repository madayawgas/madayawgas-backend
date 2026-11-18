-- ============================================================
-- Migration 026: Restrict Logistics Supervisor to Fleet-Only &
--                Transfer Trip/Dispatch Management to Sales Supervisor
-- 1. Updates role descriptions for Logistics Supervisor and Sales Supervisor.
-- 2. Removes route, inventory, and delivery permissions from Logistics Supervisor.
-- 3. Grants 'route.manage' to Sales Supervisor.
-- ============================================================

BEGIN;

-- 1. Update canonical role descriptions
UPDATE "roles"
SET "description" = 'Manages fleet, vehicles, maintenance, and operational truck activities (fuel, apprehensions, SOS alerts).'
WHERE "name" = 'Logistics Supervisor';

UPDATE "roles"
SET "description" = 'Oversees sales, customers, transactions, route dispatch, vehicle stock reconciliation, and delivery fulfillment.'
WHERE "name" = 'Sales Supervisor';

-- 2. Remove trip, dispatch, vehicle stock, inventory, and delivery permissions from Logistics Supervisor
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND r."name" = 'Logistics Supervisor'
  AND p."name" IN (
    'route.view',
    'route.end_own',
    'route.manage',
    'inventory.view',
    'inventory.vehicle.manage',
    'delivery.view',
    'delivery.update'
  );

-- 3. Grant route.manage to Sales Supervisor
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" = 'route.manage'
WHERE r."name" = 'Sales Supervisor'
ON CONFLICT DO NOTHING;

COMMIT;
