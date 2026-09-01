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

test('Sales Customer Profile CRUD Subsystem Tests', async (t) => {
  let superAdminCookie;
  let adminCookie;
  let salesManagerCookie;
  let fleetManagerCookie;
  let salesPersonCookie;

  beforeEach(async () => {
    // 1. Clean test records with isolation prefix test_cust_ and TEST-CUST-
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_cust_%') OR details LIKE '%TEST-CUST-%'`);
    await query(`DELETE FROM customers WHERE name LIKE 'TEST-CUST-%'`);
    await query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_cust_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_cust_%')`
    );
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_cust_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_cust_%'`);

    // 2. Fetch role IDs
    const superAdminRole = (await query(`SELECT id FROM roles WHERE name = 'Super Admin'`)).rows[0].id;
    const adminRole = (await query(`SELECT id FROM roles WHERE name = 'Admin'`)).rows[0].id;
    const salesManagerRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Manager'`)).rows[0].id;
    const fleetManagerRole = (await query(`SELECT id FROM roles WHERE name = 'Fleet Manager'`)).rows[0].id;
    const salesPersonRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Person'`)).rows[0].id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('CustPass123!', 10);

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_cust_superadmin', passwordHash, 'Super', 'Admin', '+639173000001', superAdminRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_cust_admin', passwordHash, 'Admin', 'User', '+639173000002', adminRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_cust_sales_mgr', passwordHash, 'Sales', 'Manager', '+639173000003', salesManagerRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_cust_fleet', passwordHash, 'Fleet', 'Manager', '+639173000004', fleetManagerRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_cust_sales', passwordHash, 'Sales', 'Rep', '+639173000005', salesPersonRole]
    );

    // 4. Authenticate users to obtain session cookies
    const saLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_cust_superadmin', password: 'CustPass123!' }),
    });
    superAdminCookie = parseCookieHeader(saLogin);

    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_cust_admin', password: 'CustPass123!' }),
    });
    adminCookie = parseCookieHeader(adminLogin);

    const smLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_cust_sales_mgr', password: 'CustPass123!' }),
    });
    salesManagerCookie = parseCookieHeader(smLogin);

    const fmLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_cust_fleet', password: 'CustPass123!' }),
    });
    fleetManagerCookie = parseCookieHeader(fmLogin);

    const salesLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_cust_sales', password: 'CustPass123!' }),
    });
    salesPersonCookie = parseCookieHeader(salesLogin);
  });

  // ============================================================
  // Subtest 1: RBAC Route Protection
  // ============================================================
  await t.test('1. RBAC Route Protection - 401 Unauthorized vs 403 Forbidden vs 200/201 OK', async () => {
    // A. Unauthenticated request -> 401 Unauthorized
    const unauthGet = await fetch(`${baseUrl}/api/sales/customers`);
    assert.equal(unauthGet.status, 401);
    const unauthJson = await unauthGet.json();
    assert.equal(unauthJson.status, 'fail');
    assert.equal(unauthJson.message, 'Unauthorized');

    const unauthPost = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TEST-CUST- Unauth Customer' }),
    });
    assert.equal(unauthPost.status, 401);

    // B. Fleet Manager (no sales permissions) -> GET 403 Forbidden
    const fmGet = await fetch(`${baseUrl}/api/sales/customers`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(fmGet.status, 403);
    const fmGetJson = await fmGet.json();
    assert.equal(fmGetJson.status, 'fail');
    assert.equal(fmGetJson.message, 'Forbidden');

    // C. Sales Manager has sales.view -> GET 200 OK, but lacks sales.create -> POST 403 Forbidden
    const smGet = await fetch(`${baseUrl}/api/sales/customers`, {
      headers: { Cookie: `mg_sid=${salesManagerCookie}` },
    });
    assert.equal(smGet.status, 200);

    const smPost = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesManagerCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-CUST- SM Customer',
        address: '123 Test St',
        contactNumber: '09170000000',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(smPost.status, 403);
    const smPostJson = await smPost.json();
    assert.equal(smPostJson.status, 'fail');
    assert.equal(smPostJson.message, 'Forbidden');

    // D. Sales Person has sales.view_own and sales.create -> GET 200, POST 201
    const salesGet = await fetch(`${baseUrl}/api/sales/customers`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(salesGet.status, 200);

    const salesPost = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-CUST- Sales Rep Customer',
        address: '456 Sales St, Davao City',
        contactNumber: '+639171112233',
        customerType: 'COMMERCIAL',
      }),
    });
    assert.equal(salesPost.status, 201);
  });

  // ============================================================
  // Subtest 2: Register Customer (POST /api/sales/customers)
  // ============================================================
  await t.test('2. Register Customer - Validation, Customer Types & Creation', async () => {
    // A. Successfully create RETAIL customer
    const createRetailRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-CUST- Maria Santos',
        address: 'Block 5 Lot 12, Deca Homes, Davao City',
        contactNumber: '+639181234567',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(createRetailRes.status, 201);
    const retailData = await createRetailRes.json();
    assert.equal(retailData.status, 'success');
    assert.ok(retailData.data.customer.id);
    assert.equal(retailData.data.customer.name, 'TEST-CUST- Maria Santos');
    assert.equal(retailData.data.customer.address, 'Block 5 Lot 12, Deca Homes, Davao City');
    assert.equal(retailData.data.customer.contactNumber, '+639181234567');
    assert.equal(retailData.data.customer.customerType, 'RETAIL');
    assert.equal(retailData.data.customer.isActive, true);
    assert.ok(retailData.data.customer.createdAt);
    assert.ok(retailData.data.customer.updatedAt);

    // B. Successfully create COMMERCIAL customer with formatted landline: (082) 224-5678
    const createCommercialRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-CUST- Davao Central Bakery',
        address: 'Corner San Pedro St, Davao City',
        contactNumber: '(082) 224-5678', // Formatted landline
        customerType: 'COMMERCIAL',
      }),
    });
    assert.equal(createCommercialRes.status, 201);
    const commercialData = await createCommercialRes.json();
    assert.equal(commercialData.status, 'success');
    assert.equal(commercialData.data.customer.customerType, 'COMMERCIAL');
    assert.equal(commercialData.data.customer.contactNumber, '+63822245678'); // Standardized to +63...

    // C. Successfully create WHOLESALE customer with hyphenated mobile: 0917-123-4567
    const createWholesaleRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${superAdminCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-CUST- Mindanao LPG Distro',
        address: 'Km 11 Sasa, Davao City',
        contactNumber: '0917-123-4567', // Hyphenated mobile
        customerType: 'WHOLESALE',
      }),
    });
    assert.equal(createWholesaleRes.status, 201);
    const wholesaleData = await createWholesaleRes.json();
    assert.equal(wholesaleData.status, 'success');
    assert.equal(wholesaleData.data.customer.customerType, 'WHOLESALE');
    assert.equal(wholesaleData.data.customer.contactNumber, '+639171234567'); // Standardized to +63...

    // D. Validation: Missing name
    const missingNameRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({
        address: '123 Address',
        contactNumber: '09170000000',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(missingNameRes.status, 400);
    const missingNameJson = await missingNameRes.json();
    assert.equal(missingNameJson.status, 'fail');
    assert.match(missingNameJson.message, /Customer name is required/i);

    // E. Validation: Missing address
    const missingAddressRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-CUST- No Address',
        contactNumber: '09170000000',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(missingAddressRes.status, 400);
    const missingAddressJson = await missingAddressRes.json();
    assert.equal(missingAddressJson.status, 'fail');
    assert.match(missingAddressJson.message, /Address is required/i);

    // F. Validation: Missing contactNumber
    const missingContactRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-CUST- No Contact',
        address: '123 Address',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(missingContactRes.status, 400);
    const missingContactJson = await missingContactRes.json();
    assert.equal(missingContactJson.status, 'fail');
    assert.match(missingContactJson.message, /Contact number is required/i);

    // G. Validation: Invalid customerType
    const invalidTypeRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-CUST- Invalid Type',
        address: '123 Address',
        contactNumber: '09170000000',
        customerType: 'GOVERNMENT',
      }),
    });
    assert.equal(invalidTypeRes.status, 400);
    const invalidTypeJson = await invalidTypeRes.json();
    assert.equal(invalidTypeJson.status, 'fail');
    assert.match(invalidTypeJson.message, /Invalid customer type/i);

    // H. Validation: Invalid Phone Format (non-PH)
    const invalidPhoneRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-CUST- Invalid Phone',
        address: '123 Address',
        contactNumber: '12345',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(invalidPhoneRes.status, 400);
    const invalidPhoneJson = await invalidPhoneRes.json();
    assert.equal(invalidPhoneJson.status, 'fail');
    assert.match(invalidPhoneJson.message, /Invalid Philippine phone number format/i);
  });

  // ============================================================
  // Subtest 3: View Customer Overview & Search (GET /api/sales/customers)
  // ============================================================
  await t.test('3. View Customer Overview - List, Filters, Search & Counts', async () => {
    // 1. Seed multiple customers
    const c1 = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        name: 'TEST-CUST- Retail Shop Alpha',
        address: 'Matina, Davao City',
        contactNumber: '+639171110001',
        customerType: 'RETAIL',
      }),
    });
    const c1Id = (await c1.json()).data.customer.id;

    const c2 = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        name: 'TEST-CUST- Commercial Grill Bravo',
        address: 'Bajada, Davao City',
        contactNumber: '+639171110002',
        customerType: 'COMMERCIAL',
      }),
    });
    const c2Id = (await c2.json()).data.customer.id;

    const c3 = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        name: 'TEST-CUST- Wholesale Trader Charlie',
        address: 'Lanang, Davao City',
        contactNumber: '+639171110003',
        customerType: 'WHOLESALE',
      }),
    });
    const c3Id = (await c3.json()).data.customer.id;

    // 2. View all customers overview
    const listRes = await fetch(`${baseUrl}/api/sales/customers`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.status, 'success');
    assert.ok(listJson.data.count >= 3);
    const testCustomers = listJson.data.customers.filter((c) => c.name.startsWith('TEST-CUST-'));
    assert.equal(testCustomers.length, 3);

    // 3. Filter by customerType=COMMERCIAL
    const commFilterRes = await fetch(`${baseUrl}/api/sales/customers?customerType=COMMERCIAL`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const commJson = await commFilterRes.json();
    const testCommercials = commJson.data.customers.filter((c) => c.name.startsWith('TEST-CUST-'));
    assert.equal(testCommercials.length, 1);
    assert.equal(testCommercials[0].id, c2Id);

    // 4. Search filter by name or address
    const searchRes = await fetch(`${baseUrl}/api/sales/customers?search=Bajada`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const searchJson = await searchRes.json();
    const searchMatches = searchJson.data.customers.filter((c) => c.name.startsWith('TEST-CUST-'));
    assert.equal(searchMatches.length, 1);
    assert.equal(searchMatches[0].id, c2Id);
  });

  // ============================================================
  // Subtest 4: View Single Customer Profile (GET /api/sales/customers/:id)
  // ============================================================
  await t.test('4. View Single Customer Profile - Detail Viewing & 404 Not Found', async () => {
    // 1. Create a customer
    const createRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        name: 'TEST-CUST- Profile Test Customer',
        address: 'Buhangin, Davao City',
        contactNumber: '+639190001122',
        customerType: 'RETAIL',
      }),
    });
    const createdCust = (await createRes.json()).data.customer;

    // 2. Fetch customer by ID
    const singleRes = await fetch(`${baseUrl}/api/sales/customers/${createdCust.id}`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(singleRes.status, 200);
    const singleJson = await singleRes.json();
    assert.equal(singleJson.status, 'success');
    assert.equal(singleJson.data.customer.id, createdCust.id);
    assert.equal(singleJson.data.customer.name, 'TEST-CUST- Profile Test Customer');
    assert.equal(singleJson.data.customer.address, 'Buhangin, Davao City');
    assert.equal(singleJson.data.customer.contactNumber, '+639190001122');
    assert.equal(singleJson.data.customer.customerType, 'RETAIL');
    assert.equal(singleJson.data.customer.isActive, true);

    // 3. Non-existent UUID -> 404 Not Found
    const notFoundRes = await fetch(`${baseUrl}/api/sales/customers/00000000-0000-0000-0000-000000000000`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.status, 'fail');
    assert.equal(notFoundJson.message, 'Customer not found');
  });

  // ============================================================
  // Subtest 5: Update Customer Profile (PATCH /api/sales/customers/:id)
  // ============================================================
  await t.test('5. Update Customer Profile - Modifications & Validation', async () => {
    // 1. Create customer
    const createRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        name: 'TEST-CUST- Original Customer Name',
        address: 'Original Address, Davao City',
        contactNumber: '+639170001234',
        customerType: 'RETAIL',
      }),
    });
    const createdCust = (await createRes.json()).data.customer;

    // 2. Update multiple fields with formatted landline: (02) 8123-4567
    const updateRes = await fetch(`${baseUrl}/api/sales/customers/${createdCust.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        name: 'TEST-CUST- Updated Customer Name',
        address: 'Updated Address, Davao City',
        contactNumber: '(02) 8123-4567', // Formatted landline
        customerType: 'COMMERCIAL',
      }),
    });
    assert.equal(updateRes.status, 200);
    const updateJson = await updateRes.json();
    assert.equal(updateJson.status, 'success');
    assert.equal(updateJson.data.customer.id, createdCust.id);
    assert.equal(updateJson.data.customer.name, 'TEST-CUST- Updated Customer Name');
    assert.equal(updateJson.data.customer.address, 'Updated Address, Davao City');
    assert.equal(updateJson.data.customer.contactNumber, '+63281234567'); // Standardized to +63...
    assert.equal(updateJson.data.customer.customerType, 'COMMERCIAL');

    // 3. Validation: Empty name on update -> 400
    const invalidNameRes = await fetch(`${baseUrl}/api/sales/customers/${createdCust.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({ name: '   ' }),
    });
    assert.equal(invalidNameRes.status, 400);
    const invalidNameJson = await invalidNameRes.json();
    assert.equal(invalidNameJson.status, 'fail');
    assert.match(invalidNameJson.message, /Customer name cannot be empty/i);

    // 4. Update non-existent customer -> 404
    const notFoundUpdate = await fetch(`${baseUrl}/api/sales/customers/00000000-0000-0000-0000-000000000000`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({ name: 'TEST-CUST- Nonexistent' }),
    });
    assert.equal(notFoundUpdate.status, 404);
    const notFoundJson = await notFoundUpdate.json();
    assert.equal(notFoundJson.status, 'fail');
    assert.equal(notFoundJson.message, 'Customer not found');
  });

  // ============================================================
  // Subtest 6: Deactivate Customer (PATCH /api/sales/customers/:id/deactivate)
  // ============================================================
  await t.test('6. Deactivate Customer - Soft Deactivation & Status Reflection', async () => {
    // 1. Create customer (default is_active = true)
    const createRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        name: 'TEST-CUST- Customer To Deactivate',
        address: 'Toril, Davao City',
        contactNumber: '+639175556677',
        customerType: 'RETAIL',
      }),
    });
    const createdCust = (await createRes.json()).data.customer;
    assert.equal(createdCust.isActive, true);

    // 2. Rejection without password confirmation
    const noPassDeact = await fetch(`${baseUrl}/api/sales/customers/${createdCust.id}/deactivate`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(noPassDeact.status, 401);
    const noPassJson = await noPassDeact.json();
    assert.equal(noPassJson.code, 'PASSWORD_CONFIRMATION_REQUIRED');

    // 3. Rejection with incorrect password confirmation
    const wrongPassDeact = await fetch(`${baseUrl}/api/sales/customers/${createdCust.id}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({ confirmPassword: 'WrongPassword123!' }),
    });
    assert.equal(wrongPassDeact.status, 401);
    const wrongPassJson = await wrongPassDeact.json();
    assert.equal(wrongPassJson.code, 'INVALID_CONFIRMATION_PASSWORD');

    // 4. Successfully deactivate customer with valid password
    const deactRes = await fetch(`${baseUrl}/api/sales/customers/${createdCust.id}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({ confirmPassword: 'CustPass123!' }),
    });
    assert.equal(deactRes.status, 200);
    const deactJson = await deactRes.json();
    assert.equal(deactJson.status, 'success');
    assert.equal(deactJson.message, 'Customer successfully deactivated');
    assert.equal(deactJson.data.customer.id, createdCust.id);
    assert.equal(deactJson.data.customer.isActive, false);

    // 5. Verify single GET shows isActive = false
    const getRes = await fetch(`${baseUrl}/api/sales/customers/${createdCust.id}`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const getJson = await getRes.json();
    assert.equal(getJson.data.customer.isActive, false);

    // 6. Verify isActive=true filter excludes the deactivated customer
    const activeFilterRes = await fetch(`${baseUrl}/api/sales/customers?isActive=true`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const activeJson = await activeFilterRes.json();
    const activeMatch = activeJson.data.customers.find((c) => c.id === createdCust.id);
    assert.equal(activeMatch, undefined);

    // 7. Verify isActive=false filter includes the deactivated customer
    const inactiveFilterRes = await fetch(`${baseUrl}/api/sales/customers?isActive=false`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const inactiveJson = await inactiveFilterRes.json();
    const inactiveMatch = inactiveJson.data.customers.find((c) => c.id === createdCust.id);
    assert.ok(inactiveMatch);
    assert.equal(inactiveMatch.isActive, false);

    // 8. Deactivating non-existent customer with valid password -> 404
    const notFoundDeact = await fetch(`${baseUrl}/api/sales/customers/00000000-0000-0000-0000-000000000000/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({ confirmPassword: 'CustPass123!' }),
    });
    assert.equal(notFoundDeact.status, 404);
    const notFoundJson = await notFoundDeact.json();
    assert.equal(notFoundJson.status, 'fail');
    assert.equal(notFoundJson.message, 'Customer not found');
  });
});
