-- ============================================================
-- Migration 018: Complete Removal of Driver Attendance Feature
-- Drops duty_attendance table and associated objects,
-- and purges attendance permissions and role assignments.
-- ============================================================

BEGIN;

-- 1. Drop duty attendance table and dependent objects (indexes, triggers)
DROP TABLE IF EXISTS "duty_attendance" CASCADE;

-- 2. Remove role permission bindings for attendance
DELETE FROM "role_permissions"
WHERE "permission_id" IN (
    SELECT "id" FROM "permissions"
    WHERE "name" IN (
        'attendance.view',
        'attendance.view_own',
        'attendance.record',
        'attendance.manage'
    )
);

-- 3. Delete attendance permissions from permissions catalog
DELETE FROM "permissions"
WHERE "name" IN (
    'attendance.view',
    'attendance.view_own',
    'attendance.record',
    'attendance.manage'
);

COMMIT;
