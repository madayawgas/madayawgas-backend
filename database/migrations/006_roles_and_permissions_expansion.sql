-- ============================================================
-- Migration 006: Roles and Permissions Expansion
-- Adds 'Sales Manager' and 'Driver' roles, and assigns default
-- permissions to 'Sales Manager'.
-- ============================================================

-- 1. Insert Sales Manager and Driver roles if they do not exist
INSERT INTO roles (name, description)
VALUES
    (
        'Sales Manager',
        'Oversees sales, customers, transactions, inventory products, and delivery fulfillment.'
    ),
    (
        'Driver',
        'Vehicle driver assigned to fleet trucks. Does not have login/system permissions.'
    )
ON CONFLICT (name) DO NOTHING;

-- 2. Assign default permissions to Sales Manager
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
WHERE r.name = 'Sales Manager'
ON CONFLICT DO NOTHING;
