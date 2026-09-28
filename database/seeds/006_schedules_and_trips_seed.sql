-- ============================================================
-- SCHEDULE & TRIP SEED
-- Service Zones, Weekly Schedule Templates, and Sample Daily Schedules
-- ============================================================

-- ============================================================
-- 1. SERVICE ZONES
-- ============================================================

INSERT INTO service_zones (code, name, description, is_active)
VALUES
    ('TORIL', 'Toril District', 'Toril Commercial, Agricultural and Residential Route', TRUE),
    ('BANKEROHAN', 'Bankerohan Hub', 'Bankerohan Public Market and Central Commercial Hub', TRUE),
    ('CALINAN', 'Calinan Zone', 'Calinan Agricultural and Residential Route', TRUE),
    ('BUHANGIN', 'Buhangin Corridor', 'Buhangin Commercial Corridor and Subdivisions', TRUE),
    ('PANACAN', 'Panacan Industrial', 'Panacan Industrial and Port District', TRUE),
    ('MATINA', 'Matina Crossing', 'Matina Commercial Crossing and Institutional Area', TRUE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;


-- ============================================================
-- 2. SCHEDULE TEMPLATES (RECURRING WEEKLY ROUTES)
-- ============================================================

-- Template 1: ABC-1001 on Mondays (Day 1) -> Toril
INSERT INTO schedule_templates (truck_id, zone_id, day_of_week, default_sales_user_id, is_active)
SELECT
    v.id,
    z.id,
    1,
    u.id,
    TRUE
FROM vehicles v
CROSS JOIN service_zones z
CROSS JOIN users u
WHERE v.plate_number = 'ABC-1001'
  AND z.code = 'TORIL'
  AND u.username = 'sales_user'
ON CONFLICT (truck_id, day_of_week) DO UPDATE SET
    zone_id = EXCLUDED.zone_id,
    default_sales_user_id = EXCLUDED.default_sales_user_id,
    is_active = EXCLUDED.is_active;

-- Template 2: ABC-1001 on Wednesdays (Day 3) -> Bankerohan
INSERT INTO schedule_templates (truck_id, zone_id, day_of_week, default_sales_user_id, is_active)
SELECT
    v.id,
    z.id,
    3,
    u.id,
    TRUE
FROM vehicles v
CROSS JOIN service_zones z
CROSS JOIN users u
WHERE v.plate_number = 'ABC-1001'
  AND z.code = 'BANKEROHAN'
  AND u.username = 'sales_user'
ON CONFLICT (truck_id, day_of_week) DO UPDATE SET
    zone_id = EXCLUDED.zone_id,
    default_sales_user_id = EXCLUDED.default_sales_user_id,
    is_active = EXCLUDED.is_active;

-- Template 3: ABC-1001 on Fridays (Day 5) -> Matina
INSERT INTO schedule_templates (truck_id, zone_id, day_of_week, default_sales_user_id, is_active)
SELECT
    v.id,
    z.id,
    5,
    u.id,
    TRUE
FROM vehicles v
CROSS JOIN service_zones z
CROSS JOIN users u
WHERE v.plate_number = 'ABC-1001'
  AND z.code = 'MATINA'
  AND u.username = 'sales_user'
ON CONFLICT (truck_id, day_of_week) DO UPDATE SET
    zone_id = EXCLUDED.zone_id,
    default_sales_user_id = EXCLUDED.default_sales_user_id,
    is_active = EXCLUDED.is_active;

-- Template 4: ABC-1002 on Tuesdays (Day 2) -> Buhangin
INSERT INTO schedule_templates (truck_id, zone_id, day_of_week, default_sales_user_id, is_active)
SELECT
    v.id,
    z.id,
    2,
    u.id,
    TRUE
FROM vehicles v
CROSS JOIN service_zones z
CROSS JOIN users u
WHERE v.plate_number = 'ABC-1002'
  AND z.code = 'BUHANGIN'
  AND u.username = 'sales_user'
ON CONFLICT (truck_id, day_of_week) DO UPDATE SET
    zone_id = EXCLUDED.zone_id,
    default_sales_user_id = EXCLUDED.default_sales_user_id,
    is_active = EXCLUDED.is_active;

-- Template 5: ABC-1002 on Thursdays (Day 4) -> Panacan
INSERT INTO schedule_templates (truck_id, zone_id, day_of_week, default_sales_user_id, is_active)
SELECT
    v.id,
    z.id,
    4,
    u.id,
    TRUE
FROM vehicles v
CROSS JOIN service_zones z
CROSS JOIN users u
WHERE v.plate_number = 'ABC-1002'
  AND z.code = 'PANACAN'
  AND u.username = 'sales_user'
ON CONFLICT (truck_id, day_of_week) DO UPDATE SET
    zone_id = EXCLUDED.zone_id,
    default_sales_user_id = EXCLUDED.default_sales_user_id,
    is_active = EXCLUDED.is_active;


-- ============================================================
-- 3. OPERATIONAL TRUCK SCHEDULES (SAMPLE DATE DEPLOYMENTS)
-- ============================================================

INSERT INTO truck_schedules (scheduled_date, truck_id, sales_user_id, zone_id, created_by, status, notes)
SELECT
    CURRENT_DATE,
    v.id,
    u.id,
    z.id,
    admin.id,
    'SCHEDULED',
    'Standard recurring deployment generated from template'
FROM vehicles v
CROSS JOIN users u
CROSS JOIN service_zones z
CROSS JOIN users admin
WHERE v.plate_number = 'ABC-1001'
  AND u.username = 'sales_user'
  AND z.code = 'TORIL'
  AND admin.username = 'logistics_supervisor'
ON CONFLICT (truck_id, scheduled_date) DO NOTHING;
