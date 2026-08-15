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