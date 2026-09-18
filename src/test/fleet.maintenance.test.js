const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcrypt');
const app = require('../app');
const { pool, query } = require('../../database/connection');

const PREFIX = 'test_maint_odo_';
const TRUCK_PREFIX = 'T-ODO-';

function makeRequest(server, options, body = null) {
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

    if (body) {
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

test('Fleet Maintenance Subsystem: Odometer Engine & PM Tracking Tests', async (t) => {
  let server;
  let port;

  let supervisorCookie;
  let adminCookie;
  let salesCookie;
  let driverCookie;

  let supervisorId;
  let testTruck1Id;
  let testTruck2Id;

  async function cleanupTestData() {
    await query(`
      DELETE FROM vehicle_odometer_logs 
      WHERE truck_id IN (SELECT id FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%')
         OR notes LIKE '%${PREFIX}%'
    `);
    await query(`
      DELETE FROM history_logs 
      WHERE details LIKE '%${PREFIX}%'
         OR details LIKE '%${TRUCK_PREFIX}%'
         OR user_name LIKE '${PREFIX}%'
         OR user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')
         OR target_id IN (SELECT id::text FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%')
    `);
    await query(`DELETE FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%'`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
    await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
    await query(`
      DELETE FROM audit_logs 
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')
         OR target_user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')
    `);
    await query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);
  }

  t.before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  t.after(async () => {
    await cleanupTestData();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  t.beforeEach(async () => {
    await cleanupTestData();

    // 1. Fetch roles
    const supervisorRole = (await query(`SELECT id FROM roles WHERE name IN ('Logistics Supervisor', 'Fleet Manager') ORDER BY name LIMIT 1`)).rows[0].id;
    const adminRole = (await query(`SELECT id FROM roles WHERE name = 'Admin'`)).rows[0].id;
    const salesRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Person'`)).rows[0].id;
    const driverRole = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // 2. Create test accounts
    const supervisorRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, 'Logistics', 'Sup', '+639170010001', $3, TRUE, FALSE, FALSE) RETURNING id`,
      [`${PREFIX}supervisor`, passwordHash, supervisorRole]
    );
    supervisorId = supervisorRes.rows[0].id;

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, 'Admin', 'User', '+639170010002', $3, TRUE, FALSE, FALSE)`,
      [`${PREFIX}admin`, passwordHash, adminRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, 'Sales', 'Rep', '+639170010003', $3, TRUE, FALSE, FALSE)`,
      [`${PREFIX}sales`, passwordHash, salesRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, 'Driver', 'Test', '+639170010004', $3, TRUE, FALSE, FALSE)`,
      [`${PREFIX}driver`, passwordHash, driverRole]
    );

    // 3. Create test trucks
    const truck1Res = await query(
      `INSERT INTO trucks (plate_number, model, year_model, current_odometer, last_pm_odometer, status)
       VALUES ($1, 'Isuzu Elf 1', 2022, 10000, 10000, 'ACTIVE')
       RETURNING id`,
      [`${TRUCK_PREFIX}101`]
    );
    testTruck1Id = truck1Res.rows[0].id;

    const truck2Res = await query(
      `INSERT INTO trucks (plate_number, model, year_model, current_odometer, last_pm_odometer, status)
       VALUES ($1, 'Hino 300', 2023, 24500, 20000, 'ACTIVE')
       RETURNING id`,
      [`${TRUCK_PREFIX}202`]
    );
    testTruck2Id = truck2Res.rows[0].id;

    // 4. Authenticate accounts
    async function login(username) {
      const res = await makeRequest(
        server,
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/users/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { username, password: 'TestPass123!' }
      );
      assert.equal(res.statusCode, 200);
      return parseCookie(res.headers['set-cookie']);
    }

    supervisorCookie = await login(`${PREFIX}supervisor`);
    adminCookie = await login(`${PREFIX}admin`);
    salesCookie = await login(`${PREFIX}sales`);
    driverCookie = await login(`${PREFIX}driver`);
  });

  await t.test('1. RBAC Route Protection - 401 Unauthorized vs 403 Forbidden vs 200/201 OK', async () => {
    // A. Unauthenticated requests -> 401
    const unauthPost = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { truckId: testTruck1Id, odometerReading: 10500 });
    assert.equal(unauthPost.statusCode, 401);

    const unauthGetOverview = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/pm-overview',
      method: 'GET',
    });
    assert.equal(unauthGetOverview.statusCode, 401);

    const unauthGetTruck = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/odometer/truck/${testTruck1Id}`,
      method: 'GET',
    });
    assert.equal(unauthGetTruck.statusCode, 401);

    // B. Sales Person (Forbidden on fleet.manage and fleet.view) -> 403
    const salesPost = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: salesCookie },
    }, { truckId: testTruck1Id, odometerReading: 10500 });
    assert.equal(salesPost.statusCode, 403);

    const salesOverview = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/pm-overview',
      method: 'GET',
      headers: { Cookie: salesCookie },
    });
    assert.equal(salesOverview.statusCode, 403);

    // C. Driver (Forbidden on fleet.manage and fleet.view) -> 403
    const driverPost = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: driverCookie },
    }, { truckId: testTruck1Id, odometerReading: 10500 });
    assert.equal(driverPost.statusCode, 403);

    // D. Logistics Supervisor -> 201 on POST, 200 on GET
    const supPost = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, odometerReading: 10500, notes: `${PREFIX}Initial log` });
    assert.equal(supPost.statusCode, 201);
    assert.equal(supPost.body.status, 'success');

    const supOverview = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/pm-overview',
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(supOverview.statusCode, 200);

    // E. Admin -> 200 on GET truck history
    const adminHistory = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/odometer/truck/${testTruck1Id}`,
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminHistory.statusCode, 200);
    assert.equal(adminHistory.body.status, 'success');
  });

  await t.test('2. Monotonic Validation & Parameter Checks', async () => {
    // Current odometer of testTruck1Id is 10000.
    // A. Attempt decreasing reading (e.g. 9500) -> 400 Bad Request
    const lowerRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, odometerReading: 9500 });
    assert.equal(lowerRes.statusCode, 400);
    assert.equal(lowerRes.body.status, 'fail');
    assert.match(lowerRes.body.message, /cannot be less than the current odometer/i);

    // B. Negative reading -> 400 Bad Request
    const negRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, odometerReading: -100 });
    assert.equal(negRes.statusCode, 400);

    // C. Non-integer reading -> 400 Bad Request
    const floatRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, odometerReading: 10500.75 });
    assert.equal(floatRes.statusCode, 400);

    // D. Missing truckId -> 400 Bad Request
    const missingTruckRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { odometerReading: 12000 });
    assert.equal(missingTruckRes.statusCode, 400);

    // E. Non-existent truckId -> 404 Not Found
    const notFoundRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: '00000000-0000-0000-0000-000000000000', odometerReading: 12000 });
    assert.equal(notFoundRes.statusCode, 404);
    assert.equal(notFoundRes.body.status, 'fail');
  });

  await t.test('3. Distance Calculation & 5,000-km PM Threshold Evaluation', async () => {
    // Initial State: testTruck1Id current_odometer = 10000, last_pm_odometer = 10000

    // Step A: Log return at 13500 km (distance driven: 3500, distance since PM: 3500 < 5000)
    const trip1Res = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck1Id,
      odometerReading: 13500,
      source: 'POST_DISPATCH_RETURN',
      notes: `${PREFIX}Trip 1 return`,
    });

    assert.equal(trip1Res.statusCode, 201);
    const data1 = trip1Res.body.data;
    assert.equal(data1.previousOdometer, 10000);
    assert.equal(data1.currentOdometer, 13500);
    assert.equal(data1.distanceDrivenThisTrip, 3500);
    assert.equal(data1.lastPmOdometer, 10000);
    assert.equal(data1.distanceSinceLastPm, 3500);
    assert.equal(data1.isPmDue, false);
    assert.equal(data1.remainingKmBeforePm, 1500);
    assert.ok(data1.logId);

    // Step B: Log return at 15000 km (distance driven: 1500, distance since PM: 5000 >= 5000 -> PM DUE!)
    const trip2Res = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck1Id,
      odometerReading: 15000,
      source: 'POST_DISPATCH_RETURN',
      notes: `${PREFIX}Trip 2 return reaching 5k threshold`,
    });

    assert.equal(trip2Res.statusCode, 201);
    const data2 = trip2Res.body.data;
    assert.equal(data2.previousOdometer, 13500);
    assert.equal(data2.currentOdometer, 15000);
    assert.equal(data2.distanceDrivenThisTrip, 1500);
    assert.equal(data2.lastPmOdometer, 10000);
    assert.equal(data2.distanceSinceLastPm, 5000);
    assert.equal(data2.isPmDue, true);
    assert.equal(data2.remainingKmBeforePm, 0);

    // Step C: Log return exceeding threshold (e.g. 16200 km -> distance since PM = 6200)
    const trip3Res = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck1Id,
      odometerReading: 16200,
      source: 'POST_DISPATCH_RETURN',
      notes: `${PREFIX}Trip 3 return overdue PM`,
    });

    assert.equal(trip3Res.statusCode, 201);
    const data3 = trip3Res.body.data;
    assert.equal(data3.previousOdometer, 15000);
    assert.equal(data3.currentOdometer, 16200);
    assert.equal(data3.distanceDrivenThisTrip, 1200);
    assert.equal(data3.distanceSinceLastPm, 6200);
    assert.equal(data3.isPmDue, true);
    assert.equal(data3.remainingKmBeforePm, 0);

    // Step D: Zero-distance trip (odometerReading === currentOdometer)
    const zeroTripRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck1Id,
      odometerReading: 16200,
      source: 'POST_DISPATCH_RETURN',
      notes: `${PREFIX}Zero-distance check`,
    });

    assert.equal(zeroTripRes.statusCode, 201);
    const zeroData = zeroTripRes.body.data;
    assert.equal(zeroData.previousOdometer, 16200);
    assert.equal(zeroData.currentOdometer, 16200);
    assert.equal(zeroData.distanceDrivenThisTrip, 0);
    assert.equal(zeroData.isPmDue, true);
  });

  await t.test('4. Centralized System History Audit Trail Verification', async () => {
    // Log a fresh reading
    const logRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck2Id,
      odometerReading: 25800,
      source: 'POST_DISPATCH_RETURN',
      notes: `${PREFIX}Audit verification log`,
    });
    assert.equal(logRes.statusCode, 201);

    // Query history_logs table directly
    const historyDb = await query(
      `SELECT * FROM history_logs 
       WHERE target_id = $1 AND action = 'MAINTENANCE_ODOMETER_LOGGED'
       ORDER BY created_at DESC LIMIT 1`,
      [testTruck2Id]
    );

    assert.equal(historyDb.rows.length, 1, 'Should find 1 audit history log');
    const logRow = historyDb.rows[0];

    assert.equal(logRow.module, 'Fleet Management');
    assert.equal(logRow.action_type, 'Updated');
    assert.equal(logRow.target_type, 'TRUCK');
    assert.equal(
      logRow.details,
      `Recorded odometer reading for truck ${TRUCK_PREFIX}202: 25800 km`
    );
    assert.equal(logRow.user_id, supervisorId);

    const metadata = typeof logRow.metadata === 'string' ? JSON.parse(logRow.metadata) : logRow.metadata;
    assert.equal(metadata.previousOdometer, 24500);
    assert.equal(metadata.distanceDrivenThisTrip, 1300);
    assert.equal(metadata.distanceSinceLastPm, 5800);
    assert.equal(metadata.isPmDue, true);
    assert.equal(metadata.source, 'POST_DISPATCH_RETURN');
  });

  await t.test('5. Odometer History & PM Overview Retrieval', async () => {
    // A. Query vehicle odometer history
    // Add 2 logs for testTruck1Id
    await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, odometerReading: 11000, notes: `${PREFIX}History log 1` });

    await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/odometer',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, odometerReading: 12500, notes: `${PREFIX}History log 2` });

    const historyRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/odometer/truck/${testTruck1Id}?page=1&limit=10`,
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });

    assert.equal(historyRes.statusCode, 200);
    assert.equal(historyRes.body.status, 'success');
    assert.equal(historyRes.body.data.truckId, testTruck1Id);
    assert.equal(historyRes.body.data.plateNumber, `${TRUCK_PREFIX}101`);
    assert.ok(historyRes.body.data.logs.length >= 2);
    // Ordered descending by logged_at
    assert.equal(historyRes.body.data.logs[0].odometerReading, 12500);
    assert.equal(historyRes.body.data.logs[1].odometerReading, 11000);
    assert.ok(historyRes.body.data.logs[0].loggedByName);

    // B. Query fleet PM overview
    const overviewRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/pm-overview?search=${TRUCK_PREFIX}`,
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });

    assert.equal(overviewRes.statusCode, 200);
    assert.equal(overviewRes.body.status, 'success');
    assert.ok(overviewRes.body.data.trucks.length >= 2);
    assert.ok(overviewRes.body.data.summary);
    assert.ok(overviewRes.body.data.summary.totalVehicles >= 2);

    const truck1Overview = overviewRes.body.data.trucks.find((t) => t.id === testTruck1Id);
    assert.ok(truck1Overview);
    assert.equal(truck1Overview.currentOdometer, 12500);
    assert.equal(truck1Overview.lastPmOdometer, 10000);
    assert.equal(truck1Overview.distanceSinceLastPm, 2500);
    assert.equal(truck1Overview.isPmDue, false);
    assert.equal(truck1Overview.remainingKmBeforePm, 2500);
  });
});
