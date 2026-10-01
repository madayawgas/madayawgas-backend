const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const app = require('../app');
const { query, pool } = require('../../database/connection');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    server.close();
  }
  await pool.end();
});

function parseCookieHeader(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/mg_sid=([^;]+)/);
  return match ? match[1] : null;
}

test('Inventory Subsystem & Route Reconciliation Engine Tests', async (t) => {
  let adminCookie;
  let plantCookie;
  let salesRep1Cookie;
  let salesRep2Cookie;

  let adminUser;
  let plantUser;
  let salesRep1User;
  let salesRep2User;
  let driverUser;

  let testTruck;
  let testZone;
  let testButaneProduct;
  let testLpgProduct;

  beforeEach(async () => {
    // 1. Clean test records with isolation prefixes
    await query(`
      DELETE FROM history_logs 
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_recon_%')
         OR details LIKE '%TEST-RECON-%'
    `);

    await query(`
      DELETE FROM trip_stock_reconciliations 
      WHERE trip_id IN (SELECT id FROM trips WHERE trip_number LIKE 'TEST-RECON-%')
    `);

    await query(`
      DELETE FROM trip_load_items 
      WHERE load_id IN (
        SELECT id FROM trip_loads 
        WHERE trip_id IN (SELECT id FROM trips WHERE trip_number LIKE 'TEST-RECON-%')
      )
    `);

    await query(`
      DELETE FROM trip_loads 
      WHERE trip_id IN (SELECT id FROM trips WHERE trip_number LIKE 'TEST-RECON-%')
    `);

    await query(`
      DELETE FROM trips 
      WHERE trip_number LIKE 'TEST-RECON-%'
    `);

    await query(`
      DELETE FROM plant_stock_adjustments 
      WHERE reason LIKE '%TEST-RECON-%'
         OR supplier_invoice_number LIKE '%TEST-RECON-%'
         OR product_id IN (SELECT id FROM products WHERE name LIKE 'TEST-RECON-%')
    `);

    await query(`
      DELETE FROM plant_inventory 
      WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'TEST-RECON-%')
    `);

    await query(`
      DELETE FROM products 
      WHERE name LIKE 'TEST-RECON-%'
    `);

    await query(`
      DELETE FROM vehicles 
      WHERE plate_number LIKE 'TEST-RECON-%'
    `);

    await query(`
      DELETE FROM service_zones 
      WHERE code LIKE 'TEST-RECON-%' OR name LIKE 'TEST-RECON-%'
    `);


    await query(`
      DELETE FROM audit_logs 
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_recon_%')
         OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_recon_%')
    `);

    await query(`
      DELETE FROM sessions 
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_recon_%')
    `);

    await query(`
      DELETE FROM user_roles 
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_recon_%')
    `);

    await query(`
      DELETE FROM users 
      WHERE username LIKE 'test_recon_%'
    `);

    // 2. Fetch role IDs
    const adminRoleId = (await query(`SELECT id FROM roles WHERE name = 'Admin'`)).rows[0].id;
    const plantRoleId = (await query(`SELECT id FROM roles WHERE name = 'Plant Supervisor'`)).rows[0].id;
    const salesRoleId = (await query(`SELECT id FROM roles WHERE name = 'Sales Person'`)).rows[0].id;
    const driverRoleId = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    const adminRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING *`,
      ['test_recon_admin', passwordHash, 'InvAdmin', 'User', '+639178000001', adminRoleId]
    );
    adminUser = adminRes.rows[0];

    const plantRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING *`,
      ['test_recon_plant', passwordHash, 'InvPlant', 'Supervisor', '+639178000002', plantRoleId]
    );
    plantUser = plantRes.rows[0];

    const sales1Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING *`,
      ['test_recon_sales1', passwordHash, 'InvSales', 'One', '+639178000003', salesRoleId]
    );
    salesRep1User = sales1Res.rows[0];

    const sales2Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING *`,
      ['test_recon_sales2', passwordHash, 'InvSales', 'Two', '+639178000004', salesRoleId]
    );
    salesRep2User = sales2Res.rows[0];

    const driverRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING *`,
      ['test_recon_driver', passwordHash, 'InvDriver', 'User', '+639178000005', driverRoleId]
    );
    driverUser = driverRes.rows[0];

    // Assign users to user_roles
    await query(`INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, TRUE)`, [
      adminUser.id,
      adminRoleId,
    ]);
    await query(`INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, TRUE)`, [
      plantUser.id,
      plantRoleId,
    ]);
    await query(`INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, TRUE)`, [
      salesRep1User.id,
      salesRoleId,
    ]);
    await query(`INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, TRUE)`, [
      salesRep2User.id,
      salesRoleId,
    ]);
    await query(`INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, TRUE)`, [
      driverUser.id,
      driverRoleId,
    ]);


    // 4. Create operational vehicle and zone
    const truckRes = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, current_odometer, last_pm_odometer, status, driver_id)
      VALUES ('TEST-RECON-TRK1', 'Isuzu Elf Route Truck', 2024, 10000, 10000, 'ACTIVE', $1)
      RETURNING *
    `, [driverUser.id]);
    testTruck = truckRes.rows[0];

    const zoneRes = await query(`
      INSERT INTO service_zones (code, name, description, is_active)
      VALUES ('TEST-RECON-Z1', 'TEST-RECON- Route Zone', 'Test Zone Description', TRUE)
      RETURNING *
    `);

    testZone = zoneRes.rows[0];

    // 5. Create dedicated test products
    const prodButaneRes = await query(`
      INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
      VALUES ('TEST-RECON- Butane 170g', 'Canister', 'CANISTER', 0.170, TRUE)
      RETURNING *
    `);
    testButaneProduct = prodButaneRes.rows[0];

    const prodLpgRes = await query(`
      INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
      VALUES ('TEST-RECON- LPG 11kg', 'LPG Cylinder', 'CYLINDER', 11.000, TRUE)
      RETURNING *
    `);
    testLpgProduct = prodLpgRes.rows[0];

    // Seed baseline plant inventory for test products
    await query(`
      INSERT INTO plant_inventory (product_id, quantity_filled, quantity_empty_good, quantity_defective)
      VALUES ($1, 500, 100, 10)
    `, [testButaneProduct.id]);

    await query(`
      INSERT INTO plant_inventory (product_id, quantity_filled, quantity_empty_good, quantity_defective)
      VALUES ($1, 200, 50, 5)
    `, [testLpgProduct.id]);

    // 6. Obtain session cookies
    const loginUser = async (username, password) => {
      const res = await fetch(`${baseUrl}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      return parseCookieHeader(res);
    };

    adminCookie = await loginUser('test_recon_admin', 'TestPass123!');
    plantCookie = await loginUser('test_recon_plant', 'TestPass123!');
    salesRep1Cookie = await loginUser('test_recon_sales1', 'TestPass123!');
    salesRep2Cookie = await loginUser('test_recon_sales2', 'TestPass123!');
  });

  // ============================================================
  // 1. RBAC ROUTE PROTECTIONS
  // ============================================================
  await t.test('1. RBAC Route Protections - 401 Unauthorized vs 403 Forbidden vs 200/201 OK', async () => {
    // Unauthenticated request -> 401
    const unauthRes = await fetch(`${baseUrl}/api/inventory/plant`);
    assert.equal(unauthRes.status, 401);

    // Sales representative attempting supplier restock -> 403 (requires inventory.manage)
    const salesRestockRes = await fetch(`${baseUrl}/api/inventory/plant/restock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesRep1Cookie}`,
      },
      body: JSON.stringify({
        productId: testButaneProduct.id,
        quantityUnits: 50,
      }),
    });
    assert.equal(salesRestockRes.status, 403);

    // Plant Supervisor calling plant overview -> 200 OK
    const plantOverviewRes = await fetch(`${baseUrl}/api/inventory/plant`, {
      headers: { Cookie: `mg_sid=${plantCookie}` },
    });
    assert.equal(plantOverviewRes.status, 200);
    const overviewJson = await plantOverviewRes.json();
    assert.equal(overviewJson.status, 'success');
    assert.ok(Array.isArray(overviewJson.data.inventory));
  });

  // ============================================================
  // 2. PLANT BULK INVENTORY OPERATIONS (RESTOCK & DEFECT QUARANTINE)
  // ============================================================
  await t.test('2. Plant Bulk Stock Operations - Supplier Restock & Defect Quarantine with Event Auditing', async () => {
    // A. Supplier Restock (+300 filled units)
    const restockRes = await fetch(`${baseUrl}/api/inventory/plant/restock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${plantCookie}`,
      },
      body: JSON.stringify({
        productId: testButaneProduct.id,
        condition: 'FILLED',
        quantityUnits: 300,
        supplierInvoiceNumber: 'INV-TEST-RECON-001',
        reason: 'TEST-RECON- Regular shipment arrival',
      }),
    });
    assert.equal(restockRes.status, 201);
    const restockJson = await restockRes.json();
    assert.equal(restockJson.status, 'success');
    // Baseline was 500 + 300 = 800
    assert.equal(restockJson.data.stock.quantity_filled, 800);

    // Verify plant_stock_adjustments record
    const adjCheck = await query(
      `SELECT * FROM plant_stock_adjustments WHERE supplier_invoice_number = 'INV-TEST-RECON-001'`
    );
    assert.equal(adjCheck.rows.length, 1);
    assert.equal(adjCheck.rows[0].delta_quantity, 300);
    assert.equal(adjCheck.rows[0].adjustment_type, 'SUPPLIER_PURCHASE');

    // B. Defect Quarantine (Quarantine 20 FILLED units to DEFECTIVE)
    const quarantineRes = await fetch(`${baseUrl}/api/inventory/plant/quarantine-defects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${plantCookie}`,
      },
      body: JSON.stringify({
        productId: testButaneProduct.id,
        sourceCondition: 'FILLED',
        quantityUnits: 20,
        reason: 'TEST-RECON- Leakers identified during quality audit',
      }),
    });
    assert.equal(quarantineRes.status, 200);
    const quarantineJson = await quarantineRes.json();
    assert.equal(quarantineJson.status, 'success');
    // Filled: 800 - 20 = 780; Defective: 10 + 20 = 30
    assert.equal(quarantineJson.data.stock.quantity_filled, 780);
    assert.equal(quarantineJson.data.stock.quantity_defective, 30);

    // C. Validation: Attempting to quarantine more than available returns 400
    const overQuarantineRes = await fetch(`${baseUrl}/api/inventory/plant/quarantine-defects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${plantCookie}`,
      },
      body: JSON.stringify({
        productId: testButaneProduct.id,
        sourceCondition: 'FILLED',
        quantityUnits: 999999,
        reason: 'TEST-RECON- Exceeds inventory',
      }),
    });
    assert.equal(overQuarantineRes.status, 400);

    // D. View Adjustments Log
    const adjRes = await fetch(
      `${baseUrl}/api/inventory/plant/adjustments?productId=${testButaneProduct.id}`,
      { headers: { Cookie: `mg_sid=${plantCookie}` } }
    );
    assert.equal(adjRes.status, 200);
    const adjListJson = await adjRes.json();
    assert.ok(adjListJson.data.adjustments.length >= 2);
  });

  // ============================================================
  // 3. SUGGESTED EQUAL SPLIT HELPER
  // ============================================================
  await t.test('3. Suggested Equal Loading Split Helper with Remaining Unit Distribution', async () => {
    // Current filled stock for Butane is 500
    const splitRes = await fetch(
      `${baseUrl}/api/inventory/plant/suggested-split?productId=${testButaneProduct.id}&activeTripCount=4`,
      { headers: { Cookie: `mg_sid=${plantCookie}` } }
    );
    assert.equal(splitRes.status, 200);
    const splitJson = await splitRes.json();
    assert.equal(splitJson.status, 'success');

    // 500 / 4 = 125 units per truck
    assert.equal(splitJson.data.suggestedUnitsPerTruck, 125);
    // 125 / 24 = 5 crates
    assert.equal(splitJson.data.suggestedCratesPerTruck, 5);
    // 500 - (125 * 4) = 0 remaining
    assert.equal(splitJson.data.remainingUnits, 0);
  });

  // ============================================================
  // 4. DISPATCH LOAD & MIDDAY RELOAD (PLANT DEDUCTION & MULTI-LOAD)
  // ============================================================
  await t.test('4. Dispatch Load & Midday Reload - Decrements Plant Stock & Multi-Load Tracking', async () => {
    // A. Create an active trip
    const tripRes = await query(`
      INSERT INTO trips (trip_number, truck_id, driver_id, sales_user_id, zone_id, status)
      VALUES ('TEST-RECON-TRIP-001', $1, $2, $3, $4, 'IN_PROGRESS')
      RETURNING *
    `, [testTruck.id, driverUser.id, salesRep1User.id, testZone.id]);
    const trip = tripRes.rows[0];

    // Initial plant stock for test LPG is 200 filled; test Butane is 500 filled
    // B. Dispatch initial load manifest: 100 units of Butane, 50 units of LPG
    const load1Res = await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/dispatch-load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        remarks: 'TEST-RECON- Morning dispatch load manifest',
        items: [
          { productId: testButaneProduct.id, quantityUnits: 100 },
          { productId: testLpgProduct.id, quantityUnits: 50 },
        ],
      }),
    });
    assert.equal(load1Res.status, 201);
    const load1Json = await load1Res.json();
    assert.equal(load1Json.status, 'success');
    assert.ok(load1Json.data.load.slip_number.startsWith('LOAD-'));

    // Verify plant stock was decremented
    const plantButaneAfterLoad1 = await query(
      `SELECT quantity_filled FROM plant_inventory WHERE product_id = $1`,
      [testButaneProduct.id]
    );
    // 500 - 100 = 400
    assert.equal(plantButaneAfterLoad1.rows[0].quantity_filled, 400);

    const plantLpgAfterLoad1 = await query(
      `SELECT quantity_filled FROM plant_inventory WHERE product_id = $1`,
      [testLpgProduct.id]
    );
    // 200 - 50 = 150
    assert.equal(plantLpgAfterLoad1.rows[0].quantity_filled, 150);

    // C. Validation: Insufficient plant stock returns 400 Bad Request
    const overDispatchRes = await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/dispatch-load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        remarks: 'TEST-RECON- Requesting more than available',
        items: [{ productId: testLpgProduct.id, quantityUnits: 999999 }],
      }),
    });
    assert.equal(overDispatchRes.status, 400);

    // D. Midday Reload (Truck returns for reload: 50 additional Butane units)
    const load2Res = await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/dispatch-load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        remarks: 'TEST-RECON- Midday reload top-up',
        items: [{ productId: testButaneProduct.id, quantityUnits: 50 }],
      }),
    });
    assert.equal(load2Res.status, 201);

    // Plant Butane: 400 - 50 = 350
    const plantButaneAfterLoad2 = await query(
      `SELECT quantity_filled FROM plant_inventory WHERE product_id = $1`,
      [testButaneProduct.id]
    );
    assert.equal(plantButaneAfterLoad2.rows[0].quantity_filled, 350);


    // E. Verify Transfers list for the trip
    const transfersRes = await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/transfers`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(transfersRes.status, 200);
    const transfersJson = await transfersRes.json();
    assert.equal(transfersJson.data.count, 2);
  });

  // ============================================================
  // 5. CABIN VEHICLE ACTIVE STOCK VISIBILITY
  // ============================================================
  await t.test('5. Cabin Active Stock Visibility & Ownership Scoping', async () => {
    // Create dedicated trip for visibility test
    const tripRes = await query(`
      INSERT INTO trips (trip_number, truck_id, driver_id, sales_user_id, zone_id, status)
      VALUES ('TEST-RECON-TRIP-005', $1, $2, $3, $4, 'IN_PROGRESS')
      RETURNING *
    `, [testTruck.id, driverUser.id, salesRep1User.id, testZone.id]);
    const trip = tripRes.rows[0];

    // Dispatch load of 150 Butane and 50 LPG
    await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/dispatch-load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        remarks: 'TEST-RECON- Load for active stock visibility',
        items: [
          { productId: testButaneProduct.id, quantityUnits: 150 },
          { productId: testLpgProduct.id, quantityUnits: 50 },
        ],
      }),
    });

    // SalesRep 1 (assigned sales user) can view active stock -> 200 OK
    const rep1StockRes = await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/stock`, {
      headers: { Cookie: `mg_sid=${salesRep1Cookie}` },
    });
    assert.equal(rep1StockRes.status, 200);
    const rep1StockJson = await rep1StockRes.json();
    assert.equal(rep1StockJson.status, 'success');

    // Total loaded full: Butane = 150; LPG = 50
    const butaneItem = rep1StockJson.data.items.find((i) => i.productId === testButaneProduct.id);
    assert.equal(butaneItem.loadedFull, 150);
    assert.equal(butaneItem.currentOnBoardFull, 150);
    assert.equal(butaneItem.cratesOnBoardFull, 6); // 150 / 24 = 6 crates

    const lpgItem = rep1StockJson.data.items.find((i) => i.productId === testLpgProduct.id);
    assert.equal(lpgItem.loadedFull, 50);
    assert.equal(lpgItem.currentOnBoardFull, 50);

    // SalesRep 2 (not assigned) receives 403 Forbidden
    const rep2StockRes = await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/stock`, {
      headers: { Cookie: `mg_sid=${salesRep2Cookie}` },
    });
    assert.equal(rep2StockRes.status, 403);
  });

  // ============================================================
  // 6. RETURN UNLOAD (PLANT BUCKET INCREMENTS)
  // ============================================================
  await t.test('6. Return Unload - Increments Plant Filled, Empty Good, and Defective Buckets', async () => {
    // Create dedicated trip for return unload test
    const tripRes = await query(`
      INSERT INTO trips (trip_number, truck_id, driver_id, sales_user_id, zone_id, status)
      VALUES ('TEST-RECON-TRIP-006', $1, $2, $3, $4, 'IN_PROGRESS')
      RETURNING *
    `, [testTruck.id, driverUser.id, salesRep1User.id, testZone.id]);
    const trip = tripRes.rows[0];

    // Truck returns with:
    // Butane: 20 unsold FILLED, 120 returned EMPTY_GOOD, 5 returned DEFECTIVE (leakers mid-route)
    // LPG: 10 unsold FILLED, 40 returned EMPTY_GOOD
    const unloadRes = await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/return-unload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${plantCookie}`,
      },
      body: JSON.stringify({
        remarks: 'TEST-RECON- Evening return physical unload',
        items: [
          { productId: testButaneProduct.id, condition: 'FILLED', quantityUnits: 20 },
          { productId: testButaneProduct.id, condition: 'EMPTY_GOOD', quantityUnits: 120 },
          { productId: testButaneProduct.id, condition: 'DEFECTIVE', quantityUnits: 5 },
          { productId: testLpgProduct.id, condition: 'FILLED', quantityUnits: 10 },
          { productId: testLpgProduct.id, condition: 'EMPTY_GOOD', quantityUnits: 40 },
        ],
      }),
    });
    assert.equal(unloadRes.status, 201);

    // Baseline in beforeEach:
    // Butane: filled 500, empty 100, defective 10
    // Plant Butane balances after unload:
    // Filled: 500 + 20 = 520
    // Empty Good: 100 + 120 = 220
    // Defective: 10 + 5 = 15
    const plantButane = (await query(
      `SELECT * FROM plant_inventory WHERE product_id = $1`,
      [testButaneProduct.id]
    )).rows[0];
    assert.equal(plantButane.quantity_filled, 520);
    assert.equal(plantButane.quantity_empty_good, 220);
    assert.equal(plantButane.quantity_defective, 15);

    // Baseline in beforeEach:
    // LPG: filled 200, empty 50, defective 5
    // Plant LPG balances after unload:
    // Filled: 200 + 10 = 210
    // Empty Good: 50 + 40 = 90
    const plantLpg = (await query(
      `SELECT * FROM plant_inventory WHERE product_id = $1`,
      [testLpgProduct.id]
    )).rows[0];
    assert.equal(plantLpg.quantity_filled, 210);
    assert.equal(plantLpg.quantity_empty_good, 90);
  });

  // ============================================================
  // 7. POST-TRIP RECONCILIATION MATH (EXACT SETTLEMENT)
  // ============================================================
  await t.test('7. Multi-SKU Post-Trip Reconciliation - Exact Settlement with Defect & Customer Debt Offsets', async () => {
    // Create dedicated trip for reconciliation test
    const tripRes = await query(`
      INSERT INTO trips (trip_number, truck_id, driver_id, sales_user_id, zone_id, status)
      VALUES ('TEST-RECON-TRIP-007', $1, $2, $3, $4, 'IN_PROGRESS')
      RETURNING *
    `, [testTruck.id, driverUser.id, salesRep1User.id, testZone.id]);
    const trip = tripRes.rows[0];

    // Load: 150 Butane full, 50 LPG full
    await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/dispatch-load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        remarks: 'TEST-RECON- Dispatch load for reconciliation',
        items: [
          { productId: testButaneProduct.id, quantityUnits: 150 },
          { productId: testLpgProduct.id, quantityUnits: 50 },
        ],
      }),
    });

    // Return unload: Butane (20 full, 120 empty good, 5 defective); LPG (10 full, 40 empty good)
    await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/return-unload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${plantCookie}`,
      },
      body: JSON.stringify({
        remarks: 'TEST-RECON- Return unload for reconciliation',
        items: [
          { productId: testButaneProduct.id, condition: 'FILLED', quantityUnits: 20 },
          { productId: testButaneProduct.id, condition: 'EMPTY_GOOD', quantityUnits: 120 },
          { productId: testButaneProduct.id, condition: 'DEFECTIVE', quantityUnits: 5 },
          { productId: testLpgProduct.id, condition: 'FILLED', quantityUnits: 10 },
          { productId: testLpgProduct.id, condition: 'EMPTY_GOOD', quantityUnits: 40 },
        ],
      }),
    });

    // Mathematical reconciliation formulas:
    // For Butane:
    // Loaded: 150 full
    // Returned Full: 20
    // Returned Defective: 5 (mid-route leakers)
    // Sold: 125 full (from synchronized mobile sales batch)
    // Good Empties Returned: 120
    // Net Customer Canister Debt Created: 5 (customer loaned 5 cans without returning empty)
    //
    // fullDiscrepancy = 150 - 125 - 20 - 5 = 0
    // emptyDiscrepancy = 125 - (120 + 5) = 0
    //
    // For LPG 11kg:
    // Loaded: 50 full
    // Returned Full: 10
    // Sold: 40 full
    // Good Empties Returned: 40
    // Net Debt: 0
    //
    // fullDiscrepancy = 50 - 40 - 10 - 0 = 0
    // emptyDiscrepancy = 40 - (40 + 0) = 0

    const reconcileRes = await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        syncCompleted: true,
        supervisorNotes: 'TEST-RECON- Verified exact match across all products',
        salesData: [
          {
            productId: testButaneProduct.id,
            soldFull: 125,
            netCustomerDebtCreated: 5,
          },
          {
            productId: testLpgProduct.id,
            soldFull: 40,
            netCustomerDebtCreated: 0,
          },
        ],
      }),
    });
    assert.equal(reconcileRes.status, 200);
    const recJson = await reconcileRes.json();
    assert.equal(recJson.status, 'success');

    const rec = recJson.data.reconciliation;
    assert.equal(rec.status, 'SETTLED');
    assert.equal(rec.isSettled, true);
    assert.equal(rec.fullDiscrepancy, 0);
    assert.equal(rec.emptyDiscrepancy, 0);
    assert.equal(rec.totalLoadedFull, 200); // 150 + 50
    assert.equal(rec.totalSoldFull, 165); // 125 + 40
    assert.equal(rec.totalReturnedFull, 30); // 20 + 10
    assert.equal(rec.totalReturnedEmptyGood, 160); // 120 + 40
    assert.equal(rec.totalReturnedDefective, 5);
    assert.equal(rec.netCustomerDebtCreated, 5);

    // Verify per-product breakdown array
    assert.equal(rec.reconciliationData.length, 2);
    const butaneRec = rec.reconciliationData.find((r) => r.productId === testButaneProduct.id);
    assert.equal(butaneRec.fullDiscrepancy, 0);
    assert.equal(butaneRec.emptyDiscrepancy, 0);
    assert.equal(butaneRec.isSettled, true);

    // Verify event history log
    const eventCheck = await query(
      `SELECT * FROM history_logs WHERE action = 'INVENTORY_RECONCILIATION_SETTLED' AND target_id = $1`,
      [trip.id]
    );
    assert.equal(eventCheck.rows.length, 1);
  });


  // ============================================================
  // 8. FLAGGED VARIANCE & AWAITING_SYNC LIFECYCLES
  // ============================================================
  await t.test('8. Reconciliation Lifecycle - FLAGGED_VARIANCE & AWAITING_SYNC States', async () => {
    // Create second trip
    const tripRes = await query(`
      INSERT INTO trips (trip_number, truck_id, driver_id, sales_user_id, zone_id, status)
      VALUES ('TEST-RECON-TRIP-002', $1, $2, $3, $4, 'IN_PROGRESS')
      RETURNING *
    `, [testTruck.id, driverUser.id, salesRep1User.id, testZone.id]);
    const trip2 = tripRes.rows[0];

    // Load 100 Butane units
    await fetch(`${baseUrl}/api/inventory/trips/${trip2.id}/dispatch-load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        items: [{ productId: testButaneProduct.id, quantityUnits: 100 }],
      }),
    });

    // Return 10 full units, 80 empty good units
    await fetch(`${baseUrl}/api/inventory/trips/${trip2.id}/return-unload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        items: [
          { productId: testButaneProduct.id, condition: 'FILLED', quantityUnits: 10 },
          { productId: testButaneProduct.id, condition: 'EMPTY_GOOD', quantityUnits: 80 },
        ],
      }),
    });

    // A. Reconcile with syncCompleted: false -> AWAITING_SYNC
    const awaitingRes = await fetch(`${baseUrl}/api/inventory/trips/${trip2.id}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        syncCompleted: false,
        supervisorNotes: 'TEST-RECON- Mobile app sales batch pending offline ingestion',
      }),
    });
    assert.equal(awaitingRes.status, 200);
    const awaitingJson = await awaitingRes.json();
    assert.equal(awaitingJson.data.reconciliation.status, 'AWAITING_SYNC');

    // B. Reconcile with missing units (Non-zero discrepancy -> FLAGGED_VARIANCE)
    // Loaded: 100 full
    // Returned Full: 10
    // Sold: 80 full (Total accounted: 80 + 10 = 90 full, 10 full units MISSING)
    // Empties returned: 80, Debt: 0 (Empty matches)
    // fullDiscrepancy = 100 - 80 - 10 = 10
    const flaggedRes = await fetch(`${baseUrl}/api/inventory/trips/${trip2.id}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        syncCompleted: true,
        supervisorNotes: 'TEST-RECON- 10 full canisters missing unaccounted for',
        salesData: [
          {
            productId: testButaneProduct.id,
            soldFull: 80,
            netCustomerDebtCreated: 0,
          },
        ],
      }),
    });
    assert.equal(flaggedRes.status, 200);
    const flaggedJson = await flaggedRes.json();
    assert.equal(flaggedJson.data.reconciliation.status, 'FLAGGED_VARIANCE');
    assert.equal(flaggedJson.data.reconciliation.isSettled, false);
    assert.equal(flaggedJson.data.reconciliation.fullDiscrepancy, 10);

    // Verify FLAGGED event logged
    const flaggedEvent = await query(
      `SELECT * FROM history_logs WHERE action = 'INVENTORY_RECONCILIATION_FLAGGED' AND target_id = $1`,
      [trip2.id]
    );
    assert.equal(flaggedEvent.rows.length, 1);
  });
});
