-- ============================================================
-- SYSTEM EVENT HISTORY LOGS SEED
-- Seed 005: Populates bootstrap audit history logs reflecting
-- operational setup across User Management, Fleet Management,
-- Fleet Maintenance, Inventory Products, and Sales Customers.
-- ============================================================

-- ============================================================
-- 1. USER MANAGEMENT SEED EVENTS
-- Super Admin creating system administrator, supervisors, sales reps, and drivers
-- ============================================================

INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    sa.id,
    sa.first_name || ' ' || sa.last_name,
    'Super Admin',
    'Created',
    'User Management',
    'USER_CREATED',
    'Created new user account for ''' || target.first_name || ' ' || target.last_name || ''' (' || r.name || ')',
    target.id::text,
    'user',
    NOW() - (offset_val.days || ' days')::interval
FROM users sa
CROSS JOIN (
    VALUES
        ('admin_user',           30),
        ('logistics_supervisor', 29),
        ('sales_supervisor',     29),
        ('plant_supervisor',     28),
        ('sales_user',           28),
        ('samantha_supervisor',  27),
        ('driver_user',          26),
        ('driver_user2',         25),
        ('driver_user3',         25)
) AS offset_val(username, days)
JOIN users target ON target.username = offset_val.username
JOIN roles r ON target.role_id = r.id
WHERE sa.username = 'superadmin'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'USER_CREATED' AND hl.target_id = target.id::text
  );

-- Multi-Role Assignment for Samantha Doe
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    sa.id,
    sa.first_name || ' ' || sa.last_name,
    'Super Admin',
    'Updated',
    'User Management',
    'USER_ROLE_UPDATED',
    'Updated role for user ''samantha_supervisor'' to ''Sales Supervisor + Logistics Supervisor''',
    target.id::text,
    'user',
    NOW() - INTERVAL '26 days'
FROM users sa
CROSS JOIN users target
WHERE sa.username = 'superadmin'
  AND target.username = 'samantha_supervisor'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'USER_ROLE_UPDATED' AND hl.target_id = target.id::text
  );


-- ============================================================
-- 2. INVENTORY MANAGEMENT SEED EVENTS
-- Admin creating standard product catalog items
-- ============================================================

INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    adm.id,
    adm.first_name || ' ' || adm.last_name,
    'Admin',
    'Created',
    'Inventory Management',
    'PRODUCT_CREATED',
    'Created new inventory product ''' || p.name || ''' (' || p.category || ')',
    p.id::text,
    'product',
    NOW() - (po.days || ' days')::interval + (po.mins || ' minutes')::interval
FROM users adm
CROSS JOIN (
    VALUES
        ('Butane Canister 250g', 25, 0),
        ('Butane Canister 170g', 25, 5),
        ('11kg LPG Cylinder',    25, 10),
        ('22kg LPG Cylinder',    25, 15),
        ('50kg LPG Cylinder',    25, 20)
) AS po(prod_name, days, mins)
JOIN products p ON p.name = po.prod_name
WHERE adm.username = 'admin_user'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'PRODUCT_CREATED' AND hl.target_id = p.id::text
  );


-- ============================================================
-- 3. FLEET MANAGEMENT SEED EVENTS
-- Logistics Supervisor registering vehicles, assigning drivers, and updating statuses
-- ============================================================

-- Vehicle Registrations (ABC-1001 through ABC-1005)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Logistics Supervisor',
    'Created',
    'Fleet Management',
    'TRUCK_CREATED',
    'Registered new fleet truck ''' || v.plate_number || ''' (' || v.model || ')',
    v.id::text,
    'truck',
    NOW() - (vo.days || ' days')::interval + (vo.hours || ' hours')::interval
FROM users fm
CROSS JOIN (
    VALUES
        ('ABC-1001', 22, 0),
        ('ABC-1002', 22, 1),
        ('ABC-1003', 22, 2),
        ('ABC-1004', 21, 0),
        ('ABC-1005', 21, 1)
) AS vo(plate, days, hours)
JOIN vehicles v ON v.plate_number = vo.plate
WHERE fm.username = 'logistics_supervisor'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRUCK_CREATED' AND hl.target_id = v.id::text
  );

-- Driver Assignments (ABC-1001 -> Danilo, ABC-1002 -> Roberto, ABC-1004 -> Eduardo)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Logistics Supervisor',
    'Assigned',
    'Fleet Management',
    'TRUCK_DRIVER_ASSIGNED',
    'Assigned driver ''' || d.first_name || ' ' || d.last_name || ''' to truck ''' || v.plate_number || '''',
    v.id::text,
    'truck',
    NOW() - (da.days || ' days')::interval
FROM users fm
CROSS JOIN (
    VALUES
        ('ABC-1001', 20),
        ('ABC-1002', 20),
        ('ABC-1004', 19)
) AS da(plate, days)
JOIN vehicles v ON v.plate_number = da.plate
JOIN users d ON v.driver_id = d.id
WHERE fm.username = 'logistics_supervisor'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRUCK_DRIVER_ASSIGNED'
        AND hl.target_id = v.id::text
        AND hl.details LIKE '%' || d.first_name || '%'
  );

-- Operational Condition Status Updates (ABC-1003 under maintenance, ABC-1005 inactive)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Logistics Supervisor',
    'Updated',
    'Fleet Management',
    'TRUCK_STATUS_UPDATED',
    'Changed status for truck ''' || v.plate_number || ''' to ''' || su.new_status || '''',
    v.id::text,
    'truck',
    NOW() - (su.days || ' days')::interval
FROM users fm
CROSS JOIN (
    VALUES
        ('ABC-1003', 'UNDER_MAINTENANCE', 5),
        ('ABC-1005', 'INACTIVE',          18)
) AS su(plate, new_status, days)
JOIN vehicles v ON v.plate_number = su.plate
WHERE fm.username = 'logistics_supervisor'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRUCK_STATUS_UPDATED'
        AND hl.target_id = v.id::text
        AND hl.details LIKE '%' || su.new_status || '%'
  );


-- ============================================================
-- 4. FLEET MAINTENANCE LIFECYCLE AUDIT TRAIL
-- Inspections, Incidents, Work Orders, Approvals, Finalized Logs, Receipts & Odometers
-- ============================================================

-- Return Odometer Reading for ABC-1001 (45,200 km)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Logistics Supervisor',
    'Updated',
    'Fleet Management',
    'MAINTENANCE_ODOMETER_LOGGED',
    'Recorded odometer reading for vehicle ' || v.plate_number || ': ' || vol.odometer_reading || ' km',
    v.id::text,
    'VEHICLE',
    vol.logged_at
FROM vehicle_odometer_logs vol
JOIN vehicles v ON vol.vehicle_id = v.id
JOIN users fm ON vol.logged_by = fm.id
WHERE v.plate_number = 'ABC-1001'
  AND vol.odometer_reading = 45200
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'MAINTENANCE_ODOMETER_LOGGED' AND hl.target_id = v.id::text
  );

-- Vehicle Inspection on ABC-1003 (Brake pads worn)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name,
    'Logistics Supervisor',
    'Created',
    'Fleet Management',
    'MAINTENANCE_INSPECTION_RECORDED',
    'Recorded vehicle inspection for ' || v.plate_number || ' with result: ' || vi.result,
    vi.id::text,
    'INSPECTION',
    vi.inspection_date
FROM vehicle_inspections vi
JOIN vehicles v ON vi.vehicle_id = v.id
JOIN users u ON vi.inspector_id = u.id
WHERE v.plate_number = 'ABC-1003'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'MAINTENANCE_INSPECTION_RECORDED' AND hl.target_id = vi.id::text
  );

-- Incident Report on ABC-1003 (Reduced brake pedal efficiency on highway)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name,
    'Sales Person',
    'Created',
    'Fleet Management',
    'MAINTENANCE_INCIDENT_REPORTED',
    'Reported ' || ir.severity || ' incident for vehicle ' || v.plate_number || ': ' || ir.description,
    ir.id::text,
    'INCIDENT',
    ir.report_date
FROM incident_reports ir
JOIN vehicles v ON ir.vehicle_id = v.id
JOIN users u ON ir.reporter_id = u.id
WHERE v.plate_number = 'ABC-1003'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'MAINTENANCE_INCIDENT_REPORTED' AND hl.target_id = ir.id::text
  );

-- Work Orders (WO#1 Routine PM on ABC-1002, WO#2 Corrective Brake Repair on ABC-1003)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name,
    'Logistics Supervisor',
    'Created',
    'Fleet Management',
    'MAINTENANCE_WORK_ORDER_CREATED',
    'Created work order #' || wo.id || ' for vehicle ' || v.plate_number,
    wo.id::text,
    'WORK_ORDER',
    wo.request_date
FROM work_orders wo
JOIN vehicles v ON wo.vehicle_id = v.id
JOIN users u ON wo.creator_id = u.id
WHERE NOT EXISTS (
    SELECT 1 FROM history_logs hl
    WHERE hl.action = 'MAINTENANCE_WORK_ORDER_CREATED' AND hl.target_id = wo.id::text
);

-- Cost Approval Requested & Decided for WO#2 (₱18,500 brake repair)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Logistics Supervisor',
    'Created',
    'Fleet Management',
    'MAINTENANCE_APPROVAL_REQUESTED',
    'Submitted cost approval request (₱' || TO_CHAR(ar.amount_requested, 'FM999,990.00') || ') for work order #' || wo.id,
    ar.id::text,
    'APPROVAL_REQUEST',
    ar.requested_date
FROM approval_requests ar
JOIN work_orders wo ON ar.work_order_id = wo.id
CROSS JOIN (SELECT id, first_name, last_name FROM users WHERE username = 'logistics_supervisor') fm
WHERE NOT EXISTS (
    SELECT 1 FROM history_logs hl
    WHERE hl.action = 'MAINTENANCE_APPROVAL_REQUESTED' AND hl.target_id = ar.id::text
);

INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    decider.id,
    decider.first_name || ' ' || decider.last_name,
    'Admin',
    'Updated',
    'Fleet Management',
    'MAINTENANCE_APPROVAL_DECIDED',
    'Work order #' || wo.id || ' approval decision: APPROVED',
    wo.id::text,
    'WORK_ORDER',
    ar.decided_date
FROM approval_requests ar
JOIN work_orders wo ON ar.work_order_id = wo.id
JOIN users decider ON ar.decider_id = decider.id
WHERE ar.is_approved = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'MAINTENANCE_APPROVAL_DECIDED' AND hl.target_id = wo.id::text
  );

-- Finalized Maintenance Log for WO#1 (Routine 60,000 km PM)
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Logistics Supervisor',
    'Created',
    'Fleet Management',
    'MAINTENANCE_LOG_FINALIZED',
    'Finalized maintenance log for work order #' || wo.id,
    ml.id::text,
    'MAINTENANCE_LOG',
    ml.date_resolved
FROM maintenance_logs ml
JOIN work_orders wo ON ml.work_order_id = wo.id
CROSS JOIN (SELECT id, first_name, last_name FROM users WHERE username = 'logistics_supervisor') fm
WHERE NOT EXISTS (
    SELECT 1 FROM history_logs hl
    WHERE hl.action = 'MAINTENANCE_LOG_FINALIZED' AND hl.target_id = ml.id::text
);

-- Receipt Attached to WO#1
INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name,
    'Logistics Supervisor',
    'Created',
    'Fleet Management',
    'MAINTENANCE_RECEIPT_ADDED',
    'Attached receipt image to work order #' || wo.id,
    wor.id::text,
    'RECEIPT',
    ml.date_resolved + INTERVAL '1 hour'
FROM work_order_receipts wor
JOIN work_orders wo ON wor.work_order_id = wo.id
JOIN users u ON wor.uploaded_by = u.id
LEFT JOIN maintenance_logs ml ON ml.work_order_id = wo.id
WHERE NOT EXISTS (
    SELECT 1 FROM history_logs hl
    WHERE hl.action = 'MAINTENANCE_RECEIPT_ADDED' AND hl.target_id = wor.id::text
);


-- ============================================================
-- 5. SALES & DELIVERY SEED EVENTS
-- Sales Person registering customer profiles across Davao City
-- ============================================================

INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    sp.id,
    sp.first_name || ' ' || sp.last_name,
    'Sales Person',
    'Created',
    'Sales & Delivery',
    'CUSTOMER_CREATED',
    'Registered new customer profile ''' || c.name || ''' (' || c.customer_type || ')',
    c.id::text,
    'customer',
    NOW() - (co.days || ' days')::interval
FROM users sp
CROSS JOIN (
    VALUES
        ('Juan Dela Cruz',                         15),
        ('Madayaw Grill & Restaurant',             14),
        ('Davao Gas Central Trading',              12),
        ('Aling Nena General Store',               11),
        ('Davao Chong Hua High School Canteen',    10),
        ('Southern Mindanao Poultry & Agro Farms', 9),
        ('Matina Heights Bakery & Pastries',       8),
        ('Kusina Dabawenyo Seafood & BBQ',         7)
) AS co(cust_name, days)
JOIN customers c ON c.name = co.cust_name
WHERE sp.username = 'sales_user'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'CUSTOMER_CREATED' AND hl.target_id = c.id::text
  );
