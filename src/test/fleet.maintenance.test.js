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
      DELETE FROM maintenance_logs
      WHERE work_order_id IN (
        SELECT id FROM work_orders WHERE truck_id IN (SELECT id FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%')
      ) OR official_receipt_number LIKE '%${PREFIX}%'
    `);
    await query(`
      DELETE FROM approval_requests
      WHERE work_order_id IN (
        SELECT id FROM work_orders WHERE truck_id IN (SELECT id FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%')
      )
    `);
    await query(`
      DELETE FROM work_orders
      WHERE truck_id IN (SELECT id FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%')
         OR description LIKE '%${PREFIX}%'
    `);
    await query(`
      DELETE FROM vehicle_inspections
      WHERE truck_id IN (SELECT id FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%')
         OR findings LIKE '%${PREFIX}%'
    `);
    await query(`
      DELETE FROM incident_reports
      WHERE truck_id IN (SELECT id FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%')
         OR description LIKE '%${PREFIX}%'
    `);
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
         OR target_id IN (SELECT id::text FROM work_orders WHERE truck_id IN (SELECT id FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%'))
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

    // Unauth inspections & incidents -> 401
    const unauthInspectionPost = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { truckId: testTruck1Id, result: 'PASSED', findings: 'All good' });
    assert.equal(unauthInspectionPost.statusCode, 401);

    const unauthIncidentsGet = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'GET',
    });
    assert.equal(unauthIncidentsGet.statusCode, 401);

    const unauthWorkOrdersPost = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { truckId: testTruck1Id, maintenanceTypeId: 1, description: 'Test' });
    assert.equal(unauthWorkOrdersPost.statusCode, 401);

    const unauthLogsGet = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/logs',
      method: 'GET',
    });
    assert.equal(unauthLogsGet.statusCode, 401);

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

    const salesInspectionPost = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: salesCookie },
    }, { truckId: testTruck1Id, result: 'PASSED', findings: 'All good' });
    assert.equal(salesInspectionPost.statusCode, 403);

    const salesIncidentsGet = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'GET',
      headers: { Cookie: salesCookie },
    });
    assert.equal(salesIncidentsGet.statusCode, 403);

    const salesWorkOrdersPost = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: salesCookie },
    }, { truckId: testTruck1Id, maintenanceTypeId: 1, description: 'Test' });
    assert.equal(salesWorkOrdersPost.statusCode, 403);

    const salesLogsGet = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/logs',
      method: 'GET',
      headers: { Cookie: salesCookie },
    });
    assert.equal(salesLogsGet.statusCode, 403);

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

    const supIncTypes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents/types',
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(supIncTypes.statusCode, 200);
    assert.equal(supIncTypes.body.status, 'success');

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

  await t.test('6. Safety Inspection Operations - Issue Reporting, Automated Grounding & Invariants', async () => {
    // A. Validation Checks
    // 1. Missing truckId -> 400
    const noTruckRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { result: 'PASSED', findings: 'All good' });
    assert.equal(noTruckRes.statusCode, 400);
    assert.match(noTruckRes.body.message, /truck id is required/i);

    // 2. Non-existent truckId -> 404
    const notFoundTruckRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: '00000000-0000-0000-0000-000000000000', result: 'PASSED', findings: 'All good' });
    assert.equal(notFoundTruckRes.statusCode, 404);

    // 3. Invalid result enum -> 400
    const badResultRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, result: 'EXCELLENT', findings: 'All good' });
    assert.equal(badResultRes.statusCode, 400);
    assert.match(badResultRes.body.message, /must be one of: PASSED, NEEDS_ATTENTION, FAILED/i);

    // 4. Missing findings -> 400
    const noFindingsRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, result: 'PASSED' });
    assert.equal(noFindingsRes.statusCode, 400);
    assert.match(noFindingsRes.body.message, /findings are required/i);

    // 5. Invalid inspectionDate -> 400
    const badDateRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, result: 'PASSED', findings: 'All good', inspectionDate: 'invalid-date' });
    assert.equal(badDateRes.statusCode, 400);
    assert.match(badDateRes.body.message, /invalid inspection date format/i);

    // B. Record PASSED inspection -> truck remains ACTIVE, issueDetected = false
    const passedRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck1Id,
      result: 'PASSED',
      findings: `${PREFIX}All clear, engine, brakes and tire pressure normal`,
    });

    assert.equal(passedRes.statusCode, 201);
    assert.equal(passedRes.body.status, 'success');
    assert.equal(passedRes.body.data.inspection.result, 'PASSED');
    assert.equal(passedRes.body.data.inspection.issueDetected, false);
    assert.equal(passedRes.body.data.truck.currentStatus, 'ACTIVE');
    assert.equal(passedRes.body.data.truck.isGrounded, false);

    const passedInspectionId = passedRes.body.data.inspection.id;

    // C. Record NEEDS_ATTENTION inspection -> truck remains ACTIVE, issueDetected = true
    const needsAttnRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck1Id,
      result: 'NEEDS_ATTENTION',
      findings: `${PREFIX}Wiper blade rubber degraded, slight cabin AC odor`,
    });

    assert.equal(needsAttnRes.statusCode, 201);
    assert.equal(needsAttnRes.body.data.inspection.result, 'NEEDS_ATTENTION');
    assert.equal(needsAttnRes.body.data.inspection.issueDetected, true);
    assert.equal(needsAttnRes.body.data.truck.currentStatus, 'ACTIVE');
    assert.equal(needsAttnRes.body.data.truck.isGrounded, false);

    // D. Record FAILED inspection -> Automated Grounding (status -> UNDER_MAINTENANCE) + Driver Retention
    const driverUserRes = await query(`SELECT id FROM users WHERE username = '${PREFIX}driver'`);
    const assignedDriverId = driverUserRes.rows[0].id;

    const truck3Res = await query(
      `INSERT INTO trucks (plate_number, model, year_model, current_odometer, last_pm_odometer, status, driver_id)
       VALUES ($1, 'Isuzu NPR', 2021, 50000, 50000, 'ACTIVE', $2)
       RETURNING id`,
      [`${TRUCK_PREFIX}303`, assignedDriverId]
    );
    const testTruck3Id = truck3Res.rows[0].id;

    const failedRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck3Id,
      result: 'FAILED',
      findings: `${PREFIX}Critical brake fluid leak under master cylinder`,
    });

    assert.equal(failedRes.statusCode, 201);
    assert.equal(failedRes.body.data.inspection.result, 'FAILED');
    assert.equal(failedRes.body.data.inspection.issueDetected, true);
    assert.equal(failedRes.body.data.truck.previousStatus, 'ACTIVE');
    assert.equal(failedRes.body.data.truck.currentStatus, 'UNDER_MAINTENANCE');
    assert.equal(failedRes.body.data.truck.isGrounded, true);

    const failedInspectionId = failedRes.body.data.inspection.id;

    // Verify DB state for truck3: status is UNDER_MAINTENANCE, driver_id is STILL intact
    const truck3Db = await query('SELECT status, driver_id FROM trucks WHERE id = $1', [testTruck3Id]);
    assert.equal(truck3Db.rows[0].status, 'UNDER_MAINTENANCE');
    assert.equal(truck3Db.rows[0].driver_id, assignedDriverId);

    // E. Query inspections for truck 1 (paginated & filtered)
    const truck1Inspections = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/inspections/truck/${testTruck1Id}?page=1&limit=10`,
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(truck1Inspections.statusCode, 200);
    assert.equal(truck1Inspections.body.status, 'success');
    assert.equal(truck1Inspections.body.data.truckId, testTruck1Id);
    assert.equal(truck1Inspections.body.data.count, 2);
    assert.equal(truck1Inspections.body.data.total, 2);

    // Filter by result=PASSED
    const filteredPassed = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/inspections/truck/${testTruck1Id}?result=PASSED`,
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(filteredPassed.statusCode, 200);
    assert.equal(filteredPassed.body.data.count, 1);
    assert.equal(filteredPassed.body.data.inspections[0].result, 'PASSED');

    // Non-existent truck inspections query -> 404
    const notFoundTruckQuery = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections/truck/00000000-0000-0000-0000-000000000000',
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(notFoundTruckQuery.statusCode, 404);

    // F. Query single inspection by ID
    const singleInspection = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/inspections/${passedInspectionId}`,
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(singleInspection.statusCode, 200);
    assert.equal(singleInspection.body.status, 'success');
    assert.equal(singleInspection.body.data.inspection.id, passedInspectionId);
    assert.equal(singleInspection.body.data.inspection.plateNumber, `${TRUCK_PREFIX}101`);
    assert.equal(singleInspection.body.data.inspection.result, 'PASSED');
    assert.ok(singleInspection.body.data.inspection.inspectorName);

    // Non-existent inspection ID -> 404
    const notFoundInspection = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/inspections/00000000-0000-0000-0000-000000000000',
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(notFoundInspection.statusCode, 404);

    // G. Centralized History Audit Logging for Inspection
    const inspectionHistory = await query(
      `SELECT * FROM history_logs WHERE target_id = $1 AND details LIKE '%${TRUCK_PREFIX}303%'`,
      [failedInspectionId]
    );
    assert.equal(inspectionHistory.rows.length, 1);
    const inspLogRow = inspectionHistory.rows[0];
    assert.equal(inspLogRow.module, 'Fleet Management');
    assert.equal(inspLogRow.action_type, 'Created');
    assert.equal(inspLogRow.target_type, 'INSPECTION');
    assert.equal(
      inspLogRow.details,
      `Recorded vehicle inspection for ${TRUCK_PREFIX}303 with result: FAILED`
    );
    const inspMeta = typeof inspLogRow.metadata === 'string' ? JSON.parse(inspLogRow.metadata) : inspLogRow.metadata;
    assert.equal(inspMeta.isGrounded, true);
    assert.equal(inspMeta.previousStatus, 'ACTIVE');
    assert.equal(inspMeta.currentStatus, 'UNDER_MAINTENANCE');
  });

  await t.test('7. Incident & Breakdown Reporting - Classification, Critical Grounding & Retrieval', async () => {
    // A. Incident Types Catalog
    const typesRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents/types',
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(typesRes.statusCode, 200);
    assert.equal(typesRes.body.status, 'success');
    assert.ok(Array.isArray(typesRes.body.data.types));
    assert.ok(typesRes.body.data.types.length >= 4);

    const mechDefectType = typesRes.body.data.types.find((t) => t.typeName === 'MECHANICAL_DEFECT') || typesRes.body.data.types[0];
    const tireFailureType = typesRes.body.data.types.find((t) => t.typeName === 'TIRE_FAILURE') || typesRes.body.data.types[1];

    // B. Validation Checks
    // 1. Missing truckId -> 400
    const noTruckInc = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { incidentTypeId: mechDefectType.id, severity: 'LOW', description: 'Small issue' });
    assert.equal(noTruckInc.statusCode, 400);

    // 2. Non-existent truckId -> 404
    const notFoundTruckInc = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: '00000000-0000-0000-0000-000000000000', incidentTypeId: mechDefectType.id, severity: 'LOW', description: 'Small issue' });
    assert.equal(notFoundTruckInc.statusCode, 404);

    // 3. Missing incidentTypeId -> 400
    const noTypeIdInc = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck2Id, severity: 'LOW', description: 'Small issue' });
    assert.equal(noTypeIdInc.statusCode, 400);

    // 4. Invalid incidentTypeId -> 400
    const badTypeIdInc = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck2Id, incidentTypeId: 999999, severity: 'LOW', description: 'Small issue' });
    assert.equal(badTypeIdInc.statusCode, 400);

    // 5. Invalid severity enum -> 400
    const badSeverityInc = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck2Id, incidentTypeId: mechDefectType.id, severity: 'CATASTROPHIC', description: 'Small issue' });
    assert.equal(badSeverityInc.statusCode, 400);

    // 6. Missing description -> 400
    const noDescInc = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck2Id, incidentTypeId: mechDefectType.id, severity: 'LOW' });
    assert.equal(noDescInc.statusCode, 400);

    // 7. Invalid reportDate format -> 400
    const badDateInc = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck2Id, incidentTypeId: mechDefectType.id, severity: 'LOW', description: 'Small issue', reportDate: 'not-a-date' });
    assert.equal(badDateInc.statusCode, 400);

    // C. Record LOW / MEDIUM / HIGH incident -> truck status stays ACTIVE, isGrounded = false
    const medRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck2Id,
      incidentTypeId: tireFailureType.id,
      severity: 'MEDIUM',
      incidentLocation: 'Buhangin Underpass, Davao City',
      description: `${PREFIX}Rear right tire punctured by road debris; replaced with spare`,
    });

    assert.equal(medRes.statusCode, 201);
    assert.equal(medRes.body.status, 'success');
    assert.equal(medRes.body.data.incident.severity, 'MEDIUM');
    assert.equal(medRes.body.data.truck.currentStatus, 'ACTIVE');
    assert.equal(medRes.body.data.truck.isGrounded, false);

    const medIncidentId = medRes.body.data.incident.id;

    // D. Record CRITICAL incident -> Automated Grounding (status -> UNDER_MAINTENANCE) + Driver Retention
    const driverUserRes = await query(`SELECT id FROM users WHERE username = '${PREFIX}driver'`);
    const assignedDriverId = driverUserRes.rows[0].id;

    const truck4Res = await query(
      `INSERT INTO trucks (plate_number, model, year_model, current_odometer, last_pm_odometer, status, driver_id)
       VALUES ($1, 'Fuso Fighter', 2020, 80000, 80000, 'ACTIVE', $2)
       RETURNING id`,
      [`${TRUCK_PREFIX}404`, assignedDriverId]
    );
    const testTruck4Id = truck4Res.rows[0].id;

    const critRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck4Id,
      incidentTypeId: mechDefectType.id,
      severity: 'CRITICAL',
      incidentLocation: 'Panacan Highway Km 13',
      description: `${PREFIX}Transmission locked up and coolant burst; vehicle immobilized`,
    });

    assert.equal(critRes.statusCode, 201);
    assert.equal(critRes.body.status, 'success');
    assert.equal(critRes.body.data.incident.severity, 'CRITICAL');
    assert.equal(critRes.body.data.truck.previousStatus, 'ACTIVE');
    assert.equal(critRes.body.data.truck.currentStatus, 'UNDER_MAINTENANCE');
    assert.equal(critRes.body.data.truck.isGrounded, true);

    const critIncidentId = critRes.body.data.incident.id;

    // Verify DB state for truck4: status UNDER_MAINTENANCE and driver_id intact
    const truck4Db = await query('SELECT status, driver_id FROM trucks WHERE id = $1', [testTruck4Id]);
    assert.equal(truck4Db.rows[0].status, 'UNDER_MAINTENANCE');
    assert.equal(truck4Db.rows[0].driver_id, assignedDriverId);

    // E. Query Fleet Incidents with Filters
    // 1. Filter by severity=CRITICAL
    const critFleetRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents?severity=CRITICAL',
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(critFleetRes.statusCode, 200);
    assert.ok(critFleetRes.body.data.incidents.some((i) => i.id === critIncidentId));

    // 2. Filter by search keyword
    const searchFleetRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/incidents?search=${PREFIX}`,
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(searchFleetRes.statusCode, 200);
    assert.ok(searchFleetRes.body.data.count >= 2);

    // F. Query Incidents for Specific Truck
    const truck2Incidents = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/incidents/truck/${testTruck2Id}`,
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(truck2Incidents.statusCode, 200);
    assert.equal(truck2Incidents.body.data.truckId, testTruck2Id);
    assert.ok(truck2Incidents.body.data.count >= 1);
    assert.equal(truck2Incidents.body.data.incidents[0].id, medIncidentId);

    // Non-existent truck query -> 404
    const notFoundTruckQuery = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents/truck/00000000-0000-0000-0000-000000000000',
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(notFoundTruckQuery.statusCode, 404);

    // G. Query Single Incident by ID
    const singleIncRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/incidents/${critIncidentId}`,
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(singleIncRes.statusCode, 200);
    assert.equal(singleIncRes.body.status, 'success');
    assert.equal(singleIncRes.body.data.incident.id, critIncidentId);
    assert.equal(singleIncRes.body.data.incident.plateNumber, `${TRUCK_PREFIX}404`);
    assert.equal(singleIncRes.body.data.incident.severity, 'CRITICAL');
    assert.ok(singleIncRes.body.data.incident.reporterName);
    assert.ok(singleIncRes.body.data.incident.incidentTypeName);

    // Non-existent incident UUID -> 404
    const notFoundIncident = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/incidents/00000000-0000-0000-0000-000000000000',
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(notFoundIncident.statusCode, 404);

    // H. Centralized History Audit Logging for Incident Report
    const incidentHistory = await query(
      `SELECT * FROM history_logs WHERE target_id = $1 AND details LIKE '%${TRUCK_PREFIX}404%'`,
      [critIncidentId]
    );
    assert.equal(incidentHistory.rows.length, 1);
    const incLogRow = incidentHistory.rows[0];
    assert.equal(incLogRow.module, 'Fleet Management');
    assert.equal(incLogRow.action_type, 'Created');
    assert.equal(incLogRow.target_type, 'INCIDENT');
    assert.equal(
      incLogRow.details,
      `Reported CRITICAL incident for truck ${TRUCK_PREFIX}404: ${PREFIX}Transmission locked up and coolant burst; vehicle immobilized`
    );
    const incMeta = typeof incLogRow.metadata === 'string' ? JSON.parse(incLogRow.metadata) : incLogRow.metadata;
    assert.equal(incMeta.isGrounded, true);
    assert.equal(incMeta.previousStatus, 'ACTIVE');
    assert.equal(incMeta.currentStatus, 'UNDER_MAINTENANCE');
  });

  await t.test('8. Work Order Creation, Categorization & Cost Approval Gatekeeping', async () => {
    // A. Catalog of Maintenance Types
    const typesRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders/types',
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(typesRes.statusCode, 200);
    assert.equal(typesRes.body.status, 'success');
    assert.ok(Array.isArray(typesRes.body.data.types));
    assert.ok(typesRes.body.data.types.length >= 4);

    const prevType = typesRes.body.data.types.find((t) => t.typeName === 'PREVENTIVE') || typesRes.body.data.types[0];
    const corrType = typesRes.body.data.types.find((t) => t.typeName === 'CORRECTIVE') || typesRes.body.data.types[1];

    // B. Validation Checks
    // 1. Missing truckId -> 400
    const noTruckRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { maintenanceTypeId: prevType.id, description: 'Service' });
    assert.equal(noTruckRes.statusCode, 400);

    // 2. Non-existent truckId -> 404
    const notFoundTruck = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: '00000000-0000-0000-0000-000000000000', maintenanceTypeId: prevType.id, description: 'Service' });
    assert.equal(notFoundTruck.statusCode, 404);

    // 3. Missing maintenanceTypeId -> 400
    const noTypeRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, description: 'Service' });
    assert.equal(noTypeRes.statusCode, 400);

    // 4. Missing description -> 400
    const noDescRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, maintenanceTypeId: prevType.id });
    assert.equal(noDescRes.statusCode, 400);

    // 5. Negative estimatedCost -> 400
    const negCostRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { truckId: testTruck1Id, maintenanceTypeId: prevType.id, description: 'Service', estimatedCost: -500 });
    assert.equal(negCostRes.statusCode, 400);

    // C. Create Low-Cost Work Order (< ₱5,000.00) -> Auto-Approved / Scheduled, No Approval Request
    const lowCostRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck1Id,
      maintenanceTypeId: prevType.id,
      shopName: 'Bunawan Yard Shop',
      estimatedCost: 3500.00,
      description: `${PREFIX}5,000-km routine oil change and lubrication`,
    });

    assert.equal(lowCostRes.statusCode, 201);
    assert.equal(lowCostRes.body.status, 'success');
    assert.equal(lowCostRes.body.data.workOrder.status, 'APPROVED');
    assert.equal(lowCostRes.body.data.workOrder.requiresApproval, false);
    assert.equal(lowCostRes.body.data.approvalRequest, null);
    assert.equal(lowCostRes.body.data.truck.currentStatus, 'UNDER_MAINTENANCE');

    // D. Create High-Cost Work Order (>= ₱5,000.00) -> PENDING, creates approval_requests
    const highCostRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck2Id,
      maintenanceTypeId: corrType.id,
      shopName: 'Davao Heavy Motors Corp',
      estimatedCost: 14500.00,
      description: `${PREFIX}Engine clutch replacement and transmission rebuild`,
    });

    assert.equal(highCostRes.statusCode, 201);
    assert.equal(highCostRes.body.data.workOrder.status, 'PENDING');
    assert.equal(highCostRes.body.data.workOrder.requiresApproval, true);
    assert.ok(highCostRes.body.data.approvalRequest);
    assert.equal(highCostRes.body.data.approvalRequest.amountRequested, 14500);
    assert.equal(highCostRes.body.data.approvalRequest.status, 'PENDING_REVIEW');
    assert.equal(highCostRes.body.data.approvalRequest.isApproved, null);

    const pendingWorkOrderId = highCostRes.body.data.workOrder.id;

    // E. Cost Approval Gatekeeping: Logistics Supervisor cannot approve (403 Forbidden)
    const supApprovalAttempt = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${pendingWorkOrderId}/approve`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { isApproved: true, remarks: 'Supervisor self-approval attempt' });

    assert.equal(supApprovalAttempt.statusCode, 403);
    assert.match(supApprovalAttempt.body.message, /only super admin or admin/i);

    // F. Admin Approves High-Cost Work Order -> Status becomes APPROVED
    const adminApproveRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${pendingWorkOrderId}/approve`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    }, { isApproved: true, remarks: `${PREFIX}Approved for urgent heavy overhaul` });

    assert.equal(adminApproveRes.statusCode, 200);
    assert.equal(adminApproveRes.body.data.workOrder.status, 'APPROVED');
    assert.equal(adminApproveRes.body.data.approvalRequest.isApproved, true);
    assert.equal(adminApproveRes.body.data.approvalRequest.status, 'APPROVED');
    assert.ok(adminApproveRes.body.data.approvalRequest.deciderName);

    // G. Create another high-cost work order and Admin Rejects -> Status becomes CANCELLED
    const rejectTargetRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck2Id,
      maintenanceTypeId: corrType.id,
      estimatedCost: 25000.00,
      description: `${PREFIX}Non-essential cabin body upgrade`,
    });
    const rejectOrderId = rejectTargetRes.body.data.workOrder.id;

    const adminRejectRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${rejectOrderId}/approve`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    }, { isApproved: false, remarks: `${PREFIX}Rejected due to quarterly budget caps` });

    assert.equal(adminRejectRes.statusCode, 200);
    assert.equal(adminRejectRes.body.data.workOrder.status, 'CANCELLED');
    assert.equal(adminRejectRes.body.data.approvalRequest.isApproved, false);
    assert.equal(adminRejectRes.body.data.approvalRequest.status, 'REJECTED');

    // H. History Audit Log Verification
    const createLog = await query(
      `SELECT * FROM history_logs WHERE target_id = $1 AND details LIKE '%${testTruck1Id.slice(0, 8)}%' OR details LIKE '%${TRUCK_PREFIX}101%'`,
      [lowCostRes.body.data.workOrder.id]
    );
    assert.ok(createLog.rows.length >= 1);
    assert.equal(createLog.rows[0].module, 'Fleet Management');
    assert.equal(createLog.rows[0].action_type, 'Created');
    assert.equal(createLog.rows[0].target_type, 'WORK_ORDER');

    const approveLog = await query(
      `SELECT * FROM history_logs WHERE target_id = $1 AND action_type = 'Updated'`,
      [pendingWorkOrderId]
    );
    assert.equal(approveLog.rows.length, 1);
    assert.equal(approveLog.rows[0].module, 'Fleet Management');
    assert.equal(
      approveLog.rows[0].details,
      `Work order #${pendingWorkOrderId} approval decision: APPROVED`
    );
  });

  await t.test('9. Work Order State Progression & Operational Grounding Invariants', async () => {
    // 1. Create an approved work order
    const prevType = (await query(`SELECT id FROM maintenance_types WHERE type_name = 'PREVENTIVE'`)).rows[0];
    const orderRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck1Id,
      maintenanceTypeId: prevType.id,
      shopName: 'Bunawan Express Service',
      estimatedCost: 2000.00,
      description: `${PREFIX}Brake pad inspection and adjustment`,
    });
    assert.equal(orderRes.statusCode, 201);
    const orderId = orderRes.body.data.workOrder.id;

    // 2. Advance APPROVED -> SCHEDULED
    const schedRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${orderId}/status`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { status: 'SCHEDULED' });
    assert.equal(schedRes.statusCode, 200);
    assert.equal(schedRes.body.data.workOrder.status, 'SCHEDULED');

    // 3. Advance SCHEDULED -> IN_PROGRESS
    const inProgRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${orderId}/status`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { status: 'IN_PROGRESS' });
    assert.equal(inProgRes.statusCode, 200);
    assert.equal(inProgRes.body.data.workOrder.status, 'IN_PROGRESS');

    // Verify truck status is confirmed as UNDER_MAINTENANCE
    const truckDb = await query('SELECT status FROM trucks WHERE id = $1', [testTruck1Id]);
    assert.equal(truckDb.rows[0].status, 'UNDER_MAINTENANCE');

    // 4. Attempt manual direct completion via /status -> 400 Bad Request
    const directCompleteRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${orderId}/status`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { status: 'COMPLETED' });
    assert.equal(directCompleteRes.statusCode, 400);
    assert.match(directCompleteRes.body.message, /finalizing the maintenance log/i);

    // 5. Attempt invalid transition (IN_PROGRESS -> APPROVED) -> 400 Bad Request
    const invalidTransRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${orderId}/status`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { status: 'APPROVED' });
    assert.equal(invalidTransRes.statusCode, 400);
    assert.match(invalidTransRes.body.message, /invalid status transition/i);
  });

  await t.test('10. Maintenance Log Finalization, PM Reset & Operational Release', async () => {
    // 1. Setup truck with assigned driver and PM due delta
    const driverUser = (await query(`SELECT id FROM users WHERE username = '${PREFIX}driver'`)).rows[0];
    const prevType = (await query(`SELECT id FROM maintenance_types WHERE type_name = 'PREVENTIVE'`)).rows[0];

    const truck5Res = await query(
      `INSERT INTO trucks (plate_number, model, year_model, current_odometer, last_pm_odometer, status, driver_id)
       VALUES ($1, 'Hino 500 Heavy', 2021, 25500, 20000, 'ACTIVE', $2)
       RETURNING id`,
      [`${TRUCK_PREFIX}505`, driverUser.id]
    );
    const testTruck5Id = truck5Res.rows[0].id;

    // 2. Create PREVENTIVE work order for truck5
    const woRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck5Id,
      maintenanceTypeId: prevType.id,
      shopName: 'Bunawan Heavy Service Center',
      estimatedCost: 4500.00,
      description: `${PREFIX}5,000-km preventive overhaul and fuel filter replacement`,
    });
    assert.equal(woRes.statusCode, 201);
    const workOrderId = woRes.body.data.workOrder.id;

    // Advance to IN_PROGRESS
    await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${workOrderId}/status`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, { status: 'IN_PROGRESS' });

    // 3. Validation on Finalize:
    // Missing receipt number -> 400
    const noOrRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${workOrderId}/finalize`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      severity: 'MEDIUM',
      dateStarted: '2026-09-18T08:00:00Z',
      dateResolved: '2026-09-18T16:00:00Z',
      odometerAtService: 25600,
    });
    assert.equal(noOrRes.statusCode, 400);

    // dateResolved earlier than dateStarted -> 400
    const badDatesRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${workOrderId}/finalize`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      officialReceiptNumber: `${PREFIX}OR-10001`,
      severity: 'MEDIUM',
      dateStarted: '2026-09-18T16:00:00Z',
      dateResolved: '2026-09-18T08:00:00Z',
      odometerAtService: 25600,
    });
    assert.equal(badDatesRes.statusCode, 400);

    // 4. Finalize Maintenance Log (Success)
    const finalizeRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${workOrderId}/finalize`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      officialReceiptNumber: `${PREFIX}OR-10001`,
      severity: 'MEDIUM',
      dateStarted: '2026-09-17T08:00:00Z',
      dateResolved: '2026-09-18T17:00:00Z',
      partsCost: 3200.50,
      laborCost: 1500.00,
      downtimeDays: 1,
      odometerAtService: 25600,
    });

    assert.equal(finalizeRes.statusCode, 201);
    assert.equal(finalizeRes.body.status, 'success');
    assert.equal(finalizeRes.body.data.workOrder.status, 'COMPLETED');
    assert.equal(finalizeRes.body.data.maintenanceLog.officialReceiptNumber, `${PREFIX}OR-10001`);
    assert.equal(finalizeRes.body.data.maintenanceLog.totalCost, 4700.50);
    assert.equal(finalizeRes.body.data.truck.status, 'ACTIVE');
    assert.equal(finalizeRes.body.data.truck.isPmReset, true);
    assert.equal(finalizeRes.body.data.truck.lastPmOdometer, 25600);

    // 5. Database State Verification:
    // - Truck status is ACTIVE
    // - Driver assignment is STILL intact
    // - last_pm_odometer updated to 25600
    // - current_odometer updated to 25600
    // - PM delta reset to 0
    const truckDb = await query('SELECT * FROM trucks WHERE id = $1', [testTruck5Id]);
    const finalTruck = truckDb.rows[0];
    assert.equal(finalTruck.status, 'ACTIVE');
    assert.equal(finalTruck.driver_id, driverUser.id);
    assert.equal(finalTruck.last_pm_odometer, 25600);
    assert.equal(finalTruck.current_odometer, 25600);
    assert.equal(finalTruck.current_odometer - finalTruck.last_pm_odometer, 0);

    // 6. Duplicate Official Receipt Number Rejection (409 Conflict)
    // Create another work order on truck1 and attempt same receipt number
    const duplicateTargetRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/fleet/maintenance/work-orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      truckId: testTruck1Id,
      maintenanceTypeId: prevType.id,
      estimatedCost: 1000.00,
      description: `${PREFIX}Duplicate test`,
    });
    const dupOrderId = duplicateTargetRes.body.data.workOrder.id;

    const duplicateOrRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/work-orders/${dupOrderId}/finalize`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: supervisorCookie },
    }, {
      officialReceiptNumber: `${PREFIX}OR-10001`,
      severity: 'LOW',
      dateStarted: '2026-09-18T08:00:00Z',
      dateResolved: '2026-09-18T10:00:00Z',
      odometerAtService: 13000,
    });
    assert.equal(duplicateOrRes.statusCode, 409);
    assert.match(duplicateOrRes.body.message, /already been registered/i);

    // 7. Centralized History Audit Logging for Finalization
    const logHistory = await query(
      `SELECT * FROM history_logs WHERE details LIKE '%${PREFIX}OR-10001%'`,
    );
    assert.equal(logHistory.rows.length, 1);
    const histRow = logHistory.rows[0];
    assert.equal(histRow.module, 'Fleet Management');
    assert.equal(histRow.action_type, 'Created');
    assert.equal(histRow.target_type, 'MAINTENANCE_LOG');
    assert.equal(
      histRow.details,
      `Finalized maintenance log for work order #${workOrderId} (OR #${PREFIX}OR-10001)`
    );

    // 8. Query Historical Maintenance Logs (GET /api/fleet/maintenance/logs)
    const logsRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/fleet/maintenance/logs?search=${PREFIX}OR-10001`,
      method: 'GET',
      headers: { Cookie: supervisorCookie },
    });
    assert.equal(logsRes.statusCode, 200);
    assert.equal(logsRes.body.status, 'success');
    assert.equal(logsRes.body.data.count, 1);
    assert.equal(logsRes.body.data.logs[0].officialReceiptNumber, `${PREFIX}OR-10001`);
    assert.equal(logsRes.body.data.logs[0].plateNumber, `${TRUCK_PREFIX}505`);
    assert.equal(logsRes.body.data.logs[0].totalCost, 4700.50);
  });
});
