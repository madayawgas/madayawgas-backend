-- ============================================================
-- INVENTORY PRODUCTS SEED
-- Seed product catalog: Butane Canisters (Main Product),
-- 11kg LPG Cylinders, and 22kg LPG Cylinders
-- ============================================================

INSERT INTO products (id, name, category, container_type, net_weight_kg, is_active)
VALUES
    (
        '33333333-3333-3333-3333-000000000001',
        'Butane Canister 250g',
        'Canister',
        'CANISTER',
        0.250,
        TRUE
    ),
    (
        '33333333-3333-3333-3333-000000000002',
        '11kg LPG Cylinder',
        'LPG Cylinder',
        'CYLINDER',
        11.000,
        TRUE
    ),
    (
        '33333333-3333-3333-3333-000000000003',
        '22kg LPG Cylinder',
        'LPG Cylinder',
        'CYLINDER',
        22.000,
        TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    container_type = EXCLUDED.container_type,
    net_weight_kg = EXCLUDED.net_weight_kg,
    is_active = EXCLUDED.is_active;
