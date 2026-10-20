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
});
