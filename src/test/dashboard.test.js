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
      baseUrl = `http://localhost:${server.address().port}`;
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

test('Unified Dashboard Overview Subsystem Tests', async (t) => {
  let adminCookie;
  let driverCookie;
  let salesSupervisorCookie;

  beforeEach(async () => {
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_dash_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_dash_%'`);

    const adminRole = (await query(`SELECT id FROM roles WHERE name = 'Admin'`)).rows[0].id;
    const driverRole = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;
    const salesSupRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Supervisor'`)).rows[0].id;

    const passwordHash = await bcrypt.hash('DashPass123!', 10);

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, 'Dash', 'Admin', '+639179900001', $3, TRUE, FALSE, FALSE)`,
      ['test_dash_admin', passwordHash, adminRole]
    );
    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, 'Dash', 'Driver', '+639179900002', $3, TRUE, FALSE, FALSE)`,
      ['test_dash_driver', passwordHash, driverRole]
    );
    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, 'Dash', 'SalesSup', '+639179900003', $3, TRUE, FALSE, FALSE)`,
      ['test_dash_salessup', passwordHash, salesSupRole]
    );

    const login = async (username) => {
      const res = await fetch(`${baseUrl}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'DashPass123!' }),
      });
      return parseCookieHeader(res);
    };

    adminCookie = await login('test_dash_admin');
    driverCookie = await login('test_dash_driver');
    salesSupervisorCookie = await login('test_dash_salessup');
  });

  await t.test('1. RBAC & Overview KPI Aggregation (GET /api/dashboard/overview)', async () => {
    const unauth = await fetch(`${baseUrl}/api/dashboard/overview`);
    assert.equal(unauth.status, 401);

    const driverRes = await fetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Cookie: `mg_sid=${driverCookie}` },
    });
    assert.equal(driverRes.status, 403);

    const salesSupRes = await fetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Cookie: `mg_sid=${salesSupervisorCookie}` },
    });
    assert.equal(salesSupRes.status, 403);

    const adminRes = await fetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(adminRes.status, 200);
    const body = await adminRes.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data.fleet);
    assert.equal(typeof body.data.fleet.totalVehicles, 'number');
    assert.ok(body.data.trips);
    assert.equal(typeof body.data.trips.activeTrips, 'number');
    assert.ok(body.data.operations);
    assert.equal(typeof body.data.operations.activeSosAlerts, 'number');
    assert.ok(body.data.inventory);
    assert.equal(typeof body.data.inventory.totalFilled, 'number');
    assert.ok(body.data.sales);
    assert.equal(typeof body.data.sales.revenue30d, 'number');
    assert.ok(body.data.generatedAt);
  });
});
