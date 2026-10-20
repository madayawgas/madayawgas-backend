-- ============================================================
-- Migration 017: Ensure Driver Route Scoping Permissions
-- Idempotently ensures 'route.view_own' exists in permissions
-- and assigns it to 'Driver', 'Super Admin', and 'Admin'.
-- ============================================================

BEGIN;

-- 1. Ensure route.view_own exists in permissions
INSERT INTO "permissions" ("name", "description")
VALUES (
    'route.view_own',
    'View routes and trip schedules assigned to the current user.'
)
ON CONFLICT ("name") DO NOTHING;

-- 2. Grant route.view_own to Driver role
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.name = 'route.view_own'
WHERE r.name = 'Driver'
ON CONFLICT DO NOTHING;

-- 3. Ensure Super Admin and Admin possess route.view_own
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.name = 'route.view_own'
WHERE r.name IN ('Super Admin', 'Admin')
ON CONFLICT DO NOTHING;

COMMIT;
