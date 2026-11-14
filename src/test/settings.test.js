const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool, query } = require('../../database/connection');
const { settingsService } = require('../features/settings');

const PREFIX = 'test_settings_';

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on('error', reject);

    if (body !== null && body !== undefined) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function parseCookie(setCookieHeaders) {
  if (!setCookieHeaders) return '';
  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const c of cookies) {
    if (c.startsWith('mg_sid=')) {
      return c.split(';')[0];
    }
  }
  return '';
}

test('Business System Settings Subsystem Tests', async (t) => {
  let server;
  let port;
  let adminCookie;
  let superAdminCookie;
  let supervisorCookie;
  let driverCookie;
  let testVehicleId;

  const originalSettings = new Map();

  async function createTestUser(usernameSuffix, roleName) {
    const username = `${PREFIX}${usernameSuffix}`;
    const hash = await bcrypt.hash('Password123!', 10);
    const roleRes = await query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
    assert.ok(roleRes.rows[0], `Role ${roleName} must exist`);
    const roleId = roleRes.rows[0].id;

    const userRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, role_id, is_active, must_change_password)
       VALUES ($1, $2, 'Test', $3, $4, TRUE, FALSE)
       RETURNING id`,
      [username, hash, roleName, roleId]
    );
    const userId = userRes.rows[0].id;

    await query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       VALUES ($1, $2, TRUE)
       ON CONFLICT DO NOTHING`,
      [userId, roleId]
    );

    const loginRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/users/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { username, password: 'Password123!' }
    );

    assert.equal(loginRes.statusCode, 200, `Login failed for ${username}`);
    return { userId, cookie: parseCookie(loginRes.headers['set-cookie']) };
  }

  async function cleanupTestData() {
    await query(`DELETE FROM work_orders WHERE description ILIKE '${PREFIX}%'`);
    await query(`DELETE FROM vehicles WHERE plate_number ILIKE '${PREFIX}%'`);
    await query(
      `DELETE FROM history_logs WHERE user_name ILIKE '${PREFIX}%' OR user_id IN (SELECT id FROM users WHERE username ILIKE '${PREFIX}%')`
    );
    await query(
      `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username ILIKE '${PREFIX}%')`
    );
    await query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username ILIKE '${PREFIX}%') OR target_user_id IN (SELECT id FROM users WHERE username ILIKE '${PREFIX}%')`
    );
    await query(`DELETE FROM users WHERE username ILIKE '${PREFIX}%'`);
  }

  t.before(async () => {
    await cleanupTestData();

    const rowsRes = await query(`SELECT key, value FROM system_settings`);
    for (const row of rowsRes.rows) {
      originalSettings.set(row.key, row.value);
    }

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });

    const admin = await createTestUser('admin', 'Admin');
    adminCookie = admin.cookie;

    const superAdmin = await createTestUser('superadmin', 'Super Admin');
    superAdminCookie = superAdmin.cookie;

    const supervisor = await createTestUser('supervisor', 'Logistics Supervisor');
    supervisorCookie = supervisor.cookie;

    const driver = await createTestUser('driver', 'Driver');
    driverCookie = driver.cookie;

    const vehRes = await query(
      `INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status)
       VALUES ($1, 'Test Hino', 2024, 'DELIVERY_TRUCK', 13500, 10000, 'ACTIVE')
       RETURNING id`,
      [`${PREFIX}TRUCK1`]
    );
    testVehicleId = vehRes.rows[0].id;
  });

  t.after(async () => {
    // Restore all original settings
    for (const [key, val] of originalSettings.entries()) {
      await query(`UPDATE system_settings SET value = $1 WHERE key = $2`, [val, key]);
    }
    settingsService.clearCache();
    await cleanupTestData();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  await t.test('GET /api/settings returns all 6 business settings for Admin and Super Admin', async () => {
    for (const cookie of [adminCookie, superAdminCookie]) {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/settings',
        method: 'GET',
        headers: { Cookie: cookie },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.status, 'success');
      assert.ok(Array.isArray(res.body.data.settings));
      const keys = res.body.data.settings.map((s) => s.key);
      assert.ok(keys.includes('fleet.pm_odometer_threshold_km'));
      assert.ok(keys.includes('fleet.work_order_approval_threshold'));
      assert.ok(keys.includes('operations.fuel_efficiency_variance_percent'));
      assert.ok(keys.includes('operations.sos_dedup_window_seconds'));
      assert.ok(keys.includes('inventory.canisters_per_crate'));
      assert.ok(keys.includes('schedules.max_generation_days'));
    }
  });

  await t.test('GET /api/settings?category=FLEET filters by category', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/settings?category=FLEET',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.data.settings.length >= 2);
    assert.ok(res.body.data.settings.every((s) => s.category === 'FLEET'));
  });

  await t.test('RBAC denies non-admin roles (Supervisor, Driver) and unauthenticated requests', async () => {
    const unauth = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/settings',
      method: 'GET',
    });
    assert.equal(unauth.statusCode, 401);

    for (const cookie of [supervisorCookie, driverCookie]) {
      const getRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/settings',
        method: 'GET',
        headers: { Cookie: cookie },
      });
      assert.equal(getRes.statusCode, 403);

      const patchRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/settings/fleet.pm_odometer_threshold_km',
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: cookie },
        },
        { value: 4000 }
      );
      assert.equal(patchRes.statusCode, 403);
    }
  });

  await t.test('PATCH /api/settings/:key validates type and min/max bounds', async () => {
    // Decimal rejected for INTEGER setting
    const nonInt = await makeRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/settings/fleet.pm_odometer_threshold_km',
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      },
      { value: 3500.5 }
    );
    assert.equal(nonInt.statusCode, 400);

    // Below min_value (500)
    const belowMin = await makeRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/settings/fleet.pm_odometer_threshold_km',
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      },
      { value: 100 }
    );
    assert.equal(belowMin.statusCode, 400);

    // Above max_value (50000)
    const aboveMax = await makeRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/settings/fleet.pm_odometer_threshold_km',
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      },
      { value: 99999 }
    );
    assert.equal(aboveMax.statusCode, 400);

    // Non-existent key
    const notFound = await makeRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/settings/does.not.exist',
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      },
      { value: 10 }
    );
    assert.equal(notFound.statusCode, 404);
  });

  await t.test('Updating fleet.pm_odometer_threshold_km dynamically updates PM due status and logs history', async () => {
    const key = 'fleet.pm_odometer_threshold_km';
    const orig = originalSettings.get(key) || '5000';

    try {
      // Vehicle has distance_since_pm = 13500 - 10000 = 3500 km.
      // Lower threshold to 3000 km -> vehicle should become PM due!
      const patchRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/settings/${key}`,
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        },
        { value: 3000 }
      );
      assert.equal(patchRes.statusCode, 200);
      assert.equal(patchRes.body.data.setting.value, 3000);

      // Verify vehicle endpoint reflects dynamic PM due flag
      const vehRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/fleet/vehicles/${testVehicleId}`,
        method: 'GET',
        headers: { Cookie: adminCookie },
      });
      assert.equal(vehRes.statusCode, 200);
      const vehicleData = vehRes.body.data.vehicle || vehRes.body.data;
      assert.equal(vehicleData.isPmDue, true);

      // Verify history log recorded
      const histRes = await query(
        `SELECT action, module, details FROM history_logs WHERE action = 'SYSTEM_SETTING_UPDATED' AND details LIKE '%fleet.pm_odometer_threshold_km%' ORDER BY created_at DESC LIMIT 1`
      );
      assert.equal(histRes.rows.length, 1);
      assert.equal(histRes.rows[0].module, 'System Settings');
    } finally {
      await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/settings/${key}`,
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        },
        { value: Number(orig) }
      );
    }
  });

  await t.test('Updating fleet.work_order_approval_threshold dynamically controls work order auto-approval', async () => {
    const key = 'fleet.work_order_approval_threshold';
    const orig = originalSettings.get(key) || '5000';

    try {
      // Raise approval threshold to 10000
      const patchRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/settings/${key}`,
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        },
        { value: 10000 }
      );
      assert.equal(patchRes.statusCode, 200);

      const mtRes = await query(`SELECT id FROM maintenance_types LIMIT 1`);
      const maintenanceTypeId = mtRes.rows[0].id;

      // Create work order with estimatedCost 7000 (< 10000) -> should auto-approve (APPROVED)
      const woRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/fleet/maintenance/work-orders',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        },
        {
          vehicleId: testVehicleId,
          maintenanceTypeId,
          description: `${PREFIX}Brake check under dynamic threshold`,
          estimatedCost: 7000,
        }
      );
      assert.equal(woRes.statusCode, 201);
      const woData = woRes.body.data.workOrder || woRes.body.data;
      assert.equal(woData.status, 'APPROVED');
    } finally {
      await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/settings/${key}`,
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        },
        { value: Number(orig) }
      );
    }
  });
});
