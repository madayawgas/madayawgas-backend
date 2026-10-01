-- ============================================================
-- PLANT INVENTORY & STOCK ADJUSTMENTS SEED
-- Seed 007: Standardize product catalog (170g Butane & 50kg Cylinder),
-- initialize Bunawan yard bulk inventory balances, and log initial
-- supplier restock adjustment audits.
-- ============================================================

-- 1. Standardize Product Catalog Scope
INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
VALUES
    (
        'Butane Canister 170g',
        'Canister',
        'CANISTER',
        0.170,
        TRUE
    ),
    (
        '50kg LPG Cylinder',
        'LPG Cylinder',
        'CYLINDER',
        50.000,
        TRUE
    )
ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    container_type = EXCLUDED.container_type,
    net_weight_kg = EXCLUDED.net_weight_kg,
    is_active = EXCLUDED.is_active;


-- 2. Populate Initial Plant Bulk Inventory Balances
-- Balances reflect Bunawan yard physical stock
INSERT INTO plant_inventory (product_id, quantity_filled, quantity_empty_good, quantity_defective, last_counted_at)
SELECT 
    p.id,
    CASE 
        WHEN p.name = 'Butane Canister 170g' THEN 2400  -- 100 crates
        WHEN p.name = 'Butane Canister 250g' THEN 2400  -- 100 crates
        WHEN p.name = '11kg LPG Cylinder'    THEN 350
        WHEN p.name = '22kg LPG Cylinder'    THEN 100
        WHEN p.name = '50kg LPG Cylinder'    THEN 80
        ELSE 100
    END AS quantity_filled,
    CASE 
        WHEN p.name LIKE 'Butane Canister%' THEN 480    -- 20 crates
        WHEN p.name = '11kg LPG Cylinder'    THEN 120
        WHEN p.name = '22kg LPG Cylinder'    THEN 30
        WHEN p.name = '50kg LPG Cylinder'    THEN 25
        ELSE 20
    END AS quantity_empty_good,
    CASE 
        WHEN p.name LIKE 'Butane Canister%' THEN 24     -- 1 crate
        WHEN p.name = '11kg LPG Cylinder'    THEN 15
        WHEN p.name = '22kg LPG Cylinder'    THEN 5
        WHEN p.name = '50kg LPG Cylinder'    THEN 5
        ELSE 5
    END AS quantity_defective,
    NOW()
FROM products p
WHERE p.is_active = TRUE
  AND p.name NOT LIKE 'TEST-%'
  AND p.name NOT LIKE 'test_%'
ON CONFLICT (product_id) DO UPDATE SET

    quantity_filled = EXCLUDED.quantity_filled,
    quantity_empty_good = EXCLUDED.quantity_empty_good,
    quantity_defective = EXCLUDED.quantity_defective,
    last_counted_at = NOW(),
    updated_at = NOW();


-- 3. Seed Sample Plant Stock Adjustments (Initial Supplier Purchase Audit)
INSERT INTO plant_stock_adjustments (
    product_id,
    recorded_by,
    adjustment_type,
    target_condition,
    delta_quantity,
    supplier_invoice_number,
    reason,
    recorded_at
)
SELECT 
    p.id,
    u.id,
    'SUPPLIER_PURCHASE'::plant_adjustment_type,
    'FILLED'::stock_condition,
    CASE 
        WHEN p.name = 'Butane Canister 170g' THEN 2400
        WHEN p.name = '11kg LPG Cylinder'    THEN 350
        WHEN p.name = '50kg LPG Cylinder'    THEN 80
        ELSE 100
    END,
    'INV-SUP-2026-001',
    'Initial supplier bulk delivery stock-in at Bunawan refilling plant',
    NOW()
FROM products p
CROSS JOIN (
    SELECT id FROM users WHERE username = 'plant_user' LIMIT 1
) u
WHERE p.name IN ('Butane Canister 170g', '11kg LPG Cylinder', '50kg LPG Cylinder')
  AND NOT EXISTS (
    SELECT 1 FROM plant_stock_adjustments 
    WHERE supplier_invoice_number = 'INV-SUP-2026-001' AND product_id = p.id
);


-- 4. Grant Plant Supervisor permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
    'dashboard.view',
    'inventory.view',
    'inventory.manage',
    'route.view',
    'history.view'
)
WHERE r.name = 'Plant Supervisor'
ON CONFLICT DO NOTHING;

