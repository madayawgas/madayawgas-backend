-- ============================================================
-- SALES & DELIVERY SUBSYSTEM: CUSTOMERS SEED
-- ============================================================

INSERT INTO customers (name, address, contact_number, customer_type, is_active)
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
    );
