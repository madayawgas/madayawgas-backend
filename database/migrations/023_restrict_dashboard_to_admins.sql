-- ============================================================
-- Migration 023: Restrict dashboard.view to Super Admin & Admin
-- Removes dashboard.view from supervisor and frontline roles.
-- ============================================================

BEGIN;

DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND p."name" = 'dashboard.view'
  AND r."name" IN (
    'Plant Supervisor',
    'Logistics Supervisor',
    'Sales Supervisor',
    'Sales Person',
    'Driver'
  );

-- Ensure Super Admin and Admin retain dashboard.view
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" = 'dashboard.view'
WHERE r."name" IN ('Super Admin', 'Admin')
ON CONFLICT DO NOTHING;

COMMIT;
