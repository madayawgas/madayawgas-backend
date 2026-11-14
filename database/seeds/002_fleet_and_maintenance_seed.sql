-- ============================================================
-- FLEET AND MAINTENANCE SEED
-- Reference Data, Sample Fleet Vehicles, Inspections,
-- Incident Reports, Work Orders, Approvals, Logs, and Odometer Tracking
-- ============================================================


-- ============================================================
-- 1. MAINTENANCE TYPES
-- ============================================================

INSERT INTO maintenance_types (type_name)
VALUES
    ('PREVENTIVE'),
    ('CORRECTIVE'),
    ('ACCIDENT_REPAIR'),
    ('EMERGENCY')
ON CONFLICT (type_name) DO NOTHING;


-- ============================================================
-- 2. INCIDENT TYPES
-- ============================================================

INSERT INTO incident_types (type_name)
VALUES
    ('MECHANICAL_DEFECT'),
    ('ROAD_ACCIDENT'),
    ('TIRE_FAILURE'),
    ('LEAK_ISSUE')
ON CONFLICT (type_name) DO NOTHING;


-- ============================================================
-- 3. VEHICLES (FLEET ASSETS)
-- ============================================================

INSERT INTO vehicles (plate_number, driver_id, vehicle_type, model, year_model, current_odometer, last_pm_odometer, status)
SELECT
    'ABC-1001',
    u.id,
    'DELIVERY_TRUCK',
    'Isuzu Elf N-Series',
    2022,
    45200,
    40000,
    'ACTIVE'
FROM users u
WHERE u.username = 'driver_user'
ON CONFLICT (plate_number) DO UPDATE SET
    driver_id = EXCLUDED.driver_id,
    vehicle_type = EXCLUDED.vehicle_type,
    model = EXCLUDED.model,
    year_model = EXCLUDED.year_model,
    current_odometer = EXCLUDED.current_odometer,
    last_pm_odometer = EXCLUDED.last_pm_odometer,
    status = EXCLUDED.status;

INSERT INTO vehicles (plate_number, driver_id, vehicle_type, model, year_model, current_odometer, last_pm_odometer, status)
SELECT
    'ABC-1002',
    u.id,
    'DELIVERY_TRUCK',
    'Fuso Canter FE71',
    2021,
    62500,
    60000,
    'ACTIVE'
FROM users u
WHERE u.username = 'driver_user2'
ON CONFLICT (plate_number) DO UPDATE SET
    driver_id = EXCLUDED.driver_id,
    vehicle_type = EXCLUDED.vehicle_type,
    model = EXCLUDED.model,
    year_model = EXCLUDED.year_model,
    current_odometer = EXCLUDED.current_odometer,
    last_pm_odometer = EXCLUDED.last_pm_odometer,
    status = EXCLUDED.status;

INSERT INTO vehicles (plate_number, driver_id, vehicle_type, model, year_model, current_odometer, last_pm_odometer, status)
SELECT
    'ABC-1004',
    u.id,
    'SERVICE_PICKUP',
    'Toyota Hilux Single Cab',
    2020,
    115000,
    110000,
    'ACTIVE'
FROM users u
WHERE u.username = 'driver_user3'
ON CONFLICT (plate_number) DO UPDATE SET
    driver_id = EXCLUDED.driver_id,
    vehicle_type = EXCLUDED.vehicle_type,
    model = EXCLUDED.model,
    year_model = EXCLUDED.year_model,
    current_odometer = EXCLUDED.current_odometer,
    last_pm_odometer = EXCLUDED.last_pm_odometer,
    status = EXCLUDED.status;

INSERT INTO vehicles (plate_number, driver_id, vehicle_type, model, year_model, current_odometer, last_pm_odometer, status)
VALUES
    ('ABC-1003', NULL, 'DELIVERY_TRUCK', 'Hino 300 Series', 2023, 28000, 25000, 'UNDER_MAINTENANCE'),
    ('ABC-1005', NULL, 'UTILITY_VAN', 'Hyundai HD78 GT', 2019, 148000, 140000, 'INACTIVE')
ON CONFLICT (plate_number) DO UPDATE SET
    driver_id = EXCLUDED.driver_id,
    vehicle_type = EXCLUDED.vehicle_type,
    model = EXCLUDED.model,
    year_model = EXCLUDED.year_model,
    current_odometer = EXCLUDED.current_odometer,
    last_pm_odometer = EXCLUDED.last_pm_odometer,
    status = EXCLUDED.status;


-- ============================================================
-- 4. ODOMETER LOGS (POST-DISPATCH RETURN TRACKING)
-- ============================================================

DELETE FROM vehicle_odometer_logs
WHERE vehicle_id IN (SELECT id FROM vehicles WHERE plate_number = 'ABC-1001')
  AND odometer_reading <> 45200;

INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, notes, logged_at)
SELECT
    v.id,
    45200,
    u.id,
    'POST_DISPATCH_RETURN',
    'Standard post-route return inspection and odometer check-in.',
    NOW() - INTERVAL '1 day'
FROM vehicles v
CROSS JOIN users u
WHERE v.plate_number = 'ABC-1001' AND u.username = 'logistics_supervisor'
AND NOT EXISTS (
    SELECT 1 FROM vehicle_odometer_logs vol
    WHERE vol.vehicle_id = v.id AND vol.odometer_reading = 45200
);


-- ============================================================
-- 5. VEHICLE INSPECTIONS (Issue Reporting Only - No Checklist)
-- ============================================================

INSERT INTO vehicle_inspections (vehicle_id, inspector_id, result, findings, issue_detected, allow_dispatch, inspection_date)
SELECT
    v.id,
    u.id,
    'NEEDS_ATTENTION',
    'Brake pads worn near minimum thickness. Front brake pads require immediate replacement.',
    TRUE,
    FALSE,
    NOW() - INTERVAL '5 days'
FROM vehicles v
CROSS JOIN users u
WHERE v.plate_number = 'ABC-1003' AND u.username = 'logistics_supervisor'
AND NOT EXISTS (
    SELECT 1 FROM vehicle_inspections vi
    WHERE vi.vehicle_id = v.id AND vi.findings LIKE 'Brake pads worn near minimum thickness%'
);


-- ============================================================
-- 6. INCIDENT REPORTS
-- ============================================================

INSERT INTO incident_reports (vehicle_id, reporter_id, incident_type_id, severity, report_date, incident_location, description)
SELECT
    v.id,
    u.id,
    it.id,
    'HIGH',
    NOW() - INTERVAL '4 days',
    'Davao-Cotabato Highway km 18',
    'Driver experienced spongy brake pedal response and reduced braking efficiency while descending slight incline.'
FROM vehicles v
CROSS JOIN users u
CROSS JOIN incident_types it
WHERE v.plate_number = 'ABC-1003'
  AND u.username = 'sales_user'
  AND it.type_name = 'MECHANICAL_DEFECT'
  AND NOT EXISTS (
      SELECT 1 FROM incident_reports ir
      WHERE ir.vehicle_id = v.id AND ir.incident_location = 'Davao-Cotabato Highway km 18'
  );


-- ============================================================
-- 7. WORK ORDERS
-- ============================================================

-- Work Order 1: Completed Routine PM for ABC-1002
INSERT INTO work_orders (vehicle_id, creator_id, status, maintenance_type_id, request_date, scheduled_date, shop_name, estimated_cost, description)
SELECT
    v.id,
    u.id,
    'COMPLETED',
    mt.id,
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '8 days',
    'Davao Diesel & Fleet Services',
    7500.00,
    'Scheduled 60,000 km regular preventive maintenance service and oil change.'
FROM vehicles v
CROSS JOIN users u
CROSS JOIN maintenance_types mt
WHERE v.plate_number = 'ABC-1002'
  AND u.username = 'logistics_supervisor'
  AND mt.type_name = 'PREVENTIVE'
  AND NOT EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.vehicle_id = v.id AND wo.description LIKE 'Scheduled 60,000 km%'
  );

-- Work Order 2: Approved Corrective Brake Repair for ABC-1003
INSERT INTO work_orders (vehicle_id, creator_id, status, maintenance_type_id, inspection_id, incident_report_id, request_date, scheduled_date, shop_name, estimated_cost, description)
SELECT
    v.id,
    u.id,
    'APPROVED',
    mt.id,
    (SELECT vi.id FROM vehicle_inspections vi WHERE vi.vehicle_id = v.id ORDER BY vi.inspection_date DESC LIMIT 1),
    (SELECT ir.id FROM incident_reports ir WHERE ir.vehicle_id = v.id ORDER BY ir.report_date DESC LIMIT 1),
    NOW() - INTERVAL '3 days',
    NOW() + INTERVAL '2 days',
    'Precision Heavy Auto Repair Center',
    18500.00,
    'Replace front and rear brake pads, resurface brake rotors, and flush brake fluid.'
FROM vehicles v
CROSS JOIN users u
CROSS JOIN maintenance_types mt
WHERE v.plate_number = 'ABC-1003'
  AND u.username = 'logistics_supervisor'
  AND mt.type_name = 'CORRECTIVE'
  AND NOT EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.vehicle_id = v.id AND wo.description LIKE 'Replace front and rear brake pads%'
  );


-- ============================================================
-- 8. APPROVAL REQUESTS
-- ============================================================

INSERT INTO approval_requests (work_order_id, decider_id, requested_date, decided_date, amount_requested, is_approved, remarks)
SELECT
    wo.id,
    u.id,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '2 days',
    18500.00,
    TRUE,
    'Approved for critical safety and roadworthiness compliance.'
FROM work_orders wo
CROSS JOIN users u
WHERE wo.description LIKE 'Replace front and rear brake pads%'
  AND u.username = 'admin_user'
  AND NOT EXISTS (
      SELECT 1 FROM approval_requests ar WHERE ar.work_order_id = wo.id
  );


-- ============================================================
-- 9. MAINTENANCE LOGS
-- ============================================================

INSERT INTO maintenance_logs (work_order_id, maintenance_type_id, severity, date_started, date_resolved, parts_cost, labor_cost, downtime_days, odometer_at_service)
SELECT
    wo.id,
    mt.id,
    'LOW',
    NOW() - INTERVAL '8 days',
    NOW() - INTERVAL '7 days',
    5200.00,
    2300.00,
    1,
    60120
FROM work_orders wo
JOIN maintenance_types mt ON mt.type_name = 'PREVENTIVE'
WHERE wo.description LIKE 'Scheduled 60,000 km%'
ON CONFLICT (work_order_id) DO UPDATE SET
    parts_cost = EXCLUDED.parts_cost,
    labor_cost = EXCLUDED.labor_cost,
    downtime_days = EXCLUDED.downtime_days,
    odometer_at_service = EXCLUDED.odometer_at_service;


-- ============================================================
-- 10. WORK ORDER RECEIPTS (0..N AUDIT ATTACHMENTS)
-- ============================================================

INSERT INTO work_order_receipts (work_order_id, uploaded_by, file_url)
SELECT
    wo.id,
    u.id,
    'seed/mock1.jpg'
FROM work_orders wo
CROSS JOIN users u
WHERE wo.description LIKE 'Scheduled 60,000 km%'
  AND u.username = 'logistics_supervisor'
  AND NOT EXISTS (
      SELECT 1 FROM work_order_receipts wor
      WHERE wor.work_order_id = wo.id
  );

UPDATE work_order_receipts
SET file_url = 'seed/mock1.jpg'
WHERE file_url LIKE 'https://storage.madayawgas.com/%';


-- ============================================================
-- 11. HISTORICAL FLEET ODOMETER, INSPECTIONS, INCIDENTS & WORK ORDERS (2025-2026)
-- ============================================================

DO $$
DECLARE
    v_sup_id UUID;
    v_admin_id UUID;
    v_sales_id UUID;

    v_abc1001 UUID;
    v_abc1002 UUID;
    v_abc1003 UUID;
    v_abc1004 UUID;
    v_abc1005 UUID;

    v_mt_pm INT;
    v_mt_corr INT;
    v_mt_emerg INT;

    v_it_mech INT;
    v_it_tire INT;
    v_it_leak INT;

    v_step INT;
    v_wo_id UUID;
    v_insp_id UUID;
    v_inc_id UUID;
BEGIN
    SELECT id INTO v_sup_id FROM users WHERE username = 'logistics_supervisor' LIMIT 1;
    SELECT id INTO v_admin_id FROM users WHERE username = 'admin_user' LIMIT 1;
    SELECT id INTO v_sales_id FROM users WHERE username = 'sales_user' LIMIT 1;
    IF v_sup_id IS NULL THEN SELECT id INTO v_sup_id FROM users LIMIT 1; END IF;
    IF v_admin_id IS NULL THEN v_admin_id := v_sup_id; END IF;
    IF v_sales_id IS NULL THEN v_sales_id := v_sup_id; END IF;

    SELECT id INTO v_abc1001 FROM vehicles WHERE plate_number = 'ABC-1001' LIMIT 1;
    SELECT id INTO v_abc1002 FROM vehicles WHERE plate_number = 'ABC-1002' LIMIT 1;
    SELECT id INTO v_abc1003 FROM vehicles WHERE plate_number = 'ABC-1003' LIMIT 1;
    SELECT id INTO v_abc1004 FROM vehicles WHERE plate_number = 'ABC-1004' LIMIT 1;
    SELECT id INTO v_abc1005 FROM vehicles WHERE plate_number = 'ABC-1005' LIMIT 1;

    SELECT id INTO v_mt_pm FROM maintenance_types WHERE type_name = 'PREVENTIVE' LIMIT 1;
    SELECT id INTO v_mt_corr FROM maintenance_types WHERE type_name = 'CORRECTIVE' LIMIT 1;
    SELECT id INTO v_mt_emerg FROM maintenance_types WHERE type_name = 'EMERGENCY' LIMIT 1;

    SELECT id INTO v_it_mech FROM incident_types WHERE type_name = 'MECHANICAL_DEFECT' LIMIT 1;
    SELECT id INTO v_it_tire FROM incident_types WHERE type_name = 'TIRE_FAILURE' LIMIT 1;
    SELECT id INTO v_it_leak FROM incident_types WHERE type_name = 'LEAK_ISSUE' LIMIT 1;

    -- A. Monthly odometer checkpoints (22 months: Jan 2025 -> Oct 2026)
    FOR v_step IN 0..21 LOOP
        -- ABC-1001: 31,500 -> 44,700 (ends at 45,200 in Nov 2026)
        IF v_abc1001 IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM vehicle_odometer_logs WHERE vehicle_id = v_abc1001 AND odometer_reading = 31500 + (v_step * 620)
        ) THEN
            INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, notes, logged_at)
            VALUES (v_abc1001, 31500 + (v_step * 620), v_sup_id, 'POST_DISPATCH_RETURN', 'Monthly fleet odometer checkpoint', CURRENT_DATE - ((22 - v_step) * 30));
        END IF;

        -- ABC-1002: 46,000 -> 62,500
        IF v_abc1002 IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM vehicle_odometer_logs WHERE vehicle_id = v_abc1002 AND odometer_reading = 46000 + (v_step * 785)
        ) THEN
            INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, notes, logged_at)
            VALUES (v_abc1002, 46000 + (v_step * 785), v_sup_id, 'POST_DISPATCH_RETURN', 'Monthly fleet odometer checkpoint', CURRENT_DATE - ((22 - v_step) * 30));
        END IF;

        -- ABC-1004: 95,000 -> 115,000
        IF v_abc1004 IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM vehicle_odometer_logs WHERE vehicle_id = v_abc1004 AND odometer_reading = 95000 + (v_step * 950)
        ) THEN
            INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, notes, logged_at)
            VALUES (v_abc1004, 95000 + (v_step * 950), v_sup_id, 'POST_DISPATCH_RETURN', 'Monthly fleet odometer checkpoint', CURRENT_DATE - ((22 - v_step) * 30));
        END IF;

        -- ABC-1003: 21,000 -> 28,000
        IF v_abc1003 IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM vehicle_odometer_logs WHERE vehicle_id = v_abc1003 AND odometer_reading = 21000 + (v_step * 330)
        ) THEN
            INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, notes, logged_at)
            VALUES (v_abc1003, 21000 + (v_step * 330), v_sup_id, 'POST_DISPATCH_RETURN', 'Monthly fleet odometer checkpoint', CURRENT_DATE - ((22 - v_step) * 30));
        END IF;
    END LOOP;

    -- Ensure final current_odometer checkpoints exist for ABC-1002, ABC-1004, ABC-1003, ABC-1005
    IF v_abc1002 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehicle_odometer_logs WHERE vehicle_id = v_abc1002 AND odometer_reading = 62500) THEN
        INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, notes, logged_at)
        VALUES (v_abc1002, 62500, v_sup_id, 'POST_DISPATCH_RETURN', 'Latest post-route odometer check-in', NOW() - INTERVAL '1 day');
    END IF;
    IF v_abc1004 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehicle_odometer_logs WHERE vehicle_id = v_abc1004 AND odometer_reading = 115000) THEN
        INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, notes, logged_at)
        VALUES (v_abc1004, 115000, v_sup_id, 'POST_DISPATCH_RETURN', 'Latest post-route odometer check-in', NOW() - INTERVAL '1 day');
    END IF;
    IF v_abc1003 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehicle_odometer_logs WHERE vehicle_id = v_abc1003 AND odometer_reading = 28000) THEN
        INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, notes, logged_at)
        VALUES (v_abc1003, 28000, v_sup_id, 'POST_DISPATCH_RETURN', 'Pre-maintenance shop intake odometer', NOW() - INTERVAL '5 days');
    END IF;
    IF v_abc1005 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehicle_odometer_logs WHERE vehicle_id = v_abc1005 AND odometer_reading = 148000) THEN
        INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, notes, logged_at)
        VALUES (v_abc1005, 148000, v_sup_id, 'MANUAL_ADJUSTMENT', 'Yard storage odometer audit', NOW() - INTERVAL '30 days');
    END IF;

    -- B. Additional Vehicle Inspections
    IF v_abc1001 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehicle_inspections WHERE vehicle_id = v_abc1001 AND findings LIKE 'Quarterly safety inspection passed%') THEN
        INSERT INTO vehicle_inspections (vehicle_id, inspector_id, result, findings, issue_detected, allow_dispatch, inspection_date)
        VALUES
            (v_abc1001, v_sup_id, 'PASSED', 'Quarterly safety inspection passed: tires, brakes, and LPG rack locks nominal.', FALSE, TRUE, NOW() - INTERVAL '180 days'),
            (v_abc1001, v_sup_id, 'PASSED', 'Pre-holiday safety inspection passed: lights, horn, and fire extinguisher verified.', FALSE, TRUE, NOW() - INTERVAL '25 days');
    END IF;

    IF v_abc1002 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehicle_inspections WHERE vehicle_id = v_abc1002 AND findings LIKE 'Minor rear tire tread wear%') THEN
        INSERT INTO vehicle_inspections (vehicle_id, inspector_id, result, findings, issue_detected, allow_dispatch, inspection_date)
        VALUES
            (v_abc1002, v_sup_id, 'NEEDS_ATTENTION', 'Minor rear tire tread wear observed; scheduled for rotation during next PM.', TRUE, TRUE, NOW() - INTERVAL '120 days'),
            (v_abc1002, v_sup_id, 'PASSED', 'Post-PM inspection passed: oil filter, air filter, and tire pressure verified.', FALSE, TRUE, NOW() - INTERVAL '7 days');
    END IF;

    IF v_abc1004 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehicle_inspections WHERE vehicle_id = v_abc1004 AND findings LIKE '4x4 suspension and tailgate%') THEN
        INSERT INTO vehicle_inspections (vehicle_id, inspector_id, result, findings, issue_detected, allow_dispatch, inspection_date)
        VALUES
            (v_abc1004, v_sup_id, 'PASSED', '4x4 suspension and tailgate cylinder tie-downs passed roadworthiness check.', FALSE, TRUE, NOW() - INTERVAL '90 days'),
            (v_abc1004, v_sup_id, 'NEEDS_ATTENTION', 'Alternator belt shows slight glazing; monitor and replace at 116,000 km.', TRUE, TRUE, NOW() - INTERVAL '12 days');
    END IF;

    -- C. Additional Incident Reports
    IF v_abc1002 IS NOT NULL AND v_it_tire IS NOT NULL AND NOT EXISTS (SELECT 1 FROM incident_reports WHERE vehicle_id = v_abc1002 AND incident_location = 'Buhangin Diversion Road km 9') THEN
        INSERT INTO incident_reports (vehicle_id, reporter_id, incident_type_id, severity, report_date, incident_location, description)
        VALUES (v_abc1002, v_sales_id, v_it_tire, 'MEDIUM', NOW() - INTERVAL '145 days', 'Buhangin Diversion Road km 9', 'Outer rear right tire punctured by road debris during afternoon delivery run.');
    END IF;

    IF v_abc1001 IS NOT NULL AND v_it_mech IS NOT NULL AND NOT EXISTS (SELECT 1 FROM incident_reports WHERE vehicle_id = v_abc1001 AND incident_location = 'Toril Crossing Highway') THEN
        INSERT INTO incident_reports (vehicle_id, reporter_id, incident_type_id, severity, report_date, incident_location, description)
        VALUES (v_abc1001, v_sales_id, v_it_mech, 'LOW', NOW() - INTERVAL '210 days', 'Toril Crossing Highway', 'Intermittent dashboard battery warning light during idle.');
    END IF;

    IF v_abc1004 IS NOT NULL AND v_it_leak IS NOT NULL AND NOT EXISTS (SELECT 1 FROM incident_reports WHERE vehicle_id = v_abc1004 AND incident_location = 'Panacan Industrial Gate 2') THEN
        INSERT INTO incident_reports (vehicle_id, reporter_id, incident_type_id, severity, report_date, incident_location, description)
        VALUES (v_abc1004, v_sales_id, v_it_leak, 'MEDIUM', NOW() - INTERVAL '65 days', 'Panacan Industrial Gate 2', 'Minor radiator coolant hose seepage noticed after uphill climb.');
    END IF;

    -- D. Additional Historical & Active Work Orders + Maintenance Logs + Receipts
    -- WO-A: Completed PM for ABC-1001 (at 40,000 km)
    IF v_abc1001 IS NOT NULL AND v_mt_pm IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_orders WHERE description LIKE 'Scheduled 40,000 km PM service for ABC-1001%') THEN
        INSERT INTO work_orders (vehicle_id, creator_id, status, maintenance_type_id, request_date, scheduled_date, shop_name, estimated_cost, description)
        VALUES (v_abc1001, v_sup_id, 'COMPLETED', v_mt_pm, NOW() - INTERVAL '190 days', NOW() - INTERVAL '188 days', 'Davao Isuzu Commercial Service', 9200.00, 'Scheduled 40,000 km PM service for ABC-1001: engine oil, fuel filter, and brake adjustment.')
        RETURNING id INTO v_wo_id;

        INSERT INTO approval_requests (work_order_id, decider_id, requested_date, decided_date, amount_requested, is_approved, remarks)
        VALUES (v_wo_id, v_admin_id, NOW() - INTERVAL '190 days', NOW() - INTERVAL '189 days', 9200.00, TRUE, 'Approved routine PM.');

        INSERT INTO maintenance_logs (work_order_id, maintenance_type_id, severity, date_started, date_resolved, parts_cost, labor_cost, downtime_days, odometer_at_service)
        VALUES (v_wo_id, v_mt_pm, 'LOW', NOW() - INTERVAL '188 days', NOW() - INTERVAL '187 days', 6400.00, 2800.00, 1, 40000);

        INSERT INTO work_order_receipts (work_order_id, uploaded_by, file_url)
        VALUES (v_wo_id, v_sup_id, 'seed/mock2.jpg'), (v_wo_id, v_sup_id, 'seed/mock3.jpg');
    END IF;

    -- WO-B: Completed Tire Replacement for ABC-1002
    IF v_abc1002 IS NOT NULL AND v_mt_emerg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_orders WHERE description LIKE 'Emergency rear tire replacement for ABC-1002%') THEN
        SELECT id INTO v_inc_id FROM incident_reports WHERE vehicle_id = v_abc1002 AND incident_location = 'Buhangin Diversion Road km 9' LIMIT 1;
        INSERT INTO work_orders (vehicle_id, creator_id, status, maintenance_type_id, incident_report_id, request_date, scheduled_date, shop_name, estimated_cost, description)
        VALUES (v_abc1002, v_sup_id, 'COMPLETED', v_mt_emerg, v_inc_id, NOW() - INTERVAL '145 days', NOW() - INTERVAL '144 days', 'Mindanao Tire & Vulcanizing Hub', 14800.00, 'Emergency rear tire replacement for ABC-1002 (2x heavy-duty commercial tires + alignment).')
        RETURNING id INTO v_wo_id;

        INSERT INTO approval_requests (work_order_id, decider_id, requested_date, decided_date, amount_requested, is_approved, remarks)
        VALUES (v_wo_id, v_admin_id, NOW() - INTERVAL '145 days', NOW() - INTERVAL '145 days', 14800.00, TRUE, 'Emergency dispatch clearance approved.');

        INSERT INTO maintenance_logs (work_order_id, maintenance_type_id, severity, date_started, date_resolved, parts_cost, labor_cost, downtime_days, odometer_at_service)
        VALUES (v_wo_id, v_mt_emerg, 'MEDIUM', NOW() - INTERVAL '144 days', NOW() - INTERVAL '143 days', 12500.00, 2300.00, 1, 56200);

        INSERT INTO work_order_receipts (work_order_id, uploaded_by, file_url)
        VALUES (v_wo_id, v_sup_id, 'seed/mock4.jpg');
    END IF;

    -- WO-C: Completed PM + Coolant Hose Repair for ABC-1004 (at 110,000 km)
    IF v_abc1004 IS NOT NULL AND v_mt_pm IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_orders WHERE description LIKE 'Scheduled 110,000 km PM and radiator hose replacement%') THEN
        SELECT id INTO v_inc_id FROM incident_reports WHERE vehicle_id = v_abc1004 AND incident_location = 'Panacan Industrial Gate 2' LIMIT 1;
        INSERT INTO work_orders (vehicle_id, creator_id, status, maintenance_type_id, incident_report_id, request_date, scheduled_date, shop_name, estimated_cost, description)
        VALUES (v_abc1004, v_sup_id, 'COMPLETED', v_mt_pm, v_inc_id, NOW() - INTERVAL '64 days', NOW() - INTERVAL '62 days', 'Toyota Davao Fleet Bay', 11400.00, 'Scheduled 110,000 km PM and radiator hose replacement for ABC-1004.')
        RETURNING id INTO v_wo_id;

        INSERT INTO approval_requests (work_order_id, decider_id, requested_date, decided_date, amount_requested, is_approved, remarks)
        VALUES (v_wo_id, v_admin_id, NOW() - INTERVAL '64 days', NOW() - INTERVAL '63 days', 11400.00, TRUE, 'Approved PM and coolant hose fix.');

        INSERT INTO maintenance_logs (work_order_id, maintenance_type_id, severity, date_started, date_resolved, parts_cost, labor_cost, downtime_days, odometer_at_service)
        VALUES (v_wo_id, v_mt_pm, 'MEDIUM', NOW() - INTERVAL '62 days', NOW() - INTERVAL '61 days', 8100.00, 3300.00, 1, 110000);

        INSERT INTO work_order_receipts (work_order_id, uploaded_by, file_url)
        VALUES (v_wo_id, v_sup_id, 'seed/mock5.jpg');
    END IF;

    -- WO-D: Pending Work Order for ABC-1004 alternator belt
    IF v_abc1004 IS NOT NULL AND v_mt_corr IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_orders WHERE description LIKE 'Replace glazed alternator belt on ABC-1004%') THEN
        SELECT id INTO v_insp_id FROM vehicle_inspections WHERE vehicle_id = v_abc1004 AND result = 'NEEDS_ATTENTION' LIMIT 1;
        INSERT INTO work_orders (vehicle_id, creator_id, status, maintenance_type_id, inspection_id, request_date, scheduled_date, shop_name, estimated_cost, description)
        VALUES (v_abc1004, v_sup_id, 'PENDING', v_mt_corr, v_insp_id, NOW() - INTERVAL '2 days', NOW() + INTERVAL '4 days', 'Toyota Davao Fleet Bay', 4200.00, 'Replace glazed alternator belt on ABC-1004 and tensioner pulley check.')
        RETURNING id INTO v_wo_id;

        INSERT INTO approval_requests (work_order_id, requested_date, amount_requested, is_approved, remarks)
        VALUES (v_wo_id, NOW() - INTERVAL '2 days', 4200.00, NULL, 'Awaiting admin budget sign-off.');
    END IF;
END $$;

