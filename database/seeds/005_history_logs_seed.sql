-- ============================================================
-- SYSTEM EVENT HISTORY LOGS SEED
-- ============================================================
-- Populates initial history logs reflecting the bootstrap and seed events
-- across User Management, Fleet Management, Inventory Management, and Sales.

-- 1. USER MANAGEMENT SEED EVENTS
-- Super Admin creating system administrator, fleet manager, and sales person accounts

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
    NOW() - INTERVAL '30 days'
FROM users sa
CROSS JOIN users target
JOIN roles r ON target.role_id = r.id
WHERE sa.username = 'superadmin'
  AND target.username = 'admin_user'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'USER_CREATED' AND hl.target_id = target.id::text
  );

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
    NOW() - INTERVAL '29 days'
FROM users sa
CROSS JOIN users target
JOIN roles r ON target.role_id = r.id
WHERE sa.username = 'superadmin'
  AND target.username = 'fleet_user'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'USER_CREATED' AND hl.target_id = target.id::text
  );

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
    NOW() - INTERVAL '28 days'
FROM users sa
CROSS JOIN users target
JOIN roles r ON target.role_id = r.id
WHERE sa.username = 'superadmin'
  AND target.username = 'sales_user'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'USER_CREATED' AND hl.target_id = target.id::text
  );


-- 2. INVENTORY MANAGEMENT SEED EVENTS
-- Admin creating standard inventory products

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
    NOW() - INTERVAL '25 days'
FROM users adm
CROSS JOIN products p
WHERE adm.username = 'admin_user'
  AND p.name = 'Butane Canister 250g'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'PRODUCT_CREATED' AND hl.target_id = p.id::text
  );

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
    NOW() - INTERVAL '25 days' + INTERVAL '5 minutes'
FROM users adm
CROSS JOIN products p
WHERE adm.username = 'admin_user'
  AND p.name = '11kg LPG Cylinder'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'PRODUCT_CREATED' AND hl.target_id = p.id::text
  );

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
    NOW() - INTERVAL '25 days' + INTERVAL '10 minutes'
FROM users adm
CROSS JOIN products p
WHERE adm.username = 'admin_user'
  AND p.name = '22kg LPG Cylinder'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'PRODUCT_CREATED' AND hl.target_id = p.id::text
  );


-- 3. FLEET MANAGEMENT SEED EVENTS
-- Fleet Manager registering vehicles, assigning driver, and managing maintenance

INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Fleet Manager',
    'Created',
    'Fleet Management',
    'TRUCK_CREATED',
    'Registered new fleet truck ''' || t.plate_number || ''' (' || t.model || ')',
    t.id::text,
    'truck',
    NOW() - INTERVAL '20 days'
FROM users fm
CROSS JOIN trucks t
WHERE fm.username = 'fleet_user'
  AND t.plate_number = 'ABC-1001'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRUCK_CREATED' AND hl.target_id = t.id::text
  );

INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Fleet Manager',
    'Assigned',
    'Fleet Management',
    'TRUCK_DRIVER_ASSIGNED',
    'Assigned driver ''' || d.first_name || ' ' || d.last_name || ''' to truck ''' || t.plate_number || '''',
    t.id::text,
    'truck',
    NOW() - INTERVAL '19 days'
FROM users fm
CROSS JOIN trucks t
JOIN users d ON t.driver_id = d.id
WHERE fm.username = 'fleet_user'
  AND t.plate_number = 'ABC-1001'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRUCK_DRIVER_ASSIGNED' AND hl.target_id = t.id::text
  );

INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Fleet Manager',
    'Created',
    'Fleet Management',
    'TRUCK_CREATED',
    'Registered new fleet truck ''' || t.plate_number || ''' (' || t.model || ')',
    t.id::text,
    'truck',
    NOW() - INTERVAL '20 days' + INTERVAL '30 minutes'
FROM users fm
CROSS JOIN trucks t
WHERE fm.username = 'fleet_user'
  AND t.plate_number = 'ABC-1002'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRUCK_CREATED' AND hl.target_id = t.id::text
  );

INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Fleet Manager',
    'Created',
    'Fleet Management',
    'TRUCK_CREATED',
    'Registered new fleet truck ''' || t.plate_number || ''' (' || t.model || ')',
    t.id::text,
    'truck',
    NOW() - INTERVAL '20 days' + INTERVAL '1 hour'
FROM users fm
CROSS JOIN trucks t
WHERE fm.username = 'fleet_user'
  AND t.plate_number = 'ABC-1003'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRUCK_CREATED' AND hl.target_id = t.id::text
  );

INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details, target_id, target_type, created_at)
SELECT
    fm.id,
    fm.first_name || ' ' || fm.last_name,
    'Fleet Manager',
    'Updated',
    'Fleet Management',
    'TRUCK_STATUS_UPDATED',
    'Changed status for truck ''' || t.plate_number || ''' to ''UNDER_MAINTENANCE''',
    t.id::text,
    'truck',
    NOW() - INTERVAL '5 days'
FROM users fm
CROSS JOIN trucks t
WHERE fm.username = 'fleet_user'
  AND t.plate_number = 'ABC-1003'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'TRUCK_STATUS_UPDATED' AND hl.target_id = t.id::text
  );


-- 4. SALES & DELIVERY SEED EVENTS
-- Sales Person / Admin registering customer profiles

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
    NOW() - INTERVAL '15 days'
FROM users sp
CROSS JOIN customers c
WHERE sp.username = 'sales_user'
  AND c.name = 'Juan Dela Cruz'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'CUSTOMER_CREATED' AND hl.target_id = c.id::text
  );

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
    NOW() - INTERVAL '14 days'
FROM users sp
CROSS JOIN customers c
WHERE sp.username = 'sales_user'
  AND c.name = 'Madayaw Grill & Restaurant'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'CUSTOMER_CREATED' AND hl.target_id = c.id::text
  );

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
    NOW() - INTERVAL '12 days'
FROM users sp
CROSS JOIN customers c
WHERE sp.username = 'sales_user'
  AND c.name = 'Davao Gas Central Trading'
  AND NOT EXISTS (
      SELECT 1 FROM history_logs hl
      WHERE hl.action = 'CUSTOMER_CREATED' AND hl.target_id = c.id::text
  );
