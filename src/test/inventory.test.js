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

test('Inventory Item/Product CRUD Subsystem Tests', async (t) => {
  let superAdminCookie;
  let adminCookie;
  let fleetManagerCookie;
  let salesPersonCookie;

  beforeEach(async () => {
    // 1. Clean test records with isolation prefix test_inv_ and TEST-PROD-
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_inv_%') OR details LIKE '%TEST-PROD-%'`);
    await query(`DELETE FROM products WHERE name LIKE 'TEST-PROD-%'`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_inv_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_inv_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_inv_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_inv_%'`);

    // 2. Fetch role IDs
    const superAdminRole = (await query(`SELECT id FROM roles WHERE name = 'Super Admin'`)).rows[0].id;
    const adminRole = (await query(`SELECT id FROM roles WHERE name = 'Admin'`)).rows[0].id;
    const fleetManagerRole = (await query(`SELECT id FROM roles WHERE name = 'Fleet Manager'`)).rows[0].id;
    const salesPersonRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Person'`)).rows[0].id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('InvPass123!', 10);

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_inv_superadmin', passwordHash, 'Super', 'Admin', '+639172000001', superAdminRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_inv_admin', passwordHash, 'Admin', 'User', '+639172000002', adminRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_inv_fleet', passwordHash, 'Fleet', 'Manager', '+639172000003', fleetManagerRole]
    );

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_inv_sales', passwordHash, 'Sales', 'Rep', '+639172000004', salesPersonRole]
    );

    // 4. Authenticate users to obtain session cookies
    const saLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_inv_superadmin', password: 'InvPass123!' }),
    });
    superAdminCookie = parseCookieHeader(saLogin);

    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_inv_admin', password: 'InvPass123!' }),
    });
    adminCookie = parseCookieHeader(adminLogin);

    const fmLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_inv_fleet', password: 'InvPass123!' }),
    });
    fleetManagerCookie = parseCookieHeader(fmLogin);

    const salesLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_inv_sales', password: 'InvPass123!' }),
    });
    salesPersonCookie = parseCookieHeader(salesLogin);
  });

  // ============================================================
  // Subtest 1: RBAC Route Protection
  // ============================================================
  await t.test('1. RBAC Route Protection - 401 Unauthorized vs 403 Forbidden vs 200/201 OK', async () => {
    // A. Unauthenticated request -> 401 Unauthorized
    const unauthGet = await fetch(`${baseUrl}/api/inventory/products`);
    assert.equal(unauthGet.status, 401);
    const unauthJson = await unauthGet.json();
    assert.equal(unauthJson.status, 'fail');
    assert.equal(unauthJson.message, 'Unauthorized');

    const unauthPost = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TEST-PROD- Unauth Item' }),
    });
    assert.equal(unauthPost.status, 401);

    // B. Sales Person (no inventory permissions) -> 403 Forbidden
    const salesGet = await fetch(`${baseUrl}/api/inventory/products`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(salesGet.status, 403);
    const salesGetJson = await salesGet.json();
    assert.equal(salesGetJson.status, 'fail');
    assert.equal(salesGetJson.message, 'Forbidden');

    const salesPost = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${salesPersonCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-PROD- 11kg Forbidden',
        category: 'LPG',
        containerType: 'CYLINDER',
        netWeightKg: 11.0,
      }),
    });
    assert.equal(salesPost.status, 403);

    // C. Fleet Manager (has inventory.view, but not inventory.manage) -> GET 200, POST 403
    const fmGet = await fetch(`${baseUrl}/api/inventory/products`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(fmGet.status, 200);

    const fmPost = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${fleetManagerCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-PROD- 11kg FM Create',
        category: 'LPG',
        containerType: 'CYLINDER',
        netWeightKg: 11.0,
      }),
    });
    assert.equal(fmPost.status, 403);

    // D. Admin (has inventory.manage) -> POST 201
    const adminPost = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-PROD- Admin Created Item',
        category: 'LPG Cylinder',
        containerType: 'CYLINDER',
        netWeightKg: 11.0,
      }),
    });
    assert.equal(adminPost.status, 201);
  });

  // ============================================================
  // Subtest 2: Register Item / Product (POST /api/inventory/products)
  // ============================================================
  await t.test('2. Register Item - Validation, Container Types & Creation', async () => {
    // A. Successfully create CYLINDER product
    const createCylinderRes = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${superAdminCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-PROD- 11kg Household Cylinder',
        category: 'Household LPG',
        containerType: 'CYLINDER',
        netWeightKg: 11.0,
      }),
    });
    assert.equal(createCylinderRes.status, 201);
    const cylinderData = await createCylinderRes.json();
    assert.equal(cylinderData.status, 'success');
    assert.ok(cylinderData.data.product.id);
    assert.equal(cylinderData.data.product.name, 'TEST-PROD- 11kg Household Cylinder');
    assert.equal(cylinderData.data.product.category, 'Household LPG');
    assert.equal(cylinderData.data.product.containerType, 'CYLINDER');
    assert.equal(cylinderData.data.product.netWeightKg, 11.0);
    assert.equal(cylinderData.data.product.isActive, true);
    assert.ok(cylinderData.data.product.createdAt);
    assert.ok(cylinderData.data.product.updatedAt);

    // B. Successfully create CANISTER product (Butane Canister 250g)
    const createCanisterRes = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-PROD- Butane Canister 250g',
        category: 'Canister',
        containerType: 'CANISTER',
        netWeightKg: 0.25,
      }),
    });
    assert.equal(createCanisterRes.status, 201);
    const canisterData = await createCanisterRes.json();
    assert.equal(canisterData.status, 'success');
    assert.equal(canisterData.data.product.containerType, 'CANISTER');
    assert.equal(canisterData.data.product.netWeightKg, 0.25);

    // C. Validation: Missing name
    const missingNameRes = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        category: 'LPG',
        containerType: 'CYLINDER',
        netWeightKg: 11.0,
      }),
    });
    assert.equal(missingNameRes.status, 400);
    const missingNameJson = await missingNameRes.json();
    assert.equal(missingNameJson.status, 'fail');
    assert.match(missingNameJson.message, /Product name is required/i);

    // D. Validation: Missing category
    const missingCatRes = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-PROD- No Category Item',
        containerType: 'CYLINDER',
        netWeightKg: 11.0,
      }),
    });
    assert.equal(missingCatRes.status, 400);
    const missingCatJson = await missingCatRes.json();
    assert.equal(missingCatJson.status, 'fail');
    assert.match(missingCatJson.message, /Category is required/i);

    // E. Validation: Invalid container type
    const invalidTypeRes = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-PROD- Invalid Type Item',
        category: 'LPG',
        containerType: 'BARREL',
        netWeightKg: 11.0,
      }),
    });
    assert.equal(invalidTypeRes.status, 400);
    const invalidTypeJson = await invalidTypeRes.json();
    assert.equal(invalidTypeJson.status, 'fail');
    assert.match(invalidTypeJson.message, /Invalid container type/i);

    // F. Validation: Non-positive net weight (0 or negative)
    const zeroWeightRes = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-PROD- Zero Weight Item',
        category: 'LPG',
        containerType: 'CYLINDER',
        netWeightKg: 0,
      }),
    });
    assert.equal(zeroWeightRes.status, 400);
    const zeroWeightJson = await zeroWeightRes.json();
    assert.equal(zeroWeightJson.status, 'fail');
    assert.match(zeroWeightJson.message, /Net weight.*must be a positive number/i);

    // G. Duplicate Name Conflict -> 409 Conflict
    const dupRes = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        name: 'TEST-PROD- 11kg Household Cylinder',
        category: 'Duplicate LPG',
        containerType: 'CYLINDER',
        netWeightKg: 11.0,
      }),
    });
    assert.equal(dupRes.status, 409);
    const dupJson = await dupRes.json();
    assert.equal(dupJson.status, 'fail');
    assert.match(dupJson.message, /already exists/i);
  });

  // ============================================================
  // Subtest 3: View Item Profile (List & Single Detail)
  // ============================================================
  await t.test('3. View Item Profile - List, Filters, Single Detail & 404', async () => {
    // 1. Seed multiple products
    const p1 = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        name: 'TEST-PROD- 11kg Household Cylinder',
        category: 'Household LPG',
        containerType: 'CYLINDER',
        netWeightKg: 11.0,
      }),
    });
    const p1Id = (await p1.json()).data.product.id;

    const p2 = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        name: 'TEST-PROD- 22kg Commercial Cylinder',
        category: 'Commercial LPG',
        containerType: 'CYLINDER',
        netWeightKg: 22.0,
      }),
    });
    const p2Id = (await p2.json()).data.product.id;

    const p3 = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${superAdminCookie}` },
      body: JSON.stringify({
        name: 'TEST-PROD- Butane Canister 250g',
        category: 'Canister',
        containerType: 'CANISTER',
        netWeightKg: 0.25,
      }),
    });
    const p3Id = (await p3.json()).data.product.id;

    // 2. View all products list
    const listRes = await fetch(`${baseUrl}/api/inventory/products`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.status, 'success');
    assert.ok(listJson.data.count >= 3);
    const testItems = listJson.data.products.filter((p) => p.name.startsWith('TEST-PROD-'));
    assert.equal(testItems.length, 3);

    // 3. Filter by containerType=CANISTER
    const canisterFilterRes = await fetch(`${baseUrl}/api/inventory/products?containerType=CANISTER`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    const canisterJson = await canisterFilterRes.json();
    const testCanisters = canisterJson.data.products.filter((p) => p.name.startsWith('TEST-PROD-'));
    assert.equal(testCanisters.length, 1);
    assert.equal(testCanisters[0].id, p3Id);

    // 4. Search filter
    const searchRes = await fetch(`${baseUrl}/api/inventory/products?search=Commercial`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    const searchJson = await searchRes.json();
    const searchMatches = searchJson.data.products.filter((p) => p.name.startsWith('TEST-PROD-'));
    assert.equal(searchMatches.length, 1);
    assert.equal(searchMatches[0].id, p2Id);

    // 5. Get single product detail by ID
    const singleRes = await fetch(`${baseUrl}/api/inventory/products/${p1Id}`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(singleRes.status, 200);
    const singleJson = await singleRes.json();
    assert.equal(singleJson.status, 'success');
    assert.equal(singleJson.data.product.id, p1Id);
    assert.equal(singleJson.data.product.name, 'TEST-PROD- 11kg Household Cylinder');
    assert.equal(singleJson.data.product.netWeightKg, 11.0);

    // 6. Non-existent product ID -> 404
    const notFoundRes = await fetch(`${baseUrl}/api/inventory/products/00000000-0000-0000-0000-000000000000`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.status, 'fail');
    assert.equal(notFoundJson.message, 'Product not found');
  });

  // ============================================================
  // Subtest 4: Update Item Profile (PATCH /api/inventory/products/:id)
  // ============================================================
  await t.test('4. Update Item Profile - Information Modifications & Validation', async () => {
    // 1. Create product
    const createRes = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        name: 'TEST-PROD- Original Name',
        category: 'Original Category',
        containerType: 'CYLINDER',
        netWeightKg: 11.0,
      }),
    });
    const createdProduct = (await createRes.json()).data.product;

    // 2. Update multiple fields
    const updateRes = await fetch(`${baseUrl}/api/inventory/products/${createdProduct.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        name: 'TEST-PROD- Updated Name',
        category: 'Updated Category',
        netWeightKg: 11.5,
      }),
    });
    assert.equal(updateRes.status, 200);
    const updateJson = await updateRes.json();
    assert.equal(updateJson.status, 'success');
    assert.equal(updateJson.data.product.id, createdProduct.id);
    assert.equal(updateJson.data.product.name, 'TEST-PROD- Updated Name');
    assert.equal(updateJson.data.product.category, 'Updated Category');
    assert.equal(updateJson.data.product.netWeightKg, 11.5);
    assert.equal(updateJson.data.product.containerType, 'CYLINDER');

    // 3. Validation: Empty name on update -> 400
    const invalidUpdate = await fetch(`${baseUrl}/api/inventory/products/${createdProduct.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ name: '   ' }),
    });
    assert.equal(invalidUpdate.status, 400);
    const invalidJson = await invalidUpdate.json();
    assert.equal(invalidJson.status, 'fail');
    assert.match(invalidJson.message, /Product name cannot be empty/i);

    // 4. Update non-existent product -> 404
    const notFoundUpdate = await fetch(`${baseUrl}/api/inventory/products/00000000-0000-0000-0000-000000000000`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ name: 'TEST-PROD- Nonexistent' }),
    });
    assert.equal(notFoundUpdate.status, 404);
    const notFoundJson = await notFoundUpdate.json();
    assert.equal(notFoundJson.status, 'fail');
    assert.equal(notFoundJson.message, 'Product not found');
  });

  // ============================================================
  // Subtest 5: Deactivate Item (PATCH /api/inventory/products/:id/deactivate)
  // ============================================================
  await t.test('5. Deactivate Item - Soft Deactivation & Status Reflection', async () => {
    // 1. Create product (default is_active = true)
    const createRes = await fetch(`${baseUrl}/api/inventory/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        name: 'TEST-PROD- To Be Deactivated',
        category: 'Discontinued',
        containerType: 'CYLINDER',
        netWeightKg: 22.0,
      }),
    });
    const createdProduct = (await createRes.json()).data.product;
    assert.equal(createdProduct.isActive, true);

    // 2. Rejection without password confirmation
    const noPassDeact = await fetch(`${baseUrl}/api/inventory/products/${createdProduct.id}/deactivate`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(noPassDeact.status, 401);
    const noPassJson = await noPassDeact.json();
    assert.equal(noPassJson.code, 'PASSWORD_CONFIRMATION_REQUIRED');

    // 3. Rejection with incorrect confirmation password
    const wrongPassDeact = await fetch(`${baseUrl}/api/inventory/products/${createdProduct.id}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ confirmPassword: 'WrongPassword123!' }),
    });
    assert.equal(wrongPassDeact.status, 401);
    const wrongPassJson = await wrongPassDeact.json();
    assert.equal(wrongPassJson.code, 'INVALID_CONFIRMATION_PASSWORD');

    // 4. Successfully deactivate item with valid password
    const deactRes = await fetch(`${baseUrl}/api/inventory/products/${createdProduct.id}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ confirmPassword: 'InvPass123!' }),
    });
    assert.equal(deactRes.status, 200);
    const deactJson = await deactRes.json();
    assert.equal(deactJson.status, 'success');
    assert.equal(deactJson.message, 'Product successfully deactivated');
    assert.equal(deactJson.data.product.id, createdProduct.id);
    assert.equal(deactJson.data.product.isActive, false);

    // 5. Verify single get shows isActive = false
    const getRes = await fetch(`${baseUrl}/api/inventory/products/${createdProduct.id}`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    const getJson = await getRes.json();
    assert.equal(getJson.data.product.isActive, false);

    // 6. Verify isActive=true filter excludes the deactivated product
    const activeFilterRes = await fetch(`${baseUrl}/api/inventory/products?isActive=true`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    const activeJson = await activeFilterRes.json();
    const activeMatch = activeJson.data.products.find((p) => p.id === createdProduct.id);
    assert.equal(activeMatch, undefined);

    // 7. Verify isActive=false filter includes the deactivated product
    const inactiveFilterRes = await fetch(`${baseUrl}/api/inventory/products?isActive=false`, {
      headers: { Cookie: `mg_sid=${fleetManagerCookie}` },
    });
    const inactiveJson = await inactiveFilterRes.json();
    const inactiveMatch = inactiveJson.data.products.find((p) => p.id === createdProduct.id);
    assert.ok(inactiveMatch);
    assert.equal(inactiveMatch.isActive, false);

    // 8. Deactivating non-existent product with valid password -> 404
    const notFoundDeact = await fetch(`${baseUrl}/api/inventory/products/00000000-0000-0000-0000-000000000000/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ confirmPassword: 'InvPass123!' }),
    });
    assert.equal(notFoundDeact.status, 404);
    const notFoundJson = await notFoundDeact.json();
    assert.equal(notFoundJson.status, 'fail');
    assert.equal(notFoundJson.message, 'Product not found');
  });
});
