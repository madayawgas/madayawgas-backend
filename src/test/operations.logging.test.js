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

test('Operational Logging Subsystems Integration Tests', async (t) => {
  let adminCookie;
  let supervisorCookie;
  let driver1Cookie;
  let driver2Cookie;
  let driverUnassignedCookie;

  let adminUser;
  let supervisorUser;
  let driver1User;
  let driver2User;
  let driverUnassignedUser;

  let truck1;
  let truck2;
  let activeTrip1;

  beforeEach(async () => {
    // 1. Clean test records in reverse dependency order
    await query(`
      DELETE FROM emergency_alerts
      WHERE driver_id IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')
         OR vehicle_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%')
    `);

    await query(`
      DELETE FROM vehicle_fuel_logs
      WHERE recorded_by IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')
         OR driver_id IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')
         OR vehicle_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%')
    `);

    await query(`
      DELETE FROM driver_apprehensions
      WHERE driver_id IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')
         OR vehicle_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%')
    `);

    await query(`
      DELETE FROM duty_attendance
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')
    `);

    await query(`
      DELETE FROM trip_load_items
      WHERE load_id IN (
        SELECT id FROM trip_loads
        WHERE trip_id IN (
          SELECT id FROM trips
          WHERE trip_number LIKE 'TEST-OPS-%'
             OR notes LIKE '%test_ops_%'
             OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%')
        )
      )
    `);

    await query(`
      DELETE FROM trip_loads
      WHERE trip_id IN (
        SELECT id FROM trips
        WHERE trip_number LIKE 'TEST-OPS-%'
           OR notes LIKE '%test_ops_%'
           OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%')
      )
    `);

    await query(`
      DELETE FROM trip_stock_reconciliations
      WHERE trip_id IN (
        SELECT id FROM trips
        WHERE trip_number LIKE 'TEST-OPS-%'
           OR notes LIKE '%test_ops_%'
           OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%')
      )
    `);

    await query(`
      DELETE FROM trips
      WHERE trip_number LIKE 'TEST-OPS-%'
         OR notes LIKE '%test_ops_%'
         OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%')
    `);

    await query(`
      DELETE FROM truck_schedules
      WHERE notes LIKE '%test_ops_%'
         OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%')
    `);

    await query(`DELETE FROM service_zones WHERE code LIKE 'TEST-OPS-%'`);

    await query(`
      DELETE FROM vehicle_odometer_logs
      WHERE notes LIKE '%test_ops_%'
         OR vehicle_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%')
    `);

    await query(`DELETE FROM vehicles WHERE plate_number LIKE 'TEST-OPS-%'`);

    await query(`
      DELETE FROM history_logs
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')
         OR details LIKE '%TEST-OPS-%'
    `);

    await query(`
      DELETE FROM audit_logs
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')
         OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')
    `);

    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')`);
    await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_ops_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_ops_%'`);

    // 2. Fetch role IDs
    const adminRoleId = (await query(`SELECT id FROM roles WHERE name = 'Admin'`)).rows[0].id;
    const supervisorRoleId = (await query(`SELECT id FROM roles WHERE name IN ('Logistics Supervisor', 'Fleet Manager') LIMIT 1`)).rows[0].id;
    const driverRoleId = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;
    const salesRoleId = (await query(`SELECT id FROM roles WHERE name = 'Sales Person'`)).rows[0].id;

    // 3. Create test users with identical password
    const passwordHash = await bcrypt.hash('OpsPass123!', 10);

    const adminRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_ops_admin', passwordHash, 'Alice', 'Admin', '+639175000001', adminRoleId]
    );
    adminUser = adminRes.rows[0];

    const supRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_ops_sup', passwordHash, 'Bob', 'Supervisor', '+639175000002', supervisorRoleId]
    );
    supervisorUser = supRes.rows[0];

    const drv1Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_ops_driver1', passwordHash, 'Dan', 'DriverOne', '+639175000003', driverRoleId]
    );
    driver1User = drv1Res.rows[0];

    const drv2Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_ops_driver2', passwordHash, 'Dave', 'DriverTwo', '+639175000004', driverRoleId]
    );
    driver2User = drv2Res.rows[0];

    const drvUnres = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_ops_driver_un', passwordHash, 'Derek', 'Unassigned', '+639175000005', driverRoleId]
    );
    driverUnassignedUser = drvUnres.rows[0];

    const salesRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_ops_sales', passwordHash, 'Sam', 'Sales', '+639175000006', salesRoleId]
    );
    const salesUser = salesRes.rows[0];

    // 4. Create vehicles
    const truck1Res = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status, driver_id)
      VALUES ('TEST-OPS-TRK1', 'Isuzu Elf 4-Wheeler', 2022, 'DELIVERY_TRUCK', 15000, 15000, 'ACTIVE', $1)
      RETURNING *
    `, [driver1User.id]);
    truck1 = truck1Res.rows[0];

    const truck2Res = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status, driver_id)
      VALUES ('TEST-OPS-TRK2', 'Hino 300 Series', 2021, 'DELIVERY_TRUCK', 32000, 30000, 'ACTIVE', $1)
      RETURNING *
    `, [driver2User.id]);
    truck2 = truck2Res.rows[0];

    // 5. Create service zone
    const zoneRes = await query(`
      INSERT INTO service_zones (code, name, description, is_active)
      VALUES ('TEST-OPS-Z1', 'Test Ops Zone', 'Zone for operational testing', TRUE)
      RETURNING *
    `);
    const opsZone = zoneRes.rows[0];

    // 6. Create an active trip for truck 1 / driver 1
    const tripRes = await query(`
      INSERT INTO trips (trip_number, truck_id, driver_id, sales_user_id, zone_id, status, notes)
      VALUES ('TEST-OPS-TRIP-101', $1, $2, $3, $4, 'IN_PROGRESS', 'test_ops_active_trip')
      RETURNING *
    `, [truck1.id, driver1User.id, salesUser.id, opsZone.id]);
    activeTrip1 = tripRes.rows[0];

    // 6. Log in personas and capture cookies
    const loginPersona = async (username) => {
      const res = await fetch(`${baseUrl}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'OpsPass123!' }),
      });
      return parseCookieHeader(res);
    };

    adminCookie = await loginPersona('test_ops_admin');
    supervisorCookie = await loginPersona('test_ops_sup');
    driver1Cookie = await loginPersona('test_ops_driver1');
    driver2Cookie = await loginPersona('test_ops_driver2');
    driverUnassignedCookie = await loginPersona('test_ops_driver_un');
  });

  // ============================================================
  // 1. Driver Scoped Capabilities & Route Guards
  // ============================================================
  await t.test('1. Driver Scoped Capabilities & Route Guards', async () => {
    // 1.1 Driver 1 can view own assigned vehicle via /my-vehicle
    const myVehRes = await fetch(`${baseUrl}/api/fleet/my-vehicle`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(myVehRes.status, 200);
    const myVehBody = await myVehRes.json();
    assert.equal(myVehBody.data.vehicle.plateNumber, 'TEST-OPS-TRK1');

    // 1.2 Unassigned driver gets 404 on /my-vehicle
    const unassignedVehRes = await fetch(`${baseUrl}/api/fleet/my-vehicle`, {
      headers: { Cookie: `mg_sid=${driverUnassignedCookie}` },
    });
    assert.equal(unassignedVehRes.status, 404);

    // 1.3 Driver 1 can view assigned vehicle details
    const veh1Res = await fetch(`${baseUrl}/api/fleet/vehicles/${truck1.id}`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(veh1Res.status, 200);

    // 1.4 Driver 1 cannot view Driver 2's vehicle details (403 Forbidden)
    const veh2Res = await fetch(`${baseUrl}/api/fleet/vehicles/${truck2.id}`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(veh2Res.status, 403);

    // 1.5 Driver 1 can view own vehicle odometer history
    const odo1Res = await fetch(`${baseUrl}/api/fleet/maintenance/odometer/truck/${truck1.id}`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(odo1Res.status, 200);

    // 1.6 Driver 1 cannot view Driver 2's odometer history
    const odo2Res = await fetch(`${baseUrl}/api/fleet/maintenance/odometer/truck/${truck2.id}`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(odo2Res.status, 403);

    // 1.7 Driver 1 can view own assigned trip
    const trip1Res = await fetch(`${baseUrl}/api/trips/${activeTrip1.id}`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(trip1Res.status, 200);

    // 1.8 Driver 2 cannot view Driver 1's trip
    const trip2Res = await fetch(`${baseUrl}/api/trips/${activeTrip1.id}`, {
      headers: { Cookie: `mg_sid=${driver2Cookie}` },
    });
    assert.equal(trip2Res.status, 403);
  });

  // ============================================================
  // 2. Duty Attendance Subsystem
  // ============================================================
  await t.test('2. Duty Attendance (Clock-In, Active Check, Double-Clock-In Rejection, Clock-Out & Duration)', async () => {
    // 2.1 Driver clocks in successfully via direct alias /api/attendance/clock-in
    const clockInRes = await fetch(`${baseUrl}/api/attendance/clock-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({ notes: 'Starting morning shift' }),
    });
    assert.equal(clockInRes.status, 201);
    const clockInBody = await clockInRes.json();
    assert.equal(clockInBody.status, 'success');
    assert.equal(clockInBody.data.userId, driver1User.id);
    assert.equal(clockInBody.data.status, 'ACTIVE');

    // 2.2 Duty cycle integrity: Attempting to clock in again while an active cycle exists fails
    const doubleClockInRes = await fetch(`${baseUrl}/api/operations/attendance/clock-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({ notes: 'Trying double clock in' }),
    });
    assert.equal(doubleClockInRes.status, 400);
    const doubleBody = await doubleClockInRes.json();
    assert.equal(doubleBody.code, 'OPEN_DUTY_CYCLE_EXISTS');

    // 2.3 Query active duty cycle
    const activeDutyRes = await fetch(`${baseUrl}/api/attendance/active`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(activeDutyRes.status, 200);
    const activeDutyBody = await activeDutyRes.json();
    assert.ok(activeDutyBody.data);
    assert.equal(activeDutyBody.data.id, clockInBody.data.id);

    // 2.4 Supervisor clocks in on behalf of driver 2
    const supClockInRes = await fetch(`${baseUrl}/api/operations/attendance/clock-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${supervisorCookie}`,
      },
      body: JSON.stringify({ targetUserId: driver2User.id, notes: 'Dispatcher manual clock-in' }),
    });
    assert.equal(supClockInRes.status, 201);
    const supClockInBody = await supClockInRes.json();
    assert.equal(supClockInBody.data.userId, driver2User.id);

    // 2.5 Driver 1 cannot clock in on behalf of another user (403 Forbidden)
    const unauthorizedClockInRes = await fetch(`${baseUrl}/api/operations/attendance/clock-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({ targetUserId: driverUnassignedUser.id }),
    });
    assert.equal(unauthorizedClockInRes.status, 403);

    // 2.6 Driver 1 clocks out successfully
    const clockOutRes = await fetch(`${baseUrl}/api/attendance/clock-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({ notes: 'Shift completed successfully' }),
    });
    assert.equal(clockOutRes.status, 200);
    const clockOutBody = await clockOutRes.json();
    assert.equal(clockOutBody.status, 'success');
    assert.equal(clockOutBody.data.status, 'COMPLETED');
    assert.ok(clockOutBody.data.clockOutTime);
    assert.ok(clockOutBody.data.durationFormatted);

    // 2.7 Clocking out when no active cycle exists returns 400 Bad Request
    const noCycleClockOutRes = await fetch(`${baseUrl}/api/attendance/clock-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({ notes: 'Second clock out' }),
    });
    assert.equal(noCycleClockOutRes.status, 400);
    const noCycleBody = await noCycleClockOutRes.json();
    assert.equal(noCycleBody.code, 'NO_ACTIVE_DUTY_CYCLE');

    // 2.8 Retrieve attendance logs with pagination & filtering
    const listRes = await fetch(`${baseUrl}/api/operations/attendance?limit=10&page=1`, {
      headers: { Cookie: `mg_sid=${supervisorCookie}` },
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    const items = Array.isArray(listBody.data) ? listBody.data : listBody.data.items;
    assert.ok(items);
    assert.ok(items.length >= 2);
    assert.ok(listBody.meta);
  });

  // ============================================================
  // 3. Driver Road Apprehensions Subsystem
  // ============================================================
  await t.test('3. Driver Road Apprehensions (Mandatory Proof, Creation, Status Update & Scoping)', async () => {
    // 3.1 Reject recording apprehension without mandatory ticket media key (400 Bad Request)
    const noProofRes = await fetch(`${baseUrl}/api/operations/apprehensions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({
        vehicleId: truck1.id,
        citationNumber: 'CIT-12345',
        agency: 'LTO',
        violation: 'Defective taillight',
      }),
    });
    assert.equal(noProofRes.status, 400);
    const noProofBody = await noProofRes.json();
    assert.equal(noProofBody.code, 'MEDIA_KEY_REQUIRED');

    // 3.2 Driver 1 records apprehension with mandatory ticket proof
    const validApprRes = await fetch(`${baseUrl}/api/operations/apprehensions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({
        vehicleId: truck1.id,
        citationNumber: 'CIT-98765',
        agency: 'CTTMO',
        violation: 'Truck ban violation',
        ticketMediaKey: 'operations/apprehensions/ticket_cit_98765.jpg',
        fineAmount: 1500,
        notes: 'Officer issued citation on JP Laurel Ave',
      }),
    });
    assert.equal(validApprRes.status, 201);
    const apprBody = await validApprRes.json();
    assert.equal(apprBody.status, 'success');
    assert.equal(apprBody.data.vehicleId, truck1.id);
    assert.equal(apprBody.data.driverId, driver1User.id);
    assert.equal(apprBody.data.tripId, activeTrip1.id); // Auto-linked to active trip
    assert.equal(apprBody.data.status, 'RECORDED');
    const createdApprId = apprBody.data.id;

    // 3.3 Driver 1 can view own apprehension record
    const getOwnApprRes = await fetch(`${baseUrl}/api/operations/apprehensions/${createdApprId}`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(getOwnApprRes.status, 200);

    // 3.4 Driver 2 cannot view Driver 1's apprehension record (403 Forbidden)
    const getOtherApprRes = await fetch(`${baseUrl}/api/operations/apprehensions/${createdApprId}`, {
      headers: { Cookie: `mg_sid=${driver2Cookie}` },
    });
    assert.equal(getOtherApprRes.status, 403);

    // 3.5 Supervisor updates status to SETTLED
    const updateStatusRes = await fetch(`${baseUrl}/api/operations/apprehensions/${createdApprId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${supervisorCookie}`,
      },
      body: JSON.stringify({ status: 'SETTLED', notes: 'Fine paid at CTTMO central office' }),
    });
    assert.equal(updateStatusRes.status, 200);
    const updateBody = await updateStatusRes.json();
    assert.equal(updateBody.data.status, 'SETTLED');
  });

  // ============================================================
  // 4. Vehicle Fuel Tracking Subsystem
  // ============================================================
  await t.test('4. Vehicle Fuel Tracking (Validation, Monotonic Odometer, Advancement & Summaries)', async () => {
    // 4.1 Rejects zero or negative liters pumped (400 Bad Request)
    const invalidLitersRes = await fetch(`${baseUrl}/api/operations/fuel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({
        vehicleId: truck1.id,
        litersPumped: -10,
        totalCost: 500,
      }),
    });
    assert.equal(invalidLitersRes.status, 400);

    // 4.2 Rejects negative fuel cost (400 Bad Request)
    const invalidCostRes = await fetch(`${baseUrl}/api/operations/fuel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({
        vehicleId: truck1.id,
        litersPumped: 25.5,
        totalCost: -100,
      }),
    });
    assert.equal(invalidCostRes.status, 400);

    // 4.3 Driver 1 cannot log fuel for Driver 2's vehicle (403 Forbidden)
    const forbiddenFuelRes = await fetch(`${baseUrl}/api/operations/fuel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({
        vehicleId: truck2.id,
        litersPumped: 30,
        totalCost: 1800,
      }),
    });
    assert.equal(forbiddenFuelRes.status, 403);

    // 4.4 Backward odometer validation (truck 1 current odometer is 15000; submitting 14000 fails)
    const backwardOdoRes = await fetch(`${baseUrl}/api/operations/fuel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({
        vehicleId: truck1.id,
        litersPumped: 35.0,
        totalCost: 2100.0,
        odometerReading: 14000,
      }),
    });
    assert.equal(backwardOdoRes.status, 400);
    const backwardBody = await backwardOdoRes.json();
    assert.equal(backwardBody.code, 'INVALID_ODOMETER_SEQUENCE');

    // 4.5 Successful fuel logging with odometer advancement and optional receipt proof
    const validFuelRes = await fetch(`${baseUrl}/api/operations/fuel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({
        vehicleId: truck1.id,
        litersPumped: 40.0,
        totalCost: 2400.0,
        odometerReading: 15350,
        fuelStation: 'Petron Bajada',
        receiptMediaKey: 'operations/fuel/receipt_petron_15350.jpg',
      }),
    });
    assert.equal(validFuelRes.status, 201);
    const fuelBody = await validFuelRes.json();
    assert.equal(fuelBody.status, 'success');
    assert.equal(fuelBody.data.litersPumped, 40.0);
    assert.equal(fuelBody.data.totalCost, 2400.0);
    assert.equal(fuelBody.data.pricePerLiter, 60.0);
    assert.equal(fuelBody.data.tripId, activeTrip1.id);

    // 4.6 Verify vehicle's current odometer was advanced automatically
    const updatedTruckRes = await query('SELECT current_odometer FROM vehicles WHERE id = $1', [truck1.id]);
    assert.equal(Number(updatedTruckRes.rows[0].current_odometer), 15350);

    // 4.7 Verify vehicle_odometer_logs entry was written
    const odoLogRes = await query('SELECT * FROM vehicle_odometer_logs WHERE vehicle_id = $1 AND odometer_reading = 15350', [truck1.id]);
    assert.equal(odoLogRes.rows.length, 1);
    assert.equal(odoLogRes.rows[0].source, 'FUEL_ENTRY');

    // 4.8 Query fuel consumption summary statistics
    const summaryRes = await fetch(`${baseUrl}/api/operations/fuel/summary?vehicleId=${truck1.id}`, {
      headers: { Cookie: `mg_sid=${supervisorCookie}` },
    });
    assert.equal(summaryRes.status, 200);
    const summaryBody = await summaryRes.json();
    assert.equal(summaryBody.data.summary.totalLiters, 40.0);
    assert.equal(summaryBody.data.summary.totalCost, 2400.0);
    assert.equal(summaryBody.data.summary.averagePricePerLiter, 60.0);
  });

  // ============================================================
  // 5. Driver Emergency Alerts Subsystem
  // ============================================================
  await t.test('5. Driver Emergency Alerts (SOS, Auto-Context, Anti-Spam, Polling & Resolution)', async () => {
    // 5.1 Driver 1 dispatches single-action SOS with geolocation
    const sosRes = await fetch(`${baseUrl}/api/operations/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({
        latitude: 7.0731,
        longitude: 125.6128,
        emergencyType: 'ACCIDENT',
        description: 'Rear collision at intersection',
      }),
    });
    assert.equal(sosRes.status, 201);
    const sosBody = await sosRes.json();
    assert.equal(sosBody.status, 'success');
    assert.equal(sosBody.data.isDuplicate, false);
    assert.equal(sosBody.data.driverId, driver1User.id);
    assert.equal(sosBody.data.vehicleId, truck1.id); // Auto-resolved assigned vehicle
    assert.equal(sosBody.data.tripId, activeTrip1.id); // Auto-resolved active trip
    assert.equal(sosBody.data.status, 'ACTIVE');
    assert.equal(sosBody.data.emergencyType, 'ACCIDENT');
    assert.equal(sosBody.data.location.latitude, 7.0731);
    assert.equal(sosBody.data.location.longitude, 125.6128);
    const createdAlertId = sosBody.data.id;

    // 5.2 Anti-spam idempotency: immediate second SOS within 60 seconds returns 200 with isDuplicate = true
    const spamRes = await fetch(`${baseUrl}/api/operations/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({
        emergencyType: 'ACCIDENT',
        description: 'Repeated button push',
      }),
    });
    assert.equal(spamRes.status, 200);
    const spamBody = await spamRes.json();
    assert.equal(spamBody.data.isDuplicate, true);
    assert.equal(spamBody.data.id, createdAlertId);

    // 5.3 Driver 2 dispatches emergency with null GPS coordinates (graceful handling)
    const nullGpsRes = await fetch(`${baseUrl}/api/operations/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver2Cookie}`,
      },
      body: JSON.stringify({
        latitude: null,
        longitude: null,
        emergencyType: 'VEHICLE_BREAKDOWN',
        description: 'Overheating engine, GPS signal lost',
      }),
    });
    assert.equal(nullGpsRes.status, 201);
    const nullGpsBody = await nullGpsRes.json();
    assert.equal(nullGpsBody.data.location, null);
    assert.equal(nullGpsBody.data.vehicleId, truck2.id);

    // 5.4 Dispatcher queries active emergency alerts feed
    const activeAlertsRes = await fetch(`${baseUrl}/api/operations/alerts/active`, {
      headers: { Cookie: `mg_sid=${supervisorCookie}` },
    });
    assert.equal(activeAlertsRes.status, 200);
    const activeAlertsBody = await activeAlertsRes.json();
    assert.ok(activeAlertsBody.data.alerts.length >= 2);

    // 5.5 Dispatcher polls for delta updates (?since=...)
    const pastTimestamp = new Date(Date.now() - 3600000).toISOString();
    const pollRes = await fetch(`${baseUrl}/api/operations/alerts/poll?since=${pastTimestamp}`, {
      headers: { Cookie: `mg_sid=${supervisorCookie}` },
    });
    assert.equal(pollRes.status, 200);
    const pollBody = await pollRes.json();
    assert.ok(pollBody.data.alerts.length >= 2);

    // 5.6 Supervisor acknowledges the alert
    const ackRes = await fetch(`${baseUrl}/api/operations/alerts/${createdAlertId}/acknowledge`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${supervisorCookie}` },
    });
    assert.equal(ackRes.status, 200);
    const ackBody = await ackRes.json();
    assert.equal(ackBody.data.status, 'ACKNOWLEDGED');
    assert.equal(ackBody.data.acknowledgedBy, supervisorUser.id);

    // 5.7 Driver cannot resolve the alert (403 Forbidden)
    const driverResolveRes = await fetch(`${baseUrl}/api/operations/alerts/${createdAlertId}/resolve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${driver1Cookie}`,
      },
      body: JSON.stringify({ resolutionNotes: 'Trying to resolve own alert' }),
    });
    assert.equal(driverResolveRes.status, 403);

    // 5.8 Supervisor resolves the alert
    const resolveRes = await fetch(`${baseUrl}/api/operations/alerts/${createdAlertId}/resolve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${supervisorCookie}`,
      },
      body: JSON.stringify({
        resolutionNotes: 'Tow truck dispatched and scene cleared by traffic police.',
        status: 'RESOLVED',
      }),
    });
    assert.equal(resolveRes.status, 200);
    const resolveBody = await resolveRes.json();
    assert.equal(resolveBody.data.status, 'RESOLVED');
    assert.equal(resolveBody.data.resolvedBy, supervisorUser.id);
  });
});
