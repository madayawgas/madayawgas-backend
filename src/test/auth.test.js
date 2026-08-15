const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
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

// Helper to extract cookies from response headers
function parseCookieHeader(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/mg_sid=([^;]+)/);
  return match ? match[1] : null;
}

test('Authentication System Integration Tests', async (t) => {
  let testUserId;
  let testRoleId;
  let salesPersonRoleId;

  beforeEach(async () => {
    // Clean test sessions & test users
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_%'`);

    // Get Super Admin role ID
    const roleRes = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
    testRoleId = roleRes.rows[0].id;

    // Get Sales Person role ID
    const salesRoleRes = await query(`SELECT id FROM roles WHERE name = 'Sales Person'`);
    salesPersonRoleId = salesRoleRes.rows[0].id;

    // Create a test superadmin user
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const userRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, role_id, is_active, is_blocked)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE)
       RETURNING id`,
      ['test_superadmin', passwordHash, 'Test', 'Admin', testRoleId]
    );
    testUserId = userRes.rows[0].id;
  });

  await t.test('1. Login Success - sets secure cookie and returns user profile without sensitive fields', async () => {
    const res = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test_superadmin',
        password: 'TestPass123!',
      }),
    });

    assert.equal(res.status, 200);
    const cookieToken = parseCookieHeader(res);
    assert.ok(cookieToken, 'Session cookie mg_sid should be set');

    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data.user);
    assert.equal(body.data.user.username, 'test_superadmin');
    assert.equal(body.data.user.role, 'Super Admin');
    assert.ok(Array.isArray(body.data.user.permissions));
    assert.equal(body.data.user.password, undefined);
    assert.equal(body.data.user.password_hash, undefined);
  });

  await t.test('2. Login Failure - non-existent user or wrong password returns generic 401 Invalid credentials', async () => {
    // Non-existent user
    const res1 = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'non_existent_user',
        password: 'TestPass123!',
      }),
    });
    assert.equal(res1.status, 401);
    const body1 = await res1.json();
    assert.equal(body1.message, 'Invalid credentials');

    // Wrong password
    const res2 = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test_superadmin',
        password: 'WrongPassword!',
      }),
    });
    assert.equal(res2.status, 401);
    const body2 = await res2.json();
    assert.equal(body2.message, 'Invalid credentials');
  });

  await t.test('3. Authenticated Session Access (/api/users/me)', async () => {
    // Login first
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_superadmin', password: 'TestPass123!' }),
    });
    const cookieToken = parseCookieHeader(loginRes);

    // Request protected profile endpoint
    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });

    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.status, 'success');
    assert.equal(meBody.data.user.username, 'test_superadmin');
  });

  await t.test('4. Session Expiration - Idle Timeout (8 hours)', async () => {
    // Login
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_superadmin', password: 'TestPass123!' }),
    });
    const cookieToken = parseCookieHeader(loginRes);

    // Manually set session expires_at to 9 hours in the past in DB
    const tokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex');
    const pastExpiresAt = new Date(Date.now() - 9 * 60 * 60 * 1000);
    await query(`UPDATE sessions SET expires_at = $1 WHERE token_hash = $2`, [pastExpiresAt, tokenHash]);

    // Request protected route
    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });
    assert.equal(meRes.status, 401);
  });

  await t.test('5. Session Expiration - Absolute Lifetime (30 days)', async () => {
    // Login
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_superadmin', password: 'TestPass123!' }),
    });
    const cookieToken = parseCookieHeader(loginRes);

    // Manually set session created_at to 31 days in the past in DB
    const tokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex');
    const pastCreatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const validIdleAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await query(`UPDATE sessions SET created_at = $1, expires_at = $2 WHERE token_hash = $3`, [
      pastCreatedAt,
      validIdleAt,
      tokenHash,
    ]);

    // Request protected route
    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });
    assert.equal(meRes.status, 401);
  });

  await t.test('6. Logout Endpoint - invalidates session in DB and clears cookie', async () => {
    // Login
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_superadmin', password: 'TestPass123!' }),
    });
    const cookieToken = parseCookieHeader(loginRes);

    // Logout
    const logoutRes = await fetch(`${baseUrl}/api/users/logout`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });
    assert.equal(logoutRes.status, 200);

    // Verify session revoked in DB
    const tokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex');
    const dbRes = await query(`SELECT revoked_at FROM sessions WHERE token_hash = $1`, [tokenHash]);
    assert.ok(dbRes.rows[0].revoked_at, 'Session should have revoked_at populated');

    // Attempting to access protected endpoint should fail
    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });
    assert.equal(meRes.status, 401);
  });

  await t.test('7. Password Change Flow', async () => {
    // Login
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_superadmin', password: 'TestPass123!' }),
    });
    const cookieToken = parseCookieHeader(loginRes);

    // Change password
    const changeRes = await fetch(`${baseUrl}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${cookieToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'TestPass123!',
        newPassword: 'NewSecurePassword456!',
      }),
    });

    assert.equal(changeRes.status, 200);

    // Old password login fails
    const oldLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_superadmin', password: 'TestPass123!' }),
    });
    assert.equal(oldLogin.status, 401);

    // New password login succeeds
    const newLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_superadmin', password: 'NewSecurePassword456!' }),
    });
    assert.equal(newLogin.status, 200);
  });

  await t.test('8. RBAC Enforcement - 401 Unauthorized vs 403 Forbidden vs 200 OK', async () => {
    // 1) Unauthenticated request -> 401 Unauthorized
    const unauthRes = await fetch(`${baseUrl}/api/users/admin-only-test`);
    assert.equal(unauthRes.status, 401);

    // Create a user with Sales Person role (lacks 'users.manage' permission)
    const salesPasswordHash = await bcrypt.hash('SalesPass123!', 10);
    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, role_id, is_active, is_blocked)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE)`,
      ['test_sales', salesPasswordHash, 'Sales', 'User', salesPersonRoleId]
    );

    // Login as Sales Person
    const salesLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sales', password: 'SalesPass123!' }),
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
      body: JSON.stringify({ username: 'test_superadmin', password: 'TestPass123!' }),
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

  await t.test('9. PermissionService Utility Functions (can, canAll, canAny, isScopedToOwn)', async () => {
    const permissionService = require('../features/users/permission.service');

    const salesUser = {
      permissions: ['sales.view_own', 'sales.create', 'sales.update', 'delivery.view_own'],
    };

    const adminUser = {
      permissions: ['sales.view', 'sales.create', 'sales.update', 'sales.delete', 'users.manage'],
    };

    // test can()
    assert.equal(permissionService.can(salesUser, 'sales.create'), true);
    assert.equal(permissionService.can(salesUser, 'users.manage'), false);

    // test canAll()
    assert.equal(permissionService.canAll(salesUser, ['sales.create', 'sales.update']), true);
    assert.equal(permissionService.canAll(salesUser, ['sales.create', 'users.manage']), false);

    // test canAny()
    assert.equal(permissionService.canAny(salesUser, ['users.manage', 'sales.create']), true);
    assert.equal(permissionService.canAny(salesUser, ['users.manage', 'users.view']), false);

    // test isScopedToOwn()
    assert.equal(permissionService.isScopedToOwn(salesUser, 'sales'), true);
    assert.equal(permissionService.isScopedToOwn(adminUser, 'sales'), false);
  });
});


