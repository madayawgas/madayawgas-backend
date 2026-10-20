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

test('Fuel Analysis Subsystem Integration Tests', async (t) => {
  let adminCookie;
  let driver1Cookie;
  let driver2Cookie;

  let adminUser;
  let driver1User;
  let driver2User;

  let vehicle1;
  let vehicle2;
  let vehicleStationary;

  beforeEach(async () => {
    // 1. Clean test records in reverse dependency order
    await query(`
      DELETE FROM vehicle_fuel_logs
      WHERE recorded_by IN (SELECT id FROM users WHERE username LIKE 'test_fa_%')
         OR driver_id IN (SELECT id FROM users WHERE username LIKE 'test_fa_%')
         OR vehicle_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-FA-%')
    `);

    await query(`
      DELETE FROM vehicle_odometer_logs
      WHERE vehicle_id IN (SELECT id FROM vehicles WHERE plate_number LIKE 'TEST-FA-%')
    `);

    await query(`
      DELETE FROM vehicles
      WHERE plate_number LIKE 'TEST-FA-%'
    `);

    await query(`
      DELETE FROM sessions
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_fa_%')
    `);

    await query(`
      DELETE FROM user_roles
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_fa_%')
    `);

    await query(`
      DELETE FROM users
      WHERE username LIKE 'test_fa_%'
    `);

    // 2. Fetch required roles
    const rolesRes = await query(`
      SELECT id, name FROM roles WHERE name IN ('Admin', 'Driver')
    `);
    const adminRoleId = rolesRes.rows.find(r => r.name === 'Admin')?.id;
    const driverRoleId = rolesRes.rows.find(r => r.name === 'Driver')?.id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    const createAdminRes = await query(`
      INSERT INTO users (username, password_hash, first_name, last_name, role_id, is_active, must_change_password)
      VALUES ('test_fa_admin', $1, 'Admin', 'Officer', $2, true, false)
      RETURNING id, username
    `, [passwordHash, adminRoleId]);
    adminUser = createAdminRes.rows[0];
    await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [adminUser.id, adminRoleId]);

    const createDriver1Res = await query(`
      INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, must_change_password)
      VALUES ('test_fa_driver1', $1, 'Juan', 'DriverOne', '+639171112233', $2, true, false)
      RETURNING id, username, first_name, last_name
    `, [passwordHash, driverRoleId]);
    driver1User = createDriver1Res.rows[0];
    await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [driver1User.id, driverRoleId]);

    const createDriver2Res = await query(`
      INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, must_change_password)
      VALUES ('test_fa_driver2', $1, 'Pedro', 'DriverTwo', '+639174445566', $2, true, false)
      RETURNING id, username, first_name, last_name
    `, [passwordHash, driverRoleId]);
    driver2User = createDriver2Res.rows[0];
    await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [driver2User.id, driverRoleId]);


    // 4. Create test vehicles
    // Vehicle 1 assigned to Driver 1 (Start Odometer: 10,000 km)
    const veh1Res = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status, driver_id)
      VALUES ('TEST-FA-001', 'Isuzu Elf 6-Wheeler', 2022, 'DELIVERY_TRUCK', 10800, 10000, 'ACTIVE', $1)
      RETURNING id, plate_number, model, current_odometer
    `, [driver1User.id]);
    vehicle1 = veh1Res.rows[0];

    // Vehicle 2 assigned to Driver 2 (Start Odometer: 20,000 km)
    const veh2Res = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status, driver_id)
      VALUES ('TEST-FA-002', 'Hino 300 Series', 2021, 'DELIVERY_TRUCK', 20600, 20000, 'ACTIVE', $1)
      RETURNING id, plate_number, model, current_odometer
    `, [driver2User.id]);
    vehicle2 = veh2Res.rows[0];

    // Vehicle 3: Stationary / No Fuel Asset (Odometer: 5,000 km)
    const veh3Res = await query(`
      INSERT INTO vehicles (plate_number, model, year_model, vehicle_type, current_odometer, last_pm_odometer, status)
      VALUES ('TEST-FA-003', 'Mitsubishi L300', 2023, 'SERVICE_PICKUP', 5000, 5000, 'ACTIVE')
      RETURNING id, plate_number, model, current_odometer
    `);
    vehicleStationary = veh3Res.rows[0];

    // 5. Establish baseline odometer logs for vehicles
    const now = new Date();
    const day1 = new Date(now.getFullYear(), now.getMonth(), 1, 8, 0, 0);
    const day5 = new Date(now.getFullYear(), now.getMonth(), 5, 10, 0, 0);
    const day10 = new Date(now.getFullYear(), now.getMonth(), 10, 14, 0, 0);

    // Initial baseline odometer logs
    await query(`
      INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, logged_at)
      VALUES ($1, 10000, $2, 'POST_DISPATCH_RETURN', $3),
             ($4, 20000, $2, 'POST_DISPATCH_RETURN', $3)
    `, [vehicle1.id, adminUser.id, day1, vehicle2.id]);

    // 6. Fuel entries for Vehicle 1:
    // Entry 1 (Day 5): 50 Liters, 3,000 PHP, Odo: 10,400 km
    await query(`
      INSERT INTO vehicle_fuel_logs (
        vehicle_id, driver_id, recorded_by, liters_pumped, total_cost, price_per_liter,
        fuel_station, fuel_type, odometer_reading, fueled_at
      ) VALUES ($1, $2, $2, 50.00, 3000.00, 60.00, 'Petron Bajada', 'DIESEL', 10400, $3)
    `, [vehicle1.id, driver1User.id, day5]);
    await query(`
      INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, logged_at)
      VALUES ($1, 10400, $2, 'FUEL_ENTRY', $3)
    `, [vehicle1.id, driver1User.id, day5]);

    // Entry 2 (Day 10): 50 Liters, 3,000 PHP, Odo: 10,800 km
    await query(`
      INSERT INTO vehicle_fuel_logs (
        vehicle_id, driver_id, recorded_by, liters_pumped, total_cost, price_per_liter,
        fuel_station, fuel_type, odometer_reading, fueled_at
      ) VALUES ($1, $2, $2, 50.00, 3000.00, 60.00, 'Shell Matina', 'DIESEL', 10800, $3)
    `, [vehicle1.id, driver1User.id, day10]);
    await query(`
      INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, logged_at)
      VALUES ($1, 10800, $2, 'FUEL_ENTRY', $3)
    `, [vehicle1.id, driver1User.id, day10]);

    // 7. Fuel entries for Vehicle 2:
    // Entry 1 (Day 5): 60 Liters, 3,600 PHP, Odo: 20,300 km
    await query(`
      INSERT INTO vehicle_fuel_logs (
        vehicle_id, driver_id, recorded_by, liters_pumped, total_cost, price_per_liter,
        fuel_station, fuel_type, odometer_reading, fueled_at
      ) VALUES ($1, $2, $2, 60.00, 3600.00, 60.00, 'Caltex Ecoland', 'DIESEL', 20300, $3)
    `, [vehicle2.id, driver2User.id, day5]);
    await query(`
      INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, logged_at)
      VALUES ($1, 20300, $2, 'FUEL_ENTRY', $3)
    `, [vehicle2.id, driver2User.id, day5]);

    // Entry 2 (Day 10): 60 Liters, 3,600 PHP, Odo: 20,600 km
    await query(`
      INSERT INTO vehicle_fuel_logs (
        vehicle_id, driver_id, recorded_by, liters_pumped, total_cost, price_per_liter,
        fuel_station, fuel_type, odometer_reading, fueled_at
      ) VALUES ($1, $2, $2, 60.00, 3600.00, 60.00, 'Caltex Ecoland', 'DIESEL', 20600, $3)
    `, [vehicle2.id, driver2User.id, day10]);
    await query(`
      INSERT INTO vehicle_odometer_logs (vehicle_id, odometer_reading, logged_by, source, logged_at)
      VALUES ($1, 20600, $2, 'FUEL_ENTRY', $3)
    `, [vehicle2.id, driver2User.id, day10]);

    // 8. Log in sessions
    const adminLoginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_fa_admin', password: 'TestPass123!' }),
    });
    adminCookie = parseCookieHeader(adminLoginRes);

    const driver1LoginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_fa_driver1', password: 'TestPass123!' }),
    });
    driver1Cookie = parseCookieHeader(driver1LoginRes);

    const driver2LoginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_fa_driver2', password: 'TestPass123!' }),
    });
    driver2Cookie = parseCookieHeader(driver2LoginRes);
  });

  // ============================================================
  // 1. Fleet-Wide Fuel Analysis Endpoint Tests
  // ============================================================
  await t.test('1. Fleet-Wide Fuel Analysis (Aggregates, Totals, km/L, Cost/km & Vehicle Rankings)', async () => {
    // Query exact time window of test fixtures (Day 2 to Day 12) for complete test isolation
    const res = await fetch(`${baseUrl}/api/operations/fuel/analysis?startDate=2026-10-02&endDate=2026-10-12`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data);

    const { period, fleetTotals, fuelTypesBreakdown, topEfficientVehicles, leastEfficientVehicles, vehicles } = body.data;

    // Period checks
    assert.equal(period.preset, 'custom');
    assert.ok(period.startDate);
    assert.ok(period.endDate);


    // Fleet Totals math:
    // Vehicle 1: 100 L, 6000 PHP, 800 km (10,800 - 10,000)
    // Vehicle 2: 120 L, 7200 PHP, 600 km (20,600 - 20,000)
    // Total Fuel: 220.00 L
    // Total Cost: 13,200.00 PHP
    // Total Distance: 1,400 km
    assert.equal(fleetTotals.totalFuelUsedLiters, 220.00);
    assert.equal(fleetTotals.totalFuelCost, 13200.00);
    assert.equal(fleetTotals.averagePricePerLiter, 60.00);
    assert.equal(fleetTotals.totalDistanceTraveledKm, 1400);

    // Fleet km/L = 1400 / 220 = 6.36 km/L
    assert.equal(fleetTotals.averageKmPerLiter, 6.36);
    // Fleet Cost/km = 13200 / 1400 = 9.43 PHP/km
    assert.equal(fleetTotals.averageCostPerKm, 9.43);
    assert.equal(fleetTotals.totalFuelEntries, 4);
    assert.equal(fleetTotals.activeVehiclesCount, 2);
    assert.ok(fleetTotals.totalFleetVehiclesCount >= 3);


    // Vehicle 1 metrics check
    const v1 = vehicles.find(v => v.vehicleId === vehicle1.id);
    assert.ok(v1);
    assert.equal(v1.fuelUsedLiters, 100.00);
    assert.equal(v1.fuelCost, 6000.00);
    assert.equal(v1.averagePricePerLiter, 60.00);
    assert.equal(v1.startOdometer, 10000);
    assert.equal(v1.endOdometer, 10800);
    assert.equal(v1.distanceTraveledKm, 800);
    assert.equal(v1.kmPerLiter, 8.00); // 800 km / 100 L = 8.00 km/L
    assert.equal(v1.costPerKm, 7.50);  // 6000 PHP / 800 km = 7.50 PHP/km
    assert.equal(v1.efficiencyRating, 'ABOVE_AVERAGE'); // 8.00 vs 6.36 (+25.79%)

    // Vehicle 2 metrics check
    const v2 = vehicles.find(v => v.vehicleId === vehicle2.id);
    assert.ok(v2);
    assert.equal(v2.fuelUsedLiters, 120.00);
    assert.equal(v2.fuelCost, 7200.00);
    assert.equal(v2.distanceTraveledKm, 600);
    assert.equal(v2.kmPerLiter, 5.00); // 600 km / 120 L = 5.00 km/L
    assert.equal(v2.costPerKm, 12.00); // 7200 PHP / 600 km = 12.00 PHP/km
    assert.equal(v2.efficiencyRating, 'BELOW_AVERAGE'); // 5.00 vs 6.36 (-21.38%)

    // Highlight rankings
    assert.equal(topEfficientVehicles[0].vehicleId, vehicle1.id);
    assert.equal(leastEfficientVehicles[0].vehicleId, vehicle2.id);

    // Fuel types breakdown
    assert.ok(fuelTypesBreakdown.length > 0);
    assert.equal(fuelTypesBreakdown[0].fuelType, 'DIESEL');
    assert.equal(fuelTypesBreakdown[0].liters, 220.00);
  });

  // ============================================================
  // 2. Single Vehicle Fuel Analysis Endpoint Tests
  // ============================================================
  await t.test('2. Single Vehicle Fuel Analysis (Details, Station Breakdown, Chronological Fill-up Deltas)', async () => {
    const res = await fetch(`${baseUrl}/api/operations/fuel/analysis/${vehicle1.id}?period=this_month`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data);

    const { vehicle, metrics, fuelStationsBreakdown, fillUpLogs } = body.data;

    // Vehicle profile
    assert.equal(vehicle.id, vehicle1.id);
    assert.equal(vehicle.plateNumber, 'TEST-FA-001');
    assert.equal(vehicle.driver.fullName, 'Juan DriverOne');

    // Metrics
    assert.equal(metrics.fuelUsedLiters, 100.00);
    assert.equal(metrics.totalFuelCost, 6000.00);
    assert.equal(metrics.averagePricePerLiter, 60.00);
    assert.equal(metrics.startOdometer, 10000);
    assert.equal(metrics.endOdometer, 10800);
    assert.equal(metrics.distanceTraveledKm, 800);
    assert.equal(metrics.kmPerLiter, 8.00);
    assert.equal(metrics.costPerKm, 7.50);
    assert.equal(metrics.totalFuelEntries, 2);
    assert.equal(metrics.efficiencyRating, 'ABOVE_AVERAGE');

    // Station breakdown
    assert.equal(fuelStationsBreakdown.length, 2);
    const petron = fuelStationsBreakdown.find(s => s.station === 'Petron Bajada');
    assert.ok(petron);
    assert.equal(petron.liters, 50.00);
    assert.equal(petron.totalCost, 3000.00);

    // Chronological Fill-up Logs (Returned in reverse chronological order: latest first)
    assert.equal(fillUpLogs.length, 2);

    // Latest fill-up (Day 10)
    const latestLog = fillUpLogs[0];
    assert.equal(latestLog.fuelStation, 'Shell Matina');
    assert.equal(latestLog.odometerReading, 10800);
    assert.equal(latestLog.previousOdometerReading, 10400);
    assert.equal(latestLog.distanceSinceLastFuelKm, 400); // 10,800 - 10,400
    assert.equal(latestLog.kmPerLiter, 8.00); // 400 km / 50 L = 8.00 km/L
    assert.equal(latestLog.costPerKm, 7.50); // 3000 PHP / 400 km = 7.50 PHP/km

    // Earlier fill-up (Day 5)
    const earlierLog = fillUpLogs[1];
    assert.equal(earlierLog.fuelStation, 'Petron Bajada');
    assert.equal(earlierLog.odometerReading, 10400);
    assert.equal(earlierLog.previousOdometerReading, 10000);
    assert.equal(earlierLog.distanceSinceLastFuelKm, 400); // 10,400 - 10,000
    assert.equal(earlierLog.kmPerLiter, 8.00);
  });

  // ============================================================
  // 3. Zero / Insufficient Data Handling
  // ============================================================
  await t.test('3. Graceful Zero / Insufficient Telemetry Handling (No crashes on zero fuel or distance)', async () => {
    // Vehicle 3 has no fuel logs and no odometer change
    const res = await fetch(`${baseUrl}/api/operations/fuel/analysis/${vehicleStationary.id}?period=this_month`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'success');

    const { metrics, fillUpLogs } = body.data;
    assert.equal(metrics.fuelUsedLiters, 0);
    assert.equal(metrics.totalFuelCost, 0);
    assert.equal(metrics.averagePricePerLiter, 0);
    assert.equal(metrics.distanceTraveledKm, 0);
    assert.equal(metrics.kmPerLiter, null); // Graceful null without division by zero
    assert.equal(metrics.costPerKm, null);
    assert.equal(metrics.totalFuelEntries, 0);
    assert.equal(fillUpLogs.length, 0);
  });

  // ============================================================
  // 4. Date Range Filtering & Time Window Boundary Tests
  // ============================================================
  await t.test('4. Date Range Filtering (Custom startDate & endDate exclude out-of-range logs)', async () => {
    // Add an old fuel entry from 6 months ago (April 2026)
    const oldDate = new Date('2026-04-15T10:00:00.000Z');
    await query(`
      INSERT INTO vehicle_fuel_logs (
        vehicle_id, driver_id, recorded_by, liters_pumped, total_cost, price_per_liter,
        fuel_station, fuel_type, odometer_reading, fueled_at
      ) VALUES ($1, $2, $2, 80.00, 4800.00, 60.00, 'Old Station', 'DIESEL', 8500, $3)
    `, [vehicle1.id, driver1User.id, oldDate]);

    // Query specifically for April 2026
    const res = await fetch(
      `${baseUrl}/api/operations/fuel/analysis/${vehicle1.id}?startDate=2026-04-01&endDate=2026-04-30`,
      { headers: { Cookie: `mg_sid=${adminCookie}` } }
    );
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.data.metrics.fuelUsedLiters, 80.00);
    assert.equal(body.data.metrics.totalFuelCost, 4800.00);
    assert.equal(body.data.fillUpLogs.length, 1);
    assert.equal(body.data.fillUpLogs[0].fuelStation, 'Old Station');

    // Reject startDate > endDate
    const invalidDateRes = await fetch(
      `${baseUrl}/api/operations/fuel/analysis?startDate=2026-10-31&endDate=2026-10-01`,
      { headers: { Cookie: `mg_sid=${adminCookie}` } }
    );
    assert.equal(invalidDateRes.status, 400);
  });

  // ============================================================
  // 5. Driver RBAC Scoping & Route Guards
  // ============================================================
  await t.test('5. Driver RBAC Scoping (Authorized for own vehicle, 403 Forbidden for other vehicle)', async () => {
    // 5.1 Driver 1 can view own assigned vehicle fuel analysis
    const ownRes = await fetch(`${baseUrl}/api/operations/fuel/analysis/${vehicle1.id}`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(ownRes.status, 200);
    const ownBody = await ownRes.json();
    assert.equal(ownBody.data.vehicle.id, vehicle1.id);

    // 5.2 Driver 1 receives 403 Forbidden when requesting Driver 2's vehicle
    const otherRes = await fetch(`${baseUrl}/api/operations/fuel/analysis/${vehicle2.id}`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(otherRes.status, 403);
    const otherBody = await otherRes.json();
    assert.equal(otherBody.code, 'FORBIDDEN');

    // 5.3 Driver 1 querying fleet endpoint automatically scopes to their assigned vehicle only
    const driverFleetRes = await fetch(`${baseUrl}/api/operations/fuel/analysis?period=this_month`, {
      headers: { Cookie: `mg_sid=${driver1Cookie}` },
    });
    assert.equal(driverFleetRes.status, 200);
    const driverFleetBody = await driverFleetRes.json();
    assert.equal(driverFleetBody.data.vehicles.length, 1);
    assert.equal(driverFleetBody.data.vehicles[0].vehicleId, vehicle1.id);
  });

  // ============================================================
  // 6. Fleet Module Route Aliases
  // ============================================================
  await t.test('6. Fleet Module Route Aliases (/api/fleet/fuel-analysis & /api/fleet/vehicles/:id/fuel-analysis)', async () => {
    // Fleet-wide alias
    const fleetAliasRes = await fetch(`${baseUrl}/api/fleet/fuel-analysis?startDate=2026-10-02&endDate=2026-10-12`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(fleetAliasRes.status, 200);
    const fleetAliasBody = await fleetAliasRes.json();
    assert.equal(fleetAliasBody.data.fleetTotals.totalFuelUsedLiters, 220.00);


    // Single vehicle alias
    const vehicleAliasRes = await fetch(`${baseUrl}/api/fleet/vehicles/${vehicle1.id}/fuel-analysis?period=this_month`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(vehicleAliasRes.status, 200);
    const vehicleAliasBody = await vehicleAliasRes.json();
    assert.equal(vehicleAliasBody.data.metrics.kmPerLiter, 8.00);
    assert.equal(vehicleAliasBody.data.metrics.costPerKm, 7.50);
  });
});
