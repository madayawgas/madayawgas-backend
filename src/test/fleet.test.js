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

test('Fleet & Maintenance Subsystem Tests', async (t) => {
  let fleetManagerCookie;
  let superAdminCookie;
  let salesPersonCookie;
  let driver1Id;
  let driver2Id;

  beforeEach(async () => {
    // 1. Clean test records with isolation prefix test_fleet_ and TEST-FLT-
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_fleet_%') OR details LIKE '%TEST-FLT-%' OR details LIKE '%TEST-DUP-%'`);
    await query(`DELETE FROM trucks WHERE plate_number LIKE 'TEST-FLT-%' OR plate_number LIKE 'TEST-DUP-%'`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_fleet_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_fleet_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_fleet_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_fleet_%'`);

    // 2. Fetch role IDs
    const superAdminRole = (await query(`SELECT id FROM roles WHERE name = 'Super Admin'`)).rows[0].id;
    const fleetManagerRole = (await query(`SELECT id FROM roles WHERE name = 'Fleet Manager'`)).rows[0].id;
    const salesPersonRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Person'`)).rows[0].id;
    const driverRole = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('FleetPass123!', 10);

    const superAdminRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id`,
      ['test_fleet_superadmin', passwordHash, 'Super', 'Admin', '+639171000001', superAdminRole]
    );

    const fleetManagerRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id`,
      ['test_fleet_manager', passwordHash, 'Fleet', 'Manager', '+639171000002', fleetManagerRole]
    );

    const salesRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id`,
      ['test_fleet_sales', passwordHash, 'Sales', 'Representative', '+639171000003', salesPersonRole]
    );

    const driver1Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id`,
      ['test_fleet_driver1', passwordHash, 'Driver', 'One', '+639171000004', driverRole]
    );
    driver1Id = driver1Res.rows[0].id;

    const driver2Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id`,
      ['test_fleet_driver2', passwordHash, 'Driver', 'Two', '+639171000005', driverRole]
    );
    driver2Id = driver2Res.rows[0].id;

    // 4. Authenticate users to obtain session cookies
    const fmLoginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_fleet_manager', password: 'FleetPass123!' }),
    });
    fleetManagerCookie = parseCookieHeader(fmLoginRes);

    const saLoginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_fleet_superadmin', password: 'FleetPass123!' }),
    });
    superAdminCookie = parseCookieHeader(saLoginRes);

    const salesLoginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_fleet_sales', password: 'FleetPass123!' }),
    });
    salesPersonCookie = parseCookieHeader(salesLoginRes);
  });

  // ------------------------------------------------------------
  // 1. RBAC & Route Authorization
  // ------------------------------------------------------------
  await t.test('1. RBAC Route Protection - 401 Unauthorized vs 403 Forbidden vs 200 OK', async () => {
    // 1) Unauthenticated -> 401
    const unauthRes = await fetch(`${baseUrl}/api/fleet/overview`);
    assert.equal(unauthRes.status, 401);

    // 2) Sales Person (lacks fleet.view) -> 403 Forbidden
    const salesOverview = await fetch(`${baseUrl}/api/fleet/overview`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(salesOverview.status, 403);

    // 3) Sales Person (lacks fleet.manage) -> 403 Forbidden
    const salesCreate = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({ plateNumber: 'TEST-FLT-001', model: 'Test Truck', yearModel: 2022 }),
    });
    assert.equal(salesCreate.status, 403);

    // 4) Fleet Manager (has fleet.view & fleet.manage) -> 200 OK
    const fmOverview = await fetch(`${baseUrl}/api/fleet/overview`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(fmOverview.status, 200);
  });

  // ------------------------------------------------------------
  // 2. Fleet Overview & Fleet Availability
  // ------------------------------------------------------------
  await t.test('2. View Fleet Overview and Fleet Availability with Soft-Bounded Default Driver', async () => {
    // Create one active truck with soft-bounded driver, one active unassigned truck, and one under-maintenance truck
    await query(
      `INSERT INTO trucks (plate_number, model, year_model, current_odometer, last_pm_odometer, status, driver_id)
       VALUES ('TEST-FLT-101', 'Isuzu Elf', 2022, 10000, 8000, 'ACTIVE', $1),
              ('TEST-FLT-102', 'Fuso Canter', 2022, 15000, 12000, 'ACTIVE', NULL),
              ('TEST-FLT-103', 'Hino 300', 2021, 25000, 20000, 'UNDER_MAINTENANCE', NULL)`,
      [driver1Id]
    );

    // Fetch Overview
    const overviewRes = await fetch(`${baseUrl}/api/fleet/overview`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(overviewRes.status, 200);
    const overviewJson = await overviewRes.json();
    assert.equal(overviewJson.status, 'success');
    assert.ok(overviewJson.data.metrics.totalVehicles >= 3);
    assert.ok(overviewJson.data.metrics.availableVehicles >= 2);
    assert.ok(overviewJson.data.metrics.assignedVehicles >= 1);
    assert.ok(overviewJson.data.metrics.underMaintenanceVehicles >= 1);

    // Fetch Availability (Both operational active trucks must be listed)
    const availRes = await fetch(`${baseUrl}/api/fleet/availability`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(availRes.status, 200);
    const availJson = await availRes.json();
    assert.equal(availJson.status, 'success');
    const availablePlates = availJson.data.vehicles.map((v) => v.plateNumber);
    assert.ok(availablePlates.includes('TEST-FLT-101'));
    assert.ok(availablePlates.includes('TEST-FLT-102'));
    assert.ok(!availablePlates.includes('TEST-FLT-103')); // Under maintenance excluded

    // Verify soft-bounded driver is attached to TEST-FLT-101
    const truckWithDriver = availJson.data.vehicles.find((v) => v.plateNumber === 'TEST-FLT-101');
    assert.equal(truckWithDriver.driver.username, 'test_fleet_driver1');
    assert.equal(truckWithDriver.isAvailable, true);
  });

  // ------------------------------------------------------------
  // 3. Register Vehicle (POST /api/fleet/trucks)
  // ------------------------------------------------------------
  await t.test('3. Register Vehicle - Validation, Initial Driver, & Duplicate Handling', async () => {
    // 1) Successful registration without initial driver
    const createRes = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        plateNumber: 'TEST-FLT-201',
        model: 'Fuso Canter',
        yearModel: 2023,
        currentOdometer: 5000,
        lastPmOdometer: 4500,
        status: 'ACTIVE',
      }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    assert.equal(createJson.status, 'success');
    assert.equal(createJson.data.truck.plateNumber, 'TEST-FLT-201');
    assert.equal(createJson.data.truck.status, 'ACTIVE');
    assert.equal(createJson.data.truck.isAvailable, true);
    assert.equal(createJson.data.truck.driver, null);
    assert.ok(createJson.data.truck.createdAt);
    assert.ok(createJson.data.truck.updatedAt);

    // 2) Duplicate plate number -> 409 Conflict
    const dupRes = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        plateNumber: 'TEST-FLT-201',
        model: 'Another Truck',
        yearModel: 2020,
      }),
    });
    assert.equal(dupRes.status, 409);

    // 3) Invalid input (negative odometer) -> 400 Bad Request
    const invalidOdoRes = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        plateNumber: 'TEST-FLT-202',
        model: 'Isuzu Giga',
        yearModel: 2022,
        currentOdometer: -100,
      }),
    });
    assert.equal(invalidOdoRes.status, 400);

    // 4) Successful registration with soft-bounded initial driver
    const createWithDriverRes = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        plateNumber: 'TEST-FLT-203',
        model: 'Hyundai HD78',
        yearModel: 2022,
        driverId: driver1Id,
      }),
    });
    assert.equal(createWithDriverRes.status, 201);
    const withDriverJson = await createWithDriverRes.json();
    assert.equal(withDriverJson.data.truck.status, 'ACTIVE');
    assert.equal(withDriverJson.data.truck.isAvailable, true);
    assert.equal(withDriverJson.data.truck.driver.id, driver1Id);
  });

  // ------------------------------------------------------------
  // 4. View Vehicle Information (List & Detail)
  // ------------------------------------------------------------
  await t.test('4. View Vehicle Information & Filtering', async () => {
    const regRes = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        plateNumber: 'TEST-FLT-301',
        model: 'Mitsubishi Fuso',
        yearModel: 2021,
        driverId: driver1Id,
      }),
    });
    const regJson = await regRes.json();
    const truckId = regJson.data.truck.id;

    // 1) GET /api/fleet/trucks with search
    const listRes = await fetch(`${baseUrl}/api/fleet/trucks?search=TEST-FLT-301`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.data.trucks.length, 1);
    assert.equal(listJson.data.trucks[0].plateNumber, 'TEST-FLT-301');

    // 2) GET /api/fleet/trucks/:id (Detail with driver info)
    const detailRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.data.truck.id, truckId);
    assert.equal(detailJson.data.truck.driver.username, 'test_fleet_driver1');

    // 3) GET /api/fleet/trucks/:id (Non-existent UUID -> 404)
    const notFoundRes = await fetch(`${baseUrl}/api/fleet/trucks/00000000-0000-0000-0000-000000000000`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(notFoundRes.status, 404);
  });

  // ------------------------------------------------------------
  // 5. Update Vehicle Information (PATCH /api/fleet/trucks/:id)
  // ------------------------------------------------------------
  await t.test('5. Update Vehicle Information & Constraint Checks', async () => {
    const regRes = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        plateNumber: 'TEST-FLT-401',
        model: 'Old Model Name',
        yearModel: 2020,
        currentOdometer: 10000,
      }),
    });
    const truckId = (await regRes.json()).data.truck.id;

    // 1) Successful update
    const updateRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        model: 'Updated Model Pro',
        currentOdometer: 12500,
        lastPmOdometer: 12000,
      }),
    });
    assert.equal(updateRes.status, 200);
    const updateJson = await updateRes.json();
    assert.equal(updateJson.data.truck.model, 'Updated Model Pro');
    assert.equal(updateJson.data.truck.currentOdometer, 12500);
    assert.ok(updateJson.data.truck.updatedAt);

    // 2) Update with duplicate plate number -> 409 Conflict
    await query(`INSERT INTO trucks (plate_number, model, year_model) VALUES ('TEST-DUP-999', 'Existing', 2021)`);
    const dupPlateRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ plateNumber: 'TEST-DUP-999' }),
    });
    assert.equal(dupPlateRes.status, 409);
  });

  // ------------------------------------------------------------
  // 6. Set Vehicle Availability Status & View Vehicle Status
  // ------------------------------------------------------------
  await t.test('6. Set Vehicle Status & Soft-Bounded Driver Preservation on Maintenance', async () => {
    // Create active truck assigned to driver1
    const regRes = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        plateNumber: 'TEST-FLT-501',
        model: 'Isuzu Elf',
        yearModel: 2022,
        driverId: driver1Id,
      }),
    });
    const truckId = (await regRes.json()).data.truck.id;

    // 1) View Status before change -> ACTIVE & Available
    const statusBeforeRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/status`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(statusBeforeRes.status, 200);
    const statusBeforeJson = await statusBeforeRes.json();
    assert.equal(statusBeforeJson.data.truck.status, 'ACTIVE');
    assert.equal(statusBeforeJson.data.truck.isAvailable, true);
    assert.equal(statusBeforeJson.data.truck.driver.id, driver1Id);

    // 2) Update status to UNDER_MAINTENANCE (driver remains soft-bounded!)
    const setStatusRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ status: 'UNDER_MAINTENANCE' }),
    });
    assert.equal(setStatusRes.status, 200);
    const setStatusJson = await setStatusRes.json();
    assert.equal(setStatusJson.data.truck.status, 'UNDER_MAINTENANCE');
    assert.equal(setStatusJson.data.truck.isAvailable, false);
    assert.equal(setStatusJson.data.truck.driver.id, driver1Id); // Driver preserved!

    // 3) Update status back to ACTIVE -> isAvailable becomes true, driver still driver1Id
    const setBackRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    assert.equal(setBackRes.status, 200);
    const setBackJson = await setBackRes.json();
    assert.equal(setBackJson.data.truck.status, 'ACTIVE');
    assert.equal(setBackJson.data.truck.isAvailable, true);
    assert.equal(setBackJson.data.truck.driver.id, driver1Id);
  });

  // ------------------------------------------------------------
  // 7. Deactivate Vehicle (PATCH /api/fleet/trucks/:id/deactivate)
  // ------------------------------------------------------------
  await t.test('7. Deactivate Vehicle - Releases Driver & Excludes from Available Fleet', async () => {
    const regRes = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        plateNumber: 'TEST-FLT-601',
        model: 'Deactivate Test Truck',
        yearModel: 2021,
        driverId: driver1Id,
      }),
    });
    const truckId = (await regRes.json()).data.truck.id;

    // 1) Rejects deactivation without password confirmation
    const noPassDeact = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/deactivate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
    });
    assert.equal(noPassDeact.status, 401);
    const noPassJson = await noPassDeact.json();
    assert.equal(noPassJson.code, 'PASSWORD_CONFIRMATION_REQUIRED');

    // 2) Rejects deactivation with incorrect password
    const wrongPassDeact = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/deactivate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ confirmPassword: 'WrongPassword123!' }),
    });
    assert.equal(wrongPassDeact.status, 401);
    const wrongPassJson = await wrongPassDeact.json();
    assert.equal(wrongPassJson.code, 'INVALID_CONFIRMATION_PASSWORD');

    // 3) Successfully deactivates with valid confirmPassword
    const deactRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/deactivate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ confirmPassword: 'FleetPass123!' }),
    });
    assert.equal(deactRes.status, 200);
    const deactJson = await deactRes.json();
    assert.equal(deactJson.data.truck.status, 'INACTIVE');
    assert.equal(deactJson.data.truck.isAvailable, false);
    assert.equal(deactJson.data.truck.driver, null); // Driver released

    // Verify it is excluded from availability endpoint
    const availRes = await fetch(`${baseUrl}/api/fleet/availability`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    const availJson = await availRes.json();
    const availableIds = availJson.data.vehicles.map((v) => v.id);
    assert.ok(!availableIds.includes(truckId));
  });

  // ------------------------------------------------------------
  // 8. Driver Management & Availability Endpoints (GET /api/fleet/drivers & /api/fleet/drivers/available)
  // ------------------------------------------------------------
  await t.test('8. Driver Directory & Available Drivers Endpoints - Strictly Driver Role Only', async () => {
    // Initially driver1 and driver2 are unassigned
    const allDriversRes = await fetch(`${baseUrl}/api/fleet/drivers`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(allDriversRes.status, 200);
    const allDriversJson = await allDriversRes.json();
    assert.equal(allDriversJson.status, 'success');
    assert.ok(Array.isArray(allDriversJson.data.drivers));
    
    // Every returned user MUST have role 'Driver'
    for (const d of allDriversJson.data.drivers) {
      assert.equal(d.role, 'Driver');
    }

    const d1 = allDriversJson.data.drivers.find((d) => d.id === driver1Id);
    assert.ok(d1);
    assert.equal(d1.isAssigned, false);
    assert.equal(d1.status, 'AVAILABLE');
    assert.equal(d1.assignedTruck, null);

    // Fetch available drivers directly
    const availRes = await fetch(`${baseUrl}/api/fleet/drivers/available`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(availRes.status, 200);
    const availJson = await availRes.json();
    const availIds = availJson.data.drivers.map((d) => d.id);
    assert.ok(availIds.includes(driver1Id));
    assert.ok(availIds.includes(driver2Id));

    // Ensure non-driver roles (Super Admin, Fleet Manager, Sales Person) are NOT returned
    for (const d of availJson.data.drivers) {
      assert.equal(d.role, 'Driver');
    }
  });

  // ------------------------------------------------------------
  // 9. Assign & Unassign Driver - Strict Unassign-First Invariant & Status Reflection
  // ------------------------------------------------------------
  await t.test('9. Assign & Unassign Driver - Strict Unassign-First Invariant & Status Reflection', async () => {
    // 1) Create two test vehicles
    const truck1Res = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ plateNumber: 'TEST-FLT-701', model: 'Truck 1', yearModel: 2022 }),
    });
    const truck1Id = (await truck1Res.json()).data.truck.id;

    const truck2Res = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ plateNumber: 'TEST-FLT-702', model: 'Truck 2', yearModel: 2022 }),
    });
    const truck2Id = (await truck2Res.json()).data.truck.id;

    // Reject assigning non-driver role user (e.g. Sales Person) -> 400 Bad Request
    const salesUserId = (await query(`SELECT id FROM users WHERE username = 'test_fleet_sales'`)).rows[0].id;
    const nonDriverAssignRes = await fetch(`${baseUrl}/api/fleet/trucks/${truck1Id}/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ driverId: salesUserId }),
    });
    assert.equal(nonDriverAssignRes.status, 400);
    const nonDriverJson = await nonDriverAssignRes.json();
    assert.ok(nonDriverJson.message.includes('Driver'));

    // 2) Assign driver1 to Truck 1 -> 200 OK
    const assign1Res = await fetch(`${baseUrl}/api/fleet/trucks/${truck1Id}/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ driverId: driver1Id }),
    });
    assert.equal(assign1Res.status, 200);
    const assign1Json = await assign1Res.json();
    assert.equal(assign1Json.data.truck.status, 'ACTIVE');
    assert.equal(assign1Json.data.truck.driver.id, driver1Id);

    // Verify driver1 is now ASSIGNED in driver directory and excluded from available drivers
    const checkAvailRes = await fetch(`${baseUrl}/api/fleet/drivers/available`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    const checkAvailJson = await checkAvailRes.json();
    const availableIdsAfterAssign = checkAvailJson.data.drivers.map((d) => d.id);
    assert.ok(!availableIdsAfterAssign.includes(driver1Id));
    assert.ok(availableIdsAfterAssign.includes(driver2Id));

    // 3) Attempt assigning driver1 to Truck 2 (driver1 already assigned to Truck 1) -> 409 Conflict
    const conflictAssign = await fetch(`${baseUrl}/api/fleet/trucks/${truck2Id}/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ driverId: driver1Id }),
    });
    assert.equal(conflictAssign.status, 409);
    const conflictJson = await conflictAssign.json();
    assert.ok(conflictJson.message.includes('already assigned'));

    // 4) Attempt assigning driver2 to Truck 1 (Truck 1 already has driver1 without unassigning first) -> 409 Conflict
    const conflictTruckAssign = await fetch(`${baseUrl}/api/fleet/trucks/${truck1Id}/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ driverId: driver2Id }),
    });
    assert.equal(conflictTruckAssign.status, 409);
    const conflictTruckJson = await conflictTruckAssign.json();
    assert.ok(conflictTruckJson.message.includes('already assigned'));

    // 5) Attempt assigning non-existent driver -> 404 Not Found
    const notFoundDriver = await fetch(`${baseUrl}/api/fleet/trucks/${truck2Id}/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ driverId: '00000000-0000-0000-0000-000000000000' }),
    });
    assert.equal(notFoundDriver.status, 404);

    // 6) Dedicated Unassign Endpoint: PATCH /api/fleet/trucks/:id/unassign -> 200 OK
    const unassignRes = await fetch(`${baseUrl}/api/fleet/trucks/${truck1Id}/unassign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
    });
    assert.equal(unassignRes.status, 200);
    const unassignJson = await unassignRes.json();
    assert.equal(unassignJson.data.truck.status, 'ACTIVE');
    assert.equal(unassignJson.data.truck.driver, null);

    // 7) Verify driver1 is now back to AVAILABLE status in /api/fleet/drivers/available
    const availAfterUnassignRes = await fetch(`${baseUrl}/api/fleet/drivers/available`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    const availAfterUnassignJson = await availAfterUnassignRes.json();
    const availableIdsAfterUnassign = availAfterUnassignJson.data.drivers.map((d) => d.id);
    assert.ok(availableIdsAfterUnassign.includes(driver1Id));

    // 8) Now driver1 can be cleanly assigned to Truck 2
    const assign2Res = await fetch(`${baseUrl}/api/fleet/trucks/${truck2Id}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ driverId: driver1Id }),
    });
    assert.equal(assign2Res.status, 200);
    const assign2Json = await assign2Res.json();
    assert.equal(assign2Json.data.truck.driver.id, driver1Id);
  });

  // ------------------------------------------------------------
  // 10. Fleet Register Page Options (GET /api/fleet/register-options)
  // ------------------------------------------------------------
  await t.test('10. Fleet Register Options - Available Unassigned Drivers', async () => {
    // Assign driver1 to a vehicle
    await query(
      `INSERT INTO trucks (plate_number, model, year_model, driver_id, status)
       VALUES ('TEST-FLT-801', 'Assigned Truck', 2022, $1, 'ACTIVE')`,
      [driver1Id]
    );

    const optionsRes = await fetch(`${baseUrl}/api/fleet/register-options`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(optionsRes.status, 200);
    const optionsJson = await optionsRes.json();
    assert.equal(optionsJson.status, 'success');

    const availableDriverIds = optionsJson.data.availableDrivers.map((d) => d.id);
    assert.ok(!availableDriverIds.includes(driver1Id)); // driver1 is assigned, should not be available
    assert.ok(availableDriverIds.includes(driver2Id)); // driver2 is unassigned, should be available
    assert.ok(optionsJson.data.statusOptions.includes('ACTIVE'));
  });

  // ------------------------------------------------------------
  // 11. Record Vehicle Mileage (POST & PATCH /api/fleet/trucks/:id/mileage)
  // ------------------------------------------------------------
  await t.test('11. Record Vehicle Mileage - Usage & Maintenance Calculation', async () => {
    // 1) Create truck with initial 10,000 km odometer and 8,000 km PM odometer
    const regRes = await fetch(`${baseUrl}/api/fleet/trucks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        plateNumber: 'TEST-FLT-901',
        model: 'Mileage Tracking Truck',
        yearModel: 2022,
        currentOdometer: 10000,
        lastPmOdometer: 8000,
      }),
    });
    const truckId = (await regRes.json()).data.truck.id;

    // 2) Record new valid mileage (12,500 km) -> 200 OK
    const recordRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/mileage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ odometer: 12500 }),
    });
    assert.equal(recordRes.status, 200);
    const recordJson = await recordRes.json();
    assert.equal(recordJson.status, 'success');
    assert.equal(recordJson.data.truck.currentOdometer, 12500);
    assert.ok(recordJson.data.truck.updatedAt);
    assert.equal(recordJson.data.mileageSummary.previousOdometer, 10000);
    assert.equal(recordJson.data.mileageSummary.distanceRecorded, 2500);
    assert.equal(recordJson.data.mileageSummary.distanceSinceLastPm, 4500);

    // 3) Attempt recording mileage lower than current odometer (11,000 < 12,500) -> 400 Bad Request
    const lowerRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/mileage`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ odometer: 11000 }),
    });
    assert.equal(lowerRes.status, 400);

    // 4) Attempt negative odometer -> 400 Bad Request
    const negRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/mileage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ odometer: -500 }),
    });
    assert.equal(negRes.status, 400);

    // 5) Non-existent truck -> 404 Not Found
    const notFoundRes = await fetch(`${baseUrl}/api/fleet/trucks/00000000-0000-0000-0000-000000000000/mileage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({ odometer: 15000 }),
    });
    assert.equal(notFoundRes.status, 404);

    // 6) Sales Person (unauthorized) -> 403 Forbidden
    const salesRes = await fetch(`${baseUrl}/api/fleet/trucks/${truckId}/mileage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({ odometer: 15000 }),
    });
    assert.equal(salesRes.status, 403);
  });
});
