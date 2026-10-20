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
  // Cleanup lingering records
  await query(`DELETE FROM canister_ledger WHERE customer_id IN (SELECT id FROM customers WHERE contact_person LIKE 'TEST-SALES-%' OR business_name LIKE 'TEST-SALES-%' OR name LIKE 'TEST-SALES-%')`);
  await query(`DELETE FROM sales_transactions WHERE transaction_no LIKE 'TEST-SALES-%'`);
  await query(`DELETE FROM trips WHERE trip_number LIKE 'TEST-SALES-%'`);
  await query(`DELETE FROM customers WHERE contact_person LIKE 'TEST-SALES-%' OR business_name LIKE 'TEST-SALES-%' OR name LIKE 'TEST-SALES-%'`);
  await query(`DELETE FROM vehicles WHERE plate_number LIKE 'TEST-SALES-%'`);
  await query(`DELETE FROM service_zones WHERE code LIKE 'TEST-SALES-%'`);
  await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_cust_%') OR details LIKE '%TEST-SALES-%'`);
  await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_cust_%')`);
  await query(`DELETE FROM users WHERE username LIKE 'test_sales_cust_%'`);
  await pool.end();
});

function parseCookieHeader(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/mg_sid=([^;]+)/);
  return match ? match[1] : null;
}

test('Sales Customer Master Data Management & Receivables (Phase 2 & 3)', async (t) => {
  let superAdminCookie;
  let salesPersonCookie;
  let driverCookie;
  let superAdminUser;
  let salesPersonUser;
  let testZoneId;
  let testZoneId2;
  let butaneProductId;
  let lpg11kgProductId;

  beforeEach(async () => {
    // 1. Clean test records with isolation prefix test_sales_cust_ and TEST-SALES-
    await query(`DELETE FROM canister_ledger WHERE customer_id IN (SELECT id FROM customers WHERE contact_person LIKE 'TEST-SALES-%' OR business_name LIKE 'TEST-SALES-%' OR name LIKE 'TEST-SALES-%')`);
    await query(`DELETE FROM sales_transactions WHERE transaction_no LIKE 'TEST-SALES-%'`);
    await query(`DELETE FROM trips WHERE trip_number LIKE 'TEST-SALES-%'`);
    await query(`DELETE FROM customers WHERE contact_person LIKE 'TEST-SALES-%' OR business_name LIKE 'TEST-SALES-%' OR name LIKE 'TEST-SALES-%'`);
    await query(`DELETE FROM vehicles WHERE plate_number LIKE 'TEST-SALES-%'`);
    await query(`DELETE FROM service_zones WHERE code LIKE 'TEST-SALES-%'`);
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_cust_%') OR details LIKE '%TEST-SALES-%'`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_cust_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_cust_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_cust_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_sales_cust_%'`);

    // 2. Fetch role IDs
    const superAdminRole = (await query(`SELECT id FROM roles WHERE name = 'Super Admin'`)).rows[0].id;
    const salesPersonRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Person'`)).rows[0].id;
    const driverRole = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('CustSalesPass123!', 10);

    const saRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id, username`,
      ['test_sales_cust_superadmin', passwordHash, 'Super', 'Admin', '+639174000001', superAdminRole]
    );
    superAdminUser = saRes.rows[0];

    const spRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id, username`,
      ['test_sales_cust_salesrep', passwordHash, 'Sales', 'Rep', '+639174000002', salesPersonRole]
    );
    salesPersonUser = spRes.rows[0];

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_sales_cust_driver', passwordHash, 'Delivery', 'Driver', '+639174000003', driverRole]
    );

    // 4. Authenticate users to obtain session cookies
    const saLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sales_cust_superadmin', password: 'CustSalesPass123!' }),
    });
    superAdminCookie = parseCookieHeader(saLogin);

    const spLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sales_cust_salesrep', password: 'CustSalesPass123!' }),
    });
    salesPersonCookie = parseCookieHeader(spLogin);

    const driverLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sales_cust_driver', password: 'CustSalesPass123!' }),
    });
    driverCookie = parseCookieHeader(driverLogin);

    // 5. Create test service zones
    const zone1Res = await query(
      `INSERT INTO service_zones (code, name, description, is_active)
       VALUES ('TEST-SALES-ZONE-1', 'Test Matina Hub', 'Test Matina service route', TRUE) RETURNING id`
    );
    testZoneId = zone1Res.rows[0].id;

    const zone2Res = await query(
      `INSERT INTO service_zones (code, name, description, is_active)
       VALUES ('TEST-SALES-ZONE-2', 'Test Toril Hub', 'Test Toril service route', TRUE) RETURNING id`
    );
    testZoneId2 = zone2Res.rows[0].id;

    // 6. Fetch test product IDs
    const butaneRow = (await query(`SELECT id FROM products WHERE name = 'Butane Canister 170g'`)).rows[0];
    if (butaneRow) {
      butaneProductId = butaneRow.id;
    } else {
      const pRes = await query(
        `INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
         VALUES ('Butane Canister 170g', 'Canister', 'CANISTER', 0.170, TRUE) RETURNING id`
      );
      butaneProductId = pRes.rows[0].id;
    }

    const lpgRow = (await query(`SELECT id FROM products WHERE name = '11kg LPG Cylinder'`)).rows[0];
    if (lpgRow) {
      lpg11kgProductId = lpgRow.id;
    } else {
      const pRes = await query(
        `INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
         VALUES ('11kg LPG Cylinder', 'LPG Cylinder', 'CYLINDER', 11.000, TRUE) RETURNING id`
      );
      lpg11kgProductId = pRes.rows[0].id;
    }
  });

  // ============================================================
  // Subtest 1: Field Registration & Immediate Activation
  // ============================================================
  await t.test('1. Customer Registration - Field Registration, Immediate Activation & Validation', async () => {
    // A. Unauthenticated request -> 401
    const unauthRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TEST-SALES- Unauthorized' }),
    });
    assert.equal(unauthRes.status, 401);

    // B. Unauthorized role (Driver lacks sales.create) -> 403
    const driverRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${driverCookie}` },
      body: JSON.stringify({ name: 'TEST-SALES- Driver Create' }),
    });
    assert.equal(driverRes.status, 403);

    // C. Successful registration by Sales Person in the field (Immediate Activation)
    const createRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Maria Santos',
        businessName: 'TEST-SALES- Santos Eatery',
        customerType: 'COMMERCIAL',
        contactNumber: '0917-888-9999',
        deliveryAddress: 'Matina Aplaya, Davao City',
        zoneId: testZoneId,
      }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    assert.equal(createJson.status, 'success');
    const createdCust = createJson.data.customer;

    assert.equal(createdCust.isActive, true);
    assert.equal(createdCust.contactPerson, 'TEST-SALES- Maria Santos');
    assert.equal(createdCust.businessName, 'TEST-SALES- Santos Eatery');
    assert.equal(createdCust.customerType, 'COMMERCIAL');
    assert.equal(createdCust.contactNumber, '+639178889999');
    assert.equal(createdCust.deliveryAddress, 'Matina Aplaya, Davao City');
    assert.equal(createdCust.zoneId, testZoneId);
    assert.equal(createdCust.zone.name, 'Test Matina Hub');
    assert.equal(createdCust.zone.code, 'TEST-SALES-ZONE-1');
    assert.equal(createdCust.totalNetCanisterDebt, 0);

    // D. Validation: Missing contact name
    const noNameRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        deliveryAddress: 'Toril, Davao City',
        contactNumber: '09170001111',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(noNameRes.status, 400);
    const noNameJson = await noNameRes.json();
    assert.match(noNameJson.message, /Customer name is required/i);

    // E. Validation: Missing address
    const noAddrRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- No Address',
        contactNumber: '09170001111',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(noAddrRes.status, 400);
    const noAddrJson = await noAddrRes.json();
    assert.match(noAddrJson.message, /Address is required/i);

    // F. Validation: Missing contact number
    const noPhoneRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- No Phone',
        deliveryAddress: 'Toril, Davao City',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(noPhoneRes.status, 400);
    const noPhoneJson = await noPhoneRes.json();
    assert.match(noPhoneJson.message, /Contact number is required/i);

    // G. Validation: Invalid Philippine phone number
    const badPhoneRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Bad Phone',
        deliveryAddress: 'Toril, Davao City',
        contactNumber: '999999',
        customerType: 'RETAIL',
      }),
    });
    assert.equal(badPhoneRes.status, 400);
    const badPhoneJson = await badPhoneRes.json();
    assert.match(badPhoneJson.message, /Invalid Philippine phone number format/i);

    // H. Validation: Invalid customer type
    const badTypeRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Bad Type',
        deliveryAddress: 'Toril, Davao City',
        contactNumber: '09170001111',
        customerType: 'NON_EXISTENT_TYPE',
      }),
    });
    assert.equal(badTypeRes.status, 400);
    const badTypeJson = await badTypeRes.json();
    assert.match(badTypeJson.message, /Invalid customer type/i);

    // I. Validation: Non-existent zone ID
    const badZoneRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Bad Zone',
        deliveryAddress: 'Toril, Davao City',
        contactNumber: '09170001111',
        customerType: 'RETAIL',
        zoneId: '00000000-0000-0000-0000-000000000000',
      }),
    });
    assert.equal(badZoneRes.status, 400);
    const badZoneJson = await badZoneRes.json();
    assert.match(badZoneJson.message, /Service zone not found or inactive/i);
  });

  // ============================================================
  // Subtest 2: Directory Browsing, Dual-Envelope Pagination & Filtering
  // ============================================================
  await t.test('2. Directory Browsing - Dual Envelopes, Search-on-Submit & Zone Filtering', async () => {
    // 1. Seed 3 distinct customers
    const c1 = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Alice Alpha',
        businessName: 'TEST-SALES- Alpha Bakery',
        customerType: 'COMMERCIAL',
        contactNumber: '09171112221',
        deliveryAddress: 'Matina, Davao City',
        zoneId: testZoneId,
      }),
    });
    const c1Data = (await c1.json()).data.customer;

    const c2 = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Bob Bravo',
        businessName: 'TEST-SALES- Bravo Sari-Sari',
        customerType: 'RETAILER',
        contactNumber: '09171112222',
        deliveryAddress: 'Toril, Davao City',
        zoneId: testZoneId2,
      }),
    });
    const c2Data = (await c2.json()).data.customer;

    const c3 = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Charlie Charlie',
        businessName: 'TEST-SALES- Charlie Depot',
        customerType: 'WHOLESALE',
        contactNumber: '09171112223',
        deliveryAddress: 'Matina, Davao City',
        zoneId: testZoneId,
      }),
    });
    const c3Data = (await c3.json()).data.customer;

    // 2. Unpaginated listing -> Legacy envelope { status: 'success', data: { count, customers } }
    const unpaginatedRes = await fetch(`${baseUrl}/api/sales/customers`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(unpaginatedRes.status, 200);
    const unpaginatedJson = await unpaginatedRes.json();
    assert.equal(unpaginatedJson.status, 'success');
    assert.ok(typeof unpaginatedJson.data.count === 'number');
    assert.ok(Array.isArray(unpaginatedJson.data.customers));
    const testCusts = unpaginatedJson.data.customers.filter((c) =>
      c.contactPerson?.startsWith('TEST-SALES-') || c.businessName?.startsWith('TEST-SALES-')
    );
    assert.equal(testCusts.length, 3);

    // 3. Paginated listing -> Standard pagination envelope { status: 'success', data: [...], meta: { ... } }
    const paginatedRes = await fetch(`${baseUrl}/api/sales/customers?page=1&limit=2`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(paginatedRes.status, 200);
    const paginatedJson = await paginatedRes.json();
    assert.equal(paginatedJson.status, 'success');
    assert.ok(Array.isArray(paginatedJson.data));
    assert.equal(paginatedJson.data.length, 2);
    assert.equal(paginatedJson.meta.page, 1);
    assert.equal(paginatedJson.meta.limit, 2);
    assert.ok(paginatedJson.meta.totalItems >= 3);
    assert.ok(paginatedJson.meta.totalPages >= 2);
    assert.equal(paginatedJson.meta.hasNextPage, true);
    assert.equal(paginatedJson.meta.hasPrevPage, false);

    // 4. Filter by zoneId (Zone 1 has c1 and c3)
    const zoneFilterRes = await fetch(`${baseUrl}/api/sales/customers?zoneId=${testZoneId}`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const zoneJson = await zoneFilterRes.json();
    const zoneMatches = zoneJson.data.customers.filter((c) =>
      c.contactPerson?.startsWith('TEST-SALES-') || c.businessName?.startsWith('TEST-SALES-')
    );
    assert.equal(zoneMatches.length, 2);
    assert.ok(zoneMatches.some((c) => c.id === c1Data.id));
    assert.ok(zoneMatches.some((c) => c.id === c3Data.id));
    assert.ok(!zoneMatches.some((c) => c.id === c2Data.id));

    // 5. Filter by customerType = RETAILER (Only c2)
    const typeFilterRes = await fetch(`${baseUrl}/api/sales/customers?customerType=RETAILER`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const typeJson = await typeFilterRes.json();
    const typeMatches = typeJson.data.customers.filter((c) =>
      c.contactPerson?.startsWith('TEST-SALES-') || c.businessName?.startsWith('TEST-SALES-')
    );
    assert.equal(typeMatches.length, 1);
    assert.equal(typeMatches[0].id, c2Data.id);

    // 6. Search by businessName ('Bakery')
    const searchRes = await fetch(`${baseUrl}/api/sales/customers?search=Bakery`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const searchJson = await searchRes.json();
    const searchMatches = searchJson.data.customers.filter((c) =>
      c.contactPerson?.startsWith('TEST-SALES-') || c.businessName?.startsWith('TEST-SALES-')
    );
    assert.equal(searchMatches.length, 1);
    assert.equal(searchMatches[0].id, c1Data.id);

    // 7. Search by contactNumber ('09171112222')
    const phoneSearchRes = await fetch(`${baseUrl}/api/sales/customers?search=09171112222`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const phoneSearchJson = await phoneSearchRes.json();
    const phoneMatches = phoneSearchJson.data.customers.filter((c) =>
      c.contactPerson?.startsWith('TEST-SALES-') || c.businessName?.startsWith('TEST-SALES-')
    );
    assert.equal(phoneMatches.length, 1);
    assert.equal(phoneMatches[0].id, c2Data.id);
  });

  // ============================================================
  // Subtest 3: Dynamic Canister Debt Calculation (Append-Only Grouped SKU Receivables)
  // ============================================================
  await t.test('3. Dynamic Canister Debt - Append-Only Ledger Evaluation & SKU-Grouped Receivables', async () => {
    // 1. Create a customer for debt testing
    const custRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Debt Test Customer',
        businessName: 'TEST-SALES- Debt Eatery',
        customerType: 'COMMERCIAL',
        contactNumber: '09179998877',
        deliveryAddress: 'Toril, Davao City',
        zoneId: testZoneId,
      }),
    });
    const customer = (await custRes.json()).data.customer;

    // 2. Create vehicle and trip records for foreign key integrity
    const vehRes = await query(
      `INSERT INTO vehicles (plate_number, model, year_model, status)
       VALUES ('TEST-SALES-TRK01', 'Isuzu Elf', 2022, 'ACTIVE') RETURNING id`
    );
    const vehicleId = vehRes.rows[0].id;

    const tripRes = await query(
      `INSERT INTO trips (truck_id, driver_id, sales_user_id, zone_id, trip_number, status)
       VALUES ($1, $2, $3, $4, 'TEST-SALES-TRIP01', 'IN_PROGRESS') RETURNING id`,
      [vehicleId, salesPersonUser.id, salesPersonUser.id, testZoneId]
    );
    const tripId = tripRes.rows[0].id;

    // 3. Create a sales transaction
    const txnRes = await query(
      `INSERT INTO sales_transactions (transaction_no, trip_id, customer_id, recorded_by, status, transacted_at)
       VALUES ('TEST-SALES-TXN01', $1, $2, $3, 'COMPLETED', CURRENT_TIMESTAMP) RETURNING id`,
      [tripId, customer.id, salesPersonUser.id]
    );
    const txnId = txnRes.rows[0].id;

    // 4. Insert append-only canister ledger entries:
    // SKU 1 (Butane 170g): Loaned 10, Returned 6 -> Net Debt +4
    await query(
      `INSERT INTO canister_ledger (customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at)
       VALUES ($1, $2, $3, $4, 10, 0, 10, CURRENT_TIMESTAMP)`,
      [customer.id, butaneProductId, tripId, txnId]
    );
    await query(
      `INSERT INTO canister_ledger (customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at)
       VALUES ($1, $2, $3, $4, 0, 6, -6, CURRENT_TIMESTAMP)`,
      [customer.id, butaneProductId, tripId, txnId]
    );

    // SKU 2 (11kg LPG Cylinder): Loaned 2, Returned 0 -> Net Debt +2
    await query(
      `INSERT INTO canister_ledger (customer_id, product_id, trip_id, transaction_id, quantity_loaned, quantity_returned, net_balance_change, transacted_at)
       VALUES ($1, $2, $3, $4, 2, 0, 2, CURRENT_TIMESTAMP)`,
      [customer.id, lpg11kgProductId, tripId, txnId]
    );

    // 5. Fetch single customer profile details (GET /api/sales/customers/:id)
    const detailRes = await fetch(`${baseUrl}/api/sales/customers/${customer.id}`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.status, 'success');
    const custDetail = detailJson.data.customer;

    // Invariant verification: Overall net debt is 4 + 2 = 6
    assert.equal(custDetail.totalNetCanisterDebt, 6);
    assert.ok(Array.isArray(custDetail.canisterBalances));
    assert.equal(custDetail.canisterBalances.length, 2);

    const butaneBalance = custDetail.canisterBalances.find((b) => b.productId === butaneProductId);
    assert.ok(butaneBalance, 'Butane balance should be present in canisterBalances');
    assert.equal(butaneBalance.productName, 'Butane Canister 170g');
    assert.equal(butaneBalance.containerType, 'CANISTER');
    assert.equal(butaneBalance.totalLoaned, 10);
    assert.equal(butaneBalance.totalReturned, 6);
    assert.equal(butaneBalance.netBalance, 4);

    const lpgBalance = custDetail.canisterBalances.find((b) => b.productId === lpg11kgProductId);
    assert.ok(lpgBalance, 'LPG balance should be present in canisterBalances');
    assert.equal(lpgBalance.productName, '11kg LPG Cylinder');
    assert.equal(lpgBalance.containerType, 'CYLINDER');
    assert.equal(lpgBalance.totalLoaned, 2);
    assert.equal(lpgBalance.totalReturned, 0);
    assert.equal(lpgBalance.netBalance, 2);

    // 6. Verify directory overview also aggregates the computed totalNetCanisterDebt
    const overviewRes = await fetch(`${baseUrl}/api/sales/customers?search=Debt%20Eatery`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const overviewJson = await overviewRes.json();
    const matchedCustomer = overviewJson.data.customers.find((c) => c.id === customer.id);
    assert.ok(matchedCustomer);
    assert.equal(matchedCustomer.totalNetCanisterDebt, 6);
  });

  // ============================================================
  // Subtest 4: Password-Protected Deactivation
  // ============================================================
  await t.test('4. Customer Deactivation - Password Guard & Soft-Deactivation Reflection', async () => {
    // 1. Create active customer
    const createRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Deact Test Customer',
        businessName: 'TEST-SALES- Deact Shop',
        customerType: 'RETAIL',
        contactNumber: '09175551234',
        deliveryAddress: 'Lanang, Davao City',
      }),
    });
    const cust = (await createRes.json()).data.customer;
    assert.equal(cust.isActive, true);

    // 2. Reject without password confirmation
    const noPassRes = await fetch(`${baseUrl}/api/sales/customers/${cust.id}/deactivate`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
    });
    assert.equal(noPassRes.status, 401);
    const noPassJson = await noPassRes.json();
    assert.equal(noPassJson.code, 'PASSWORD_CONFIRMATION_REQUIRED');

    // 3. Reject with wrong password confirmation
    const wrongPassRes = await fetch(`${baseUrl}/api/sales/customers/${cust.id}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({ confirmPassword: 'IncorrectPassword999!' }),
    });
    assert.equal(wrongPassRes.status, 401);
    const wrongPassJson = await wrongPassRes.json();
    assert.equal(wrongPassJson.code, 'INVALID_CONFIRMATION_PASSWORD');

    // 4. Successfully deactivate with valid password
    const deactRes = await fetch(`${baseUrl}/api/sales/customers/${cust.id}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({ confirmPassword: 'CustSalesPass123!' }),
    });
    assert.equal(deactRes.status, 200);
    const deactJson = await deactRes.json();
    assert.equal(deactJson.status, 'success');
    assert.equal(deactJson.message, 'Customer successfully deactivated');
    assert.equal(deactJson.data.customer.isActive, false);

    // 5. Verify single detail view reflects isActive = false
    const getRes = await fetch(`${baseUrl}/api/sales/customers/${cust.id}`, {
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
    });
    const getJson = await getRes.json();
    assert.equal(getJson.data.customer.isActive, false);

    // 6. Verify isActive=true filter excludes this customer
    const activeFilterRes = await fetch(`${baseUrl}/api/sales/customers?isActive=true&search=Deact%20Shop`, {
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
    });
    const activeJson = await activeFilterRes.json();
    const match = activeJson.data.customers.find((c) => c.id === cust.id);
    assert.equal(match, undefined);
  });

  // ============================================================
  // Subtest 5: Account Re-activation
  // ============================================================
  await t.test('5. Customer Activation - Account Re-activation Workflow', async () => {
    // 1. Create and deactivate a customer
    const createRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Reactivate Customer',
        businessName: 'TEST-SALES- Reactivate Store',
        customerType: 'RETAIL',
        contactNumber: '09176662345',
        deliveryAddress: 'Buhangin, Davao City',
      }),
    });
    const cust = (await createRes.json()).data.customer;

    await fetch(`${baseUrl}/api/sales/customers/${cust.id}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({ confirmPassword: 'CustSalesPass123!' }),
    });

    // 2. Re-activate customer (PATCH /api/sales/customers/:id/activate)
    const reactRes = await fetch(`${baseUrl}/api/sales/customers/${cust.id}/activate`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
    });
    assert.equal(reactRes.status, 200);
    const reactJson = await reactRes.json();
    assert.equal(reactJson.status, 'success');
    assert.equal(reactJson.message, 'Customer successfully activated');
    assert.equal(reactJson.data.customer.isActive, true);

    // 3. Verify single detail view shows isActive = true
    const getRes = await fetch(`${baseUrl}/api/sales/customers/${cust.id}`, {
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
    });
    const getJson = await getRes.json();
    assert.equal(getJson.data.customer.isActive, true);
  });

  // ============================================================
  // Subtest 6: Centralized Audit Trail Verification
  // ============================================================
  await t.test('6. Audit Trail - Event History Logging & Dynamic Template Resolvers', async () => {
    // 1. Perform registration, deactivation, and activation
    const createRes = await fetch(`${baseUrl}/api/sales/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        contactPerson: 'TEST-SALES- Audit Target',
        businessName: 'TEST-SALES- Audit Supermarket',
        customerType: 'WHOLESALE',
        contactNumber: '09177773456',
        deliveryAddress: 'Bajada, Davao City',
      }),
    });
    const cust = (await createRes.json()).data.customer;

    await fetch(`${baseUrl}/api/sales/customers/${cust.id}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({ confirmPassword: 'CustSalesPass123!' }),
    });

    await fetch(`${baseUrl}/api/sales/customers/${cust.id}/activate`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
    });

    // 2. Query history_logs for target customer
    const logsRes = await query(
      `SELECT module, action_type, details FROM history_logs
       WHERE details LIKE '%TEST-SALES- Audit Supermarket%'
       ORDER BY created_at ASC`
    );

    assert.ok(logsRes.rows.length >= 3, 'Should record at least 3 audit log entries');

    // 3. Verify SALES_CUSTOMER_REGISTERED
    const regLog = logsRes.rows.find((l) => l.action_type === 'Created');
    assert.ok(regLog, 'Registration log should exist');
    assert.equal(regLog.module, 'Sales & Delivery');
    assert.match(regLog.details, /Registered new customer: TEST-SALES- Audit Supermarket \(WHOLESALE\)/);

    // 4. Verify SALES_CUSTOMER_DEACTIVATED
    const deactLog = logsRes.rows.find((l) => l.details.includes('Deactivated customer account:'));
    assert.ok(deactLog, 'Deactivation log should exist');
    assert.equal(deactLog.module, 'Sales & Delivery');
    assert.match(deactLog.details, /Deactivated customer account: TEST-SALES- Audit Supermarket/);

    // 5. Verify SALES_CUSTOMER_ACTIVATED
    const actLog = logsRes.rows.find((l) => l.details.includes('Re-activated customer account:'));
    assert.ok(actLog, 'Re-activation log should exist');
    assert.equal(actLog.module, 'Sales & Delivery');
    assert.match(actLog.details, /Re-activated customer account: TEST-SALES- Audit Supermarket/);
  });
});
