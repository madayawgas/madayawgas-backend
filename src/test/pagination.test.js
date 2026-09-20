const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const app = require('../app');
const { query, pool } = require('../../database/connection');

let server;
let baseUrl;
const PREFIX = 'test_pagi_';
const TRUCK_PREFIX = 'TEST-PAGI-';
const PROD_PREFIX = 'TEST-PAGI-PROD-';
const CUST_PREFIX = 'TEST-PAGI-CUST-';

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

test('Standardized Server-Side Pagination Integration Tests', async (t) => {
  let adminCookie;
  let adminUserId;

  async function cleanup() {
    await query(`DELETE FROM history_logs WHERE user_name LIKE '${PREFIX}%' OR details LIKE '%${PREFIX}%' OR details LIKE '%${TRUCK_PREFIX}%' OR details LIKE '%${PROD_PREFIX}%' OR details LIKE '%${CUST_PREFIX}%'`);
    await query(`DELETE FROM customers WHERE name LIKE '${CUST_PREFIX}%'`);
    await query(`DELETE FROM products WHERE name LIKE '${PROD_PREFIX}%'`);
    await query(`DELETE FROM trucks WHERE plate_number LIKE '${TRUCK_PREFIX}%'`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
    await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
    await query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);
  }

  beforeEach(async () => {
    await cleanup();

    // 1. Roles
    const superAdminRole = (await query(`SELECT id FROM roles WHERE name = 'Super Admin'`)).rows[0].id;
    const driverRole = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;

    const passwordHash = await bcrypt.hash('PagiPass123!', 10);

    // 2. Create Super Admin user
    const adminRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, 'Pagination', 'Administrator', '+639170001111', $3, TRUE, FALSE, FALSE)
       RETURNING id`,
      [`${PREFIX}admin`, passwordHash, superAdminRole]
    );
    adminUserId = adminRes.rows[0].id;

    // 3. Login as Super Admin
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `${PREFIX}admin`, password: 'PagiPass123!' }),
    });
    adminCookie = parseCookieHeader(loginRes);

    // 4. Seed Users for Pagination tests (5 regular users)
    for (let i = 1; i <= 5; i++) {
      await query(
        `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
        [`${PREFIX}user${i}`, passwordHash, `TestFirst${i}`, `TestLast${i}`, `+63917000222${i}`, superAdminRole]
      );
    }

    // 5. Seed Drivers for Pagination tests (3 drivers)
    for (let i = 1; i <= 3; i++) {
      await query(
        `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
        [`${PREFIX}driver${i}`, passwordHash, `DriverFirst${i}`, `DriverLast${i}`, `+63917000333${i}`, driverRole]
      );
    }

    // 6. Seed Trucks (5 trucks)
    for (let i = 1; i <= 5; i++) {
      await query(
        `INSERT INTO trucks (plate_number, model, year_model, current_odometer, last_pm_odometer, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
        [`${TRUCK_PREFIX}TRK0${i}`, `Model-${i}`, 2020 + i, i * 1000, i * 1000]
      );
    }

    // 7. Seed Products (3 Household LPG + 2 Commercial LPG)
    for (let i = 1; i <= 3; i++) {
      await query(
        `INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
         VALUES ($1, 'Household LPG', 'CYLINDER', 11.0, TRUE)`,
        [`${PROD_PREFIX}Household-${i}`]
      );
    }
    for (let i = 1; i <= 2; i++) {
      await query(
        `INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
         VALUES ($1, 'Commercial LPG', 'CYLINDER', 22.0, TRUE)`,
        [`${PROD_PREFIX}Commercial-${i}`]
      );
    }

    // 8. Seed Customers (3 Retail + 2 Commercial)
    for (let i = 1; i <= 3; i++) {
      await query(
        `INSERT INTO customers (name, address, contact_number, customer_type, is_active)
         VALUES ($1, 'Matina, Davao City', $2, 'RETAIL', TRUE)`,
        [`${CUST_PREFIX}Retail-${i}`, `+63917111444${i}`]
      );
    }
    for (let i = 1; i <= 2; i++) {
      await query(
        `INSERT INTO customers (name, address, contact_number, customer_type, is_active)
         VALUES ($1, 'Bajada, Davao City', $2, 'COMMERCIAL', TRUE)`,
        [`${CUST_PREFIX}Commercial-${i}`, `+63917111555${i}`]
      );
    }

    // 9. Seed History logs
    for (let i = 1; i <= 4; i++) {
      await query(
        `INSERT INTO history_logs (user_id, user_name, user_role, action_type, module, action, details)
         VALUES ($1, 'Pagination Admin', 'Super Admin', 'Created', 'User Management', 'USER_CREATED', $2)`,
        [adminUserId, `${PREFIX} Seeded historical event ${i}`]
      );
    }
  });

  // ============================================================
  // Subtest 1: User Management Pagination (GET /api/users)
  // ============================================================
  await t.test('1. User Management - Opt-in Envelope, Sorting, Malicious Sort Guard & Legacy Fallback', async () => {
    // A. Opt-in pagination with page=1&limit=2
    const page1Res = await fetch(`${baseUrl}/api/users?page=1&limit=2`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(page1Res.status, 200);
    const page1Json = await page1Res.json();
    assert.equal(page1Json.status, 'success');
    assert.ok(Array.isArray(page1Json.data));
    assert.equal(page1Json.data.length, 2);
    assert.equal(page1Json.meta.page, 1);
    assert.equal(page1Json.meta.limit, 2);
    assert.ok(page1Json.meta.totalItems >= 6); // Admin + 5 seeded users
    assert.ok(page1Json.meta.totalPages >= 3);
    assert.equal(page1Json.meta.hasNextPage, true);
    assert.equal(page1Json.meta.hasPrevPage, false);

    // B. Page 2 returns next items
    const page2Res = await fetch(`${baseUrl}/api/users?page=2&limit=2`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const page2Json = await page2Res.json();
    assert.equal(page2Json.meta.page, 2);
    assert.equal(page2Json.meta.hasPrevPage, true);
    // Ensure slice items are distinct from page 1
    assert.notEqual(page1Json.data[0].id, page2Json.data[0].id);

    // C. Sorting by username ASC vs DESC
    const sortAscRes = await fetch(`${baseUrl}/api/users?page=1&limit=5&sortBy=username&sortOrder=ASC&search=${PREFIX}user`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const sortAscJson = await sortAscRes.json();
    assert.equal(sortAscJson.data[0].username, `${PREFIX}user1`);

    const sortDescRes = await fetch(`${baseUrl}/api/users?page=1&limit=5&sortBy=username&sortOrder=DESC&search=${PREFIX}user`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const sortDescJson = await sortDescRes.json();
    assert.equal(sortDescJson.data[0].username, `${PREFIX}user5`);

    // D. SQL injection prevention: invalid sort column falls back safely
    const injectionRes = await fetch(`${baseUrl}/api/users?page=1&limit=2&sortBy=non_existent;DROP+TABLE+users;`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(injectionRes.status, 200);
    const injectionJson = await injectionRes.json();
    assert.equal(injectionJson.status, 'success');
    assert.equal(injectionJson.data.length, 2);

    // E. Legacy fallback when no pagination parameters are supplied
    const legacyRes = await fetch(`${baseUrl}/api/users`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(legacyRes.status, 200);
    const legacyJson = await legacyRes.json();
    assert.equal(legacyJson.status, 'success');
    assert.ok(Array.isArray(legacyJson.data.users));
    assert.equal(legacyJson.meta, undefined);
  });

  // ============================================================
  // Subtest 2: Fleet Trucks Pagination (GET /api/fleet/trucks)
  // ============================================================
  await t.test('2. Fleet Trucks - Page Boundary Handling, Limit Clamping & Legacy Fallback', async () => {
    // A. Opt-in pagination
    const res1 = await fetch(`${baseUrl}/api/fleet/trucks?page=1&limit=2&search=${TRUCK_PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(res1.status, 200);
    const json1 = await res1.json();
    assert.equal(json1.status, 'success');
    assert.ok(Array.isArray(json1.data));
    assert.equal(json1.data.length, 2);
    assert.equal(json1.meta.page, 1);
    assert.equal(json1.meta.limit, 2);
    assert.equal(json1.meta.totalItems, 5);
    assert.equal(json1.meta.totalPages, 3);
    assert.equal(json1.meta.hasNextPage, true);
    assert.equal(json1.meta.hasPrevPage, false);

    // B. Last page (page 3)
    const res3 = await fetch(`${baseUrl}/api/fleet/trucks?page=3&limit=2&search=${TRUCK_PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const json3 = await res3.json();
    assert.equal(json3.meta.page, 3);
    assert.equal(json3.data.length, 1);
    assert.equal(json3.meta.hasNextPage, false);
    assert.equal(json3.meta.hasPrevPage, true);

    // C. Beyond last page (page 999) -> empty array, no error
    const resOutOfBounds = await fetch(`${baseUrl}/api/fleet/trucks?page=999&limit=2&search=${TRUCK_PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const jsonOutOfBounds = await resOutOfBounds.json();
    assert.equal(jsonOutOfBounds.status, 'success');
    assert.equal(jsonOutOfBounds.data.length, 0);
    assert.equal(jsonOutOfBounds.meta.hasNextPage, false);
    assert.equal(jsonOutOfBounds.meta.hasPrevPage, true);

    // D. Limit clamping: limit=500 is clamped to 100
    const resClamped = await fetch(`${baseUrl}/api/fleet/trucks?page=1&limit=500`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const jsonClamped = await resClamped.json();
    assert.equal(jsonClamped.meta.limit, 100);

    // E. Negative page clamped to 1
    const resNegPage = await fetch(`${baseUrl}/api/fleet/trucks?page=-5&limit=2`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const jsonNegPage = await resNegPage.json();
    assert.equal(jsonNegPage.meta.page, 1);

    // F. Legacy fallback
    const legacyTrucks = await fetch(`${baseUrl}/api/fleet/trucks`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const legacyTrucksJson = await legacyTrucks.json();
    assert.equal(legacyTrucksJson.status, 'success');
    assert.ok(Array.isArray(legacyTrucksJson.data.trucks));
    assert.equal(typeof legacyTrucksJson.data.count, 'number');
    assert.equal(legacyTrucksJson.meta, undefined);
  });

  // ============================================================
  // Subtest 3: Fleet Drivers Pagination (GET /api/fleet/drivers)
  // ============================================================
  await t.test('3. Fleet Drivers - Opt-in Envelope & Legacy Fallback', async () => {
    // A. Opt-in pagination
    const optRes = await fetch(`${baseUrl}/api/fleet/drivers?page=1&limit=2&search=${PREFIX}driver`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(optRes.status, 200);
    const optJson = await optRes.json();
    assert.equal(optJson.status, 'success');
    assert.ok(Array.isArray(optJson.data));
    assert.equal(optJson.data.length, 2);
    assert.equal(optJson.meta.totalItems, 3);
    assert.equal(optJson.meta.totalPages, 2);
    assert.equal(optJson.meta.hasNextPage, true);

    // B. Legacy fallback
    const legacyRes = await fetch(`${baseUrl}/api/fleet/drivers`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(legacyRes.status, 200);
    const legacyJson = await legacyRes.json();
    assert.equal(legacyJson.status, 'success');
    assert.ok(Array.isArray(legacyJson.data.drivers));
    assert.equal(typeof legacyJson.data.count, 'number');
    assert.equal(legacyJson.meta, undefined);
  });

  // ============================================================
  // Subtest 4: Inventory Products Pagination (GET /api/inventory/products)
  // ============================================================
  await t.test('4. Inventory Products - Filter & Search Synchronization and Legacy Fallback', async () => {
    // A. Opt-in pagination on all products
    const optRes = await fetch(`${baseUrl}/api/inventory/products?page=1&limit=2&search=${PROD_PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(optRes.status, 200);
    const optJson = await optRes.json();
    assert.equal(optJson.status, 'success');
    assert.equal(optJson.data.length, 2);
    assert.equal(optJson.meta.totalItems, 5);
    assert.equal(optJson.meta.totalPages, 3);

    // B. Synchronized category filter (Household LPG: 3 items)
    const catRes = await fetch(`${baseUrl}/api/inventory/products?category=Household%20LPG&page=1&limit=2&search=${PROD_PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const catJson = await catRes.json();
    assert.equal(catJson.data.length, 2);
    assert.equal(catJson.meta.totalItems, 3);
    assert.equal(catJson.meta.totalPages, 2);
    assert.equal(catJson.meta.hasNextPage, true);
    assert.ok(catJson.data.every((item) => item.category === 'Household LPG'));

    // C. Synchronized search filter (search=Commercial: 2 items)
    const searchRes = await fetch(`${baseUrl}/api/inventory/products?search=${PROD_PREFIX}Commercial&page=1&limit=10`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const searchJson = await searchRes.json();
    assert.equal(searchJson.data.length, 2);
    assert.equal(searchJson.meta.totalItems, 2);
    assert.equal(searchJson.meta.totalPages, 1);
    assert.equal(searchJson.meta.hasNextPage, false);

    // D. Legacy fallback
    const legacyRes = await fetch(`${baseUrl}/api/inventory/products`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(legacyRes.status, 200);
    const legacyJson = await legacyRes.json();
    assert.equal(legacyJson.status, 'success');
    assert.ok(Array.isArray(legacyJson.data.products));
    assert.equal(typeof legacyJson.data.count, 'number');
    assert.equal(legacyJson.meta, undefined);
  });

  // ============================================================
  // Subtest 5: Sales Customers Pagination (GET /api/sales/customers)
  // ============================================================
  await t.test('5. Sales Customers - Filter Synchronization and Legacy Fallback', async () => {
    // A. Opt-in pagination
    const optRes = await fetch(`${baseUrl}/api/sales/customers?page=1&limit=2&search=${CUST_PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(optRes.status, 200);
    const optJson = await optRes.json();
    assert.equal(optJson.status, 'success');
    assert.equal(optJson.data.length, 2);
    assert.equal(optJson.meta.totalItems, 5);
    assert.equal(optJson.meta.totalPages, 3);

    // B. Synchronized customerType filter (COMMERCIAL: 2 items)
    const commRes = await fetch(`${baseUrl}/api/sales/customers?customerType=COMMERCIAL&page=1&limit=10&search=${CUST_PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const commJson = await commRes.json();
    assert.equal(commJson.data.length, 2);
    assert.equal(commJson.meta.totalItems, 2);
    assert.equal(commJson.meta.totalPages, 1);
    assert.ok(commJson.data.every((c) => c.customerType === 'COMMERCIAL'));

    // C. Legacy fallback
    const legacyRes = await fetch(`${baseUrl}/api/sales/customers`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(legacyRes.status, 200);
    const legacyJson = await legacyRes.json();
    assert.equal(legacyJson.status, 'success');
    assert.ok(Array.isArray(legacyJson.data.customers));
    assert.equal(typeof legacyJson.data.count, 'number');
    assert.equal(legacyJson.meta, undefined);
  });

  // ============================================================
  // Subtest 6: History Logs Pagination (GET /api/history)
  // ============================================================
  await t.test('6. History Logs - Opt-in via page or pageSize, and Legacy Limit Preservation', async () => {
    // A. Opt-in via page parameter
    const optRes = await fetch(`${baseUrl}/api/history?page=1&limit=2&search=${PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(optRes.status, 200);
    const optJson = await optRes.json();
    assert.equal(optJson.status, 'success');
    assert.ok(Array.isArray(optJson.data));
    assert.equal(optJson.data.length, 2);
    assert.equal(optJson.meta.page, 1);
    assert.equal(optJson.meta.limit, 2);
    assert.equal(optJson.meta.totalItems, 4);
    assert.equal(optJson.meta.totalPages, 2);
    assert.equal(optJson.meta.hasNextPage, true);

    // B. Opt-in via pageSize parameter
    const sizeRes = await fetch(`${baseUrl}/api/history?pageSize=3&search=${PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    const sizeJson = await sizeRes.json();
    assert.equal(sizeJson.status, 'success');
    assert.equal(sizeJson.data.length, 3);
    assert.equal(sizeJson.meta.limit, 3);

    // C. Legacy preservation: limit without page returns { logs, count, total }
    const legacyLimitRes = await fetch(`${baseUrl}/api/history?limit=2&search=${PREFIX}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(legacyLimitRes.status, 200);
    const legacyLimitJson = await legacyLimitRes.json();
    assert.equal(legacyLimitJson.status, 'success');
    assert.ok(Array.isArray(legacyLimitJson.data.logs));
    assert.equal(legacyLimitJson.data.count, 2);
    assert.equal(legacyLimitJson.data.total, 4);
    assert.equal(legacyLimitJson.meta, undefined);
  });
});
