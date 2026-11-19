const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const { pool } = require('../../database/connection');
const bcrypt = require('bcrypt');
const { query } = require('../../database/connection');

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
  await query(`DELETE FROM sales_invoices WHERE invoice_number LIKE 'INV-TEST-ANALYTICS-%'`);
  await query(`DELETE FROM sales_transaction_items WHERE transaction_id IN (SELECT id FROM sales_transactions WHERE transaction_no LIKE 'TEST-ANALYTICS-%')`);
  await query(`DELETE FROM sales_transactions WHERE transaction_no LIKE 'TEST-ANALYTICS-%'`);
  await query(`DELETE FROM trips WHERE trip_number LIKE 'TEST-ANALYTICS-%'`);
  await query(`DELETE FROM customers WHERE contact_person LIKE 'TEST-ANALYTICS-%'`);
  await query(`DELETE FROM vehicles WHERE plate_number LIKE 'TEST-ANALYTICS-%'`);
  await query(`DELETE FROM service_zones WHERE code LIKE 'TEST-ANALYTICS-%'`);
  if (server) {
    server.close();
  }
  await pool.end();
});

test('Sales & Delivery Analytics & Trip Performance API Suite', async (t) => {
  let supervisorCookie;
  let driverCookie;

  await t.test('Setup test users and login cookies', async () => {
    const passwordHash = await bcrypt.hash('AnalyticsPass123!', 10);
    const ssRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Supervisor'`)).rows[0].id;
    const driverRole = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;

    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_analytics_ss', 'test_analytics_driver'))`);
    await query(`DELETE FROM users WHERE username IN ('test_analytics_ss', 'test_analytics_driver')`);

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_analytics_ss', passwordHash, 'Analytics', 'Supervisor', '+639178000001', ssRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_analytics_driver', passwordHash, 'Analytics', 'Driver', '+639178000002', driverRole]
    );

    const ssLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_analytics_ss', password: 'AnalyticsPass123!' }),
    });
    assert.equal(ssLogin.status, 200);
    supervisorCookie = ssLogin.headers.get('set-cookie');

    const driverLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_analytics_driver', password: 'AnalyticsPass123!' }),
    });
    assert.equal(driverLogin.status, 200);
    driverCookie = driverLogin.headers.get('set-cookie');
  });

  await t.test('GET /api/sales/overview returns authoritative analytics and backward-compatible trend series', async () => {
    const res = await fetch(`${baseUrl}/api/sales/overview`, {
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data.summary);
    assert.ok(typeof body.data.summary.totalGrossSales === 'number');
    assert.ok(body.data.summary.completedTransactions >= 0);
    assert.ok(Array.isArray(body.data.productBreakdown));
    assert.ok(body.data.paymentBreakdown);
    assert.ok(Array.isArray(body.data.weekly));
    assert.ok(Array.isArray(body.data.monthly));
    assert.ok(Array.isArray(body.data.annually));
  });

  await t.test('GET /api/sales/trip-performance returns trips with sales attribution', async () => {
    const res = await fetch(`${baseUrl}/api/sales/trip-performance`, {
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const trips = body.data.trips || body.data.items || [];
    assert.ok(Array.isArray(trips));
    assert.ok(trips.length > 0);
    const firstTrip = trips[0];
    assert.ok(firstTrip.trip_number);
    assert.ok(firstTrip.truck_plate_number);
    assert.ok(typeof firstTrip.total_transactions === 'number');
    assert.ok(typeof firstTrip.total_sales_amount === 'number' || typeof firstTrip.total_sales_amount === 'string');
  });

  await t.test('RBAC - Users without sales.view (Driver) cannot access sales analytics', async () => {
    const res = await fetch(`${baseUrl}/api/sales/overview`, {
      headers: { Cookie: driverCookie },
    });
    assert.equal(res.status, 403);
  });

  await t.test('Daily hourly buckets, weekly daily buckets, productBreakdown filtering, and no multi-item double counting', async () => {
    await query(`DELETE FROM sales_invoices WHERE invoice_number LIKE 'INV-TEST-ANALYTICS-%'`);
    await query(`DELETE FROM sales_transaction_items WHERE transaction_id IN (SELECT id FROM sales_transactions WHERE transaction_no LIKE 'TEST-ANALYTICS-%')`);
    await query(`DELETE FROM sales_transactions WHERE transaction_no LIKE 'TEST-ANALYTICS-%'`);
    await query(`DELETE FROM trips WHERE trip_number LIKE 'TEST-ANALYTICS-%'`);
    await query(`DELETE FROM customers WHERE contact_person LIKE 'TEST-ANALYTICS-%'`);
    await query(`DELETE FROM vehicles WHERE plate_number LIKE 'TEST-ANALYTICS-%'`);
    await query(`DELETE FROM service_zones WHERE code LIKE 'TEST-ANALYTICS-%'`);

    const ssUser = (await query(`SELECT id FROM users WHERE username = 'test_analytics_ss'`)).rows[0];
    const drvUser = (await query(`SELECT id FROM users WHERE username = 'test_analytics_driver'`)).rows[0];

    const zoneId = (await query(
      `INSERT INTO service_zones (code, name, description, is_active)
       VALUES ('TEST-ANALYTICS-Z1', 'Analytics Zone', 'Test zone', TRUE) RETURNING id`
    )).rows[0].id;

    const vehId = (await query(
      `INSERT INTO vehicles (plate_number, model, year_model, status)
       VALUES ('TEST-ANALYTICS-V1', 'Isuzu Elf', 2024, 'ACTIVE') RETURNING id`
    )).rows[0].id;

    const tripId = (await query(
      `INSERT INTO trips (truck_id, driver_id, sales_user_id, zone_id, trip_number, status)
       VALUES ($1, $2, $3, $4, 'TEST-ANALYTICS-TRIP-1', 'IN_PROGRESS') RETURNING id`,
      [vehId, drvUser.id, ssUser.id, zoneId]
    )).rows[0].id;

    const custId = (await query(
      `INSERT INTO customers (contact_person, business_name, delivery_address, contact_number, zone_id, customer_type, is_active)
       VALUES ('TEST-ANALYTICS-CUST', 'Test Analytics Biz', 'Davao City', '+639178000099', $1, 'RETAIL', TRUE) RETURNING id`,
      [zoneId]
    )).rows[0].id;

    const canisterProd = (await query(`SELECT id FROM products WHERE container_type = 'CANISTER' LIMIT 1`)).rows[0]
      || (await query(`INSERT INTO products (name, category, container_type, net_weight_kg, is_active) VALUES ('Test Canister', 'Canister', 'CANISTER', 0.17, TRUE) RETURNING id`)).rows[0];
    const cylinderProd = (await query(`SELECT id FROM products WHERE container_type = 'CYLINDER' LIMIT 1`)).rows[0]
      || (await query(`INSERT INTO products (name, category, container_type, net_weight_kg, is_active) VALUES ('Test Cylinder 11kg', 'Cylinder', 'CYLINDER', 11, TRUE) RETURNING id`)).rows[0];

    // Compute today PHT and 3 days ago PHT
    const now = new Date();
    const todayPhtStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const todayStartIso = new Date(`${todayPhtStr}T00:00:00.000+08:00`).toISOString();
    const todayEndIso = new Date(`${todayPhtStr}T23:59:59.999+08:00`).toISOString();
    const today2PmIso = new Date(`${todayPhtStr}T14:15:00.000+08:00`).toISOString();

    const weekStartDate = new Date(`${todayPhtStr}T00:00:00.000+08:00`);
    weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 6);
    const weekStartIso = weekStartDate.toISOString();

    const threeDaysAgoDate = new Date(`${todayPhtStr}T10:00:00.000+08:00`);
    threeDaysAgoDate.setUTCDate(threeDaysAgoDate.getUTCDate() - 3);
    const threeDaysAgoIso = threeDaysAgoDate.toISOString();

    // Tx 1: COMPLETED today at 2:15 PM PHT with 2 line items (500 + 300 = 800)
    const tx1Id = (await query(
      `INSERT INTO sales_transactions (transaction_no, trip_id, customer_id, recorded_by, status, transacted_at)
       VALUES ('TEST-ANALYTICS-TX1', $1, $2, $3, 'COMPLETED', $4) RETURNING id`,
      [tripId, custId, ssUser.id, today2PmIso]
    )).rows[0].id;
    await query(
      `INSERT INTO sales_transaction_items (transaction_id, product_id, quantity_sold, unit_price_at_sale, subtotal_amount, empties_returned, empties_defective)
       VALUES ($1, $2, 2, 250, 500, 0, 0), ($1, $3, 1, 300, 300, 1, 0)`,
      [tx1Id, canisterProd.id, cylinderProd.id]
    );
    await query(
      `INSERT INTO sales_invoices (transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, transacted_at)
       VALUES ($1, 'INV-TEST-ANALYTICS-1', 'CD-TEST-ANALYTICS-1', 800, 'CASH', 'VERIFIED', $2)`,
      [tx1Id, today2PmIso]
    );

    // Tx 2: CANCELLED today at 2:20 PM PHT (999) - must be excluded everywhere
    const tx2Id = (await query(
      `INSERT INTO sales_transactions (transaction_no, trip_id, customer_id, recorded_by, status, transacted_at)
       VALUES ('TEST-ANALYTICS-TX2', $1, $2, $3, 'CANCELLED', $4) RETURNING id`,
      [tripId, custId, ssUser.id, today2PmIso]
    )).rows[0].id;
    await query(
      `INSERT INTO sales_transaction_items (transaction_id, product_id, quantity_sold, unit_price_at_sale, subtotal_amount, empties_returned, empties_defective)
       VALUES ($1, $2, 9, 111, 999, 0, 0)`,
      [tx2Id, canisterProd.id]
    );
    await query(
      `INSERT INTO sales_invoices (transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, transacted_at)
       VALUES ($1, 'INV-TEST-ANALYTICS-2', 'CD-TEST-ANALYTICS-2', 999, 'CASH', 'VERIFIED', $2)`,
      [tx2Id, today2PmIso]
    );

    // Tx 3: COMPLETED 3 days ago (400) - excluded in daily, included in weekly as its own day
    const tx3Id = (await query(
      `INSERT INTO sales_transactions (transaction_no, trip_id, customer_id, recorded_by, status, transacted_at)
       VALUES ('TEST-ANALYTICS-TX3', $1, $2, $3, 'COMPLETED', $4) RETURNING id`,
      [tripId, custId, ssUser.id, threeDaysAgoIso]
    )).rows[0].id;
    await query(
      `INSERT INTO sales_transaction_items (transaction_id, product_id, quantity_sold, unit_price_at_sale, subtotal_amount, empties_returned, empties_defective)
       VALUES ($1, $2, 4, 100, 400, 0, 0)`,
      [tx3Id, canisterProd.id]
    );
    await query(
      `INSERT INTO sales_invoices (transaction_id, invoice_number, declaration_number, total_amount, payment_method, payment_status, transacted_at)
       VALUES ($1, 'INV-TEST-ANALYTICS-3', 'CD-TEST-ANALYTICS-3', 400, 'CASH', 'VERIFIED', $2)`,
      [tx3Id, threeDaysAgoIso]
    );

    // 1) Check DAILY timeframe
    const dailyRes = await fetch(
      `${baseUrl}/api/sales/overview?tripId=${tripId}&timeframe=daily&startDate=${encodeURIComponent(todayStartIso)}&endDate=${encodeURIComponent(todayEndIso)}`,
      { headers: { Cookie: supervisorCookie } }
    );
    assert.equal(dailyRes.status, 200);
    const dailyBody = (await dailyRes.json()).data;

    assert.equal(dailyBody.summary.totalGrossSales, 800);
    assert.equal(dailyBody.summary.completedTransactions, 1);
    assert.equal(dailyBody.summary.cancelledTransactions, 1);
    assert.equal(dailyBody.summary.totalUnitsSold, 3);

    // Hourly bucket for 2 PM PHT
    assert.equal(dailyBody.salesTrends.length, 1);
    assert.equal(dailyBody.salesTrends[0].name, '2 PM');
    assert.equal(dailyBody.salesTrends[0].totalSales, 800, 'Multi-item tx must not double-count totalSales');
    assert.equal(dailyBody.salesTrends[0].totalUnits, 3);

    // Product breakdown must only sum Tx 1 (exclude Tx 2 cancelled & Tx 3 out-of-range)
    const dailyCanister = dailyBody.productBreakdown.find((p) => p.productId === canisterProd.id);
    const dailyCylinder = dailyBody.productBreakdown.find((p) => p.productId === cylinderProd.id);
    assert.equal(dailyCanister.unitsSold, 2);
    assert.equal(dailyCanister.totalRevenue, 500);
    assert.equal(dailyCylinder.unitsSold, 1);
    assert.equal(dailyCylinder.totalRevenue, 300);

    // 2) Check WEEKLY timeframe
    const weeklyRes = await fetch(
      `${baseUrl}/api/sales/overview?tripId=${tripId}&timeframe=weekly&startDate=${encodeURIComponent(weekStartIso)}&endDate=${encodeURIComponent(todayEndIso)}`,
      { headers: { Cookie: supervisorCookie } }
    );
    assert.equal(weeklyRes.status, 200);
    const weeklyBody = (await weeklyRes.json()).data;

    assert.equal(weeklyBody.summary.totalGrossSales, 1200);
    assert.equal(weeklyBody.salesTrends.length, 2, 'Weekly must return per-day buckets, not lump into 1 week');
    const todayLabel = new Date(`${todayPhtStr}T12:00:00.000+08:00`).toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
    });
    const todayBucket = weeklyBody.salesTrends.find((b) => b.name === todayLabel);
    assert.ok(todayBucket, `Expected weekly salesTrends to include today (${todayLabel})`);
    assert.equal(todayBucket.totalSales, 800);
  });
});
