-- ============================================================
-- INVENTORY PRODUCTS SEED
-- Seed product catalog: Butane Canisters (Main Product),
-- 11kg LPG Cylinders, and 22kg LPG Cylinders
-- ============================================================

INSERT INTO products (name, category, container_type, net_weight_kg, unit_price, is_active)
VALUES
    (
        'Butane Canister 250g',
        'Canister',
        'CANISTER',
        0.250,
        95.00,
        TRUE
    ),
    (
        'Butane Canister 170g',
        'Canister',
        'CANISTER',
        0.170,
        75.00,
        TRUE
    ),
    (
        '11kg LPG Cylinder',
        'LPG Cylinder',
        'CYLINDER',
        11.000,
        980.00,
        TRUE
    ),
    (
        '22kg LPG Cylinder',
        'LPG Cylinder',
        'CYLINDER',
        22.000,
        1950.00,
        TRUE
    ),
    (
        '50kg LPG Cylinder',
        'LPG Cylinder',
        'CYLINDER',
        50.000,
        3950.00,
        TRUE
    )
ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    container_type = EXCLUDED.container_type,
    net_weight_kg = EXCLUDED.net_weight_kg,
    unit_price = EXCLUDED.unit_price,
    is_active = EXCLUDED.is_active;
