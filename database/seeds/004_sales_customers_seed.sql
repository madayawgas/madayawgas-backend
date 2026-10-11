-- ============================================================
-- SALES & DELIVERY SUBSYSTEM: CUSTOMERS SEED
-- Seed customer profiles spanning Retail, Commercial, and Wholesale
-- clients across Davao City.
-- ============================================================

INSERT INTO customers (name, address, contact_number, customer_type, is_active)
SELECT val.name, val.address, val.contact_number, val.customer_type::customer_type_enum, val.is_active
FROM (
    VALUES
        (
            'Juan Dela Cruz',
            '123 Mabini St., Poblacion, Davao City',
            '+639171234567',
            'RETAIL',
            TRUE
        ),
        (
            'Madayaw Grill & Restaurant',
            '456 JP Laurel Ave, Bajada, Davao City',
            '+63822210001',
            'COMMERCIAL',
            TRUE
        ),
        (
            'Davao Gas Central Trading',
            '789 R. Castillo St, Agdao, Davao City',
            '+63822210002',
            'WHOLESALE',
            TRUE
        ),
        (
            'Aling Nena General Store',
            'Km. 11, Sasa Wharf Road, Sasa, Davao City',
            '+639189876543',
            'RETAIL',
            TRUE
        ),
        (
            'Davao Chong Hua High School Canteen',
            'Sta. Ana Ave, Poblacion District, Davao City',
            '+63822278901',
            'COMMERCIAL',
            TRUE
        ),
        (
            'Southern Mindanao Poultry & Agro Farms',
            'Barangay Riverside, Calinan, Davao City',
            '+639191238899',
            'WHOLESALE',
            TRUE
        ),
        (
            'Matina Heights Bakery & Pastries',
            'MacArthur Highway, Matina, Davao City',
            '+63822987654',
            'COMMERCIAL',
            TRUE
        ),
        (
            'Kusina Dabawenyo Seafood & BBQ',
            'Times Beach, Matina Aplaya, Davao City',
            '+639209871122',
            'COMMERCIAL',
            TRUE
        )
) AS val(name, address, contact_number, customer_type, is_active)
WHERE NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.name = val.name
);
