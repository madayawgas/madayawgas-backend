const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const app = require('../app');
const { query, pool } = require('../../database/connection');
const permissionService = require('../features/users/permission.service');

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

test('Permission & RBAC Authorization Tests', async (t) => {
  let testRoleId;
  let salesPersonRoleId;

  beforeEach(async () => {
    // Clean test_perm sessions & users
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_perm_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_perm_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_perm_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_perm_%'`);

    const roleRes = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
    testRoleId = roleRes.rows[0].id;

    const salesRoleRes = await query(`SELECT id FROM roles WHERE name = 'Sales Person'`);
    salesPersonRoleId = salesRoleRes.rows[0].id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_perm_superadmin', passwordHash, 'Test', 'Admin', '+639170000001', testRoleId]
    );

  });

  await t.test('1. RBAC Route Protection - 401 Unauthorized vs 403 Forbidden vs 200 OK', async () => {
    // 1) Unauthenticated request -> 401 Unauthorized
    const unauthRes = await fetch(`${baseUrl}/api/users/admin-only-test`);
    assert.equal(unauthRes.status, 401);

    // Create user with Sales Person role (lacks 'users.manage' permission)
    const salesPasswordHash = await bcrypt.hash('SalesPass123!', 10);
    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_perm_sales', salesPasswordHash, 'Sales', 'User', '+639170000004', salesPersonRoleId]
    );


    // Login as Sales Person
    const salesLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_perm_sales', password: 'SalesPass123!' }),
    });
    const salesCookie = parseCookieHeader(salesLogin);

    // 2) Authenticated user lacking required permission -> 403 Forbidden
    const forbiddenRes = await fetch(`${baseUrl}/api/users/admin-only-test`, {
      headers: { Cookie: `mg_sid=${salesCookie}` },
    });
    assert.equal(forbiddenRes.status, 403);
    const forbiddenBody = await forbiddenRes.json();
    assert.equal(forbiddenBody.message, 'Forbidden');

    // Login as Super Admin
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_perm_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    // 3) Authenticated user with required permission -> 200 OK
    const allowedRes = await fetch(`${baseUrl}/api/users/admin-only-test`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(allowedRes.status, 200);
    const allowedBody = await allowedRes.json();
    assert.equal(allowedBody.message, 'Access granted');
  });

  await t.test('2. PermissionService Evaluation Helpers (can, canAll, canAny, isScopedToOwn)', async () => {
    const salesUser = {
      permissions: ['sales.view_own', 'sales.create', 'sales.update', 'delivery.view_own'],
    };

    const adminUser = {
      permissions: ['sales.view', 'sales.create', 'sales.update', 'sales.delete', 'users.manage'],
    };

    // can()
    assert.equal(permissionService.can(salesUser, 'sales.create'), true);
    assert.equal(permissionService.can(salesUser, 'users.manage'), false);

    // canAll()
    assert.equal(permissionService.canAll(salesUser, ['sales.create', 'sales.update']), true);
    assert.equal(permissionService.canAll(salesUser, ['sales.create', 'users.manage']), false);

    // canAny()
    assert.equal(permissionService.canAny(salesUser, ['users.manage', 'sales.create']), true);
    assert.equal(permissionService.canAny(salesUser, ['users.manage', 'users.view']), false);

    // isScopedToOwn()
    assert.equal(permissionService.isScopedToOwn(salesUser, 'sales'), true);
    assert.equal(permissionService.isScopedToOwn(adminUser, 'sales'), false);
  });
});
