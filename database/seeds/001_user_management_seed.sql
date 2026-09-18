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
        'Plant Supervisor',
        'Oversees plant operations, cylinder refilling, and plant inventory. Permissions pending plant subsystem implementation.'
    ),
    (
        'Logistics Supervisor',
        'Manages logistics, fleet, route dispatch, and operational truck activities.'
    ),
    (
        'Sales Supervisor',
        'Oversees sales, customers, transactions, and delivery fulfillment.'
    ),
    (
        'Fleet Manager',
        'Legacy alias for Logistics Supervisor. Manages fleet, route dispatch, and operational activities.'
    ),
    (
        'Sales Manager',
        'Legacy alias for Sales Supervisor. Oversees sales, customers, transactions, inventory products, and delivery fulfillment.'
    ),
    (
        'Sales Person',
        'Handles sales and deliveries assigned to the user.'
    ),
    (
        'Driver',
        'Vehicle driver assigned to fleet trucks. Does not have login/system permissions.'
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
    ),


    -- --------------------------------------------------------
    -- System Event History Logs
    -- --------------------------------------------------------

    (
        'history.view',
        'View system event history logs.'
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

INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Admin'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 5. PLANT SUPERVISOR
-- ============================================================
-- Plant Supervisor oversees plant operations, cylinder refilling,
-- and plant inventory. No permissions are assigned yet (placeholder
-- for future plant operations and inventory subsystem implementation).


-- ============================================================
-- 6. LOGISTICS SUPERVISOR (and legacy Fleet Manager)
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

        -- Deliveries
        'delivery.view',
        'delivery.update',

        -- History Logs
        'history.view'

    )
WHERE r.name IN ('Logistics Supervisor', 'Fleet Manager')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 7. SALES SUPERVISOR (and legacy Sales Manager)
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


-- ============================================================
-- 7. SALES PERSON
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
-- 8. DRIVER
-- ============================================================
-- Driver does not have login credentials or system permissions.


-- ============================================================
-- 9. INITIAL SUPER ADMIN ACCOUNT
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
-- 10. SAMPLE ADMIN ACCOUNT
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
-- 11. SAMPLE LOGISTICS SUPERVISOR ACCOUNT
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'logistics_supervisor',
    '$2b$10$NyLLNftp8wfMY4Df7m.QlO.kwjdsplUTBepucbswgz2rXSq/nr.wO',
    'Carlos',
    'Logistics',
    '+639170000003',
    r.id,
    TRUE,
    FALSE,
    FALSE
FROM roles r
WHERE r.name = 'Logistics Supervisor'
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    phone = EXCLUDED.phone,
    role_id = EXCLUDED.role_id,
    must_change_password = FALSE;


-- ============================================================
-- 12. SAMPLE SALES SUPERVISOR ACCOUNT
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'sales_supervisor',
    '$2b$10$h6cUCFj3jDW5RyReECnBaesvsae7WuKpWEJTd8pXyuhSC2yiosJfK',
    'Elena',
    'Supervisor',
    '+639170000006',
    r.id,
    TRUE,
    FALSE,
    FALSE
FROM roles r
WHERE r.name = 'Sales Supervisor'
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    phone = EXCLUDED.phone,
    role_id = EXCLUDED.role_id,
    must_change_password = FALSE;


-- ============================================================
-- 13. SAMPLE SALES PERSON ACCOUNT
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


-- ============================================================
-- 14. SAMPLE DRIVER ACCOUNT
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'driver_user',
    '$2b$10$3clbX9EqLvdbCduxDMC8G.DSkCKgvV6W2lB8yD3P.skKKRIOrGOL2',
    'Danilo',
    'Driver',
    '+639170000005',
    r.id,
    TRUE,
    FALSE,
    FALSE
FROM roles r
WHERE r.name = 'Driver'
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    phone = EXCLUDED.phone,
    must_change_password = FALSE;


-- ============================================================
-- 15. SAMPLE PLANT SUPERVISOR ACCOUNT
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'plant_user',
    '$2b$10$0axa4jTJYzHFEpL2wKKOq.HDDez0ahaSATrPZJIhdD2LM7M.w2yFy',
    'Pedro',
    'Plant',
    '+639170000007',
    r.id,
    TRUE,
    FALSE,
    FALSE
FROM roles r
WHERE r.name = 'Plant Supervisor'
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    phone = EXCLUDED.phone,
    must_change_password = FALSE;


-- ============================================================
-- 16. SAMPLE MULTI-ROLE SUPERVISOR ACCOUNT (Samantha Doe)
-- Holds both Sales Supervisor (primary) and Logistics Supervisor
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'samantha_supervisor',
    '$2b$10$4VxKnRqkfjC2yZMkE4/BzONuL6vYN20ySY2UQi.iQ2qvbruHbj0Rq',
    'Samantha',
    'Doe',
    '+639170000008',
    r.id,
    TRUE,
    FALSE,
    FALSE
FROM roles r
WHERE r.name = 'Sales Supervisor'
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    phone = EXCLUDED.phone,
    must_change_password = FALSE;


-- ============================================================
-- 17. SYNC USER_ROLES JUNCTION TABLE
-- ============================================================

-- Backfill / sync all primary roles
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.id, u.role_id, TRUE
FROM users u
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- Assign Logistics Supervisor as secondary role for samantha_supervisor
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.id, r.id, FALSE
FROM users u
CROSS JOIN roles r
WHERE u.username = 'samantha_supervisor'
  AND r.name = 'Logistics Supervisor'
ON CONFLICT (user_id, role_id) DO NOTHING;


