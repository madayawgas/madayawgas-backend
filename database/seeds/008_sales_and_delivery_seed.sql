-- ============================================================
-- SALES & DELIVERY SUBSYSTEM SEED
-- Seed 008: Baseline Customer Profiles Spanning Commercial,
-- Retailer, and Household Accounts Across Davao Service Zones
-- ============================================================

-- ============================================================
-- 1. BASELINE ROUTE CUSTOMERS WITH FULL FIELD PROFILES
-- ============================================================

INSERT INTO customers (
    customer_type,
    business_name,
    contact_person,
    contact_number,
    alternate_contact_number,
    tin,
    delivery_address,
    zone_id,
    is_active,
    created_by
)
SELECT
    val.customer_type,
    val.business_name,
    val.contact_person,
    val.contact_number,
    val.alternate_contact_number,
    val.tin,
    val.delivery_address,
    z.id,
    TRUE,
    u.id
FROM (
    VALUES
        (
            'COMMERCIAL',
            'Toril Seafoods & Grill',
            'Ramon Magsaysay Jr.',
            '+639178881001',
            '+63822910001',
            '123-456-789-000',
            'Toril Public Market Road, Toril, Davao City',
            'TORIL'
        ),
        (
            'RETAILER',
            'Bankerohan Variety & General Store',
            'Elena Santos',
            '+639185552002',
            NULL,
            '234-567-890-000',
            'Stall 42, Bankerohan Public Market, Davao City',
            'BANKEROHAN'
        ),
        (
            'HOUSEHOLD',
            NULL,
            'Corazon Aquino',
            '+639193333003',
            NULL,
            NULL,
            'Block 12 Lot 4, Ladislawa Village, Buhangin, Davao City',
            'BUHANGIN'
        ),
        (
            'COMMERCIAL',
            'Matina Town Square Bistro',
            'Gabriel Concepcion',
            '+639207774004',
            '+63822974004',
            '345-678-901-000',
            'Matina Town Square, MacArthur Highway, Matina, Davao City',
            'MATINA'
        ),
        (
            'RETAILER',
            'Calinan Agri & Household Trading',
            'Felipe Buencamino',
            '+639221115005',
            NULL,
            '456-789-012-000',
            'National Highway, Calinan Poblacion, Davao City',
            'CALINAN'
        ),
        (
            'HOUSEHOLD',
            NULL,
            'Lourdes Dela Cruz',
            '+639174446006',
            NULL,
            NULL,
            'Phase 2, Ciudad Verde Subdivision, Panacan, Davao City',
            'PANACAN'
        )
) AS val(
    customer_type,
    business_name,
    contact_person,
    contact_number,
    alternate_contact_number,
    tin,
    delivery_address,
    zone_code
)
JOIN service_zones z ON z.code = val.zone_code
LEFT JOIN users u ON u.username = 'sales_user'
WHERE NOT EXISTS (
    SELECT 1 FROM customers c 
    WHERE c.contact_person = val.contact_person 
       OR (val.business_name IS NOT NULL AND c.business_name = val.business_name)
);

-- ============================================================
-- 2. BASELINE DELIVERY SALES TRANSACTIONS & INVOICES
-- ============================================================

DO $$
DECLARE
    v_sales_user_id UUID;
    v_trip_1 UUID;
    v_trip_2 UUID;
    v_trip_3 UUID;
    v_cust_1 UUID;
    v_cust_2 UUID;
    v_cust_3 UUID;
    v_cust_4 UUID;
    v_prod_butane250 UUID;
    v_prod_lpg11kg UUID;
    v_prod_lpg50kg UUID;
    v_tx_id UUID;
BEGIN
    SELECT id INTO v_sales_user_id FROM users WHERE username = 'sales_user' LIMIT 1;
    IF v_sales_user_id IS NULL THEN
        SELECT id INTO v_sales_user_id FROM users LIMIT 1;
    END IF;

    SELECT id INTO v_trip_1 FROM trips WHERE trip_number = 'TRIP-20261007-001' LIMIT 1;
    SELECT id INTO v_trip_2 FROM trips WHERE trip_number = 'TRIP-20261009-002' LIMIT 1;
    SELECT id INTO v_trip_3 FROM trips WHERE trip_number = 'TRIP-20261010-003' LIMIT 1;

    SELECT id INTO v_cust_1 FROM customers WHERE contact_person LIKE '%Ramon%' OR business_name LIKE '%Toril Seafoods%' LIMIT 1;
    SELECT id INTO v_cust_2 FROM customers WHERE contact_person LIKE '%Elena%' OR business_name LIKE '%Bankerohan%' LIMIT 1;
    SELECT id INTO v_cust_3 FROM customers WHERE contact_person LIKE '%Gabriel%' OR business_name LIKE '%Matina Town%' LIMIT 1;
    SELECT id INTO v_cust_4 FROM customers WHERE contact_person LIKE '%Felipe%' OR business_name LIKE '%Calinan%' LIMIT 1;

    -- Fallback customer IDs if specific names not found
    IF v_cust_1 IS NULL THEN SELECT id INTO v_cust_1 FROM customers ORDER BY created_at ASC LIMIT 1; END IF;
    IF v_cust_2 IS NULL THEN SELECT id INTO v_cust_2 FROM customers ORDER BY created_at DESC LIMIT 1; END IF;
    IF v_cust_3 IS NULL THEN v_cust_3 := v_cust_1; END IF;
    IF v_cust_4 IS NULL THEN v_cust_4 := v_cust_2; END IF;

    SELECT id INTO v_prod_butane250 FROM products WHERE name LIKE 'Butane Canister 250g' LIMIT 1;
    SELECT id INTO v_prod_lpg11kg FROM products WHERE name LIKE '11kg LPG Cylinder' LIMIT 1;
    SELECT id INTO v_prod_lpg50kg FROM products WHERE name LIKE '50kg LPG Cylinder' LIMIT 1;

    -- Transaction 1 on Trip 1: Commercial Seafood Resto (CASH)
    IF v_trip_1 IS NOT NULL AND v_cust_1 IS NOT NULL AND v_prod_lpg50kg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sales_transactions WHERE transaction_no = 'ORD-20261015-001') THEN
        INSERT INTO sales_transactions (id, transaction_no, trip_id, customer_id, recorded_by, status, transacted_at, synced_at)
        VALUES (gen_random_uuid(), 'ORD-20261015-001', v_trip_1, v_cust_1, v_sales_user_id, 'COMPLETED', '2026-10-15 02:30:00+00', NOW())
        RETURNING id INTO v_tx_id;

        INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
        VALUES (gen_random_uuid(), v_tx_id, v_prod_lpg50kg, 4, 3, 0, 3950.00, 15800.00);

        INSERT INTO sales_invoices (id, transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_tx_id, 'INV-20261015-001', 'CD-20261015-001', 15800.00, 'CASH', 'VERIFIED', '2026-10-15 02:30:00+00', NOW());

        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_cust_1, v_prod_lpg50kg, v_trip_1, v_tx_id, 4, 3, 1, '2026-10-15 02:30:00+00', NOW());
    END IF;

    -- Transaction 2 on Trip 1: Retailer Store (GCASH)
    IF v_trip_1 IS NOT NULL AND v_cust_2 IS NOT NULL AND v_prod_butane250 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sales_transactions WHERE transaction_no = 'ORD-20261015-002') THEN
        INSERT INTO sales_transactions (id, transaction_no, trip_id, customer_id, recorded_by, status, transacted_at, synced_at)
        VALUES (gen_random_uuid(), 'ORD-20261015-002', v_trip_1, v_cust_2, v_sales_user_id, 'COMPLETED', '2026-10-15 04:15:00+00', NOW())
        RETURNING id INTO v_tx_id;

        INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
        VALUES (gen_random_uuid(), v_tx_id, v_prod_butane250, 48, 48, 0, 95.00, 4560.00);

        INSERT INTO sales_invoices (id, transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, payment_reference_number, payment_proof_key, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_tx_id, 'INV-20261015-002', 'CD-20261015-002', 4560.00, 'GCASH', 'VERIFIED', 'GCASH-REF-992100', 'seed/mock1.jpg', '2026-10-15 04:15:00+00', NOW());

        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_cust_2, v_prod_butane250, v_trip_1, v_tx_id, 48, 48, 0, '2026-10-15 04:15:00+00', NOW());
    END IF;

    -- Transaction 3 on Trip 2: Bistro Account (CASH)
    IF v_trip_2 IS NOT NULL AND v_cust_3 IS NOT NULL AND v_prod_lpg11kg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sales_transactions WHERE transaction_no = 'ORD-20261017-001') THEN
        INSERT INTO sales_transactions (id, transaction_no, trip_id, customer_id, recorded_by, status, transacted_at, synced_at)
        VALUES (gen_random_uuid(), 'ORD-20261017-001', v_trip_2, v_cust_3, v_sales_user_id, 'COMPLETED', '2026-10-17 01:45:00+00', NOW())
        RETURNING id INTO v_tx_id;

        INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
        VALUES (gen_random_uuid(), v_tx_id, v_prod_lpg11kg, 8, 8, 0, 980.00, 7840.00);

        INSERT INTO sales_invoices (id, transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_tx_id, 'INV-20261017-001', 'CD-20261017-001', 7840.00, 'CASH', 'VERIFIED', '2026-10-17 01:45:00+00', NOW());

        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_cust_3, v_prod_lpg11kg, v_trip_2, v_tx_id, 8, 8, 0, '2026-10-17 01:45:00+00', NOW());
    END IF;

    -- Transaction 4 on Trip 2: Multi-Item (CASH)
    IF v_trip_2 IS NOT NULL AND v_cust_4 IS NOT NULL AND v_prod_butane250 IS NOT NULL AND v_prod_lpg11kg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sales_transactions WHERE transaction_no = 'ORD-20261017-002') THEN
        INSERT INTO sales_transactions (id, transaction_no, trip_id, customer_id, recorded_by, status, transacted_at, synced_at)
        VALUES (gen_random_uuid(), 'ORD-20261017-002', v_trip_2, v_cust_4, v_sales_user_id, 'COMPLETED', '2026-10-17 05:20:00+00', NOW())
        RETURNING id INTO v_tx_id;

        INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
        VALUES 
            (gen_random_uuid(), v_tx_id, v_prod_butane250, 24, 20, 0, 95.00, 2280.00),
            (gen_random_uuid(), v_tx_id, v_prod_lpg11kg, 5, 5, 0, 980.00, 4900.00);

        INSERT INTO sales_invoices (id, transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_tx_id, 'INV-20261017-002', 'CD-20261017-002', 7180.00, 'CASH', 'VERIFIED', '2026-10-17 05:20:00+00', NOW());

        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
        VALUES 
            (gen_random_uuid(), v_cust_4, v_prod_butane250, v_trip_2, v_tx_id, 24, 20, 4, '2026-10-17 05:20:00+00', NOW()),
            (gen_random_uuid(), v_cust_4, v_prod_lpg11kg, v_trip_2, v_tx_id, 5, 5, 0, '2026-10-17 05:20:00+00', NOW());
    END IF;

    -- Transaction 5 on Trip 3: Calinan Bulk Order (GCASH - Unverified)
    IF v_trip_3 IS NOT NULL AND v_cust_1 IS NOT NULL AND v_prod_lpg50kg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sales_transactions WHERE transaction_no = 'ORD-20261018-001') THEN
        INSERT INTO sales_transactions (id, transaction_no, trip_id, customer_id, recorded_by, status, transacted_at, synced_at)
        VALUES (gen_random_uuid(), 'ORD-20261018-001', v_trip_3, v_cust_1, v_sales_user_id, 'COMPLETED', '2026-10-18 03:00:00+00', NOW())
        RETURNING id INTO v_tx_id;

        INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
        VALUES (gen_random_uuid(), v_tx_id, v_prod_lpg50kg, 6, 6, 0, 3950.00, 23700.00);

        INSERT INTO sales_invoices (id, transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, payment_reference_number, payment_proof_key, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_tx_id, 'INV-20261018-001', 'CD-20261018-001', 23700.00, 'GCASH', 'PAID_UNVERIFIED', 'GCASH-REF-884129', 'seed/mock2.jpg', '2026-10-18 03:00:00+00', NOW());

        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_cust_1, v_prod_lpg50kg, v_trip_3, v_tx_id, 6, 6, 0, '2026-10-18 03:00:00+00', NOW());
    END IF;
END $$;

-- Ensure baseline GCash invoices have deterministic proof keys if already seeded
UPDATE sales_invoices SET payment_proof_key = 'seed/mock1.jpg' WHERE invoice_number = 'INV-20261015-002' AND payment_proof_key IS NULL;
UPDATE sales_invoices SET payment_proof_key = 'seed/mock2.jpg' WHERE invoice_number = 'INV-20261018-001' AND payment_proof_key IS NULL;

-- ============================================================
-- 3. ADDITIONAL DAVAO CUSTOMERS FOR ANNUAL DISTRIBUTION COVERAGE
-- ============================================================

INSERT INTO customers (
    customer_type,
    business_name,
    contact_person,
    contact_number,
    alternate_contact_number,
    tin,
    delivery_address,
    zone_id,
    is_active,
    created_by
)
SELECT
    val.customer_type,
    val.business_name,
    val.contact_person,
    val.contact_number,
    val.alternate_contact_number,
    val.tin,
    val.delivery_address,
    z.id,
    TRUE,
    u.id
FROM (
    VALUES
        (
            'WHOLESALE',
            'Davao South LPG Depot & Supply',
            'Arturo Villanueva',
            '+639175557001',
            '+63822917001',
            '567-890-123-000',
            'McArthur Highway, Crossing Bayabas, Toril, Davao City',
            'TORIL'
        ),
        (
            'COMMERCIAL',
            'Buhangin Roast & Lechon House',
            'Marisol Bautista',
            '+639186667002',
            NULL,
            '678-901-234-000',
            'Km. 6, Buhangin Road, Davao City',
            'BUHANGIN'
        ),
        (
            'RETAILER',
            'Panacan Port Mart & Gas',
            'Danilo Navarro',
            '+639197777003',
            NULL,
            '789-012-345-000',
            'Km. 13, Panacan National Highway, Davao City',
            'PANACAN'
        ),
        (
            'COMMERCIAL',
            'Bankerohan Noodle & Eatery Hub',
            'Teresita Mendoza',
            '+639208887004',
            '+63822217004',
            '890-123-456-000',
            'Datu Bago St., Bankerohan, Davao City',
            'BANKEROHAN'
        ),
        (
            'WHOLESALE',
            'Matina Crossing Catering & Commissary',
            'Roberto Alvarez',
            '+639219997005',
            NULL,
            '901-234-567-000',
            'Quimpo Blvd., Matina Crossing, Davao City',
            'MATINA'
        ),
        (
            'HOUSEHOLD',
            NULL,
            'Natividad Soriano',
            '+639223337006',
            NULL,
            NULL,
            'Purok 5, Calinan Proper, Davao City',
            'CALINAN'
        )
) AS val(
    customer_type,
    business_name,
    contact_person,
    contact_number,
    alternate_contact_number,
    tin,
    delivery_address,
    zone_code
)
JOIN service_zones z ON z.code = val.zone_code
LEFT JOIN users u ON u.username = 'sales_user'
WHERE NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.contact_person = val.contact_person
       OR (val.business_name IS NOT NULL AND c.business_name = val.business_name)
);

-- ============================================================
-- 4. ANNUAL (12-MONTH) HISTORICAL TRIPS, SALES, INVOICES & CANISTERS
-- Deterministic, idempotent generator spanning CURRENT_DATE - 360 days
-- to CURRENT_DATE - 1 day. GCash proofs cycle through the 10 static
-- seed images in uploads/seed/ (seed/mock1.jpg .. seed/mock10.jpeg).
-- ============================================================

DO $$
DECLARE
    v_sales_user_id UUID;
    v_supervisor_id UUID;
    v_dispatcher_id UUID;

    v_truck_ids UUID[];
    v_driver_ids UUID[];
    v_zone_ids UUID[];
    v_customer_ids UUID[];

    v_prod_b250 UUID;
    v_prod_b170 UUID;
    v_prod_11kg UUID;
    v_prod_22kg UUID;
    v_prod_50kg UUID;

    v_proof_keys TEXT[] := ARRAY[
        'seed/mock1.jpg',
        'seed/mock2.jpg',
        'seed/mock3.jpg',
        'seed/mock4.jpg',
        'seed/mock5.jpg',
        'seed/mock6.jpg',
        'seed/mock7.jpg',
        'seed/mock8.jpg',
        'seed/mock9.jpg',
        'seed/mock10.jpg'
    ];

    v_day_offset INT;
    v_total_days CONSTANT INT := 680;
    v_trips_today INT;
    v_trip_sub INT;
    v_trip_idx INT := 0;
    v_days_ago INT;
    v_trip_date DATE;
    v_dep_time TIMESTAMPTZ;
    v_ret_time TIMESTAMPTZ;
    v_trip_num VARCHAR(50);
    v_trip_id UUID;
    v_truck_id UUID;
    v_driver_id UUID;
    v_zone_id UUID;
    v_disp_load_id UUID;
    v_ret_load_id UUID;

    v_tx_per_trip INT;
    v_tx_sub INT;
    v_tx_global_idx INT := 0;
    v_gcash_idx INT := 0;
    v_tx_no VARCHAR(50);
    v_inv_no VARCHAR(50);
    v_decl_no VARCHAR(50);
    v_tx_id UUID;
    v_cust_id UUID;
    v_tx_time TIMESTAMPTZ;
    v_is_cancelled BOOLEAN;
    v_pay_method VARCHAR(20);
    v_pay_status VARCHAR(20);
    v_pay_ref VARCHAR(100);
    v_proof_key VARCHAR(255);

    v_year_num INT;
    v_month_num INT;
    v_hash INT;
    v_season_mult NUMERIC;
    v_sku_pick INT;
    v_has_second_item BOOLEAN;

    v_q_b250 INT;
    v_q_b170 INT;
    v_q_11kg INT;
    v_q_22kg INT;
    v_q_50kg INT;

    v_ret_qty INT;
    v_def_qty INT;
    v_unit_price NUMERIC(10, 2);
    v_subtotal NUMERIC(12, 2);
    v_tx_total NUMERIC(12, 2);

    v_trip_sold_b250 INT;
    v_trip_sold_b170 INT;
    v_trip_sold_11kg INT;
    v_trip_sold_22kg INT;
    v_trip_sold_50kg INT;
    v_trip_ret_good INT;
    v_trip_ret_def INT;
    v_trip_debt INT;
    v_trip_loaded_total INT;
    v_trip_sold_total INT;
BEGIN
    SELECT id INTO v_sales_user_id FROM users WHERE username = 'sales_user' LIMIT 1;
    IF v_sales_user_id IS NULL THEN
        SELECT id INTO v_sales_user_id FROM users LIMIT 1;
    END IF;

    SELECT id INTO v_supervisor_id FROM users WHERE username = 'sales_supervisor' LIMIT 1;
    IF v_supervisor_id IS NULL THEN
        v_supervisor_id := v_sales_user_id;
    END IF;

    SELECT id INTO v_dispatcher_id FROM users WHERE username = 'logistics_supervisor' LIMIT 1;
    IF v_dispatcher_id IS NULL THEN
        v_dispatcher_id := v_supervisor_id;
    END IF;

    -- Collect active delivery trucks with assigned drivers
    SELECT ARRAY_AGG(v.id ORDER BY v.plate_number),
           ARRAY_AGG(v.driver_id ORDER BY v.plate_number)
    INTO v_truck_ids, v_driver_ids
    FROM vehicles v
    WHERE v.plate_number IN ('ABC-1001', 'ABC-1002', 'ABC-1004')
      AND v.driver_id IS NOT NULL;

    IF v_truck_ids IS NULL OR ARRAY_LENGTH(v_truck_ids, 1) = 0 THEN
        RETURN;
    END IF;

    SELECT ARRAY_AGG(id ORDER BY code) INTO v_zone_ids FROM service_zones WHERE is_active = TRUE;
    SELECT ARRAY_AGG(id ORDER BY created_at, id) INTO v_customer_ids FROM customers WHERE is_active = TRUE;

    SELECT id INTO v_prod_b250 FROM products WHERE name = 'Butane Canister 250g' LIMIT 1;
    SELECT id INTO v_prod_b170 FROM products WHERE name = 'Butane Canister 170g' LIMIT 1;
    SELECT id INTO v_prod_11kg FROM products WHERE name = '11kg LPG Cylinder' LIMIT 1;
    SELECT id INTO v_prod_22kg FROM products WHERE name = '22kg LPG Cylinder' LIMIT 1;
    SELECT id INTO v_prod_50kg FROM products WHERE name = '50kg LPG Cylinder' LIMIT 1;

    IF v_zone_ids IS NULL OR v_customer_ids IS NULL OR v_prod_11kg IS NULL THEN
        RETURN;
    END IF;

    FOR v_day_offset IN 0..(v_total_days - 1) LOOP
        v_days_ago := v_total_days - v_day_offset;
        v_trip_date := CURRENT_DATE - v_days_ago;

        -- Skip Sundays (DOW = 0)
        IF EXTRACT(DOW FROM v_trip_date)::INT = 0 THEN
            CONTINUE;
        END IF;

        v_year_num := EXTRACT(YEAR FROM v_trip_date)::INT;
        v_month_num := EXTRACT(MONTH FROM v_trip_date)::INT;
        v_hash := (v_day_offset * 37 + v_month_num * 13 + EXTRACT(DAY FROM v_trip_date)::INT * 7) % 10;

        -- Organic daily trip distribution: 0 trips (~20%), 1 trip (~50%), 2 trips (~30%)
        IF v_hash <= 1 THEN
            v_trips_today := 0;
        ELSIF v_hash <= 6 THEN
            v_trips_today := 1;
        ELSE
            v_trips_today := 2;
        END IF;

        FOR v_trip_sub IN 1..v_trips_today LOOP
            v_trip_idx := v_trip_idx + 1;
            v_dep_time := v_trip_date + TIME '06:30:00' + (((v_trip_idx + v_trip_sub) % 4) * INTERVAL '25 minutes');
            v_ret_time := v_trip_date + TIME '16:15:00' + (((v_trip_idx * 3 + v_trip_sub) % 5) * INTERVAL '20 minutes');
            v_trip_num := 'TRIP-HIST-' || LPAD(v_trip_idx::TEXT, 4, '0');
            v_tx_per_trip := 2 + ((v_trip_idx * 7 + v_day_offset * 3) % 5);

            -- Skip if this historical trip already exists (idempotent re-seed)
            IF EXISTS (SELECT 1 FROM trips WHERE trip_number = v_trip_num) THEN
                v_tx_global_idx := v_tx_global_idx + v_tx_per_trip;
                CONTINUE;
            END IF;

            v_truck_id := v_truck_ids[1 + ((v_trip_idx + v_trip_sub - 1) % ARRAY_LENGTH(v_truck_ids, 1))];
            v_driver_id := v_driver_ids[1 + ((v_trip_idx + v_trip_sub - 1) % ARRAY_LENGTH(v_driver_ids, 1))];
            v_zone_id := v_zone_ids[1 + ((v_trip_idx * 3 + v_day_offset) % ARRAY_LENGTH(v_zone_ids, 1))];

            INSERT INTO trips (
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
            ) VALUES (
                v_truck_id,
                v_driver_id,
                v_sales_user_id,
                v_zone_id,
                v_dispatcher_id,
                v_trip_num,
                'COMPLETED'::trip_status,
                v_dep_time,
                v_ret_time,
                'Historical route deployment #' || v_trip_idx
            )
            RETURNING id INTO v_trip_id;

            -- Seasonal demand factor + year-over-year growth (2026 ~15% higher than 2025)
            v_season_mult := (CASE
                WHEN v_month_num = 12 THEN 1.35
                WHEN v_month_num IN (3, 4, 5) THEN 1.20
                WHEN v_month_num IN (1, 10, 11) THEN 1.10
                WHEN v_month_num IN (7, 8) THEN 0.88
                ELSE 1.00
            END) * (CASE WHEN v_year_num >= 2026 THEN 1.15 ELSE 1.00 END);

            v_trip_sold_b250 := 0;
            v_trip_sold_b170 := 0;
            v_trip_sold_11kg := 0;
            v_trip_sold_22kg := 0;
            v_trip_sold_50kg := 0;
            v_trip_ret_good := 0;
            v_trip_ret_def := 0;
            v_trip_debt := 0;

            FOR v_tx_sub IN 1..v_tx_per_trip LOOP
                v_tx_global_idx := v_tx_global_idx + 1;
                v_tx_no := 'ORD-HIST-' || LPAD(v_tx_global_idx::TEXT, 5, '0');
                v_inv_no := 'INV-HIST-' || LPAD(v_tx_global_idx::TEXT, 5, '0');
                v_decl_no := 'CD-HIST-' || LPAD(v_tx_global_idx::TEXT, 5, '0');

                v_cust_id := v_customer_ids[1 + ((v_tx_global_idx * 5 + v_trip_idx) % ARRAY_LENGTH(v_customer_ids, 1))];
                v_tx_time := v_dep_time + ((v_tx_sub * 65 + (v_tx_global_idx % 35)) * INTERVAL '1 minute');

                -- ~5% cancelled transactions for realistic KPI reporting
                v_is_cancelled := (v_tx_global_idx % 20 = 0);

                INSERT INTO sales_transactions (
                    id,
                    transaction_no,
                    trip_id,
                    customer_id,
                    recorded_by,
                    status,
                    cancellation_reason,
                    cancelled_by,
                    cancelled_at,
                    transacted_at,
                    synced_at
                ) VALUES (
                    gen_random_uuid(),
                    v_tx_no,
                    v_trip_id,
                    v_cust_id,
                    v_sales_user_id,
                    CASE WHEN v_is_cancelled THEN 'CANCELLED' ELSE 'COMPLETED' END,
                    CASE WHEN v_is_cancelled THEN 'Customer rescheduled delivery to next route cycle' ELSE NULL END,
                    CASE WHEN v_is_cancelled THEN v_supervisor_id ELSE NULL END,
                    CASE WHEN v_is_cancelled THEN v_tx_time + INTERVAL '30 minutes' ELSE NULL END,
                    v_tx_time,
                    v_ret_time
                )
                RETURNING id INTO v_tx_id;

                v_tx_total := 0;
                v_sku_pick := (v_tx_global_idx * 3 + v_trip_idx) % 5;
                v_has_second_item := (v_tx_global_idx % 3 = 0);

                -- Primary line item
                IF v_sku_pick = 0 AND v_prod_b250 IS NOT NULL THEN
                    v_q_b250 := GREATEST(12, ROUND((24 + (v_tx_global_idx % 4) * 12) * v_season_mult)::INT);
                    v_unit_price := 95.00;
                    v_subtotal := v_q_b250 * v_unit_price;
                    v_ret_qty := CASE WHEN (v_tx_global_idx % 7 = 0) THEN GREATEST(0, v_q_b250 - 6) ELSE v_q_b250 END;
                    v_def_qty := CASE WHEN (v_tx_global_idx % 15 = 0) THEN 1 ELSE 0 END;

                    INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
                    VALUES (gen_random_uuid(), v_tx_id, v_prod_b250, v_q_b250, v_ret_qty, v_def_qty, v_unit_price, v_subtotal);
                    v_tx_total := v_tx_total + v_subtotal;

                    IF NOT v_is_cancelled THEN
                        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
                        VALUES (gen_random_uuid(), v_cust_id, v_prod_b250, v_trip_id, v_tx_id, v_q_b250, v_ret_qty, v_q_b250 - v_ret_qty, v_tx_time, v_ret_time);
                        v_trip_sold_b250 := v_trip_sold_b250 + v_q_b250;
                        v_trip_ret_good := v_trip_ret_good + v_ret_qty;
                        v_trip_ret_def := v_trip_ret_def + v_def_qty;
                        v_trip_debt := v_trip_debt + (v_q_b250 - v_ret_qty);
                    END IF;
                ELSIF v_sku_pick = 1 AND v_prod_b170 IS NOT NULL THEN
                    v_q_b170 := GREATEST(12, ROUND((24 + (v_tx_global_idx % 5) * 12) * v_season_mult)::INT);
                    v_unit_price := 75.00;
                    v_subtotal := v_q_b170 * v_unit_price;
                    v_ret_qty := CASE WHEN (v_tx_global_idx % 8 = 0) THEN GREATEST(0, v_q_b170 - 4) ELSE v_q_b170 END;
                    v_def_qty := 0;

                    INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
                    VALUES (gen_random_uuid(), v_tx_id, v_prod_b170, v_q_b170, v_ret_qty, v_def_qty, v_unit_price, v_subtotal);
                    v_tx_total := v_tx_total + v_subtotal;

                    IF NOT v_is_cancelled THEN
                        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
                        VALUES (gen_random_uuid(), v_cust_id, v_prod_b170, v_trip_id, v_tx_id, v_q_b170, v_ret_qty, v_q_b170 - v_ret_qty, v_tx_time, v_ret_time);
                        v_trip_sold_b170 := v_trip_sold_b170 + v_q_b170;
                        v_trip_ret_good := v_trip_ret_good + v_ret_qty;
                        v_trip_debt := v_trip_debt + (v_q_b170 - v_ret_qty);
                    END IF;
                ELSIF v_sku_pick = 2 THEN
                    v_q_11kg := GREATEST(2, ROUND((3 + (v_tx_global_idx % 7)) * v_season_mult)::INT);
                    v_unit_price := 980.00;
                    v_subtotal := v_q_11kg * v_unit_price;
                    v_ret_qty := CASE WHEN (v_tx_global_idx % 6 = 0) THEN GREATEST(0, v_q_11kg - 1) ELSE v_q_11kg END;
                    v_def_qty := CASE WHEN (v_tx_global_idx % 25 = 0) THEN 1 ELSE 0 END;

                    INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
                    VALUES (gen_random_uuid(), v_tx_id, v_prod_11kg, v_q_11kg, v_ret_qty, v_def_qty, v_unit_price, v_subtotal);
                    v_tx_total := v_tx_total + v_subtotal;

                    IF NOT v_is_cancelled THEN
                        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
                        VALUES (gen_random_uuid(), v_cust_id, v_prod_11kg, v_trip_id, v_tx_id, v_q_11kg, v_ret_qty, v_q_11kg - v_ret_qty, v_tx_time, v_ret_time);
                        v_trip_sold_11kg := v_trip_sold_11kg + v_q_11kg;
                        v_trip_ret_good := v_trip_ret_good + v_ret_qty;
                        v_trip_ret_def := v_trip_ret_def + v_def_qty;
                        v_trip_debt := v_trip_debt + (v_q_11kg - v_ret_qty);
                    END IF;
                ELSIF v_sku_pick = 3 AND v_prod_22kg IS NOT NULL THEN
                    v_q_22kg := GREATEST(1, ROUND((2 + (v_tx_global_idx % 4)) * v_season_mult)::INT);
                    v_unit_price := 1950.00;
                    v_subtotal := v_q_22kg * v_unit_price;
                    v_ret_qty := v_q_22kg;
                    v_def_qty := 0;

                    INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
                    VALUES (gen_random_uuid(), v_tx_id, v_prod_22kg, v_q_22kg, v_ret_qty, v_def_qty, v_unit_price, v_subtotal);
                    v_tx_total := v_tx_total + v_subtotal;

                    IF NOT v_is_cancelled THEN
                        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
                        VALUES (gen_random_uuid(), v_cust_id, v_prod_22kg, v_trip_id, v_tx_id, v_q_22kg, v_ret_qty, 0, v_tx_time, v_ret_time);
                        v_trip_sold_22kg := v_trip_sold_22kg + v_q_22kg;
                        v_trip_ret_good := v_trip_ret_good + v_ret_qty;
                    END IF;
                ELSE
                    v_q_50kg := GREATEST(1, ROUND((2 + (v_tx_global_idx % 4)) * v_season_mult)::INT);
                    v_unit_price := 3950.00;
                    v_subtotal := v_q_50kg * v_unit_price;
                    v_ret_qty := CASE WHEN (v_tx_global_idx % 9 = 0) THEN GREATEST(0, v_q_50kg - 1) ELSE v_q_50kg END;
                    v_def_qty := 0;

                    INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
                    VALUES (gen_random_uuid(), v_tx_id, COALESCE(v_prod_50kg, v_prod_11kg), v_q_50kg, v_ret_qty, v_def_qty, v_unit_price, v_subtotal);
                    v_tx_total := v_tx_total + v_subtotal;

                    IF NOT v_is_cancelled THEN
                        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
                        VALUES (gen_random_uuid(), v_cust_id, COALESCE(v_prod_50kg, v_prod_11kg), v_trip_id, v_tx_id, v_q_50kg, v_ret_qty, v_q_50kg - v_ret_qty, v_tx_time, v_ret_time);
                        v_trip_sold_50kg := v_trip_sold_50kg + v_q_50kg;
                        v_trip_ret_good := v_trip_ret_good + v_ret_qty;
                        v_trip_debt := v_trip_debt + (v_q_50kg - v_ret_qty);
                    END IF;
                END IF;

                -- Secondary line item on every 3rd transaction for multi-SKU orders
                IF v_has_second_item AND v_sku_pick != 2 THEN
                    v_q_11kg := 2 + (v_tx_global_idx % 5);
                    v_unit_price := 980.00;
                    v_subtotal := v_q_11kg * v_unit_price;

                    INSERT INTO sales_transaction_items (id, transaction_id, product_id, quantity_sold, empties_returned, empties_defective, unit_price_at_sale, subtotal_amount)
                    VALUES (gen_random_uuid(), v_tx_id, v_prod_11kg, v_q_11kg, v_q_11kg, 0, v_unit_price, v_subtotal);
                    v_tx_total := v_tx_total + v_subtotal;

                    IF NOT v_is_cancelled THEN
                        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
                        VALUES (gen_random_uuid(), v_cust_id, v_prod_11kg, v_trip_id, v_tx_id, v_q_11kg, v_q_11kg, 0, v_tx_time, v_ret_time);
                        v_trip_sold_11kg := v_trip_sold_11kg + v_q_11kg;
                        v_trip_ret_good := v_trip_ret_good + v_q_11kg;
                    END IF;
                END IF;

                -- Payment method (~40% GCASH, ~60% CASH)
                IF (v_tx_global_idx % 5 IN (2, 4)) THEN
                    v_pay_method := 'GCASH';
                    v_pay_status := CASE WHEN v_days_ago <= 14 AND (v_gcash_idx % 2 = 0) THEN 'PAID_UNVERIFIED' ELSE 'VERIFIED' END;
                    v_pay_ref := 'GCASH-HIST-' || TO_CHAR(v_trip_date, 'YYYYMMDD') || '-' || LPAD(v_tx_global_idx::TEXT, 5, '0');
                    v_proof_key := v_proof_keys[1 + (v_gcash_idx % ARRAY_LENGTH(v_proof_keys, 1))];
                    v_gcash_idx := v_gcash_idx + 1;
                ELSE
                    v_pay_method := 'CASH';
                    v_pay_status := 'VERIFIED';
                    v_pay_ref := NULL;
                    v_proof_key := NULL;
                END IF;

                INSERT INTO sales_invoices (
                    id,
                    transaction_id,
                    invoice_number,
                    declaration_number,
                    total_amount,
                    payment_method,
                    payment_status,
                    payment_reference_number,
                    payment_proof_key,
                    verified_by,
                    verified_at,
                    transacted_at,
                    synced_at
                ) VALUES (
                    gen_random_uuid(),
                    v_tx_id,
                    v_inv_no,
                    v_decl_no,
                    v_tx_total,
                    v_pay_method,
                    v_pay_status,
                    v_pay_ref,
                    v_proof_key,
                    CASE WHEN v_pay_status = 'VERIFIED' THEN v_supervisor_id ELSE NULL END,
                    CASE WHEN v_pay_status = 'VERIFIED' THEN v_ret_time + INTERVAL '30 minutes' ELSE NULL END,
                    v_tx_time,
                    v_ret_time
                );
            END LOOP;

            -- Create matching DISPATCH_LOAD slip for the historical trip
            INSERT INTO trip_loads (trip_id, transfer_type, slip_number, recorded_by, recorded_at, remarks)
            VALUES (
                v_trip_id,
                'DISPATCH_LOAD'::transfer_type,
                'SLIP-HIST-D-' || LPAD(v_trip_idx::TEXT, 4, '0'),
                v_dispatcher_id,
                v_dep_time,
                'Historical dispatch load for ' || v_trip_num
            )
            RETURNING id INTO v_disp_load_id;

            v_trip_loaded_total := 0;
            IF v_prod_b250 IS NOT NULL AND v_trip_sold_b250 > 0 THEN
                INSERT INTO trip_load_items (load_id, product_id, condition, quantity_units)
                VALUES (v_disp_load_id, v_prod_b250, 'FILLED'::stock_condition, v_trip_sold_b250 + 12);
                v_trip_loaded_total := v_trip_loaded_total + v_trip_sold_b250 + 12;
            END IF;
            IF v_prod_b170 IS NOT NULL AND v_trip_sold_b170 > 0 THEN
                INSERT INTO trip_load_items (load_id, product_id, condition, quantity_units)
                VALUES (v_disp_load_id, v_prod_b170, 'FILLED'::stock_condition, v_trip_sold_b170 + 12);
                v_trip_loaded_total := v_trip_loaded_total + v_trip_sold_b170 + 12;
            END IF;
            IF v_trip_sold_11kg > 0 THEN
                INSERT INTO trip_load_items (load_id, product_id, condition, quantity_units)
                VALUES (v_disp_load_id, v_prod_11kg, 'FILLED'::stock_condition, v_trip_sold_11kg + 4);
                v_trip_loaded_total := v_trip_loaded_total + v_trip_sold_11kg + 4;
            END IF;
            IF v_prod_22kg IS NOT NULL AND v_trip_sold_22kg > 0 THEN
                INSERT INTO trip_load_items (load_id, product_id, condition, quantity_units)
                VALUES (v_disp_load_id, v_prod_22kg, 'FILLED'::stock_condition, v_trip_sold_22kg + 2);
                v_trip_loaded_total := v_trip_loaded_total + v_trip_sold_22kg + 2;
            END IF;
            IF v_prod_50kg IS NOT NULL AND v_trip_sold_50kg > 0 THEN
                INSERT INTO trip_load_items (load_id, product_id, condition, quantity_units)
                VALUES (v_disp_load_id, v_prod_50kg, 'FILLED'::stock_condition, v_trip_sold_50kg + 1);
                v_trip_loaded_total := v_trip_loaded_total + v_trip_sold_50kg + 1;
            END IF;

            v_trip_sold_total := v_trip_sold_b250 + v_trip_sold_b170 + v_trip_sold_11kg + v_trip_sold_22kg + v_trip_sold_50kg;

            -- Create matching RETURN_UNLOAD slip
            INSERT INTO trip_loads (trip_id, transfer_type, slip_number, recorded_by, recorded_at, remarks)
            VALUES (
                v_trip_id,
                'RETURN_UNLOAD'::transfer_type,
                'SLIP-HIST-R-' || LPAD(v_trip_idx::TEXT, 4, '0'),
                v_dispatcher_id,
                v_ret_time,
                'Historical return unload for ' || v_trip_num
            )
            RETURNING id INTO v_ret_load_id;

            IF (v_trip_loaded_total - v_trip_sold_total) > 0 THEN
                INSERT INTO trip_load_items (load_id, product_id, condition, quantity_units)
                VALUES (v_ret_load_id, v_prod_11kg, 'FILLED'::stock_condition, v_trip_loaded_total - v_trip_sold_total);
            END IF;
            IF v_trip_ret_good > 0 THEN
                INSERT INTO trip_load_items (load_id, product_id, condition, quantity_units)
                VALUES (v_ret_load_id, v_prod_11kg, 'EMPTY_GOOD'::stock_condition, v_trip_ret_good);
            END IF;
            IF v_trip_ret_def > 0 THEN
                INSERT INTO trip_load_items (load_id, product_id, condition, quantity_units)
                VALUES (v_ret_load_id, v_prod_11kg, 'DEFECTIVE'::stock_condition, v_trip_ret_def);
            END IF;

            -- Create post-trip reconciliation record
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
                supervisor_notes,
                reconciled_at
            ) VALUES (
                v_trip_id,
                v_supervisor_id,
                v_trip_loaded_total,
                v_trip_sold_total,
                GREATEST(0, v_trip_loaded_total - v_trip_sold_total),
                v_trip_ret_good,
                v_trip_ret_def,
                v_trip_debt,
                'SETTLED'::reconciliation_status,
                'Historical trip reconciled and settled',
                v_ret_time + INTERVAL '45 minutes'
            );
        END LOOP;
    END LOOP;
END $$;

