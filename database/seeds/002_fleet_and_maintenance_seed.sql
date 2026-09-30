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
VALUES
    ('ABC-1002', NULL, 'DELIVERY_TRUCK', 'Fuso Canter FE71', 2021, 62500, 60000, 'ACTIVE'),
    ('ABC-1003', NULL, 'DELIVERY_TRUCK', 'Hino 300 Series', 2023, 28000, 25000, 'UNDER_MAINTENANCE'),
    ('ABC-1004', NULL, 'SERVICE_PICKUP', 'Toyota Hilux Single Cab', 2020, 115000, 110000, 'ACTIVE'),
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

INSERT INTO work_order_receipts (work_order_id, uploaded_by, file_url, receipt_number, vendor_name, amount, receipt_type, receipt_date)
SELECT
    wo.id,
    u.id,
    'https://storage.madayawgas.com/receipts/2026/09/OR-2026-00891.pdf',
    'OR-2026-00891',
    'Davao Diesel & Fleet Services',
    7500.00,
    'PARTS',
    NOW() - INTERVAL '7 days'
FROM work_orders wo
CROSS JOIN users u
WHERE wo.description LIKE 'Scheduled 60,000 km%'
  AND u.username = 'logistics_supervisor'
  AND NOT EXISTS (
      SELECT 1 FROM work_order_receipts wor
      WHERE wor.work_order_id = wo.id AND wor.receipt_number = 'OR-2026-00891'
  );
