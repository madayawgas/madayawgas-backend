-- ============================================================
-- RBAC SEED
-- Roles, Permissions, and Role-Permissions
-- ============================================================


-- ============================================================
-- 1. ROLES
-- ============================================================

INSERT INTO roles (name, description)
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
        'Fleet Manager',
        'Manages fleet, route dispatch, and operational activities.'
    ),
    (
        'Sales Person',
        'Handles sales and deliveries assigned to the user.'
    )
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- 2. PERMISSIONS
-- ============================================================

INSERT INTO permissions (name, description)
VALUES

    -- --------------------------------------------------------
    -- Dashboard
    -- --------------------------------------------------------

    (
        'dashboard.view',
        'View the dashboard.'
    ),


    -- --------------------------------------------------------
    -- Fleet & Maintenance
    -- --------------------------------------------------------

    (
        'fleet.view',
        'View fleet and maintenance information.'
    ),
    (
        'fleet.manage',
        'Create, update, and manage fleet and maintenance records.'
    ),


    -- --------------------------------------------------------
    -- Route Dispatch
    -- --------------------------------------------------------

    (
        'route.view',
        'View route dispatch information.'
    ),
    (
        'route.view_own',
        'View routes assigned to the current user.'
    ),
    (
        'route.manage',
        'Create, update, assign, and manage routes.'
    ),


    -- --------------------------------------------------------
    -- Inventory
    -- --------------------------------------------------------

    (
        'inventory.view',
        'View inventory information.'
    ),
    (
        'inventory.manage',
        'Create, update, and manage inventory.'
    ),


    -- --------------------------------------------------------
    -- Sales & Delivery
    -- --------------------------------------------------------

    (
        'sales.view',
        'View sales records.'
    ),
    (
        'sales.view_own',
        'View sales created by the current user.'
    ),
    (
        'sales.create',
        'Create sales records.'
    ),
    (
        'sales.update',
        'Update sales records.'
    ),
    (
        'sales.delete',
        'Delete or cancel sales records.'
    ),

    (
        'delivery.view',
        'View delivery records.'
    ),
    (
        'delivery.view_own',
        'View deliveries assigned to the current user.'
    ),
    (
        'delivery.update',
        'Update delivery status and information.'
    ),
    (
        'delivery.update_own',
        'Update delivery information assigned to the current user.'
    ),


    -- --------------------------------------------------------
    -- User Management
    -- --------------------------------------------------------

    (
        'users.view',
        'View user accounts.'
    ),
    (
        'users.manage',
        'Create, update, deactivate, block, and manage user accounts.'
    )


ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- 3. SUPER ADMIN
-- ============================================================
-- Super Admin receives every permission.

INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 4. ADMIN
-- ============================================================
-- Admin also receives every permission.
-- The distinction between Admin and Super Admin is therefore
-- enforced by application rules, such as:
--
--   - Super Admin cannot be deleted
--   - Super Admin may be protected from modification
--
-- rather than by normal functional permissions.

INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Admin'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 5. FLEET MANAGER
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
JOIN permissions p
    ON p.name IN (

        -- Dashboard
        'dashboard.view',

        -- Fleet & Maintenance
        'fleet.view',
        'fleet.manage',

        -- Route Dispatch
        'route.view',
        'route.manage',

        -- Inventory
        'inventory.view',

        -- Sales & Delivery
        'sales.view',
        'delivery.view'

    )
WHERE r.name = 'Fleet Manager'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 6. SALES PERSON
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
JOIN permissions p
    ON p.name IN (

        -- Dashboard
        'dashboard.view',

        -- Route Dispatch
        -- Only the user's assigned route
        'route.view_own',

        -- Sales
        'sales.view_own',
        'sales.create',
        'sales.update',

        -- Deliveries
        'delivery.view_own',
        'delivery.update_own'

    )
WHERE r.name = 'Sales Person'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 7. INITIAL SUPER ADMIN ACCOUNT
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'superadmin',
    '$2b$10$0axa4jTJYzHFEpL2wKKOq.HDDez0ahaSATrPZJIhdD2LM7M.w2yFy',
    'Super',
    'Admin',
    '+639170000001',
    r.id,
    TRUE,
    FALSE,
    FALSE
FROM roles r
WHERE r.name = 'Super Admin'
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    phone = EXCLUDED.phone,
    must_change_password = FALSE;


-- ============================================================
-- 8. SAMPLE ADMIN ACCOUNT
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'admin_user',
    '$2b$10$FzzQKJciH89gnOyNK12FuOZmZMIDa/0Ak/y42YK8J4SHoDKHugtoi',
    'System',
    'Admin',
    '+639170000002',
    r.id,
    TRUE,
    FALSE,
    FALSE
FROM roles r
WHERE r.name = 'Admin'
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    phone = EXCLUDED.phone,
    must_change_password = FALSE;


-- ============================================================
-- 9. SAMPLE FLEET MANAGER ACCOUNT
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'fleet_user',
    '$2b$10$JGOSJIBM8.zjWXuPD8a/cugoMZRdw7Fpfwx./wVyaxStzwqTweZU.',
    'Carlos',
    'Fleet',
    '+639170000003',
    r.id,
    TRUE,
    FALSE,
    FALSE
FROM roles r
WHERE r.name = 'Fleet Manager'
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    phone = EXCLUDED.phone,
    must_change_password = FALSE;


-- ============================================================
-- 10. SAMPLE SALES PERSON ACCOUNT
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'sales_user',
    '$2b$10$eGYcRPDQYEBlyxHUPkP6yeZexdeaguo/JoeJ.W2yinWo2f4BcF.I.',
    'Juan',
    'Sales',
    '+639170000004',
    r.id,
    TRUE,
    FALSE,
    FALSE
FROM roles r
WHERE r.name = 'Sales Person'
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    phone = EXCLUDED.phone,
    must_change_password = FALSE;

