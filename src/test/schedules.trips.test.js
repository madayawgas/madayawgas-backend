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
  let driverUser2;

  let activeTruck;
  let activeTruck2;
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

    await query(`DELETE FROM duty_attendance WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sched_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sched_%')`);
    await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sched_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_sched_%'`);
    await query(`DELETE FROM plant_inventory WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'TEST-SCHED-%')`);
    await query(`DELETE FROM products WHERE name LIKE 'TEST-SCHED-%'`);

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

    const drv2Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_sched_driver2', passwordHash, 'Ramon', 'DriverTwo', '+639174000006', driverRoleId]
    );
    driverUser2 = drv2Res.rows[0];

    // Seed active duty attendance for test drivers
    await query(`
      INSERT INTO duty_attendance (user_id, status)
      VALUES ($1, 'ACTIVE'), ($2, 'ACTIVE')
    `, [driverUser.id, driverUser2.id]);

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

    const truck3Res = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status, driver_id)
      VALUES ('TEST-SCHED-TRK3', 'Mitsubishi Canter', 2023, 'DELIVERY_TRUCK', 15000, 15000, 'ACTIVE', $1)
      RETURNING *
    `, [driverUser2.id]);
    activeTruck2 = truck3Res.rows[0];

    // 5. Create service zone
    const zoneRes = await query(`
      INSERT INTO service_zones (code, name, description, is_active)
      VALUES ('TEST-SCHED-Z1', 'Test Scheduled Zone', 'Zone for testing route dispatch', TRUE)
      RETURNING *
    `);
    testZone = zoneRes.rows[0];

    // 6. Fetch products & guarantee test plant stock
    const prodRes = await query(`SELECT id, name FROM products WHERE is_active = TRUE LIMIT 2`);
    butaneProduct = prodRes.rows[0];
    lpgProduct = prodRes.rows[1] || prodRes.rows[0];

    if (butaneProduct) {
      await query(`
        INSERT INTO plant_inventory (product_id, quantity_filled, quantity_empty_good, quantity_defective)
        VALUES ($1, 5000, 1000, 50)
        ON CONFLICT (product_id) DO UPDATE SET quantity_filled = GREATEST(plant_inventory.quantity_filled, 5000)
      `, [butaneProduct.id]);
    }
    if (lpgProduct && lpgProduct.id !== butaneProduct?.id) {
      await query(`
        INSERT INTO plant_inventory (product_id, quantity_filled, quantity_empty_good, quantity_defective)
        VALUES ($1, 5000, 1000, 50)
        ON CONFLICT (product_id) DO UPDATE SET quantity_filled = GREATEST(plant_inventory.quantity_filled, 5000)
      `, [lpgProduct.id]);
    }

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
    `, [maintenanceTruck.id, testZone.id, salesRep2User.id]);

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

  // ------------------------------------------------------------
  // Subtest 9: Scheduling Hardening & Anti-Collision Constraints
  // ------------------------------------------------------------
  await t.test('9. Scheduling Hardening - Sales Double-Booking & Cancelled Rescheduling', async () => {
    // 9.1 Double-booking sales person on same scheduled_date (409 Conflict)
    const sched1 = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-15',
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_double_book_1',
      }),
    });
    assert.equal(sched1.status, 201);
    const sched1Data = (await sched1.json()).data.schedule;

    // Attempting to schedule activeTruck2 with salesRep1User on the SAME date
    const dupSalesSched = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-15',
        truckId: activeTruck2.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_double_book_2',
      }),
    });
    assert.equal(dupSalesSched.status, 409);
    const dupBody = await dupSalesSched.json();
    assert.match(dupBody.message, /already has a schedule for 2026-10-15/i);

    // 9.2 Updating an existing schedule to an already-booked sales rep triggers 409
    const sched2 = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-15',
        truckId: activeTruck2.id,
        salesUserId: salesRep2User.id,
        zoneId: testZone.id,
        notes: 'test_sched_truck2_sched',
      }),
    });
    assert.equal(sched2.status, 201);
    const sched2Data = (await sched2.json()).data.schedule;

    const patchSalesConflict = await fetch(`${baseUrl}/api/schedules/${sched2Data.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        salesUserId: salesRep1User.id,
      }),
    });
    assert.equal(patchSalesConflict.status, 409);

    // 9.3 Rescheduling truck on same date after previous schedule is CANCELLED (201 OK)
    const cancelRes = await fetch(`${baseUrl}/api/schedules/${sched1Data.id}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({ reason: 'Morning cancellation for rescheduling test' }),
    });
    assert.equal(cancelRes.status, 200);

    // Now reschedule activeTruck on 2026-10-15 (should succeed because sched1 is CANCELLED)
    const rescheduleRes = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-15',
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_rescheduled_after_cancellation',
      }),
    });
    assert.equal(rescheduleRes.status, 201);

    // 9.4 Weekly template sales person uniqueness on the same day_of_week
    const tpl1 = await fetch(`${baseUrl}/api/schedules/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        zoneId: testZone.id,
        dayOfWeek: 2,
        defaultSalesUserId: salesRep1User.id,
      }),
    });
    assert.equal(tpl1.status, 201);

    const tplDupSales = await fetch(`${baseUrl}/api/schedules/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck2.id,
        zoneId: testZone.id,
        dayOfWeek: 2,
        defaultSalesUserId: salesRep1User.id,
      }),
    });
    assert.equal(tplDupSales.status, 409);
    const tplDupBody = await tplDupSales.json();
    assert.match(tplDupBody.message, /is already the default sales rep/i);
  });

  // ------------------------------------------------------------
  // Subtest 10: Trip Crew Collisions & Unclosed Overnight Trips
  // ------------------------------------------------------------
  await t.test('10. Trip Crew Collisions, Unclosed Trips & Retroactive Clock-Out', async () => {
    // 10.1 Dispatch trip 1 for activeTruck with driverUser & salesRep1User
    const trip1Res = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        driverId: driverUser.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_crew_trip_1',
      }),
    });
    assert.equal(trip1Res.status, 201);
    const trip1 = (await trip1Res.json()).data.trip;

    // 10.2 Attempting to dispatch activeTruck2 with the SAME driverUser (409 Conflict)
    const dupDriverDispatch = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck2.id,
        driverId: driverUser.id,
        salesUserId: salesRep2User.id,
        zoneId: testZone.id,
        notes: 'test_sched_dup_driver',
      }),
    });
    assert.equal(dupDriverDispatch.status, 409);
    const dupDriverBody = await dupDriverDispatch.json();
    assert.match(dupDriverBody.message, /already has an ongoing trip.*currently in progress/i);

    // 10.3 Attempting to dispatch activeTruck2 with the SAME salesRep1User (409 Conflict)
    const dupSalesDispatch = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck2.id,
        driverId: driverUser2.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_dup_sales',
      }),
    });
    assert.equal(dupSalesDispatch.status, 409);
    const dupSalesBody = await dupSalesDispatch.json();
    assert.match(dupSalesBody.message, /already has an ongoing trip.*currently in progress/i);

    // 10.4 Unclosed Day 1 trip blocking Day 2 dispatch with descriptive 409 error
    await query(`
      UPDATE trips 
      SET departure_time = NOW() - INTERVAL '1 day'
      WHERE id = $1
    `, [trip1.id]);

    const day2BlockedRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        driverId: driverUser2.id,
        salesUserId: salesRep2User.id,
        zoneId: testZone.id,
        notes: 'test_sched_day_2_attempt',
      }),
    });
    assert.equal(day2BlockedRes.status, 409);
    const day2BlockedBody = await day2BlockedRes.json();
    assert.match(day2BlockedBody.message, /unclosed trip/i);
    assert.match(day2BlockedBody.message, /Complete yesterday's check-in/i);

    // 10.5 Graceful retroactive clock-out with returnTime unblocks Day 2 dispatch
    const retroactiveTime = new Date(Date.now() - 3600000).toISOString();
    const completeRes = await fetch(`${baseUrl}/api/trips/${trip1.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        returnOdometerKm: 10450,
        returnTime: retroactiveTime,
        supervisorNotes: 'Retroactive evening clock-out for Day 1',
      }),
    });
    assert.equal(completeRes.status, 200);
    const completedTrip = (await completeRes.json()).data.trip;
    assert.equal(completedTrip.status, 'COMPLETED');
    assert.ok(completedTrip.return_time);

    // Now Day 2 dispatch succeeds
    const day2SuccessRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        driverId: driverUser.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_day_2_unblocked',
      }),
    });
    assert.equal(day2SuccessRes.status, 201);
  });

  // ------------------------------------------------------------
  // Subtest 11: Inventory Stock Integrity, Multi-Load & Reconciliation
  // ------------------------------------------------------------
  await t.test('11. Inventory Integrity - Atomic Plant Stock Adjustments, Inactive Product Rejection & Cancel Reversal', async () => {
    // 11.1 Check initial plant stock
    const initialPlantRes = await query(
      `SELECT quantity_filled, quantity_empty_good, quantity_defective FROM plant_inventory WHERE product_id = $1`,
      [butaneProduct.id]
    );
    const initialFilled = initialPlantRes.rows[0].quantity_filled;
    const initialEmpty = initialPlantRes.rows[0].quantity_empty_good;
    const initialDefective = initialPlantRes.rows[0].quantity_defective;

    // Dispatch trip with 40 units filled butane
    const dispatchRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        driverId: driverUser.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_inv_trip',
        initialLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 40 },
        ],
      }),
    });
    assert.equal(dispatchRes.status, 201);
    const trip = (await dispatchRes.json()).data.trip;

    // Verify plant stock was atomically decremented by 40
    const afterDispatchPlant = await query(
      `SELECT quantity_filled FROM plant_inventory WHERE product_id = $1`,
      [butaneProduct.id]
    );
    assert.equal(afterDispatchPlant.rows[0].quantity_filled, initialFilled - 40);

    // 11.2 Midday reload (DISPATCH_LOAD) decrements plant stock further
    const reloadRes = await fetch(`${baseUrl}/api/trips/${trip.id}/loads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        transferType: 'DISPATCH_LOAD',
        remarks: 'Midday reload',
        items: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 15 },
        ],
      }),
    });
    assert.equal(reloadRes.status, 201);

    const afterReloadPlant = await query(
      `SELECT quantity_filled FROM plant_inventory WHERE product_id = $1`,
      [butaneProduct.id]
    );
    assert.equal(afterReloadPlant.rows[0].quantity_filled, initialFilled - 55);

    // 11.3 Inactive product rejection (400 Bad Request)
    const inactProdRes = await query(`
      INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
      VALUES ('TEST-SCHED-DEACT-PROD', 'Canister', 'CANISTER', 0.250, FALSE)
      RETURNING *
    `);
    const deactivatedProduct = inactProdRes.rows[0];

    const inactLoadRes = await fetch(`${baseUrl}/api/trips/${trip.id}/loads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        transferType: 'DISPATCH_LOAD',
        remarks: 'Attempt to load deactivated item',
        items: [
          { productId: deactivatedProduct.id, condition: 'FILLED', quantityUnits: 5 },
        ],
      }),
    });
    assert.equal(inactLoadRes.status, 400);
    const inactLoadBody = await inactLoadRes.json();
    assert.match(inactLoadBody.message, /is inactive and cannot be transferred/i);

    // 11.4 Premature reconciliation rejection while trip is IN_PROGRESS (400 Bad Request)
    const prematureRecRes = await fetch(`${baseUrl}/api/inventory/trips/${trip.id}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        syncCompleted: true,
        salesData: [{ productId: butaneProduct.id, soldFull: 30 }],
      }),
    });
    assert.equal(prematureRecRes.status, 400);
    const prematureRecBody = await prematureRecRes.json();
    assert.match(prematureRecBody.message, /Cannot reconcile a trip that has not completed plant return check-in/i);

    // 11.5 Plant return check-in with returnLoads replenishes plant buckets
    const returnCheckinRes = await fetch(`${baseUrl}/api/trips/${trip.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        returnOdometerKm: 10600,
        supervisorNotes: 'End of shift check-in',
        returnLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 10 },
          { productId: butaneProduct.id, condition: 'EMPTY_GOOD', quantityUnits: 25 },
          { productId: butaneProduct.id, condition: 'DEFECTIVE', quantityUnits: 2 },
        ],
      }),
    });
    assert.equal(returnCheckinRes.status, 200);

    const afterReturnPlant = await query(
      `SELECT quantity_filled, quantity_empty_good, quantity_defective FROM plant_inventory WHERE product_id = $1`,
      [butaneProduct.id]
    );
    assert.equal(afterReturnPlant.rows[0].quantity_filled, initialFilled - 45);
    assert.equal(afterReturnPlant.rows[0].quantity_empty_good, initialEmpty + 25);
    assert.equal(afterReturnPlant.rows[0].quantity_defective, initialDefective + 2);

    // 11.6 Reconcile trip and verify fullDiscrepancy includes defective cylinders
    // Loaded: 40 + 15 = 55
    // Sold: 20
    // Returned filled: 10
    // Returned defective: 2
    // Discrepancy = 55 - 20 - 10 - 2 = 23
    const recRes = await fetch(`${baseUrl}/api/trips/${trip.id}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        totalSoldFull: 20,
        netCustomerDebtCreated: 0,
        supervisorNotes: 'Variance check with defective cylinders',
      }),
    });
    assert.equal(recRes.status, 200);
    const recBody = await recRes.json();
    assert.equal(recBody.data.reconciliation.fullDiscrepancy, 23);
    assert.equal(recBody.data.reconciliation.status, 'FLAGGED_VARIANCE');

    // 11.7 Trip cancellation net stock reversal
    const tripToCancelRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck2.id,
        driverId: driverUser2.id,
        salesUserId: salesRep2User.id,
        zoneId: testZone.id,
        notes: 'test_sched_to_cancel',
        initialLoads: [
          { productId: butaneProduct.id, condition: 'FILLED', quantityUnits: 30 },
        ],
      }),
    });
    assert.equal(tripToCancelRes.status, 201);
    const tripToCancel = (await tripToCancelRes.json()).data.trip;

    const plantBeforeCancel = await query(
      `SELECT quantity_filled FROM plant_inventory WHERE product_id = $1`,
      [butaneProduct.id]
    );

    // Cancel trip
    const cancelTripRes = await fetch(`${baseUrl}/api/trips/${tripToCancel.id}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({ cancellationReason: 'Emergency trip abort at depot' }),
    });
    assert.equal(cancelTripRes.status, 200);
    const cancelledTrip = (await cancelTripRes.json()).data.trip;
    assert.equal(cancelledTrip.status, 'CANCELLED');

    // Verify plant inventory was restored (+30)
    const plantAfterCancel = await query(
      `SELECT quantity_filled FROM plant_inventory WHERE product_id = $1`,
      [butaneProduct.id]
    );
    assert.equal(plantAfterCancel.rows[0].quantity_filled, plantBeforeCancel.rows[0].quantity_filled + 30);

    // Verify RETURN_UNLOAD load was recorded
    const cancelLoads = await query(
      `SELECT transfer_type, remarks FROM trip_loads WHERE trip_id = $1 AND transfer_type = 'RETURN_UNLOAD'`,
      [tripToCancel.id]
    );
    assert.equal(cancelLoads.rows.length, 1);
    assert.match(cancelLoads.rows[0].remarks, /Automated stock reversal upon trip cancellation/i);
  });

  // ------------------------------------------------------------
  // Subtest 12: Route & Schedule Invariants - Sales Persons Endpoint, UUID Sanitization & Date Formatting
  // ------------------------------------------------------------
  await t.test('12. Route & Schedule Invariants - Sales Persons Endpoint, UUID Sanitization & Date Formatting', async () => {
    // 12.1 GET /api/schedules/sales-persons requires authentication (401)
    const unauthRes = await fetch(`${baseUrl}/api/schedules/sales-persons`);
    assert.equal(unauthRes.status, 401);

    // 12.2 GET /api/schedules/sales-persons accessible to route managers (200 OK)
    const salesPersonsRes = await fetch(`${baseUrl}/api/schedules/sales-persons`, {
      headers: { Cookie: `mg_sid=${logisticsCookie}` },
    });
    assert.equal(salesPersonsRes.status, 200);
    const salesPersonsBody = await salesPersonsRes.json();
    assert.equal(salesPersonsBody.status, 'success');
    assert.ok(Array.isArray(salesPersonsBody.data.salesPersons));
    assert.ok(salesPersonsBody.data.salesPersons.length >= 2);

    const testSales = salesPersonsBody.data.salesPersons.find((s) => s.id === salesRep1User.id);
    assert.ok(testSales, 'Expected salesRep1User in salesPersons list');
    assert.equal(testSales.username, 'test_sched_sales1');
    assert.equal(testSales.roleName, 'Sales Person');
    assert.equal(testSales.fullName, 'Juan SalesOne');

    // 12.2a GET /api/schedules/sales-persons accessible to users.view (Admin: 200 OK)
    const adminSalesPersonsRes = await fetch(`${baseUrl}/api/schedules/sales-persons`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(adminSalesPersonsRes.status, 200);

    // 12.2b Sales Supervisor (sales.view) access to sales-persons & blocked from fleet drivers (403)
    const salesSupRoleId = (await query(`SELECT id FROM roles WHERE name = 'Sales Supervisor'`)).rows[0]?.id;
    if (salesSupRoleId) {
      const hash = await bcrypt.hash('SchedPass123!', 10);
      await query(
        `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
         ON CONFLICT (username) DO NOTHING`,
        ['test_sched_salessup', hash, 'Sarah', 'Supervisor', '+639174000099', salesSupRoleId]
      );
      const supLogin = await fetch(`${baseUrl}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test_sched_salessup', password: 'SchedPass123!' }),
      });
      const supCookie = parseCookieHeader(supLogin);
      assert.ok(supCookie, 'Expected session cookie for test_sched_salessup');

      // Accessible via sales.view (200 OK)
      const supSalesPersonsRes = await fetch(`${baseUrl}/api/schedules/sales-persons`, {
        headers: { Cookie: `mg_sid=${supCookie}` },
      });
      assert.equal(supSalesPersonsRes.status, 200);

      // Sales supervisor without fleet/route permissions is blocked from drivers (403 Forbidden)
      const supDriversRes = await fetch(`${baseUrl}/api/fleet/drivers`, {
        headers: { Cookie: `mg_sid=${supCookie}` },
      });
      assert.equal(supDriversRes.status, 403);
    }

    // 12.2c Unprivileged user with only sales.view_own is blocked from sales-persons and drivers (403 Forbidden)
    const repBlockedSalesPersons = await fetch(`${baseUrl}/api/schedules/sales-persons`, {
      headers: { Cookie: `mg_sid=${salesRep1Cookie}` },
    });
    assert.equal(repBlockedSalesPersons.status, 403);

    const repBlockedDrivers = await fetch(`${baseUrl}/api/fleet/drivers`, {
      headers: { Cookie: `mg_sid=${salesRep1Cookie}` },
    });
    assert.equal(repBlockedDrivers.status, 403);

    // 12.2d Route manager (logisticsCookie) can list drivers via route.view/route.manage (200 OK)
    const routeDriversRes = await fetch(`${baseUrl}/api/fleet/drivers`, {
      headers: { Cookie: `mg_sid=${logisticsCookie}` },
    });
    assert.equal(routeDriversRes.status, 200);
    const routeDriversJson = await routeDriversRes.json();
    assert.equal(routeDriversJson.status, 'success');
    assert.ok(Array.isArray(routeDriversJson.data.drivers));

    const routeAvailDriversRes = await fetch(`${baseUrl}/api/fleet/drivers/available`, {
      headers: { Cookie: `mg_sid=${logisticsCookie}` },
    });
    assert.equal(routeAvailDriversRes.status, 200);
    const routeAvailDriversJson = await routeAvailDriversRes.json();
    assert.equal(routeAvailDriversJson.status, 'success');
    assert.ok(Array.isArray(routeAvailDriversJson.data.drivers));

    // 12.3 Mock UUID rejection on schedule template creation (400 Bad Request)
    const mockUuid = 'q1w2e3r4-t5y6-u7i8-o9p0-a1s2d3f4g5h6';
    const badTplRes = await fetch(`${baseUrl}/api/schedules/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        zoneId: testZone.id,
        dayOfWeek: 2, // Tuesday
        defaultSalesUserId: mockUuid,
      }),
    });
    assert.equal(badTplRes.status, 400);
    const badTplBody = await badTplRes.json();
    assert.equal(badTplBody.status, 'fail');
    assert.match(badTplBody.message, /Sales User ID must be a valid UUID/i);

    // 12.4 Empty string defaultSalesUserId coercion to null (201 Created)
    const emptyStringTplRes = await fetch(`${baseUrl}/api/schedules/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: activeTruck.id,
        zoneId: testZone.id,
        dayOfWeek: 2, // Tuesday
        defaultSalesUserId: '',
      }),
    });
    assert.equal(emptyStringTplRes.status, 201);
    const emptyStringTplBody = await emptyStringTplRes.json();
    assert.equal(emptyStringTplBody.data.template.default_sales_user_id, null);

    // 12.5 Mock UUID rejection on ad-hoc schedule creation (400 Bad Request)
    const badSchedRes = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-14',
        truckId: activeTruck.id,
        salesUserId: mockUuid,
        zoneId: testZone.id,
      }),
    });
    assert.equal(badSchedRes.status, 400);
    const badSchedBody = await badSchedRes.json();
    assert.equal(badSchedBody.status, 'fail');
    assert.match(badSchedBody.message, /Sales User ID must be a valid UUID/i);

    // 12.6 Invalid vehicle UUID on schedule creation (400 Bad Request)
    const badTruckSchedRes = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-14',
        truckId: 'not-a-valid-uuid',
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
      }),
    });
    assert.equal(badTruckSchedRes.status, 400);
    const badTruckSchedBody = await badTruckSchedRes.json();
    assert.equal(badTruckSchedBody.status, 'fail');
    assert.match(badTruckSchedBody.message, /Vehicle ID must be a valid UUID/i);

    // 12.7 Date string format invariance (YYYY-MM-DD preserved without timezone drift)
    const validSchedRes = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: '2026-10-14',
        truckId: activeTruck.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'test_sched_date_invariance',
      }),
    });
    assert.equal(validSchedRes.status, 201);
    const createdSched = (await validSchedRes.json()).data.schedule;
    assert.equal(createdSched.scheduled_date, '2026-10-14');

    // Retrieve via GET /api/schedules/:id
    const getSchedRes = await fetch(`${baseUrl}/api/schedules/${createdSched.id}`, {
      headers: { Cookie: `mg_sid=${logisticsCookie}` },
    });
    assert.equal(getSchedRes.status, 200);
    const fetchedSched = (await getSchedRes.json()).data.schedule;
    assert.equal(fetchedSched.scheduled_date, '2026-10-14');
    assert.notEqual(fetchedSched.scheduled_date, '2026-10-13');

    // 12.8 Batch schedule generator provides skipped alias with clear feedback
    const batchRes = await fetch(`${baseUrl}/api/schedules/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        startDate: '2026-10-13', // Tuesday (dayOfWeek: 2)
        endDate: '2026-10-13',
        overwriteExisting: false,
      }),
    });
    assert.equal(batchRes.status, 201);
    const batchBody = await batchRes.json();
    assert.ok(batchBody.data.skipped !== undefined, 'Expected skipped alias in generator response');
    assert.deepEqual(batchBody.data.skipped, batchBody.data.skippedDetails);
    // Since emptyStringTpl has default_sales_user_id: null, it is skipped with clear reason
    const skippedTpl = batchBody.data.skipped.find((s) => s.plateNumber === activeTruck.plate_number);
    assert.ok(skippedTpl, 'Expected truck with null sales rep to be skipped');
    assert.match(skippedTpl.reason, /Template has no default Sales Person assigned/i);
  });

  // ------------------------------------------------------------
  // Subtest 13: Driver Duty Attendance Dispatch Gatekeeper & Shift Invariants
  // ------------------------------------------------------------
  await t.test('13. Driver Duty Attendance Dispatch Gatekeeper & Multi-Trip Shift Invariants', async () => {
    // 13.1 Create a dedicated driver who is NOT clocked in
    const passwordHash = await bcrypt.hash('SchedPass123!', 10);
    const driverRoleId = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;
    const drv3Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING *`,
      ['test_sched_driver3', passwordHash, 'Emil', 'DriverThree', '+639174000007', driverRoleId]
    );
    const unclockedDriver = drv3Res.rows[0];

    // Create a vehicle assigned to this unclocked driver
    const truck4Res = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status, driver_id)
      VALUES ('TEST-SCHED-TRK4', 'Fuso Canter 4-Wheeler', 2023, 'DELIVERY_TRUCK', 12000, 12000, 'ACTIVE', $1)
      RETURNING *
    `, [unclockedDriver.id]);
    const testTruck4 = truck4Res.rows[0];

    // 13.2 Advance route scheduling succeeds WITHOUT driver clock-in
    const schedDate = '2026-10-28';
    const createSchedRes = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduledDate: schedDate,
        truckId: testTruck4.id,
        salesUserId: salesRep1User.id,
        zoneId: testZone.id,
        notes: 'Advance schedule for unclocked driver test',
      }),
    });
    assert.equal(createSchedRes.status, 201, 'Vehicle scheduling must succeed regardless of driver clock-in');
    const advanceSched = (await createSchedRes.json()).data.schedule;
    assert.equal(advanceSched.status, 'SCHEDULED');

    // 13.3 Scheduled dispatch fails with 400 Bad Request & DRIVER_NOT_CLOCKED_IN when driver is off-duty
    const schedDispatchRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduleId: advanceSched.id,
      }),
    });
    assert.equal(schedDispatchRes.status, 400, 'Scheduled dispatch must be blocked when driver has not clocked in');
    const schedDispatchBody = await schedDispatchRes.json();
    assert.equal(schedDispatchBody.status, 'fail');
    assert.equal(schedDispatchBody.code, 'DRIVER_NOT_CLOCKED_IN');
    assert.match(schedDispatchBody.message, /has not clocked in yet/i);

    // 13.4 Ad-hoc dispatch also fails with 400 Bad Request & DRIVER_NOT_CLOCKED_IN when driver is off-duty
    const adHocDispatchRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: testTruck4.id,
        salesUserId: salesRep2User.id,
        driverId: unclockedDriver.id,
        zoneId: testZone.id,
        notes: 'Ad-hoc emergency dispatch attempt',
      }),
    });
    assert.equal(adHocDispatchRes.status, 400, 'Ad-hoc dispatch must be blocked when driver has not clocked in');
    const adHocDispatchBody = await adHocDispatchRes.json();
    assert.equal(adHocDispatchBody.status, 'fail');
    assert.equal(adHocDispatchBody.code, 'DRIVER_NOT_CLOCKED_IN');
    assert.match(adHocDispatchBody.message, /has not clocked in yet/i);

    // 13.5 Driver clocks in (Supervisor logs attendance on behalf of personnel)
    const clockInRes = await fetch(`${baseUrl}/api/operations/attendance/clock-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        userId: unclockedDriver.id,
        notes: 'Clock-in for scheduled delivery run',
      }),
    });
    assert.equal(clockInRes.status, 201, 'Clock-in must succeed');
    const clockInBody = await clockInRes.json();
    assert.equal(clockInBody.data.status, 'ACTIVE');

    // 13.6 Scheduled dispatch now succeeds once driver is clocked in
    const schedSuccessRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        scheduleId: advanceSched.id,
        notes: 'Dispatched after driver clocked in',
      }),
    });
    assert.equal(schedSuccessRes.status, 201, 'Dispatch must succeed when driver is clocked in');
    const trip1 = (await schedSuccessRes.json()).data.trip;
    assert.equal(trip1.status, 'IN_PROGRESS');
    assert.equal(trip1.driver_id, unclockedDriver.id);

    // 13.7 Complete trip 1 (Yard return check-in)
    const completeRes = await fetch(`${baseUrl}/api/trips/${trip1.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        returnOdometerKm: 12100,
        supervisorNotes: 'Completed morning scheduled delivery',
      }),
    });
    assert.equal(completeRes.status, 200);
    const completedTrip1 = (await completeRes.json()).data.trip;
    assert.equal(completedTrip1.status, 'COMPLETED');

    // Verify driver's duty attendance is STILL ACTIVE (no re-clock-in required)
    const activeDutyRes = await fetch(`${baseUrl}/api/operations/attendance/active?userId=${unclockedDriver.id}`, {
      headers: { Cookie: `mg_sid=${logisticsCookie}` },
    });
    assert.equal(activeDutyRes.status, 200);
    const activeDutyBody = await activeDutyRes.json();
    assert.ok(activeDutyBody.data !== null, 'Driver attendance must remain active after trip completion');
    assert.equal(activeDutyBody.data.status, 'ACTIVE');

    // 13.8 Multi-Trip Shift Invariant: Dispatch a second (ad-hoc) trip on the SAME active shift
    const trip2Res = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: testTruck4.id,
        salesUserId: salesRep2User.id,
        driverId: unclockedDriver.id,
        zoneId: testZone.id,
        notes: 'Afternoon ad-hoc delivery on same active shift',
      }),
    });
    assert.equal(trip2Res.status, 201, 'Second trip must dispatch without requiring driver to clock in again');
    const trip2 = (await trip2Res.json()).data.trip;
    assert.equal(trip2.status, 'IN_PROGRESS');

    // Complete trip 2
    const completeTrip2Res = await fetch(`${baseUrl}/api/trips/${trip2.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        returnOdometerKm: 12150,
        supervisorNotes: 'Completed afternoon ad-hoc delivery',
      }),
    });
    assert.equal(completeTrip2Res.status, 200);

    // 13.9 Driver clocks out at the end of the shift
    const clockOutRes = await fetch(`${baseUrl}/api/operations/attendance/clock-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        userId: unclockedDriver.id,
        notes: 'End of shift clock-out',
      }),
    });
    assert.equal(clockOutRes.status, 200, 'Clock-out must succeed');
    const clockOutBody = await clockOutRes.json();
    assert.equal(clockOutBody.data.status, 'COMPLETED');

    // 13.10 Subsequent dispatch attempt is blocked because driver is now clocked out (off-duty)
    const postClockOutDispatchRes = await fetch(`${baseUrl}/api/trips/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${logisticsCookie}`,
      },
      body: JSON.stringify({
        truckId: testTruck4.id,
        salesUserId: salesRep1User.id,
        driverId: unclockedDriver.id,
        zoneId: testZone.id,
        notes: 'Attempt dispatch after driver clocked out',
      }),
    });
    assert.equal(postClockOutDispatchRes.status, 400, 'Dispatch must be blocked after driver clocks out');
    const postClockOutBody = await postClockOutDispatchRes.json();
    assert.equal(postClockOutBody.status, 'fail');
    assert.equal(postClockOutBody.code, 'DRIVER_NOT_CLOCKED_IN');
  });
});
