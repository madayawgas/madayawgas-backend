-- ============================================================
-- PLANT INVENTORY, MOVEMENTS & ROUTE TRANSFERS SEED
-- Seed 007: Standardize product catalog (170g Butane & 50kg Cylinder),
-- initialize Bunawan yard bulk inventory balances, log supplier restocks,
-- yard defect quarantines, physical count adjustments, and historical
-- operational delivery route transfer slips and reconciliations.
-- ============================================================

-- ============================================================
-- 1. Standardize Product Catalog Scope
-- ============================================================
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


-- ============================================================
-- 2. Populate Initial Plant Bulk Inventory Balances
-- Balances reflect Bunawan yard physical stock
-- ============================================================
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


-- ============================================================
-- 3. Seed Initial Plant Stock Adjustments (Initial Supplier Purchase Audit)
-- ============================================================
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
    NOW() - INTERVAL '7 days'
FROM products p
CROSS JOIN (
    SELECT id FROM users WHERE username = 'plant_supervisor' LIMIT 1
) u
WHERE p.name IN ('Butane Canister 170g', '11kg LPG Cylinder', '50kg LPG Cylinder')
  AND NOT EXISTS (
    SELECT 1 FROM plant_stock_adjustments 
    WHERE supplier_invoice_number = 'INV-SUP-2026-001' AND product_id = p.id
);


-- ============================================================
-- 3.1. Additional Realistic Plant Stock Adjustments
-- Varied types: Supplier Restocks, Defect Quarantines & Physical Counts
-- ============================================================

-- A. Supplier Restock from Petron Davao Terminal
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
    200,
    'INV-PET-2026-088',
    'Bulk refilling depot restock: 200 filled 11kg cylinders received via Petron bulk transport',
    NOW() - INTERVAL '5 days'
FROM products p
CROSS JOIN (SELECT id FROM users WHERE username = 'plant_supervisor' LIMIT 1) u
WHERE p.name = '11kg LPG Cylinder'
  AND NOT EXISTS (
    SELECT 1 FROM plant_stock_adjustments WHERE supplier_invoice_number = 'INV-PET-2026-088'
  );

-- B. Defect Quarantine on 170g Butane Canisters (Yard Sniff Test Leakage)
INSERT INTO plant_stock_adjustments (
    product_id,
    recorded_by,
    adjustment_type,
    target_condition,
    source_condition,
    delta_quantity,
    supplier_invoice_number,
    reason,
    recorded_at
)
SELECT
    p.id,
    u.id,
    'DEFECT_ADJUSTMENT'::plant_adjustment_type,
    'DEFECTIVE'::stock_condition,
    'FILLED'::stock_condition,
    8,
    'ADJ-DEF-20261007-01',
    'Yard safety check: 8 units quarantined due to pinhole valve leaks and collar micro-crimping',
    NOW() - INTERVAL '4 days' - INTERVAL '2 hours'
FROM products p
CROSS JOIN (SELECT id FROM users WHERE username = 'plant_supervisor' LIMIT 1) u
WHERE p.name = 'Butane Canister 170g'
  AND NOT EXISTS (
    SELECT 1 FROM plant_stock_adjustments WHERE supplier_invoice_number = 'ADJ-DEF-20261007-01'
  );

-- C. Physical Count Reconciliation on 22kg LPG Cylinders (Overflow Bay Surplus)
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
    'PHYSICAL_COUNT'::plant_adjustment_type,
    'FILLED'::stock_condition,
    2,
    'ADJ-CNT-20261008-01',
    'Physical audit reconciliation: 2 filled 22kg cylinders located in overflow bay 3B after sorting',
    NOW() - INTERVAL '3 days' - INTERVAL '4 hours'
FROM products p
CROSS JOIN (SELECT id FROM users WHERE username = 'plant_supervisor' LIMIT 1) u
WHERE p.name = '22kg LPG Cylinder'
  AND NOT EXISTS (
    SELECT 1 FROM plant_stock_adjustments WHERE supplier_invoice_number = 'ADJ-CNT-20261008-01'
  );

-- D. Supplier Procurement Shipment from Pryce Gases (50 crates 250g Butane)
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
    1200,
    'INV-PRY-2026-312',
    'Procurement shipment: 50 crates (1,200 units) factory-filled 250g butane canisters received from Pryce Gases',
    NOW() - INTERVAL '3 days'
FROM products p
CROSS JOIN (SELECT id FROM users WHERE username = 'plant_supervisor' LIMIT 1) u
WHERE p.name = 'Butane Canister 250g'
  AND NOT EXISTS (
    SELECT 1 FROM plant_stock_adjustments WHERE supplier_invoice_number = 'INV-PRY-2026-312'
  );

-- E. Defect Quarantine on 11kg Empty Cylinders (Dented bodies & corroded footrings)
INSERT INTO plant_stock_adjustments (
    product_id,
    recorded_by,
    adjustment_type,
    target_condition,
    source_condition,
    delta_quantity,
    supplier_invoice_number,
    reason,
    recorded_at
)
SELECT
    p.id,
    u.id,
    'DEFECT_ADJUSTMENT'::plant_adjustment_type,
    'DEFECTIVE'::stock_condition,
    'EMPTY_GOOD'::stock_condition,
    4,
    'ADJ-DEF-20261009-02',
    'Post-trip inspection: 4 returned empty cylinders quarantined due to corroded footrings and expired hydrostatic retest date',
    NOW() - INTERVAL '2 days' - INTERVAL '1 hour'
FROM products p
CROSS JOIN (SELECT id FROM users WHERE username = 'plant_supervisor' LIMIT 1) u
WHERE p.name = '11kg LPG Cylinder'
  AND NOT EXISTS (
    SELECT 1 FROM plant_stock_adjustments WHERE supplier_invoice_number = 'ADJ-DEF-20261009-02'
  );

-- F. Physical Count Shrinkage Adjustment (Crushed empty canister shells discarded)
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
    'PHYSICAL_COUNT'::plant_adjustment_type,
    'EMPTY_GOOD'::stock_condition,
    -4,
    'ADJ-CNT-20261010-02',
    'Physical crate recount: 4 crushed empty canister shells discarded during crate reorganization',
    NOW() - INTERVAL '1 day' - INTERVAL '3 hours'
FROM products p
CROSS JOIN (SELECT id FROM users WHERE username = 'plant_supervisor' LIMIT 1) u
WHERE p.name = 'Butane Canister 250g'
  AND NOT EXISTS (
    SELECT 1 FROM plant_stock_adjustments WHERE supplier_invoice_number = 'ADJ-CNT-20261010-02'
  );


-- ============================================================
-- 4. Grant Plant Supervisor permissions
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
    'dashboard.view',
    'inventory.view',
    'inventory.plant.manage'
)
WHERE r.name = 'Plant Supervisor'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 5. Operational Delivery Routes, Trips & Multi-Load Transfers
-- ============================================================

-- 5.1. Operational Truck Schedules
INSERT INTO truck_schedules (scheduled_date, truck_id, sales_user_id, zone_id, created_by, status, notes)
SELECT
    d.sched_date,
    v.id,
    s.id,
    z.id,
    a.id,
    'DISPATCHED'::schedule_status,
    d.notes
FROM (
    VALUES
        (CURRENT_DATE - INTERVAL '4 days', 'ABC-1001', 'TORIL', 'Toril commercial & residential deployment'),
        (CURRENT_DATE - INTERVAL '2 days', 'ABC-1002', 'BANKEROHAN', 'Bankerohan market hub route'),
        (CURRENT_DATE - INTERVAL '1 day',  'ABC-1001', 'BUHANGIN', 'Buhangin commercial corridor route'),
        (CURRENT_DATE,                     'ABC-1002', 'MATINA', 'Matina commercial crossing deployment')
) AS d(sched_date, plate, zone_code, notes)
JOIN vehicles v ON v.plate_number = d.plate
JOIN service_zones z ON z.code = d.zone_code
CROSS JOIN (SELECT id FROM users WHERE username = 'sales_user' LIMIT 1) s
CROSS JOIN (SELECT id FROM users WHERE username = 'logistics_supervisor' LIMIT 1) a
WHERE NOT EXISTS (
    SELECT 1 FROM truck_schedules ts
    WHERE (ts.truck_id = v.id OR ts.sales_user_id = s.id)
      AND ts.scheduled_date = d.sched_date::date
      AND ts.status != 'CANCELLED'
)
ON CONFLICT (truck_id, scheduled_date) WHERE status != 'CANCELLED' DO NOTHING;


-- 5.2. Operational Trips (Trips 1, 2, 3 Completed, Trip 4 In Progress)
INSERT INTO trips (
    schedule_id,
    truck_id,
    driver_id,
    sales_user_id,
    zone_id,
    dispatched_by,
    trip_number,
    status,
    departure_time,
    return_time,
    notes
)
SELECT
    ts.id,
    v.id,
    dr.id,
    su.id,
    z.id,
    dp.id,
    td.trip_num,
    td.trip_stat::trip_status,
    td.dep_time,
    td.ret_time,
    td.trip_notes
FROM (
    VALUES
        (
            'ABC-1001',
            CURRENT_DATE - INTERVAL '4 days',
            'TORIL',
            'TRIP-20261007-001',
            'COMPLETED',
            CURRENT_DATE - INTERVAL '4 days' + TIME '07:00:00',
            CURRENT_DATE - INTERVAL '4 days' + TIME '16:00:00',
            'Toril route completed and verified'
        ),
        (
            'ABC-1002',
            CURRENT_DATE - INTERVAL '2 days',
            'BANKEROHAN',
            'TRIP-20261009-002',
            'COMPLETED',
            CURRENT_DATE - INTERVAL '2 days' + TIME '06:30:00',
            CURRENT_DATE - INTERVAL '2 days' + TIME '17:00:00',
            'Bankerohan commercial run with midday reload completed'
        ),
        (
            'ABC-1001',
            CURRENT_DATE - INTERVAL '1 day',
            'BUHANGIN',
            'TRIP-20261010-003',
            'COMPLETED',
            CURRENT_DATE - INTERVAL '1 day' + TIME '07:15:00',
            CURRENT_DATE - INTERVAL '1 day' + TIME '15:45:00',
            'Buhangin corridor route completed'
        ),
        (
            'ABC-1002',
            CURRENT_DATE,
            'MATINA',
            'TRIP-20261011-004',
            'IN_PROGRESS',
            NOW() - INTERVAL '2 hours',
            NULL,
            'Matina crossing active route deployment'
        )
) AS td(plate, sched_date, zone_code, trip_num, trip_stat, dep_time, ret_time, trip_notes)
JOIN vehicles v ON v.plate_number = td.plate
JOIN service_zones z ON z.code = td.zone_code
LEFT JOIN truck_schedules ts ON ts.truck_id = v.id AND ts.scheduled_date = td.sched_date
JOIN users dr ON v.driver_id = dr.id
CROSS JOIN (SELECT id FROM users WHERE username = 'sales_user' LIMIT 1) su
CROSS JOIN (SELECT id FROM users WHERE username = 'logistics_supervisor' LIMIT 1) dp
WHERE NOT EXISTS (
    SELECT 1 FROM trips WHERE trip_number = td.trip_num
);


-- 5.3. Multi-Load Transfer Slips (Dispatch Loads & Return Unloads)
INSERT INTO trip_loads (trip_id, transfer_type, slip_number, recorded_by, recorded_at, remarks)
SELECT
    t.id,
    ld.trans_type::transfer_type,
    ld.slip_num,
    u.id,
    ld.rec_at,
    ld.remarks
FROM (
    VALUES
        (
            'TRIP-20261007-001',
            'DISPATCH_LOAD',
            'LOAD-20261007-001',
            CURRENT_DATE - INTERVAL '4 days' + TIME '06:45:00',
            'Morning primary dispatch load for Toril district route'
        ),
        (
            'TRIP-20261007-001',
            'RETURN_UNLOAD',
            'UNLOAD-20261007-001',
            CURRENT_DATE - INTERVAL '4 days' + TIME '16:15:00',
            'Post-route evening return count and empty cylinder surrender'
        ),
        (
            'TRIP-20261009-002',
            'DISPATCH_LOAD',
            'LOAD-20261009-001',
            CURRENT_DATE - INTERVAL '2 days' + TIME '06:15:00',
            'Morning heavy commercial dispatch load for Bankerohan food market hub'
        ),
        (
            'TRIP-20261009-002',
            'DISPATCH_LOAD',
            'LOAD-20261009-002',
            CURRENT_DATE - INTERVAL '2 days' + TIME '12:30:00',
            'Midday route replenishment reload requested by sales rep Juan for eatery demand surge'
        ),
        (
            'TRIP-20261009-002',
            'RETURN_UNLOAD',
            'UNLOAD-20261009-001',
            CURRENT_DATE - INTERVAL '2 days' + TIME '17:15:00',
            'Bankerohan evening yard return unload and empty turnover'
        ),
        (
            'TRIP-20261010-003',
            'DISPATCH_LOAD',
            'LOAD-20261010-001',
            CURRENT_DATE - INTERVAL '1 day' + TIME '07:00:00',
            'Morning dispatch load for Buhangin commercial corridor and subdivisions'
        ),
        (
            'TRIP-20261010-003',
            'RETURN_UNLOAD',
            'UNLOAD-20261010-001',
            CURRENT_DATE - INTERVAL '1 day' + TIME '16:00:00',
            'Buhangin route physical return unload verified by plant staff'
        ),
        (
            'TRIP-20261011-004',
            'DISPATCH_LOAD',
            'LOAD-20261011-001',
            NOW() - INTERVAL '2 hours 15 mins',
            'Morning route dispatch load for Matina crossing - currently en route'
        )
) AS ld(trip_num, trans_type, slip_num, rec_at, remarks)
JOIN trips t ON t.trip_number = ld.trip_num
CROSS JOIN (SELECT id FROM users WHERE username = 'plant_supervisor' LIMIT 1) u
WHERE NOT EXISTS (
    SELECT 1 FROM trip_loads WHERE slip_number = ld.slip_num
);


-- 5.4. Trip Load Line Items
INSERT INTO trip_load_items (load_id, product_id, condition, quantity_units)
SELECT
    tl.id,
    p.id,
    it.item_cond::stock_condition,
    it.qty
FROM (
    VALUES
        -- LOAD-20261007-001 (Trip 1 Morning Load)
        ('LOAD-20261007-001', '11kg LPG Cylinder',    'FILLED', 40),
        ('LOAD-20261007-001', '22kg LPG Cylinder',    'FILLED', 10),
        ('LOAD-20261007-001', 'Butane Canister 250g', 'FILLED', 120),

        -- UNLOAD-20261007-001 (Trip 1 Return Unload)
        ('UNLOAD-20261007-001', '11kg LPG Cylinder',    'EMPTY_GOOD', 37),
        ('UNLOAD-20261007-001', '11kg LPG Cylinder',    'FILLED',     2),
        ('UNLOAD-20261007-001', '11kg LPG Cylinder',    'DEFECTIVE',  1),
        ('UNLOAD-20261007-001', '22kg LPG Cylinder',    'EMPTY_GOOD', 10),
        ('UNLOAD-20261007-001', 'Butane Canister 250g', 'EMPTY_GOOD', 110),
        ('UNLOAD-20261007-001', 'Butane Canister 250g', 'FILLED',     5),
        ('UNLOAD-20261007-001', 'Butane Canister 250g', 'DEFECTIVE',  5),

        -- LOAD-20261009-001 (Trip 2 Morning Load)
        ('LOAD-20261009-001', '11kg LPG Cylinder',    'FILLED', 60),
        ('LOAD-20261009-001', '50kg LPG Cylinder',    'FILLED', 15),
        ('LOAD-20261009-001', 'Butane Canister 170g', 'FILLED', 72),

        -- LOAD-20261009-002 (Trip 2 Midday Reload)
        ('LOAD-20261009-002', '11kg LPG Cylinder',    'FILLED', 20),
        ('LOAD-20261009-002', 'Butane Canister 170g', 'FILLED', 48),

        -- UNLOAD-20261009-001 (Trip 2 Return Unload)
        ('UNLOAD-20261009-001', '11kg LPG Cylinder',    'EMPTY_GOOD', 76),
        ('UNLOAD-20261009-001', '11kg LPG Cylinder',    'FILLED',     4),
        ('UNLOAD-20261009-001', '50kg LPG Cylinder',    'EMPTY_GOOD', 15),
        ('UNLOAD-20261009-001', 'Butane Canister 170g', 'EMPTY_GOOD', 118),
        ('UNLOAD-20261009-001', 'Butane Canister 170g', 'DEFECTIVE',  2),

        -- LOAD-20261010-001 (Trip 3 Morning Load)
        ('LOAD-20261010-001', '11kg LPG Cylinder',    'FILLED', 35),
        ('LOAD-20261010-001', '22kg LPG Cylinder',    'FILLED', 8),
        ('LOAD-20261010-001', 'Butane Canister 250g', 'FILLED', 96),

        -- UNLOAD-20261010-001 (Trip 3 Return Unload)
        ('UNLOAD-20261010-001', '11kg LPG Cylinder',    'EMPTY_GOOD', 34),
        ('UNLOAD-20261010-001', '11kg LPG Cylinder',    'FILLED',     1),
        ('UNLOAD-20261010-001', '22kg LPG Cylinder',    'EMPTY_GOOD', 8),
        ('UNLOAD-20261010-001', 'Butane Canister 250g', 'EMPTY_GOOD', 94),
        ('UNLOAD-20261010-001', 'Butane Canister 250g', 'DEFECTIVE',  2),

        -- LOAD-20261011-001 (Trip 4 Active Dispatch Load)
        ('LOAD-20261011-001', '11kg LPG Cylinder',    'FILLED', 50),
        ('LOAD-20261011-001', '50kg LPG Cylinder',    'FILLED', 12),
        ('LOAD-20261011-001', 'Butane Canister 170g', 'FILLED', 120)
) AS it(slip_num, prod_name, item_cond, qty)
JOIN trip_loads tl ON tl.slip_number = it.slip_num
JOIN products p ON p.name = it.prod_name
WHERE NOT EXISTS (
    SELECT 1 FROM trip_load_items tli
    WHERE tli.load_id = tl.id AND tli.product_id = p.id AND tli.condition = it.item_cond::stock_condition
);


-- 5.5. Settled Post-Trip Stock Reconciliations
INSERT INTO trip_stock_reconciliations (
    trip_id,
    verified_by,
    total_loaded_full,
    total_sold_full,
    total_returned_full,
    total_returned_empty_good,
    total_returned_defective,
    net_customer_debt_created,
    status,
    full_discrepancy,
    empty_discrepancy,
    reconciliation_data,
    supervisor_notes,
    reconciled_at
)
SELECT
    t.id,
    u.id,
    rd.loaded_full,
    rd.sold_full,
    rd.ret_full,
    rd.ret_empty,
    rd.ret_defective,
    0,
    'SETTLED'::reconciliation_status,
    0,
    0,
    rd.recon_json::jsonb,
    rd.notes,
    rd.recon_time
FROM (
    VALUES
        (
            'TRIP-20261007-001',
            170,
            157,
            7,
            157,
            6,
            '[
                {"productName": "11kg LPG Cylinder", "loadedFull": 40, "soldFull": 37, "returnedFull": 2, "returnedEmptyGood": 37, "returnedDefective": 1, "netCustomerDebtCreated": 0, "fullDiscrepancy": 0, "emptyDiscrepancy": 0, "isSettled": true},
                {"productName": "22kg LPG Cylinder", "loadedFull": 10, "soldFull": 10, "returnedFull": 0, "returnedEmptyGood": 10, "returnedDefective": 0, "netCustomerDebtCreated": 0, "fullDiscrepancy": 0, "emptyDiscrepancy": 0, "isSettled": true},
                {"productName": "Butane Canister 250g", "loadedFull": 120, "soldFull": 110, "returnedFull": 5, "returnedEmptyGood": 110, "returnedDefective": 5, "netCustomerDebtCreated": 0, "fullDiscrepancy": 0, "emptyDiscrepancy": 0, "isSettled": true}
            ]',
            'Toril route inventory balanced and reconciled',
            CURRENT_DATE - INTERVAL '4 days' + TIME '16:30:00'
        ),
        (
            'TRIP-20261009-002',
            215,
            209,
            4,
            209,
            2,
            '[
                {"productName": "11kg LPG Cylinder", "loadedFull": 80, "soldFull": 76, "returnedFull": 4, "returnedEmptyGood": 76, "returnedDefective": 0, "netCustomerDebtCreated": 0, "fullDiscrepancy": 0, "emptyDiscrepancy": 0, "isSettled": true},
                {"productName": "50kg LPG Cylinder", "loadedFull": 15, "soldFull": 15, "returnedFull": 0, "returnedEmptyGood": 15, "returnedDefective": 0, "netCustomerDebtCreated": 0, "fullDiscrepancy": 0, "emptyDiscrepancy": 0, "isSettled": true},
                {"productName": "Butane Canister 170g", "loadedFull": 120, "soldFull": 118, "returnedFull": 0, "returnedEmptyGood": 118, "returnedDefective": 2, "netCustomerDebtCreated": 0, "fullDiscrepancy": 0, "emptyDiscrepancy": 0, "isSettled": true}
            ]',
            'Bankerohan double-load route verified and settled',
            CURRENT_DATE - INTERVAL '2 days' + TIME '17:30:00'
        ),
        (
            'TRIP-20261010-003',
            139,
            136,
            1,
            136,
            2,
            '[
                {"productName": "11kg LPG Cylinder", "loadedFull": 35, "soldFull": 34, "returnedFull": 1, "returnedEmptyGood": 34, "returnedDefective": 0, "netCustomerDebtCreated": 0, "fullDiscrepancy": 0, "emptyDiscrepancy": 0, "isSettled": true},
                {"productName": "22kg LPG Cylinder", "loadedFull": 8, "soldFull": 8, "returnedFull": 0, "returnedEmptyGood": 8, "returnedDefective": 0, "netCustomerDebtCreated": 0, "fullDiscrepancy": 0, "emptyDiscrepancy": 0, "isSettled": true},
                {"productName": "Butane Canister 250g", "loadedFull": 96, "soldFull": 94, "returnedFull": 0, "returnedEmptyGood": 94, "returnedDefective": 2, "netCustomerDebtCreated": 0, "fullDiscrepancy": 0, "emptyDiscrepancy": 0, "isSettled": true}
            ]',
            'Buhangin corridor evening count balanced',
            CURRENT_DATE - INTERVAL '1 day' + TIME '16:15:00'
        )
) AS rd(trip_num, loaded_full, sold_full, ret_full, ret_empty, ret_defective, recon_json, notes, recon_time)
JOIN trips t ON t.trip_number = rd.trip_num
CROSS JOIN (SELECT id FROM users WHERE username = 'plant_supervisor' LIMIT 1) u
WHERE NOT EXISTS (
    SELECT 1 FROM trip_stock_reconciliations tsr WHERE tsr.trip_id = t.id
);


-- ============================================================
-- 6. OPERATIONAL SYSTEM EVENT HISTORY LOGS
-- Complete audit trail for Plant Bulk Restocks, Defect Quarantines,
-- Operational Schedules, Trip Dispatches, Multi-Loads, and Reconciliations
-- ============================================================

-- 6.1. Plant Stock Adjustments (Supplier Purchases / Restocks)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name,
    'Plant Supervisor',
    'Created',
    'Inventory Management',
    'INVENTORY_SUPPLIER_RESTOCKED',
    'Recorded supplier restock of ' || psa.delta_quantity || ' unit(s) of ''' || p.name || ''' (' || psa.target_condition || ') under invoice #' || psa.supplier_invoice_number,
    psa.id::text,
    'plant_inventory',
    psa.recorded_at
FROM plant_stock_adjustments psa
JOIN products p ON psa.product_id = p.id
JOIN users u ON psa.recorded_by = u.id
WHERE psa.adjustment_type = 'SUPPLIER_PURCHASE'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'INVENTORY_SUPPLIER_RESTOCKED' AND hl.target_id = psa.id::text
  );

-- 6.2. Plant Defect Quarantines
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name,
    'Plant Supervisor',
    'Updated',
    'Inventory Management',
    'INVENTORY_DEFECT_QUARANTINED',
    'Quarantined ' || psa.delta_quantity || ' defective unit(s) of ''' || p.name || ''' (' || COALESCE(psa.source_condition::text, 'FILLED') || ' -> DEFECTIVE): ' || psa.reason,
    psa.id::text,
    'plant_inventory',
    psa.recorded_at
FROM plant_stock_adjustments psa
JOIN products p ON psa.product_id = p.id
JOIN users u ON psa.recorded_by = u.id
WHERE psa.adjustment_type = 'DEFECT_ADJUSTMENT'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'INVENTORY_DEFECT_QUARANTINED' AND hl.target_id = psa.id::text
  );

-- 6.3. Operational Schedules Generated
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    admin.id,
    admin.first_name || ' ' || admin.last_name,
    'Logistics Supervisor',
    'Created',
    'SCHEDULE',
    'SCHEDULE_CREATED',
    'Scheduled route for vehicle ''' || v.plate_number || ''' on ' || ts.scheduled_date::text,
    ts.id::text,
    'schedule',
    ts.created_at
FROM truck_schedules ts
JOIN vehicles v ON ts.truck_id = v.id
JOIN users admin ON ts.created_by = admin.id
WHERE ts.notes IN (
    'Toril commercial & residential deployment',
    'Bankerohan market hub route',
    'Buhangin commercial corridor route',
    'Matina commercial crossing deployment'
)
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'SCHEDULE_CREATED' AND hl.target_id = ts.id::text
  );

-- 6.4. Operational Trip Dispatches
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    dp.id,
    dp.first_name || ' ' || dp.last_name,
    'Logistics Supervisor',
    'Created',
    'TRIP',
    'TRIP_DISPATCHED',
    'Dispatched trip #' || t.trip_number || ' for vehicle ''' || v.plate_number || '''',
    t.id::text,
    'trip',
    t.departure_time
FROM trips t
JOIN vehicles v ON t.truck_id = v.id
JOIN users dp ON t.dispatched_by = dp.id
WHERE t.trip_number IN ('TRIP-20261007-001', 'TRIP-20261009-002', 'TRIP-20261010-003', 'TRIP-20261011-004')
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRIP_DISPATCHED' AND hl.target_id = t.id::text
  );

-- 6.5. Dispatch Load Transfer Slips
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name,
    'Plant Supervisor',
    'Created',
    'Inventory Management',
    'INVENTORY_TRIP_LOADED',
    'Dispatched load transfer slip #' || tl.slip_number || ' with ' || (SELECT COALESCE(SUM(quantity_units), 0) FROM trip_load_items WHERE load_id = tl.id) || ' unit(s) for trip #' || t.trip_number,
    tl.id::text,
    'trip_load',
    tl.recorded_at
FROM trip_loads tl
JOIN trips t ON tl.trip_id = t.id
JOIN users u ON tl.recorded_by = u.id
WHERE tl.transfer_type = 'DISPATCH_LOAD'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'INVENTORY_TRIP_LOADED' AND hl.target_id = tl.id::text
  );

-- 6.6. Return Unload Transfer Slips
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name,
    'Plant Supervisor',
    'Created',
    'Inventory Management',
    'INVENTORY_TRIP_UNLOADED',
    'Recorded return unload transfer slip #' || tl.slip_number || ' with ' || (SELECT COALESCE(SUM(quantity_units), 0) FROM trip_load_items WHERE load_id = tl.id) || ' unit(s) for trip #' || t.trip_number,
    tl.id::text,
    'trip_load',
    tl.recorded_at
FROM trip_loads tl
JOIN trips t ON tl.trip_id = t.id
JOIN users u ON tl.recorded_by = u.id
WHERE tl.transfer_type = 'RETURN_UNLOAD'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'INVENTORY_TRIP_UNLOADED' AND hl.target_id = tl.id::text
  );

-- 6.7. Completed Trips
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    dp.id,
    dp.first_name || ' ' || dp.last_name,
    'Logistics Supervisor',
    'Updated',
    'TRIP',
    'TRIP_COMPLETED',
    'Completed trip #' || t.trip_number || ' with return odometer reading of ' || v.current_odometer || ' km',
    t.id::text,
    'trip',
    t.return_time
FROM trips t
JOIN vehicles v ON t.truck_id = v.id
JOIN users dp ON t.dispatched_by = dp.id
WHERE t.status = 'COMPLETED'
  AND t.return_time IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRIP_COMPLETED' AND hl.target_id = t.id::text
  );

-- 6.8. Settled Post-Trip Stock Reconciliations
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name,
    'Plant Supervisor',
    'Updated',
    'Inventory Management',
    'INVENTORY_RECONCILIATION_SETTLED',
    'Settled stock reconciliation for trip #' || t.trip_number || ' with zero variance',
    tsr.id::text,
    'trip_reconciliation',
    tsr.reconciled_at
FROM trip_stock_reconciliations tsr
JOIN trips t ON tsr.trip_id = t.id
JOIN users u ON tsr.verified_by = u.id
WHERE tsr.status = 'SETTLED'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'INVENTORY_RECONCILIATION_SETTLED' AND hl.target_id = tsr.id::text
  );

