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

test('Authentication & Session Lifecycle Tests', async (t) => {
  let testRoleId;

  beforeEach(async () => {
    // Clean test_auth sessions & users
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_auth_%')`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_auth_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_auth_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_auth_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_auth_%'`);

    // Get Super Admin role ID
    const roleRes = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
    testRoleId = roleRes.rows[0].id;

    // Create test superadmin user
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_auth_superadmin', passwordHash, 'Test', 'Admin', '+639170000001', testRoleId]
    );
  });

  await t.test('1. Login Success - sets secure cookie and returns user profile without sensitive fields', async () => {
    const res = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test_auth_superadmin',
        password: 'TestPass123!',
      }),
    });

    assert.equal(res.status, 200);
    const cookieToken = parseCookieHeader(res);
    assert.ok(cookieToken, 'Session cookie mg_sid should be set');

    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data.user);
    assert.equal(body.data.user.username, 'test_auth_superadmin');
    assert.equal(body.data.user.phone, '+639170000001');
    assert.equal(body.data.user.role, 'Super Admin');
    assert.equal(body.data.user.mustChangePassword, false);
    assert.ok(Array.isArray(body.data.user.permissions));
    assert.equal(body.data.user.password, undefined);
    assert.equal(body.data.user.password_hash, undefined);
  });

  await t.test('2. Login Failure - non-existent user or wrong password returns generic 401 Invalid credentials', async () => {
    const res1 = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test_auth_nonexistent',
        password: 'TestPass123!',
      }),
    });
    assert.equal(res1.status, 401);
    const body1 = await res1.json();
    assert.equal(body1.message, 'Invalid credentials');

    const res2 = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test_auth_superadmin',
        password: 'WrongPassword!',
      }),
    });
    assert.equal(res2.status, 401);
    const body2 = await res2.json();
    assert.equal(body2.message, 'Invalid credentials');
  });

  await t.test('3. Authenticated Session Access (/api/users/me)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_auth_superadmin', password: 'TestPass123!' }),
    });
    const cookieToken = parseCookieHeader(loginRes);

    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });

    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.status, 'success');
    assert.equal(meBody.data.user.username, 'test_auth_superadmin');
    assert.equal(meBody.data.user.phone, '+639170000001');
  });

  await t.test('4. Session Expiration - Idle Timeout (8 hours)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_auth_superadmin', password: 'TestPass123!' }),
    });
    const cookieToken = parseCookieHeader(loginRes);

    const tokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex');
    const pastExpiresAt = new Date(Date.now() - 9 * 60 * 60 * 1000);
    await query(`UPDATE sessions SET expires_at = $1 WHERE token_hash = $2`, [pastExpiresAt, tokenHash]);

    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });
    assert.equal(meRes.status, 401);
  });

  await t.test('5. Session Expiration - Absolute Lifetime (30 days)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_auth_superadmin', password: 'TestPass123!' }),
    });
    const cookieToken = parseCookieHeader(loginRes);

    const tokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex');
    const pastCreatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const validIdleAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await query(`UPDATE sessions SET created_at = $1, expires_at = $2 WHERE token_hash = $3`, [
      pastCreatedAt,
      validIdleAt,
      tokenHash,
    ]);

    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });
    assert.equal(meRes.status, 401);
  });

  await t.test('6. Logout Endpoint - invalidates session in DB and clears cookie', async () => {
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_auth_superadmin', password: 'TestPass123!' }),
    });
    const cookieToken = parseCookieHeader(loginRes);

    const logoutRes = await fetch(`${baseUrl}/api/users/logout`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });
    assert.equal(logoutRes.status, 200);

    const tokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex');
    const dbRes = await query(`SELECT revoked_at FROM sessions WHERE token_hash = $1`, [tokenHash]);
    assert.ok(dbRes.rows[0].revoked_at, 'Session should have revoked_at populated');

    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });
    assert.equal(meRes.status, 401);
  });

  await t.test('7. Password Change Flow (Self) - First-login (no currentPassword required) vs Voluntary, and route blocking', async () => {
    // Insert user with must_change_password = true
    const tempHash = await bcrypt.hash('TempPassword123!', 10);
    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, TRUE)`,
      ['test_auth_tempuser', tempHash, 'Temp', 'User', '+639170000099', testRoleId]
    );

    // 1) Login with temporary credentials
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_auth_tempuser', password: 'TempPassword123!' }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.equal(loginBody.data.user.mustChangePassword, true);
    const cookieToken = parseCookieHeader(loginRes);

    // 2) Protected route access should be blocked with 403 MUST_CHANGE_PASSWORD
    const blockedRes = await fetch(`${baseUrl}/api/users/roles`, {
      headers: { Cookie: `mg_sid=${cookieToken}` },
    });
    assert.equal(blockedRes.status, 403);
    const blockedBody = await blockedRes.json();
    assert.equal(blockedBody.code, 'MUST_CHANGE_PASSWORD');

    // 3) First login password change succeeds with ONLY newPassword (no currentPassword required!)
    const changeRes = await fetch(`${baseUrl}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${cookieToken}`,
      },
      body: JSON.stringify({
        newPassword: 'NewSecurePassword456!',
      }),
    });
    assert.equal(changeRes.status, 200);

    // 4) Old temporary password fails
    const oldLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_auth_tempuser', password: 'TempPassword123!' }),
    });
    assert.equal(oldLogin.status, 401);

    // 5) New permanent password succeeds and mustChangePassword is false
    const newLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_auth_tempuser', password: 'NewSecurePassword456!' }),
    });
    assert.equal(newLogin.status, 200);
    const newLoginBody = await newLogin.json();
    assert.equal(newLoginBody.data.user.mustChangePassword, false);
    const newCookieToken = parseCookieHeader(newLogin);

    // 6) Now that user is established (mustChangePassword = false), voluntary password change REQUIRES currentPassword
    const voluntaryNoCurrent = await fetch(`${baseUrl}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${newCookieToken}`,
      },
      body: JSON.stringify({
        newPassword: 'ThirdPassword789!',
      }),
    });
    assert.equal(voluntaryNoCurrent.status, 400);
    const errBody = await voluntaryNoCurrent.json();
    assert.equal(errBody.message, 'Current password is required');

    // 7) Voluntary change with wrong currentPassword fails
    const voluntaryWrongCurrent = await fetch(`${baseUrl}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${newCookieToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'WrongPassword!',
        newPassword: 'ThirdPassword789!',
      }),
    });
    assert.equal(voluntaryWrongCurrent.status, 400);

    // 8) Voluntary change with correct currentPassword succeeds
    const voluntarySuccess = await fetch(`${baseUrl}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${newCookieToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'NewSecurePassword456!',
        newPassword: 'ThirdPassword789!',
      }),
    });
    assert.equal(voluntarySuccess.status, 200);
  });
});
