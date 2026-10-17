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
