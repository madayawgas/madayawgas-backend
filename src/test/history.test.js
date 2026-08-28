const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../app');
const { pool, query } = require('../../database/connection');

const PREFIX = 'test_hist_';

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

test('System Event History Log Subsystem Tests', async (t) => {
  let server;
  let port;

  // Cleanup helper scoped to test_hist_ prefix
  async function cleanupTestData() {
    await query(
      `DELETE FROM history_logs WHERE user_name ILIKE '${PREFIX}%' OR details ILIKE '%${PREFIX}%' OR user_id IN (SELECT id FROM users WHERE username ILIKE '${PREFIX}%')`
    );
    await query(`DELETE FROM customers WHERE name ILIKE '${PREFIX}%'`);
    await query(`DELETE FROM products WHERE name ILIKE '${PREFIX}%'`);
    await query(`DELETE FROM trucks WHERE plate_number ILIKE '${PREFIX}%'`);
    await query(
      `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username ILIKE '${PREFIX}%')`
    );
    await query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username ILIKE '${PREFIX}%') OR target_user_id IN (SELECT id FROM users WHERE username ILIKE '${PREFIX}%')`
    );
    await query(`DELETE FROM users WHERE username ILIKE '${PREFIX}%'`);
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
  });

  t.beforeEach(async () => {
    await cleanupTestData();
  });

  // Helper to log in as seed superadmin
  async function loginAsSuperAdmin() {
    const res = await makeRequest(
      server,
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/users/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        username: 'superadmin',
        password: 'Superadmin123!',
      }
    );
    assert.equal(res.statusCode, 200);
    return parseCookie(res.headers['set-cookie']);
  }

  // Helper to log in as seed sales person
  async function loginAsSalesUser() {
    const res = await makeRequest(
      server,
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/users/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        username: 'sales_user',
        password: 'SalesPass123!',
      }
    );
    assert.equal(res.statusCode, 200);
    return parseCookie(res.headers['set-cookie']);
  }

  await t.test('1. RBAC Route Protection - 401 Unauthorized vs 200 OK', async () => {
    // Missing session cookie -> 401
    const unauthRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history',
      method: 'GET',
    });
    assert.equal(unauthRes.statusCode, 401);
    assert.equal(unauthRes.body.status, 'fail');

    // Super Admin -> 200 OK
    const adminCookie = await loginAsSuperAdmin();
    const authRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(authRes.statusCode, 200);
    assert.equal(authRes.body.status, 'success');
    assert.ok(Array.isArray(authRes.body.data.logs));

    // Also verify alias /api/history-logs works identically
    const aliasRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history-logs',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(aliasRes.statusCode, 200);
    assert.equal(aliasRes.body.status, 'success');
  });

  await t.test('2. Response Schema Validation matching Frontend Expectations', async () => {
    const adminCookie = await loginAsSuperAdmin();
    const res = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.data.logs.length > 0, 'Should return seeded logs');

    const sampleLog = res.body.data.logs[0];
    assert.ok(sampleLog.id, 'Log must have id');
    assert.ok(sampleLog.date, 'Log must have date formatted string');
    assert.ok(sampleLog.time, 'Log must have time formatted string');
    assert.ok(sampleLog.userName, 'Log must have userName');
    assert.ok(sampleLog.userRole, 'Log must have userRole');
    assert.ok(sampleLog.actionType, 'Log must have actionType');
    assert.ok(sampleLog.module, 'Log must have module');
    assert.ok(sampleLog.details, 'Log must have details');
    assert.ok(sampleLog.createdAt, 'Log must have createdAt ISO string');
  });

  await t.test('3. Module Filtering (User Management, Fleet Management, Inventory Management, Sales & Delivery)', async () => {
    const adminCookie = await loginAsSuperAdmin();

    // Filter Fleet Management
    const fleetRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history?module=Fleet%20Management',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(fleetRes.statusCode, 200);
    assert.ok(fleetRes.body.data.logs.length > 0);
    for (const log of fleetRes.body.data.logs) {
      assert.equal(log.module, 'Fleet Management');
    }

    // Filter Inventory Management
    const invRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history?module=Inventory%20Management',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(invRes.statusCode, 200);
    assert.ok(invRes.body.data.logs.length > 0);
    for (const log of invRes.body.data.logs) {
      assert.equal(log.module, 'Inventory Management');
    }

    // Filter All Modules
    const allRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history?module=All%20Modules',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(allRes.statusCode, 200);
    const modules = new Set(allRes.body.data.logs.map((l) => l.module));
    assert.ok(modules.size > 1, 'All Modules should include multiple distinct modules');
  });

  await t.test('4. ActionType and Search Keyword Filtering', async () => {
    const adminCookie = await loginAsSuperAdmin();

    // Filter by actionType=Created
    const createdRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history?actionType=Created',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(createdRes.statusCode, 200);
    for (const log of createdRes.body.data.logs) {
      assert.equal(log.actionType, 'Created');
    }

    // Search query: "Canister"
    const searchRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history?search=Canister',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(searchRes.statusCode, 200);
    assert.ok(searchRes.body.data.logs.length > 0);
    for (const log of searchRes.body.data.logs) {
      const match =
        log.details.toLowerCase().includes('canister') ||
        log.userName.toLowerCase().includes('canister');
      assert.ok(match, 'Search results must match query');
    }
  });

  await t.test('5. Real-time Live Event Logging across Subsystems', async () => {
    const adminCookie = await loginAsSuperAdmin();

    // A. Create a Customer via Sales API
    const custRes = await makeRequest(
      server,
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/sales/customers',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      },
      {
        name: `${PREFIX}Davao Bakery`,
        address: '100 Bolton St, Davao City',
        contactNumber: '+63821112222',
        customerType: 'COMMERCIAL',
      }
    );
    assert.equal(custRes.statusCode, 201);
    const createdCustomer = custRes.body.data.customer;

    // B. Create a Product via Inventory API
    const prodRes = await makeRequest(
      server,
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/inventory/products',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      },
      {
        name: `${PREFIX}Special Gas 50kg`,
        category: 'LPG Cylinder',
        containerType: 'CYLINDER',
        netWeightKg: 50.0,
      }
    );
    assert.equal(prodRes.statusCode, 201);
    const createdProduct = prodRes.body.data.product;

    // C. Register a Truck via Fleet API
    const truckRes = await makeRequest(
      server,
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/fleet/trucks',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      },
      {
        plateNumber: `${PREFIX}999`,
        model: 'Mitsubishi Fuso Fighter',
        yearModel: 2024,
        currentOdometer: 12000,
        lastPmOdometer: 10000,
      }
    );
    assert.equal(truckRes.statusCode, 201);
    const createdTruck = truckRes.body.data.truck;

    // D. Fetch History Logs and verify all 3 newly created events appear at the top
    const historyRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history?limit=10',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(historyRes.statusCode, 200);

    const logs = historyRes.body.data.logs;
    const custLog = logs.find((l) => l.targetId === createdCustomer.id);
    const prodLog = logs.find((l) => l.targetId === createdProduct.id);
    const truckLog = logs.find((l) => l.targetId === createdTruck.id);

    assert.ok(custLog, 'Customer creation should be recorded in history logs');
    assert.equal(custLog.module, 'Sales & Delivery');
    assert.equal(custLog.actionType, 'Created');

    assert.ok(prodLog, 'Product creation should be recorded in history logs');
    assert.equal(prodLog.module, 'Inventory Management');
    assert.equal(prodLog.actionType, 'Created');

    assert.ok(truckLog, 'Truck registration should be recorded in history logs');
    assert.equal(truckLog.module, 'Fleet Management');
    assert.equal(truckLog.actionType, 'Created');
  });

  await t.test('6. Single History Log Retrieval by ID and 404 Handling', async () => {
    const adminCookie = await loginAsSuperAdmin();

    const listRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history?limit=1',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(listRes.statusCode, 200);
    const targetLog = listRes.body.data.logs[0];
    assert.ok(targetLog, 'Should have at least one log');

    // Get single log
    const singleRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: `/api/history/${targetLog.id}`,
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(singleRes.statusCode, 200);
    assert.equal(singleRes.body.data.log.id, targetLog.id);
    assert.equal(singleRes.body.data.log.details, targetLog.details);

    // Non-existent ID -> 404
    const notFoundRes = await makeRequest(server, {
      hostname: '127.0.0.1',
      port,
      path: '/api/history/00000000-0000-0000-0000-000000000000',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert.equal(notFoundRes.statusCode, 404);
    assert.equal(notFoundRes.body.status, 'fail');
  });

  await t.test('7. Centralized Template Resolver & Event Registry Functionality', async () => {
    const { EVENTS, resolveEvent, historyService } = require('../features/history');

    // A. Verify standard template resolution
    const userCreatedResolved = resolveEvent(EVENTS.USER_CREATED, {
      name: 'Maria Santos',
      role: 'Sales Person',
    });
    assert.equal(userCreatedResolved.module, 'User Management');
    assert.equal(userCreatedResolved.actionType, 'Created');
    assert.equal(userCreatedResolved.details, "Created new user account for 'Maria Santos' (Sales Person)");

    // B. Verify dynamic actionType evaluation (e.g. TRUCK_STATUS_UPDATED)
    const truckMaint = resolveEvent(EVENTS.TRUCK_STATUS_UPDATED, {
      plateNumber: 'XYZ-1234',
      status: 'UNDER_MAINTENANCE',
    });
    assert.equal(truckMaint.actionType, 'Updated');
    assert.equal(truckMaint.details, "Changed status for truck 'XYZ-1234' to 'UNDER_MAINTENANCE'");

    const truckRetired = resolveEvent(EVENTS.TRUCK_STATUS_UPDATED, {
      plateNumber: 'XYZ-1234',
      status: 'RETIRED',
    });
    assert.equal(truckRetired.actionType, 'Deactivated');

    // C. Verify graceful fallback for unlisted / custom events
    const customResolved = resolveEvent('CUSTOM_DISPATCH_EVENT', { sample: 123 }, {
      module: 'Route Dispatch',
      details: 'Custom dispatch event triggered',
    });
    assert.equal(customResolved.action, 'CUSTOM_DISPATCH_EVENT');
    assert.equal(customResolved.module, 'Route Dispatch');
    assert.equal(customResolved.details, 'Custom dispatch event triggered');

    // D. Verify historyService.log executes successfully with template resolver
    const logged = await historyService.log(EVENTS.PRODUCT_CREATED, {
      userName: `${PREFIX}Admin User`,
      userRole: 'Admin',
      targetId: '00000000-0000-0000-0000-000000000001',
      payload: { name: `${PREFIX}Test Tank 11kg`, category: 'LPG Cylinder' },
      metadata: { test: true },
    });
    assert.ok(logged);
    assert.equal(logged.module, 'Inventory Management');
    assert.equal(logged.actionType, 'Created');
    assert.equal(logged.details, `Created new inventory product '${PREFIX}Test Tank 11kg' (LPG Cylinder)`);
  });
});
