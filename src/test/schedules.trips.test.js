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

test('Schedule & Trip Subsystem Integration Tests', async (t) => {
  let adminCookie;
  let logisticsCookie;
  let salesRep1Cookie;
  let salesRep2Cookie;

  let adminUser;
  let logisticsUser;
  let salesRep1User;
  let salesRep2User;
  let driverUser;

  let activeTruck;
  let maintenanceTruck;
  let testZone;
  let butaneProduct;
  let lpgProduct;

  beforeEach(async () => {
    // 1. Clean test records with isolation prefix
    await query(`
      DELETE FROM trip_load_items 
      WHERE load_id IN (
        SELECT id FROM trip_loads 
        WHERE trip_id IN (
          SELECT id FROM trips 
          WHERE trip_number LIKE 'TEST-SCHED-%' 
             OR notes LIKE '%test_sched_%' 
             OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-SCHED-%')
        )
      )
    `);

    await query(`
      DELETE FROM trip_loads 
      WHERE trip_id IN (
        SELECT id FROM trips 
        WHERE trip_number LIKE 'TEST-SCHED-%' 
           OR notes LIKE '%test_sched_%' 
           OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-SCHED-%')
      )
    `);

    await query(`
      DELETE FROM trip_stock_reconciliations 
      WHERE trip_id IN (
        SELECT id FROM trips 
        WHERE trip_number LIKE 'TEST-SCHED-%' 
           OR notes LIKE '%test_sched_%' 
           OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-SCHED-%')
      )
    `);

    await query(`
      DELETE FROM trips 
      WHERE trip_number LIKE 'TEST-SCHED-%' 
         OR notes LIKE '%test_sched_%' 
         OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-SCHED-%')
    `);

    await query(`
      DELETE FROM truck_schedules 
      WHERE notes LIKE '%test_sched_%' 
         OR truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-SCHED-%')
    `);

    await query(`
      DELETE FROM schedule_templates 
      WHERE truck_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-SCHED-%')
    `);

    await query(`DELETE FROM service_zones WHERE code LIKE 'TEST-SCHED-%'`);

    await query(`
      DELETE FROM vehicle_odometer_logs 
      WHERE notes LIKE '%test_sched_%' 
         OR vehicle_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-SCHED-%')
    `);

    await query(`DELETE FROM vehicles WHERE plate_number LIKE 'TEST-SCHED-%'`);

    await query(`
      DELETE FROM history_logs 
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sched_%') 
         OR details LIKE '%TEST-SCHED-%'
    `);

    await query(`
      DELETE FROM audit_logs 
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sched_%') 
         OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_sched_%')
    `);

    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sched_%')`);
    await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sched_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_sched_%'`);

    // 2. Fetch role IDs
    const adminRoleId = (await query(`SELECT id FROM roles WHERE name = 'Admin'`)).rows[0].id;
    const logisticsRoleId = (await query(`SELECT id FROM roles WHERE name IN ('Logistics Supervisor', 'Fleet Manager') LIMIT 1`)).rows[0].id;
    const salesPersonRoleId = (await query(`SELECT id FROM roles WHERE name = 'Sales Person'`)).rows[0].id;
    const driverRoleId = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('SchedPass123!', 10);

    const adminRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_sched_admin', passwordHash, 'Admin', 'Officer', '+639174000001', adminRoleId]
    );
    adminUser = adminRes.rows[0];

    const logRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_sched_logistics', passwordHash, 'Carlos', 'Logistics', '+639174000002', logisticsRoleId]
    );
    logisticsUser = logRes.rows[0];

    const sp1Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_sched_sales1', passwordHash, 'Juan', 'SalesOne', '+639174000003', salesPersonRoleId]
    );
    salesRep1User = sp1Res.rows[0];

    const sp2Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_sched_sales2', passwordHash, 'Maria', 'SalesTwo', '+639174000004', salesPersonRoleId]
    );
    salesRep2User = sp2Res.rows[0];

    const drvRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_sched_driver', passwordHash, 'Pedro', 'Driver', '+639174000005', driverRoleId]
    );
    driverUser = drvRes.rows[0];

    // 4. Create vehicles
    const truck1Res = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status, driver_id)
      VALUES ('TEST-SCHED-TRK1', 'Isuzu Elf 4-Wheeler', 2022, 'DELIVERY_TRUCK', 10000, 10000, 'ACTIVE', $1)
      RETURNING *
    `, [driverUser.id]);
    activeTruck = truck1Res.rows[0];

    const truck2Res = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status, driver_id)
      VALUES ('TEST-SCHED-TRK2', 'Hino 300 Series', 2021, 'DELIVERY_TRUCK', 25000, 20000, 'UNDER_MAINTENANCE', NULL)
      RETURNING *
    `);
    maintenanceTruck = truck2Res.rows[0];

    // 5. Create service zone
    const zoneRes = await query(`
      INSERT INTO service_zones (code, name, description, is_active)
      VALUES ('TEST-SCHED-Z1', 'Test Scheduled Zone', 'Zone for testing route dispatch', TRUE)
      RETURNING *
    `);
    testZone = zoneRes.rows[0];

    // 6. Fetch products
    const prodRes = await query(`SELECT id, name FROM products WHERE is_active = TRUE LIMIT 2`);
    butaneProduct = prodRes.rows[0];
    lpgProduct = prodRes.rows[1] || prodRes.rows[0];

    // 7. Obtain session cookies
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sched_admin', password: 'SchedPass123!' }),
    });
    adminCookie = parseCookieHeader(adminLogin);

    const logLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sched_logistics', password: 'SchedPass123!' }),
    });
    logisticsCookie = parseCookieHeader(logLogin);

    const sp1Login = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sched_sales1', password: 'SchedPass123!' }),
    });
    salesRep1Cookie = parseCookieHeader(sp1Login);

    const sp2Login = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sched_sales2', password: 'SchedPass123!' }),
    });
    salesRep2Cookie = parseCookieHeader(sp2Login);
  });

  // ------------------------------------------------------------
  // Subtest 1: RBAC & Permission Route Protections
  // ------------------------------------------------------------
  await t.test('1. RBAC Route Protection - 401 Unauthorized vs 403 Forbidden vs 200/201 OK', async () => {
    // 1.1 Unauthenticated requests are rejected
    const unauthSchedules = await fetch(`${baseUrl}/api/schedules`);
    assert.equal(unauthSchedules.status, 401);

    const unauthTrips = await fetch(`${baseUrl}/api/trips`);
    assert.equal(unauthTrips.status, 401);

    // 1.2 Sales Person lacks route.manage -> Forbidden to create schedule
    const spCreateSchedule = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesRep1Cookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-01',
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
      }),
    });
    assert.equal(spCreateSchedule.status, 403);

    // 1.3 Sales Person lacks route.manage -> Forbidden to dispatch trips
    const spDispatch = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesRep1Cookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
      }),
    });
    assert.equal(spDispatch.status, 403);

    // 1.4 Logistics Supervisor has route.manage -> Can create schedule
    const logCreateSchedule = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-01',
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_creation',
      }),
    });
    assert.equal(logCreateSchedule.status, 201);
    const createdData = await logCreateSchedule.json();
    assert.equal(createdData.status, 'success');
    assert.equal(createdData.data.schedule.truck_id, activeTruck.id);
  });

  // ------------------------------------------------------------
  // Subtest 2: Service Zones & Schedule Templates CRUD
  // ------------------------------------------------------------
  await t.test('2. Service Zones & Weekly Route Templates CRUD & Constraints', async () => {
    // 2.1 Create zone
    const zoneRes = await fetch(`${baseUrl}/api/schedules/zones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        code: 'TEST-SCHED-Z2',
        name: 'Secondary Test Zone',
        description: 'Zone description',
      }),
    });
    assert.equal(zoneRes.status, 201);
    const zoneBody = await zoneRes.json();
    assert.equal(zoneBody.data.zone.code, 'TEST-SCHED-Z2');

    // 2.2 Reject duplicate zone code
    const dupZone = await fetch(`${baseUrl}/api/schedules/zones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        code: 'TEST-SCHED-Z2',
        name: 'Another Name',
      }),
    });
    assert.equal(dupZone.status, 409);

    // 2.3 Create weekly route template for activeTruck on Monday (Day 1)
    const tplRes = await fetch(`${baseUrl}/api/schedules/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        zoneId: testZone.id,
        dayOfWeek: 1, // Monday
        defaultSalesUserId: salesRep1User.id,
      }),
    });
    assert.equal(tplRes.status, 201);
    const tplBody = await tplRes.json();
    assert.equal(tplBody.data.template.truck_plate_number, 'TEST-SCHED-TRK1');
    assert.equal(tplBody.data.template.day_of_week, 1);

    // 2.4 Duplicate template on same truck and day of week is rejected (409 Conflict)
    const dupTpl = await fetch(`${baseUrl}/api/schedules/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        zoneId: testZone.id,
        dayOfWeek: 1,
        defaultSalesUserId: salesRep1User.id,
      }),
    });
    assert.equal(dupTpl.status, 409);

    // 2.5 List templates
    const listTpl = await fetch(`${baseUrl}/api/schedules/templates?truckId=${activeTruck.id}`, {
      headers: { Cookie: `mg_sid=${logisticsCookie}` },
    });
    assert.equal(listTpl.status, 200);
    const listTplBody = await listTpl.json();
    assert.equal(listTplBody.data.templates.length, 1);
  });

  // ------------------------------------------------------------
  // Subtest 3: Operational Daily Schedules & Generator Engine
  // ------------------------------------------------------------
  await t.test('3. Daily Schedule Generation, Double-Booking Guard & Skip Grounded Trucks', async () => {
    // 3.1 Setup template for activeTruck on Monday (Day 1)
    await query(`
      INSERT INTO schedule_templates (truck_id, zone_id, day_of_week, default_sales_user_id, is_active)
      VALUES ($1, $2, 1, $3, TRUE)
    `, [activeTruck.id, testZone.id, salesRep1User.id]);

    // Setup template for maintenanceTruck on Monday (Day 1)
    await query(`
      INSERT INTO schedule_templates (truck_id, zone_id, day_of_week, default_sales_user_id, is_active)
      VALUES ($1, $2, 1, $3, TRUE)
    `, [maintenanceTruck.id, testZone.id, salesRep1User.id]);

    // 3.2 Generate schedules for a Monday: 2026-10-05 is a Monday
    const genRes = await fetch(`${baseUrl}/api/schedules/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        startDate: '2026-10-05',
        endDate: '2026-10-05',
      }),
    });
    assert.equal(genRes.status, 201);
    const genBody = await genRes.json();
    assert.ok(genBody.data.generatedCount >= 1);
    const generatedActiveTruck = genBody.data.generatedSchedules.find((s) => s.truck_id === activeTruck.id);
    assert.ok(generatedActiveTruck, 'activeTruck should be generated');

    const skippedMaintenanceTruck = genBody.data.skippedDetails.find((s) => s.truckId === maintenanceTruck.id);
    assert.ok(skippedMaintenanceTruck, 'maintenanceTruck should be skipped');
    assert.match(skippedMaintenanceTruck.reason, /under maintenance/i);

    // 3.3 Double-booking prevention on same calendar date
    const dupDateRes = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-05',
        truckId: activeTruck.id,
        salesUserId: salesRep2User.id,
        zoneId: testZone.id,
      }),
    });
    assert.equal(dupDateRes.status, 409);

    // 3.4 Cancel schedule
    const schedId = generatedActiveTruck.id;
    const cancelRes = await fetch(`${baseUrl}/api/schedules/${schedId}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({ reason: 'Weather advisory cancellation' }),
    });
    assert.equal(cancelRes.status, 200);
    const cancelBody = await cancelRes.json();
    assert.equal(cancelBody.data.schedule.status, 'CANCELLED');
  });

  // ------------------------------------------------------------
  // Subtest 4: Trip Dispatch (Scheduled & Ad-Hoc) & Crew Attribution
  // ------------------------------------------------------------
  await t.test('4. Trip Dispatch - Scheduled & Ad-Hoc Lifecycles & Frozen Crew Attribution', async () => {
    // 4.1 Create an operational schedule for tomorrow
    const schedRes = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-06',
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_operational_run',
      }),
    });
    assert.equal(schedRes.status, 201);
    const schedule = (await schedRes.json()).data.schedule;

    // 4.2 Dispatch scheduled trip with initial loading manifest
    const dispatchRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduleId: schedule.id,
        notes: 'test_sched_morning_dispatch',
        initialLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 100 },
          { productId: lpgProduct.id, condition: 'FILLED', quantityUnits: 20 },
        ],
      }),
    });
    assert.equal(dispatchRes.status, 201);
    const dispatchBody = await dispatchRes.json();
    const trip = dispatchBody.data.trip;

    assert.equal(trip.status, 'IN_PROGRESS');
    assert.match(trip.trip_number, /^TRIP-\d{8}-[A-F0-9]+$/);
    assert.equal(trip.truck_id, activeTruck.id);
    assert.equal(trip.driver_id, driverUser.id); // Soft-bound driver snapshotted
    assert.equal(trip.sales_user_id, salesRep1User.id);
    assert.equal(trip.loads.length, 1);
    assert.equal(trip.loads[0].transfer_type, 'DISPATCH_LOAD');
    assert.equal(trip.loads[0].items.length, 2);

    // Verify schedule status transitioned to DISPATCHED
    const schedCheck = await fetch(`${baseUrl}/api/schedules/${schedule.id}`, {
      headers: { Cookie: `mg_sid=${logisticsCookie}` },
    });
    const schedCheckBody = await schedCheck.json();
    assert.equal(schedCheckBody.data.schedule.status, 'DISPATCHED');

    // 4.3 Attempting to dispatch another trip for the same truck while IN_PROGRESS is blocked (409)
    const busyDispatch = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        salesUserId: salesRep2User.id,
        driverId: driverUser.id,
        zoneId: testZone.id,
      }),
    });
    assert.equal(busyDispatch.status, 409);
  });

  // ------------------------------------------------------------
  // Subtest 5: Multi-Load Transfers (Midday Reload)
  // ------------------------------------------------------------
  await t.test('5. Multi-Load Inventory Transfers - Midday Reload & Canonical Quantities', async () => {
    // 5.1 Dispatch ad-hoc trip
    const dispatchRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        driverId: driverUser.id,
        zoneId: testZone.id,
        notes: 'test_sched_multiload',
        initialLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 50 },
        ],
      }),
    });
    assert.equal(dispatchRes.status, 201);
    const trip = (await dispatchRes.json()).data.trip;

    // 5.2 Record midday reload (DISPATCH_LOAD)
    const reloadRes = await fetch(`${baseUrl}/api/trips/${trip.id}/loads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        transferType: 'DISPATCH_LOAD',
        remarks: 'Midday plant reload slip',
        items: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 30 },
          { productId: lpgProduct.id, condition: 'FILLED', quantityUnits: 10 },
        ],
      }),
    });
    assert.equal(reloadRes.status, 201);
    const reloadBody = await reloadRes.json();
    assert.equal(reloadBody.data.load.transfer_type, 'DISPATCH_LOAD');
    assert.equal(reloadBody.data.load.items.length, 2);

    // 5.3 Fetch all loads for trip
    const loadsRes = await fetch(`${baseUrl}/api/trips/${trip.id}/loads`, {
      headers: { Cookie: `mg_sid=${logisticsCookie}` },
    });
    assert.equal(loadsRes.status, 200);
    const loadsBody = await loadsRes.json();
    assert.equal(loadsBody.data.count, 2); // Initial load + Midday reload
  });

  // ------------------------------------------------------------
  // Subtest 6: Plant Return Check-In & Maintenance Engine
  // ------------------------------------------------------------
  await t.test('6. Plant Return Check-In - Monotonic Odometer Telemetry & PM Calculation', async () => {
    // 6.1 Dispatch trip
    const dispatchRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        driverId: driverUser.id,
        zoneId: testZone.id,
        initialLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 100 },
        ],
      }),
    });
    const trip = (await dispatchRes.json()).data.trip;

    // 6.2 Plant check-in with invalid non-monotonic odometer (< 10000 km) is rejected (400)
    const invalidOdo = await fetch(`${baseUrl}/api/trips/${trip.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        returnOdometerKm: 9500, // Current is 10000
      }),
    });
    assert.equal(invalidOdo.status, 400);
    const invalidBody = await invalidOdo.json();
    assert.match(invalidBody.message, /cannot be less than the current odometer/i);

    // 6.3 Plant check-in with valid return odometer (10250 km, +250 km driven) and return unload
    const completeRes = await fetch(`${baseUrl}/api/trips/${trip.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        returnOdometerKm: 10250,
        supervisorNotes: 'Routine post-trip plant check-in',
        returnLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 20 },
          { productId: butaneProduct.id, condition: 'EMPTY_GOOD', quantityUnits: 75 },
          { productId: butaneProduct.id, condition: 'DEFECTIVE', quantityUnits: 5 },
        ],
      }),
    });
    assert.equal(completeRes.status, 200);
    const completeBody = await completeRes.json();

    // Verify trip status
    assert.equal(completeBody.data.trip.status, 'COMPLETED');
    assert.ok(completeBody.data.trip.return_time);
    assert.ok(completeBody.data.trip.return_odometer_log_id);

    // Verify Fleet Maintenance odometer telemetry integration
    const telemetry = completeBody.data.odometerTelemetry;
    assert.equal(telemetry.currentOdometer, 10250);
    assert.equal(telemetry.distanceDrivenThisTrip, 250);
    assert.equal(telemetry.distanceSinceLastPm, 250);
    assert.equal(telemetry.isPmDue, false);

    // Verify reconciliation record initialized in AWAITING_SYNC status
    const rec = completeBody.data.reconciliation;
    assert.equal(rec.status, 'AWAITING_SYNC');
    assert.equal(rec.total_loaded_full, 100);
    assert.equal(rec.total_returned_full, 20);
    assert.equal(rec.total_returned_empty_good, 75);
    assert.equal(rec.total_returned_defective, 5);

    // Verify vehicle record updated in DB
    const updatedVehicle = await query(`SELECT current_odometer FROM vehicles WHERE id = $1`, [activeTruck.id]);
    assert.equal(updatedVehicle.rows[0].current_odometer, 10250);
  });

  // ------------------------------------------------------------
  // Subtest 7: Stock Reconciliation Math & Discrepancy Settlement
  // ------------------------------------------------------------
  await t.test('7. Stock Reconciliation Math - Exact Settlement vs Flagged Variance', async () => {
    // 7.1 Dispatch and complete trip with known quantities
    const dispatchRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        driverId: driverUser.id,
        zoneId: testZone.id,
        initialLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 100 },
        ],
      }),
    });
    const trip = (await dispatchRes.json()).data.trip;

    // Return with: 20 Full returned, 75 Empty good returned
    await fetch(`${baseUrl}/api/trips/${trip.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        returnOdometerKm: 10500,
        returnLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 20 },
          { productId: butaneProduct.id, condition: 'EMPTY_GOOD', quantityUnits: 75 },
        ],
      }),
    });

    // 7.2 Balanced Sync:
    // Loaded Full = 100
    // Sold Full = 80
    // Returned Full = 20
    // -> Full Discrepancy = 100 - 80 - 20 = 0
    // Returned Empty Good = 75
    // Net Customer Debt = 5
    // -> Empty Discrepancy = 80 - (75 + 5) = 0
    // -> Expect status: SETTLED
    const settleRes = await fetch(`${baseUrl}/api/trips/${trip.id}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        totalSoldFull: 80,
        netCustomerDebtCreated: 5,
        supervisorNotes: 'All counts verified against driver physical manifest',
      }),
    });
    assert.equal(settleRes.status, 200);
    const settleBody = await settleRes.json();
    const rec = settleBody.data.reconciliation;

    assert.equal(rec.status, 'SETTLED');
    assert.equal(rec.fullDiscrepancy, 0);
    assert.equal(rec.emptyDiscrepancy, 0);
    assert.equal(rec.isSettled, true);

    // 7.3 Variance Sync (Discrepancy):
    // If sales were reported as 70 instead of 80:
    // Full Discrepancy = 100 - 70 - 20 = 10 (10 full missing!)
    const varianceRes = await fetch(`${baseUrl}/api/trips/${trip.id}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        totalSoldFull: 70,
        netCustomerDebtCreated: 5,
        supervisorNotes: 'Driver short 10 full cylinders',
      }),
    });
    assert.equal(varianceRes.status, 200);
    const varianceBody = await varianceRes.json();
    const varRec = varianceBody.data.reconciliation;

    assert.equal(varRec.status, 'FLAGGED_VARIANCE');
    assert.equal(varRec.fullDiscrepancy, 10);
    assert.equal(varRec.isSettled, false);
  });

  // ------------------------------------------------------------
  // Subtest 8: Audit Trail & Centralized Event History Logging
  // ------------------------------------------------------------
  await t.test('8. Centralized Event History Logging Across Lifecycle Events', async () => {
    // 8.1 Create schedule -> triggers SCHEDULE_CREATED
    const schedRes = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-10',
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_audit_flow',
      }),
    });
    const sched = (await schedRes.json()).data.schedule;

    // 8.2 Cancel schedule -> triggers SCHEDULE_CANCELLED
    await fetch(`${baseUrl}/api/schedules/${sched.id}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({ reason: 'Audit cancellation test' }),
    });

    // 8.3 Dispatch trip with initial load -> triggers TRIP_DISPATCHED & TRIP_STOCK_LOADED
    const dispatchRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        driverId: driverUser.id,
        zoneId: testZone.id,
        notes: 'test_sched_audit_dispatch',
        initialLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 50 },
        ],
      }),
    });
    const trip = (await dispatchRes.json()).data.trip;

    // 8.4 Complete trip -> triggers TRIP_COMPLETED
    await fetch(`${baseUrl}/api/trips/${trip.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        returnOdometerKm: 10800,
        supervisorNotes: 'Audit completion',
      }),
    });

    // 8.5 Reconcile trip -> triggers TRIP_RECONCILED
    await fetch(`${baseUrl}/api/trips/${trip.id}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        totalSoldFull: 50,
        netCustomerDebtCreated: 0,
        supervisorNotes: 'Audit reconciliation',
      }),
    });

    // Check that history logs captured domain events
    const logsRes = await query(`
      SELECT action, module, action_type, details
      FROM history_logs
      WHERE action IN (
        'SCHEDULE_CREATED',
        'SCHEDULE_CANCELLED',
        'TRIP_DISPATCHED',
        'TRIP_STOCK_LOADED',
        'TRIP_COMPLETED',
        'TRIP_RECONCILED'
      )
      ORDER BY created_at DESC
    `);

    const actions = logsRes.rows.map((r) => r.action);
    assert.ok(actions.includes('SCHEDULE_CREATED'), 'SCHEDULE_CREATED should be logged');
    assert.ok(actions.includes('SCHEDULE_CANCELLED'), 'SCHEDULE_CANCELLED should be logged');
    assert.ok(actions.includes('TRIP_DISPATCHED'), 'TRIP_DISPATCHED should be logged');
    assert.ok(actions.includes('TRIP_STOCK_LOADED'), 'TRIP_STOCK_LOADED should be logged');
    assert.ok(actions.includes('TRIP_COMPLETED'), 'TRIP_COMPLETED should be logged');
    assert.ok(actions.includes('TRIP_RECONCILED'), 'TRIP_RECONCILED should be logged');
  });
});
