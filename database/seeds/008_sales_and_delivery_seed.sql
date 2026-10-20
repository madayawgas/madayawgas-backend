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

        INSERT INTO sales_invoices (id, transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, payment_reference_number, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_tx_id, 'INV-20261015-002', 'CD-20261015-002', 4560.00, 'GCASH', 'VERIFIED', 'GCASH-REF-992100', '2026-10-15 04:15:00+00', NOW());

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

        INSERT INTO sales_invoices (id, transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, payment_reference_number, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_tx_id, 'INV-20261018-001', 'CD-20261018-001', 23700.00, 'GCASH', 'PAID_UNVERIFIED', 'GCASH-REF-884129', '2026-10-18 03:00:00+00', NOW());

        INSERT INTO canister_ledger (id, customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at, synced_at)
        VALUES (gen_random_uuid(), v_cust_1, v_prod_lpg50kg, v_trip_3, v_tx_id, 6, 6, 0, '2026-10-18 03:00:00+00', NOW());
    END IF;
END $$;

