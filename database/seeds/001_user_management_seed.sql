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
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description;

-- Clean up legacy alias roles if present
UPDATE users
SET role_id = (SELECT id FROM roles WHERE name = 'Logistics Supervisor')
WHERE role_id IN (SELECT id FROM roles WHERE name = 'Fleet Manager');

UPDATE users
SET role_id = (SELECT id FROM roles WHERE name = 'Sales Supervisor')
WHERE role_id IN (SELECT id FROM roles WHERE name = 'Sales Manager');

INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
SELECT ur.user_id, target_r.id, ur.is_primary, ur.assigned_at
FROM user_roles ur
JOIN roles old_r ON ur.role_id = old_r.id
JOIN roles target_r ON target_r.name = 'Logistics Supervisor'
WHERE old_r.name = 'Fleet Manager'
ON CONFLICT (user_id, role_id) DO UPDATE SET
    is_primary = (user_roles.is_primary OR EXCLUDED.is_primary);

INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
SELECT ur.user_id, target_r.id, ur.is_primary, ur.assigned_at
FROM user_roles ur
JOIN roles old_r ON ur.role_id = old_r.id
JOIN roles target_r ON target_r.name = 'Sales Supervisor'
WHERE old_r.name = 'Sales Manager'
ON CONFLICT (user_id, role_id) DO UPDATE SET
    is_primary = (user_roles.is_primary OR EXCLUDED.is_primary);

DELETE FROM user_roles
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('Fleet Manager', 'Sales Manager'));

DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('Fleet Manager', 'Sales Manager'));

DELETE FROM roles
WHERE name IN ('Fleet Manager', 'Sales Manager');


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
        'View the main operational dashboard.'
    ),


    -- --------------------------------------------------------
    -- Fleet & Maintenance
    -- --------------------------------------------------------

    (
        'fleet.view',
        'View fleet and maintenance overview and vehicle profiles.'
    ),
    (
        'fleet.view_own',
        'View details and maintenance records for own assigned vehicle.'
    ),
    (
        'fleet.manage',
        'Register vehicles, update info, set condition, assign drivers, and manage maintenance.'
    ),


    -- --------------------------------------------------------
    -- Route Dispatch
    -- --------------------------------------------------------

    (
        'route.view',
        'View all route dispatch schedules and trip logs.'
    ),
    (
        'route.view_own',
        'View routes and trip schedules assigned to the current user.'
    ),
    (
        'route.end_own',
        'End an active delivery trip and record final vehicle return odometer reading.'
    ),
    (
        'route.manage',
        'Create, update, assign, and dispatch delivery routes.'
    ),


    -- --------------------------------------------------------
    -- Inventory
    -- --------------------------------------------------------

    (
        'inventory.view',
        'View inventory product catalog and stock levels.'
    ),
    (
        'inventory.manage',
        'Register, update, and deactivate product catalog items.'
    ),
    (
        'inventory.plant.manage',
        'Manage master plant physical stock, supplier restocks, and yard defect quarantines.'
    ),
    (
        'inventory.vehicle.manage',
        'Manage vehicle fleet stock, transfers between plant and trucks, and route reconciliations.'
    ),


    -- --------------------------------------------------------
    -- Sales & Delivery
    -- --------------------------------------------------------

    (
        'sales.view',
        'View all sales and customer profiles across the organization.'
    ),
    (
        'sales.view_own',
        'View customer profiles and sales created by the current user.'
    ),
    (
        'sales.create',
        'Register new sales customers and create frontline sales orders.'
    ),
    (
        'sales.update',
        'Update sales customer profiles and sales orders.'
    ),
    (
        'sales.delete',
        'Delete, cancel, or void sales records.'
    ),

    (
        'delivery.view',
        'View all delivery fulfillment transactions.'
    ),
    (
        'delivery.view_own',
        'View delivery fulfillment assigned to the current user.'
    ),
    (
        'delivery.update',
        'Update delivery statuses and completion records.'
    ),
    (
        'delivery.update_own',
        'Update delivery progress assigned to the current user.'
    ),


    -- --------------------------------------------------------
    -- Operational Logging (Apprehensions, Fuel, Emergency Alerts)
    -- --------------------------------------------------------

    (
        'apprehensions.view',
        'View all roadside traffic apprehension records.'
    ),
    (
        'apprehensions.view_own',
        'View roadside apprehensions involving own vehicle or trip.'
    ),
    (
        'apprehensions.create',
        'Record road traffic apprehension with mandatory ticket proof.'
    ),
    (
        'apprehensions.manage',
        'Update, settle, or dispute road apprehension tickets.'
    ),

    (
        'fuel.view',
        'View all vehicle fuel intake records and consumption summaries.'
    ),
    (
        'fuel.view_own',
        'View fuel intake logs for assigned vehicle only.'
    ),
    (
        'fuel.create',
        'Record vehicle fuel intake, cost, and odometer reading.'
    ),
    (
        'fuel.manage',
        'Edit or delete vehicle fuel log records.'
    ),

    (
        'alerts.view',
        'View organizational driver emergency alerts feed.'
    ),
    (
        'alerts.view_own',
        'View own submitted driver emergency alerts.'
    ),
    (
        'alerts.trigger',
        'Single-action mobile emergency alert SOS dispatch.'
    ),
    (
        'alerts.manage',
        'Acknowledge and resolve driver emergency alerts.'
    ),


    -- --------------------------------------------------------
    -- User Management
    -- --------------------------------------------------------

    (
        'users.view',
        'View employee profiles and user lists.'
    ),
    (
        'users.manage',
        'Create accounts, reset credentials, deactivate, and manage roles & permissions.'
    ),


    -- --------------------------------------------------------
    -- System Event History Logs
    -- --------------------------------------------------------

    (
        'history.view',
        'View system event historical audit logs.'
    )


ON CONFLICT (name) DO NOTHING;


-- Reset existing role_permissions for the 7 canonical roles
DELETE FROM role_permissions
WHERE role_id IN (
    SELECT id FROM roles
    WHERE name IN (
        'Super Admin',
        'Admin',
        'Plant Supervisor',
        'Logistics Supervisor',
        'Sales Supervisor',
        'Sales Person',
        'Driver'
    )
);


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
-- Plant Supervisor oversees plant operations, product catalog,
-- cylinder refilling, and master plant inventory.

INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
JOIN permissions p
    ON p.name IN (
        -- Dashboard
        'dashboard.view',

        -- Inventory & Product Catalog
        'inventory.view',
        'inventory.manage',
        'inventory.plant.manage',

        -- Routes (view returning trips for yard return-unloads)
        'route.view',

        -- History Logs
        'history.view'
    )
WHERE r.name = 'Plant Supervisor'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 6. LOGISTICS SUPERVISOR
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
        'fleet.view_own',
        'fleet.manage',

        -- Route Dispatch
        'route.view',
        'route.end_own',
        'route.manage',

        -- Inventory Transfers & Catalog Visibility
        'inventory.view',
        'inventory.vehicle.manage',

        -- Deliveries
        'delivery.view',
        'delivery.update',

        -- Road Apprehensions
        'apprehensions.view',
        'apprehensions.view_own',
        'apprehensions.create',
        'apprehensions.manage',

        -- Vehicle Fuel
        'fuel.view',
        'fuel.view_own',
        'fuel.create',
        'fuel.manage',

        -- Emergency Alerts
        'alerts.view',
        'alerts.view_own',
        'alerts.trigger',
        'alerts.manage',

        -- History Logs
        'history.view'

    )
WHERE r.name = 'Logistics Supervisor'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 7. SALES SUPERVISOR
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

        -- Route Dispatch Visibility
        'route.view',

        -- Inventory & Vehicle Stock Reconciliation
        'inventory.view',
        'inventory.vehicle.manage',

        -- Sales
        'sales.view',
        'sales.create',
        'sales.update',
        'sales.delete',

        -- Deliveries
        'delivery.view',
        'delivery.update',

        -- History Logs
        'history.view'

    )
WHERE r.name = 'Sales Supervisor'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 8. SALES PERSON
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
-- 9. DRIVER
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
JOIN permissions p
    ON p.name IN (
        -- Fleet
        'fleet.view_own',

        -- Route
        'route.view_own',
        'route.end_own',

        -- Apprehensions
        'apprehensions.create',
        'apprehensions.view_own',

        -- Fuel
        'fuel.create',
        'fuel.view_own',

        -- Emergency Alerts
        'alerts.trigger',
        'alerts.view_own'
    )
WHERE r.name = 'Driver'
ON CONFLICT DO NOTHING;


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
    '$2b$10$56nsx0uG2s4z3bnqAdWhj.IUNx2WfuL062gBrrGKzuUOApJEzlGSu',
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
-- 14.1. SAMPLE DRIVER ACCOUNT 2 (Roberto Driver)
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'driver_user2',
    '$2b$10$3clbX9EqLvdbCduxDMC8G.DSkCKgvV6W2lB8yD3P.skKKRIOrGOL2',
    'Roberto',
    'Driver',
    '+639170000009',
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
-- 14.2. SAMPLE DRIVER ACCOUNT 3 (Eduardo Driver)
-- ============================================================

INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
SELECT
    'driver_user3',
    '$2b$10$3clbX9EqLvdbCduxDMC8G.DSkCKgvV6W2lB8yD3P.skKKRIOrGOL2',
    'Eduardo',
    'Driver',
    '+639170000010',
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
    'plant_supervisor',
    '$2b$10$UK0JoGm5oyEYt/ZU8Ed3iuGjjygA7SyzEl5v15Gdq6yA6rmahNlU2',
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
    '$2b$10$/3w/eoUL2RF6hxPSm/CXP.5ewt8h84HjSCjvtAcQkKpVECRxeC8gO',
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


