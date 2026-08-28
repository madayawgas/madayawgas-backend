-- ============================================================
-- FLEET AND MAINTENANCE SEED
-- Reference Data, Sample Fleet Vehicles, Inspections,
-- Incident Reports, Work Orders, Approvals, and Logs
-- ============================================================


-- ============================================================
-- 1. MAINTENANCE TYPES
-- ============================================================

INSERT INTO maintenance_types (type_name)
VALUES
    ('Preventive Maintenance'),
    ('Corrective Maintenance'),
    ('Tire Replacement & Balancing'),
    ('Oil & Filter Change'),
    ('Brake System Overhaul'),
    ('Battery & Electrical Service'),
    ('Engine Tune-up'),
    ('Emergency Repair')
ON CONFLICT (type_name) DO NOTHING;


-- ============================================================
-- 2. INCIDENT TYPES
-- ============================================================

INSERT INTO incident_types (type_name)
VALUES
    ('Minor Collision'),
    ('Major Collision'),
    ('Flat Tire'),
    ('Engine Breakdown'),
    ('Engine Overheating'),
    ('Brake Failure'),
    ('Electrical Failure'),
    ('Fuel Leak')
ON CONFLICT (type_name) DO NOTHING;


-- ============================================================
-- 3. TRUCKS (FLEET VEHICLES)
-- ============================================================

INSERT INTO trucks (plate_number, driver_id, model, year_model, current_odometer, last_pm_odometer, status)
SELECT
    'ABC-1001',
    u.id,
    'Isuzu Elf N-Series',
    2022,
    45000,
    40000,
    'ACTIVE'::truck_status
FROM users u
WHERE u.username = 'sales_user'
ON CONFLICT (plate_number) DO UPDATE SET
    driver_id = EXCLUDED.driver_id,
    model = EXCLUDED.model,
    year_model = EXCLUDED.year_model,
    current_odometer = EXCLUDED.current_odometer,
    last_pm_odometer = EXCLUDED.last_pm_odometer,
    status = EXCLUDED.status;

INSERT INTO trucks (plate_number, driver_id, model, year_model, current_odometer, last_pm_odometer, status)
VALUES
    ('ABC-1002', NULL, 'Fuso Canter FE71', 2021, 62500, 60000, 'ACTIVE'),
    ('ABC-1003', NULL, 'Hino 300 Series', 2023, 28000, 25000, 'UNDER_MAINTENANCE'),
    ('ABC-1004', NULL, 'Isuzu Forward', 2020, 115000, 110000, 'ACTIVE'),
    ('ABC-1005', NULL, 'Hyundai HD78 GT', 2019, 148000, 140000, 'INACTIVE')
ON CONFLICT (plate_number) DO UPDATE SET
    driver_id = EXCLUDED.driver_id,
    model = EXCLUDED.model,
    year_model = EXCLUDED.year_model,
    current_odometer = EXCLUDED.current_odometer,
    last_pm_odometer = EXCLUDED.last_pm_odometer,
    status = EXCLUDED.status;


-- ============================================================
-- 4. VEHICLE INSPECTIONS
-- ============================================================

INSERT INTO vehicle_inspections (truck_id, inspector_id, result, inspection_date, findings, issue_detected)
SELECT
    t.id,
    u.id,
    'PASSED'::inspection_result,
    NOW() - INTERVAL '3 days',
    'Routine pre-trip inspection passed. All fluid levels, brakes, tires, and lights in good condition.',
    FALSE
FROM trucks t
CROSS JOIN users u
WHERE t.plate_number = 'ABC-1001' AND u.username = 'fleet_user'
AND NOT EXISTS (
    SELECT 1 FROM vehicle_inspections vi
    WHERE vi.truck_id = t.id AND vi.findings LIKE 'Routine pre-trip inspection passed%'
);

INSERT INTO vehicle_inspections (truck_id, inspector_id, result, inspection_date, findings, issue_detected)
SELECT
    t.id,
    u.id,
    'NEEDS_ATTENTION'::inspection_result,
    NOW() - INTERVAL '5 days',
    'Brake pads worn near minimum thickness. Front brake pads require replacement.',
    TRUE
FROM trucks t
CROSS JOIN users u
WHERE t.plate_number = 'ABC-1003' AND u.username = 'fleet_user'
AND NOT EXISTS (
    SELECT 1 FROM vehicle_inspections vi
    WHERE vi.truck_id = t.id AND vi.findings LIKE 'Brake pads worn near minimum thickness%'
);


-- ============================================================
-- 5. INCIDENT REPORTS
-- ============================================================

INSERT INTO incident_reports (truck_id, reporter_id, incident_type_id, severity, report_date, incident_location, description)
SELECT
    t.id,
    u.id,
    it.id,
    'HIGH'::maintenance_severity,
    NOW() - INTERVAL '4 days',
    'Davao-Cotabato Highway km 18',
    'Driver experienced spongy brake pedal response and reduced braking efficiency while descending slight incline.'
FROM trucks t
CROSS JOIN users u
CROSS JOIN incident_types it
WHERE t.plate_number = 'ABC-1003'
  AND u.username = 'sales_user'
  AND it.type_name = 'Brake Failure'
  AND NOT EXISTS (
      SELECT 1 FROM incident_reports ir
      WHERE ir.truck_id = t.id AND ir.incident_location = 'Davao-Cotabato Highway km 18'
  );


-- ============================================================
-- 6. WORK ORDERS
-- ============================================================

-- Work Order 1: Completed Routine PM for ABC-1002
INSERT INTO work_orders (truck_id, creator_id, status, maintenance_type_id, request_date, scheduled_date, shop_name, estimated_cost, description)
SELECT
    t.id,
    u.id,
    'COMPLETED'::work_order_status,
    mt.id,
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '8 days',
    'Davao Diesel & Fleet Services',
    7500.00,
    'Scheduled 60,000 km regular preventive maintenance service and oil change.'
FROM trucks t
CROSS JOIN users u
CROSS JOIN maintenance_types mt
WHERE t.plate_number = 'ABC-1002'
  AND u.username = 'fleet_user'
  AND mt.type_name = 'Oil & Filter Change'
  AND NOT EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.truck_id = t.id AND wo.description LIKE 'Scheduled 60,000 km%'
  );

-- Work Order 2: Approved Brake Repair for ABC-1003
INSERT INTO work_orders (truck_id, creator_id, status, maintenance_type_id, inspection_id, incident_report_id, request_date, scheduled_date, shop_name, estimated_cost, description)
SELECT
    t.id,
    u.id,
    'APPROVED'::work_order_status,
    mt.id,
    (SELECT vi.id FROM vehicle_inspections vi WHERE vi.truck_id = t.id ORDER BY vi.created_at DESC LIMIT 1),
    (SELECT ir.id FROM incident_reports ir WHERE ir.truck_id = t.id ORDER BY ir.created_at DESC LIMIT 1),
    NOW() - INTERVAL '3 days',
    NOW() + INTERVAL '2 days',
    'Precision Heavy Auto Repair Center',
    18500.00,
    'Replace front and rear brake pads, resurface brake rotors, and flush brake fluid.'
FROM trucks t
CROSS JOIN users u
CROSS JOIN maintenance_types mt
WHERE t.plate_number = 'ABC-1003'
  AND u.username = 'fleet_user'
  AND mt.type_name = 'Brake System Overhaul'
  AND NOT EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.truck_id = t.id AND wo.description LIKE 'Replace front and rear brake pads%'
  );


-- ============================================================
-- 7. APPROVAL REQUESTS
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
ON CONFLICT (work_order_id) DO UPDATE SET
    amount_requested = EXCLUDED.amount_requested,
    is_approved = EXCLUDED.is_approved,
    remarks = EXCLUDED.remarks;


-- ============================================================
-- 8. MAINTENANCE LOGS
-- ============================================================

INSERT INTO maintenance_logs (work_order_id, maintenance_type_id, severity, date_started, date_resolved, parts_cost, labor_cost, downtime_days, odometer_at_service, official_receipt_number)
SELECT
    wo.id,
    mt.id,
    'LOW'::maintenance_severity,
    NOW() - INTERVAL '8 days',
    NOW() - INTERVAL '7 days',
    5200.00,
    2300.00,
    1,
    60120,
    'OR-2026-00891'
FROM work_orders wo
JOIN maintenance_types mt ON mt.type_name = 'Oil & Filter Change'
WHERE wo.description LIKE 'Scheduled 60,000 km%'
ON CONFLICT (work_order_id) DO UPDATE SET
    parts_cost = EXCLUDED.parts_cost,
    labor_cost = EXCLUDED.labor_cost,
    downtime_days = EXCLUDED.downtime_days,
    odometer_at_service = EXCLUDED.odometer_at_service,
    official_receipt_number = EXCLUDED.official_receipt_number;
